import * as THREE from 'three';
import { clamp } from './core.js';

const ZONE_DATA = [
  { id: 'A', label: '商铺夹道', x: -8.2, z: 12.5, radius: 3.0, intensity: .82 },
  { id: 'B', label: '高架夹层', x: 3.5, z: -22, radius: 3.3, intensity: .9 },
  { id: 'C', label: '积水中庭', x: 10.4, z: -40, radius: 3.1, intensity: .76 }
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function asphaltTexture() {
  const c = makeCanvas(1024, 1024);
  const g = c.getContext('2d');
  g.fillStyle = '#30383a'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) {
    const v = 34 + Math.floor(Math.random() * 48);
    g.fillStyle = `rgba(${v},${v + 2},${v + 3},${.12 + Math.random() * .24})`;
    const s = Math.random() < .97 ? 1 : 2 + Math.random() * 3;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, s, s);
  }
  g.strokeStyle = 'rgba(124,132,128,.18)'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    let x = Math.random() * 1024; let y = Math.random() * 1024;
    g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (Math.random() - .5) * 45; y += 15 + Math.random() * 35; g.lineTo(x, y); }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 20);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function facadeTexture(seed = 0) {
  const c = makeCanvas(512, 1024);
  const g = c.getContext('2d');
  const dark = 35 + seed * 4;
  g.fillStyle = `rgb(${dark},${dark + 5},${dark + 7})`; g.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 1800; i++) {
    const v = 38 + Math.random() * 32;
    g.fillStyle = `rgba(${v},${v + 3},${v + 4},.34)`;
    g.fillRect(Math.random() * 512, Math.random() * 1024, 1 + Math.random() * 5, 1 + Math.random() * 6);
  }
  for (let y = 48; y < 980; y += 108) {
    for (let x = 34; x < 478; x += 80) {
      const lit = Math.random() < .07;
      const warm = Math.random() < .72;
      g.fillStyle = lit ? (warm ? 'rgba(241,173,88,.88)' : 'rgba(99,190,205,.72)') : 'rgba(4,7,8,.92)';
      g.fillRect(x, y, 43, 55);
      g.strokeStyle = 'rgba(155,157,150,.22)'; g.strokeRect(x, y, 43, 55);
      if (lit && Math.random() < .25) {
        g.fillStyle = 'rgba(0,0,0,.42)';
        g.fillRect(x + 4, y + 6, 35, 16);
      }
    }
  }
  g.strokeStyle = 'rgba(110,118,116,.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 660); g.lineTo(512, 660); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function waterNormalTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const image = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const nx = Math.sin(x * .18 + Math.sin(y * .09) * 2.2) * .36 + Math.sin((x + y) * .07) * .18;
      const ny = Math.cos(y * .15 + Math.sin(x * .08) * 1.8) * .36 + Math.cos((x - y) * .055) * .18;
      const i = (y * 256 + x) * 4;
      image.data[i] = (nx * .5 + .5) * 255;
      image.data[i + 1] = (ny * .5 + .5) * 255;
      image.data[i + 2] = 240;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function glowTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(.12, 'rgba(255,255,255,.9)');
  grd.addColorStop(.4, 'rgba(255,255,255,.24)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addWetReflection(scene, x, z, color, width, length, opacity, glowTex) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshBasicMaterial({
      map: glowTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, .022, z);
  mesh.renderOrder = 2;
  scene.add(mesh);
  return mesh;
}

function addCable(scene, ax, ay, az, bx, by, bz, sag) {
  const points = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push(new THREE.Vector3(
      THREE.MathUtils.lerp(ax, bx, t),
      THREE.MathUtils.lerp(ay, by, t) - Math.sin(Math.PI * t) * sag,
      THREE.MathUtils.lerp(az, bz, t)
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, .022, 4, false),
    new THREE.MeshBasicMaterial({ color: 0x0a1012, transparent: true, opacity: .82 })
  );
  cable.frustumCulled = false;
  scene.add(cable);
}

