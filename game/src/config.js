// Every tunable number in one file: weapons, money, round timing, teams. No other
// module hard-codes a price, a damage or a timer; balance changes land here alone.
export const TEAMS = {
  ember: { id: 'ember', name: 'EMBER', color: 0xf0a13c, css: '#f0a13c', role: 'Attack — plant the charge' },
  warden: { id: 'warden', name: 'WARDEN', color: 0x37b3a2, css: '#37b3a2', role: 'Defend — stop the plant' },
};

export const MATCH = {
  roundsToWin: 5,
  maxRounds: 9,
  startMoney: 800,
  maxMoney: 16000,
};

export const TIMING = {
  freeze: 5, // buy time at the start of every round, players held at spawn
  round: 100, // seconds of live play before the round times out
  roundEnd: 4.5, // banner between rounds
  plant: 3, // seconds holding E on a site to plant the charge
  defuse: 5, // seconds holding E on a planted charge to defuse it
  fuse: 25, // seconds from plant to detonation
  grenadeFuse: 1.4, // seconds from throw to explosion
};

export const ECONOMY = {
  kill: 300,
  win: 3250,
  loss: 1400,
  plant: 300,
  defuse: 300,
};

// Damage is per body hit; headshots multiply by headMult. Spread is in radians of cone
// half-angle: still is the floor, moving adds up to moveSpread at full sprint, and firing
// adds bloom that recovers. Stopping to aim pays — that is the whole gunfight.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', short: 'P9', kind: 'pistol', price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48, gap: 0.22, reload: 1.4,
    spreadStill: 0.006, spreadMove: 0.02, bloom: 0.004, auto: false, range: 60,
    kick: 0.011, blurb: 'Reliable sidearm. Free, and deadly in still hands.',
  },
  vk9: {
    id: 'vk9', name: 'VK-9 Viper', short: 'VK-9', kind: 'smg', price: 1200,
    damage: 22, headMult: 2.5, mag: 30, reserve: 120, gap: 0.082, reload: 2.0,
    spreadStill: 0.011, spreadMove: 0.034, bloom: 0.0035, auto: true, range: 55,
    kick: 0.007, blurb: 'Fast hose for close lanes. Burns ammo, sprays wide on the move.',
  },
  kr47: {
    id: 'kr47', name: 'KR-47 Kestrel', short: 'KR-47', kind: 'rifle', price: 2700,
    damage: 33, headMult: 3, mag: 30, reserve: 90, gap: 0.104, reload: 2.2,
    spreadStill: 0.0035, spreadMove: 0.03, bloom: 0.004, auto: true, range: 80,
    kick: 0.01, blurb: 'The workhorse. Tap-fire it standing still and it barely misses.',
  },
  l88: {
    id: 'l88', name: 'L-88 Longshot', short: 'L-88', kind: 'dmr', price: 4750,
    damage: 82, headMult: 2, mag: 5, reserve: 25, gap: 0.95, reload: 2.8,
    spreadStill: 0.0008, spreadMove: 0.05, bloom: 0.02, auto: false, range: 120,
    kick: 0.028, blurb: 'One shot, one down — if you are still. Right-click to scope.',
  },
};

export const GEAR = {
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650, blurb: 'Absorbs half of every hit until it breaks.' },
  grenade: { id: 'grenade', name: 'Frag Grenade', price: 300, blurb: 'Press G to throw. Big blast, mind the bounce.' },
};

export const GRENADE = { damage: 130, radius: 6.5, speed: 16, up: 5.5 };

export const BOT_NAMES = {
  ember: ['Ash', 'Rook'],
  warden: ['Vex', 'Mira', 'Juno'],
};

// Bot skill: reaction time after first seeing a target, burst length, and the spread
// multiplier on their shots. One profile keeps the fight fair and readable.
export const BOT_SKILL = { reactMin: 0.35, reactMax: 0.8, burstMin: 3, burstMax: 6, spreadMult: 1.6, hearRadius: 26 };
