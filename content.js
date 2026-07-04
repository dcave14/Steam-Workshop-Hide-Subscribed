// content.js
// Supports both the classic Steam Workshop UI and the new (beta) redesigned UI.
// The new UI is a React app whose layout class names are hashed and change every
// build, so detection anchors only on stable, semantic signals:
//   - item cards      -> <img> inside an a[href*="/sharedfiles/filedetails/?id="]
//                        wrapped in an .aspectratio_* container
//   - star rating     -> count of svg.SVGIcon_Star_Filled
//   - subscribed?     -> the green add button shows svg.SVGIcon_Check (vs Plus)
//   - sort control    -> the [role="button"] with text in the search toolbar row
//                        ("Most Popular ..."); our controls sit beside it and
//                        clone its styling so everything matches.

let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let stateLoaded = false;
let sortEl = null; // Steam's "Most Popular" sort control (new UI)

const STAR_OPTIONS = [
    { stars: 0, label: 'Show All' },
    { stars: 5, label: '5 Stars' },
    { stars: 4, label: '4+ Stars' },
    { stars: 3, label: '3+ Stars' },
    { stars: 2, label: '2+ Stars' },
    { stars: 1, label: '1+ Stars' },
];

/* ------------------------------- Icons -------------------------------- */

const ICON = {
    star: '<svg class="swfp-glyph" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2.2l2.9 6 6.6.6-5 4.4 1.5 6.5L12 16.9 6 19.7l1.5-6.5-5-4.4 6.6-.6z"/></svg>',
    eye: '<svg class="swfp-glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M12 5C6.5 5 2.4 8.6 1 12c1.4 3.4 5.5 7 11 7s9.6-3.6 11-7c-1.4-3.4-5.5-7-11-7zm0 11.5A4.5 4.5 0 1112 7a4.5 4.5 0 010 9.5zM12 9a3 3 0 100 6 3 3 0 000-6z"/></svg>',
    eyeOff: '<svg class="swfp-glyph" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3.3 2L2 3.3l3.2 3.2A13.4 13.4 0 001 12c1.4 3.4 5.5 7 11 7 2.1 0 4-.5 5.7-1.3L20.7 22l1.3-1.3L3.3 2zm7.1 7.1l3.5 3.5A2.5 2.5 0 0110.4 9zM12 7c2.8 0 4.9 2.5 4.9 5 0 .6-.1 1.2-.3 1.7l2.2 2.2A13 13 0 0023 12c-1.4-3.4-5.5-7-11-7-1 0-1.9.1-2.8.3l1.9 1.9c.3-.1.6-.2.9-.2z"/></svg>',
    caret: '<svg class="swfp-caret" viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path fill="currentColor" d="M4 6l4 4 4-4z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
};

/* -------------------------- UI-agnostic helpers ----------------------- */

// New-UI item cards.
function getNewUiCards() {
    const cards = new Set();
    document.querySelectorAll('a[href*="/sharedfiles/filedetails/?id="] img').forEach(img => {
        const link = img.closest('a');
        const wrap = link && link.closest('[class*="aspectratio_"]');
        if (wrap && wrap.parentElement) cards.add(wrap.parentElement);
    });
    return Array.from(cards);
}

// Returns the list of workshop item elements on the page (new UI first, then
// the classic-UI selectors).
function getItemCards() {
    const newCards = getNewUiCards();
    if (newCards.length) return newCards;

    const selectors = ['.collectionItem', '.workshopItemCollection', '.workshopItem'];
    for (const selector of selectors) {
        const els = document.querySelectorAll(selector);
        if (els.length) return Array.from(els);
    }
    return [];
}

// Steam's sort dropdown ("Most Popular ...") in the new UI: the nearest
// [role="button"] with visible text in the toolbar row that holds the search
// box. We place our controls beside it and clone its class list for styling.
function findSortControl() {
    const search = document.querySelector('input[name="SearchInput"]');
    if (!search) return null;

    let node = search.closest('form') || search;
    for (let i = 0; i < 8 && node && node !== document.body; i++) {
        node = node.parentElement;
        if (!node) break;
        const candidates = Array.from(node.querySelectorAll('[role="button"]'))
            .filter(el => !el.closest('.swfp-controls') && el.textContent.trim().length > 0);
        if (candidates.length) {
            candidates.sort((a, b) => b.textContent.trim().length - a.textContent.trim().length);
            return candidates[0];
        }
    }
    return null;
}

