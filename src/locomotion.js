import * as THREE from 'three';
import { clamp, damp, getGaitOffsets, getSwingDuration, smoothstep, stepVelocity, angleDamp, ROBOT_RADIUS } from './core.js';

function localFoot(leg) {
  return new THREE.Vector3(leg.side * 2.22, .055, leg.anchorLocal.z * 1.06);
}

export function createLocomotion(robot, world) {
  const root = robot.root;
  const state = {
    speed: 0, turnRate: 0, heading: 0, gaitMode: 'tripod', moving: false,
    phase: 0, stanceCount: 6, footPressures: [.55, .55, .55, .55, .55, .55],
    stepCount: 0, feetReady: false, accel: 0, lastFootstep: 0, distance: 0,
    collision: false
  };
  const forward = new THREE.Vector3();
  const candidate = new THREE.Vector3();
  const axisCandidate = new THREE.Vector3();
  const tmpWorld = new THREE.Vector3();
  let lastTime = performance.now() * .001;

  function plantInitialFeet() {
    root.updateMatrixWorld(true);
    robot.legs.forEach((leg) => {
      tmpWorld.copy(localFoot(leg));
      root.localToWorld(tmpWorld);
      tmpWorld.y = world.footHeightAt(tmpWorld.x, tmpWorld.z) + .055;
      leg.footWorld.copy(tmpWorld);
      leg.swingFrom.copy(tmpWorld);
      leg.swingTo.copy(tmpWorld);
      leg.swingT = 1;
      leg.inSwing = false;
      leg.windowKey = -1;
      leg.support = true;
    });
    state.feetReady = true;
  }

  function beginSwing(leg, offset) {
    root.updateMatrixWorld(true);
    const targetLocal = localFoot(leg);
    targetLocal.z -= state.speed * .22;
    targetLocal.x += state.turnRate * leg.anchorLocal.z * .12;
    tmpWorld.copy(targetLocal);
    root.localToWorld(tmpWorld);
    tmpWorld.y = world.footHeightAt(tmpWorld.x, tmpWorld.z) + .055;
    leg.swingFrom.copy(leg.footWorld);
    leg.swingTo.copy(tmpWorld);
    leg.swingT = 0;
    leg.inSwing = true;
    leg.windowKey = Math.floor(state.phase + offset);
  }

  function updateFeet(dt, canStep) {
    root.updateMatrixWorld(true);
    const offsets = getGaitOffsets(state.gaitMode);
    const swingWindow = getSwingDuration(state.gaitMode);
    const cadence = state.gaitMode === 'wave' ? 1.15 + Math.abs(state.speed) * .7 : 1.65 + Math.abs(state.speed) * .85;
    if (canStep || robot.legs.some((leg) => leg.inSwing)) {
      state.phase += dt * cadence;
    }
    let stanceCount = 0;
    robot.legs.forEach((leg, i) => {
      const offset = offsets[i];
      const phase = ((state.phase + offset) % 1 + 1) % 1;
      const inWindow = phase < swingWindow;
      if (canStep && inWindow && !leg.inSwing) {
        const key = Math.floor(state.phase + offset);
        if (leg.windowKey !== key) beginSwing(leg, offset);
      }

      if (leg.inSwing) {
        const swingRate = Math.max(3.4, cadence / swingWindow * .84);
        leg.swingT = Math.min(1, leg.swingT + dt * swingRate);
        const t = smoothstep(leg.swingT);
        leg.footWorld.lerpVectors(leg.swingFrom, leg.swingTo, t);
        leg.footWorld.y += Math.sin(Math.PI * leg.swingT) * (state.gaitMode === 'wave' ? .17 : .24);
        leg.support = false;
        if (leg.swingT >= 1) {
          leg.inSwing = false;
          leg.footWorld.copy(leg.swingTo);
          leg.footWorld.y = world.footHeightAt(leg.footWorld.x, leg.footWorld.z) + .055;
          leg.contact = 1;
          state.stepCount++;
          state.lastFootstep = performance.now();
          robot.markContact(i, clamp(.7 + Math.abs(state.speed) * .06, .7, 1));
          if (locomotion.onFootstep) locomotion.onFootstep(i, .35 + Math.min(Math.abs(state.speed), 3) * .08);
        }
      } else {
        leg.support = true;
        stanceCount++;
      }
      const load = leg.support ? .58 + .32 / Math.max(3, stanceCount) : .015;
      leg.pressure = clamp(load + (Math.random() - .5) * .035, .01, .98);
      state.footPressures[i] = leg.pressure;
      let target = leg.footWorld.clone();
      if (world.physics) {
        for (let attempt = 0; attempt < 5; attempt++) {
          robot.setFootWorld(i, target);
          const points = robot.getLegWorldPoints(i);
          const clear = world.physics.segmentClear(points.hip, points.knee, .04) && world.physics.segmentClear(points.knee, points.foot, .043);
          if (clear) break;
          target.lerp(points.hip, .16);
          target.y = Math.max(target.y, leg.footWorld.y + .035 * (attempt + 1));
        }
        leg.footWorld.copy(target);
      }
      robot.setFootWorld(i, leg.footWorld);
    });
    state.stanceCount = stanceCount;
  }

  const locomotion = {
    state,
    update(dt, controls) {
      const now = performance.now() * .001;
      const realDt = clamp(dt || (now - lastTime), .001, .05);
      lastTime = now;
      const throttle = clamp(controls?.throttle || 0, -1, 1);
      const turnInput = clamp(controls?.turn || 0, -1, 1);
      const boost = !!controls?.boost;
      const brake = !!controls?.brake;
      const maxSpeed = boost ? 1.34 : .95;
      const targetSpeed = brake ? 0 : throttle * (throttle < 0 ? .48 : maxSpeed);
      const accelRate = brake ? 2.5 : (Math.abs(targetSpeed) > Math.abs(state.speed) ? .92 : 1.55);
      const oldSpeed = state.speed;
      state.speed = stepVelocity(state.speed, targetSpeed, accelRate, realDt);
      const speedFactor = .32 + Math.min(Math.abs(state.speed) / 2.4, 1) * .68;
      const desiredTurn = brake ? 0 : turnInput * 1.02 * speedFactor;
      state.turnRate = angleDamp(state.turnRate, desiredTurn, realDt, brake ? 7 : 4.6);
      state.accel = (state.speed - oldSpeed) / Math.max(realDt, .001);
      state.heading += state.turnRate * realDt;
      root.rotation.y = state.heading;

      forward.set(-Math.sin(state.heading), 0, -Math.cos(state.heading));
      candidate.copy(root.position).addScaledVector(forward, state.speed * realDt);
      const radius = ROBOT_RADIUS;
      state.collision = false;
      if (world.canMove(candidate.x, candidate.z, radius) && (!world.physics || world.physics.bodyClear(candidate.x, candidate.z, .36, .48))) {
        root.position.copy(candidate);
        state.distance += Math.abs(state.speed * realDt);
      } else {
        axisCandidate.set(candidate.x, root.position.y, root.position.z);
        if (world.canMove(axisCandidate.x, axisCandidate.z, radius)) {
          root.position.x = axisCandidate.x;
          state.distance += Math.abs(state.speed * realDt) * .5;
        } else {
          axisCandidate.set(root.position.x, root.position.y, candidate.z);
          if (world.canMove(axisCandidate.x, axisCandidate.z, radius)) {
            root.position.z = axisCandidate.z;
            state.distance += Math.abs(state.speed * realDt) * .5;
          }
        }
        state.collision = true;
        state.speed *= .45;
      }

      const canStep = Math.abs(state.speed) > .035 || Math.abs(state.turnRate) > .028;
      state.moving = canStep;
      if (!state.feetReady) plantInitialFeet();
      updateFeet(realDt, canStep);
      robot.tick(realDt, {
        accel: state.accel,
        turnRate: state.turnRate,
        pressures: state.footPressures
      });
      return state;
    },
    reset() {
      state.speed = 0;
      state.turnRate = 0;
      state.heading = 0;
      state.gaitMode = 'tripod';
      state.moving = false;
      state.stanceCount = 6;
      state.footPressures = [.55, .55, .55, .55, .55, .55];
      state.phase = 0;
      state.stepCount = 0;
      state.distance = 0;
      state.feetReady = false;
      root.position.set(0, 0, 29);
      root.rotation.set(0, 0, 0);
    }
  };
  return locomotion;
}

