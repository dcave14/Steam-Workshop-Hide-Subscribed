// hydration-signal.js
// Runs in the page's MAIN world (see manifest.json) so it can see React's
// per-node expando keys (__reactFiber$<hash>), which the isolated content
// script world cannot read.
//
// Single responsibility: tell content.js the moment React has hydrated the
// row that holds the native sort button. React attaches the fiber key to a
// host node when that node finishes hydrating, after all of its children, so
// once the row has one, inserting our controls into it can no longer cause a
// hydration mismatch (#418). The signal is the data-wshs-hydrated attribute
// on <html>: attributes are shared across worlds and content.js's document
// MutationObserver already watches attributes, so no messaging is needed.
//
// If the row never shows a fiber key (legacy page, layout change, React
// internals renamed), polling stops after MAX_WAIT_MS and content.js keeps its
// old load-plus-quiet-period gate as the fallback.

(function () {
    'use strict';

    var POLL_MS = 50;
    var MAX_WAIT_MS = 20000;
    var started = Date.now();

    function hasFiber(node) {
        if (!node) return false;
        var keys = Object.keys(node);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0) return true;
        }
        return false;
    }

    // Same structural match as steam-dom.js findSortButtonIn(): a
    // div[role=button][tabindex] containing the 12x8 chevron, preferring the
    // one that also holds the 32x18 sort glyph.
    function findSortRow() {
        var buttons = document.querySelectorAll('div[role="button"][tabindex]');
        var chevronOnly = null;
        for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            if (!button.querySelector('svg[viewBox="0 0 12 8"]')) continue;
            var wrapper = button.parentElement;
            if (!wrapper || !wrapper.parentElement) continue;
            if (button.querySelector('svg[viewBox="0 0 32 18"]')) return wrapper.parentElement;
            if (!chevronOnly) chevronOnly = wrapper.parentElement;
        }
        return chevronOnly;
    }

    function check() {
        var row = findSortRow();
        if (row && hasFiber(row)) {
            document.documentElement.setAttribute('data-wshs-hydrated', '1');
            return;
        }
        if (Date.now() - started < MAX_WAIT_MS) {
            setTimeout(check, POLL_MS);
        }
    }

    check();
})();
