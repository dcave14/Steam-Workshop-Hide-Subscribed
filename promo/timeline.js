// timeline.js
// Every animated property is a pure function of time, so renderAt(t) draws an
// exact frame for the offline renderer and the live preview alike.

(function () {
    const DURATION = 40;

    // ---------- math ----------

    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, p) => a + (b - a) * p;
    const prog = (t, a, b) => clamp((t - a) / (b - a));
    const bump = p => Math.sin(Math.PI * clamp(p));
    const E = {
        inOut: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
        out: p => 1 - Math.pow(1 - p, 3),
        outQuint: p => 1 - Math.pow(1 - p, 5),
        outBack: p => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
        inOutQuint: p => (p < 0.5 ? 16 * p * p * p * p * p : 1 - Math.pow(-2 * p + 2, 5) / 2)
    };

    function mix(a, b, p) {
        if (Array.isArray(a)) return a.map((v, i) => lerp(v, b[i], p));
        return lerp(a, b, p);
    }

    // keys: [[time, value, ease?], ...]; ease on a key shapes the segment that ends there.
    function track(keys, t) {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 0; i < keys.length - 1; i++) {
            const [t0, v0] = keys[i];
            const [t1, v1, ease] = keys[i + 1];
            if (t < t1) return mix(v0, v1, (ease || E.inOut)(prog(t, t0, t1)));
        }
        return keys[keys.length - 1][1];
    }

    // ---------- schedule (seconds) ----------

    const T = {
        introOut: 3.55,
        browserIn: 3.9,
        rwShown: 4.3,
        pulse: 6.0,
        rwClick: 9.6,
        rwFilter: 9.8,
        pzTab: 14.3,
        pzOpen: 16.35,
        pzPick: 17.95,
        pzFilter: 18.15,
        csTab: 22.2,
        csRings: 23.9,
        csScroll: 26.3,
        csLoad: 27.0,
        csReveal: 27.85,
        csFilter: 28.7,
        browserOut: 30.2,
        outro: 30.9,
        end: DURATION
    };

    const HEADLINES = [
        { a: 5.2, b: 8.45, n: '', eyebrow: 'The problem', text: 'The front page is full of mods you already have.' },
        { a: 8.65, b: 14.2, n: '01', eyebrow: 'Hide subscribed', text: 'One click hides everything you subscribe to.' },
        { a: 14.55, b: 22.15, n: '02', eyebrow: 'Star rating', text: 'Set a minimum rating. Skip the rest.' },
        { a: 22.45, b: 26.0, n: '03', eyebrow: 'Remembers your settings', text: 'Your filters follow you to every Workshop.' },
        { a: 26.15, b: 30.25, n: '04', eyebrow: 'Infinite scroll', text: 'New results get filtered as they load.' }
    ];

    // ---------- build ----------

    const S = window.buildScene();
    const stage = document.getElementById('stage');
    const cam = document.getElementById('cam');
    const cursor = document.getElementById('cursor');
    const cursorArrow = cursor.querySelector('svg');
    const ripple = cursor.querySelector('.ripple');
    const intro = document.getElementById('intro');
    const outro = document.getElementById('outro');
    const scrim = document.getElementById('scrim');
    const fade = document.getElementById('fade');
    const glowA = document.querySelector('.glow-a');
    const glowB = document.querySelector('.glow-b');
    const [pRW, pPZ, pCS] = S.pages;

    let stageScale = 1;
    function fit() {
        const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        stageScale = k;
        stage.style.transform = `translate(${(window.innerWidth - 1920 * k) / 2}px, ${(window.innerHeight - 1080 * k) / 2}px) scale(${k})`;
    }
    fit();
    window.addEventListener('resize', fit);

    // Intro title letters.
    const introTitle = intro.querySelector('.intro-title');
    const letters = [...'Steam Workshop Filter Plus'].map(ch => {
        const s = document.createElement('span');
        s.className = 'word';
        s.textContent = ch;
        introTitle.appendChild(s);
        return s;
    });
    const logoWrap = intro.querySelector('.logo-wrap');
    const logoRing = intro.querySelector('.logo-ring');
    const introTag = intro.querySelector('.intro-tag');
    const chips = [...intro.querySelectorAll('.chip')];

    const outroHead = outro.querySelector('.outro-head');
    const features = [...outro.querySelectorAll('.feature')];
    const ctaRow = outro.querySelector('.cta-row');
    const cta = outro.querySelector('.cta');

    // Headlines, split into words for the staggered entrance.
    const headRoot = document.getElementById('headlines');
    const heads = HEADLINES.map(h => {
        const box = document.createElement('div');
        box.className = 'headline';
        const eb = document.createElement('div');
        eb.className = 'eyebrow';
        eb.innerHTML = (h.n ? `<span class="num">${h.n}</span>` : '') + h.eyebrow;
        const h2 = document.createElement('h2');
        const words = h.text.split(' ').map((w, i, all) => {
            const s = document.createElement('span');
            s.className = 'word';
            s.textContent = w + (i < all.length - 1 ? ' ' : '');
            h2.appendChild(s);
            return s;
        });
        box.append(eb, h2);
        headRoot.appendChild(box);
        return Object.assign({ box, eb, words }, h);
    });

    // ---------- grid choreography ----------

    const COLS = 4;
    const PITCH_X = 272;
    const PITCH_Y = 238;
    const slotXY = i => [(i % COLS) * PITCH_X, Math.floor(i / COLS) * PITCH_Y];

    const keepSub = c => !c.sub;
    const keepStars = c => c.stars >= 4;
    const EVENTS = new Map([
        [pRW, { shown: T.rwShown, list: [{ at: -1, keep: () => true }, { at: T.rwFilter, keep: keepSub }] }],
        [pPZ, { shown: T.pzTab, list: [{ at: -1, keep: () => true }, { at: T.pzFilter, keep: keepStars }] }],
        [pCS, {
            shown: T.csTab,
            list: [
                { at: -1, keep: c => !c.batch },
                { at: T.csLoad, keep: () => true },
                { at: T.csFilter, keep: c => keepSub(c) && keepStars(c) }
            ]
        }]
    ]);

    // Each event's visible set, as card -> slot index.
    EVENTS.forEach((ev, page) => {
        ev.slots = ev.list.map(e => {
            const m = new Map();
            page.cards.filter(c => e.keep(c.data)).forEach((c, i) => m.set(c, i));
            return m;
        });
    });

    function renderCards(page, t) {
        const ev = EVENTS.get(page);
        let k = 0;
        while (k + 1 < ev.list.length && t >= ev.list[k + 1].at) k++;
        const local = t - ev.list[k].at;
        const cur = ev.slots[k];
        const prev = k > 0 ? ev.slots[k - 1] : null;

        page.cards.forEach(c => {
            const inCur = cur.has(c);
            const inPrev = prev ? prev.has(c) : false;
            let x = 0, y = 0, opacity = 1, scale = 1, sat = 1;

            if (k === 0) {
                if (!inCur) { c.el.style.display = 'none'; return; }
                const slot = cur.get(c);
                [x, y] = slotXY(slot);
                const a = ev.shown + 0.15 + slot * 0.04;
                const p = E.out(prog(t, a, a + 0.55));
                opacity = p;
                y += (1 - p) * 24;
            } else if (inPrev && inCur) {
                const from = slotXY(prev.get(c));
                const to = slotXY(cur.get(c));
                const d = cur.get(c) * 0.03;
                const p = E.inOut(prog(local, 0.35 + d, 1.1 + d));
                x = lerp(from[0], to[0], p);
                y = lerp(from[1], to[1], p);
            } else if (inPrev && !inCur) {
                [x, y] = slotXY(prev.get(c));
                const p = prog(local, 0, 0.42);
                if (p >= 1) { c.el.style.display = 'none'; return; }
                opacity = 1 - E.out(p);
                scale = 1 - 0.1 * E.out(p);
                sat = 1 - p;
            } else if (!inPrev && inCur) {
                [x, y] = slotXY(cur.get(c));
                const p = E.out(prog(local, cur.get(c) % COLS * 0.05, cur.get(c) % COLS * 0.05 + 0.4));
                opacity = p;
                y += (1 - p) * 18;
            } else {
                c.el.style.display = 'none';
                return;
            }

            c.el.style.display = 'block';
            c.el.style.opacity = opacity.toFixed(4);
            c.el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
            c.el.style.filter = sat < 1 ? `saturate(${sat.toFixed(3)})` : '';

            if (c.skeleton) {
                const reveal = E.out(prog(t, T.csReveal, T.csReveal + 0.35));
                c.skeleton.style.opacity = (1 - reveal).toFixed(4);
                c.content.style.opacity = reveal.toFixed(4);
                c.sheen.style.transform = `translateX(${(-120 + ((t * 1.4) % 1) * 500).toFixed(1)}px)`;
            }
        });
    }

    // Subscribed badges pulse during the problem beat and stay outlined
    // until the filter removes them.
    function renderBadges(t) {
        let j = 0;
        pRW.cards.forEach(c => {
            if (!c.badge) return;
            const a = T.pulse + j * 0.2;
            j++;
            const s = 1 + 0.22 * bump(prog(t, a, a + 0.45));
            c.badge.style.transform = `scale(${s.toFixed(4)})`;
            const ring = E.out(prog(t, a, a + 0.3));
            c.el.style.boxShadow = `0 8px 18px rgba(0,0,0,.38), 0 0 0 ${(2 * ring).toFixed(2)}px rgba(132,196,58,${(0.85 * ring).toFixed(3)}), 0 0 ${(26 * ring).toFixed(1)}px rgba(132,196,58,${(0.3 * ring).toFixed(3)})`;
        });
        // Second-batch subscribed item in the Cities scene.
        pCS.cards.forEach(c => {
            if (!c.badge) return;
            const ring = E.out(prog(t, T.csReveal + 0.3, T.csReveal + 0.6));
            c.el.style.boxShadow = `0 8px 18px rgba(0,0,0,.38), 0 0 0 ${(2 * ring).toFixed(2)}px rgba(132,196,58,${(0.85 * ring).toFixed(3)})`;
        });
        // Low-rated items in the Cities batch get a warning outline before they go.
        pCS.cards.forEach(c => {
            if (!c.data.batch || c.data.sub || c.data.stars >= 4) return;
            const ring = E.out(prog(t, T.csReveal + 0.3, T.csReveal + 0.6));
            c.el.style.boxShadow = `0 8px 18px rgba(0,0,0,.38), 0 0 0 ${(2 * ring).toFixed(2)}px rgba(255,170,60,${(0.8 * ring).toFixed(3)})`;
        });
        // Low-rated items in Zomboid, outlined once the 4+ option is picked.
        pPZ.cards.forEach(c => {
            if (c.data.stars >= 4) return;
            const ring = E.out(prog(t, T.pzPick, T.pzPick + 0.2));
            c.el.style.boxShadow = `0 8px 18px rgba(0,0,0,.38), 0 0 0 ${(2 * ring).toFixed(2)}px rgba(255,170,60,${(0.8 * ring).toFixed(3)})`;
        });
    }

    // ---------- measurement (stage coordinates, neutral camera) ----------

    let M = null;
    function rectOf(node) {
        const r = node.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        const k = stageScale;
        const x = (r.left - s.left) / k, y = (r.top - s.top) / k, w = r.width / k, h = r.height / k;
        return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    }

    function measure() {
        cam.style.transform = 'none';
        S.browser.style.transform = 'none';
        pPZ.dropdown.style.transform = 'none';
        M = {
            tabs: S.chrome.tabs.map(rectOf),
            rw: { star: rectOf(pRW.star), hide: rectOf(pRW.hide) },
            pz: { star: rectOf(pPZ.star), hide: rectOf(pPZ.hide), opts: pPZ.opts.map(rectOf) },
            cs: { star: rectOf(pCS.star), hide: rectOf(pCS.hide) }
        };
        buildTracks();
    }

    // ---------- cursor + camera tracks ----------

    let cursorTrack, camTrack, clicks;
    function buildTracks() {
        const hideRW = [M.rw.hide.cx + 30, M.rw.hide.cy + 4];
        const tabPZ = [M.tabs[1].cx - 30, M.tabs[1].cy + 2];
        const starPZ = [M.pz.star.cx + 20, M.pz.star.cy + 4];
        const opt5 = [M.pz.opts[1].x + 70, M.pz.opts[1].cy + 2];
        const opt4 = [M.pz.opts[2].x + 64, M.pz.opts[2].cy + 2];
        const tabCS = [M.tabs[2].cx - 30, M.tabs[2].cy + 2];
        const rest1 = [1340, 760];
        const rest2 = [1280, 820];
        const rest3 = [1500, 860];

        cursorTrack = [
            [0, [1460, 930]],
            [8.35, [1460, 930]],
            [9.35, hideRW],
            [11.3, hideRW],
            [12.2, rest1],
            [13.3, rest1],
            [14.1, tabPZ],
            [15.05, tabPZ],
            [16.1, starPZ],
            [16.65, starPZ],
            [17.05, opt5],
            [17.35, opt5],
            [17.75, opt4],
            [19.0, opt4],
            [19.9, rest2],
            [21.1, rest2],
            [22.0, tabCS],
            [22.55, tabCS],
            [23.4, rest3]
        ];
        clicks = [T.rwClick, T.pzTab, T.pzOpen, T.pzPick, T.csTab];

        const N = [960, 640, 1];
        const rwF = [M.rw.hide.cx - 70, M.rw.hide.cy + 150, 1.62];
        const pzF = [M.pz.star.cx + 90, M.pz.star.cy + 150, 1.62];
        const csF = [(M.cs.star.cx + M.cs.hide.cx) / 2, M.cs.star.cy + 120, 1.45];
        camTrack = [
            [0, N],
            [5.0, N],
            [8.4, [960, 650, 1.035], E.inOut],
            [9.45, rwF, E.inOutQuint],
            [10.3, rwF],
            [11.6, N, E.inOutQuint],
            [15.2, N],
            [16.25, pzF, E.inOutQuint],
            [18.5, pzF],
            [19.8, N, E.inOutQuint],
            [22.9, N],
            [23.85, csF, E.inOutQuint],
            [25.3, csF],
            [26.3, N, E.inOutQuint]
        ];
    }

    function inside(r, p, pad = 0) {
        return p[0] >= r.x - pad && p[0] <= r.x + r.w + pad && p[1] >= r.y - pad && p[1] <= r.y + r.h + pad;
    }

    // ---------- per-page controls ----------

    function setText(node, text) {
        if (node.textContent !== text) node.textContent = text;
    }

    function renderControls(page, rects, t, cur, opts) {
        const hideActive = opts.hideActive;
        setText(page.hideLbl, hideActive ? 'Showing New Items' : 'Hide Subscribed');
        setText(page.starLbl, opts.starLabel);
        const hoverHide = inside(rects.hide, cur);
        const hoverStar = inside(rects.star, cur);
        page.hide.style.color = hideActive || hoverHide ? '#fff' : '#c4c4c4';
        page.star.style.color = hoverStar || opts.starLabel !== 'Star Rating' ? '#fff' : '#c4c4c4';
        page.hide.style.background = hoverHide ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.37)';
        page.star.style.background = hoverStar ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.37)';

        const slotP = opts.hideClick === undefined ? (hideActive ? 1 : 0) : E.outBack(prog(t, opts.hideClick, opts.hideClick + 0.35));
        page.hideSlot.style.visibility = slotP > 0 ? 'visible' : 'hidden';
        page.hideSlot.style.transform = `scale(${slotP.toFixed(4)})`;

        const flash = (node, times) => {
            let v = 0;
            (times || []).forEach(c => { v = Math.max(v, 0.22 * (1 - prog(t, c, c + 0.4)) * (t >= c ? 1 : 0)); });
            node.querySelector('.flash').style.opacity = v.toFixed(3);
        };
        flash(page.hide, opts.hideFlash);
        flash(page.star, opts.starFlash);

        const ring = (node, a) => {
            const v = a === undefined ? 0 : bump(prog(t, a, a + 1.5));
            node.querySelector('.ring').style.opacity = v.toFixed(3);
        };
        ring(page.star, opts.starRing);
        ring(page.hide, opts.hideRing);
    }

    function renderDropdown(t, cur) {
        const open = E.out(prog(t, T.pzOpen, T.pzOpen + 0.2)) * (1 - prog(t, T.pzPick + 0.05, T.pzPick + 0.2));
        const dd = pPZ.dropdown;
        dd.style.opacity = open.toFixed(3);
        dd.style.transform = `translateY(${((1 - open) * -8).toFixed(2)}px) scaleY(${(0.9 + 0.1 * open).toFixed(4)})`;
        pPZ.opts.forEach((o, i) => {
            const hot = open > 0.5 && inside(M.pz.opts[i], cur);
            o.style.background = hot ? '#2a475e' : 'transparent';
        });
    }

    // ---------- main render ----------

    function renderAt(t) {
        t = clamp(t, 0, DURATION);

        // Background drift.
        glowA.style.transform = `translate(${(Math.sin(t * 0.25) * 60).toFixed(1)}px, ${(Math.cos(t * 0.2) * 30).toFixed(1)}px)`;
        glowB.style.transform = `translate(${(Math.cos(t * 0.22) * -70).toFixed(1)}px, ${(Math.sin(t * 0.18) * -40).toFixed(1)}px)`;

        // Intro.
        const introOut = E.inOut(prog(t, T.introOut, T.introOut + 0.7));
        intro.style.display = introOut >= 1 ? 'none' : 'flex';
        intro.style.opacity = (1 - introOut).toFixed(3);
        intro.style.transform = `translateY(${(-70 * introOut).toFixed(1)}px)`;
        intro.style.filter = introOut > 0 ? `blur(${(6 * introOut).toFixed(2)}px)` : '';
        const lp = prog(t, 0.25, 1.2);
        logoWrap.style.opacity = E.out(prog(t, 0.25, 0.6)).toFixed(3);
        logoWrap.style.transform = `scale(${(0.5 + 0.5 * E.outBack(lp)).toFixed(4)}) rotate(${((1 - E.out(lp)) * -10).toFixed(2)}deg)`;
        const rp = prog(t, 0.65, 1.8);
        logoRing.style.opacity = (rp > 0 ? 0.7 * (1 - rp) : 0).toFixed(3);
        logoRing.style.transform = `scale(${(1 + 1.3 * E.out(rp)).toFixed(4)})`;
        letters.forEach((s, i) => {
            const a = 0.75 + i * 0.022;
            const p = E.out(prog(t, a, a + 0.5));
            s.style.opacity = p.toFixed(3);
            s.style.transform = `translateY(${((1 - p) * 34).toFixed(1)}px)`;
        });
        const tp = E.out(prog(t, 1.45, 2.05));
        introTag.style.opacity = tp.toFixed(3);
        introTag.style.transform = `translateY(${((1 - tp) * 18).toFixed(1)}px)`;
        chips.forEach((c, j) => {
            const a = 1.9 + j * 0.1;
            const p = E.outBack(prog(t, a, a + 0.45));
            c.style.opacity = clamp(p).toFixed(3);
            c.style.transform = `translateY(${((1 - p) * 14).toFixed(1)}px) scale(${(0.92 + 0.08 * p).toFixed(4)})`;
        });

        // Browser in/out.
        const bin = E.outQuint(prog(t, T.browserIn, T.browserIn + 1.15));
        const bout = E.inOut(prog(t, T.browserOut, T.browserOut + 0.8));
        S.browser.style.display = t < T.browserIn || bout >= 1 ? 'none' : 'block';
        S.browser.style.opacity = (prog(t, T.browserIn, T.browserIn + 0.45) * (1 - bout)).toFixed(3);
        S.browser.style.transform =
            `perspective(2200px) translateY(${((1 - bin) * 280 + bout * 40).toFixed(1)}px) rotateX(${((1 - bin) * 16).toFixed(2)}deg) scale(${(0.92 + 0.08 * bin - 0.06 * bout).toFixed(4)})`;
        S.browser.style.filter = bout > 0 ? `blur(${(8 * bout).toFixed(2)}px)` : '';
        // Camera.
        const [cx, cy, s] = track(camTrack, t);
        // The scrim only matters when the zoomed page slides under the headline.
        scrim.style.opacity = (prog(s, 1.04, 1.3) * (1 - prog(t, T.browserOut, T.browserOut + 0.5))).toFixed(3);
        cam.style.transform = `translate(${(960 - cx * s).toFixed(2)}px, ${(640 - cy * s).toFixed(2)}px) scale(${s.toFixed(5)})`;

        // Cursor.
        const cur = track(cursorTrack, t);
        const cOp = prog(t, 5.2, 5.6) * (1 - prog(t, 29.6, 30.1));
        cursor.style.opacity = cOp.toFixed(3);
        cursor.style.transform = `translate(${cur[0].toFixed(2)}px, ${cur[1].toFixed(2)}px)`;
        let press = 0, rip = 0, ripOp = 0;
        clicks.forEach(c => {
            press = Math.max(press, bump(prog(t, c - 0.07, c + 0.13)));
            const p = prog(t, c, c + 0.5);
            if (p > 0 && p < 1) { rip = p; ripOp = 1 - p; }
        });
        cursorArrow.style.transform = `scale(${(1 - 0.2 * press).toFixed(4)})`;
        ripple.style.opacity = (0.9 * ripOp).toFixed(3);
        ripple.style.transform = `scale(${(0.25 + 0.95 * E.out(rip)).toFixed(4)})`;

        // Tabs + address bar.
        const active = t < T.pzTab ? 0 : t < T.csTab ? 1 : 2;
        S.chrome.tabs.forEach((tab, i) => { tab.style.color = i === active ? '#e8eaed' : '#9aa0a6'; });
        const tabX = i => M.tabs[i].x - M.tabs[0].x + 86;
        const slide = (from, to, at) => lerp(tabX(from), tabX(to), E.out(prog(t, at, at + 0.22)));
        const bgX = t < T.pzTab ? tabX(0) : t < T.csTab ? slide(0, 1, T.pzTab) : slide(1, 2, T.csTab);
        S.chrome.tabBg.style.left = bgX.toFixed(2) + 'px';
        const g = S.pages[active].game;
        setText(S.chrome.host, 'steamcommunity.com');
        setText(S.chrome.path, g.url.replace('steamcommunity.com', ''));

        // Pages.
        const shownAt = [T.rwShown, T.pzTab, T.csTab];
        S.pages.forEach((p, i) => {
            let op = 0;
            if (i === active) op = i === 0 ? 1 : E.out(prog(t, shownAt[i], shownAt[i] + 0.3));
            else if (i === active - 1) op = t < shownAt[active] + 0.3 ? 1 : 0;
            p.el.style.display = op > 0 ? 'block' : 'none';
            p.el.style.opacity = op.toFixed(3);
            p.el.style.zIndex = String(i);
        });

        if (active === 0 || t < T.pzTab + 0.3) {
            renderControls(pRW, M.rw, t, cur, { hideActive: t >= T.rwClick, hideClick: T.rwClick, hideFlash: [T.rwClick], starLabel: 'Star Rating' });
            renderCards(pRW, t);
        }
        if (active === 1 || (active === 2 && t < T.csTab + 0.3)) {
            renderControls(pPZ, M.pz, t, cur, {
                hideActive: true,
                starLabel: t >= T.pzPick ? '4+ Stars' : 'Star Rating',
                starFlash: [T.pzOpen]
            });
            renderDropdown(t, cur);
            renderCards(pPZ, t);
        }
        if (active === 2) {
            renderControls(pCS, M.cs, t, cur, {
                hideActive: true,
                starLabel: '4+ Stars',
                starRing: T.csRings,
                hideRing: T.csRings + 0.25
            });
            renderCards(pCS, t);
            const sc = track([[T.csScroll, 0], [T.csScroll + 1.4, 392, E.inOutQuint]], t);
            pCS.scroller.style.transform = `translateY(${(-sc).toFixed(2)}px)`;
        }
        renderBadges(t);

        // Headlines.
        heads.forEach(h => {
            const vis = t >= h.a - 0.05 && t <= h.b;
            h.box.style.display = vis ? 'block' : 'none';
            if (!vis) return;
            const q = E.inOut(prog(t, h.b - 0.35, h.b));
            h.box.style.opacity = (1 - q).toFixed(3);
            h.box.style.transform = `translateY(${(-16 * q).toFixed(1)}px)`;
            const ep = E.out(prog(t, h.a - 0.05, h.a + 0.4));
            h.eb.style.opacity = ep.toFixed(3);
            h.eb.style.transform = `translateY(${((1 - ep) * 12).toFixed(1)}px)`;
            h.words.forEach((w, j) => {
                const a = h.a + 0.08 + j * 0.045;
                const p = E.out(prog(t, a, a + 0.55));
                w.style.opacity = p.toFixed(3);
                w.style.transform = `translateY(${((1 - p) * 28).toFixed(1)}px)`;
                w.style.filter = p < 1 ? `blur(${((1 - p) * 8).toFixed(2)}px)` : '';
            });
        });

        // Outro.
        const outroOn = t >= T.outro;
        outro.style.display = outroOn ? 'flex' : 'none';
        if (outroOn) {
            const endFade = 1 - E.inOut(prog(t, T.end - 0.8, T.end));
            outro.style.opacity = endFade.toFixed(3);
            const hp = E.out(prog(t, T.outro, T.outro + 0.8));
            outroHead.style.opacity = hp.toFixed(3);
            outroHead.style.transform = `translateY(${((1 - hp) * 34).toFixed(1)}px)`;
            features.forEach((f, j) => {
                const a = T.outro + 0.45 + j * 0.14;
                const p = E.outQuint(prog(t, a, a + 0.8));
                f.style.opacity = p.toFixed(3);
                f.style.transform = `translateY(${((1 - p) * 56).toFixed(1)}px)`;
            });
            const cp = E.out(prog(t, T.outro + 1.3, T.outro + 2.0));
            ctaRow.style.opacity = cp.toFixed(3);
            ctaRow.style.transform = `translateY(${((1 - cp) * 20).toFixed(1)}px)`;
            const glow = 0.4 + 0.18 * Math.sin((t - T.outro) * 2.2);
            cta.style.boxShadow = `0 12px 34px rgba(26,159,255,${glow.toFixed(3)}), inset 0 1px 0 rgba(255,255,255,.3)`;
        }

        fade.style.opacity = '0';
    }

    // ---------- boot ----------

    async function boot() {
        const fams = ['400 16px Figtree', '500 16px Figtree', '600 16px Figtree', '700 16px Figtree',
            '400 16px Sora', '600 16px Sora', '700 16px Sora', '16px "Bebas Neue"', '700 16px Oswald', '16px "Special Elite"'];
        await Promise.all(fams.map(f => document.fonts.load(f)));
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => (img.decode ? img.decode().catch(() => {}) : null)));
        measure();
        renderAt(0);
    }

    window.DURATION = DURATION;
    window.renderAt = renderAt;
    window.sceneReady = boot();

    // Live preview: ?t=12.5 freezes a frame; otherwise loop with a scrubber.
    const params = new URLSearchParams(location.search);
    if (params.has('render')) return;
    window.sceneReady.then(() => {
        if (params.has('t')) { renderAt(parseFloat(params.get('t'))); return; }
        const bar = document.createElement('div');
        bar.id = 'scrub';
        bar.innerHTML = '<button>pause</button><input type="range" min="0" max="' + DURATION + '" step="0.01" value="0"><span>0.00</span>';
        document.body.appendChild(bar);
        const [btn, range, label] = bar.children;
        let playing = true, base = performance.now(), offset = 0;
        btn.onclick = () => { playing = !playing; btn.textContent = playing ? 'pause' : 'play'; base = performance.now(); offset = parseFloat(range.value); };
        range.oninput = () => { offset = parseFloat(range.value); base = performance.now(); renderAt(offset); label.textContent = offset.toFixed(2); };
        (function loop() {
            if (playing) {
                const t = (offset + (performance.now() - base) / 1000) % DURATION;
                range.value = t;
                label.textContent = t.toFixed(2);
                renderAt(t);
            }
            requestAnimationFrame(loop);
        })();
    });
})();