function signTexture(text, color = '#e7b15d') {
  const c = makeCanvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,9,10,.88)'; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = color; g.font = '700 54px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 67);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function boxMesh(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

function addCollider(colliders, x, z, w, d, pad = 0, height = 3) {
  colliders.push({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad, height });
}

function createBuilding(scene, colliders, x, z, w, d, h, side, random, facadeTex) {
  const group = new THREE.Group();
  const facadeX = side < 0 ? w / 2 + .045 : -w / 2 - .045;
  const facadeRotY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x7a8485, map: facadeTex, emissiveMap: facadeTex,
    emissive: 0x6e7e80, emissiveIntensity: .66, roughness: .88, metalness: .08
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x4b5353, roughness: .72, metalness: .18 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x12191b, metalness: .7, roughness: .34 });
  const body = boxMesh(w, h, d, concrete, 0, h / 2, 0);
  body.receiveShadow = true;
  group.add(body);

  const roof = boxMesh(w + .45, .38, d + .45, new THREE.MeshStandardMaterial({ color: 0x171d1e, roughness: .82, metalness: .16 }), 0, h + .2, 0);
  group.add(roof);

  const floors = Math.max(3, Math.floor((h - 2.8) / 3.05));
  const cols = Math.max(3, Math.floor((d - 2.2) / 2.05));
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, .11, d + .18), trimMat, floors);
  trim.castShadow = false; trim.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (let row = 0; row < floors; row++) {
    m4.compose(new THREE.Vector3(facadeX + (side < 0 ? .055 : -.055), 2.85 + row * 3.05, 0), q, one);
    trim.setMatrixAt(row, m4);
  }
  trim.instanceMatrix.needsUpdate = true;
  group.add(trim);

  const windowGeo = new THREE.PlaneGeometry(1.18, 1.62);
  const baseWindows = new THREE.InstancedMesh(
    windowGeo,
    new THREE.MeshBasicMaterial({ color: 0x071013, transparent: true, opacity: .88, side: THREE.DoubleSide }),
    floors * cols
  );
  const litMatrices = [];
  const litColors = [];
  const winQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facadeRotY, 0));
  let wi = 0;
  for (let row = 0; row < floors; row++) {
    for (let col = 0; col < cols; col++) {
      const pos = new THREE.Vector3(facadeX, 2.95 + row * 3.05, -d / 2 + 1.3 + col * ((d - 2.6) / Math.max(1, cols - 1)));
      m4.compose(pos, winQuat, one);
      baseWindows.setMatrixAt(wi++, m4);
      if (random() < .27) {
        litMatrices.push(m4.clone());
        litColors.push(random() < .7 ? new THREE.Color(2.4, 1.2, .4) : new THREE.Color(.25, 1.6, 2.0));
      }
    }
  }
  baseWindows.instanceMatrix.needsUpdate = true;
  group.add(baseWindows);
  if (litMatrices.length) {
    const litWindows = new THREE.InstancedMesh(
      windowGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .92, side: THREE.DoubleSide, toneMapped: false }),
      litMatrices.length
    );
    litMatrices.forEach((matrix, index) => {
      litWindows.setMatrixAt(index, matrix);
      litWindows.setColorAt(index, litColors[index]);
    });
    litWindows.instanceMatrix.needsUpdate = true;
    if (litWindows.instanceColor) litWindows.instanceColor.needsUpdate = true;
    group.add(litWindows);
  }

  for (const edge of [-1, 1]) {
    const column = boxMesh(.2, h - 1.1, .22, trimMat, facadeX, h / 2 + .2, edge * (d / 2 - .18));
    group.add(column);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, h * .72, 8), darkMetal);
  pipe.position.set(facadeX + (side < 0 ? .11 : -.11), h * .43, d * .36);
  pipe.castShadow = false;
  group.add(pipe);

  const shop = new THREE.Mesh(
    new THREE.PlaneGeometry(d * .72, 1.95),
    new THREE.MeshPhysicalMaterial({ color: 0x0b171a, metalness: .5, roughness: .14, transparent: true, opacity: .82, side: THREE.DoubleSide })
  );
  shop.position.set(facadeX + (side < 0 ? .075 : -.075), 1.12, -d * .06);
  shop.rotation.y = facadeRotY;
  group.add(shop);
  const awning = boxMesh(.95, .12, d * .5, random() > .5 ? trimMat : new THREE.MeshStandardMaterial({ color: 0x5b3527, roughness: .55 }), facadeX + (side < 0 ? .48 : -.48), 2.25, -d * .08);
  awning.rotation.z = side * .045;
  group.add(awning);

  const acMat = new THREE.MeshStandardMaterial({ color: 0x1a2223, metalness: .58, roughness: .42 });
  const ac = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, .48, .72), acMat, 4);
  for (let i = 0; i < 4; i++) {
    m4.compose(new THREE.Vector3(facadeX + (side < 0 ? .28 : -.28), 3.5 + random() * Math.max(2, h - 4.5), -d * .32 + i * d * .17), q, one);
    ac.setMatrixAt(i, m4);
  }
  ac.instanceMatrix.needsUpdate = true;
  group.add(ac);

  if (random() > .38) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.3),
      new THREE.MeshBasicMaterial({ map: signTexture(side < 0 ? '临川救援' : '滨河路 07', side < 0 ? '#8ee5ef' : '#e7b15d'), transparent: true, opacity: .84, side: THREE.DoubleSide, toneMapped: false })
    );
    sign.position.set(facadeX + (side < 0 ? .11 : -.11), Math.min(4.25, h * .33), -d * .25);
    sign.rotation.y = facadeRotY;
    group.add(sign);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: side < 0 ? 0x5bcfe0 : 0xf0a448,
      transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    halo.scale.set(4.2, 2.2, 1);
    halo.position.copy(sign.position);
    group.add(halo);
  }

  if (random() > .32) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 2.0, 14), new THREE.MeshStandardMaterial({ color: 0x20292a, metalness: .52, roughness: .56 }));
    tank.position.set((random() - .5) * w * .32, h + 1.22, (random() - .5) * d * .28);
    tank.castShadow = false;
    group.add(tank);
  }
  if (random() > .42) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .065, 3.4, 7), darkMetal);
    mast.position.set((random() - .5) * w * .45, h + 1.8, (random() - .5) * d * .4);
    group.add(mast);
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff4a2b, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.scale.set(.72, .72, 1); beacon.position.copy(mast.position); beacon.position.y += 1.8; group.add(beacon);
  }

  if (random() > .5) {
    const damaged = boxMesh(w * .38, .28, d * .28, trimMat, (random() - .5) * w * .2, h + .55, (random() - .5) * d * .3);
    damaged.rotation.set(random() * .35, random() * .7, random() * .3);
    group.add(damaged);
  }

  group.position.set(x, 0, z);
  scene.add(group);
  addCollider(colliders, x, z, w, d, .35, h);
}

