// The one place state lives. Every system reads this object and main.js is the only
// writer of its phase transitions, so the round, the money and the charge can never
// disagree between the HUD, the bots and the rules.
import { MATCH, TIMING } from './config.js';

export function createState() {
  return {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 1,
    wins: { ember: 0, warden: 0 },
    timer: 0, // seconds left in the current phase
    money: MATCH.startMoney,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    loadout: { primary: null, armor: 0, grenades: 0 },
    charge: {
      status: 'carried', // carried | dropped | planted | exploded | defused
      carrier: 'player', // 'player' | bot id | null
      site: null, // 'A' | 'B' | null
      fuse: 0,
      x: 0, z: 0, // where it lies when dropped
    },
    plant: { actor: null, site: null, progress: 0 }, // active plant attempt
    defuse: { actor: null, progress: 0 }, // active defuse attempt
    feed: [], // { text, headshot, killerTeam, victimTeam, at }
    banner: { title: '', sub: '', team: null },
    lastWinner: null,
    lastReason: '',
    muted: false,
  };
}

export function resetMatch(state) {
  state.phase = 'freeze';
  state.round = 1;
  state.wins.ember = 0;
  state.wins.warden = 0;
  state.timer = TIMING.freeze;
  state.money = MATCH.startMoney;
  state.kills = 0;
  state.deaths = 0;
  state.plants = 0;
  state.defuses = 0;
  state.loadout.primary = null;
  state.loadout.armor = 0;
  state.loadout.grenades = 0;
  state.feed.length = 0;
  state.lastWinner = null;
  state.lastReason = '';
  resetCharge(state);
}

export function resetCharge(state) {
  state.charge.status = 'carried';
  state.charge.carrier = 'player';
  state.charge.site = null;
  state.charge.fuse = 0;
  state.plant.actor = null;
  state.plant.site = null;
  state.plant.progress = 0;
  state.defuse.actor = null;
  state.defuse.progress = 0;
}
