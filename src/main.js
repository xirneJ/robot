import * as THREE from 'three';
import './style.css';
import { createHexapod } from './robot.js';
import { createCityWorld } from './world.js';
import { createLocomotion, createChaseCamera } from './locomotion.js';
import { createInput } from './input.js';
import { createMission } from './mission.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createAutopilot } from './autopilot.js';
import { createRadar } from './radar.js';
import { createPhysicsWorld } from './physics.js';
import { WebGPURenderer } from 'three/webgpu';
import { createPostPipeline } from './post.js';
import { clamp } from './core.js';

const canvas = document.querySelector('#view');
const boot = document.querySelector('#boot');
const startButton = document.querySelector('#start-btn');
const bootProgress = document.querySelector('#boot-progress');
const bootStatus = document.querySelector('#boot-status');
const bootPct = document.querySelector('#boot-pct');
const hudNode = document.querySelector('#hud');

const renderer = new WebGPURenderer({
  canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false
});
await renderer.init();
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .08, 240);
camera.position.set(9, 5, 38);
const post = createPostPipeline(renderer, scene, camera);
document.querySelector('#link-state').textContent = post.isWebGPU ? 'WEBGPU 在线' : 'WEBGL2 兼容';

const world = createCityWorld(scene, renderer);
const physics = await createPhysicsWorld(world);
world.physics = physics;
const robot = createHexapod();
robot.root.position.set(0, 0, 29);
scene.add(robot.root);
const locomotion = createLocomotion(robot, world);
const input = createInput(canvas);
const mission = createMission(world.searchZones);
const hud = createHUD();
const audio = createAudio();
const chase = createChaseCamera(camera, robot, input, world);
const autopilot = createAutopilot(world, robot, mission);
const radar = createRadar(document.querySelector('#radar-canvas'), world, robot, mission, autopilot);

let started = false;
let completeHandled = false;
let startTime = 0;
let last = performance.now();
let bootDone = false;
const bootStart = performance.now();
let lastZoneNotified = null;
let lastEvidenceConfirmed = false;
let debugControls = null;
let ready = false;
let lastAutoPhase = 'idle';

locomotion.reset();
locomotion.onFootstep = (_index, strength) => {
  chase.impulse(strength);
  audio.footstep(strength);
};

const bootStages = [
  [0, '正在建立虚拟救援链路'],
  [22, '正在加载 ISR 18 自由度模型'],
  [43, '正在部署六足步态解算器'],
  [61, '正在构建临川市 7 号街区'],
  [79, '正在校准九类传感器通道'],
  [91, '正在同步任务与遥测数据'],
  [100, '链路就绪 · 等待操作员接入']
];

function updateBoot() {
  if (bootDone) return;
  const progress = clamp((performance.now() - bootStart) / 1650, 0, 1);
  const pct = Math.round(progress * 100);
  bootProgress.style.width = `${pct}%`;
  bootPct.textContent = `${pct}%`;
  const stage = bootStages.reduce((best, cur) => pct >= cur[0] ? cur : best, bootStages[0]);
  bootStatus.textContent = stage[1];
  if (progress >= 1) {
    bootDone = true;
    startButton.disabled = false;
  }
}

function resetRound() {
  mission.reset();
  locomotion.reset();
  autopilot.reset();
  lastAutoPhase = 'idle';
  radar.toggle(false);
  hud.setRadar(false);
  hud.setAuto(false, autopilot.state);
  robot.root.position.set(0, 0, 29);
  robot.root.rotation.set(0, 0, 0);
  input.reset();
  input.setEnabled(true);
  chase.reset();
  hud.reset();
  lastZoneNotified = null;
  lastEvidenceConfirmed = false;
  completeHandled = false;
  startTime = performance.now() / 1000;
  started = true;
  hudNode.classList.add('on');
  hud.toast('任务重新开始 · 前往橙色信号区');
}

function startMission() {
  if (!bootDone || started) return;
  audio.start();
  audio.radio();
  started = true;
  startTime = performance.now() / 1000;
  boot.classList.add('out');
  hudNode.classList.add('on');
  chase.reset();
  hud.toast('ISR-06 控制链路已接入');
}

function toggleRadar(force) {
  const visible = radar.toggle(force);
  hud.setRadar(visible);
  if (visible) radar.resize();
}

function toggleAuto(force) {
  const active = autopilot.toggle(force);
  hud.setAuto(active, autopilot.state);
  if (active) {
    hud.toast('自动寻人已启动 · 抵达搜索区后自动扫描');
    audio.radio();
  } else {
    hud.toast('自动寻人已停止');
  }
}

