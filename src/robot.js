import * as THREE from 'three';
import { solveLegIK, damp, ROBOT_SCALE } from './core.js';

const LEG_LAYOUT = [
  { id: 'LF', side: -1, x: -.82, z: -1.12, phase: 0 },
  { id: 'LM', side: -1, x: -.96, z: 0, phase: 1 },
  { id: 'LR', side: -1, x: -.82, z: 1.12, phase: 2 },
  { id: 'RF', side: 1, x: .82, z: -1.12, phase: 3 },
  { id: 'RM', side: 1, x: .96, z: 0, phase: 4 },
  { id: 'RR', side: 1, x: .82, z: 1.12, phase: 5 }
];

const METRICS = { l1: .32, l2: .8, l3: 1.16, bodyY: 1.28, footY: .055 };
const UP = new THREE.Vector3(0, 1, 0);

function linkMesh(radius, length, material) {
  const geo = new THREE.CylinderGeometry(radius, radius * .92, length, 10, 1, false);
  geo.rotateZ(Math.PI / 2);
  geo.translate(length / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function jointMesh(radius, material, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, 10), material);
  mesh.castShadow = true;
  return mesh;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wearTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const v = 170 + Math.random() * 70;
    ctx.fillStyle = `rgba(${v},${v},${v},${.1 + Math.random() * .22})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  ctx.strokeStyle = 'rgba(70,70,70,.25)'; ctx.lineWidth = .7;
  for (let i = 0; i < 70; i++) {
    ctx.beginPath();
    const x = Math.random() * 256; const y = Math.random() * 256;
    ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - .5) * 28, y + (Math.random() - .5) * 7); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 1.5);
  return tex;
}

function labelTexture(text, color = '#f5ad51') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = color; ctx.font = '700 48px Bahnschrift, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 63);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMaterials() {
  const wear = wearTexture();
  return {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xd9dbd4, metalness: .18, roughness: .28, roughnessMap: wear,
      clearcoat: .94, clearcoatRoughness: .15, clearcoatRoughnessMap: wear, envMapIntensity: 1.15
    }),
    shellAlt: new THREE.MeshPhysicalMaterial({
      color: 0xb8bdb8, metalness: .26, roughness: .32, clearcoat: .7,
      clearcoatRoughness: .22
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x111719, metalness: .78, roughness: .3 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x899397, metalness: .92, roughness: .18 }),
    black: new THREE.MeshStandardMaterial({ color: 0x070a0b, metalness: .45, roughness: .45 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x080b0b, metalness: .1, roughness: .88 }),
    amber: new THREE.MeshStandardMaterial({
      color: 0xff9a32, emissive: 0xff6a12, emissiveIntensity: 5.2, roughness: .3
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: 0x66eaf5, emissive: 0x27cbdb, emissiveIntensity: 6, roughness: .2
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0xff5437, emissive: 0xe13b22, emissiveIntensity: 4, roughness: .35
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x081316, metalness: .65, roughness: .08, transmission: .15,
      transparent: true, opacity: .94, clearcoat: 1
    })
  };
}

function addFoot(leg, materials) {
  const foot = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(.155, 12, 8), materials.rubber);
  pad.scale.set(1.3, .55, 1.05);
  pad.position.y = -.055;
  pad.castShadow = true;
  foot.add(pad);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.145, .022, 6, 20),
    materials.dark
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -.115;
  foot.add(ring);
  const pressure = new THREE.Mesh(
    new THREE.CircleGeometry(.105, 18),
    new THREE.MeshBasicMaterial({ color: 0x61d6e7, transparent: true, opacity: .38, side: THREE.DoubleSide })
  );
  pressure.rotation.x = -Math.PI / 2;
  pressure.position.y = -.125;
  foot.add(pressure);
  const contact = new THREE.Mesh(
    new THREE.RingGeometry(.18, .24, 24),
    new THREE.MeshBasicMaterial({ color: 0x79e5f2, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -.13;
  foot.add(contact);
  leg.knee.add(foot);
  foot.position.x = METRICS.l3;
  leg.foot = foot;
  leg.pressureLight = pressure;
  leg.contactRing = contact;
}

function createLeg(parent, layout, materials) {
  const group = new THREE.Group();
  group.name = `leg-${layout.id}`;
  const hipYaw = new THREE.Group();
  hipYaw.position.set(layout.x, .02, layout.z);
  group.add(hipYaw);

  const yawJoint = jointMesh(.21, materials.dark, 18);
  yawJoint.scale.y = .78;
  hipYaw.add(yawJoint);

  const hipMarker = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), materials.amber);
  hipMarker.position.set(.02, .17, 0);
  hipYaw.add(hipMarker);
  const coxa = linkMesh(.135, METRICS.l1, materials.dark);
  hipYaw.add(coxa);
  const coxaArmor = linkMesh(.172, METRICS.l1 * .73, materials.shellAlt);
  coxaArmor.position.x = .015;
  hipYaw.add(coxaArmor);

  const hipPitch = new THREE.Group();
  hipPitch.position.x = METRICS.l1;
  hipYaw.add(hipPitch);
  const hipJoint = jointMesh(.2, materials.dark, 18);
  hipJoint.rotation.z = Math.PI / 2;
  hipPitch.add(hipJoint);

  const thigh = linkMesh(.145, METRICS.l2, materials.dark);
  hipPitch.add(thigh);
  const thighArmor = box(.5, .2, .24, materials.shell, METRICS.l2 * .48, .12, 0);
  thighArmor.rotation.z = -.035;
  hipPitch.add(thighArmor);
  const thighStripe = box(.22, .022, .25, materials.amber, METRICS.l2 * .58, .235, 0);
  hipPitch.add(thighStripe);
  const piston = box(METRICS.l2 * .5, .052, .065, materials.dark, METRICS.l2 * .54, .05, .15);
  hipPitch.add(piston);
  const pistonRod = box(.27, .026, .028, materials.steel, METRICS.l2 * .45, .105, .15);
  hipPitch.add(pistonRod);

  const knee = new THREE.Group();
  knee.position.x = METRICS.l2;
  hipPitch.add(knee);
  const kneeJoint = jointMesh(.19, materials.dark, 18);
  kneeJoint.rotation.z = Math.PI / 2;
  knee.add(kneeJoint);

  const shin = linkMesh(.115, METRICS.l3, materials.dark);
  knee.add(shin);
  const shinArmor = box(.72, .16, .2, materials.shell, METRICS.l3 * .54, -.04, 0);
  knee.add(shinArmor);
  const shinTip = box(.16, .12, .18, materials.shellAlt, METRICS.l3 - .1, -.08, 0);
  knee.add(shinTip);

  const leg = {
    id: layout.id, side: layout.side, anchorLocal: new THREE.Vector3(layout.x, .02, layout.z),
    group, hipYaw, hipPitch, knee, metrics: METRICS,
    footWorld: new THREE.Vector3(layout.side * 2.15, METRICS.footY, layout.z * 1.08),
    swingFrom: new THREE.Vector3(), swingTo: new THREE.Vector3(),
    swingT: 1, inSwing: false, support: true, pressure: .5, contactPulse: 0
  };
  addFoot(leg, materials);
  parent.add(group);
  return leg;
}

function addSensorNode(parent, id, position, color) {
  const group = new THREE.Group();
  group.position.copy(position);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.055, .012, 5, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 })
  );
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(.025, 8, 6),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(core);
  group.userData.ring = ring;
  parent.add(group);
  return { id, group, ring, core, light: null };
}

export function createHexapod() {
  const root = new THREE.Group();
  root.name = 'ISR-SPIDER-6';
  root.scale.setScalar(ROBOT_SCALE);
  const materials = makeMaterials();
  const body = new THREE.Group();
  body.position.y = METRICS.bodyY;
  root.add(body);

  const lower = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 10), materials.dark);
  lower.scale.set(1.02, .34, 1.34);
  lower.position.y = -.08;
  lower.castShadow = true;
  body.add(lower);

  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 12), materials.shell);
  hull.scale.set(.98, .42, 1.27);
  hull.position.y = .08;
  hull.castShadow = true;
  hull.receiveShadow = true;
  body.add(hull);

  const topPlate = box(1.35, .16, 1.68, materials.shellAlt, 0, .34, .12);
  topPlate.rotation.x = -.04;
  body.add(topPlate);
  const spine = box(.5, .13, 1.95, materials.dark, 0, .45, 0);
  body.add(spine);
  const amberSpine = box(.085, .022, 1.35, materials.amber, 0, .535, -.1);
  body.add(amberSpine);

  for (const side of [-1, 1]) {
    const sidePod = box(.3, .34, 1.3, materials.shellAlt, side * .88, .02, .16);
    sidePod.rotation.z = side * -.1;
    body.add(sidePod);
    const vent = box(.018, .18, .74, materials.black, side * 1.045, .02, .18);
    body.add(vent);
    for (let i = 0; i < 4; i++) {
      const fin = box(.025, .11, .08, materials.dark, side * 1.062, .02, -.06 + i * .2);
      body.add(fin);
    }
    const marker = box(.085, .08, .26, materials.amber, side * .57, .15, -1.16);
    marker.rotation.x = -.22;
    body.add(marker);
  }

  const frontBumper = box(1.62, .2, .34, materials.shellAlt, 0, -.03, -1.22);
  frontBumper.rotation.x = .12;
  body.add(frontBumper);
  const frontDark = box(1.34, .12, .12, materials.black, 0, -.13, -1.36);
  body.add(frontDark);

  const sensorModule = new THREE.Group();
  sensorModule.position.set(0, .5, -.12);
  const moduleBase = box(.72, .16, .72, materials.dark, 0, 0, 0);
  sensorModule.add(moduleBase);
  const moduleShell = box(.58, .09, .58, materials.shellAlt, 0, .105, 0);
  sensorModule.add(moduleShell);
  const lidarBase = new THREE.Mesh(new THREE.CylinderGeometry(.18, .21, .08, 20), materials.dark);
  lidarBase.position.y = .2; sensorModule.add(lidarBase);
  const lidarDome = new THREE.Mesh(new THREE.CylinderGeometry(.13, .155, .15, 20), materials.glass);
  lidarDome.position.y = .3; sensorModule.add(lidarDome);
  const lidarRing = new THREE.Mesh(new THREE.TorusGeometry(.15, .018, 6, 22), materials.cyan);
  lidarRing.rotation.x = Math.PI / 2; lidarRing.position.y = .235; sensorModule.add(lidarRing);
  body.add(sensorModule);

  for (const side of [-1, 1]) {
    const guard = new THREE.Group();
    const postA = box(.08, .36, .08, materials.dark, side * .58, .5, -.45);
    const postB = box(.08, .36, .08, materials.dark, side * .58, .5, .46);
    const rail = box(.08, .075, .96, materials.shellAlt, side * .58, .69, 0);
    guard.add(postA, postB, rail);
    body.add(guard);
  }

  const rearModule = box(.92, .24, .34, materials.shellAlt, 0, .17, .93);
  rearModule.rotation.x = -.12;
  body.add(rearModule);
  const rearGrille = box(.58, .13, .035, materials.dark, 0, .19, 1.11);
  body.add(rearGrille);
  for (let i = 0; i < 7; i++) body.add(box(.035, .105, .045, materials.steel, -.24 + i * .08, .19, 1.135));

  const seamMat = new THREE.MeshStandardMaterial({ color: 0x4b5354, metalness: .65, roughness: .32 });
  body.add(box(.035, .025, 1.36, seamMat, -.34, .435, .06));
  body.add(box(.035, .025, 1.36, seamMat, .34, .435, .06));
  body.add(box(1.12, .02, .03, seamMat, 0, .442, -.44));
  body.add(box(1.12, .02, .03, seamMat, 0, .442, .53));

  const boltGeo = new THREE.CylinderGeometry(.034, .034, .022, 8);
  const bolts = new THREE.InstancedMesh(boltGeo, materials.dark, 24);
  const boltMatrix = new THREE.Matrix4();
  const boltQuat = new THREE.Quaternion();
  let boltIndex = 0;
  for (let i = 0; i < 8; i++) {
    const z = -.63 + i * .18;
    for (const x of [-.54, .54]) {
      boltMatrix.compose(new THREE.Vector3(x, .455, z), boltQuat, new THREE.Vector3(1, 1, 1));
      bolts.setMatrixAt(boltIndex++, boltMatrix);
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = -.46 + i * .13;
    for (const z of [-.75, .78]) {
      boltMatrix.compose(new THREE.Vector3(x, .455, z), boltQuat, new THREE.Vector3(1, 1, 1));
      bolts.setMatrixAt(boltIndex++, boltMatrix);
    }
  }
  bolts.instanceMatrix.needsUpdate = true;
  body.add(bolts);

  for (const side of [-1, 1]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(.62, .155),
      new THREE.MeshBasicMaterial({ map: labelTexture(side < 0 ? 'ISR // 06' : 'SPIDER-6'), transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false })
    );
    decal.position.set(side * 1.056, .055, .1);
    decal.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    body.add(decal);
  }

  const head = new THREE.Group();
  head.position.set(0, .25, -1.31);
  body.add(head);
  const headBase = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 10), materials.dark);
  headBase.scale.set(1.05, .82, .82);
  headBase.castShadow = true;
  head.add(headBase);
  const cameraShell = box(.46, .25, .24, materials.shell, 0, .02, -.18);
  cameraShell.rotation.x = -.06;
  head.add(cameraShell);
  const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .08, 22), materials.dark);
  lensRing.rotation.x = Math.PI / 2;
  lensRing.position.set(0, .02, -.33);
  head.add(lensRing);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(.09, 22), materials.glass);
  lens.position.set(0, .02, -.378);
  head.add(lens);
  const lensGlow = new THREE.Mesh(
    new THREE.RingGeometry(.065, .092, 24),
    new THREE.MeshBasicMaterial({ color: 0x61d6e7, transparent: true, opacity: .9, side: THREE.DoubleSide })
  );
  lensGlow.position.set(0, .02, -.382);
  head.add(lensGlow);

  const headLight = new THREE.SpotLight(0xbdefff, 18, 24, .34, .62, 1.4);
  headLight.position.set(0, .05, -.2);
  head.add(headLight);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(0, -.25, -9);
  root.add(headTarget);
  headLight.target = headTarget;

  const antenna = new THREE.Group();
  antenna.position.set(.38, .36, .65);
  body.add(antenna);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .48, 8), materials.dark);
  mast.position.y = .24;
  antenna.add(mast);
  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), materials.red);
  antennaTip.position.y = .5;
  antenna.add(antennaTip);

  const warning = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 8), materials.amber);
  warning.position.set(-.62, .48, .65);
  body.add(warning);

  const sensorDefs = [
    ['rgb', new THREE.Vector3(0, .02, -.38), 0x61d6e7],
    ['thermal', new THREE.Vector3(.22, .17, -.3), 0xff8050],
    ['radar', new THREE.Vector3(-.25, .15, -.28), 0x64d9ea],
    ['audio', new THREE.Vector3(.5, .5, .35), 0xa4e9f2],
    ['gas', new THREE.Vector3(-.64, .2, -.9), 0xf4ad52],
    ['range', new THREE.Vector3(.64, .2, -.9), 0x79e6f3],
    ['imu', new THREE.Vector3(0, .51, .18), 0xb7d9e2],
    ['fsr', new THREE.Vector3(0, .1, 1.09), 0xf4ad52],
    ['power', new THREE.Vector3(-.72, .22, .85), 0x8fe87c]
  ];
  const sensorNodes = new Map();
  sensorDefs.forEach(([id, pos, color]) => {
    const node = addSensorNode(body, id, pos, color);
    sensorNodes.set(id, node);
  });

  const legFrame = new THREE.Group();
  legFrame.name = 'leg-frame';
  legFrame.position.y = METRICS.bodyY;
  root.add(legFrame);
  const legs = LEG_LAYOUT.map((layout) => createLeg(legFrame, layout, materials));

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128; shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d');
  const shadowGrad = shadowCtx.createRadialGradient(64, 64, 5, 64, 64, 62);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,.62)');
  shadowGrad.addColorStop(.48, 'rgba(0,0,0,.25)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  shadowCtx.fillStyle = shadowGrad;
  shadowCtx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const robotShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 4.1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture, transparent: true, opacity: .58, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    })
  );
  robotShadow.rotation.x = -Math.PI / 2;
  robotShadow.position.y = .024;
  robotShadow.renderOrder = 3;
  root.add(robotShadow);

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const robot = {
    root, body, head, headLight, lensGlow, materials, legs, sensorNodes, metrics: METRICS,
    bodyLean: new THREE.Vector2(), headYaw: 0, headPitch: 0,
    setFootWorld(index, worldTarget) {
      const leg = legs[index];
      const hipWorld = new THREE.Vector3();
      leg.hipYaw.getWorldPosition(hipWorld);
      const hipLocal = root.worldToLocal(hipWorld.clone());
      const targetLocal = root.worldToLocal(worldTarget.clone());
      const result = solveLegIK(
        { x: hipLocal.x, y: hipLocal.y, z: hipLocal.z },
        { x: targetLocal.x, y: targetLocal.y, z: targetLocal.z },
        METRICS
      );
      leg.hipYaw.rotation.y = result.yaw;
      leg.hipPitch.rotation.z = result.hip;
      leg.knee.rotation.z = result.knee;
      leg.foot.rotation.z = -(result.hip + result.knee);
      leg.ik = result;
      return result;
    },
    setJointAngles(index, yaw, hip, knee) {
      const leg = legs[index];
      leg.hipYaw.rotation.y = yaw;
      leg.hipPitch.rotation.z = hip;
      leg.knee.rotation.z = knee;
      leg.foot.rotation.z = -(hip + knee);
    },
    setHeadAim(worldPoint, dt) {
      const local = head.parent.worldToLocal(worldPoint.clone());
      const desiredYaw = Math.atan2(-(local.x - head.position.x), -(local.z - head.position.z));
      const desiredPitch = Math.atan2(local.y - head.position.y, Math.hypot(local.x - head.position.x, local.z - head.position.z));
      this.headYaw = damp(this.headYaw, THREE.MathUtils.clamp(desiredYaw, -.7, .7), 5, dt);
      this.headPitch = damp(this.headPitch, THREE.MathUtils.clamp(desiredPitch, -.5, .5), 5, dt);
      head.rotation.y = this.headYaw;
      head.rotation.x = this.headPitch;
    },
    tick(dt, state = {}) {
      const leanTargetX = (state.accel || 0) * -.025;
      const leanTargetZ = (state.turnRate || 0) * -.075;
      this.bodyLean.x = damp(this.bodyLean.x, leanTargetX, 7, dt);
      this.bodyLean.y = damp(this.bodyLean.y, leanTargetZ, 7, dt);
      body.rotation.x = this.bodyLean.x + Math.sin(performance.now() * .0017) * .004;
      body.rotation.z = this.bodyLean.y;
      warning.material.emissiveIntensity = 3.5 + Math.sin(performance.now() * .008) * 1.8;
      lensGlow.material.opacity = .72 + Math.sin(performance.now() * .006) * .17;
      legs.forEach((leg, i) => {
        leg.contactPulse = Math.max(0, leg.contactPulse - dt * 3.4);
        leg.contactRing.material.opacity = leg.contactPulse;
        leg.contactRing.scale.setScalar(1 + (1 - leg.contactPulse) * .6);
        leg.pressureLight.material.opacity = .18 + leg.pressure * .46;
        if (state.pressures) leg.pressure = state.pressures[i];
      });
    },
    markContact(index, strength = 1) {
      const leg = legs[index];
      if (!leg) return;
      leg.contactPulse = Math.min(1, strength);
    }
  };
  return robot;
}
