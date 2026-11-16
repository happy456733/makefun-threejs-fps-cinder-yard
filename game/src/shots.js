// Staged states for the screenshots: ?shot=start|buy|play|end with &seed=N.
// Each sets up one deterministic frame — the title screen, the buy menu, mid-combat
// with a live HUD, and the match-end screen — renders it twice, then freezes it and
// sets window.__shotReady. Nothing here runs in a real game.
import * as THREE from 'three';

const vista = new THREE.Vector3();

function paintTwiceThenReady(g) {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    g.syncCamera();
    g.renderer.render(g.scene, g.camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function stageCommon(g) {
  g.bots.reset(g.world.spawns);
  g.bots.assignRound();
  g.state.feed.length = 0;
  g.hud.hideBuy();
  g.hud.hideProgress();
}

function lookFrom(g, x, y, z, tx, ty, tz) {
  g.camera.position.set(x, y, z);
  vista.set(tx, ty, tz);
  g.camera.lookAt(vista);
  g.camera.rotation.order = 'YXZ';
}

export function runShot(name, g) {
  const { state, player, arsenal, bots, hud } = g;
  stageCommon(g);

  if (name === 'buy') {
    state.phase = 'freeze';
    state.timer = 5;
    state.round = 1;
    state.money = 4750;
    player.reset(-22, 16, -0.15);
    arsenal.buy('kr47');
    arsenal.equip('kr47');
    g.syncCamera();
    hud.setHealth(100, 0);
    hud.setAmmo(30, 90, 'KR-47 Kestrel', false);
    hud.setMoney(4750);
    hud.setTimer(5, 'freeze');
    hud.setScore(0, 0, 1);
    hud.setAlive(3, 3);
    hud.setObjective('Buy your loadout — the round starts in 5 seconds.');
    hud.setGrenades(0);
    hud.hideOverlay();
    hud.showBuy(4750, state.loadout, arsenal.ownedList());
    paintTwiceThenReady(g);
    return;
  }

  if (name === 'play') {
    state.phase = 'live';
    state.timer = 83;
    state.round = 3;
    state.wins.ember = 2;
    state.wins.warden = 1;
    state.money = 3250;
    player.reset(0, 8, 0);
    player.setArmor(50);
    arsenal.buy('kr47');
    arsenal.equip('kr47');
    // One defender holds the mid lane ahead, mid-strafe, in the crosshair.
    const foe = bots.byId('warden-0');
    foe.position.set(1.5, 0, -7.5);
    foe.yaw = Math.PI;
    foe.group.rotation.y = Math.PI;
    foe.legL.rotation.x = 0.45;
    foe.legR.rotation.x = -0.45;
    foe.body.position.y = 0.03;
    // A teammate pushes the west lane beside the player.
    const mate = bots.byId('ember-0');
    mate.position.set(-5.5, 0, 3.5);
    mate.yaw = -0.4;
    mate.group.rotation.y = -0.4;
    mate.legL.rotation.x = -0.4;
    mate.legR.rotation.x = 0.4;
    g.aimAt(new THREE.Vector3(1.5, 1.15, -7.5));
    // A tracer and an impact burst, frozen mid-flight: the fight is on.
    const muzzle = arsenal.muzzle(new THREE.Vector3());
    const chest = new THREE.Vector3(1.5, 1.15, -7.5);
    g.effects.tracer(muzzle, chest);
    g.effects.impact(new THREE.Vector3(1.9, 1.3, -7.4));
    state.feed.unshift(
      { killer: 'You', victim: 'Mira', headshot: true, weapon: 'KR-47', killerTeam: 'ember', victimTeam: 'warden' },
      { killer: 'Ash', victim: 'Juno', headshot: false, weapon: 'KR-47', killerTeam: 'ember', victimTeam: 'warden' },
    );
    hud.setHealth(100, 50);
    hud.setAmmo(24, 90, 'KR-47 Kestrel', false);
    hud.setMoney(3250);
    hud.setTimer(83, 'live');
    hud.setScore(2, 1, 3);
    hud.setAlive(3, 2);
    hud.setObjective('Charge with you — plant at Site A or Site B.');
    hud.setGrenades(1);
    hud.setHint('');
    hud.feed(state.feed);
    hud.hideOverlay();
    paintTwiceThenReady(g);
    return;
  }

  if (name === 'end') {
    state.phase = 'matchEnd';
    state.round = 8;
    state.wins.ember = 5;
    state.wins.warden = 3;
    state.kills = 14;
    state.deaths = 6;
    state.plants = 2;
    state.defuses = 0;
    state.banner = { title: 'EMBER wins the match', sub: '5 — 3 after 8 rounds', team: 'ember' };
    player.reset(19, 12, Math.PI * 0.85);
    g.syncCamera();
    hud.setScore(5, 3, 8);
    hud.setTimer(0, 'live');
    hud.setAlive(2, 0);
    hud.setObjective('');
    hud.hideBuy();
    hud.showOverlay('matchEnd', {
      title: state.banner.title,
      sub: state.banner.sub,
      kills: 14,
      deaths: 6,
      plants: 2,
      defuses: 0,
    });
    paintTwiceThenReady(g);
    return;
  }

  // start: the title screen over the yard at dusk, bots at their spawns.
  state.phase = 'menu';
  player.reset(-22, 16, 0);
  lookFrom(g, -25.5, 3.4, 19.5, -2, 1, -8);
  hud.setHealth(100, 0);
  hud.setAmmo(12, 48, 'P9 Sidearm', false);
  hud.setMoney(800);
  hud.setTimer(100, 'live');
  hud.setScore(0, 0, 1);
  hud.setAlive(3, 3);
  hud.setObjective('');
  hud.showOverlay('start');
  // The vista camera is fixed for this shot: paint without syncing the player camera.
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    g.renderer.render(g.scene, g.camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
