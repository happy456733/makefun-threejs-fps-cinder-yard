// The DOM HUD: crosshair, hit marker, health and armour, ammo and money, the round
// timer and score, the kill feed, the buy menu, the minimap and every overlay. It
// never touches the simulation; main.js pushes numbers in and reads the button
// callbacks out. DOM writes are cached — a value that did not change is not set.
import { WEAPONS, GEAR } from './config.js';

const COPY = {
  start: {
    title: 'CINDER YARD',
    copy: 'A freight yard at dusk. You are EMBER — plant the charge at Site A or Site B, or wipe out WARDEN. First to five rounds takes the match.',
    action: 'Click to play',
  },
  paused: { title: 'Paused', copy: 'The round waits for no one. Click to get back in.', action: 'Click to resume' },
  dead: { title: 'Eliminated', copy: 'Spectating a teammate until the round ends.', action: '' },
};

export function createHud({ onPlay, onBuy, onRestart }) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const overlayTitle = $('overlay-title');
  const overlayCopy = $('overlay-copy');
  const overlayStats = $('overlay-stats');
  const playButton = $('play');
  const keysList = $('keys-list');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const armorNum = $('armor-num');
  const armorBar = $('armor-bar');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreEmber = $('score-ember');
  const scoreWarden = $('score-warden');
  const roundLabel = $('round-label');
  const aliveEmber = $('alive-ember');
  const aliveWarden = $('alive-warden');
  const feedEl = $('feed');
  const announceEl = $('announce');
  const announceTitle = $('announce-title');
  const announceSub = $('announce-sub');
  const objectiveText = $('objective-text');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressBar = $('progress-bar');
  const hintEl = $('hint');
  const damageEl = $('damage');
  const grenadeEl = $('grenade-ind');
  const buyEl = $('buy');
  const buyMoney = $('buy-money');
  const buyItems = $('buy-items');
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');

  let last = {};
  let hitTimer = 0;
  let announceTimer = 0;
  let damageTimer = 0;
  let mode = 'start';

  function setIf(key, value, apply) {
    if (last[key] === value) return;
    last[key] = value;
    apply(value);
  }

  // The buy menu is built once from the weapon and gear tables.
  const buyButtons = {};
  for (const item of [...Object.values(WEAPONS), GEAR.armor, GEAR.grenade]) {
    if (item.price === 0) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-item';
    button.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span><span class="buy-blurb">${item.blurb}</span>`;
    button.addEventListener('click', () => onBuy(item.id));
    buyItems.appendChild(button);
    buyButtons[item.id] = button;
  }

  playButton.addEventListener('click', () => {
    if (mode === 'matchEnd') onRestart();
    else onPlay();
  });

  return {
    setHealth(health, armor) {
      setIf('hp', health, (v) => {
        healthNum.textContent = String(v);
        healthBar.style.width = `${v}%`;
        healthBar.classList.toggle('low', v <= 25);
      });
      setIf('ar', armor, (v) => {
        armorNum.textContent = String(v);
        armorBar.style.width = `${v}%`;
      });
    },
    setAmmo(mag, reserve, name, reloading) {
      setIf('mag', `${mag}/${reserve}/${name}/${reloading}`, () => {
        ammoMag.textContent = String(mag);
        ammoReserve.textContent = `/ ${reserve}`;
        weaponName.textContent = reloading ? `${name} — reloading` : name;
        $('ammo').classList.toggle('empty', mag === 0);
      });
    },
    setMoney(money) {
      setIf('money', money, (v) => {
        moneyValue.textContent = `$${v}`;
      });
    },
    setTimer(seconds, phase) {
      const text = phase === 'freeze' ? `BUY ${Math.ceil(seconds)}` : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      setIf('timer', text, (v) => {
        timerValue.textContent = v;
        timerValue.classList.toggle('urgent', phase === 'live' && seconds <= 10);
      });
    },
    setScore(ember, warden, round) {
      setIf('score', `${ember}-${warden}-${round}`, () => {
        scoreEmber.textContent = String(ember);
        scoreWarden.textContent = String(warden);
        roundLabel.textContent = `ROUND ${round}`;
      });
    },
    setAlive(ember, warden) {
      setIf('alive', `${ember}/${warden}`, () => {
        aliveEmber.textContent = '●'.repeat(ember) + '○'.repeat(3 - ember);
        aliveWarden.textContent = '●'.repeat(warden) + '○'.repeat(3 - warden);
      });
    },
    setObjective(text) {
      setIf('obj', text, (v) => {
        objectiveText.textContent = v;
      });
    },
    setGrenades(count) {
      setIf('nade', count, (v) => {
        grenadeEl.textContent = v > 0 ? `◉ Frag ×${v} [G]` : '';
      });
    },
    setHint(text) {
      setIf('hint', text, (v) => {
        hintEl.textContent = v;
      });
    },
    crosshair(spreadPx) {
      const gap = Math.round(4 + spreadPx);
      if (last.gap === gap) return;
      last.gap = gap;
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitmarker(kill) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), 130);
    },
    damageFlash() {
      damageEl.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageEl.classList.remove('on'), 220);
    },
    feed(entries) {
      const key = entries.map((e) => `${e.killer}${e.victim}${e.headshot}`).join('|');
      if (last.feed === key) return;
      last.feed = key;
      feedEl.innerHTML = '';
      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = `feed-row${entry.headshot ? ' head' : ''}`;
        row.innerHTML = `<span class="feed-killer team-${entry.killerTeam}">${entry.killer}</span><span class="feed-weapon">${entry.weapon || ''}</span><span class="feed-victim team-${entry.victimTeam}">${entry.victim}</span>`;
        feedEl.appendChild(row);
      }
    },
    announce(title, sub, team, holdMs = 2600) {
      announceTitle.textContent = title;
      announceSub.textContent = sub || '';
      announceEl.classList.remove('team-ember', 'team-warden');
      if (team) announceEl.classList.add(`team-${team}`);
      announceEl.classList.add('on');
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => announceEl.classList.remove('on'), holdMs);
    },
    showProgress(label, t) {
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressBar.style.width = `${Math.round(t * 100)}%`;
    },
    hideProgress() {
      progressWrap.hidden = true;
    },
    showBuy(money, loadout, owned) {
      buyEl.hidden = false;
      buyMoney.textContent = `$${money}`;
      for (const [id, button] of Object.entries(buyButtons)) {
        const item = WEAPONS[id] || GEAR[id];
        const disabled =
          money < item.price ||
          (WEAPONS[id] && owned.includes(id)) ||
          (id === 'armor' && loadout.armor > 0) ||
          (id === 'grenade' && loadout.grenades > 0);
        button.disabled = disabled;
        button.classList.toggle('owned', Boolean(WEAPONS[id] && owned.includes(id)));
      }
    },
    hideBuy() {
      buyEl.hidden = true;
    },
    buyOpen() {
      return !buyEl.hidden;
    },
    showOverlay(nextMode, data = {}) {
      mode = nextMode;
      const text = COPY[nextMode] || {};
      if (nextMode === 'matchEnd') {
        overlayTitle.textContent = data.title || 'Match over';
        overlayCopy.textContent = data.sub || '';
        overlayStats.hidden = false;
        overlayStats.innerHTML = `Kills <b>${data.kills}</b> · Deaths <b>${data.deaths}</b> · Plants <b>${data.plants}</b> · Defuses <b>${data.defuses}</b>`;
        playButton.textContent = 'Play again';
        keysList.hidden = true;
      } else {
        overlayTitle.textContent = text.title;
        overlayCopy.textContent = text.copy;
        overlayStats.hidden = true;
        playButton.textContent = text.action;
        keysList.hidden = false;
      }
      overlay.hidden = false;
      if (text.action) playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    drawMinimap(world, playerPos, playerYaw, friendlies, charge) {
      const W = minimap.width;
      const H = minimap.height;
      const scale = Math.min(W / 58, H / 46);
      const ox = W / 2;
      const oy = H / 2;
      const px = (x) => ox + x * scale;
      const pz = (z) => oy + z * scale;
      mapCtx.clearRect(0, 0, W, H);
      mapCtx.fillStyle = 'rgba(20, 22, 27, 0.82)';
      mapCtx.fillRect(0, 0, W, H);
      mapCtx.fillStyle = '#3d414c';
      for (const [x, z, w, d] of world.mapRects) {
        if (Math.abs(x) > 28 || Math.abs(z) > 22) continue;
        mapCtx.fillRect(px(x - w / 2), pz(z - d / 2), Math.max(1, w * scale), Math.max(1, d * scale));
      }
      mapCtx.strokeStyle = '#f0a13c';
      mapCtx.lineWidth = 1.5;
      for (const site of Object.values(world.sites)) {
        mapCtx.beginPath();
        mapCtx.arc(px(site.x), pz(site.z), site.radius * scale, 0, Math.PI * 2);
        mapCtx.stroke();
        mapCtx.fillStyle = '#f0a13c';
        mapCtx.font = 'bold 10px system-ui, sans-serif';
        mapCtx.fillText(site.id, px(site.x) - 3, pz(site.z) + 3);
      }
      if (charge.status === 'dropped' || charge.status === 'planted') {
        mapCtx.fillStyle = charge.status === 'planted' ? '#e5484d' : '#f0a13c';
        const cx = px(charge.x);
        const cy = pz(charge.z);
        mapCtx.beginPath();
        mapCtx.moveTo(cx, cy - 4);
        mapCtx.lineTo(cx + 4, cy);
        mapCtx.lineTo(cx, cy + 4);
        mapCtx.lineTo(cx - 4, cy);
        mapCtx.fill();
      }
      for (const friend of friendlies) {
        if (!friend.alive) continue;
        mapCtx.fillStyle = '#f0a13c';
        mapCtx.beginPath();
        mapCtx.arc(px(friend.position.x), pz(friend.position.z), 3, 0, Math.PI * 2);
        mapCtx.fill();
      }
      // The player: an arrow that turns with the camera.
      mapCtx.save();
      mapCtx.translate(px(playerPos.x), pz(playerPos.z));
      mapCtx.rotate(-playerYaw + Math.PI);
      mapCtx.fillStyle = '#ece7da';
      mapCtx.beginPath();
      mapCtx.moveTo(0, -6);
      mapCtx.lineTo(4, 5);
      mapCtx.lineTo(-4, 5);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.restore();
    },
  };
}