function getStarRating(item) {
    // New UI: rating widget is filled + unfilled star SVGs.
    if (item.querySelector('svg.SVGIcon_Star_Filled, svg.SVGIcon_Star_Unfilled')) {
        return item.querySelectorAll('svg.SVGIcon_Star_Filled').length;
    }

    // Classic UI: rating encoded in the .fileRating image source.
    const ratingImg = item.querySelector('.fileRating');
    if (!ratingImg) return 0;
    const src = ratingImg.src || '';
    for (let n = 5; n >= 1; n--) {
        if (src.includes(n + '-star')) return n;
    }
    if (ratingImg.dataset.rating) return parseInt(ratingImg.dataset.rating, 10) || 0;
    return 0;
}

function isSubscribed(item) {
    // New UI: the green add button shows a check icon once subscribed.
    const addButton = item.querySelector('button[data-accent-color="green"]');
    if (addButton) return !!addButton.querySelector('svg.SVGIcon_Check');

    // Classic UI.
    const subscriptionIcon = item.querySelector('.user_action_history_icon.subscribed');
    if (subscriptionIcon && subscriptionIcon.style.display !== 'none') return true;

    const subscribeBtn = item.querySelector('.general_btn.subscribe');
    if (subscribeBtn && subscribeBtn.classList.contains('toggled')) return true;

    return false;
}

/* ------------------------------ Filtering ----------------------------- */

function applyFilters() {
    getItemCards().forEach(item => {
        const starRating = getStarRating(item);
        const passesStar = currentStarFilter === 0 || starRating >= currentStarFilter;
        const passesSub = !isHidingSubscribed || !isSubscribed(item);
        item.classList.toggle('hidden-item', !(passesStar && passesSub));
    });
}

/* ------------------------------- Controls ----------------------------- */

function starButtonLabel() {
    if (currentStarFilter === 0) return 'Star Rating';
    return currentStarFilter === 5 ? '5 Stars' : `${currentStarFilter}+ Stars`;
}

// Build a control element that mimics Steam's sort dropdown (div[role=button]
// with the same class list) so it inherits the native dull styling.
function makeControl(nativeClass, extraClass) {
    const el = document.createElement('div');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.className = ('swfp-btn ' + extraClass + ' ' + nativeClass).trim();
    return el;
}

