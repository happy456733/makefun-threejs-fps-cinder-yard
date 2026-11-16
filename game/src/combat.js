// Hitscan combat and grenades. Every shot is one ray against the map and the
// actors' body meshes — a head mesh takes the weapon's head multiplier, a torso mesh
// takes body damage — so hits are checked against bodies, never against a dice roll.
// Grenades fly on real physics, bounce off the map, and damage by radius with a
// line-of-sight check, so cover saves you from a blast.
import * as THREE from 'three';
import { GRENADE } from './config.js';

const MAX_GRENADES = 4;
const GRAVITY = 18;

export function createCombat({ scene, world, effects, audio, rng, onDamage }) {
  const raycaster = new THREE.Raycaster();
  const tmpEnd = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const grenades = [];
  for (let i = 0; i < MAX_GRENADES; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.4 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, active: false, fuse: 0, velocity: new THREE.Vector3(), owner: null });
  }

  function losBlocked(from, to) {
    tmpDir.subVectors(to, from);
    const dist = tmpDir.length();
    if (dist < 0.01) return false;
    raycaster.set(from, tmpDir.normalize());
    raycaster.far = dist - 0.4;
    return raycaster.intersectObjects(world.shootables, false).length > 0;
  }

  // One shot. targets are the shooter's enemies, each with hitMeshes whose userData
  // carries { actor, part }. Returns the actor hit, or null.
  function shoot(origin, dir, def, shooter, targets) {
    raycaster.set(origin, dir);
    raycaster.far = def.range;
    const meshes = [];
    for (const target of targets) {
      if (target.alive) meshes.push(...target.hitMeshes);
    }
    const hits = raycaster.intersectObjects(world.shootables.concat(meshes), false);
    const hit = hits[0];
    const end = hit ? hit.point : tmpEnd.copy(origin).addScaledVector(dir, def.range);
    effects.tracer(origin, end);
    if (!hit) return null;
    const actor = hit.object.userData.actor;
    if (actor && actor.alive) {
      const part = hit.object.userData.part || 'torso';
      const damage = Math.round(def.damage * (part === 'head' ? def.headMult : 1));
      effects.hitFlesh(hit.point);
      onDamage(actor, damage, part, shooter, def);
      return actor;
    }
    effects.impact(hit.point);
    return null;
  }

  function throwGrenade(from, dir, owner) {
    const slot = grenades.find((g) => !g.active);
    if (!slot) return false;
    slot.active = true;
    slot.owner = owner;
    slot.fuse = 1.4;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from);
    slot.velocity.copy(dir).multiplyScalar(GRENADE.speed);
    slot.velocity.y += GRENADE.up;
    return true;
  }

  function explode(grenade, actors) {
    const point = grenade.mesh.position;
    effects.explosion(point);
    audio.explosion();
    const chest = new THREE.Vector3();
    for (const actor of actors) {
      if (!actor.alive) continue;
      chest.set(actor.position.x, actor.position.y + 1, actor.position.z);
      const dist = chest.distanceTo(point);
      if (dist > GRENADE.radius) continue;
      if (losBlocked(point, chest)) continue;
      const damage = Math.round(GRENADE.damage * (1 - (dist / GRENADE.radius) * 0.7));
      onDamage(actor, damage, 'blast', grenade.owner, null);
    }
  }

  function step(dt, actors) {
    for (const grenade of grenades) {
      if (!grenade.active) continue;
      grenade.fuse -= dt;
      const pos = grenade.mesh.position;
      const vel = grenade.velocity;
      vel.y -= GRAVITY * dt;
      // Move one axis at a time and bounce off anything solid.
      pos.x += vel.x * dt;
      if (overlapsWorld(pos, 0.09)) {
        pos.x -= vel.x * dt;
        vel.x = -vel.x * 0.42;
      }
      pos.z += vel.z * dt;
      if (overlapsWorld(pos, 0.09)) {
        pos.z -= vel.z * dt;
        vel.z = -vel.z * 0.42;
      }
      pos.y += vel.y * dt;
      if (pos.y < 0.09) {
        pos.y = 0.09;
        vel.y = Math.abs(vel.y) > 1.2 ? -vel.y * 0.42 : 0;
        vel.x *= 0.7;
        vel.z *= 0.7;
      } else if (overlapsWorld(pos, 0.09)) {
        pos.y -= vel.y * dt;
        vel.y = -vel.y * 0.42;
      }
      if (grenade.fuse <= 0) {
        grenade.active = false;
        grenade.mesh.visible = false;
        explode(grenade, actors);
      }
    }
  }

  const probe = new THREE.Box3();
  function overlapsWorld(pos, r) {
    probe.min.set(pos.x - r, pos.y - r, pos.z - r);
    probe.max.set(pos.x + r, pos.y + r, pos.z + r);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  return { shoot, throwGrenade, step, losBlocked };
}
