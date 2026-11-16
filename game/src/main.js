// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js is the only module that knows every other module — it wires input to
// the player, the player to combat, combat to the round, and the round to the HUD.
// ?shot=start|buy|play|end with &seed=N stages one deterministic frame for a capture.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS, TIMING } from './config.js';
import { makeRng } from './rng.js';
import { createState } from './state.js';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal } from './weapons.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { runShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 42, 110);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const nav = createNav(world.navNodes, world.navEdges);
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud({ onPlay, onBuy, onRestart });

// The player's hitboxes: invisible boxes that follow the body, so bot shots are real
// rays against a body with a head, exactly like the player's shots against bots.
const hitTorso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.3), new THREE.MeshBasicMaterial());
const hitHead = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), new THREE.MeshBasicMaterial());
hitTorso.visible = false;
hitHead.visible = false;
scene.add(hitTorso, hitHead);
const playerActor = {
  id: 'player',
  name: 'You',
  team: 'ember',
  position: player.body.position,
  hitMeshes: [hitTorso, hitHead],
  get alive() {
    return player.alive;
  },
  applyDamage(amount) {
    return player.damage(amount);
  },
};
hitTorso.userData.actor = playerActor;
hitTorso.userData.part = 'torso';
hitHead.userData.actor = playerActor;
hitHead.userData.part = 'head';

// The charge: an amber case with a blinking lamp, visible when dropped or planted.
const chargeGroup = new THREE.Group();
const chargeCase = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.2, 0.46),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), roughness: 0.5, metalness: 0.3 }),
);
const chargeLamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }));
chargeLamp.position.y = 0.16;
chargeGroup.add(chargeCase, chargeLamp);
chargeGroup.visible = false;
scene.add(chargeGroup);

let spectateTarget = null;
let shakeUntil = 0;
let shakeMag = 0;
let elapsed = 0;
let triggerReleased = true;
let lastDry = 0;

const shootDir = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function shake(duration, magnitude) {
  shakeUntil = elapsed + duration;
  shakeMag = magnitude;
}

function onDamage(actor, amount, part, attacker, def) {
  if (!actor.alive) return;
  const died = actor.applyDamage(amount);
  if (actor.id === 'player') {
    hud.damageFlash();
    audio.hurt();
    rounds.interruptActions();
    if (died) {
      if (state.charge.status === 'carried' && state.charge.carrier === 'player') {
        state.charge.status = 'dropped';
        state.charge.carrier = null;
        state.charge.x = player.body.position.x;
        state.charge.z = player.body.position.z;
      }
      spectateTarget = bots.list.find((bot) => bot.team === 'ember' && bot.alive) || null;
    }
  }
  if (attacker && attacker.id === 'player') {
    hud.hitmarker(died);
    audio.hit(part === 'head');
    if (died) audio.kill();
  }
  if (died && attacker) rounds.awardKill(attacker, actor, part === 'head', def ? def.short : 'Frag');
  if (died && actor.id !== 'player' && state.charge.status === 'carried' && state.charge.carrier === actor.id) {
    state.charge.status = 'dropped';
    state.charge.carrier = null;
    state.charge.x = actor.position.x;
    state.charge.z = actor.position.z;
  }
}

const combat = createCombat({ scene, world, effects, audio, rng, onDamage });
const bots = createBots({ scene, world, nav, rng, combat, audio, state });
const allActors = [playerActor, ...bots.list];

