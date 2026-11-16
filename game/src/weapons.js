// The arsenal: four hitscan weapons, each with its own box-built view model, magazine
// and reload. It owns the numbers; combat.js owns the ray and the damage. Spread is
// the gunplay contract: a still, crouched shooter is nearly exact, a sprinting one
// sprays, and every shot blooms until the shooter pauses.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { PALETTE } from './palette.js';

const MUZZLE_TIME = 0.055;
const BLOOM_DECAY = 0.028;
const BLOOM_MAX = 0.032;

function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.65, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wall), roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.2 });
  const model = new THREE.Group();
  model.scale.setScalar(0.8);
  const add = (geo, mat, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    model.add(mesh);
    return mesh;
  };
  if (def.id === 'p9') {
    add(new THREE.BoxGeometry(0.07, 0.09, 0.24), metal, 0, 0, -0.05);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.1), dark, 0, 0.02, -0.2);
    add(new THREE.BoxGeometry(0.06, 0.12, 0.07), dark, 0, -0.08, 0.06, 0.25);
  } else if (def.id === 'vk9') {
    add(new THREE.BoxGeometry(0.08, 0.1, 0.34), metal, 0, 0, -0.08);
    add(new THREE.BoxGeometry(0.05, 0.05, 0.22), dark, 0, 0.02, -0.34);
    add(new THREE.BoxGeometry(0.05, 0.16, 0.07), dark, 0, -0.1, -0.12);
    add(new THREE.BoxGeometry(0.07, 0.07, 0.16), dark, 0, -0.01, 0.16);
  } else if (def.id === 'kr47') {
    add(new THREE.BoxGeometry(0.09, 0.1, 0.42), metal, 0, 0, -0.08);
    add(new THREE.BoxGeometry(0.045, 0.045, 0.4), dark, 0, 0.025, -0.46);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.08), accent, 0, -0.1, -0.08, 0.35);
    add(new THREE.BoxGeometry(0.075, 0.08, 0.22), dark, 0, -0.02, 0.24);
    add(new THREE.BoxGeometry(0.04, 0.05, 0.1), dark, 0, 0.08, -0.05);
  } else {
    add(new THREE.BoxGeometry(0.08, 0.09, 0.5), metal, 0, 0, -0.12);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), dark, 0, 0.03, -0.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), dark, 0, 0.09, -0.18, Math.PI / 2);
    add(new THREE.BoxGeometry(0.07, 0.12, 0.26), dark, 0, -0.03, 0.26);
  }
  model.position.set(0.24, -0.21, -0.42);
  return model;
}

export function createArsenal(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const owned = new Set(['p9']);
  let current = 'p9';
  let shown = true;
  let cooldown = 0;
  let reloadLeft = 0;
  let reloadTotal = 1;
  let flashLeft = 0;
  let kick = 0;
  let bloom = 0;
  let bobPhase = 0;
  models.p9.visible = true;

  function def() {
    return WEAPONS[current];
  }

  function step(dt, speed, moving) {
    cooldown = Math.max(0, cooldown - dt);
    flashLeft = Math.max(0, flashLeft - dt);
    bloom = Math.max(0, bloom - BLOOM_DECAY * dt);
    kick += (0 - kick) * Math.min(1, dt * 13);
    const model = models[current];
    bobPhase += dt * (2 + speed * 1.6);
    const bob = moving ? Math.min(0.012, speed * 0.0016) : 0;
    model.position.z = -0.42 + kick;
    model.position.y = -0.21 + Math.sin(bobPhase * 2) * bob;
    model.rotation.x = kick * 2.4;
    flash.visible = flashLeft > 0;
    if (flash.visible) flash.rotation.z = flashLeft * 40;
    flashLight.intensity = flashLeft > 0 ? 20 : 0;
    if (reloadLeft > 0) {
      reloadLeft = Math.max(0, reloadLeft - dt);
      const t = 1 - reloadLeft / reloadTotal;
      model.rotation.x = -0.6 * Math.sin(Math.PI * Math.min(1, t));
      model.position.y = -0.21 - 0.09 * Math.sin(Math.PI * Math.min(1, t));
      if (reloadLeft === 0) {
        const need = def().mag - ammo[current].mag;
        const take = Math.min(need, ammo[current].reserve);
        ammo[current].mag += take;
        ammo[current].reserve -= take;
      }
    }
  }

  return {
    step,
    currentId() {
      return current;
    },
    currentDef: def,
    isOwned(id) {
      return owned.has(id);
    },
    ownedList() {
      return [...owned];
    },
    buy(id) {
      if (owned.has(id)) return false;
      owned.add(id);
      ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      return true;
    },
    equip(id) {
      if (!owned.has(id) || id === current) return false;
      models[current].visible = false;
      current = id;
      models[current].visible = shown;
      reloadLeft = 0;
      cooldown = Math.max(cooldown, 0.18);
      return true;
    },
    setVisible(value) {
      shown = value;
      models[current].visible = value;
    },
    dropPrimary() {
      for (const id of [...owned]) if (WEAPONS[id].kind !== 'pistol') owned.delete(id);
      if (!owned.has(current)) this.equip('p9');
    },
    refillPistol() {
      ammo.p9 = { mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
    },
    ready() {
      return ammo[current].mag > 0 && cooldown === 0 && reloadLeft === 0;
    },
    fire() {
      if (!this.ready()) return false;
      ammo[current].mag -= 1;
      cooldown = def().gap;
      flashLeft = MUZZLE_TIME;
      kick = 0.05 + def().kick * 2;
      bloom = Math.min(BLOOM_MAX, bloom + def().bloom);
      return true;
    },
    reload() {
      if (reloadLeft > 0 || ammo[current].mag === def().mag || ammo[current].reserve === 0) return false;
      reloadLeft = def().reload;
      reloadTotal = def().reload;
      return true;
    },
    spread(speed, crouched, airborne) {
      const d = def();
      const move = Math.min(1, speed / 5.4) * d.spreadMove * (crouched ? 0.45 : 1);
      return d.spreadStill + move + bloom + (airborne ? 0.03 : 0);
    },
    reloading() {
      return reloadLeft > 0;
    },
    mag() {
      return ammo[current].mag;
    },
    reserve() {
      return ammo[current].reserve;
    },
    muzzle(out) {
      return out.set(0.24, -0.18, -0.95).applyMatrix4(camera.matrixWorld);
    },
  };
}