function handleActions() {
  if (input.consume('gait')) {
    locomotion.state.gaitMode = locomotion.state.gaitMode === 'tripod' ? 'wave' : 'tripod';
    hud.toast(locomotion.state.gaitMode === 'tripod' ? '步态切换 · 三角步态' : '步态切换 · 波动步态');
    audio.radio();
  }
  if (input.consume('help')) hud.toggleHelp();
  if (input.consume('collision')) {
    const visible = world.toggleCollisionDebug();
    hud.toast(visible ? '碰撞调试已开启' : '碰撞调试已关闭');
  }
  if (input.consume('radar')) toggleRadar();
  if (input.consume('auto')) toggleAuto();
  if (input.consume('mute')) {
    audio.start();
    hud.setMuted(audio.mute());
  }
  if (input.consume('escape')) {
    hud.toggleHelp(false);
    input.releaseLock();
  }
  if (input.consume('interact')) {
    if (mission.confirm()) {
      audio.confirm();
      hud.toast(mission.state.complete ? '全部数据已上传 · 演练完成' : '疑似目标已确认并上传');
      if (mission.state.complete) {
        completeHandled = true;
        audio.complete();
        input.releaseLock();
      }
    } else {
      hud.toast('当前没有可上传的目标证据');
    }
  }
}

function updateCinematicCamera(time) {
  const t = time * .085;
  const radius = 3.05;
  camera.position.set(
    robot.root.position.x + Math.sin(t + 1.25) * radius,
    1.34 + Math.sin(t * .7) * .16,
    robot.root.position.z + Math.cos(t + 1.25) * radius
  );
  camera.lookAt(robot.root.position.x, .34, robot.root.position.z);
}

const aimPoint = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
function updateAim() {
  raycaster.setFromCamera(center, camera);
  aimPoint.copy(camera.position).addScaledVector(raycaster.ray.direction, 18);
  input.state.aimPoint = aimPoint;
}

function updateMissionSystems(dt, controls) {
  const currentZone = mission.state.activeZone;
  const lineOfSight = !currentZone || world.hasLineOfSight(robot.root.position, currentZone.victimWorld);
  const state = mission.update(dt, {
    position: robot.root.position,
    speed: locomotion.state.speed,
    scanning: !!controls.scan,
    lineOfSight
  });
  if (state.activeZone && state.activeZone.id !== lastZoneNotified) {
    lastZoneNotified = state.activeZone.id;
    hud.toast(`进入搜索区 ${state.activeZone.id} · ${state.activeZone.label}`);
    audio.radio();
  }
  const evidenceReady = !!(state.activeZone?.evidence.confirmed && !state.activeZone.evidence.uploaded);
  if (evidenceReady && !lastEvidenceConfirmed) {
    hud.toast('多源证据收敛 · 疑似生命信号', 3000);
    audio.radio();
  }
  lastEvidenceConfirmed = evidenceReady;
  return state;
}

function handleComplete(state) {
  if (!state.complete || completeHandled) return;
  completeHandled = true;
  autopilot.toggle(false);
  hud.setAuto(false, autopilot.state);
  audio.complete();
  input.releaseLock();
}

const sensors = {};
function updateHUD(time, missionState) {
  const imu = { roll: robot.body.rotation.z, pitch: robot.body.rotation.x };
  const snapshot = mission.sensors(locomotion.state, imu);
  Object.assign(sensors, snapshot);
  hud.update({
    locomotion: locomotion.state,
    mission,
    sensors,
    camera,
    robot,
    time: (performance.now() / 1000) - startTime
  });
}

function animate(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  const elapsed = now / 1000;
  updateBoot();

  const controls = input.getControls();
  const mergedControls = {
    throttle: debugControls?.throttle ?? controls.throttle,
    turn: debugControls?.turn ?? controls.turn,
    boost: debugControls?.boost ?? controls.boost,
    brake: debugControls?.brake ?? controls.brake,
    scan: debugControls?.scan ?? controls.scan
  };

  if (started) {
    if (!mission.state.complete) {
      handleActions();
      let activeControls = mergedControls;
      if (autopilot.state.enabled) {
        activeControls = autopilot.update(now) || mergedControls;
      }
      locomotion.update(dt, activeControls);
      const missionState = updateMissionSystems(dt, activeControls);
      updateAim();
      chase.update(dt, locomotion.state.speed);
      updateHUD(elapsed, missionState);
      hud.setAuto(autopilot.state.enabled, autopilot.state);
      if (autopilot.state.phase === 'awaiting-confirm' && lastAutoPhase !== 'awaiting-confirm') {
        hud.toast('自动寻人发现疑似人员 · 请人工确认', 3200);
        audio.radio();
      }
      lastAutoPhase = autopilot.state.phase;
      if (radar.visible) radar.update(elapsed);
      handleComplete(missionState);
      world.update(dt, elapsed, robot.root.position, locomotion.state.speed, mission.state.scanning);
      audio.update(dt, {
        speed: locomotion.state.speed,
        moving: locomotion.state.moving,
        scanning: mission.state.scanning
      });
    } else {
      robot.tick(dt, { accel: 0, turnRate: 0, pressures: locomotion.state.footPressures });
      chase.update(dt, 0);
      world.update(dt, elapsed, robot.root.position, 0, false);
      updateHUD(elapsed, mission.state);
    }
  } else {
    locomotion.update(dt, { throttle: 0, turn: 0, brake: true, scan: false });
    updateCinematicCamera(elapsed);
    world.update(dt, elapsed, robot.root.position, 0, false);
  }

  if ((window.__ISR__?.frameNo || 0) % 2 === 0) renderer.shadowMap.needsUpdate = true;
  post.render();
  if (window.__ISR__) window.__ISR__.frameNo = (window.__ISR__.frameNo || 0) + 1;
  if (!ready) {
    ready = true;
    window.__ISR__.ready = true;
  }
}

