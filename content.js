// content.js
let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let widthSync = null;
let widthSyncCleanup = null;
let lastOverrunLog = null;
let fontsReadyHooked = false;

// One uniform font F on all three controls (star, hide and the native sort
// label). 13px keeps the widest known label on one line at the logged-in card
// width W=262.5 with the 8px internal-gap floor (Iworst + 78 <= W).
const BUTTON_FONT_SIZE = '13px';

// Shared chrome: horizontal padding 20 + left icon 25 + right icon/slot 17.
const BUTTON_CHROME_WIDTH = 62;
const GAP_FLOOR = 8;

// When a card column is narrower than the worst-case label needs at 13px,
// the font scales down so the buttons stay exactly card-width (flush with the
// columns) instead of overhanging them. Below this size the buttons overrun
// the card width instead.
const MIN_FIT_FONT_PX = 10;
const GAP_CEIL = 20;

// Frozen fallback ink for the worst known label ("Most Popular (Three Months)"
// measures ~177.2px at F). Used only when the measuring probe fails entirely
// (Iworst==0), so geometry never falls back to live label text.
const IWORST_FALLBACK_ESTIMATE = 180;

// Frozen worst-case label set (Iworst is the max ink over this set at F, plus
// any sort options enumerated from the live dropdown). Known native options.
const SORT_OPTION_LABELS = [
    'Most Popular (Today)',
    'Most Popular (One Week)',
    'Most Popular (Three Months)',
    'Most Popular (Six Months)',
    'Most Popular (One Year)',
    'Most Popular (All Time)',
    'Most Subscribed (All Time)',
    'Top Rated All Time',
    'Most Recent',
    'Last Updated',
    'Total Unique Subscribers'
];

// Our own label states: star filter (default + 1+..5+) and hide toggle.
const OWN_LABEL_STATES = [
    'Star Rating',
    '1+ Stars',
    '2+ Stars',
    '3+ Stars',
    '4+ Stars',
    '5+ Stars',
    'Hide Subscribed',
    'Showing New Items'
];

// Iworst is frozen per page load (re-measured only when font metrics change),
// never from live label text.
let worstCaseInk = null;
let worstCaseInkLabel = '';

// Steam's new layout is server-rendered and hydrated by React after the page
// scripts run. Inserting our controls before hydration makes React report an
// uncaught hydration mismatch (#418), so on the new layout the injection waits
// for the page load plus a short DOM-quiet period. Legacy pages are not
// React-owned and keep the immediate injection.
const HYDRATION_SETTLE_MS = 1500;
let lastDomMutationAt = Date.now();
let createButtonsRetryTimer = null;

const SVG_NS = 'http://www.w3.org/2000/svg';

function getControlArea() {
    // .subscribeCollection is the classic collection page's native 3-button
    // row (sharedfiles/filedetails/?id=<collectionid>), which is legacy DOM.
    // It is resolved on its own BEFORE the legacy selector list: a collection
    // page also contains .collectionControls > .workshopItemControls (the top
    // review bar) earlier in document order, which a single combined
    // querySelector would return first.
    const collectionArea = document.querySelector('.subscribeCollection');
    if (collectionArea) return collectionArea;
    const legacyArea = document.querySelector('.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls');
    if (legacyArea) return legacyArea;
    if (window.WSHSDom && window.WSHSDom.isNewLayout()) {
        return window.WSHSDom.getControlArea();
    }
    return null;
}

function createSvgIcon(className, viewBox) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return svg;
}

function createSvgPath(d, fillRule, strokeWidth) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    if (fillRule) path.setAttribute('fill-rule', fillRule);
    if (strokeWidth) {
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', strokeWidth);
        path.setAttribute('stroke-linecap', 'round');
    }
    return path;
}

function createStarIcon() {
    const svg = createSvgIcon('wshs-left-icon', '0 0 24 24');
    svg.appendChild(createSvgPath('M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'));
    return svg;
}