const rounds = createRounds({
  state,
  world,
  audio,
  hooks: {
    onRoundStart(survived) {
      const spawn = world.spawns.ember[0];
      player.reset(spawn[0], spawn[1], spawn[2]);
      if (!survived) {
        arsenal.dropPrimary();
        arsenal.refillPistol();
        state.loadout.primary = null;
        state.loadout.armor = 0;
        state.loadout.grenades = 0;
        player.setArmor(0);
      } else {
        player.setArmor(state.loadout.armor);
      }
      bots.reset(world.spawns);
      bots.assignRound();
      effects.reset();
      spectateTarget = null;
      hud.announce(`Round ${state.round}`, state.round === 1 ? 'Plant the charge at Site A or Site B' : '', null, 2200);
    },
    onLive() {
      if (hud.buyOpen()) {
        hud.hideBuy();
        hud.showOverlay('paused');
      }
    },
    onRoundEnd(winner) {
      hud.announce(state.banner.title, state.banner.sub, winner, 4200);
    },
    onMatchEnd() {
      input.releaseLock();
      hud.hideBuy();
      hud.showOverlay('matchEnd', {
        title: state.banner.title,
        sub: state.banner.sub,
        kills: state.kills,
        deaths: state.deaths,
        plants: state.plants,
        defuses: state.defuses,
      });
    },
    onPlant(site, actor) {
      const name = actor === 'player' ? 'You' : bots.byId(actor)?.name || 'A teammate';
      hud.announce(`Charge planted at Site ${site}`, `${name} planted the charge — defend it`, 'ember', 3000);
      shake(0.2, 0.3);
    },
    onChargeExploded() {
      effects.explosion(tmpVec.set(state.charge.x, 0.8, state.charge.z));
      shake(0.6, 0.9);
    },
    onBuy(itemId) {
      if (WEAPONS[itemId]) {
        arsenal.buy(itemId);
        arsenal.equip(itemId);
      }
      if (itemId === 'armor') player.setArmor(100);
      if (hud.buyOpen()) hud.showBuy(state.money, state.loadout, arsenal.ownedList());
      pushHud();
    },
  },
});

const input = createInput(renderer.domElement, onLockChange);

function onLockChange(locked) {
  if (shot) return;
  if (locked) hud.hideOverlay();
  else if ((state.phase === 'live' || state.phase === 'freeze') && !hud.buyOpen()) hud.showOverlay('paused');
}

function onPlay() {
  audio.resume();
  arsenal.setVisible(true);
  if (state.phase === 'menu') rounds.startMatch();
  hud.hideOverlay();
  input.requestLock();
}

function onRestart() {
  audio.resume();
  arsenal.setVisible(true);
  rounds.startMatch();
  hud.hideOverlay();
  input.requestLock();
}

function onBuy(itemId) {
  const result = rounds.buy(itemId);
  if (!result.ok) hud.announce(result.reason, '', null, 1400);
}

function toggleBuy() {
  const inWindow = state.phase === 'freeze' || (state.phase === 'live' && state.timer > TIMING.round - 15);
  if (!inWindow || !player.alive) return;
  if (hud.buyOpen()) {
    hud.hideBuy();
    input.requestLock();
  } else {
    input.releaseLock();
    hud.showBuy(state.money, state.loadout, arsenal.ownedList());
  }
}

function shootPlayer() {
  const def = arsenal.currentDef();
  if (!arsenal.fire()) return;
  camera.getWorldDirection(shootDir);
  const spread = arsenal.spread(player.groundSpeed(), player.body.crouching, !player.body.onGround);
  const gauss = () => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
  shootDir.x += gauss() * spread;
  shootDir.y += gauss() * spread;
  shootDir.z += gauss() * spread;
  shootDir.normalize();
  const muzzle = arsenal.muzzle(tmpMuzzle);
  combat.shoot(muzzle, shootDir, def, playerActor, bots.list.filter((bot) => bot.team === 'warden'));
  audio.shot(def.id);
  player.recoil(def.kick * (0.8 + rng.next() * 0.5), (rng.next() * 2 - 1) * def.kick * 0.4);
  bots.hearShot(player.body.position, 'ember', null);
  hud.crosshair(spread * 900);
}

function handleKeys() {
  if (input.wasPressed('KeyR') && player.alive && state.phase === 'live') {
    if (arsenal.reload()) audio.reload();
  }
  if (input.wasPressed('Digit1') && player.alive) {
    const primary = arsenal.ownedList().find((id) => id !== 'p9');
    if (primary) arsenal.equip(primary);
  }
  if (input.wasPressed('Digit2') && player.alive) arsenal.equip('p9');
  if (input.wasPressed('KeyG') && player.alive && state.phase === 'live' && state.loadout.grenades > 0) {
    camera.getWorldDirection(shootDir);
    if (combat.throwGrenade(player.eyePosition(), shootDir, playerActor)) {
      state.loadout.grenades -= 1;
      audio.click();
    }
  }
  if (input.wasPressed('KeyB')) toggleBuy();
  if (input.wasPressed('Escape') && hud.buyOpen()) {
    hud.hideBuy();
    input.requestLock();
  }
  if (input.wasPressed('KeyM')) {
    state.muted = !state.muted;
    audio.setMuted(state.muted);
  }
}