function createCar(scene, colliders, x, z, rotY, flipped = false) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: flipped ? 0x2a3233 : 0x3f4b4c, metalness: .62, roughness: .28, clearcoat: .8 });
  const body = boxMesh(2.05, .7, 4.1, paint, 0, .52, 0);
  group.add(body);
  const cabin = boxMesh(1.66, .62, 2.0, new THREE.MeshPhysicalMaterial({ color: 0x081012, metalness: .5, roughness: .14, transmission: .1 }), 0, 1.02, -.2);
  group.add(cabin);
  for (const side of [-1, 1]) {
    for (const zz of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .24, 14), new THREE.MeshStandardMaterial({ color: 0x080a0a, roughness: .9 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.02, .35, zz);
      group.add(wheel);
    }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: flipped ? 0xff4d2f : 0xffe1ad });
  for (const side of [-.65, .65]) {
    const lamp = boxMesh(.3, .12, .035, lightMat, side, .53, -2.075);
    group.add(lamp);
    const tail = boxMesh(.28, .1, .035, new THREE.MeshBasicMaterial({ color: 0x9d1811 }), side, .55, 2.075);
    group.add(tail);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd9a3, transparent: true, opacity: flipped ? .18 : .34, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(2.4, 1.2, 1); halo.position.set(0, .6, -2.4); group.add(halo);
  group.position.set(x, flipped ? .65 : 0, z);
  group.rotation.y = rotY;
  if (flipped) { group.rotation.z = 1.25; group.position.y = 1.1; }
  scene.add(group);
  addCollider(colliders, x, z, 2.5, 4.5, .15, 1.75);
}

function createLamp(scene, x, z, side, sceneLights, colliders, useLight = false) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x12191b, metalness: .7, roughness: .35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 6.4, 8), dark);
  pole.position.y = 3.2; pole.castShadow = false; group.add(pole);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 1.9, 8), dark);
  arm.rotation.z = Math.PI / 2; arm.position.set(-side * .95, 6.2, 0); group.add(arm);
  const head = boxMesh(.85, .18, .36, dark, -side * 1.82, 6.12, 0);
  group.add(head);
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(.68, .24), new THREE.MeshBasicMaterial({ color: 0xffc56c, side: THREE.DoubleSide }));
  lens.rotation.x = Math.PI / 2; lens.position.set(-side * 1.82, 5.99, 0); group.add(lens);
  if (useLight) {
    const spot = new THREE.SpotLight(0xffb55e, 46, 24, Math.PI / 5.4, .72, 1.65);
    spot.position.set(-side * 1.82, 5.92, 0);
    const target = new THREE.Object3D(); target.position.set(-side * 1.82, 0, 0); group.add(target); spot.target = target;
    spot.castShadow = false; group.add(spot); sceneLights.push(spot);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb65b, transparent: true, opacity: .52, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(2.6, 2.6, 1); halo.position.set(-side * 1.82, 6.0, 0); group.add(halo);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(2.75, 6.0, 28, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb45e, transparent: true, opacity: .025, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  cone.position.set(-side * 1.82, 2.98, 0);
  group.add(cone);
  group.position.set(x, 0, z); scene.add(group);
  addCollider(colliders, x, z, .34, .34, .05, 6.4);
  return group;
}

function createRubbleMound(scene, x, z, scale, random, color = 0x303635) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .92, metalness: .04 });
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.DodecahedronGeometry(.45 + random() * .75, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((random() - .5) * scale * 1.2, random() * scale * .42, (random() - .5) * scale * 1.1);
    m.scale.set(.8 + random(), .45 + random() * .7, .7 + random());
    m.rotation.set(random() * 3, random() * 3, random() * 3);
    m.castShadow = false; m.receiveShadow = true; group.add(m);
  }
  for (let i = 0; i < 3; i++) {
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2 + random() * 2.6, 5), new THREE.MeshStandardMaterial({ color: 0x5b4a3b, metalness: .5, roughness: .72 }));
    rebar.position.set((random() - .5) * scale, .25 + random() * .7, (random() - .5) * scale);
    rebar.rotation.set((random() - .5) * 1.5, 0, (random() - .5) * 1.3);
    group.add(rebar);
  }
  group.position.set(x, 0, z); scene.add(group);
  return group;
}

