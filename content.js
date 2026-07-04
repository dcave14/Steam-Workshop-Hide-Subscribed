// content.js
// Supports both the classic Steam Workshop UI and the new (beta) redesigned UI,
// on browse pages AND collection pages.
//
// The new UI is a React app whose layout class names are hashed and change every
// build, so detection anchors only on stable, semantic signals:
//   - item cards      -> <img> inside an a[href*="/sharedfiles/filedetails/?id="]
//                        wrapped in an .aspectratio_* container
//   - star rating     -> count of svg.SVGIcon_Star_Filled
//   - subscribed?     -> the green add button shows svg.SVGIcon_Check (vs Plus)
//   - sort control    -> the [role="button"] with text in the search toolbar row
//                        ("Most Popular ..."); our controls sit beside it, clone
//                        its styling, and are sized to match it.
//
// Classic UI (still used by collection pages and non-beta accounts) uses stable
// class names: .collectionItem / .workshopItem, .fileRating, .general_btn.subscribe.

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
// the classic-UI selectors used by browse and collection pages).
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

    // Classic UI: rating encoded in the .fileRating image source (e.g. 5-star.png).
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

    // Classic UI (browse + collections): a toggled subscribe button.
    const subscribeBtn = item.querySelector('.general_btn.subscribe');
    if (subscribeBtn && subscribeBtn.classList.contains('toggled')) return true;

    const subscriptionIcon = item.querySelector('.user_action_history_icon.subscribed');
    if (subscriptionIcon && subscriptionIcon.style.display !== 'none') return true;

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

// Where to inject the controls, and which existing control to clone styling from.
function getPlacement() {
    // New UI browse: beside the "Most Popular" sort dropdown.
    const sort = findSortControl();
    if (sort && sort.parentElement) {
        return { mode: 'new', host: sort.parentElement, before: sort, refClass: sort.className, ref: sort };
    }
    // Classic collection: on its own line right below the "Subscribe to all" row
    // (below the description) so it doesn't squeeze Steam's buttons.
    const sc = document.querySelector('.subscribeCollection');
    if (sc && sc.parentElement) {
        return { mode: 'classic', host: sc.parentElement, before: sc.nextSibling, refClass: 'general_btn' };
    }
    // Classic browse.
    const bar = document.querySelector(
        '.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls'
    );
    if (bar) {
        return { mode: 'classic', host: bar, before: null, refClass: 'general_btn' };
    }
    // Fallback: float, but only if there is content to filter.
    if (getItemCards().length) {
        return { mode: 'float', host: document.body, before: null, refClass: '' };
    }
    return null;
}

// Build a control element that inherits native styling by cloning the reference
// class list (Steam's sort dropdown on the new UI, .general_btn on classic).
function makeControl(refClass, extraClass) {
    const el = document.createElement('div');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.className = ('swfp-btn ' + extraClass + ' ' + refClass).trim();
    return el;
}

function createControls() {
    if (document.querySelector('.swfp-controls')) return; // already injected

    const place = getPlacement();
    if (!place) return;

    sortEl = place.mode === 'new' ? place.ref : null;

    const modeClass =
        place.mode === 'new' ? ' swfp-native' :
        place.mode === 'classic' ? ' swfp-classic' :
        ' swfp-floating';
    const group = document.createElement('div');
    group.className = 'swfp-controls' + modeClass;

    /* --- Hide-subscribed toggle (first) --- */
    const hideBtn = makeControl(place.refClass, 'swfp-hide');

    /* --- Star-rating dropdown (center) --- */
    const dropdown = document.createElement('div');
    dropdown.className = 'swfp-dropdown';
    const starBtn = makeControl(place.refClass, 'swfp-star');

    const menu = document.createElement('div');
    menu.className = 'swfp-menu';
    menu.innerHTML = '<div class="swfp-menu-head">Star Rating</div>';
    STAR_OPTIONS.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'swfp-option';
        row.dataset.stars = String(opt.stars);
        row.innerHTML = `<span class="swfp-radio"></span><span class="swfp-opt-label">${opt.label}</span>`;
        menu.appendChild(row);
    });

    function renderStar() {
        starBtn.classList.toggle('swfp-active', currentStarFilter > 0);
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
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMenu(e); }
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

    renderHide();
    renderStar();

    dropdown.appendChild(starBtn);
    dropdown.appendChild(menu);
    group.appendChild(hideBtn);   // Hide first
    group.appendChild(dropdown);  // Star in the center (sort dropdown follows)

    // Insert.
    if (place.mode === 'new') {
        place.host.style.display = 'flex';
        place.host.style.alignItems = 'center';
        place.host.style.flexWrap = 'wrap';
        if (!place.host.style.gap) place.host.style.gap = '8px';
    }
    if (place.mode === 'float') {
        document.body.appendChild(group);
    } else if (place.before) {
        place.host.insertBefore(group, place.before);
    } else {
        place.host.appendChild(group);
    }

    sizeControls();
}

// New UI only: size our two controls to match Steam's sort dropdown exactly so
// all three read as a uniform set. getBoundingClientRect() forces layout, so
// this is only called when the size is not yet locked or the sort control was
// replaced by a re-render (see tick) — never on every mutation.
function sizeControls() {
    const group = document.querySelector('.swfp-controls.swfp-native');
    if (!group) return;
    if (!sortEl || !sortEl.isConnected) sortEl = findSortControl();
    if (!sortEl) return;
    const r = sortEl.getBoundingClientRect();
    if (r.width > 40) {
        group.style.setProperty('--swfp-w', Math.round(r.width) + 'px');
        group.style.setProperty('--swfp-h', Math.round(r.height) + 'px');
        group.dataset.sized = '1';
    }
}

/* ------------------------------- Lifecycle ---------------------------- */

function tick() {
    if (!stateLoaded) return;
    createControls();
    // Measure only when the size isn't locked yet, or Steam replaced the sort
    // control (React re-render) — avoids a layout reflow on every mutation.
    const group = document.querySelector('.swfp-controls.swfp-native');
    if (group && (!group.dataset.sized || (sortEl && !sortEl.isConnected))) {
        sizeControls();
    }
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
function schedule(fn) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; fn(); }, 150);
}
const observer = new MutationObserver(() => schedule(tick));
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('resize', () => schedule(sizeControls));

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
