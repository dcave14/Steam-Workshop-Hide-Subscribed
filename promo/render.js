// render.js
// Renders showcase.html frame by frame in headless Chrome and encodes with ffmpeg.
//
//   node render.js                      -> out/showcase-1080p.mp4 (60 fps)
//   node render.js --fps 30 --from 8 --to 12
//   node render.js --stills 2,9.5,17.5  -> out/still-<t>.png
//   node render.js --stills 7,11 --size 1280x800 --prefix store
//   node render.js --gif --width 960 --gif-fps 15   (from the finished MP4)
//
// Set CHROME_PATH if Chrome is not in the default Windows location.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const args = process.argv.slice(2);
const opt = (name, def) => {
    const i = args.indexOf('--' + name);
    return i === -1 ? def : args[i + 1];
};

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = parseFloat(opt('fps', '60'));
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const OUT_DIR = path.join(__dirname, 'out');
const PAGE_URL = 'file:///' + path.join(__dirname, 'showcase.html').replace(/\\/g, '/') + '?render=1';

async function openPage(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto(PAGE_URL, { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.sceneReady);
    return page;
}

async function shoot(page, t) {
    // The capture itself forces style, layout and paint for the new frame.
    await page.evaluate(time => window.renderAt(time), t);
    return page.screenshot({ type: 'png', optimizeForSpeed: true });
}

async function stills(browser, times) {
    const page = await openPage(browser);
    const prefix = opt('prefix', 'still');
    for (const t of times) {
        const file = path.join(OUT_DIR, `${prefix}-${String(t).replace('.', '_')}.png`);
        fs.writeFileSync(file, await shoot(page, t));
        console.log('wrote', file);
    }
}

async function video(browser) {
    const duration = await (await openPage(browser)).evaluate(() => window.DURATION);
    const from = parseFloat(opt('from', '0'));
    const to = parseFloat(opt('to', String(duration)));
    const total = Math.round((to - from) * FPS);
    const outFile = path.join(OUT_DIR, opt('out', `showcase-${H}p.mp4`));

    const ff = spawn('ffmpeg', [
        '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
        '-tune', 'animation', '-movflags', '+faststart', outFile
    ], { stdio: ['pipe', 'inherit', 'pipe'] });
    let ffErr = '';
    ff.stderr.on('data', d => { ffErr += d; });

    // Sequential capture: tabs sharing one headless browser stall when unfocused,
    // and a single page already runs at roughly 15-20 frames per second.
    const page = await openPage(browser);
    const started = Date.now();
    for (let i = 0; i < total; i++) {
        const buf = await shoot(page, from + i / FPS);
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
        if ((i + 1) % FPS === 0 || i + 1 === total) {
            const rate = (i + 1) / ((Date.now() - started) / 1000);
            process.stdout.write(`${i + 1}/${total} frames  ${rate.toFixed(1)} fps  eta ${((total - i - 1) / rate).toFixed(0)}s   `);
        }
    }
    ff.stdin.end();
    const code = await new Promise(r => ff.on('close', r));
    if (code !== 0) throw new Error('ffmpeg failed:\n' + ffErr.slice(-2000));
    console.log('\nwrote', outFile);
}

// README-sized looping GIF made from the finished MP4 with a two-pass palette.
function gif() {
    const src = path.join(OUT_DIR, opt('src', 'showcase-1080p.mp4'));
    const dst = path.join(OUT_DIR, opt('out', 'showcase.gif'));
    const width = opt('width', '960');
    const rate = opt('gif-fps', '15');
    const filters = `fps=${rate},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
    return new Promise((resolve, reject) => {
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-filter_complex', filters, '-loop', '0', dst], { stdio: 'inherit' });
        ff.on('close', code => (code === 0 ? resolve(console.log('wrote', dst)) : reject(new Error('ffmpeg gif failed'))));
    });
}

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    if (args.includes('--gif')) return gif();
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--allow-file-access-from-files', '--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none']
    });
    try {
        const s = opt('stills', null);
        if (s) await stills(browser, s.split(',').map(Number));
        else await video(browser);
    } finally {
        await browser.close();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