function createVictim(parent, index) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: index === 1 ? 0x48545a : 0x5b3e35, roughness: .92 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1a2328, roughness: .96 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x9a7562, roughness: .78 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x111516, roughness: .8 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .58, 5, 10), jacket);
  torso.rotation.z = index === 1 ? -.5 : .34;
  torso.position.y = .69;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), skin);
  head.position.set(index === 1 ? .31 : -.22, 1.17, .02);
  group.add(head);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.065, .055, .55, 7), jacket);
    arm.position.set(side * .25 + (index === 1 ? .18 : -.12), .68, .1);
    arm.rotation.z = side * .78 + (index === 1 ? -.35 : .2);
    group.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.075, .06, .62, 7), pants);
    leg.position.set(side * .12, .28, side * .06);
    leg.rotation.z = side * .22;
    group.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.16, .11, .28), boot);
    shoe.position.set(side * .17, .03, -.08);
    group.add(shoe);
  }
  const dust = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x2d302d, transparent: true, opacity: .58, side: THREE.DoubleSide, depthWrite: false })
  );
  dust.rotation.x = 0; dust.position.set(.1, .015, .2); group.add(dust);
  group.rotation.x = Math.PI / 2;
  group.rotation.y = index * 1.1;
  parent.add(group);
  return group;
}

function createSearchZone(scene, data, index, glowTex) {
  const group = new THREE.Group();
  group.position.set(data.x, 0, data.z);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2ad58, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(data.radius * .62, data.radius * .64, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = .025; group.add(ring);
  const inner = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.26, 48), ringMat.clone());
  inner.rotation.x = -Math.PI / 2; inner.position.y = .03; group.add(inner);
  const core = new THREE.Group();
  core.position.set((index === 1 ? -2.3 : 1.4), .1, (index === 0 ? -1.8 : 1.2));
  const heat = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6b36, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }));
  heat.scale.set(2.8, 2.8, 1); heat.visible = false; core.add(heat);
  const signal = new THREE.PointLight(0xff5e37, 0, 4.8, 2);
  signal.position.y = .55; core.add(signal);
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.28, 0), new THREE.MeshBasicMaterial({ color: 0xf4ad52, transparent: true, opacity: .18 }));
  marker.position.y = 1.2; marker.visible = false; core.add(marker);
  const victim = createVictim(core, index);
  victim.position.set(0, 0, 0);
  group.add(core);
  scene.add(group);
  const victimWorld = new THREE.Vector3(data.x + core.position.x, 0, data.z + core.position.z);
  const ambientTemp = 18.4 + index * .55;
  return {
    ...data, index, group, ring, inner, core, heat, signal, marker, victim, victimWorld,
    ambientTemp, bodyTemp: 36.6 + index * .2, heatReading: ambientTemp, contactVisible: false,
    position: new THREE.Vector3(data.x, 0, data.z),
    evidence: { heat: 0, presence: 0, audio: 0, confidence: 0, confirmed: false, uploaded: false, thermalDetected: false }
  };
}

