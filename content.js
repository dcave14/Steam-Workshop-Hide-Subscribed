// content.js
let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let widthSync = null;
let widthSyncCleanup = null;

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
    const sortButton = sortInfo && sortInfo.button ? sortInfo.button : null;

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

    // Equal width: match the native sort button when it is present; otherwise
    // make the two injected buttons match each other (wider one wins). Setting
    // min-width too keeps the buttons from being flex-shrunk below the sync.
    function syncWidths() {
        const liveSort = getLiveSortInfo();
        if (liveSort) {
            let width = liveSort.button.getBoundingClientRect().width;
            if (width < 120 && liveSort.wrapper) {
                width = liveSort.wrapper.getBoundingClientRect().width;
            }
            if (width < 120) return;
            starButton.style.width = width + 'px';
            hideButton.style.width = width + 'px';
            starButton.style.minWidth = width + 'px';
            hideButton.style.minWidth = width + 'px';
            return;
        }
        starButton.style.width = '';
        hideButton.style.width = '';
        starButton.style.minWidth = '';
        hideButton.style.minWidth = '';
        const width = Math.max(
            starButton.getBoundingClientRect().width,
            hideButton.getBoundingClientRect().width
        );
        if (width > 0) {
            starButton.style.width = width + 'px';
            hideButton.style.width = width + 'px';
        }
    }

    // Uniform gap G: the sort row's flex column-gap when it has one, otherwise
    // 10px. The row on the new layout is a space-between flex container, so our
    // wrapper becomes a middle item and the slack collects between it and the
    // sort button; a left auto margin absorbs that free space and makes the
    // cluster hug the sort button. Without a row gap, a right margin supplies
    // the wrapper-to-sort gap. Re-run this on resize.
    function applySpacing() {
        const liveSort = getLiveSortInfo();
        const rowGap = liveSort ? getRowColumnGap(liveSort.button) : 0;
        const gap = rowGap > 0 ? rowGap : 10;
        injectedControls.style.gap = gap + 'px';
        if (liveSort) {
            injectedControls.style.marginLeft = 'auto';
            injectedControls.style.marginRight = rowGap > 0 ? '' : gap + 'px';
        } else {
            injectedControls.style.marginLeft = '';
            injectedControls.style.marginRight = '';
        }
    }

    function resync() {
        applySpacing();
        syncWidths();
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

    let resizeObserver = null;
    if (sortButton && typeof ResizeObserver === 'function') {
        resizeObserver = new ResizeObserver(() => resync());
        resizeObserver.observe(sortButton);
    }
    window.addEventListener('resize', resync);
    widthSyncCleanup = () => {
        window.removeEventListener('resize', resync);
        if (resizeObserver) resizeObserver.disconnect();
    };

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
        }
    }
});

observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true
});

init();