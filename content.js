// content.js
let isHidingSubscribed = false;
let currentStarFilter = 0; // 0 means show all

function createButtons() {
    const controlArea = document.querySelector('.workshop_browse_menu_area, .workshop_browse_options, .collectionControls>.workshopItemControls');
    if (!controlArea || document.querySelector('.hide-subscribed-button')) return;

    // Create star filter dropdown button
    const starFilterContainer = document.createElement('div');
    starFilterContainer.style.display = 'inline-block';
    starFilterContainer.style.position = 'relative';
    
    const starButton = document.createElement('button');
    starButton.className = 'hide-subscribed-button star-filter-button';
    starButton.textContent = 'Star Rating ▼';
    
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

    // Create hide subscribed button
    const hideButton = document.createElement('button');
    hideButton.className = 'hide-subscribed-button';
    hideButton.textContent = 'Hide Subscribed';
    hideButton.addEventListener('click', toggleSubscribedItems);

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
            starButton.textContent = `${currentStarFilter === 0 ? 'Star Rating ▼' : currentStarFilter + '+ Stars ▼'}`;
            dropdownContent.classList.remove('show');
            
            // Save star filter preference
            chrome.storage.local.set({ starFilter: currentStarFilter });
            
            applyFilters();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdownContent.classList.remove('show');
    });

    // Load saved states
    chrome.storage.local.get(['hideSubscribed', 'starFilter'], (data) => {
        // Load hide subscribed state
        if (data.hideSubscribed) {
            isHidingSubscribed = true;
            hideButton.classList.add('active');
            hideButton.textContent = 'Showing New Items';
        }

        // Load star filter state
        if (data.starFilter) {
            currentStarFilter = data.starFilter;
            starButton.textContent = `${currentStarFilter === 0 ? 'Star Rating ▼' : currentStarFilter + '+ Stars ▼'}`;
        }

        // Apply both filters if either is active
        if (data.hideSubscribed || data.starFilter > 0) {
            applyFilters();
        }
    });

    starFilterContainer.appendChild(starButton);
    starFilterContainer.appendChild(dropdownContent);
    controlArea.appendChild(starFilterContainer);
    controlArea.appendChild(hideButton);
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
    
    if (isHidingSubscribed) {
        button.classList.add('active');
        button.textContent = 'Showing New Items';
    } else {
        button.classList.remove('active');
        button.textContent = 'Hide Subscribed';
    }
    
    applyFilters();
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
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFilters);
    } else {
        loadFilters();
    }
}

// Set up mutation observer to handle dynamically loaded content
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            applyFiltersIfNeeded();
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

init();