export function createCityWorld(scene, renderer) {
  const colliders = [];
  const cameraColliders = [];
  const zones = [];
  const sceneLights = [];
  scene.background = new THREE.Color(0x0b1216);
  scene.fog = new THREE.FogExp2(0x122025, .0128);
  scene.environmentIntensity = 1.15;
  scene.environment = (() => {
    const c = makeCanvas(512, 256); const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#07131a'); grd.addColorStop(.45, '#16252a'); grd.addColorStop(.62, '#5c4935'); grd.addColorStop(1, '#070b0c');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 45; i++) { g.fillStyle = Math.random() < .3 ? 'rgba(93,210,220,.24)' : 'rgba(244,166,74,.22)'; g.fillRect(Math.random() * 512, 138 + Math.random() * 65, 2, 2 + Math.random() * 8); }
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace; return tex;
  })();

  const skyCanvas = makeCanvas(1024, 512);
  const skyCtx = skyCanvas.getContext('2d');
  const skyGradient = skyCtx.createLinearGradient(0, 0, 0, 512);
  skyGradient.addColorStop(0, '#030910');
  skyGradient.addColorStop(.42, '#0b1820');
  skyGradient.addColorStop(.64, '#1a2c31');
  skyGradient.addColorStop(.78, '#4d4034');
  skyGradient.addColorStop(1, '#090e11');
  skyCtx.fillStyle = skyGradient;
  skyCtx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * 1024;
    const y = 35 + Math.random() * 260;
    const radius = 18 + Math.random() * 95;
    const grad = skyCtx.createRadialGradient(x, y, 0, x, y, radius);
    const cold = Math.random() < .7;
    grad.addColorStop(0, cold ? 'rgba(30,48,56,.10)' : 'rgba(92,66,45,.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  skyTexture.wrapS = THREE.RepeatWrapping;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(175, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, toneMapped: true })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xa6c7d6, 0x17201c, 2.05);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x566b71, .92);
  scene.add(ambient);
  const fill = new THREE.DirectionalLight(0x5d8994, 1.18);
  fill.position.set(18, 14, -22);
  scene.add(fill);
  const moon = new THREE.DirectionalLight(0xb5d3e2, 3.7);
  moon.position.set(-22, 32, 18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -45; moon.shadow.camera.right = 45; moon.shadow.camera.top = 55; moon.shadow.camera.bottom = -55;
  moon.shadow.camera.near = 1; moon.shadow.camera.far = 90; moon.shadow.bias = -.00025;
  scene.add(moon);

  const asphalt = asphaltTexture();
  const wetNormal = waterNormalTexture();
  const roadMat = new THREE.MeshPhysicalMaterial({
    color: 0x778183, map: asphalt, roughness: .3, metalness: .22,
    normalMap: wetNormal, normalScale: new THREE.Vector2(.28, .28),
    clearcoat: .9, clearcoatRoughness: .16, envMapIntensity: 1.45
  });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(31, 92), roadMat);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -7); road.receiveShadow = true; scene.add(road);
  const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x1d2425, roughness: .88, metalness: .03 }));
  outerGround.rotation.x = -Math.PI / 2; outerGround.position.y = -.03; outerGround.receiveShadow = true; scene.add(outerGround);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x50595a, roughness: .78, metalness: .08 });
  for (const side of [-1, 1]) {
    const walk = boxMesh(8, .12, 92, new THREE.MeshStandardMaterial({ color: 0x3f494a, roughness: .82, metalness: .08 }), side * 19.5, .015, -7);
    walk.receiveShadow = true; scene.add(walk);
    scene.add(boxMesh(.32, .25, 92, curbMat, side * 15.65, .1, -7));
  }

  const laneMat = new THREE.MeshBasicMaterial({ color: 0xd2cba9, transparent: true, opacity: .34, depthWrite: false });
  for (let z = 31; z > -50; z -= 7.5) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(.12, 3.3), laneMat);
    dash.rotation.x = -Math.PI / 2; dash.position.set(0, .015, z); scene.add(dash);
  }
  for (const zc of [20, -18, -42]) {
    for (let i = -5; i <= 5; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(.65, 3.5), laneMat);
      bar.rotation.x = -Math.PI / 2; bar.position.set(i * 1.25, .018, zc); scene.add(bar);
    }
  }

  const puddleMat = new THREE.MeshPhysicalMaterial({ color: 0x304d55, metalness: .48, roughness: .075, normalMap: wetNormal, normalScale: new THREE.Vector2(.38, .38), clearcoat: 1, transparent: true, opacity: .62, envMapIntensity: 2.1 });
  const puddles = [];
  for (let i = 0; i < 17; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.3 + Math.random() * 2.5, 28), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.scale.y = .35 + Math.random() * .55;
    p.rotation.z = Math.random() * Math.PI;
    p.position.set((Math.random() - .5) * 27, .012 + i * .0001, 28 - Math.random() * 74);
    scene.add(p); puddles.push(p);
  }

  const facadeTextures = [0, 1, 2, 3].map(facadeTexture);
  const rng = (() => { let s = 4127; return () => ((s = s * 16807 % 2147483647) / 2147483647); })();
  const buildingZ = [30, 17, 3, -12, -31, -47];
  for (const side of [-1, 1]) {
    buildingZ.forEach((z, i) => {
      const w = 8 + rng() * 4;
      const d = 10 + rng() * 4;
      const h = 9 + rng() * 17;
      createBuilding(scene, colliders, side * (21 + rng() * 3), z + (rng() - .5) * 2, w, d, h, side, rng, facadeTextures[(i + (side > 0 ? 2 : 0)) % facadeTextures.length]);
    });
  }

  const distantMat = new THREE.MeshBasicMaterial({ color: 0x17272d });
  for (let i = 0; i < 18; i++) {
    const x = (rng() - .5) * 110;
    const z = -60 - rng() * 30;
    const h = 12 + rng() * 36;
    const tower = boxMesh(4 + rng() * 8, h, 5 + rng() * 8, distantMat, x, h / 2, z);
    tower.castShadow = false; scene.add(tower);
  }

  const elevatedMat = new THREE.MeshStandardMaterial({ color: 0x252d2e, roughness: .68, metalness: .2 });
  const elevated = new THREE.Group();
  const deck = boxMesh(50, .9, 8.5, elevatedMat, 0, 0, 0);
  deck.rotation.z = -.035; elevated.add(deck);
  for (const side of [-1, 1]) {
    const parapet = boxMesh(50, .85, .28, new THREE.MeshStandardMaterial({ color: 0x343c3c, roughness: .75 }), 0, .78, side * 4.1);
    parapet.rotation.z = -.035; elevated.add(parapet);
  }
  for (const x of [-17, -4, 9, 22]) {
    const pillar = boxMesh(2.2, 7.8, 2.2, new THREE.MeshStandardMaterial({ color: 0x293030, roughness: .76 }), x, -4.4, 0);
    elevated.add(pillar);
    addCollider(colliders, x, -22, 2.6, 2.6, .1, 8.2);
  }
  elevated.position.set(0, 8.1, -22);
  scene.add(elevated);

  const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x39403f, roughness: .86, metalness: .08 });
  const lowTunnel = new THREE.Group();
  const ceilingA = boxMesh(6.4, .34, 10.6, tunnelMat, 3.45, .76, -20.6);
  ceilingA.rotation.x = .025; ceilingA.rotation.y = -.035; lowTunnel.add(ceilingA);
  const ceilingB = boxMesh(3.2, .22, 3.6, tunnelMat, 5.8, .56, -14.9);
  ceilingB.rotation.z = .08; lowTunnel.add(ceilingB);
  const brokenEdge = boxMesh(2.1, .28, 1.1, tunnelMat, 1.1, .77, -25.5);
  brokenEdge.rotation.set(.16, .25, -.08); lowTunnel.add(brokenEdge);
  for (let i = 0; i < 12; i++) {
    const rebar = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.3 + Math.random() * 1.7, 5), new THREE.MeshStandardMaterial({ color: 0x5e4b39, metalness: .55, roughness: .7 }));
    rebar.position.set(.5 + Math.random() * 5.8, .52 + Math.random() * .2, -25 + Math.random() * 10);
    rebar.rotation.set((Math.random() - .5) * 1.4, 0, (Math.random() - .5) * 1.2);
    lowTunnel.add(rebar);
  }
  scene.add(lowTunnel);
  cameraColliders.push({ minX: .25, maxX: 6.65, minZ: -25.9, maxZ: -15.3, minY: .53, maxY: .98, height: .98 });

  const warning = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, .68),
    new THREE.MeshBasicMaterial({ map: signTexture('低矮空间 · 仅机器人可入', '#f3b158'), transparent: true, opacity: .9, side: THREE.DoubleSide, toneMapped: false })
  );
  warning.position.set(3.5, 1.35, -14.4);
  warning.rotation.y = 0;
  scene.add(warning);

  createCar(scene, colliders, -5.5, 25, .11);
  createCar(scene, colliders, 7.2, 9.5, -.16, true);
  createCar(scene, colliders, -1.2, -4, .04);
  createCar(scene, colliders, 8.2, -32, .7);

  const rubbleSpecs = [
    [-11.5, 17, 3.1, .72], [-9.2, 7, 2.4, .68], [11.3, 19, 2.8, .66],
    [8, -15, 3.4, .7], [-9.2, -27, 3.6, .72], [4.7, -36, 3.2, .68], [-3.5, -44, 3.4, .66]
  ];
  rubbleSpecs.forEach(([x, z, s, opacity]) => {
    createRubbleMound(scene, x, z, s, rng, opacity > .7 ? 0x283031 : 0x343b3a);
    if (s > 2.7) addCollider(colliders, x, z, s * 1.25, s * 1.15, .15, s * .85);
  });
  [[-6, 18, 1.9], [11, 5, 1.6], [-12, -7, 2.0], [8.5, -18, 1.8], [-5, -34, 2.1], [12, -43, 2.2]].forEach(([x, z, scale]) => createRubbleMound(scene, x, z, scale, rng, 0x313735));

  const debrisMat = new THREE.MeshStandardMaterial({ color: 0x414846, roughness: .94, metalness: .03 });
  const debris = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.24, 0), debrisMat, 180);
  const debrisMatrix = new THREE.Matrix4();
  const debrisQuat = new THREE.Quaternion();
  for (let i = 0; i < 180; i++) {
    const x = (rng() - .5) * 28;
    const z = 32 - rng() * 78;
    const scale = .35 + rng() * 1.8;
    debrisQuat.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    debrisMatrix.compose(new THREE.Vector3(x, .06 + rng() * .17, z), debrisQuat, new THREE.Vector3(scale, scale * (.4 + rng() * .5), scale));
    debris.setMatrixAt(i, debrisMatrix);
  }
  debris.instanceMatrix.needsUpdate = true;
  debris.castShadow = false; debris.receiveShadow = true; scene.add(debris);

  const furnitureMat = new THREE.MeshStandardMaterial({ color: 0x45372e, roughness: .9 });
  for (let i = 0; i < 9; i++) {
    const piece = boxMesh(1.2 + rng() * 1.4, .15 + rng() * .35, .7 + rng() * 1.5, furnitureMat, (rng() - .5) * 23, .15 + rng() * .2, 30 - rng() * 74);
    piece.rotation.set((rng() - .5) * .8, rng() * Math.PI, (rng() - .5) * .7);
    scene.add(piece);
  }

  const lampPositions = [[-13.8, 27], [13.8, 19], [-13.8, 2], [13.8, -12], [-13.8, -29], [13.8, -44]];
  lampPositions.forEach(([x, z], i) => createLamp(scene, x, z, x < 0 ? -1 : 1, sceneLights, colliders, i === 1 || i === 4));

  const glowTex = glowTexture();
  [[-18, -68, 34, 0xf0a24a, .2], [16, -78, 42, 0x68bdc7, .16], [0, -90, 52, 0xf0a24a, .13], [-38, -80, 38, 0x5f8898, .14]].forEach(([x, z, size, color, opacity]) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(x, 10, z); glow.scale.set(size, size * .36, 1); scene.add(glow);
  });
  lampPositions.forEach(([x, z]) => addWetReflection(scene, x + (x < 0 ? 1.7 : -1.7), z, 0xffb45b, 1.45, 5.8, .14, glowTex));
  ZONE_DATA.forEach((data) => addWetReflection(scene, data.x, data.z, 0xff6a37, 2.6, 5.2, .09, glowTex));
  ZONE_DATA.forEach((data, i) => zones.push(createSearchZone(scene, data, i, glowTex)));

  const cableData = [
    [-16, 9.4, 27, 16, 8.7, 25, .75], [-17, 10.8, 12, 17, 11.6, 10, 1.0],
    [-16.5, 8.6, -1, 16.5, 10.1, -3, .8], [-17, 12.2, -15, 17, 9.8, -16, 1.1],
    [-16, 9.2, -31, 16, 11.4, -33, .9], [-17, 11.6, -46, 17, 9.4, -47, .7]
  ];
  cableData.forEach((c) => addCable(scene, ...c));

  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(.075, .102, 24);
  for (let i = 0; i < 28; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 5 === 0 ? 0xf2b15e : 0xa9dce7, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(rippleGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((Math.random() - .5) * 27, .028, 30 - Math.random() * 76);
    ring.userData.phase = Math.random();
    ring.userData.speed = .55 + Math.random() * .75;
    scene.add(ring); ripples.push(ring);
  }

  const rainCount = 1800;
  const rainPositions = new Float32Array(rainCount * 6);
  const rainSpeed = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    const x = (Math.random() - .5) * 54;
    const y = Math.random() * 24;
    const z = (Math.random() - .5) * 54;
    const len = .22 + Math.random() * .55;
    rainPositions[i * 6] = x; rainPositions[i * 6 + 1] = y; rainPositions[i * 6 + 2] = z;
    rainPositions[i * 6 + 3] = x + .035; rainPositions[i * 6 + 4] = y - len; rainPositions[i * 6 + 5] = z + .02;
    rainSpeed[i] = 12 + Math.random() * 12;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: 0x9fc8d2, transparent: true, opacity: .34, depthWrite: false, blending: THREE.AdditiveBlending });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false; scene.add(rain);

  const mistCount = 350;
  const mistPositions = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    mistPositions[i * 3] = (Math.random() - .5) * 58;
    mistPositions[i * 3 + 1] = .25 + Math.random() * 5.5;
    mistPositions[i * 3 + 2] = (Math.random() - .5) * 70;
  }
  const mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));
  const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: 0x9bb1b4, size: .65, transparent: true, opacity: .035, depthWrite: false }));
  scene.add(mist);

  const steamGroups = [];
  for (const [x, z] of [[-7, 3], [6.5, -24], [9, -42]]) {
    const count = 90; const pos = new Float32Array(count * 3); const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = x + (Math.random() - .5) * 1.2; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = z + (Math.random() - .5) * 1.2; phase[i] = Math.random() * 4; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9eb0b0, size: .85, transparent: true, opacity: .075, depthWrite: false }));
    pts.userData.phase = phase; scene.add(pts); steamGroups.push(pts);
  }

  const neonMat = new THREE.MeshBasicMaterial({ color: 0x6ad7e5, transparent: true, opacity: .5 });
  const hangingSigns = [];
  for (let i = 0; i < 5; i++) {
    const s = boxMesh(2.2, .12, .9, neonMat, (i % 2 ? 1 : -1) * (12 + Math.random() * 2), 5 + Math.random() * 4, 22 - i * 13);
    s.rotation.z = (Math.random() - .5) * .8; scene.add(s); hangingSigns.push(s);
  }

  cameraColliders.push(...colliders);
  const cameraRay = new THREE.Ray();
  const cameraBox = new THREE.Box3();
  const cameraHit = new THREE.Vector3();
  const cameraDir = new THREE.Vector3();
  const cameraPoint = new THREE.Vector3();
  const world = {
    colliders, cameraColliders, searchZones: zones, sceneLights, moon, puddles, tightSpaces: [{ x: 3.5, z: -20.5, minX: .25, maxX: 6.65, minZ: -25.9, maxZ: -15.3, clearance: .53 }],
    groundAt() { return 0; },
    cameraSafePoint(target, desired, margin = .22) {
      cameraDir.subVectors(desired, target);
      const fullDistance = cameraDir.length();
      if (fullDistance < .001) return desired;
      cameraDir.multiplyScalar(1 / fullDistance);
      cameraRay.set(target, cameraDir);
      let nearest = fullDistance;
      for (const c of cameraColliders) {
        cameraBox.min.set(c.minX, c.minY || 0, c.minZ);
        cameraBox.max.set(c.maxX, c.maxY || c.height || 3, c.maxZ);
        if (cameraRay.intersectBox(cameraBox, cameraHit)) {
          const distance = target.distanceTo(cameraHit);
          if (distance > .05 && distance < nearest) nearest = distance;
        }
      }
      const safeDistance = Math.max(.38, nearest - margin);
      return cameraPoint.copy(target).addScaledVector(cameraDir, safeDistance);
    },
    canMove(x, z, radius = 1.15) {
      if (x < -27.5 || x > 27.5 || z > 37 || z < -51) return false;
      for (const c of colliders) {
        const cx = clamp(x, c.minX, c.maxX);
        const cz = clamp(z, c.minZ, c.maxZ);
        const dx = x - cx; const dz = z - cz;
        if (dx * dx + dz * dz < radius * radius) return false;
      }
      return true;
    },
    hasLineOfSight(from, to) {
      const steps = 18;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = from.x + (to.x - from.x) * t;
        const z = from.z + (to.z - from.z) * t;
        for (const c of colliders) {
          if (c.height !== undefined && c.height < .5) continue;
          if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
        }
      }
      return true;
    },
    nearestZone(position) {
      let best = null; let bestD = Infinity;
      for (const zone of zones) {
        const d = Math.hypot(position.x - zone.position.x, position.z - zone.position.z);
        if (d < bestD) { bestD = d; best = zone; }
      }
      return { zone: best, distance: bestD };
    },
    update(dt, time, robotPos, speed, scanning) {
      const p = rainGeo.attributes.position.array;
      for (let i = 0; i < rainCount; i++) {
        const drop = i * 6;
        let y = p[drop + 1] - rainSpeed[i] * dt;
        let x = p[drop] + dt * 1.2;
        if (y < -.2) {
          y = 18 + Math.random() * 8;
          x = robotPos.x + (Math.random() - .5) * 52;
          const z = robotPos.z + (Math.random() - .5) * 52;
          p[drop + 2] = z; p[drop + 5] = z + .02;
          p[drop] = x; p[drop + 3] = x + .035;
        }
        p[drop + 1] = y; p[drop + 4] = y - .22 - (i % 7) * .055;
        p[drop] = x; p[drop + 3] = x + .035;
      }
      rainGeo.attributes.position.needsUpdate = true;
      mist.position.x = robotPos.x * .12; mist.position.z = robotPos.z * .12;

      steamGroups.forEach((pts) => {
        const arr = pts.geometry.attributes.position.array;
        const phase = pts.userData.phase;
        for (let i = 0; i < phase.length; i++) {
          arr[i * 3 + 1] += dt * (.45 + (i % 5) * .07);
          if (arr[i * 3 + 1] > 4.8) arr[i * 3 + 1] = .1;
          arr[i * 3] += Math.sin(time * .8 + phase[i]) * dt * .08;
        }
        pts.geometry.attributes.position.needsUpdate = true;
      });

      puddles.forEach((puddle, i) => {
        puddle.material.opacity = .5 + Math.sin(time * 1.6 + i) * .04;
      });
      hangingSigns.forEach((sign, i) => { sign.rotation.x = Math.sin(time * .8 + i) * .04; });

      ripples.forEach((ring) => {
        ring.userData.phase += dt * ring.userData.speed;
        if (ring.userData.phase > 1) {
          ring.userData.phase = 0;
          ring.position.set((Math.random() - .5) * 27, .028, 30 - Math.random() * 76);
        }
        const phase = ring.userData.phase;
        ring.scale.setScalar(.72 + phase * 5.5);
        ring.material.opacity = Math.sin(phase * Math.PI) * .17;
      });
      zones.forEach((zone, i) => {
        const pulse = .5 + .5 * Math.sin(time * 1.4 + i * 1.7);
        zone.ring.material.opacity = .08 + pulse * .055;
        zone.inner.material.opacity = .08 + pulse * .12;
        zone.heat.visible = !!zone.evidence.thermalDetected;
        zone.heat.material.opacity = zone.evidence.thermalDetected ? .18 + pulse * .16 : 0;
        zone.signal.intensity = zone.evidence.thermalDetected ? 5.5 + pulse * 2.4 : 0;
        zone.marker.rotation.y += dt * .65;
        zone.marker.position.y = 1.12 + Math.sin(time * 1.5 + i) * .12;
      });

      if (Math.random() < dt * .035) {
        moon.intensity = 8.5;
        ambient.intensity = 2.2;
        setTimeout(() => { moon.intensity = 3.7; ambient.intensity = .92; }, 90 + Math.random() * 130);
      }
      rainMat.opacity = .19 + Math.sin(time * 5) * .025;
      sceneLights.forEach((l, i) => { l.intensity = 42 + Math.sin(time * 2.1 + i) * 2; });
    }
  };
  return world;
}
