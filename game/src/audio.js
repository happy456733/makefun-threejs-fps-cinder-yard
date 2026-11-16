// Every sound is synthesized with WebAudio — no audio files, no network. Gunshots
// are filtered noise bursts over a low thump, UI sounds are short blips, and the
// round stings are two-note phrases. The context resumes on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gain, type = 'lowpass') {
    if (!ctx || muted) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start();
  }

  function tone(freq, duration, gain, type = 'sine', when = 0) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  const SHOT = {
    p9: [900, 0.28],
    vk9: [1400, 0.2],
    kr47: [750, 0.34],
    l88: [420, 0.5],
  };

  return {
    resume() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
    },
    shot(id) {
      const [freq, gain] = SHOT[id] || SHOT.kr47;
      noiseBurst(0.14, freq, gain);
      tone(90, 0.1, 0.22, 'sine');
    },
    enemyShot(id) {
      const [freq, gain] = SHOT[id] || SHOT.kr47;
      noiseBurst(0.11, freq * 0.8, gain * 0.55);
    },
    dryFire() {
      tone(1400, 0.05, 0.08, 'square');
    },
    reload() {
      tone(700, 0.05, 0.1, 'square');
      tone(500, 0.06, 0.1, 'square', 0.18);
    },
    hit(headshot) {
      tone(headshot ? 1900 : 1250, 0.07, 0.16, 'sine');
    },
    kill() {
      tone(1250, 0.07, 0.16, 'sine');
      tone(1800, 0.1, 0.16, 'sine', 0.07);
    },
    hurt() {
      tone(160, 0.14, 0.25, 'sawtooth');
    },
    explosion() {
      noiseBurst(0.7, 300, 0.7);
      tone(55, 0.6, 0.5, 'sine');
    },
    plantBeep() {
      tone(1100, 0.09, 0.2, 'square');
    },
    fuseBeep() {
      tone(1500, 0.06, 0.14, 'square');
    },
    buy() {
      tone(880, 0.06, 0.12, 'sine');
      tone(1320, 0.09, 0.12, 'sine', 0.06);
    },
    click() {
      tone(900, 0.04, 0.08, 'sine');
    },
    roundWin() {
      tone(523, 0.16, 0.2, 'triangle');
      tone(784, 0.24, 0.2, 'triangle', 0.14);
    },
    roundLose() {
      tone(392, 0.16, 0.2, 'triangle');
      tone(262, 0.26, 0.2, 'triangle', 0.14);
    },
  };
}
