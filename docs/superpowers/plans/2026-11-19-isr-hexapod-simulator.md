# ISR 蛛行六足机器人模拟器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 交付一个离线可运行的第三人称六足救援机器人城市探索模拟器，具备 18 自由度步态、九类传感器、三处搜救目标和接近参考页的雨夜城市质感。

**Architecture:** 使用 Vite 开发多文件源码，Three.js 负责 3D 渲染；纯函数模块负责逆运动学、步态相位和证据融合，便于 Node 测试；最终构建脚本把 CSS 与 JavaScript 内联到根目录 `index.html`，实现单文件离线运行。

**Tech Stack:** Three.js 0.185.1、JavaScript ES modules、Vite 8、Node test runner、Web Audio API、DOM/CSS HUD。

**Spec:** `docs/superpowers/specs/2026-11-19-isr-hexapod-simulator-design.md`

## Global Constraints

- 交付文件必须离线运行，不依赖 CDN、外部图片、模型、字体或音频。
- 机器人为六足、每条腿 3 关节、共 18 自由度。
- 三角步态保持交替三足支撑；波动步态一次只抬一条腿。
- 九类传感器必须显示模拟数据：RGB、热像、毫米波、麦克风、气体、测距、IMU、FSR、电源。
- 三处搜索区必须完成扫描、证据判定、确认上传和结算。
- 目标为 1920×1080 下稳定 45 FPS 以上。
- 视觉方向为暴雨夜、震后城市街区、白色机器人、琥珀与青蓝信号灯。

---

### Task 1: 搭建可测试的多文件工程与单文件构建

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/style.css`
- Create: `tools/inline-build.mjs`
- Create: `tests/smoke.test.mjs`

**Interfaces:**
- Consumes: Three.js package at `E:\root\e-era-nav\node_modules\three`.
- Produces: `npm test`, `npm run build`, root `index.html` with inline CSS and JS.

- [x] **Step 1: Write the failing smoke test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('source entry exists', () => assert.equal(fs.existsSync('src/main.js'), true));
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/smoke.test.mjs`
Expected: FAIL because `src/main.js` does not exist.

- [x] **Step 3: Create the Vite shell and inline build script**

`vite.config.js` aliases `three` to the installed package and `three/addons/` to its examples. `tools/inline-build.mjs` reads `dist/index.html`, replaces the module script and stylesheet links with their file contents, and writes root `index.html`.

- [x] **Step 4: Run the test and production build**

Run: `node --test tests/smoke.test.mjs && node E:\root\e-era-nav\node_modules\vite\bin\vite.js build && node tools/inline-build.mjs`
Expected: test PASS and root `index.html` exists with no external asset links.

- [x] **Step 5: Commit**

```bash
git add robot/package.json robot/vite.config.js robot/index.html robot/src robot/tools robot/tests
git commit -m "build: scaffold offline ISR simulator"
```

### Task 2: 实现逆运动学、步态相位与传感器融合

**Files:**
- Create: `src/core.js`
- Create: `tests/core.test.mjs`
- Modify: `src/main.js`

**Interfaces:**
- Produces `solveLegIK(anchor, target, metrics) -> { yaw, hip, knee, reachable }`.
- Produces `getGaitOffsets(mode) -> number[]`.
- Produces `getSupportMask(phase, mode) -> boolean[]`.
- Produces `fuseEvidence({heat, presence, audio}) -> { hits, confidence, confirmed }`.
- Produces `projectTerrainFoot(x, z) -> number` through a callback supplied by world code.

- [x] **Step 1: Write failing core tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLegIK, getGaitOffsets, getSupportMask, fuseEvidence } from '../src/core.js';

test('IK keeps target reachable for a rest pose', () => {
  const r = solveLegIK({ x: 0.8, y: 0.2, z: 0 }, { x: 2.5, y: 0, z: 0 }, { l1: .35, l2: .9, l3: 1.1 });
  assert.equal(r.reachable, true);
  assert.ok(Number.isFinite(r.yaw + r.hip + r.knee));
});

