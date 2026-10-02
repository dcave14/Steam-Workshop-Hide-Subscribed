// collection-row-align.js
// Round-4 two-row layout support for classic Steam collection pages.
//
// Single responsibility: mirror the native 3-button row geometry
// (div.subscribeCollection) onto the injected .wshs-collection-controls
// wrapper as CSS custom properties:
//   --wshs-row-w  = btn3.right - btn1.left  (row 2 width == row 1 width)
//   --wshs-seam-w = btn2 midpoint - btn1.left - CHIP_GAP / 2
//                 (the 5px chip gap is centred on btn2's midpoint)
// styles.css turns the wrapper into a grid with
// grid-template-columns: var(--wshs-seam-w) 1fr and column-gap 5px.
//
// Self-contained: content.js does not import or call this file. A
// MutationObserver picks up the wrapper whenever content.js injects it, so
// load order does not matter. If measurement fails, or the 3 native buttons
// are not on one flex line, the class is dropped and the wrapper falls back
// to its natural shrink-to-fit width. The aligned width is bounded by the
// bar's content box, so the bar can never overhang its container.

(function () {
    'use strict';

    var CHIP_GAP = 5;
    var ALIGN_CLASS = 'wshs-row-aligned';

    var wrapper = null;
    var bar = null;
    var barObserver = null;

    function reset() {
        if (!wrapper) return;
        wrapper.classList.remove(ALIGN_CLASS);
        wrapper.style.removeProperty('--wshs-row-w');
        wrapper.style.removeProperty('--wshs-seam-w');
    }

    function measure() {
        if (!wrapper || !bar || !wrapper.isConnected || !bar.isConnected) {
            reset();
            return;
        }

        var natives = bar.querySelectorAll(':scope > .general_btn');
        if (natives.length < 3) {
            reset();
            return;
        }

        var first = natives[0].getBoundingClientRect();
        var mid = natives[1].getBoundingClientRect();
        var last = natives[2].getBoundingClientRect();
        if (first.width <= 0 || mid.width <= 0 || last.width <= 0) {
            reset();
            return;
        }

        // All 3 natives must share one flex line (top deltas <= 1px).
        if (Math.max(first.top, mid.top, last.top) - Math.min(first.top, mid.top, last.top) > 1) {
            reset();
            return;
        }

        var rowW = last.right - first.left;
        var seamW = (mid.left + mid.right) / 2 - first.left - CHIP_GAP / 2;
        if (!(rowW > 0) || !(seamW > 0) || !(seamW < rowW - CHIP_GAP)) {
            reset();
            return;
        }

        // Never let the aligned row reach past the bar's content box.
        var barRect = bar.getBoundingClientRect();
        var barStyle = window.getComputedStyle(bar);
        var contentLeft = barRect.left + (parseFloat(barStyle.paddingLeft) || 0);
        var contentRight = barRect.right - (parseFloat(barStyle.paddingRight) || 0);
        if (first.left < contentLeft - 1 || first.left + rowW > contentRight + 1) {
            reset();
            return;
        }

        wrapper.style.setProperty('--wshs-row-w', rowW + 'px');
        wrapper.style.setProperty('--wshs-seam-w', seamW + 'px');
        wrapper.classList.add(ALIGN_CLASS);
    }

    function detach() {
        if (barObserver) {
            barObserver.disconnect();
            barObserver = null;
        }
        wrapper = null;
        bar = null;
    }

    function attach(nextWrapper, nextBar) {
        if (wrapper && wrapper !== nextWrapper) reset();
        detach();
        wrapper = nextWrapper;
        bar = nextBar;
        if (typeof ResizeObserver === 'function') {
            barObserver = new ResizeObserver(measure);
            barObserver.observe(bar);
        }
        measure();
    }

    function sync() {
        var nextWrapper = document.querySelector('.wshs-collection-controls');
        if (!nextWrapper) {
            detach();
            return;
        }
        var nextBar = nextWrapper.closest('.subscribeCollection');
        if (!nextBar) {
            detach();
            return;
        }
        if (nextWrapper !== wrapper || nextBar !== bar) {
            attach(nextWrapper, nextBar);
        } else {
            measure();
        }
    }

    if (typeof MutationObserver === 'function') {
        new MutationObserver(sync).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }
    window.addEventListener('resize', measure);
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(measure).catch(function () {});
    }
    sync();
})();
