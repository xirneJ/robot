import { clamp, fuseEvidence } from './core.js';

export function scanRate(speed) {
  const s = Math.abs(speed || 0);
  return s < .08 ? 1 : clamp(.58 - s * .16, .12, .58);
}

export function canConfirm(target) {
  return !!(target && target.confirmed && !target.uploaded);
}

export function buildEvidence({ distance, radius, intensity }) {
  const proximity = 1 - clamp(distance / Math.max(radius, .001), 0, 1);
  const heat = clamp(intensity * (.6 + proximity * .4) + (Math.random() - .5) * .025, 0, .98);
  const presence = clamp(intensity * (.54 + proximity * .38) + (Math.random() - .5) * .035, 0, .98);
  const audio = clamp(intensity * (.42 + proximity * .42) + (Math.random() - .5) * .045, 0, .98);
  return {
    heat, presence, audio,
    ...fuseEvidence({ heat, presence, audio }),
    distance,
    samples: 3 + Math.floor(Math.random() * 5)
  };
}

export function createMission(zones) {
  const state = {
    activeZone: null, distance: Infinity, scanProgress: 0, scanning: false,
    speed: 0, mode: 'MOVE', uploadedCount: 0, complete: false, evidence: null,
    targetVisible: false, message: '', lastZoneId: null
  };
  const mission = {
    state,
    update(dt, { position, speed, scanning }) {
      state.speed = speed;
      state.mode = Math.abs(speed) < .09 ? 'STOP' : 'MOVE';
      let best = null; let bestDistance = Infinity;
      for (const zone of zones) {
        const d = Math.hypot(position.x - zone.position.x, position.z - zone.position.z);
        if (d < bestDistance) { bestDistance = d; best = zone; }
      }
      state.distance = bestDistance;
      const inside = best && bestDistance <= best.radius;
      const nextZone = inside ? best : null;
      if (nextZone !== state.activeZone) {
        state.activeZone = nextZone;
        state.scanProgress = nextZone && nextZone.evidence.confirmed ? 1 : 0;
        state.evidence = nextZone && nextZone.evidence.confirmed ? nextZone.evidence : null;
      }
      state.targetVisible = !!inside && !state.activeZone?.evidence.uploaded;
      state.scanning = !!(scanning && inside && !state.activeZone.evidence.uploaded);
      if (state.scanning) {
        const rate = scanRate(speed);
        state.scanProgress = clamp(state.scanProgress + dt * rate / 4.15, 0, 1);
        if (state.scanProgress >= 1 && !state.activeZone.evidence.confirmed) {
          const evidence = buildEvidence({
            distance: bestDistance,
            radius: state.activeZone.radius,
            intensity: state.activeZone.intensity
          });
          Object.assign(state.activeZone.evidence, evidence);
          state.evidence = state.activeZone.evidence;
        }
      } else if (!inside) {
        state.scanProgress = Math.max(0, state.scanProgress - dt * .42);
      }
      return state;
    },
    confirm() {
      const zone = state.activeZone;
      if (!zone || !canConfirm(zone.evidence)) return false;
      zone.evidence.uploaded = true;
      state.uploadedCount++;
      state.message = `目标 ${zone.id} · ${zone.label} 已上传`;
      state.complete = zones.every((z) => z.evidence.uploaded);
      state.scanProgress = 1;
      return true;
    },
    forceScan(zone) {
      if (!zone) return false;
      Object.assign(zone.evidence, buildEvidence({ distance: 0, radius: zone.radius, intensity: Math.max(.86, zone.intensity) }));
      state.activeZone = zone;
      state.scanProgress = 1;
      state.evidence = zone.evidence;
      return true;
    },
    sensors(gaitState, imu = { roll: 0, pitch: 0 }) {
      const zone = state.activeZone;
      const proximity = zone ? 1 - clamp(state.distance / zone.radius, 0, 1) : 0;
      const active = state.scanning ? 1 : .28;
      return {
        rgb: { label: 'RGB', value: state.mode === 'STOP' ? '稳定' : '抖动补偿', level: state.scanning ? .92 : .58 },
        thermal: { label: '热像', value: `${(proximity * 34 + 22).toFixed(1)}°C`, level: proximity * .9 + .05 },
        radar: { label: '毫米波', value: state.mode === 'STOP' ? `${Math.round(30 + proximity * 55)}%` : '降权', level: state.mode === 'STOP' ? proximity : proximity * .35 },
        audio: { label: '声音', value: state.mode === 'STOP' ? `${Math.round(18 + proximity * 66)} dB` : '降权', level: state.mode === 'STOP' ? proximity : proximity * .28 },
        gas: { label: '气体', value: `${Math.round(12 + proximity * 38)} ppm`, level: .12 + proximity * .36 },
        range: { label: '测距', value: `${(2.2 + (1 - proximity) * 10).toFixed(1)} m`, level: clamp(1 - proximity, .08, .92) },
        imu: { label: '姿态', value: `${(imu.pitch * 57.3).toFixed(1)}°`, level: clamp(Math.abs(imu.pitch) * .8 + .12, .08, .75) },
        fsr: { label: '足压', value: gaitState.stanceCount === 6 ? '全着地' : `${gaitState.stanceCount} 支撑`, level: gaitState.stanceCount / 6 },
        power: { label: '电源', value: `${(24.7 + Math.sin(performance.now() * .0007) * .1).toFixed(1)} V`, level: .72 + active * .08 }
      };
    },
    reset() {
      state.activeZone = null; state.distance = Infinity; state.scanProgress = 0;
      state.scanning = false; state.speed = 0; state.mode = 'MOVE'; state.uploadedCount = 0;
      state.complete = false; state.evidence = null; state.targetVisible = false; state.message = '';
      zones.forEach((zone) => {
        Object.assign(zone.evidence, { heat: 0, presence: 0, audio: 0, confidence: 0, confirmed: false, uploaded: false });
      });
    }
  };
  return mission;
}
