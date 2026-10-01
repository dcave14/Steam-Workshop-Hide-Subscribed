// steam-dom.js
// Adapter for Steam's new React SSR Workshop layout ("CommunityTemplate").
// Loaded before content.js (see manifest.json) and exposes window.WSHSDom.
//
// The new layout uses hashed CSS-module class names, so this adapter only relies on
// stable hooks: the CommunityTemplate root, sharedfiles/filedetails links, the
// aspectratio_* preview frames and the SVGIcon_* icon names. Subscribed state is not
// part of the SSR HTML: the page fetches it with
// GET /sharedfiles/actions?q=GetUserListStatus&qp=[...]. A small hook injected into
// the page world observes those requests and responses, learns the qp argument
// template and posts the statuses back here. Ids the page did not ask about are
// replayed in batches of 100 with the learned template (an inferred fallback
// template is used as a last resort when no page template has been observed).

(function () {
    'use strict';

    var LOG_PREFIX = '[WSHS]';
    var ITEM_LINK_SELECTOR = 'a[href*="sharedfiles/filedetails/?id="]';
    var PREVIEW_SELECTOR = '.aspectratio_16x9, .aspectratio_square';
    var BATCH_SIZE = 100;
    var REPLAY_COOLDOWN_MS = 15000;

    var statusById = new Map();
    var requestedIds = new Set();
    var listeners = [];
    var learnedTemplate = null;
    var warned = false;
    var replayCooldownUntil = 0;
    var starFallback = null;
    var cachedAppId = null;
    var hookInjected = false;

    // ---------------------------------------------------------------------
    // Page-world fetch hook (stringified and injected as a nonce script)
    // ---------------------------------------------------------------------

    function mainWorldHook() {
        if (window.__WSHS_MAIN_HOOK__) {
            return;
        }
        window.__WSHS_MAIN_HOOK__ = true;

        var statuses = {};
        var templates = {};
        var best = null;
        var nativeFetch = window.fetch;

        function post(message) {
            message.__wshs = true;
            try {
                window.postMessage(message, '*');
            } catch (error) {
                // ignore
            }
        }

        function learnTemplate(url) {
            var qp = url.searchParams.get('qp');
            if (!qp) return;
            var args;
            try {
                args = JSON.parse(qp);
            } catch (error) {
                return;
            }
            if (!Array.isArray(args)) return;
            var idsIndex = -1;
            for (var i = args.length - 1; i >= 0; i--) {
                if (Array.isArray(args[i])) {
                    idsIndex = i;
                    break;
                }
            }
            if (idsIndex === -1) return;
            var templateArgs = args.map(function (arg, index) {
                return index === idsIndex ? null : arg;
            });
            var key = JSON.stringify(templateArgs);
            var entry = templates[key];
            if (!entry) {
                entry = {
                    count: 0,
                    endpoint: url.pathname,
                    idsIndex: idsIndex,
                    args: templateArgs
                };
                templates[key] = entry;
            }
            entry.count += 1;
            if (!best || entry.count > best.count) {
                best = entry;
                post({
                    type: 'template',
                    template: {
                        endpoint: entry.endpoint,
                        idsIndex: entry.idsIndex,
                        args: entry.args
                    }
                });
            }
        }

        function record(data) {
            if (!Array.isArray(data)) return;
            var rows = [];
            for (var i = 0; i < data.length; i++) {
                var row = data[i];
                if (row && row.publishedfileid != null && typeof row.inlist === 'boolean') {
                    var id = String(row.publishedfileid);
                    statuses[id] = row.inlist;
                    rows.push({ publishedfileid: id, inlist: row.inlist });
                }
            }
            if (rows.length) {
                post({ type: 'status', rows: rows });
            }
        }

        window.fetch = function () {
            var url = null;
            try {
                var raw = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url);
                url = raw ? new URL(raw, location.href) : null;
            } catch (error) {
                url = null;
            }
            if (!url || url.searchParams.get('q') !== 'GetUserListStatus') {
                return nativeFetch.apply(this, arguments);
            }
            learnTemplate(url);
            var promise = nativeFetch.apply(this, arguments);
            try {
                promise.then(function (response) {
                    return response.clone().json();
                }).then(function (payload) {
                    record(payload && payload.data);
                }).catch(function () {
                    // response was not JSON or the body was already consumed
                });
            } catch (error) {
                // ignore
            }
            return promise;
        };
    }

    var MAIN_HOOK_SOURCE = '(' + mainWorldHook.toString() + ')();';

    // Content scripts live in an isolated world, so their window.fetch wrapper would
    // never see the page's own requests. Reuse the page's CSP nonce to run the hook
    // in the page world. Pages without a nonce simply fall back to the replay below.
    function tryInjectMainHook() {
        if (hookInjected) return true;
        if (!document.getElementById('CommunityTemplate')) return false;
        var nonce = '';
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].nonce) {
                nonce = scripts[i].nonce;
                break;
            }
        }
        if (!nonce) return false;
        try {
            var script = document.createElement('script');
            script.setAttribute('nonce', nonce);
            script.textContent = MAIN_HOOK_SOURCE;
            (document.head || document.documentElement).appendChild(script);
            script.remove();
            hookInjected = true;
            return true;
        } catch (error) {
            return false;
        }
    }

    tryInjectMainHook();
    if (!hookInjected) {
        var injectionObserver = new MutationObserver(function () {
            if (tryInjectMainHook()) {
                injectionObserver.disconnect();
            }
        });
        injectionObserver.observe(document, { childList: true, subtree: true });
    }

    // ---------------------------------------------------------------------
    // Status store (fed by the page-world hook and by the replay below)
    // ---------------------------------------------------------------------

    window.addEventListener('message', function (event) {
        var message = event.data;
        if (!message || message.__wshs !== true) return;
        if (message.type === 'status') {
            if (recordRows(message.rows)) {
                notifyListeners();
            }
        } else if (message.type === 'template') {
            if (message.template && Array.isArray(message.template.args) && typeof message.template.idsIndex === 'number') {
                learnedTemplate = message.template;
            }
        }
    });

    function recordRows(rows) {
        if (!Array.isArray(rows)) return false;
        var changed = false;
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row || row.publishedfileid == null || typeof row.inlist !== 'boolean') continue;
            var id = String(row.publishedfileid);
            if (!statusById.has(id) || statusById.get(id) !== row.inlist) {
                statusById.set(id, row.inlist);
                changed = true;
            }
        }
        return changed;
    }

    function notifyListeners() {
        for (var i = 0; i < listeners.length; i++) {
            try {
                listeners[i]();
            } catch (error) {
                // a listener must not break the others
            }
        }
    }

    // ---------------------------------------------------------------------
    // GetUserListStatus replay
    // ---------------------------------------------------------------------

    function getAppId() {
        if (cachedAppId !== null) return cachedAppId;
        cachedAppId = 0;
        try {
            var fromQuery = new URLSearchParams(window.location.search).get('appid');
            if (fromQuery && /^\d+$/.test(fromQuery)) {
                cachedAppId = Number(fromQuery);
            } else {
                var match = /\/app\/(\d+)\//.exec(window.location.pathname);
                if (match) {
                    cachedAppId = Number(match[1]);
                }
            }
        } catch (error) {
            cachedAppId = 0;
        }
        return cachedAppId;
    }

    function removeRequested(ids) {
        for (var i = 0; i < ids.length; i++) {
            requestedIds.delete(ids[i]);
        }
    }

    function sendReplayBatch(batch) {
        var args;
        var idsIndex;
        var endpoint;
        if (learnedTemplate) {
            args = learnedTemplate.args.slice();
            idsIndex = learnedTemplate.idsIndex;
            endpoint = learnedTemplate.endpoint;
        } else {
            // Inferred replay fallback, used only while no page query template has
            // been snooped: [appid, list_type, file_type, ids]. Research was logged
            // out, so the list_type/file_type values are a guess, not verified; a
            // snooped template (above) stays preferred and authoritative.
            var appId = getAppId();
            if (!appId) {
                removeRequested(batch);
                return;
            }
            args = [appId, 1, 0, null];
            idsIndex = 3;
            endpoint = '/sharedfiles/actions';
        }
        args[idsIndex] = batch;
        var url = new URL(endpoint, window.location.href);
        url.searchParams.set('q', 'GetUserListStatus');
        url.searchParams.set('qp', JSON.stringify(args));

        fetch(url.href, { headers: { 'x-valve-refetch-payload': 'queryAction' } })
            .then(function (response) {
                return response.json();
            })
            .then(function (payload) {
                if (recordRows(payload && payload.data)) {
                    notifyListeners();
                }
            })
            .catch(function () {
                replayCooldownUntil = Date.now() + REPLAY_COOLDOWN_MS;
                removeRequested(batch);
            });
    }

    function requestStatuses(ids) {
        if (Date.now() < replayCooldownUntil) return;
        var batch = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (statusById.has(id) || requestedIds.has(id)) continue;
            requestedIds.add(id);
            batch.push(id);
            if (batch.length >= BATCH_SIZE) {
                sendReplayBatch(batch);
                batch = [];
            }
        }
        if (batch.length) sendReplayBatch(batch);
    }

    // ---------------------------------------------------------------------
    // New-layout DOM helpers
    // ---------------------------------------------------------------------

    function isNewLayout() {
        if (document.getElementById('CommunityTemplate')) return true;
        if (document.querySelector('[data-react-nav-root="CommunityTemplate"]')) return true;
        var links = document.querySelectorAll(ITEM_LINK_SELECTOR);
        for (var i = 0; i < links.length && i < 3; i++) {
            if (links[i].closest(PREVIEW_SELECTOR)) return true;
        }
        return false;
    }

    // The row with the filter controls: it contains both the Special Filters /
    // sort combobox and the "Filter by Date" button (button[data-accent-color]),
    // and no item links. Localized pages are still matched structurally; the
    // button text is only a secondary hint.
    function getControlArea() {
        var root = document.getElementById('CommunityTemplate');
        if (!root) return null;
        var comboboxes = root.querySelectorAll('[role="combobox"]');
        for (var i = 0; i < comboboxes.length; i++) {
            var node = comboboxes[i].parentElement;
            while (node && node !== root) {
                if (node.querySelector('button[data-accent-color]') && !node.querySelector(ITEM_LINK_SELECTOR)) {
                    return node;
                }
                node = node.parentElement;
            }
        }
        var buttons = root.querySelectorAll('button[data-accent-color]');
        for (var j = 0; j < buttons.length; j++) {
            var text = (buttons[j].textContent || '').toLowerCase();
            if (text.indexOf('filter by date') !== -1) {
                var parent = buttons[j].parentElement;
                return parent && parent.parentElement ? parent.parentElement : parent;
            }
        }
        return null;
    }

    function parsePublishedFileId(href) {
        var match = /[?&]id=(\d+)/.exec(href || '');
        return match ? match[1] : null;
    }

    function collectPublishedFileIds(node) {
        var ids = new Set();
        var links = node.querySelectorAll(ITEM_LINK_SELECTOR);
        for (var i = 0; i < links.length; i++) {
            var id = parsePublishedFileId(links[i].href);
            if (id) ids.add(id);
        }
        return ids;
    }

    // Card root = highest ancestor of the item link that still looks like a single
    // card: it contains the aspectratio preview and only one distinct publishedfileid
    // (the card has two filedetails links - preview and title - but they point at the
    // same id). If the climb is cut short by the page boundary (body / CommunityTemplate)
    // while the candidate still looks like a card, the candidate cannot be told apart
    // from a page-level wrapper (single-card pages), so null is returned and nothing is
    // hidden. The final root is re-validated against the same rule; fail safe.
    function findCardRoot(link) {
        var id = parsePublishedFileId(link.href);
        if (!id) return null;
        var templateRoot = document.getElementById('CommunityTemplate') ||
            document.querySelector('[data-react-nav-root="CommunityTemplate"]');
        var node = link.parentElement;
        var root = null;
        while (node && node !== document.body && node !== document.documentElement && node !== templateRoot) {
            if (!node.matches(PREVIEW_SELECTOR) && !node.querySelector(PREVIEW_SELECTOR)) break;
            var ids = collectPublishedFileIds(node);
            if (ids.size !== 1 || !ids.has(id)) break;
            root = node;
            node = node.parentElement;
        }
        if (!root) return null;
        if (node === document.body || node === document.documentElement || node === templateRoot) {
            // The climb never met a non-card ancestor, so the candidate could be a
            // whole-page container; hide nothing.
            return null;
        }
        var rootIds = collectPublishedFileIds(root);
        if (rootIds.size !== 1 || !rootIds.has(id) || !root.querySelector(PREVIEW_SELECTOR)) {
            return null;
        }
        return root;
    }

    function enumerateCards() {
        var scope = document.getElementById('CommunityTemplate') || document;
        var links = scope.querySelectorAll(ITEM_LINK_SELECTOR);
        var cards = [];
        var seen = new Set();
        for (var i = 0; i < links.length; i++) {
            var id = parsePublishedFileId(links[i].href);
            if (!id || seen.has(id)) continue;
            var root = findCardRoot(links[i]);
            if (!root) continue;
            seen.add(id);
            cards.push({ id: id, root: root });
        }
        return cards;
    }

    // ---------------------------------------------------------------------
    // Star rating and subscribed state
    // ---------------------------------------------------------------------

    // window.SSR is a page-world global and is undefined in this isolated world, so it
    // cannot be read directly. The same payload is emitted as inline script text
    // (`window.SSR.loaderData = [...]`, `window.SSR.renderContext = JSON.parse("...")`),
    // and script text is visible from every world, so parse those JSON islands out of
    // the DOM instead. loaderData carries the item results on some pages, renderContext
    // on others.
    function findJsonEnd(text, start) {
        var depth = 0;
        var inString = false;
        var escaped = false;
        for (var i = start; i < text.length; i++) {
            var ch = text.charAt(i);
            if (inString) {
                if (escaped) escaped = false;
                else if (ch === '\\') escaped = true;
                else if (ch === '"') inString = false;
                continue;
            }
            if (ch === '"') inString = true;
            else if (ch === '[' || ch === '{') depth += 1;
            else if (ch === ']' || ch === '}') {
                depth -= 1;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function readJsStringLiteral(text, quoteIndex) {
        var raw = '';
        var i = quoteIndex + 1;
        while (i < text.length) {
            var ch = text.charAt(i);
            if (ch === '\\') {
                raw += ch + text.charAt(i + 1);
                i += 2;
                continue;
            }
            if (ch === '"') return raw;
            raw += ch;
            i += 1;
        }
        return null;
    }

    function parseAssignedJson(text, marker) {
        var at = text.indexOf(marker);
        if (at === -1) return null;
        var eq = text.indexOf('=', at + marker.length);
        if (eq === -1) return null;
        var pos = eq + 1;
        while (pos < text.length && /\s/.test(text.charAt(pos))) pos++;
        if (text.slice(pos, pos + 11) === 'JSON.parse(') {
            pos += 11;
            while (pos < text.length && /\s/.test(text.charAt(pos))) pos++;
        }
        var ch = text.charAt(pos);
        if (ch === '[' || ch === '{') {
            var end = findJsonEnd(text, pos);
            if (end === -1) return null;
            try {
                return JSON.parse(text.slice(pos, end + 1));
            } catch (error) {
                return null;
            }
        }
        if (ch === '"') {
            var raw = readJsStringLiteral(text, pos);
            if (raw === null) return null;
            try {
                return JSON.parse(JSON.parse('"' + raw + '"'));
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    function readSsrIslands() {
        var values = [];
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            var text = scripts[i].textContent || '';
            if (text.indexOf('window.SSR') === -1) continue;
            var loaderData = parseAssignedJson(text, 'window.SSR.loaderData');
            if (loaderData) values.push(loaderData);
            var renderContext = parseAssignedJson(text, 'window.SSR.renderContext');
            if (renderContext) values.push(renderContext);
        }
        return values;
    }

    function buildStarFallback() {
        var map = new Map();
        var islands = readSsrIslands();
        if (!islands.length) return map;
        var seenStrings = new Set();

        function visit(value, depth) {
            if (value == null || depth > 12) return;
            if (typeof value === 'string') {
                if (value.length < 2 || (value.charAt(0) !== '{' && value.charAt(0) !== '[') || seenStrings.has(value)) return;
                seenStrings.add(value);
                try {
                    visit(JSON.parse(value), depth + 1);
                } catch (error) {
                    // not JSON
                }
                return;
            }
            if (Array.isArray(value)) {
                for (var i = 0; i < value.length; i++) visit(value[i], depth + 1);
                return;
            }
            if (typeof value === 'object') {
                if (value.publishedfileid != null && value.star_rating != null) {
                    var stars = Number(value.star_rating);
                    if (!isNaN(stars)) {
                        map.set(String(value.publishedfileid), stars);
                    }
                }
                for (var key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        visit(value[key], depth + 1);
                    }
                }
            }
        }

        for (var i = 0; i < islands.length; i++) visit(islands[i], 0);
        return map;
    }

    function getStarRating(card, id) {
        var filled = card.querySelectorAll('svg.SVGIcon_Star_Filled').length;
        if (filled > 0) return Math.min(filled, 5);
        if (card.querySelector('svg.SVGIcon_Star_Filled, svg.SVGIcon_Star_Unfilled')) return 0;
        if (starFallback === null) starFallback = buildStarFallback();
        return starFallback.get(id) || 0;
    }

    function getSubscribedState(card, id) {
        if (statusById.has(id)) return statusById.get(id);
        // Fallback heuristic only: the card action area shows a check icon when the
        // item is subscribed and a plus icon when it is not.
        if (card.querySelector('svg.SVGIcon_Check, svg.SVGIcon_DialogCheck')) return true;
        if (card.querySelector('svg.SVGIcon_Plus')) return false;
        return undefined;
    }

    function maybeWarnUnknown(unknownCount) {
        if (warned || unknownCount <= 0) return;
        if (statusById.size === 0 && requestedIds.size === 0) {
            warned = true;
            console.warn(LOG_PREFIX + ' Subscribed state is unavailable for some items; leaving them visible.');
        }
    }

    // ---------------------------------------------------------------------
    // Public API used by content.js
    // ---------------------------------------------------------------------

    function applyFilters(state) {
        var cards = enumerateCards();
        var hideSubscribed = !!(state && state.isHidingSubscribed);
        var minStars = Number(state && state.currentStarFilter) || 0;
        var unknownCount = 0;
        var ids = [];
        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            ids.push(card.id);
            var hide = false;
            if (minStars > 0 && getStarRating(card.root, card.id) < minStars) {
                hide = true;
            }
            if (hideSubscribed) {
                var subscribed = getSubscribedState(card.root, card.id);
                if (subscribed === true) {
                    hide = true;
                } else if (subscribed === undefined) {
                    unknownCount += 1;
                }
            }
            card.root.classList.toggle('hidden-item', hide);
        }
        if (hideSubscribed) {
            requestStatuses(ids);
            maybeWarnUnknown(unknownCount);
        }
    }

    function onStatusUpdate(callback) {
        if (typeof callback !== 'function') return function () {};
        listeners.push(callback);
        return function () {
            var index = listeners.indexOf(callback);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    window.WSHSDom = {
        isNewLayout: isNewLayout,
        getControlArea: getControlArea,
        applyFilters: applyFilters,
        onStatusUpdate: onStatusUpdate
    };
})();