export function createChaseCamera(camera, robot, input, world) {
  const desired = new THREE.Vector3();
  const target = new THREE.Vector3();
  const smoothedTarget = new THREE.Vector3(0, 1.15, 0);
  const shake = new THREE.Vector3();
  const state = { yawOffset: 0, pitch: .31, distance: 7.3, shake: 0, initialized: false };
  return {
    state,
    update(dt, speed) {
      const camState = input?.state || {};
      state.yawOffset = camState.cameraYaw || 0;
      state.pitch = clamp(.31 + (camState.cameraPitchOffset || 0), .08, .63);
      const yaw = robot.root.rotation.y + state.yawOffset;
      state.distance = damp(state.distance, 2.42 + Math.abs(speed) * .24 + (camState.zoom || 0), 3.8, dt);
      const horizontal = Math.cos(state.pitch) * state.distance;
      target.set(robot.root.position.x, robot.root.position.y + .31, robot.root.position.z);
      desired.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + Math.sin(state.pitch) * state.distance + .28,
        target.z + Math.cos(yaw) * horizontal
      );
      if (world?.cameraSafePoint) desired.copy(world.cameraSafePoint(target, desired, .2));
      if (!state.initialized) {
        camera.position.copy(desired);
        smoothedTarget.copy(target);
        state.initialized = true;
      }
      const posLambda = 4.2 + Math.abs(speed) * .22;
      camera.position.x = damp(camera.position.x, desired.x, posLambda, dt);
      camera.position.y = damp(camera.position.y, desired.y, posLambda, dt);
      camera.position.z = damp(camera.position.z, desired.z, posLambda, dt);
      smoothedTarget.x = damp(smoothedTarget.x, target.x, 8, dt);
      smoothedTarget.y = damp(smoothedTarget.y, target.y + .05, 8, dt);
      smoothedTarget.z = damp(smoothedTarget.z, target.z, 8, dt);
      state.shake = Math.max(0, state.shake - dt * 2.4);
      const amp = state.shake * .055;
      shake.set((Math.random() - .5) * amp, (Math.random() - .5) * amp, (Math.random() - .5) * amp * .5);
      camera.position.add(shake);
      camera.lookAt(smoothedTarget);
      if (input?.aimPoint) robot.setHeadAim(input.aimPoint, dt);
    },
    impulse(v) { state.shake = Math.min(1, state.shake + v * .35); },
    reset() { state.initialized = false; state.yawOffset = 0; state.shake = 0; }
  };
}
