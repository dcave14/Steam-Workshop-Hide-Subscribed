// Add to the top of content.js
let isHidingSubscribed = false;

function createHideButton() {
    const controlArea = document.querySelector('.workshop_browse_menu_area, .workshop_browse_options');
    if (!controlArea || document.querySelector('.hide-subscribed-button')) return;

    const button = document.createElement('button');
    button.className = 'hide-subscribed-button';
    button.textContent = 'Hide Subscribed';
    button.addEventListener('click', toggleSubscribedItems);

    // Load saved state
    chrome.storage.local.get('hideSubscribed', (data) => {
        if (data.hideSubscribed) {
            isHidingSubscribed = true;
            button.classList.add('active');
            button.textContent = 'Showing New Items';
            // Hide items immediately
            hideSubscribedItems(true);
        }
    });

    controlArea.appendChild(button);
}


function hideSubscribedItems(shouldHide) {
    const items = document.querySelectorAll('.workshopItem');
    items.forEach(item => {
        if (isSubscribed(item)) {
            item.classList.toggle('hidden-item', shouldHide);
        }
    });
}

function isSubscribed(item) {
    // Debug check - log what we find
    console.log('Checking item:', item);

    // Look specifically for the visible subscription indicator
    const subscriptionIcon = item.querySelector('.user_action_history_icon.subscribed');
    if (subscriptionIcon && subscriptionIcon.style.display !== 'none') {
        console.log('Found by subscription icon');
        return true;
    }

    // Check for toggled subscribe button (make sure it's actually toggled)
    const subscribeBtn = item.querySelector('.general_btn.subscribe');
    if (subscribeBtn && subscribeBtn.classList.contains('toggled')) {
        console.log('Found by toggled button');
        return true;
    }

    return false;
}
function toggleSubscribedItems() {
    const button = document.querySelector('.hide-subscribed-button');
    isHidingSubscribed = !isHidingSubscribed; // Toggle the state
    
    // Save state
    chrome.storage.local.set({ hideSubscribed: isHidingSubscribed });
    
    // Update button appearance
    if (isHidingSubscribed) {
        button.classList.add('active');
        button.textContent = 'Showing New Items';
    } else {
        button.classList.remove('active');
        button.textContent = 'Hide Subscribed';
    }
    
    // Hide/show items
    hideSubscribedItems(isHidingSubscribed);
}

// Initialize when the page loads
function init() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            chrome.storage.local.get('hideSubscribed', (data) => {
                isHidingSubscribed = data.hideSubscribed || false;
                createHideButton();
                if (isHidingSubscribed) {
                    hideSubscribedItems(true);
                }
            });
        });
    } else {
        chrome.storage.local.get('hideSubscribed', (data) => {
            isHidingSubscribed = data.hideSubscribed || false;
            createHideButton();
            if (isHidingSubscribed) {
                hideSubscribedItems(true);
            }
        });
    }
}

// Handle dynamic content loading (for infinite scroll and sorting)
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            createHideButton();
            if (isHidingSubscribed) {
                hideSubscribedItems(true);
            }
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

init();