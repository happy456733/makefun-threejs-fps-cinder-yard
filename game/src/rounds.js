// The round and the match: freeze, live, round end, match end. One state machine
// owns the timer, the money, the plant and the defuse, so a round can end exactly
// one way — elimination, timeout, detonation or defuse — and the payout follows it.
// The economy is the player's alone; bots always carry their rifles.
import { ECONOMY, MATCH, TIMING, WEAPONS, GEAR } from './config.js';
import { resetCharge } from './state.js';

export function createRounds({ state, world, audio, hooks }) {
  let lastBeep = -1;

  function pay(amount) {
    state.money = Math.min(MATCH.maxMoney, state.money + amount);
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.timer = TIMING.roundEnd;
    state.wins[winner] += 1;
    state.lastWinner = winner;
    state.lastReason = reason;
    pay(winner === 'ember' ? ECONOMY.win : ECONOMY.loss);
    state.banner = {
      title: winner === 'ember' ? 'EMBER takes the round' : 'WARDEN takes the round',
      sub: reason,
      team: winner,
    };
    if (winner === 'ember') audio.roundWin();
    else audio.roundLose();
    hooks.onRoundEnd(winner, reason);
  }

  function startRound(survived) {
    state.phase = 'freeze';
    state.timer = TIMING.freeze;
    resetCharge(state);
    hooks.onRoundStart(survived);
  }

  function startMatch() {
    state.round = 1;
    state.wins.ember = 0;
    state.wins.warden = 0;
    state.money = MATCH.startMoney;
    state.kills = 0;
    state.deaths = 0;
    state.plants = 0;
    state.defuses = 0;
    state.feed.length = 0;
    state.lastWinner = null;
    startRound(true);
  }

  function plantCharge(actor, site) {
    state.charge.status = 'planted';
    state.charge.site = site;
    state.charge.carrier = null;
    state.charge.fuse = TIMING.fuse;
    state.charge.x = world.sites[site].x;
    state.charge.z = world.sites[site].z;
    state.plant.actor = null;
    state.plant.progress = 0;
    if (actor === 'player') {
      pay(ECONOMY.plant);
      state.plants += 1;
    }
    audio.plantBeep();
    hooks.onPlant(site, actor);
  }

  function defuseCharge(actor) {
    state.charge.status = 'defused';
    state.defuse.actor = null;
    state.defuse.progress = 0;
    if (actor === 'player') {
      pay(ECONOMY.defuse);
      state.defuses += 1;
    }
    endRound('warden', actor === 'player' ? 'You defused the charge' : 'The charge was defused');
  }

  function awardKill(killer, victim, headshot, weaponId) {
    state.feed.unshift({
      killer: killer.name,
      victim: victim.name,
      headshot,
      weapon: weaponId,
      killerTeam: killer.team,
      victimTeam: victim.team,
    });
    if (state.feed.length > 5) state.feed.pop();
    if (killer.id === 'player') {
      pay(ECONOMY.kill);
      state.kills += 1;
    }
    if (victim.id === 'player') state.deaths += 1;
  }

  function buy(itemId) {
    if (state.phase !== 'freeze' && state.phase !== 'live') return { ok: false, reason: 'Too late to buy' };
    if (state.phase === 'live' && state.timer < TIMING.round - 15) return { ok: false, reason: 'Buy time is over' };
    const item = WEAPONS[itemId] || GEAR[itemId];
    if (!item) return { ok: false, reason: 'No such item' };
    if (state.money < item.price) return { ok: false, reason: 'Not enough money' };
    if (itemId === 'armor' && state.loadout.armor > 0) return { ok: false, reason: 'Already armoured' };
    if (itemId === 'grenade' && state.loadout.grenades > 0) return { ok: false, reason: 'Already carrying one' };
    state.money -= item.price;
    if (WEAPONS[itemId]) state.loadout.primary = itemId;
    if (itemId === 'armor') state.loadout.armor = 100;
    if (itemId === 'grenade') state.loadout.grenades = 1;
    audio.buy();
    hooks.onBuy(itemId);
    return { ok: true };
  }

  function interruptActions() {
    state.plant.actor = null;
    state.plant.progress = 0;
    state.defuse.actor = null;
    state.defuse.progress = 0;
  }

  function step(dt, ctx) {
    if (state.phase === 'freeze') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = TIMING.round;
        hooks.onLive();
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.wins.ember >= MATCH.roundsToWin || state.wins.warden >= MATCH.roundsToWin || state.round >= MATCH.maxRounds) {
          state.phase = 'matchEnd';
          const winner = state.wins.ember > state.wins.warden ? 'ember' : 'warden';
          state.banner = {
            title: winner === 'ember' ? 'EMBER wins the match' : 'WARDEN wins the match',
            sub: `${state.wins.ember} — ${state.wins.warden} after ${state.round} rounds`,
            team: winner,
          };
          hooks.onMatchEnd(winner);
        } else {
          state.round += 1;
          startRound(ctx.playerAlive);
        }
      }
      return;
    }
    if (state.phase !== 'live') return;

    state.timer -= dt;

    // Plant: the carrier holds still inside a site radius for three seconds.
    const charge = state.charge;
    if (charge.status === 'carried') {
      const planter = ctx.planter; // { id, x, z, site } or null
      if (planter) {
        if (state.plant.actor !== planter.id || state.plant.site !== planter.site) {
          state.plant.actor = planter.id;
          state.plant.site = planter.site;
          state.plant.progress = 0;
        }
        state.plant.progress += dt / TIMING.plant;
        if (state.plant.progress >= 1) plantCharge(planter.id, planter.site);
      } else if (state.plant.actor) {
        state.plant.actor = null;
        state.plant.progress = 0;
      }
    }

    // Defuse: anyone on WARDEN holds still beside the planted charge for five seconds.
    if (charge.status === 'planted') {
      charge.fuse -= dt;
      const whole = Math.ceil(charge.fuse);
      if (charge.fuse < 10 && whole !== lastBeep) {
        lastBeep = whole;
        audio.fuseBeep();
      }
      const defuser = ctx.defuser; // { id } or null
      if (defuser) {
        if (state.defuse.actor !== defuser.id) {
          state.defuse.actor = defuser.id;
          state.defuse.progress = 0;
        }
        state.defuse.progress += dt / TIMING.defuse;
        if (state.defuse.progress >= 1) {
          defuseCharge(defuser.id);
          return;
        }
      } else if (state.defuse.actor) {
        state.defuse.actor = null;
        state.defuse.progress = 0;
      }
      if (charge.fuse <= 0) {
        charge.status = 'exploded';
        hooks.onChargeExploded();
        endRound('ember', 'The charge detonated');
        return;
      }
    }

    // Elimination. A planted charge keeps the round alive: with every attacker dead
    // the defenders must still defuse, and with every defender dead nobody can.
    const emberAlive = (ctx.playerAlive ? 1 : 0) + ctx.bots.aliveCount('ember');
    const wardenAlive = ctx.bots.aliveCount('warden');
    if (charge.status === 'planted') {
      if (wardenAlive === 0) endRound('ember', 'No defender left to stop the charge');
    } else if (emberAlive === 0) {
      endRound('warden', 'EMBER eliminated');
    } else if (wardenAlive === 0) {
      endRound('ember', 'WARDEN eliminated');
    } else if (state.timer <= 0) {
      endRound('warden', 'Time expired — the charge was never planted');
    }
  }

  return { startMatch, startRound, endRound, step, awardKill, buy, interruptActions, plantCharge, defuseCharge };
}
