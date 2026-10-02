// thumbs.js
// Procedural thumbnail and banner art. Everything is drawn as SVG from a
// seeded RNG so every render of the video is identical.

(function () {
    const W = 256;
    const H = 144;

    function rng(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashString(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    const hsl = (h, s, l, a) => a === undefined ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`;

    let gradId = 0;
    function uid(prefix) { gradId += 1; return prefix + gradId; }

    function label(text, opts) {
        const o = Object.assign({ x: W / 2, y: 118, size: 30, font: 'Bebas Neue', fill: '#fff', anchor: 'middle', spacing: 1, stroke: 'rgba(0,0,0,.55)' }, opts);
        return `<text x="${o.x}" y="${o.y}" text-anchor="${o.anchor}" font-family="${o.font}" font-size="${o.size}" letter-spacing="${o.spacing}"
            fill="${o.fill}" stroke="${o.stroke}" stroke-width="${o.strokeWidth || 4}" paint-order="stroke" ${o.extra || ''}>${text}</text>`;
    }

    const ICONS = {
        moon: '<path d="M0 -26a26 26 0 1 0 22 40a22 22 0 1 1 -22 -40z"/>',
        bulb: '<path d="M0 -28a18 18 0 0 1 11 32v8h-22v-8a18 18 0 0 1 11 -32z"/><rect x="-9" y="16" width="18" height="6" rx="2"/>',
        cross: '<path d="M-8 -26h16v18h18v16h-18v18h-16v-18h-18v-16h18z"/>',
        leaf: '<path d="M-22 22c0 -34 22 -48 48 -50c-2 28 -16 50 -48 50z"/><path d="M-22 22l26 -28" stroke="rgba(0,0,0,.35)" stroke-width="3"/>',
        gear: '<path d="M-5 -28h10l2 8l7 3l7 -5l7 7l-5 7l3 7l8 2v10l-8 2l-3 7l5 7l-7 7l-7 -5l-7 3l-2 8h-10l-2 -8l-7 -3l-7 5l-7 -7l5 -7l-3 -7l-8 -2v-10l8 -2l3 -7l-5 -7l7 -7l7 5l7 -3z"/><circle r="9" fill="rgba(0,0,0,.45)"/>'
    };

    // RimWorld: top-down colony floor plan.
    function colony(a, r) {
        const ground = hsl(a.hue, 28, 22);
        let s = `<rect width="${W}" height="${H}" fill="${ground}"/>`;
        for (let y = 0; y < H; y += 8) {
            for (let x = 0; x < W; x += 8) {
                const v = r();
                if (v < 0.5) s += `<rect x="${x}" y="${y}" width="8" height="8" fill="${hsl(a.hue, 24, 18 + v * 10, 0.6)}"/>`;
            }
        }
        const rooms = [[24, 14, 72, 52], [104, 20, 56, 44], [36, 74, 64, 36], [168, 12, 64, 58]];
        rooms.forEach(([x, y, w, h], i) => {
            s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hsl(a.hue + 10, 18, 34 + i * 2)}" stroke="${hsl(a.hue, 10, 62)}" stroke-width="3"/>`;
            for (let k = 0; k < 3; k++) {
                const px = x + 8 + r() * (w - 16);
                const py = y + 8 + r() * (h - 16);
                s += `<rect x="${px}" y="${py}" width="6" height="6" rx="1" fill="${hsl(r() * 360, 70, 62)}"/>`;
            }
        });
        s += `<rect width="${W}" height="${H}" fill="url(#vg)"/>`;
        s += label(a.label, { size: 30, y: 128 });
        return s;
    }

    // RimWorld: emblem over a warm radial glow.
    function emblem(a) {
        const id = uid('rg');
        let s = `<defs><radialGradient id="${id}" cx=".5" cy=".42" r=".75">
            <stop offset="0" stop-color="${hsl(a.hue, 55, 46)}"/><stop offset="1" stop-color="${hsl(a.hue, 45, 12)}"/></radialGradient></defs>`;
        s += `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
        s += `<g transform="translate(${W / 2} 58)" fill="${hsl(a.hue, 80, 88)}" stroke="${hsl(a.hue, 40, 18)}" stroke-width="2">${ICONS[a.icon]}</g>`;
        s += label(a.label, { size: 28, y: 126 });
        return s;
    }

    // RimWorld: planet horizon in space.
    function planet(a, r) {
        const id = uid('pl');
        let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${hsl(a.hue, 60, 52)}"/><stop offset="1" stop-color="${hsl(a.hue + 30, 50, 22)}"/></linearGradient></defs>`;
        s += `<rect width="${W}" height="${H}" fill="#06080f"/>`;
        for (let i = 0; i < 40; i++) s += `<circle cx="${r() * W}" cy="${r() * H}" r="${r() * 0.9 + 0.2}" fill="#fff" opacity="${0.3 + r() * 0.6}"/>`;
        s += `<circle cx="70" cy="210" r="150" fill="url(#${id})"/>`;
        s += `<circle cx="70" cy="210" r="150" fill="none" stroke="${hsl(a.hue, 90, 80, 0.7)}" stroke-width="2"/>`;
        s += label(a.label, { size: 26, x: 240, y: 40, anchor: 'end' });
        return s;
    }

    // Project Zomboid: night street silhouettes.
    function night(a, r) {
        const id = uid('nt');
        let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${hsl(a.hue, 30, 16)}"/><stop offset="1" stop-color="${hsl(a.hue, 40, 6)}"/></linearGradient></defs>`;
        s += `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
        s += `<circle cx="206" cy="34" r="16" fill="${hsl(50, 40, 86)}" opacity=".85"/>`;
        let x = -10;
        while (x < W) {
            const w = 30 + r() * 30;
            const h = 30 + r() * 34;
            s += `<path d="M${x} ${H}V${H - h}l${w / 2} -14l${w / 2} 14V${H}z" fill="#05060a"/>`;
            if (r() < 0.6) s += `<rect x="${x + w / 2 - 4}" y="${H - h + 10}" width="8" height="8" fill="${hsl(45, 90, 60)}" opacity=".8"/>`;
            x += w + 4;
        }
        for (let i = 0; i < 4; i++) {
            const tx = r() * W;
            s += `<path d="M${tx} ${H}l-14 -48l14 -20l14 20z" fill="#030407"/>`;
        }
        s += `<rect width="${W}" height="${H}" fill="${hsl(a.hue, 60, 40, 0.12)}"/>`;
        s += label(a.label, { size: 26, font: 'Special Elite', y: 56, spacing: 0, fill: '#e9e2cf' });
        return s;
    }

    // Project Zomboid: paper note with a rubber stamp.
    function stamp(a, r) {
        let s = `<rect width="${W}" height="${H}" fill="${hsl(42, 30, 68)}"/>`;
        for (let i = 0; i < 9; i++) s += `<line x1="18" x2="238" y1="${22 + i * 13}" y2="${22 + i * 13}" stroke="${hsl(210, 30, 50, 0.35)}" stroke-width="1"/>`;
        for (let i = 0; i < 160; i++) s += `<circle cx="${r() * W}" cy="${r() * H}" r="${r() * 1.4}" fill="#3b2a12" opacity="${r() * 0.25}"/>`;
        s += `<g transform="rotate(-8 128 72)">
            <rect x="34" y="42" width="188" height="58" rx="6" fill="none" stroke="${hsl(a.hue, 70, 38)}" stroke-width="5"/>
            ${label(a.label, { size: 26, font: 'Special Elite', y: 81, fill: hsl(a.hue, 70, 38), stroke: 'none', spacing: 1 })}
        </g>`;
        return s;
    }

    // Project Zomboid: paper map with roads and markers.
    function map(a, r) {
        let s = `<rect width="${W}" height="${H}" fill="${hsl(80, 18, 72)}"/>`;
        for (let i = 0; i < 6; i++) s += `<rect x="${r() * W}" y="${r() * H}" width="${30 + r() * 60}" height="${20 + r() * 40}" fill="${hsl(110, 25, 58, 0.6)}"/>`;
        s += `<path d="M0 90C60 80 90 40 150 50S230 100 256 70" stroke="#f4f1e6" stroke-width="9" fill="none"/>`;
        s += `<path d="M110 0V144M0 30H256" stroke="#f4f1e6" stroke-width="6"/>`;
        s += `<path d="M0 90C60 80 90 40 150 50S230 100 256 70" stroke="#c9a54a" stroke-width="2" fill="none" stroke-dasharray="6 5"/>`;
        [[70, 70], [160, 40], [210, 92]].forEach(([x, y]) => {
            s += `<path d="M${x} ${y}c-9 -9 -9 -22 0 -24c9 2 9 15 0 24z" transform="translate(0 0)" fill="${hsl(a.hue, 75, 45)}" stroke="#2a1a14" stroke-width="1.5"/>`;
        });
        s += label(a.label, { size: 24, font: 'Special Elite', y: 130, fill: '#2b2418', stroke: 'rgba(244,241,230,.9)' });
        return s;
    }

    // Cities: Skylines II: isometric city block.
    function iso(a, r) {
        const id = uid('sk');
        let s = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${hsl(a.hue, 55, 62)}"/><stop offset="1" stop-color="${hsl(a.hue + 20, 45, 28)}"/></linearGradient></defs>`;
        s += `<rect width="${W}" height="${H}" fill="url(#${id})"/>`;
        const cells = [];
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 5; gx++) cells.push([gx, gy]);
        cells.sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
        const ox = 128, oy = 52, tw = 20, th = 11;
        s += `<path d="M${ox} ${oy - 6}l${tw * 5 + 6} ${th * 5 + 3}l${-(tw * 5 + 6)} ${th * 5 + 3}l${-(tw * 5 + 6)} ${-(th * 5 + 3)}z" fill="${hsl(a.hue + 60, 20, 34)}"/>`;
        cells.forEach(([gx, gy]) => {
            const cx = ox + (gx - gy) * tw;
            const cy = oy + (gx + gy) * th;
            const h = 6 + Math.floor(r() * 46);
            const L = 50 + r() * 25;
            s += `<path d="M${cx - tw * 0.8} ${cy + th}l${tw * 0.8} ${th * 0.8}v${-h}l${-tw * 0.8} ${-th * 0.8}z" fill="${hsl(a.hue, 12, L - 18)}"/>`;
            s += `<path d="M${cx} ${cy + th * 1.8}l${tw * 0.8} ${-th * 0.8}v${-h}l${-tw * 0.8} ${th * 0.8}z" fill="${hsl(a.hue, 12, L - 30)}"/>`;
            s += `<path d="M${cx} ${cy + th * 1.8 - h}l${tw * 0.8} ${-th * 0.8}l${-tw * 0.8} ${-th * 0.8}l${-tw * 0.8} ${th * 0.8}z" fill="${hsl(a.hue, 14, L)}"/>`;
        });
        s += label(a.label, { size: 26, font: 'Oswald', y: 30, spacing: 1.5, extra: 'font-weight="700"' });
        return s;
    }

    // Cities: Skylines II: top-down road network.
    function roads(a, r) {
        let s = `<rect width="${W}" height="${H}" fill="${hsl(a.hue, 22, 26)}"/>`;
        for (let i = 0; i < 18; i++) s += `<rect x="${r() * W}" y="${r() * H}" width="${16 + r() * 24}" height="${12 + r() * 20}" fill="${hsl(a.hue + (r() < 0.4 ? 80 : 0), 18, 34 + r() * 10)}"/>`;
        s += `<path d="M-10 100C70 100 90 40 160 40S240 70 270 70" stroke="#2c2f36" stroke-width="22" fill="none"/>`;
        s += `<path d="M-10 100C70 100 90 40 160 40S240 70 270 70" stroke="#f2c84b" stroke-width="1.5" fill="none" stroke-dasharray="8 6"/>`;
        s += `<path d="M96 -10V160" stroke="#2c2f36" stroke-width="16"/><path d="M96 -10V160" stroke="#fff" stroke-width="1" stroke-dasharray="6 6" opacity=".7"/>`;
        s += `<circle cx="96" cy="70" r="20" fill="none" stroke="#2c2f36" stroke-width="14"/>`;
        for (let i = 0; i < 7; i++) s += `<rect x="${r() * W}" y="${r() * H}" width="5" height="3" rx="1" fill="${hsl(r() * 360, 70, 60)}"/>`;
        s += label(a.label, { size: 26, font: 'Oswald', x: 248, y: 132, anchor: 'end', spacing: 1.5, extra: 'font-weight="700"' });
        return s;
    }

    // Cities: Skylines II: transit line diagram.
    function transit(a, r) {
        let s = `<rect width="${W}" height="${H}" fill="#f4f5f7"/>`;
        const lines = [[a.hue, 'M10 40H90L130 80H246'], [a.hue + 120, 'M40 134V90L80 50H200'], [a.hue + 220, 'M10 110H120L160 70V10']];
        lines.forEach(([h, d]) => { s += `<path d="${d}" stroke="${hsl(h, 70, 48)}" stroke-width="8" fill="none" stroke-linejoin="round"/>`; });
        [[90, 40], [130, 80], [80, 50], [120, 110], [160, 70], [200, 50], [200, 80]].forEach(([x, y]) => {
            s += `<circle cx="${x}" cy="${y}" r="6" fill="#fff" stroke="#1d2129" stroke-width="3"/>`;
        });
        s += label(a.label, { size: 26, font: 'Oswald', x: 14, y: 30, anchor: 'start', fill: '#1d2129', stroke: '#f4f5f7', spacing: 1.5, extra: 'font-weight="700"' });
        return s;
    }

    const KINDS = { colony, emblem, planet, night, stamp, map, iso, roads, transit };

    window.thumbSVG = function (art, seedText) {
        const r = rng(hashString(seedText));
        const body = KINDS[art.kind](art, r);
        return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs><radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient></defs>
            ${body}</svg>`;
    };

    // Wide page banners, one per game.
    window.bannerSVG = function (gameId) {
        const r = rng(hashString('banner-' + gameId));
        const BW = 1360, BH = 104;
        let s = '';
        if (gameId === 'rw') {
            s += `<defs><linearGradient id="b1" x1="0" x2="1"><stop offset="0" stop-color="#0a0f1c"/><stop offset=".55" stop-color="#16243a"/><stop offset="1" stop-color="#2c4a52"/></linearGradient>
                <radialGradient id="b2" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="#c46a2e"/><stop offset=".97" stop-color="#ffd59a"/><stop offset="1" stop-color="#ffd59a" stop-opacity="0"/></radialGradient></defs>`;
            s += `<rect width="${BW}" height="${BH}" fill="url(#b1)"/>`;
            for (let i = 0; i < 90; i++) s += `<circle cx="${r() * BW}" cy="${r() * BH}" r="${r() * 1.1 + 0.2}" fill="#fff" opacity="${0.2 + r() * 0.6}"/>`;
            s += `<circle cx="260" cy="420" r="380" fill="url(#b2)"/>`;
            s += `<circle cx="260" cy="420" r="330" fill="#7b4426"/><path d="M-60 120C80 70 260 60 420 90" stroke="#a7643a" stroke-width="22" opacity=".5" fill="none"/>`;
        } else if (gameId === 'pz') {
            s += `<defs><linearGradient id="b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0c0c"/><stop offset="1" stop-color="#0c0606"/></linearGradient></defs>`;
            s += `<rect width="${BW}" height="${BH}" fill="url(#b1)"/>`;
            s += `<circle cx="1180" cy="30" r="22" fill="#e8d9b0" opacity=".75"/>`;
            let x = -20;
            while (x < BW) {
                const w = 40 + r() * 60, h = 24 + r() * 40;
                s += `<path d="M${x} ${BH}V${BH - h}l${w / 2} -16l${w / 2} 16V${BH}z" fill="#050303"/>`;
                if (r() < 0.35) s += `<rect x="${x + w / 2 - 5}" y="${BH - h + 10}" width="10" height="9" fill="#e9b04a" opacity=".85"/>`;
                x += w + 10 + r() * 30;
            }
            for (let i = 0; i < 14; i++) { const tx = r() * BW; s += `<path d="M${tx} ${BH}l-16 -60l16 -26l16 26z" fill="#030202"/>`; }
            s += `<rect width="${BW}" height="${BH}" fill="#5a1414" opacity=".18"/>`;
        } else {
            s += `<defs><linearGradient id="b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5f8f"/><stop offset=".7" stop-color="#e59a62"/><stop offset="1" stop-color="#f3c27c"/></linearGradient></defs>`;
            s += `<rect width="${BW}" height="${BH}" fill="url(#b1)"/>`;
            let x = 0;
            while (x < BW) {
                const w = 18 + r() * 34, h = 18 + r() * 70;
                s += `<rect x="${x}" y="${BH - h}" width="${w}" height="${h}" fill="#1a2433"/>`;
                for (let wy = BH - h + 6; wy < BH - 4; wy += 8) {
                    for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() < 0.3) s += `<rect x="${wx}" y="${wy}" width="3" height="3" fill="#ffd27a" opacity=".85"/>`;
                }
                x += w + 2;
            }
        }
        s += `<rect width="${BW}" height="${BH}" fill="url(#bfade)"/>`;
        const svg = `<svg viewBox="0 0 ${BW} ${BH}" width="${BW}" height="${BH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
            <defs><linearGradient id="bfade" x1="0" x2="1"><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>${s}</svg>`;
        // Inline SVGs share one id namespace; keep each banner's gradients private.
        return svg.replace(/\b(b1|b2|bfade)\b/g, gameId + '-$1');
    };
})();
