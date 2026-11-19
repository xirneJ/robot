import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export async function createPhysicsWorld(sceneWorld) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const labels = new Map();

  const addBox = (c, kind) => {
    const width = Math.max(.05, c.maxX - c.minX);
    const depth = Math.max(.05, c.maxZ - c.minZ);
    const minY = c.minY ?? 0;
    const maxY = c.maxY ?? Math.max(.08, c.height ?? 3);
    const height = Math.max(.05, maxY - minY);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
        .setTranslation((c.minX + c.maxX) / 2, (minY + maxY) / 2, (c.minZ + c.maxZ) / 2)
        .setFriction(.82),
      fixed
    );
    labels.set(collider.handle, kind);
    return collider;
  };

  for (const c of sceneWorld.colliders) addBox(c, 'environment');
  for (const c of sceneWorld.detailColliders || []) addBox(c, 'detail');

  const ground = world.createCollider(
    RAPIER.ColliderDesc.cuboid(42, .12, 56).setTranslation(0, -.12, -7).setFriction(.9),
    fixed
  );
  labels.set(ground.handle, 'ground');
  world.step();

  const ball = new RAPIER.Ball(.04);
  const zeroRot = { x: 0, y: 0, z: 0, w: 1 };
  const downRay = new RAPIER.Ray({ x: 0, y: 2.2, z: 0 }, { x: 0, y: -1, z: 0 });

  const physics = {
    rapier: RAPIER,
    world,
    labels,
    segmentClear(a, b, radius = .04) {
      const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < .0001) return true;
      const shape = radius === .04 ? ball : new RAPIER.Ball(radius);
      const hit = world.castShape(
        { x: a.x, y: a.y, z: a.z }, zeroRot,
        { x: dx, y: dy, z: dz }, shape, 1, false
      );
      return !hit;
    },
    groundHeight(x, z) {
      downRay.origin.x = x; downRay.origin.y = 2.2; downRay.origin.z = z;
      const hit = world.castRay(downRay, 2.2, true, undefined, undefined, undefined, fixed);
      return hit ? 2.2 - hit.toi : 0;
    },
    bodyClear(x, z, radius = .62, height = .36) {
      const shape = new RAPIER.Cuboid(radius, height * .5, radius);
      let blocked = false;
      world.intersectionsWithShape(
        { x, y: height * .5 + .03, z }, zeroRot, shape,
        () => { blocked = true; return false; }
      );
      return !blocked;
    },
    dispose() { world.free(); }
  };
  return physics;
}