renderer.setAnimationLoop(animate);

addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
  if (radar.visible) radar.resize();
});

document.addEventListener('pointerlockchange', () => {
  if (started && document.pointerLockElement !== canvas && !mission.state.complete) {
    hud.setPause(true);
  } else {
    hud.setPause(false);
  }
});

canvas.addEventListener('dblclick', () => {
  if (started) input.requestLock();
});
startButton.addEventListener('click', startMission);
document.querySelector('#help-btn').addEventListener('click', () => hud.toggleHelp());
document.querySelector('#radar-btn').addEventListener('click', () => toggleRadar());
document.querySelector('#auto-btn').addEventListener('click', () => toggleAuto());
document.querySelector('#radar-close').addEventListener('click', () => toggleRadar(false));
document.querySelector('#help-close').addEventListener('click', () => hud.toggleHelp(false));
document.querySelector('#mute-btn').addEventListener('click', () => {
  audio.start();
  hud.setMuted(audio.mute());
});
document.querySelector('#restart-btn').addEventListener('click', resetRound);

window.__ISR__ = {
  ready: false,
  robot,
  world,
  mission,
  locomotion,
  physics,
  autopilot,
  radar,
  renderer,
  renderBackend: post.isWebGPU ? 'webgpu' : 'webgl2',
  state() {
    return {
      started,
      ready,
      complete: mission.state.complete,
      zone: mission.state.activeZone?.id || null,
      uploading: mission.state.uploadedCount,
      scan: mission.state.scanProgress,
      speed: locomotion.state.speed,
      gait: locomotion.state.gaitMode,
      position: robot.root.position.toArray(),
      stance: locomotion.state.stanceCount,
      scale: robot.root.scale.x,
      thermal: mission.state.thermalReading,
      contacts: mission.state.contacts.length,
      auto: autopilot.state.enabled,
      autoPhase: autopilot.state.phase,
      radar: radar.visible
    };
  },
  teleportToZone(index) {
    const zone = world.searchZones[index];
    if (!zone) return false;
    robot.root.position.set(zone.position.x, 0, zone.position.z);
    robot.root.rotation.y = 0;
    locomotion.state.heading = 0;
    locomotion.state.speed = 0;
    locomotion.state.turnRate = 0;
    locomotion.state.feetReady = false;
    return true;
  },
  setScanning(value) {
    debugControls ||= {};
    debugControls.scan = !!value;
  },
  setControls(value) {
    debugControls ||= {};
    Object.assign(debugControls, value || {});
  },
  clearControls() { debugControls = null; },
  setGait(mode) { locomotion.state.gaitMode = mode === 'wave' ? 'wave' : 'tripod'; },
  toggleAuto(force) { toggleAuto(force); },
  toggleRadar(force) { toggleRadar(force); },
  confirmTarget() {
    if (mission.state.activeZone && !mission.state.activeZone.evidence.confirmed) {
      mission.forceScan(mission.state.activeZone);
    }
    return mission.confirm();
  },
  forceScan() {
    const zone = mission.state.activeZone || world.searchZones.find((z) => !z.evidence.uploaded);
    return mission.forceScan(zone);
  },
  simulate(seconds = 1, controls = {}) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.ceil(seconds / dt));
    const merged = {
      throttle: controls.throttle || 0,
      turn: controls.turn || 0,
      boost: !!controls.boost,
      brake: !!controls.brake,
      scan: !!controls.scan
    };
    for (let i = 0; i < steps; i++) {
      const nowSim = performance.now() + i * dt * 1000;
      const active = autopilot.state.enabled ? (autopilot.update(nowSim) || merged) : merged;
      locomotion.update(dt, active);
      const currentZone = mission.state.activeZone;
      const lineOfSight = !currentZone || world.hasLineOfSight(robot.root.position, currentZone.victimWorld);
      mission.update(dt, {
        position: robot.root.position,
        speed: locomotion.state.speed,
        scanning: !!active.scan,
        lineOfSight
      });
      world.update(dt, nowSim / 1000, robot.root.position, locomotion.state.speed, mission.state.scanning);
    }
    chase.update(1 / 30, locomotion.state.speed);
    hud.setAuto(autopilot.state.enabled, autopilot.state);
    if (radar.visible) radar.update(performance.now() / 1000);
    updateHUD(performance.now() / 1000, mission.state);
    post.render();
    return this.state();
  },
  restart: resetRound
};