function handleFiring(now) {
  if (!input.state.firing) {
    triggerReleased = true;
    return;
  }
  if (!input.state.locked || state.phase !== 'live' || !player.alive) return;
  const def = arsenal.currentDef();
  if (!def.auto && !triggerReleased) return;
  if (arsenal.ready()) {
    triggerReleased = false;
    shootPlayer();
  } else if (arsenal.mag() === 0 && !arsenal.reloading() && now - lastDry > 300) {
    lastDry = now;
    triggerReleased = false;
    audio.dryFire();
  }
}

function computePlanter() {
  if (state.charge.status !== 'carried') return null;
  if (state.charge.carrier === 'player') {
    if (!player.alive || !input.state.keys.has('KeyE')) return null;
    for (const site of Object.values(world.sites)) {
      if (Math.hypot(site.x - player.body.position.x, site.z - player.body.position.z) < site.radius - 0.5) {
        return { id: 'player', site: site.id };
      }
    }
    return null;
  }
  const bot = bots.byId(state.charge.carrier);
  if (bot && bot.alive && bot.mode === 'plant') {
    const site = world.sites[bot.targetSite];
    if (site && Math.hypot(site.x - bot.position.x, site.z - bot.position.z) < site.radius - 0.5) {
      return { id: bot.id, site: site.id };
    }
  }
  return null;
}

function computeDefuser() {
  if (state.charge.status !== 'planted') return null;
  for (const bot of bots.list) {
    if (bot.team === 'warden' && bot.alive && bot.mode === 'defuse') {
      if (Math.hypot(state.charge.x - bot.position.x, state.charge.z - bot.position.z) < 2.5) {
        return { id: bot.id };
      }
    }
  }
  return null;
}

function pushHud() {
  hud.setHealth(player.health, player.armor);
  hud.setAmmo(arsenal.mag(), arsenal.reserve(), arsenal.currentDef().name, arsenal.reloading());
  hud.setMoney(state.money);
  hud.setTimer(Math.max(0, state.phase === 'menu' ? TIMING.round : state.timer), state.phase);
  hud.setScore(state.wins.ember, state.wins.warden, state.round);
  hud.setAlive((player.alive ? 1 : 0) + bots.aliveCount('ember'), bots.aliveCount('warden'));
  hud.setGrenades(state.loadout.grenades);
  hud.feed(state.feed);
  const c = state.charge;
  if (state.phase === 'menu' || state.phase === 'matchEnd') hud.setObjective('');
  else if (c.status === 'planted') hud.setObjective(`Charge planted at Site ${c.site} — detonates in ${Math.ceil(c.fuse)}s`);
  else if (c.status === 'dropped') hud.setObjective('The charge is down — pick it up and plant it');
  else if (c.carrier === 'player') hud.setObjective('Charge with you — plant at Site A or Site B');
  else {
    const carrier = bots.byId(c.carrier);
    hud.setObjective(carrier ? `${carrier.name} carries the charge` : '');
  }
  if (state.plant.actor) {
    const name = state.plant.actor === 'player' ? 'You are' : `${bots.byId(state.plant.actor)?.name || 'A teammate'} is`;
    hud.showProgress(`${name} planting at Site ${state.plant.site}…`, state.plant.progress);
  } else if (state.defuse.actor) {
    const name = bots.byId(state.defuse.actor)?.name || 'WARDEN';
    hud.showProgress(`${name} is defusing the charge…`, state.defuse.progress);
  } else {
    hud.hideProgress();
  }
  let hint = '';
  if (state.phase === 'freeze') hint = 'Press B to buy weapons';
  else if (state.phase === 'live' && player.alive) {
    if (c.status === 'carried' && c.carrier === 'player') {
      for (const site of Object.values(world.sites)) {
        if (Math.hypot(site.x - player.body.position.x, site.z - player.body.position.z) < site.radius) {
          hint = 'Hold E to plant the charge';
        }
      }
    } else if (c.status === 'dropped' && Math.hypot(c.x - player.body.position.x, c.z - player.body.position.z) < 4) {
      hint = 'Walk over the charge to pick it up';
    }
  }
  hud.setHint(hint);
  hud.drawMinimap(world, player.body.position, player.body.yaw, bots.list.filter((bot) => bot.team === 'ember'), c);
}

