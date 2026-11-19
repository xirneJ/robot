import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'file:///E:/root/e-era-nav/node_modules/playwright/index.mjs';

const port = 4176;
const server = spawn('python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: process.cwd(), stdio: 'ignore', windowsHide: true
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
try {
  await wait(700);
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.bringToFront();
  await page.waitForFunction(() => window.__ISR__?.ready === true, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('#start-btn')?.disabled === false, null, { timeout: 5000 });
  await page.locator('#start-btn').click();
  await wait(500);
  const start = await page.evaluate(() => window.__ISR__.state());
  assert.equal(start.started, true);
  assert.equal(start.stance, 6);
  assert.ok(Math.abs(start.scale - .22) < .001, 'robot should use realistic small-platform scale');

  const moved = await page.evaluate(() => {
    window.__ISR__.setGait('tripod');
    return window.__ISR__.simulate(1.4, { throttle: 1 });
  });
  assert.ok(moved.position[2] < start.position[2] - .3, 'robot should move forward');
  assert.ok(Math.abs(moved.speed) > .5, 'robot speed should increase');

  await page.evaluate(() => window.__ISR__.simulate(.7, { brake: true }));
  const footHeights = await page.evaluate(() => window.__ISR__.robot.legs.map((leg) => {
    let minY = Infinity;
    leg.group.updateWorldMatrix(true, true);
    leg.group.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
      const attr = obj.geometry.attributes.position;
      const v = obj.position.clone();
      for (let i = 0; i < attr.count; i++) {
        v.fromBufferAttribute(attr, i).applyMatrix4(obj.matrixWorld);
        minY = Math.min(minY, v.y);
      }
    });
    return minY;
  }));
  assert.ok(Math.min(...footHeights) >= 0, `leg meshes must stay above ground: ${footHeights.join(', ')}`);

  await page.evaluate(() => window.__ISR__.simulate(.6, { brake: true }));
  await page.evaluate(() => window.__ISR__.setGait('wave'));
  assert.equal((await page.evaluate(() => window.__ISR__.state())).gait, 'wave');

  await page.evaluate(() => window.__ISR__.teleportToZone(0));
  const scanned = await page.evaluate(() => {
    window.__ISR__.simulate(4.5, { scan: true });
    return {
      state: window.__ISR__.state(),
      cardVisible: !document.querySelector('#evidence-card').hidden,
      confidence: document.querySelector('#confidence-value').textContent
    };
  });
  assert.equal(scanned.state.scan, 1);
  assert.equal(scanned.cardVisible, true);
  assert.match(scanned.confidence, /%/);

  const uploaded = await page.evaluate(() => { window.__ISR__.confirmTarget(); return window.__ISR__.state(); });
  assert.equal(uploaded.uploading, 1);

  const collision = await page.evaluate(() => {
    const robot = window.__ISR__.robot;
    robot.root.position.set(-5.5, 0, 31);
    robot.root.rotation.y = 0;
    window.__ISR__.locomotion.state.heading = 0;
    window.__ISR__.locomotion.state.speed = 0;
    window.__ISR__.locomotion.state.turnRate = 0;
    window.__ISR__.locomotion.state.feetReady = false;
    return window.__ISR__.simulate(4, { throttle: 1 });
  });
  assert.ok(collision.position[2] > 27.8, 'robot should stop before penetrating a car');

  await page.screenshot({ path: 'isr-preview.png', fullPage: false });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    movedMeters: +(start.position[2] - moved.position[2]).toFixed(2),
    gait: 'wave',
    confidence: scanned.confidence,
    uploaded: uploaded.uploading,
    collisionStopZ: +collision.position[2].toFixed(2),
    minFootHeight: +Math.min(...footHeights).toFixed(3),
    pageErrors,
    consoleErrors
  }, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill();
}