test('tripod gait has exactly three swing legs', () => {
  assert.deepEqual(getSupportMask(0.1, 'tripod'), [false, true, false, true, false, true]);
});

test('wave gait has five support legs', () => {
  assert.equal(getSupportMask(0.02, 'wave').filter(Boolean).length, 5);
});

test('two evidence channels confirm a target', () => {
  const r = fuseEvidence({ heat: .82, presence: .73, audio: .21 });
  assert.equal(r.hits, 2);
  assert.equal(r.confirmed, true);
  assert.ok(r.confidence > .6);
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `node --test tests/core.test.mjs`
Expected: FAIL because `src/core.js` does not exist.

- [x] **Step 3: Implement the pure functions**

Use the PPT two-link formulas, clamp unreachable targets to the maximum workspace, calculate yaw from the planar foot direction, and implement offsets `[0, .5, 0, .5, 0, .5]` for tripod and `[0, 1/6, 2/6, 3/6, 4/6, 5/6]` for wave. Evidence confidence is `0.35 * heat + 0.4 * presence + 0.25 * audio`.

- [x] **Step 4: Run tests to verify they pass**

Run: `node --test tests/core.test.mjs`
Expected: all core tests PASS.

- [x] **Step 5: Commit**

```bash
git add robot/src/core.js robot/src/main.js robot/tests/core.test.mjs
git commit -m "feat: add ISR kinematics and sensor fusion core"
```

### Task 3: 构建 18 自由度机器人与程序化材质

**Files:**
- Create: `src/robot.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces `createHexapod() -> { root, body, legs, sensorNodes, setJointAngles, setFootWorld, setHeadAim }`.
- Each leg exposes `{ anchor, hipYaw, hipPitch, knee, foot, group }`.
- `setJointAngles(index, yaw, hip, knee)` applies radians.

- [x] **Step 1: Add a browser inspection hook**

In `main.js`, expose `window.__ISR__ = { robot }` and render the robot at the origin.

- [x] **Step 2: Implement the robot hierarchy**

Create a white clearcoat body, dark hip assemblies, six three-link legs, foot pressure pads, front sensor gimbal, warning lamp, antenna and nine emissive sensor markers. Each leg is a `Group -> yaw Group -> pitch Group -> thigh -> knee Group -> shin -> foot`.

- [x] **Step 3: Implement foot-to-joint mapping**

Call `solveLegIK` from `core.js`, convert world foot targets into the robot frame, and assign yaw/hip/knee rotations. Clamp joint angles for visual stability.

- [x] **Step 4: Verify robot renders**

Run: `node E:\root\e-era-nav\node_modules\vite\bin\vite.js --host 127.0.0.1 --port 4174`
Expected: browser shows the white robot with six legs and no console errors.

- [x] **Step 5: Commit**

```bash
git add robot/src/robot.js robot/src/main.js
git commit -m "feat: build articulated ISR hexapod"
```

### Task 4: 实现步态、驾驶、碰撞与第三人称镜头

**Files:**
- Create: `src/locomotion.js`
- Create: `src/input.js`
- Modify: `src/main.js`
- Modify: `src/robot.js`
- Create: `tests/locomotion.test.mjs`

**Interfaces:**
- Produces `createLocomotion(robot, world) -> { update(dt, controls), state }`.
- `state` includes `speed`, `heading`, `gait`, `moving`, `stanceCount`, `footPressures`.
- Produces `createInput(canvas)` with `move`, `turn`, `boost`, `brake`, `scan`, `gaitToggle`, `interact`.

- [x] **Step 1: Write failing locomotion tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepVelocity, angleDamp } from '../src/locomotion.js';
test('velocity accelerates gradually', () => {
  assert.ok(stepVelocity(0, 1, 1.2, .016) < 1.2);
});
test('angle damping reduces turn rate', () => {
  assert.ok(Math.abs(angleDamp(1, 0, .016)) < 1);
});
```

- [x] **Step 2: Implement smooth acceleration, braking and yaw**

Forward acceleration is 1.8 m/s², braking is 4.2 m/s², max speed is 3.2 m/s and boost raises it to 4.6 m/s. Turn rate is smoothed and affects the root heading.

- [x] **Step 3: Implement tripod and wave swing trajectories**

Swing duration is 0.34 cycle for tripod and 0.16 for wave. Foot lift height is 0.22 m. Planted feet stay fixed in world space; swing feet interpolate from lift start to a predicted support point.

- [x] **Step 4: Add collision and camera spring**

Reject root movement that intersects AABBs or map bounds. Camera position is damped toward a rear orbit anchor, with mouse yaw/pitch offsets, speed-based pullback, and footstep shake impulses.

- [x] **Step 5: Run tests and browser smoke test**

Run: `node --test tests/locomotion.test.mjs`
Expected: tests PASS and keyboard movement is visible in browser.

- [x] **Step 6: Commit**

```bash
git add robot/src/locomotion.js robot/src/input.js robot/src/robot.js robot/src/main.js robot/tests/locomotion.test.mjs
git commit -m "feat: add hexapod gait and third-person driving"
```

### Task 5: 构建雨夜城市环境

**Files:**
- Create: `src/world.js`
- Modify: `src/main.js`
- Modify: `src/style.css`

**Interfaces:**
- Produces `createCityWorld(scene, renderer) -> { colliders, groundAt, searchZones, update, lights, weather }`.
- `groundAt(x, z)` returns terrain height.
- `searchZones` contains `{ id, label, position, radius, evidence }`.

- [x] **Step 1: Create the urban scene**

Add wet asphalt, sidewalks, low-poly commercial buildings, broken neon signs, collapsed scaffolding, vehicles, rubble, an elevated broken road, emergency lighting and distant skyline silhouettes.

- [x] **Step 2: Add weather and lighting**

Add fog, rain particles, puddle planes, steam, broken fire hydrant spray, hemisphere light, moon key light, warm street lights, cyan scanning spill and lightning-like flashes.

- [x] **Step 3: Add colliders and three target zones**

Place colliders around buildings, vehicles, rubble and scaffolding. Place search zones in the storefront alley, under the broken elevated road and in the flooded courtyard.

- [x] **Step 4: Verify environment in browser**

Expected: readable navigation routes, white robot clearly visible, no external asset requests, and 45 FPS or higher at 1920×1080.

- [x] **Step 5: Commit**

```bash
git add robot/src/world.js robot/src/main.js robot/src/style.css
git commit -m "feat: add rain-soaked urban rescue environment"
```

### Task 6: 实现传感器、扫描、HUD 与任务流程

**Files:**
- Create: `src/mission.js`
- Create: `src/hud.js`
- Create: `src/audio.js`
- Modify: `src/main.js`
- Modify: `src/style.css`
- Create: `tests/mission.test.mjs`

**Interfaces:**
- Produces `createMission(zones) -> { update, scan, confirm, state }`.
- Produces `createHUD() -> { update, showEvidence, complete, setMessage }`.
- Produces `createAudio() -> { start, setState, footstep, scanPulse, mute }`.

- [x] **Step 1: Write failing mission tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanRate, canConfirm } from '../src/mission.js';
test('scan is slower while moving', () => assert.ok(scanRate(2.5) < scanRate(0)));
test('confirmed target can be uploaded', () => assert.equal(canConfirm({ confirmed: true, uploaded: false }), true));
```

- [x] **Step 2: Implement mission state and evidence**

Use speed and posture stability to determine scan rate. A scan fills from 0 to 1; fused evidence becomes available at 1. `E` confirms and uploads the target; the third upload completes the exercise.

- [x] **Step 3: Build the HUD**

Add mission objective, compass, scan reticle, world target marker, speed and gait, six FSR bars, nine sensor cells, scan progress, evidence card, pause help, completion overlay and mute control.

- [x] **Step 4: Add procedural audio**

Generate rain noise, servo tone, hydraulic hiss, footstep thumps, scan pings and radio chirps with the Web Audio API after first user interaction.

- [x] **Step 5: Run mission tests**

Run: `node --test tests/mission.test.mjs`
Expected: mission tests PASS.

- [x] **Step 6: Commit**

```bash
git add robot/src/mission.js robot/src/hud.js robot/src/audio.js robot/src/main.js robot/src/style.css robot/tests/mission.test.mjs
git commit -m "feat: add rescue sensors HUD and mission flow"
```

### Task 7: 完成启动画面、镜头反馈与视觉打磨

**Files:**
- Modify: `src/main.js`
- Modify: `src/robot.js`
- Modify: `src/world.js`
- Modify: `src/style.css`

**Interfaces:**
- Consumes all prior module interfaces.
- Produces polished boot screen, mission start, pause state, restart flow and responsive HUD.

- [x] **Step 1: Build the boot and mission briefing**

Add the ISR title lockup, simulation disclaimer, city/weather metadata, initialization progress, start button and control hints.

- [x] **Step 2: Add mechanical feedback**

Add body lean, head lag, hydraulic idle bob, accelerating camera pullback, landing shake, light flicker, water ripples and scan pulse rings.

- [x] **Step 3: Add responsive and accessibility behavior**

At narrow widths, collapse sensor details into a compact grid, keep the scan reticle visible, respect reduced motion, show keyboard focus, and provide mute and restart controls.

- [x] **Step 4: Verify the complete flow manually**

Expected: start screen, drive, gait toggle, motion/stop scan, evidence confirmation, third target, completion, restart, mute and help all work.

- [x] **Step 5: Commit**

```bash
git add robot/src robot/index.html
git commit -m "feat: polish ISR simulator presentation and feedback"
```

### Task 8: 单文件构建、自动验收与文档

**Files:**
- Create: `README.md`
- Modify: `tools/inline-build.mjs`
- Create: `tests/e2e-smoke.mjs`
- Modify: `docs/superpowers/plans/2026-11-19-isr-hexapod-simulator.md`

**Interfaces:**
- Consumes root `index.html` and the public `window.__ISR__` debug hook.
- Produces final offline artifact and verification report.

- [x] **Step 1: Write the browser smoke test**

Use Playwright to open the local server, assert `window.__ISR__.ready === true`, press `W` and assert position changes, press `G` and assert gait changes, force a target scan through the debug API, confirm it, and assert mission progress increases.

- [x] **Step 2: Add the debug API**

Expose `window.__ISR__ = { ready, state(), teleportToZone(i), setScanning(bool), confirmTarget(), setGait(mode) }` without affecting normal controls.

- [x] **Step 3: Build and inline the final file**

Run: `node --test tests && node E:\root\e-era-nav\node_modules\vite\bin\vite.js build && node tools/inline-build.mjs`
Expected: all tests PASS and root `index.html` contains no `src=` or `href=` asset references.

- [x] **Step 4: Run browser acceptance**

Run: `node tests/e2e-smoke.mjs`
Expected: no page errors, movement and mission state changes verified.

- [x] **Step 5: Write README with exact controls and limits**

Document offline launch, controls, mission flow, sensor model, 18-DOF behavior, WebGL requirement and the fact that rescue metrics are simulated.

- [x] **Step 6: Commit**

```bash
git add robot/index.html robot/README.md robot/tools/inline-build.mjs robot/tests/e2e-smoke.mjs robot/docs/superpowers/plans/2026-11-19-isr-hexapod-simulator.md
git commit -m "release: package offline ISR hexapod simulator"
```

