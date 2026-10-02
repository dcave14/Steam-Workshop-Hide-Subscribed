// collection-row-align.js
// Round-6 two-row layout support for classic Steam collection pages.
//
// Single responsibility: mirror the native 3-button row geometry
// (div.subscribeCollection) onto the injected .wshs-collection-controls
// wrapper as CSS custom properties:
//   --wshs-row-w  = row-end landmark right - btn1.left
//   --wshs-seam-w = stretched btn2 midpoint - btn1.left - CHIP_GAP / 2
//                 (the 5px chip gap is centred on btn2's midpoint)
// The row end mirrors the row start: the gap between the bar's left edge and
// native button 1 is repeated before the bar's right edge, so the margins are
// equal on both sides. The target is clamped to the bar's border-box right edge and the
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
            stretchedNatives[i].style.removeProperty('margin-right');
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

        // Row end mirrors the row start: the space between the bar's left
        // edge and native button 1 is repeated on the right, so both rows sit
        // centred in the bar with equal margins.
        // Steam gives every native button margin-right: 5px, including the
        // last one; that trailing margin is dropped below so the stretched
        // row can reach this edge without wrapping.
        var targetRight = barRect.right - (first.left - barRect.left);
        if (!(targetRight > first.left) || targetRight > contentRight) targetRight = contentRight;

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
        natives[2].style.marginRight = '0';
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

    // One sync per animation frame: measure() forces layout and rewrites the
    // native widths, so running it on every parser chunk of a large
    // collection page thrashed layout while the page was still loading.
    var syncFrame = null;
    function scheduleSync() {
        if (syncFrame !== null) return;
        syncFrame = requestAnimationFrame(function () {
            syncFrame = null;
            sync();
        });
    }

    if (typeof MutationObserver === 'function') {
        new MutationObserver(scheduleSync).observe(document.documentElement, {
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
