// content.js
// Supports both the classic Steam Workshop UI and the new (beta) redesigned UI.
// The new UI is a React app whose layout class names are hashed and change every
// build, so detection anchors only on stable, semantic signals:
//   - item cards      -> <img> inside an a[href*="/sharedfiles/filedetails/?id="]
//                        wrapped in an .aspectratio_* container
//   - star rating     -> count of svg.SVGIcon_Star_Filled
//   - subscribed?     -> the green add button shows svg.SVGIcon_Check (vs Plus)
//   - toolbar anchor  -> input[name="SearchInput"]

let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all
let stateLoaded = false;

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

// Class list Steam uses on its own toolbar buttons; cloning it lets our
// injected controls inherit the native new-UI styling. '' on the old UI.
function getNativeButtonClass() {
    const ref = document.querySelector('button[data-accent-color]');
    return ref ? ref.className : '';
}

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

function createControls() {
    if (document.querySelector('.swfp-controls')) return; // already injected

    const nativeClass = getNativeButtonClass();
    const isNewUi = !!nativeClass;

    const group = document.createElement('div');
    group.className = 'swfp-controls' + (isNewUi ? ' swfp-native' : '');

    /* --- Star-rating dropdown --- */
    const dropdown = document.createElement('div');
    dropdown.className = 'swfp-dropdown';

    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'swfp-btn ' + nativeClass;
    starBtn.style.setProperty('--min-width', 'fit-content');
    starBtn.innerHTML =
        `<span class="swfp-btn-inner">${ICON.star}<span class="swfp-label"></span>${ICON.caret}</span>`;

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
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'swfp-btn ' + nativeClass;
    hideBtn.style.setProperty('--min-width', 'fit-content');

    function renderStar() {
        starBtn.querySelector('.swfp-label').textContent = starButtonLabel();
        starBtn.setAttribute('data-accent-color', currentStarFilter ? 'blue' : 'dull');
        menu.querySelectorAll('.swfp-option').forEach(o => {
            o.classList.toggle('swfp-selected', parseInt(o.dataset.stars, 10) === currentStarFilter);
        });
    }

    function renderHide() {
        hideBtn.setAttribute('data-accent-color', isHidingSubscribed ? 'blue' : 'dull');
        hideBtn.classList.toggle('swfp-active', isHidingSubscribed);
        const icon = isHidingSubscribed ? ICON.eyeOff : ICON.eye;
        const text = isHidingSubscribed ? 'Showing New' : 'Hide Subscribed';
        hideBtn.innerHTML = `<span class="swfp-btn-inner">${icon}<span class="swfp-label">${text}</span></span>`;
    }

    starBtn.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.toggle('swfp-open');
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

    hideBtn.addEventListener('click', () => {
        isHidingSubscribed = !isHidingSubscribed;
        chrome.storage.local.set({ hideSubscribed: isHidingSubscribed });
        renderHide();
        applyFilters();
    });

    renderStar();
    renderHide();

    dropdown.appendChild(starBtn);
    dropdown.appendChild(menu);
    group.appendChild(dropdown);
    group.appendChild(hideBtn);

    placeControls(group);
}

// Insert the control group next to Steam's search/sort bar (new UI) or the
// classic control bar, falling back to a floating panel.
function placeControls(group) {
    const search = document.querySelector('input[name="SearchInput"]');
    if (search) {
        const form = search.closest('form');
        const host = form ? form.parentElement : search.parentElement;
        if (host) {
            group.classList.add('swfp-inline');
            host.appendChild(group);
            return;
        }
    }

    const classicBar = document.querySelector(
        '.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls'
    );
    if (classicBar) {
        group.classList.add('swfp-inline');
        classicBar.appendChild(group);
        return;
    }

    // Last resort: only float a panel if there is actually content to filter.
    if (getItemCards().length) {
        group.classList.add('swfp-floating');
        document.body.appendChild(group);
    }
}

/* ------------------------------- Lifecycle ---------------------------- */

function tick() {
    if (!stateLoaded) return;
    createControls();
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