function createControls() {
    if (document.querySelector('.swfp-controls')) return; // already injected

    sortEl = findSortControl();
    const nativeClass = sortEl ? sortEl.className : '';
    const isNewUi = !!sortEl;

    const group = document.createElement('div');
    group.className = 'swfp-controls' + (isNewUi ? ' swfp-native' : '');

    /* --- Star-rating dropdown --- */
    const dropdown = document.createElement('div');
    dropdown.className = 'swfp-dropdown';

    const starBtn = makeControl(nativeClass, 'swfp-star');

    const menu = document.createElement('div');
    menu.className = 'swfp-menu';
    STAR_OPTIONS.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'swfp-option';
        row.dataset.stars = String(opt.stars);
        const star = opt.stars
            ? '<span class="swfp-opt-star">★</span>'
            : '<span class="swfp-opt-star swfp-opt-star--empty"></span>';
        row.innerHTML =
            `<span class="swfp-check">${ICON.check}</span>${star}<span>${opt.label}</span>`;
        menu.appendChild(row);
    });

    /* --- Hide-subscribed toggle --- */
    const hideBtn = makeControl(nativeClass, 'swfp-hide');

    function renderStar() {
        const active = currentStarFilter > 0;
        starBtn.classList.toggle('swfp-active', active);
        starBtn.innerHTML =
            `${ICON.star}<span class="swfp-label">${starButtonLabel()}</span>${ICON.caret}`;
        menu.querySelectorAll('.swfp-option').forEach(o => {
            o.classList.toggle('swfp-selected', parseInt(o.dataset.stars, 10) === currentStarFilter);
        });
    }

    function renderHide() {
        hideBtn.classList.toggle('swfp-active', isHidingSubscribed);
        const icon = isHidingSubscribed ? ICON.eyeOff : ICON.eye;
        const text = isHidingSubscribed ? 'Showing New' : 'Hide Subscribed';
        hideBtn.innerHTML = `${icon}<span class="swfp-label">${text}</span>`;
    }

    function toggleMenu(e) {
        e.stopPropagation();
        dropdown.classList.toggle('swfp-open');
    }
    starBtn.addEventListener('click', toggleMenu);
    starBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') toggleMenu(e);
    });

    menu.addEventListener('click', e => {
        const option = e.target.closest('.swfp-option');
        if (!option) return;
        currentStarFilter = parseInt(option.dataset.stars, 10);
        chrome.storage.local.set({ starFilter: currentStarFilter });
        dropdown.classList.remove('swfp-open');
        renderStar();
        applyFilters();
    });

    document.addEventListener('click', () => dropdown.classList.remove('swfp-open'));

    function toggleHide() {
        isHidingSubscribed = !isHidingSubscribed;
        chrome.storage.local.set({ hideSubscribed: isHidingSubscribed });
        renderHide();
        applyFilters();
    }
    hideBtn.addEventListener('click', toggleHide);
    hideBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleHide(); }
    });

    renderStar();
    renderHide();

    dropdown.appendChild(starBtn);
    dropdown.appendChild(menu);
    group.appendChild(dropdown);
    group.appendChild(hideBtn);

    placeControls(group);
    sizeControls();
}

// Insert the control group next to Steam's sort dropdown (new UI), else the
// classic control bar, else float it.
function placeControls(group) {
    if (sortEl && sortEl.parentElement) {
        const host = sortEl.parentElement;
        // ensure the sort control and our group lay out on one row
        host.style.display = 'flex';
        host.style.alignItems = 'center';
        host.style.flexWrap = 'wrap';
        if (!host.style.gap) host.style.gap = '8px';
        host.insertBefore(group, sortEl);
        group.classList.add('swfp-inline');
        return;
    }

    const classicBar = document.querySelector(
        '.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls'
    );
    if (classicBar) {
        group.classList.add('swfp-inline');
        classicBar.appendChild(group);
        return;
    }

    if (getItemCards().length) {
        group.classList.add('swfp-floating');
        document.body.appendChild(group);
    }
}

// Size our controls (and Steam's sort dropdown) to one workshop-item width so
// the three read as a matching set.
function measureItemWidth() {
    const cards = getItemCards();
    if (!cards.length) return 0;
    const w = cards[0].getBoundingClientRect().width;
    return w > 40 ? Math.round(w) : 0;
}

function sizeControls() {
    const group = document.querySelector('.swfp-controls');
    if (!group || !group.classList.contains('swfp-native')) return;

    const w = measureItemWidth();
    if (w) group.style.setProperty('--swfp-w', w + 'px');

    if (!sortEl || !sortEl.isConnected) sortEl = findSortControl();
    if (sortEl && w) {
        sortEl.style.boxSizing = 'border-box';
        sortEl.style.width = w + 'px';
        sortEl.style.minWidth = w + 'px';
        sortEl.style.justifyContent = 'space-between';
    }
}

/* ------------------------------- Lifecycle ---------------------------- */

function tick() {
    if (!stateLoaded) return;
    createControls();
    sizeControls();
    if (isHidingSubscribed || currentStarFilter > 0) applyFilters();
}

function start() {
    chrome.storage.local.get(['hideSubscribed', 'starFilter'], data => {
        isHidingSubscribed = !!data.hideSubscribed;
        currentStarFilter = data.starFilter || 0;
        stateLoaded = true;
        tick();
    });
}

// The new UI re-renders constantly; throttle so we react to added content
// without re-running on every mutation.
let scheduled = false;
const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        tick();
    }, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('resize', () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        sizeControls();
    }, 150);
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
