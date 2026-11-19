import { clamp, damp, fuseEvidence } from './core.js';

export function scanRate(speed) {
  const s = Math.abs(speed || 0);
  return s < .08 ? 1 : clamp(.58 - s * .16, .12, .58);
}

export function canConfirm(target) {
  return !!(target && target.confirmed && !target.uploaded);
}


export function thermalReading({ ambient = 19, body = 36.8, proximity = 0, stationary = false, lineOfSight = true }) {
  if (!lineOfSight || proximity <= .12) return ambient + Math.max(0, proximity) * 1.2;
  const exposure = stationary ? (.66 + clamp(proximity, 0, 1) * .34) : clamp(proximity, 0, 1) * .46;
  return ambient + (body - ambient) * exposure;
}

export function isHumanThermal(temperature) {
  return temperature >= 34.5;
}

export function buildEvidence({ distance, radius, intensity, thermal = null, thermalDetected = false }) {
  const proximity = 1 - clamp(distance / Math.max(radius, .001), 0, 1);
  const heat = thermal !== null
    ? clamp((thermal - 19) / (36.8 - 19), 0, .99)
    : clamp(intensity * (.6 + proximity * .4) + (Math.random() - .5) * .025, 0, .98);
  const presence = clamp(intensity * (.54 + proximity * .38) + (Math.random() - .5) * .035, 0, .98);
  const audio = clamp(intensity * (.42 + proximity * .42) + (Math.random() - .5) * .045, 0, .98);
  const fused = fuseEvidence({ heat, presence, audio });
  return {
    heat, presence, audio,
    ...fused,
    confirmed: thermal !== null ? (thermalDetected && fused.hits >= 2) : fused.confirmed,
    thermalDetected,
    distance,
    samples: 3 + Math.floor(Math.random() * 5)
  };
}

export function createMission(zones) {
  const state = {
    activeZone: null, distance: Infinity, scanProgress: 0, scanning: false,
    speed: 0, mode: 'MOVE', uploadedCount: 0, complete: false, evidence: null,
    targetVisible: false, message: '', lastZoneId: null, thermalReading: 19.2, contacts: []
  };
  const mission = {
    state,
    update(dt, { position, speed, scanning, lineOfSight = true }) {
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
      const proximity = inside ? 1 - clamp(bestDistance / state.activeZone.radius, 0, 1) : 0;
      if (inside) {
        const ambient = state.activeZone.ambientTemp ?? 19;
        const body = state.activeZone.bodyTemp ?? 36.8;
        const canSense = state.mode === 'STOP' && proximity > .24 && lineOfSight;
        const targetTemp = canSense
          ? thermalReading({ ambient, body, proximity, stationary: true, lineOfSight: true })
          : ambient + proximity * 3.2;
        state.activeZone.heatReading = damp(state.activeZone.heatReading ?? ambient, targetTemp, canSense ? 1.05 : .28, dt);
        state.thermalReading = state.activeZone.heatReading;
        if (!state.activeZone.evidence.thermalDetected && isHumanThermal(state.activeZone.heatReading) && proximity > .28 && lineOfSight) {
          state.activeZone.evidence.thermalDetected = true;
          state.activeZone.contactVisible = true;
          state.message = `搜索区 ${state.activeZone.id} · 检测到异常体温`;
        }
      } else {
        state.thermalReading = 19.2;
      }
      state.scanning = !!(scanning && inside && !state.activeZone.evidence.uploaded);
      if (state.scanning) {
        const rate = scanRate(speed);
        state.scanProgress = clamp(state.scanProgress + dt * rate / 4.15, 0, 1);
        if (state.scanProgress >= 1 && !state.activeZone.evidence.confirmed) {
          const evidence = buildEvidence({
            distance: bestDistance,
            radius: state.activeZone.radius,
            intensity: state.activeZone.intensity,
            thermal: state.activeZone.heatReading,
            thermalDetected: !!state.activeZone.evidence.thermalDetected
          });
          Object.assign(state.activeZone.evidence, evidence);
          state.evidence = state.activeZone.evidence;
        }
      } else if (!inside) {
        state.scanProgress = Math.max(0, state.scanProgress - dt * .42);
      }
      state.contacts = zones.filter((zone) => zone.contactVisible || zone.evidence.thermalDetected || zone.evidence.confirmed).map((zone) => ({
        id: zone.id,
        label: zone.label,
        position: zone.victimWorld || zone.position,
        temperature: zone.heatReading ?? zone.ambientTemp ?? 19,
        confidence: zone.evidence.confirmed ? zone.evidence.confidence : clamp(state.scanProgress * .55 + .28, 0, .82),
        confirmed: !!zone.evidence.confirmed,
        uploaded: !!zone.evidence.uploaded
      }));
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
      zone.heatReading = zone.bodyTemp ?? 36.8;
      zone.contactVisible = true;
      Object.assign(zone.evidence, buildEvidence({ distance: 0, radius: zone.radius, intensity: Math.max(.86, zone.intensity), thermal: zone.heatReading, thermalDetected: true }));
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
        thermal: { label: '温度', value: `${(state.thermalReading || 19.2).toFixed(1)}°C`, level: clamp(((state.thermalReading || 19.2) - 19) / 18, .03, 1) },
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
      state.thermalReading = 19.2;
      state.contacts = [];
      zones.forEach((zone) => {
        zone.heatReading = zone.ambientTemp ?? 19;
        zone.contactVisible = false;
        Object.assign(zone.evidence, { heat: 0, presence: 0, audio: 0, confidence: 0, confirmed: false, uploaded: false, thermalDetected: false });
      });
    }
  };
  return mission;
}
