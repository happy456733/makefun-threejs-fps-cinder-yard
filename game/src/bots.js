// The bots: two EMBER attackers beside the player, three WARDEN defenders. Each
// bot is a state machine — route along the nav graph, hold an angle, engage what it
// sees, investigate what it hears, plant or defuse the charge — with a reaction time
// and burst fire so a fight feels like a duel, not a dice roll. Bot shots are real
// rays through combat.shoot, with spread that grows with distance and movement.
import * as THREE from 'three';
import { WEAPONS, BOT_SKILL, BOT_NAMES, TIMING } from './config.js';
import { TEAMS } from './config.js';

const BOT_SPEED = 4.3;
const STRAFE_SPEED = 2.3;
const VISION_RANGE = 46;
const VISION_COS = -0.15; // cos of the half-angle: bots see ~100 degrees ahead
const LOSE_SIGHT_TIME = 3;
const HOLD_SPOTS = {
  warden: [
    { x: -14.5, z: -11, yaw: Math.PI, site: 'A' },
    { x: 22.5, z: 5, yaw: Math.PI / 2, site: 'B' },
    { x: 0, z: -4, yaw: Math.PI, site: null },
  ],
  ember: [
    { x: -13, z: -10, yaw: Math.PI * 0.75, site: 'A' },
    { x: 16, z: 4, yaw: Math.PI / 2, site: 'B' },
  ],
};

function buildBody(team) {
  const color = TEAMS[team].color;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const teamMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.8, metalness: 0.1 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.7 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.3, metalness: 0.6 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.2), darkMat);
  legL.position.set(-0.11, 0.375, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), teamMat);
  torso.position.y = 1.06;
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.3), darkMat);
  padL.position.set(-0.3, 1.34, 0);
  const padR = padL.clone();
  padR.position.x = 0.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), skinMat);
  head.position.y = 1.53;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.05), visorMat);
  visor.position.set(0, 1.55, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.6), darkMat);
  gun.position.set(0.16, 1.22, -0.32);
  body.add(legL, legR, torso, padL, padR, head, visor, gun);
  body.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  torso.userData.part = 'torso';
  head.userData.part = 'head';
  return { group, body, legL, legR, torso, head };
}