function createHideIcon() {
    const svg = createSvgIcon('wshs-left-icon', '0 0 24 24');
    svg.appendChild(createSvgPath(
        'M12 4.5C6.9 4.5 3 8.53 1.8 12c1.2 3.47 5.1 7.5 10.2 7.5s9-4.03 10.2-7.5C21 8.53 17.1 4.5 12 4.5zm0 12a4.5 4.5 0 110-9 4.5 4.5 0 010 9z',
        'evenodd'
    ));
    svg.appendChild(createSvgPath('M4.2 2.5l17.3 19', null, '2'));
    return svg;
}

function createChevronIcon() {
    const svg = createSvgIcon('wshs-chevron', '0 0 12 8');
    svg.appendChild(createSvgPath('M5.62915 7.5L-1.40071e-05 1.06691e-07L11.2583 -8.77544e-07L5.62915 7.5Z'));
    return svg;
}

function createCheckIcon() {
    const svg = createSvgIcon('wshs-check-icon', '0 0 24 24');
    svg.appendChild(createSvgPath('M9.55 17.6L3.4 11.45l2.12-2.12 4.03 4.03 8.93-8.93 2.12 2.12L9.55 17.6z'));
    return svg;
}

// Label updates edit the existing text node instead of assigning textContent.
// textContent swaps in a new child node, and on large Steam pages (collection
// pages with hundreds of items) every node insertion costs ~40ms of style and
// layout, with or without this extension. A nodeValue edit costs ~0.5ms.
function setText(element, text) {
    const node = element.firstChild;
    if (node && node.nodeType === 3 && !node.nextSibling) {
        if (node.nodeValue !== text) node.nodeValue = text;
    } else {
        element.textContent = text;
    }
}

function getRowColumnGap(sortButton) {
    let node = sortButton.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
        const style = window.getComputedStyle(node);
        if (style.display === 'flex' || style.display === 'inline-flex') {
            const gap = parseFloat(style.columnGap);
            return !isNaN(gap) && gap > 0 ? gap : 0;
        }
        node = node.parentElement;
    }
    return 0;
}

// hydration-signal.js (MAIN world) sets data-wshs-hydrated on <html> as soon
// as React has hydrated the sort row, which is usually well before the load
// event. The load-plus-quiet-period check stays as the fallback for pages
// where that signal never arrives.
function isHydrationSettled() {
    if (document.documentElement.hasAttribute('data-wshs-hydrated')) return true;
    return document.readyState === 'complete' &&
        Date.now() - lastDomMutationAt >= HYDRATION_SETTLE_MS;
}

// The gate below needs a callback after the DOM goes quiet, which the global
// MutationObserver cannot guarantee on its own.
function scheduleCreateButtonsRetry() {
    if (createButtonsRetryTimer !== null) return;
    const quietFor = Date.now() - lastDomMutationAt;
    createButtonsRetryTimer = setTimeout(() => {
        createButtonsRetryTimer = null;
        createButtons();
    }, Math.max(250, HYDRATION_SETTLE_MS - quietFor));
}