function updateChargeMesh() {
  const c = state.charge;
  chargeGroup.visible = c.status === 'dropped' || c.status === 'planted';
  if (!chargeGroup.visible) return;
  chargeGroup.position.set(c.x, 0.15, c.z);
  const rate = c.status === 'planted' ? 9 : 3;
  chargeLamp.scale.setScalar(0.7 + 0.6 * (0.5 + 0.5 * Math.sin(elapsed * rate)));
}

function updateHitboxes() {
  hitTorso.position.set(player.body.position.x, player.body.position.y + 1.0, player.body.position.z);
  hitHead.position.set(player.body.position.x, player.body.position.y + 1.53, player.body.position.z);
}

function syncCamera() {
  if (state.phase === 'menu') return;
  const shakeAmp = elapsed < shakeUntil ? shakeMag * ((shakeUntil - elapsed) / 0.6) : 0;
  const shX = shakeAmp ? (rng.next() * 2 - 1) * shakeAmp * 0.02 : 0;
  const shY = shakeAmp ? (rng.next() * 2 - 1) * shakeAmp * 0.02 : 0;
  if (player.alive) {
    camera.position.set(player.body.position.x, player.body.position.y + player.body.eye, player.body.position.z);
    camera.rotation.set(player.viewPitch() + shX, player.viewYaw() + shY, 0, 'YXZ');
  } else {
    if (spectateTarget && !spectateTarget.alive) {
      spectateTarget = bots.list.find((bot) => bot.team === 'ember' && bot.alive) || null;
    }
    if (spectateTarget) {
      camera.position.set(spectateTarget.position.x, spectateTarget.position.y + 1.5, spectateTarget.position.z);
      camera.rotation.set(0, spectateTarget.yaw, 0, 'YXZ');
    }
  }
  const wantFov = arsenal.currentId() === 'l88' && input.state.aiming && player.alive ? 38 : 74;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const eye = player.eyePosition();
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  elapsed += dt;
  world.update(elapsed);
  player.step(dt, input.state.keys, state.phase !== 'live' || !player.alive);
  arsenal.step(dt, player.groundSpeed(), player.groundSpeed() > 0.5);
  combat.step(dt, allActors);
  bots.step(dt, { playerActor, frozen: state.phase !== 'live' }, elapsed);
  if (state.phase === 'live' && state.charge.status === 'dropped' && player.alive) {
    const d = Math.hypot(state.charge.x - player.body.position.x, state.charge.z - player.body.position.z);
    if (d < 1.5) {
      state.charge.status = 'carried';
      state.charge.carrier = 'player';
    }
  }
  rounds.step(dt, {
    playerAlive: player.alive,
    bots,
    planter: computePlanter(),
    defuser: computeDefuser(),
  });
  updateChargeMesh();
  updateHitboxes();
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.25);
  lastTime = now;
  const look = input.takeLook();
  if (input.state.locked && player.alive && (state.phase === 'live' || state.phase === 'freeze')) {
    player.look(look.x, look.y);
  }
  handleKeys();
  handleFiring(now);
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 12) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 12) accumulator = 0;
  effects.step(dt);
  pushHud();
  syncCamera();
  renderer.render(scene, camera);
  input.drainPressed();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A read-only handle for debugging and playtesting in the browser console.
window.__cinder = { state, player, camera, bots, world };

// The menu vista: the yard from the EMBER spawn corner, bots waiting at theirs.
// The view model stays hidden until the match starts.
camera.position.set(-25.5, 3.4, 19.5);
camera.lookAt(-2, 1, -8);
arsenal.setVisible(false);
bots.reset(world.spawns);
pushHud();
hud.showOverlay('start');

if (shot) {
  runShot(shot, {
    state, player, arsenal, bots, hud, world, nav, combat, effects,
    camera, renderer, scene, rng, syncCamera, aimAt,
  });
} else {
  requestAnimationFrame(frame);
}
