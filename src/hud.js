import * as THREE from 'three';
import { clamp } from './core.js';

const CARDINALS = [
  [0, '北'], [45, '东北'], [90, '东'], [135, '东南'], [180, '南'], [225, '西南'], [270, '西'], [315, '西北']
];
const SENSOR_IDS = ['rgb', 'thermal', 'radar', 'audio', 'gas', 'range', 'imu', 'fsr', 'power'];
const projected = new THREE.Vector3();

function cardinalName(deg) {
  const d = ((deg % 360) + 360) % 360;
  return CARDINALS.reduce((best, cur) => {
    const dd = Math.abs(((d - cur[0] + 540) % 360) - 180);
    const bd = Math.abs(((d - best[0] + 540) % 360) - 180);
    return dd < bd ? cur : best;
  }, CARDINALS[0])[1];
}

export function createHUD() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const sensorGrid = el('sensor-grid');
  const sensorCells = new Map();
  for (const id of SENSOR_IDS) {
    const cell = document.createElement('div');
    cell.className = 'sensor-cell';
    cell.dataset.id = id;
    cell.innerHTML = `<div class="sensor-top"><span></span><b></b></div><strong>--</strong><div class="sensor-level"><i></i></div>`;
    sensorGrid.appendChild(cell);
    sensorCells.set(id, cell);
  }

  const track = el('compass-track');
  for (let deg = -360; deg <= 720; deg += 5) {
    const tick = document.createElement('i');
    const major = deg % 45 === 0;
    tick.className = major ? 'major' : '';
    tick.style.left = `${(deg + 360) * 2}px`;
    track.appendChild(tick);
    if (deg % 15 === 0) {
      const label = document.createElement('b');
      const normalized = ((deg % 360) + 360) % 360;
      const card = CARDINALS.find(([d]) => d === normalized);
      label.textContent = card ? card[1] + String(normalized).padStart(3, '0') : String(normalized).padStart(3, '0');
      label.style.left = `${(deg + 360) * 2}px`;
      track.appendChild(label);
    }
  }

  let toastTimer = 0;
  let completeShown = false;
  const api = {
    hud,
    update({ locomotion, mission, sensors, camera, robot, time }) {
      const state = mission.state;
      const speed = Math.abs(locomotion.speed);
      el('speed-value').textContent = speed.toFixed(1);
      el('speed-bar').style.width = `${clamp(speed / 1.34 * 100, 0, 100)}%`;
      el('gait-mode').textContent = locomotion.gaitMode === 'wave' ? '波动步态' : '三角步态';
      el('mode-label').textContent = state.mode === 'STOP' ? '驻停' : '移动';
      el('mode-detail').textContent = state.mode === 'STOP' ? '六足稳定 · 高精度传感' : '步态避障 · 高敏通道降权';
      el('mode-led').parentElement.classList.toggle('mobile', state.mode !== 'STOP');

      const heading = ((robot.root.rotation.y * 180 / Math.PI) % 360 + 360) % 360;
      el('compass-cardinal').textContent = cardinalName(heading);
      el('compass-bearing').textContent = String(Math.round(heading) % 360).padStart(3, '0');
      track.style.transform = `translateX(${-heading * 2}px)`;

      el('mission-progress').style.width = `${state.uploadedCount / 3 * 100}%`;
      el('mission-count').textContent = `${state.uploadedCount} / 3`;
      el('mission-mode').textContent = state.mode === 'STOP' ? '驻停精测' : '移动探测';
      if (state.complete) {
        el('mission-title').textContent = '数据上传完成';
        el('mission-detail').textContent = '指挥中心已接收全部现场数据';
      } else if (state.activeZone) {
        el('mission-title').textContent = `搜索区 ${state.activeZone.id} · 疑似信号`;
        el('mission-detail').textContent = state.activeZone.evidence.thermalDetected
          ? `温度 ${state.thermalReading?.toFixed(1) || '--'}°C · 检测到异常人体热源`
          : (state.mode === 'STOP' ? '保持驻停，温度传感器正在收敛' : '减速驻停可提升温度与生命探测精度');
      } else {
        el('mission-title').textContent = '确认三处生命信号';
        el('mission-detail').textContent = '沿街区搜索，接近橙色信号区';
      }

      const fsrBars = el('fsr-bars').children;
      for (let i = 0; i < 6; i++) {
        const value = locomotion.footPressures[i] || 0;
        fsrBars[i].querySelector('em').style.height = `${clamp(value * 100, 4, 100)}%`;
        fsrBars[i].querySelector('em').style.background = robot.legs[i]?.support === false ? 'rgba(245,173,81,.4)' : '';
      }
      el('fsr-state').textContent = `${locomotion.stanceCount} / 6 支撑`;
      el('joint-state').textContent = locomotion.stanceCount === 6 ? '六足着地' : `${locomotion.stanceCount} 足稳定支撑`;

      const rollEl = el('attitude-roll');
      const pitchEl = el('attitude-pitch');
      const roll = robot.body.rotation.z * 57.3;
      const pitch = robot.body.rotation.x * 57.3;
      rollEl.style.transform = `rotate(${roll - 90}deg)`;
      pitchEl.style.transform = `rotate(${-90 + pitch}deg)`;

      for (const [id, cell] of sensorCells) {
        const data = sensors[id];
        cell.querySelector('.sensor-top span').textContent = data.label;
        cell.querySelector('.sensor-top b').textContent = id.toUpperCase();
        cell.querySelector('strong').textContent = data.value;
        cell.querySelector('.sensor-level i').style.width = `${clamp(data.level * 100, 3, 100)}%`;
      }
      el('sensor-mode').textContent = state.mode === 'STOP' ? '驻停高精度' : '移动降权';

      const zone = state.activeZone;
      const scanPct = Math.round(state.scanProgress * 100);
      el('scan-progress').style.width = `${scanPct}%`;
      el('scan-pct').textContent = `${scanPct}%`;
      el('scan-panel').classList.toggle('active', !!zone || state.scanning);
      el('hud').classList.toggle('scanning', state.scanning);
      if (!zone) {
        el('scan-title').textContent = '区域扫描';
        el('scan-state').textContent = '搜索中';
        el('scan-copy').textContent = '接近橙色信号区后进入扫描范围';
      } else if (zone.evidence.uploaded) {
        el('scan-title').textContent = `搜索区 ${zone.id} · 已上传`;
        el('scan-state').textContent = '完成';
        el('scan-copy').textContent = '前往下一处橙色信号区';
      } else if (zone.evidence.confirmed) {
        el('scan-title').textContent = `搜索区 ${zone.id} · 证据就绪`;
        el('scan-state').textContent = '待确认';
        el('scan-copy').textContent = '按 E 确认目标并上传数据';
      } else if (state.scanning) {
        el('scan-title').textContent = `搜索区 ${zone.id} · ${zone.label}`;
        el('scan-state').textContent = state.mode === 'STOP' ? '融合扫描' : '移动扫描 / 降权';
        el('scan-copy').textContent = state.mode === 'STOP' ? '保持扫描，等待多源证据收敛' : '减速驻停可显著提高扫描速度';
      } else {
        el('scan-title').textContent = `搜索区 ${zone.id} · ${zone.label}`;
        el('scan-state').textContent = '范围内';
        el('scan-copy').textContent = '按住 R 开始多源融合扫描';
      }

      el('target-marker').hidden = true;

      const evidence = zone && zone.evidence.confirmed && !zone.evidence.uploaded ? zone.evidence : null;
      const card = el('evidence-card');
      if (evidence) {
        card.hidden = false;
        el('evidence-id').textContent = zone.id;
        el('evidence-location').textContent = `${zone.label} · ${state.distance.toFixed(1)} m`;
        el('confidence-value').textContent = `${Math.round(evidence.confidence * 100)}%`;
        el('confidence-bar').style.width = `${evidence.confidence * 100}%`;
        for (const key of ['heat', 'presence', 'audio']) {
          el(`ev-${key}`).style.width = `${evidence[key] * 100}%`;
          el(`ev-${key}-value`).textContent = `${Math.round(evidence[key] * 100)}%`;
        }
      } else card.hidden = true;

      if (state.complete && !completeShown) {
        completeShown = true;
        el('final-targets').textContent = String(state.uploadedCount);
        el('final-distance').textContent = Math.round(locomotion.distance);
        const secs = Math.floor(time);
        el('final-time').textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
        el('complete-panel').hidden = false;
      }
    },
    toast(text, duration = 2200) {
      const node = el('toast');
      node.textContent = text;
      node.classList.add('on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => node.classList.remove('on'), duration);
    },
    toggleHelp(force) {
      const node = el('help-panel');
      node.hidden = typeof force === 'boolean' ? !force : !node.hidden;
    },
    setMuted(muted) { el('mute-btn').textContent = muted ? '声音 关' : '声音 开'; },
    setPause(visible) { el('pause-chip').hidden = !visible; },
    setRadar(visible) {
      el('radar-page').hidden = !visible;
      el('radar-btn').classList.toggle('active', visible);
    },
    setAuto(active, autoState = {}) {
      el('auto-btn').classList.toggle('active', !!active);
      el('auto-btn').textContent = active ? '自动寻人中' : '自动寻人 F';
      const text = active ? (autoState.phase === 'scanning' ? '自动扫描' : autoState.phase === 'awaiting-confirm' ? '等待人工确认' : '路径跟随') : '未启用';
      const radarState = el('radar-auto-state');
      if (radarState) radarState.textContent = text;
    },
    reset() {
      completeShown = false;
      el('complete-panel').hidden = true;
      el('evidence-card').hidden = true;
      el('help-panel').hidden = true;
      el('pause-chip').hidden = true;
      el('toast').classList.remove('on');
    }
  };
  return api;
}