function createButtons() {
    const controlArea = getControlArea();
    if (!controlArea || document.querySelector('.hide-subscribed-button')) return;

    if (widthSyncCleanup) {
        widthSyncCleanup();
        widthSyncCleanup = null;
    }

    const isNewLayout = !!(window.WSHSDom && window.WSHSDom.isNewLayout && window.WSHSDom.isNewLayout());

    // Classic collection pages: our controls join the native .subscribeCollection
    // button row and keep its .general_btn skin, so the browse-page shared
    // geometry (frozen width, sort-button coupling) does not run there.
    const isCollectionArea = controlArea.classList.contains('subscribeCollection');

    // Hydration gate for the new layout (see the note at the top of the file).
    // The observer keeps calling createButtons() while the page mutates; the
    // retry timer covers the quiet case.
    if (isNewLayout && !isHydrationSettled()) {
        scheduleCreateButtonsRetry();
        return;
    }

    let sortInfo = isNewLayout && window.WSHSDom.getSortButton ? window.WSHSDom.getSortButton() : null;

    // Star filter button: [star icon][label][chevron]. The chevron toggles the
    // existing star dropdown.
    const starFilterContainer = document.createElement('div');
    starFilterContainer.style.display = 'inline-block';
    starFilterContainer.style.position = 'relative';

    const starButton = document.createElement('button');
    starButton.type = 'button';
    starButton.className = 'hide-subscribed-button star-filter-button';
    const starLabel = document.createElement('span');
    starLabel.className = 'wshs-button-label';
    starLabel.textContent = 'Star Rating';
    starButton.appendChild(createStarIcon());
    starButton.appendChild(starLabel);
    starButton.appendChild(createChevronIcon());

    // Hide subscribed toggle: [eye-off icon][label][reserved 17px slot]. The
    // slot stays in the layout when inactive so the geometry does not jump.
    const hideButton = document.createElement('button');
    hideButton.type = 'button';
    hideButton.className = 'hide-subscribed-button';
    hideButton.setAttribute('aria-pressed', 'false');
    const hideLabel = document.createElement('span');
    hideLabel.className = 'wshs-button-label';
    hideLabel.textContent = 'Hide Subscribed';
    const toggleSlot = document.createElement('span');
    toggleSlot.className = 'wshs-toggle-slot';
    toggleSlot.appendChild(createCheckIcon());
    hideButton.appendChild(createHideIcon());
    hideButton.appendChild(hideLabel);
    hideButton.appendChild(toggleSlot);
    // Our clicks stop at our controls: Steam's document-level click handler
    // (fnCancelHover in shared_global.js) reads computed styles across the
    // whole item list and cost ~45ms per click on large collection pages.
    hideButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent.classList.remove('show');
        toggleSubscribedItems();
    });

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'star-dropdown-content';
    dropdownContent.innerHTML = `
        <div class="wshs-star-options" role="radiogroup">
            <div class="star-option" role="radio" data-stars="0">Show All</div>
            <div class="star-option" role="radio" data-stars="5">5 Stars Only</div>
            <div class="star-option" role="radio" data-stars="4">4+ Stars</div>
            <div class="star-option" role="radio" data-stars="3">3+ Stars</div>
            <div class="star-option" role="radio" data-stars="2">2+ Stars</div>
            <div class="star-option" role="radio" data-stars="1">1+ Stars</div>
        </div>
    `;

    function renderStarLabel() {
        setText(starLabel, currentStarFilter === 0 ? 'Star Rating' : currentStarFilter + '+ Stars');
        for (const option of dropdownContent.querySelectorAll('.star-option')) {
            const checked = Number(option.dataset.stars) === currentStarFilter;
            if (option.getAttribute('aria-checked') !== String(checked)) {
                option.setAttribute('aria-checked', String(checked));
            }
        }
    }
    renderStarLabel();

    function renderHideState() {
        hideButton.classList.toggle('active', isHidingSubscribed);
        hideButton.setAttribute('aria-pressed', isHidingSubscribed ? 'true' : 'false');
        setText(hideLabel, isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed');
    }

    // Add event listeners for star filter
    starButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent.classList.toggle('show');
    });

    // Handle star filter selection
    dropdownContent.addEventListener('click', (e) => {
        e.stopPropagation();
        const option = e.target.closest('.star-option');
        if (option) {
            currentStarFilter = parseInt(option.dataset.stars);
            renderStarLabel();
            dropdownContent.classList.remove('show');

            // Save star filter preference
            chrome.storage.local.set({ starFilter: currentStarFilter });

            applyFilters();
            if (widthSync) widthSync();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdownContent.classList.remove('show');
    });

    // Load saved states
    chrome.storage.local.get(['hideSubscribed', 'starFilter'], (data) => {
        if (data.hideSubscribed) {
            isHidingSubscribed = true;
        }
        if (data.starFilter) {
            currentStarFilter = data.starFilter;
        }
        renderHideState();
        renderStarLabel();

        // Apply both filters if either is active
        if (data.hideSubscribed || data.starFilter > 0) {
            applyFilters();
        }
        if (widthSync) widthSync();
    });

    starFilterContainer.appendChild(starButton);
    starFilterContainer.appendChild(dropdownContent);

    const injectedControls = document.createElement('div');
    injectedControls.className = 'wshs-injected-controls';
    if (isNewLayout) {
        injectedControls.className += ' wshs-new-layout-controls';
    }
    if (isCollectionArea) {
        injectedControls.className += ' wshs-collection-controls';
    }
    injectedControls.appendChild(starFilterContainer);
    injectedControls.appendChild(hideButton);

    // The sort button is re-resolved on every sync because React can replace
    // the node during hydration, which would otherwise freeze the width sync.
    function getLiveSortInfo() {
        if (sortInfo && sortInfo.button && sortInfo.button.isConnected) return sortInfo;
        if (isNewLayout && window.WSHSDom && window.WSHSDom.getSortButton) {
            const fresh = window.WSHSDom.getSortButton();
            if (fresh && fresh.button) {
                sortInfo = fresh;
                return fresh;
            }
        }
        return null;
    }

    // Frozen worst-case ink Iworst: the max text width over the fixed label
    // set (plus any sort options Steam has mounted), measured once at F with a
    // hidden fixed-position span - no layout side effects, no reading of the
    // live button labels. Cached per page load; only a font-metrics change
    // (document.fonts.ready) re-measures it.
    function getWorstCaseInk(sortButton) {
        if (worstCaseInk !== null) return worstCaseInk;
        if (!document.body) return 0;

        const labels = SORT_OPTION_LABELS.slice();
        if (window.WSHSDom && window.WSHSDom.getSortOptionLabels) {
            const mounted = window.WSHSDom.getSortOptionLabels();
            for (const text of mounted) {
                if (text && labels.indexOf(text) === -1) labels.push(text);
            }
        }

        const probe = document.createElement('span');
        probe.setAttribute('aria-hidden', 'true');
        probe.style.position = 'fixed';
        probe.style.left = '-99999px';
        probe.style.top = '0';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.whiteSpace = 'nowrap';
        probe.style.display = 'inline-block';
        document.body.appendChild(probe);

        function maxInk(stateLabels, source) {
            let worst = 0;
            let worstLabel = '';
            const style = window.getComputedStyle(source);
            for (const text of stateLabels) {
                const label = (text || '').trim();
                if (!label) continue;
                probe.style.fontFamily = style.fontFamily;
                probe.style.fontWeight = style.fontWeight;
                probe.style.fontStyle = style.fontStyle;
                probe.style.letterSpacing = style.letterSpacing;
                probe.style.fontSize = BUTTON_FONT_SIZE;
                setText(probe, label);
                const ink = probe.getBoundingClientRect().width;
                if (ink > worst) {
                    worst = ink;
                    worstLabel = label;
                }
            }
            return { ink: worst, label: worstLabel };
        }

        let measured;
        try {
            const own = maxInk(OWN_LABEL_STATES, starButton);
            const sortSource = sortButton && sortButton.isConnected ? sortButton : starButton;
            const native = maxInk(labels, sortSource);
            measured = native.ink >= own.ink ? native : own;
        } finally {
            probe.remove();
        }

        if (measured.ink > 0) {
            worstCaseInk = measured.ink;
            worstCaseInkLabel = measured.label;
            console.debug('[WSHS] frozen worst-case label ink ' +
                Math.round(worstCaseInk * 100) / 100 + 'px ("' + worstCaseInkLabel +
                '") at ' + BUTTON_FONT_SIZE);
        }
        return worstCaseInk || 0;
    }

    // F is forced on the native sort label itself too (inline, because the page
    // stylesheet sets 15px and React can replace the node).
    function applyUniformFont(button, size) {
        if (!button) return;
        const value = size || BUTTON_FONT_SIZE;
        button.style.fontSize = value;
        const textSpans = button.querySelectorAll('span');
        for (const span of textSpans) {
            if (!span.children.length && span.textContent.trim()) {
                span.style.fontSize = value;
            }
        }
    }

    // Steam's native sort button is display:flex with justify-content:normal
    // and a fixed gap:20px, so under our forced shared width the [sort
    // icon][label][chevron] cluster left-packs and the slack collects after the
    // chevron. space-between pins each icon to its 10px padding edge and splits
    // the remaining slack around the middle item, so the label ink is centered
    // with equal whitespace both sides - the same three-zone result the
    // injected buttons get from their flexing label span. Padding is
    // normalized to 10px to match the injected buttons.
    function applyNativeSortAnatomy(button) {
        if (!button) return;
        button.style.justifyContent = 'space-between';
        button.style.paddingLeft = '10px';
        button.style.paddingRight = '10px';
        // Same drop shadow as the injected buttons and the dropdowns
        // (styles.css).
        button.style.boxShadow = '1px 1px 10px 0 rgba(0, 0, 0, 0.6)';
    }

    function clearButtonGeometry(button) {
        if (!button) return;
        button.style.boxSizing = '';
        button.style.width = '';
        button.style.minWidth = '';
        button.style.height = '';
        button.style.minHeight = '';
        button.style.gap = '';
        button.style.justifyContent = '';
        button.style.paddingLeft = '';
        button.style.paddingRight = '';
        button.style.boxShadow = '';
    }

    function setButtonWidth(button, width, gap) {
        button.style.boxSizing = 'border-box';
        button.style.width = width + 'px';
        button.style.minWidth = width + 'px';
        button.style.gap = gap + 'px';
        button.style.height = '';
    }

    function logOverrun(overrun) {
        const value = Math.round(overrun * 10) / 10;
        if (value === lastOverrunLog) return;
        lastOverrunLog = value;
        if (value > 0) {
            console.debug('[WSHS] shared button width overrun +' + value +
                'px (frozen worst-case label needs more than the card width)');
        }
    }

    // Geometry observers: the sort button and its wrapper (React can clobber
    // their style), a representative card (grid reflow) and the native sort
    // button (a relabel re-applies styles; the frozen ink keeps it idempotent).
    let sortResizeObserver = null;
    let cardResizeObserver = null;
    let sortLabelObserver = null;
    let observedSortNodes = [];
    let observedCard = null;
    let observedLabelNode = null;

    function sameNodes(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    function observeGeometry(liveSort, geometry) {
        const sortNodes = [];
        if (liveSort && liveSort.button) sortNodes.push(liveSort.button);
        if (liveSort && liveSort.wrapper) sortNodes.push(liveSort.wrapper);
        if (typeof ResizeObserver === 'function') {
            if (!sortResizeObserver) sortResizeObserver = new ResizeObserver(() => resync());
            if (!sameNodes(sortNodes, observedSortNodes)) {
                sortResizeObserver.disconnect();
                for (const node of sortNodes) sortResizeObserver.observe(node);
                observedSortNodes = sortNodes;
            }
            const card = geometry && geometry.card ? geometry.card : null;
            if (!cardResizeObserver) cardResizeObserver = new ResizeObserver(() => resync());
            if (card && card !== observedCard) {
                cardResizeObserver.disconnect();
                cardResizeObserver.observe(card);
                observedCard = card;
            } else if (!card && observedCard && !observedCard.isConnected) {
                // Fallback is active: keep observing the last live card (the
                // observer stays attached instead of disconnecting) so a grid
                // reflow can leave the fallback without a window resize; drop
                // the reference only for genuinely detached nodes.
                observedCard = null;
            }
        }
        const labelNode = liveSort && liveSort.button ? liveSort.button : null;
        if (labelNode !== observedLabelNode) {
            if (sortLabelObserver) sortLabelObserver.disconnect();
            if (labelNode && typeof MutationObserver === 'function') {
                if (!sortLabelObserver) sortLabelObserver = new MutationObserver(() => resync());
                sortLabelObserver.observe(labelNode, { childList: true, characterData: true, subtree: true });
            }
            observedLabelNode = labelNode;
        }
    }

    // Round-4 geometry: all three buttons (including the native sort button)
    // share one width - the mod card width, plus a symmetric shared overrun
    // only when the frozen worst-case label cannot fit at the 8px internal-gap
    // floor. The group tiles the three rightmost card columns: [star][hide]
    // sits immediately left of the sort wrapper with the card gap between
    // them, and the native sort button keeps the grid's right edge, so the
    // columns tile by construction. One shared height is forced on all three.
    function resync() {
        // Collection-page controls keep their natural width in the native
        // button row; there is no sort button to tile with there.
        if (isCollectionArea) return;
        const liveSort = getLiveSortInfo();
        const liveSortButton = liveSort ? liveSort.button : null;
        if (liveSortButton) applyUniformFont(liveSortButton);
        const rowGap = liveSortButton ? getRowColumnGap(liveSortButton) : 0;
        const geometry = (isNewLayout && window.WSHSDom && window.WSHSDom.getCardGeometry)
            ? window.WSHSDom.getCardGeometry()
            : null;

        observeGeometry(liveSort, geometry);

        // Fallback (legacy layout, unmeasurable cards, fewer than three card
        // columns, implausibly narrow card): our two buttons only, equal width
        // to each other, gap G (row column-gap else 10px). Width is the same
        // frozen constant as the main path (Iworst + chrome + 2 x gap floor),
        // so it cannot move with labels. The native sort button gets its
        // natural geometry back.
        if (!liveSortButton || !geometry || geometry.columns < 3 || !(geometry.width >= 120)) {
            starButton.style.fontSize = '';
            hideButton.style.fontSize = '';
            clearButtonGeometry(starButton);
            clearButtonGeometry(hideButton);
            clearButtonGeometry(liveSortButton);
            const iworst = getWorstCaseInk(liveSortButton);
            if (iworst > 0) {
                const width = iworst + BUTTON_CHROME_WIDTH + 2 * GAP_FLOOR;
                setButtonWidth(starButton, width, GAP_FLOOR);
                setButtonWidth(hideButton, width, GAP_FLOOR);
            } else {
                const width = IWORST_FALLBACK_ESTIMATE + BUTTON_CHROME_WIDTH + 2 * GAP_FLOOR;
                setButtonWidth(starButton, width, GAP_FLOOR);
                setButtonWidth(hideButton, width, GAP_FLOOR);
            }
            const gap = rowGap > 0 ? rowGap : 10;
            injectedControls.style.gap = gap + 'px';
            if (liveSortButton) {
                injectedControls.style.marginLeft = 'auto';
                injectedControls.style.marginRight = rowGap > 0 ? '' : gap + 'px';
            } else {
                injectedControls.style.marginLeft = '';
                injectedControls.style.marginRight = '';
            }
            return;
        }

        // Geometry is a pure function of the card grid (W) and the frozen
        // worst-case ink Iworst (measured at 13px); live label text never feeds
        // width or gap. The buttons are card-width so they sit flush on the
        // columns; when the worst-case label does not fit at 13px with the 8px
        // gap floor, the font scales down (ink scales linearly with font size)
        // until it does, down to MIN_FIT_FONT_PX. Only below that do the
        // buttons overrun W.
        const iworst13 = getWorstCaseInk(liveSortButton) || IWORST_FALLBACK_ESTIMATE;
        const baseFont = parseFloat(BUTTON_FONT_SIZE);
        const labelBudget = geometry.width - BUTTON_CHROME_WIDTH - 2 * GAP_FLOOR;
        let fontPx = baseFont;
        if (iworst13 > labelBudget) {
            fontPx = Math.max(MIN_FIT_FONT_PX, Math.floor(baseFont * labelBudget / iworst13 * 10) / 10);
        }
        const iworst = iworst13 * fontPx / baseFont;
        const fontValue = fontPx + 'px';
        starButton.style.fontSize = fontValue;
        hideButton.style.fontSize = fontValue;
        applyUniformFont(liveSortButton, fontValue);
        const width = Math.max(geometry.width, iworst + BUTTON_CHROME_WIDTH + 2 * GAP_FLOOR);
        const gap = Math.max(GAP_FLOOR, Math.min(GAP_CEIL,
            (geometry.width - iworst - BUTTON_CHROME_WIDTH) / 2));
        logOverrun(width - geometry.width);

        // Width first (removes any wrap), then the tallest natural height
        // measured with the width in place, forced on all three.
        setButtonWidth(starButton, width, gap);
        setButtonWidth(hideButton, width, gap);
        setButtonWidth(liveSortButton, width, gap);
        applyNativeSortAnatomy(liveSortButton);
        void injectedControls.offsetHeight;
        const height = Math.max(
            starButton.getBoundingClientRect().height,
            hideButton.getBoundingClientRect().height,
            liveSortButton.getBoundingClientRect().height
        );
        if (height > 0) {
            starButton.style.height = height + 'px';
            hideButton.style.height = height + 'px';
            liveSortButton.style.height = height + 'px';
        }

        // External gaps equal the card gap: the wrapper's own gap covers
        // star->hide; the row's flex column-gap covers part of hide->sort, so
        // a margin supplies the remainder.
        const cardGap = geometry.gap > 0 ? geometry.gap : 0;
        injectedControls.style.gap = cardGap + 'px';
        injectedControls.style.marginLeft = 'auto';
        injectedControls.style.marginRight = Math.max(0, cardGap - rowGap) + 'px';
    }
    widthSync = resync;

    // New layout: immediately left of the native sort button's wrapper. Legacy
    // pages keep today's injection point.
    if (sortInfo && sortInfo.wrapper && sortInfo.wrapper.parentElement) {
        sortInfo.wrapper.parentElement.insertBefore(injectedControls, sortInfo.wrapper);
    } else {
        controlArea.appendChild(injectedControls);
    }

    // Keep the width sync from being defeated by flex-shrink inside the wrapper.
    starFilterContainer.style.flex = 'none';
    hideButton.style.flex = 'none';

    window.addEventListener('resize', resync);
    widthSyncCleanup = () => {
        window.removeEventListener('resize', resync);
        if (sortResizeObserver) sortResizeObserver.disconnect();
        if (cardResizeObserver) cardResizeObserver.disconnect();
        if (sortLabelObserver) sortLabelObserver.disconnect();
    };

    // The frozen ink measured before the webfont is ready would be wrong; drop
    // the cache once fonts have loaded and re-run the (now final) measurement.
    if (!fontsReadyHooked && document.fonts && document.fonts.ready && document.fonts.ready.then) {
        fontsReadyHooked = true;
        document.fonts.ready.then(() => {
            worstCaseInk = null;
            if (widthSync && document.querySelector('.hide-subscribed-button')) widthSync();
        }).catch(() => {});
    }

    resync();
}

function getStarRating(item) {
    const ratingImg = item.querySelector('.fileRating');
    if (!ratingImg) return 0;
    
    // Extract star rating from image source
    const src = ratingImg.src;
    if (src.includes('5-star')) return 5;
    if (src.includes('4-star')) return 4;
    if (src.includes('3-star')) return 3;
    if (src.includes('2-star')) return 2;
    if (src.includes('1-star')) return 1;
    
    // Alternative method using data attribute if available
    if (ratingImg.dataset.rating) {
        return parseInt(ratingImg.dataset.rating);
    }
    
    return 0;
}

function isSubscribed(item) {
    const subscriptionIcon = item.querySelector('.user_action_history_icon.subscribed');
    if (subscriptionIcon && subscriptionIcon.style.display !== 'none') {
        return true;
    }

    const subscribeBtn = item.querySelector('.general_btn.subscribe');
    if (subscribeBtn && subscribeBtn.classList.contains('toggled')) {
        return true;
    }

    return false;
}

function applyFilters() {
    if (window.WSHSDom && window.WSHSDom.isNewLayout()) {
        window.WSHSDom.applyFilters({
            isHidingSubscribed: isHidingSubscribed,
            currentStarFilter: currentStarFilter
        });
        return;
    }

    const selectors = [
        '.collectionItem',
        '.workshopItemCollection', 
        '.workshopItem'
    ];

    const itemsToFilter = selectors
        .map(selector => document.querySelectorAll(selector))
        .find(elements => elements.length > 0) || document.querySelectorAll(selectors[2]);

    Array.from(itemsToFilter).forEach(item => {
        const starRating = getStarRating(item);
        const isStarFilterPassed = currentStarFilter === 0 || starRating >= currentStarFilter;
        const isSubscriptionFilterPassed = !isHidingSubscribed || !isSubscribed(item);
        const shouldHideItem = !isStarFilterPassed || !isSubscriptionFilterPassed;

        item.classList.toggle('hidden-item', shouldHideItem);
    });
}

function toggleSubscribedItems() {
    const button = document.querySelector('.hide-subscribed-button:not(.star-filter-button)');
    isHidingSubscribed = !isHidingSubscribed;
    
    chrome.storage.local.set({ hideSubscribed: isHidingSubscribed });
    
    if (button) {
        button.classList.toggle('active', isHidingSubscribed);
        button.setAttribute('aria-pressed', isHidingSubscribed ? 'true' : 'false');
        const label = button.querySelector('.wshs-button-label');
        if (label) {
            setText(label, isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed');
        }
    }
    
    applyFilters();
    if (widthSync) widthSync();
}

function applyFiltersIfNeeded() {
    createButtons();
    if (isHidingSubscribed || currentStarFilter > 0) {
        applyFilters();
    }
    // Any DOM change (added nodes branch) re-evaluates the geometry from the
    // unfiltered grid structure, so a filter can never leave the controls in
    // the fallback layout and a React-replaced sort button is re-resolved.
    if (widthSync) widthSync();
}

function loadFilters() {
    chrome.storage.local.get(['hideSubscribed', 'starFilter'], (data) => {
        isHidingSubscribed = data.hideSubscribed || false;
        currentStarFilter = data.starFilter || 0;
        applyFiltersIfNeeded();
    });
}

function init() {
    if (window.WSHSDom && window.WSHSDom.onStatusUpdate) {
        window.WSHSDom.onStatusUpdate(() => {
            if (isHidingSubscribed || currentStarFilter > 0) {
                applyFilters();
            }
            if (widthSync) widthSync();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFilters);
    } else {
        loadFilters();
    }
}

// True when a removed node was (or contained) the native sort button, so the
// geometry sync can re-resolve the replacement instead of freezing.
function nodeContainsSortButton(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches('div[role="button"][tabindex]') &&
        node.querySelector('svg[viewBox="0 0 12 8"]')) {
        return true;
    }
    return !!(node.querySelector && node.querySelector('div[role="button"][tabindex] svg[viewBox="0 0 12 8"]'));
}

// DOM changes are batched to one pass per animation frame. While a big page
// is still parsing, the observer fires once per parser chunk; running the
// filter and geometry pass (which forces layout) on each one is what made the
// large collection pages slow. requestAnimationFrame runs before paint, so new
// items are still filtered before they are ever drawn.
let pendingDomWork = 0; // 0 none, 1 width sync only, 2 full pass
let domWorkFrame = null;

function flushDomWork() {
    domWorkFrame = null;
    const work = pendingDomWork;
    pendingDomWork = 0;
    if (work === 2) {
        applyFiltersIfNeeded();
    } else if (work === 1 && widthSync) {
        widthSync();
    }
}

function scheduleDomWork(level) {
    if (level > pendingDomWork) pendingDomWork = level;
    if (domWorkFrame === null) domWorkFrame = requestAnimationFrame(flushDomWork);
}

// Set up mutation observer to handle dynamically loaded content
const observer = new MutationObserver((mutations) => {
    lastDomMutationAt = Date.now();
    for (const mutation of mutations) {
        // Our own label/state changes (star or hide click) already ran the
        // filters synchronously; re-running them here doubled the click cost.
        const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (target && target.closest('.wshs-injected-controls')) continue;
        if (mutation.addedNodes.length) {
            scheduleDomWork(2);
            return;
        }
        for (const node of mutation.removedNodes) {
            if (node.nodeType === 1 && (node.classList.contains('hide-subscribed-button') ||
                node.classList.contains('wshs-injected-controls') ||
                node.querySelector('.hide-subscribed-button'))) {
                scheduleDomWork(2);
                return;
            }
            if (widthSync && nodeContainsSortButton(node)) {
                // React replaced the native sort node; re-resolve and re-apply.
                scheduleDomWork(1);
                return;
            }
        }
    }
});

observer.observe(document, {
    childList: true,
    subtree: true
});

// The only attribute this script needs is the hydration signal on <html>
// (see hydration-signal.js); watching every attribute in the document made
// the observer fire on Steam's constant hover and animation churn.
new MutationObserver(() => scheduleDomWork(2)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-wshs-hydrated']
});

init();