export function createBots({ scene, world, nav, rng, combat, audio, state }) {
  const probe = new THREE.Box3();
  const tmpChest = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const list = [];

  function overlaps(x, z) {
    probe.min.set(x - 0.4, 0.05, z - 0.4);
    probe.max.set(x + 0.4, 1.6, z + 0.4);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function makeBot(team, index, weaponId) {
    const parts = buildBody(team);
    scene.add(parts.group);
    const bot = {
      id: `${team}-${index}`,
      team,
      name: BOT_NAMES[team][index],
      weaponId,
      group: parts.group,
      body: parts.body,
      legL: parts.legL,
      legR: parts.legR,
      hitMeshes: [parts.torso, parts.head],
      position: parts.group.position,
      yaw: 0,
      health: 100,
      alive: true,
      mode: 'route',
      path: [],
      hold: null,
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      react: 0,
      burstLeft: 0,
      burstPause: 0,
      fireGap: 0,
      strafeDir: 1,
      strafeTimer: 0,
      stuckTimer: 0,
      lastX: 0,
      lastZ: 0,
      walkPhase: 0,
      fall: 0,
      scanPhase: rng.next() * Math.PI * 2,
      targetSite: null,
      interrupted: false,
    };
    parts.torso.userData.actor = bot;
    parts.head.userData.actor = bot;
    bot.applyDamage = (amount) => {
      if (!bot.alive) return false;
      bot.health = Math.max(0, bot.health - amount);
      bot.interrupted = true;
      if (bot.health <= 0) {
        bot.alive = false;
        bot.mode = 'dead';
        bot.fall = 0;
        return true;
      }
      return false;
    };
    list.push(bot);
    return bot;
  }

  makeBot('ember', 0, 'kr47');
  makeBot('ember', 1, 'kr47');
  makeBot('warden', 0, 'kr47');
  makeBot('warden', 1, 'kr47');
  makeBot('warden', 2, 'l88');

  function reset(spawns) {
    for (const bot of list) {
      // The player takes EMBER spawn 0; the two EMBER bots take spawns 1 and 2.
      const spawnIndex = bot.team === 'ember' ? list.indexOf(bot) + 1 : list.indexOf(bot) - 2;
      const [x, z, yaw] = spawns[bot.team][spawnIndex];
      bot.position.set(x, 0, z);
      bot.yaw = yaw;
      bot.group.rotation.set(0, yaw, 0);
      bot.body.rotation.set(0, 0, 0);
      bot.health = 100;
      bot.alive = true;
      bot.mode = 'route';
      bot.path = [];
      bot.target = null;
      bot.lastSeen = null;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.fireGap = 0;
      bot.fall = 0;
      bot.interrupted = false;
    }
  }

  function assignRound() {
    const site = rng.pick(['A', 'B']);
    for (const bot of list) {
      if (bot.team === 'ember') {
        bot.targetSite = site;
        bot.mode = 'route';
        bot.path = nav.path(bot.position.x, bot.position.z, world.sites[site].x, world.sites[site].z);
      } else {
        const index = list.indexOf(bot) - 2;
        bot.hold = HOLD_SPOTS.warden[index];
        bot.mode = 'route';
        bot.path = nav.path(bot.position.x, bot.position.z, bot.hold.x, bot.hold.z);
      }
    }
    return site;
  }

  function canSee(bot, actor) {
    if (!actor.alive) return false;
    tmpChest.set(actor.position.x, actor.position.y + 1.15, actor.position.z);
    const dx = tmpChest.x - bot.position.x;
    const dy = tmpChest.y - 1.4;
    const dz = tmpChest.z - bot.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > VISION_RANGE) return false;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    if ((dx * fx + dz * fz) / (dist || 1) < VISION_COS) return false;
    tmpMuzzle.set(bot.position.x, 1.4, bot.position.z);
    return !combat.losBlocked(tmpMuzzle, tmpChest);
  }

  function hearShot(pos, team, excludeId) {
    for (const bot of list) {
      if (!bot.alive || bot.team === team || bot.id === excludeId) continue;
      if (bot.mode === 'engage' || bot.mode === 'defuse' || bot.mode === 'plant') continue;
      const d = Math.hypot(pos.x - bot.position.x, pos.z - bot.position.z);
      if (d > BOT_SKILL.hearRadius) continue;
      bot.mode = 'investigate';
      bot.path = nav.path(bot.position.x, bot.position.z, pos.x, pos.z);
      bot.lastSeen = { x: pos.x, z: pos.z };
    }
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepX = (dx / dist) * speed * dt;
    const stepZ = (dz / dist) * speed * dt;
    const nx = bot.position.x + stepX;
    const nz = bot.position.z + stepZ;
    if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
    if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
    faceToward(bot, x, z, dt, 8);
    bot.walkPhase += dt * speed * 1.8;
    return dist < 0.6;
  }

  function fireAt(bot, target, dt) {
    const def = WEAPONS[bot.weaponId];
    bot.fireGap -= dt;
    if (bot.burstPause > 0) {
      bot.burstPause -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = rng.int(BOT_SKILL.burstMin, BOT_SKILL.burstMax);
      bot.burstPause = rng.range(0.1, 0.3);
      return;
    }
    if (bot.fireGap > 0) return;
    bot.fireGap = def.gap;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.burstPause = rng.range(0.45, 0.9);
    tmpChest.set(target.position.x, target.position.y + 1.1, target.position.z);
    tmpMuzzle.set(bot.position.x, 1.35, bot.position.z);
    tmpDir.subVectors(tmpChest, tmpMuzzle);
    const dist = tmpDir.length();
    tmpDir.normalize();
    const spread = def.spreadStill * BOT_SKILL.spreadMult + dist * 0.00045;
    const g = () => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
    tmpRight.crossVectors(tmpDir, UP).normalize();
    tmpUp.crossVectors(tmpRight, tmpDir).normalize();
    tmpDir.addScaledVector(tmpRight, g() * spread).addScaledVector(tmpUp, g() * spread).normalize();
    tmpMuzzle.addScaledVector(tmpDir, 0.5);
    combat.shoot(tmpMuzzle, tmpDir, def, bot, [target]);
    audio.enemyShot(bot.weaponId);
    hearShot(bot.position, bot.team, bot.id);
  }

  function stepBot(bot, dt, ctx, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.body.rotation.x = -bot.fall * 1.45;
      return;
    }
    // Find a visible enemy: the player first, then the other side's bots.
    let enemy = null;
    if (canSee(bot, ctx.playerActor)) enemy = ctx.playerActor;
    if (!enemy) {
      for (const other of list) {
        if (other.team !== bot.team && other.alive && canSee(bot, other)) {
          enemy = other;
          break;
        }
      }
    }
    if (enemy) {
      if (bot.target !== enemy) {
        bot.target = enemy;
        bot.react = rng.range(BOT_SKILL.reactMin, BOT_SKILL.reactMax);
      }
      bot.lastSeen = { x: enemy.position.x, z: enemy.position.z };
      bot.lastSeenAt = time;
      if (bot.mode !== 'engage') bot.mode = 'engage';
    } else if (bot.target && time - bot.lastSeenAt > LOSE_SIGHT_TIME) {
      bot.target = null;
      if (bot.mode === 'engage') {
        bot.mode = 'investigate';
        bot.path = bot.lastSeen ? nav.path(bot.position.x, bot.position.z, bot.lastSeen.x, bot.lastSeen.z) : [];
      }
    }

    const charge = state.charge;
    if (bot.team === 'warden' && charge.status === 'planted' && bot.mode !== 'engage') {
      const site = world.sites[charge.site];
      const d = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
      if (d < site.radius - 0.5) {
        bot.mode = 'defuse';
      } else if (bot.mode !== 'defuse') {
        bot.mode = 'route';
        if (bot.path.length === 0) bot.path = nav.path(bot.position.x, bot.position.z, site.x, site.z);
      }
    }
    if (bot.team === 'ember' && charge.status === 'dropped') {
      const d = Math.hypot(charge.x - bot.position.x, charge.z - bot.position.z);
      if (d < 1.3) {
        charge.status = 'carried';
        charge.carrier = bot.id;
      } else if (bot.mode !== 'engage' && bot.mode !== 'plant') {
        bot.mode = 'route';
        if (bot.path.length === 0 || bot.path[bot.path.length - 1][0] !== charge.x) {
          bot.path = nav.path(bot.position.x, bot.position.z, charge.x, charge.z);
        }
      }
    }
    if (bot.team === 'ember' && charge.status === 'carried' && charge.carrier === bot.id && bot.mode !== 'engage') {
      const site = world.sites[bot.targetSite];
      const d = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
      if (d < site.radius - 0.5) bot.mode = 'plant';
      else if (bot.mode !== 'plant') {
        bot.mode = 'route';
        if (bot.path.length === 0) bot.path = nav.path(bot.position.x, bot.position.z, site.x, site.z);
      }
    }
    if (bot.interrupted) {
      bot.interrupted = false;
      if (bot.mode === 'plant' || bot.mode === 'defuse') {
        bot.mode = bot.target ? 'engage' : 'route';
        if (bot.mode === 'route' && bot.path.length === 0) {
          const site = world.sites[bot.targetSite || charge.site || 'A'];
          bot.path = nav.path(bot.position.x, bot.position.z, site.x, site.z);
        }
      }
    }

    let moving = false;
    if (bot.mode === 'engage' && bot.target) {
      faceToward(bot, bot.target.position.x, bot.target.position.z, dt, 7);
      bot.react -= dt;
      if (bot.react <= 0) fireAt(bot, bot.target, dt);
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = rng.range(0.7, 1.4);
        bot.strafeDir *= -1;
      }
      const tx = bot.target.position.x - bot.position.x;
      const tz = bot.target.position.z - bot.position.z;
      const len = Math.hypot(tx, tz) || 1;
      const sx = (-tz / len) * bot.strafeDir;
      const sz = (tx / len) * bot.strafeDir;
      const nx = bot.position.x + sx * STRAFE_SPEED * dt;
      const nz = bot.position.z + sz * STRAFE_SPEED * dt;
      if (!overlaps(nx, bot.position.z)) bot.position.x = nx;
      if (!overlaps(bot.position.x, nz)) bot.position.z = nz;
      bot.walkPhase += dt * 5;
      moving = true;
    } else if (bot.mode === 'route' || bot.mode === 'investigate') {
      if (bot.path.length === 0) {
        bot.mode = bot.team === 'warden' && bot.hold ? 'hold' : 'hold';
        if (bot.hold) {
          bot.yaw = bot.hold.yaw;
        }
      } else {
        const [wx, wz] = bot.path[0];
        if (moveToward(bot, wx, wz, dt, BOT_SPEED)) bot.path.shift();
        moving = true;
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 1.2) {
          const moved = Math.hypot(bot.position.x - bot.lastX, bot.position.z - bot.lastZ);
          if (moved < 0.25) bot.path.shift();
          bot.lastX = bot.position.x;
          bot.lastZ = bot.position.z;
          bot.stuckTimer = 0;
        }
      }
    } else if (bot.mode === 'hold') {
      const base = bot.hold ? bot.hold.yaw : bot.yaw;
      bot.yaw = base + Math.sin(time * 0.5 + bot.scanPhase) * 0.45;
    }
    // plant and defuse hold the bot still; rounds.js tracks the progress.

    // Separation: bots never stack on each other.
    for (const other of list) {
      if (other === bot || !other.alive) continue;
      const dx = bot.position.x - other.position.x;
      const dz = bot.position.z - other.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.85) {
        bot.position.x += (dx / d) * (0.85 - d) * 0.5;
        bot.position.z += (dz / d) * (0.85 - d) * 0.5;
      }
    }

    bot.group.rotation.y = bot.yaw;
    const swing = moving ? 0.5 : 0;
    bot.legL.rotation.x = Math.sin(bot.walkPhase) * swing;
    bot.legR.rotation.x = -Math.sin(bot.walkPhase) * swing;
    bot.body.position.y = moving ? Math.abs(Math.sin(bot.walkPhase)) * 0.04 : 0;
  }

  return {
    list,
    reset,
    assignRound,
    hearShot,
    step(dt, ctx, time) {
      if (ctx.frozen) {
        // Between rounds the bots stand; only the fallen finish falling.
        for (const bot of list) {
          if (!bot.alive && bot.fall < 1) {
            bot.fall = Math.min(1, bot.fall + dt / 0.4);
            bot.body.rotation.x = -bot.fall * 1.45;
          }
        }
        return;
      }
      for (const bot of list) stepBot(bot, dt, ctx, time);
    },
    aliveCount(team) {
      return list.filter((bot) => bot.team === team && bot.alive).length;
    },
    byId(id) {
      return list.find((bot) => bot.id === id) || null;
    },
  };
}
