// collection-row-align.js
// Round-6 two-row layout support for classic Steam collection pages.
//
// Single responsibility: mirror the native 3-button row geometry
// (div.subscribeCollection) onto the injected .wshs-collection-controls
// wrapper as CSS custom properties:
//   --wshs-row-w  = row-end landmark right - btn1.left
//   --wshs-seam-w = stretched btn2 midpoint - btn1.left - CHIP_GAP / 2
//                 (the 5px chip gap is centred on btn2's midpoint)
// The row-end landmark is the right edge of the rightmost VISIBLE green
// per-row subscribe button (div.collectionItem a.general_btn.subscribe) - the
// vertical line above the per-row buttons. Filtered rows carry .hidden-item
// (display:none) and are skipped; every visible row shares the same right
// edge. With no visible green button the bar's content right edge is used.
// The target is clamped to the bar's border-box right edge and the
// container's content right edge: the row may consume the bar's right padding
// to reach the line, but the page never overflows.
//
// Row 1: the 3 native .general_btn are stretched to fill the same
// --wshs-row-w. Each button gets width = natural width + extra *
// (natural width / total natural width), so the relative rhythm is preserved
// and the 5px gaps are untouched. Only inline style.width is set; onclick,
// href, class, id and text are never touched, and scoped CSS supplies
// box-sizing: border-box / flex-shrink: 0 (styles.css). The seam width is
// computed from the stretched btn2 width, so it stays on the live midpoint.
// styles.css turns the wrapper into a grid with
// grid-template-columns: var(--wshs-seam-w) 1fr and column-gap 5px.
//
// Self-contained: content.js does not import or call this file. A
// MutationObserver picks up the wrapper whenever content.js injects it, so
// load order does not matter. If measurement fails, or the 3 native buttons
// are not on one flex line, the inline widths are cleared, the class is
// dropped and both rows fall back to their natural layout. The aligned width
// is bounded by the bar's border box, so the bar can never overhang its
// container.

(function () {
    'use strict';

    var CHIP_GAP = 5;
    var ALIGN_CLASS = 'wshs-row-aligned';

    var wrapper = null;
    var bar = null;
    var barObserver = null;
    var stretchedNatives = [];

    // Row 1 stretches via inline style.width only; clearing it restores
    // Steam's natural button layout.
    function clearNativeWidths() {
        for (var i = 0; i < stretchedNatives.length; i++) {
            stretchedNatives[i].style.removeProperty('width');
        }
        stretchedNatives = [];
    }

    function reset() {
        clearNativeWidths();
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

        // Natural geometry first: drop widths from a previous pass so the
        // measurement below is always pre-stretch.
        clearNativeWidths();

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

        var barRect = bar.getBoundingClientRect();
        var barStyle = window.getComputedStyle(bar);
        var contentLeft = barRect.left + (parseFloat(barStyle.paddingLeft) || 0);
        var contentRight = barRect.right - (parseFloat(barStyle.paddingRight) || 0);
        if (first.left < contentLeft - 1) {
            reset();
            return;
        }

        // Row-end landmark: right edge of the rightmost visible green per-row
        // subscribe button (the vertical line above the row buttons). Filtered
        // rows carry .hidden-item (display:none) and measure 0x0, so they are
        // skipped; all visible rows share the same right edge.
        var targetRight = null;
        var greens = document.querySelectorAll('.collectionItem a.general_btn.subscribe');
        for (var i = 0; i < greens.length; i++) {
            var greenRect = greens[i].getBoundingClientRect();
            if (greenRect.width <= 0 || greenRect.height <= 0) continue;
            if (targetRight === null || greenRect.right > targetRight) {
                targetRight = greenRect.right;
            }
        }
        if (targetRight === null) targetRight = contentRight;

        // Clamp: never past the bar's border-box right edge or the
        // container's content right edge. The row may use the bar's right
        // padding to reach the line, but the page must not overflow.
        var maxRight = barRect.right;
        var container = bar.parentElement;
        if (container) {
            var containerStyle = window.getComputedStyle(container);
            var containerRight = container.getBoundingClientRect().right -
                (parseFloat(containerStyle.paddingRight) || 0);
            if (containerRight < maxRight) maxRight = containerRight;
        }
        if (targetRight > maxRight) targetRight = maxRight;

        var rowW = targetRight - first.left;
        var gap1 = mid.left - first.right;
        var gap2 = last.left - mid.right;
        var naturalW = first.width + mid.width + last.width;
        if (!(rowW > 0) || !(naturalW > 0) || !(rowW - gap1 - gap2 > 0)) {
            reset();
            return;
        }

        // Row 1: distribute the extra width proportionally to the natural
        // widths (relative rhythm preserved, the 5px gaps untouched).
        var spanW = rowW - gap1 - gap2;
        var extra = spanW - naturalW;
        var w0 = first.width + extra * (first.width / naturalW);
        var w1 = mid.width + extra * (mid.width / naturalW);
        var w2 = last.width + extra * (last.width / naturalW);
        if (!(w0 > 0) || !(w1 > 0) || !(w2 > 0)) {
            reset();
            return;
        }

        // Seam = stretched btn2 midpoint: stretched btn1 width + gap +
        // half the stretched btn2, less half the 5px chip gap.
        var seamW = w0 + gap1 + w1 / 2 - CHIP_GAP / 2;
        if (!(seamW > 0) || !(seamW < rowW - CHIP_GAP)) {
            reset();
            return;
        }

        natives[0].style.width = w0 + 'px';
        natives[1].style.width = w1 + 'px';
        natives[2].style.width = w2 + 'px';
        stretchedNatives = [natives[0], natives[1], natives[2]];

        wrapper.style.setProperty('--wshs-row-w', rowW + 'px');
        wrapper.style.setProperty('--wshs-seam-w', seamW + 'px');
        wrapper.classList.add(ALIGN_CLASS);
    }

    function detach() {
        if (barObserver) {
            barObserver.disconnect();
            barObserver = null;
        }
        clearNativeWidths();
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
