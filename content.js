// content.js
let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let widthSync = null;
let widthSyncCleanup = null;
let lastOverrunLog = null;
let fontsReadyHooked = false;

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

function isHydrationSettled() {
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
    hideButton.addEventListener('click', toggleSubscribedItems);

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'star-dropdown-content';
    dropdownContent.innerHTML = `
        <div class="star-option" data-stars="0">Show All</div>
        <div class="star-option" data-stars="5">5 Stars Only</div>
        <div class="star-option" data-stars="4">4+ Stars</div>
        <div class="star-option" data-stars="3">3+ Stars</div>
        <div class="star-option" data-stars="2">2+ Stars</div>
        <div class="star-option" data-stars="1">1+ Stars</div>
    `;

    function renderStarLabel() {
        starLabel.textContent = currentStarFilter === 0 ? 'Star Rating' : currentStarFilter + '+ Stars';
    }

    function renderHideState() {
        hideButton.classList.toggle('active', isHidingSubscribed);
        hideButton.setAttribute('aria-pressed', isHidingSubscribed ? 'true' : 'false');
        hideLabel.textContent = isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed';
    }

    // Add event listeners for star filter
    starButton.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent.classList.toggle('show');
    });

    // Handle star filter selection
    dropdownContent.addEventListener('click', (e) => {
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

    // Canvas measurement of the rendered label width (advance width) using the
    // button's own computed font. Chrome width = padding 20 + left icon 25 +
    // right icon/slot 17 = 62; the two internal gaps share the rest.
    let measureCanvas = null;
    function measureLabelInk(text, source) {
        const label = (text || '').trim();
        if (!label) return 0;
        try {
            if (!measureCanvas) measureCanvas = document.createElement('canvas');
            const context = measureCanvas.getContext('2d');
            if (!context) return 0;
            const style = window.getComputedStyle(source);
            context.font = style.fontStyle + ' ' + style.fontWeight + ' ' +
                style.fontSize + ' ' + style.fontFamily;
            return context.measureText(label).width;
        } catch (error) {
            return 0;
        }
    }

    function clearButtonGeometry(button) {
        if (!button) return;
        button.style.boxSizing = '';
        button.style.width = '';
        button.style.minWidth = '';
        button.style.height = '';
        button.style.minHeight = '';
        button.style.gap = '';
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
                'px (widest label needs more than the card width)');
        }
    }

    // Geometry observers: the sort button and its wrapper (React can clobber
    // their style), a representative card (grid reflow) and the native sort
    // label (a period/order change re-measures the ink).
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
            if (card !== observedCard) {
                cardResizeObserver.disconnect();
                if (card) cardResizeObserver.observe(card);
                observedCard = card;
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
    // only when the widest visible label cannot fit at the 8px internal-gap
    // floor. The group tiles the three rightmost card columns: [star][hide]
    // sits immediately left of the sort wrapper with the card gap between
    // them, and the native sort button keeps the grid's right edge, so the
    // columns tile by construction. One shared height is forced on all three.
    function resync() {
        const liveSort = getLiveSortInfo();
        const liveSortButton = liveSort ? liveSort.button : null;
        const rowGap = liveSortButton ? getRowColumnGap(liveSortButton) : 0;
        const geometry = (isNewLayout && window.WSHSDom && window.WSHSDom.getCardGeometry)
            ? window.WSHSDom.getCardGeometry()
            : null;

        observeGeometry(liveSort, geometry);

        // Fallback (legacy layout, unmeasurable cards, fewer than three card
        // columns, implausibly narrow card): our two buttons only, equal width
        // to each other, gap G (row column-gap else 10px). The native sort
        // button gets its natural geometry back.
        if (!liveSortButton || !geometry || geometry.columns < 3 || !(geometry.width >= 120)) {
            clearButtonGeometry(starButton);
            clearButtonGeometry(hideButton);
            clearButtonGeometry(liveSortButton);
            const naturalWidth = Math.max(
                starButton.getBoundingClientRect().width,
                hideButton.getBoundingClientRect().width
            );
            if (naturalWidth > 0) {
                starButton.style.width = naturalWidth + 'px';
                hideButton.style.width = naturalWidth + 'px';
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

        // The widest visible label decides the internal gap for all three:
        // clamp(8, (W - ink - 62) / 2, 20); at the floor a shared overrun keeps
        // the labels single-line. Fonts, icons and padding never change.
        const widestInk = Math.max(
            measureLabelInk(starLabel.textContent, starButton),
            measureLabelInk(hideLabel.textContent, hideButton),
            measureLabelInk(liveSortButton.textContent, liveSortButton)
        );
        let width = geometry.width;
        const requiredWidth = widestInk + 62 + 16;
        if (requiredWidth > width) width = requiredWidth;
        const gap = Math.max(8, Math.min(20, (width - widestInk - 62) / 2));
        logOverrun(width - geometry.width);

        // Width first (removes any wrap), then the tallest natural height
        // measured with the width in place, forced on all three.
        setButtonWidth(starButton, width, gap);
        setButtonWidth(hideButton, width, gap);
        setButtonWidth(liveSortButton, width, gap);
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

    // Canvas ink measured before the webfont is ready would be wrong; re-run
    // once the fonts have finished loading.
    if (!fontsReadyHooked && document.fonts && document.fonts.ready && document.fonts.ready.then) {
        fontsReadyHooked = true;
        document.fonts.ready.then(() => {
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
            label.textContent = isHidingSubscribed ? 'Showing New Items' : 'Hide Subscribed';
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

// Set up mutation observer to handle dynamically loaded content
const observer = new MutationObserver((mutations) => {
    lastDomMutationAt = Date.now();
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            applyFiltersIfNeeded();
            return;
        }
        for (const node of mutation.removedNodes) {
            if (node.nodeType === 1 && (node.classList.contains('hide-subscribed-button') ||
                node.classList.contains('wshs-injected-controls') ||
                node.querySelector('.hide-subscribed-button'))) {
                createButtons();
                return;
            }
            if (widthSync && nodeContainsSortButton(node)) {
                // React replaced the native sort node; re-resolve and re-apply.
                widthSync();
                return;
            }
        }
    }
});

observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true
});

init();