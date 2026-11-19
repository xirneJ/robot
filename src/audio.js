import { damp } from './core.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let rainGain = null;
  let servo = null;
  let servoGain = null;
  let hum = null;
  let humGain = null;
  let muted = false;
  let noiseBuffer = null;
  let lastScanPing = 0;

  function makeNoise(seconds = 3) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * .82 + white * .18;
      data[i] = last * .75;
    }
    return buffer;
  }

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : .32; master.connect(ctx.destination);
    noiseBuffer = makeNoise(4);

    const rain = ctx.createBufferSource(); rain.buffer = noiseBuffer; rain.loop = true;
    const rainFilter = ctx.createBiquadFilter(); rainFilter.type = 'highpass'; rainFilter.frequency.value = 900;
    rainGain = ctx.createGain(); rainGain.gain.value = .055;
    rain.connect(rainFilter).connect(rainGain).connect(master); rain.start();

    servo = ctx.createOscillator(); servo.type = 'sawtooth'; servo.frequency.value = 74;
    const servoFilter = ctx.createBiquadFilter(); servoFilter.type = 'bandpass'; servoFilter.frequency.value = 640; servoFilter.Q.value = 1.4;
    servoGain = ctx.createGain(); servoGain.gain.value = 0;
    servo.connect(servoFilter).connect(servoGain).connect(master); servo.start();

    hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 52;
    humGain = ctx.createGain(); humGain.gain.value = .022;
    hum.connect(humGain).connect(master); hum.start();

    const distant = ctx.createBufferSource(); distant.buffer = noiseBuffer; distant.loop = true;
    const distantFilter = ctx.createBiquadFilter(); distantFilter.type = 'lowpass'; distantFilter.frequency.value = 280;
    const distantGain = ctx.createGain(); distantGain.gain.value = .025;
    distant.connect(distantFilter).connect(distantGain).connect(master); distant.start();
  }

  function burst({ freq = 500, q = 1, gain = .15, duration = .13, type = 'bandpass' } = {}) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    src.connect(f).connect(g).connect(master); src.start(); src.stop(ctx.currentTime + duration + .02);
  }

  function beep(freq = 660, duration = .08, gain = .05, type = 'sine') {
    if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq * 1.18, ctx.currentTime + duration);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + duration + .01);
  }

  return {
    start,
    update(dt, state) {
      if (!ctx) return;
      const speed = Math.abs(state.speed || 0);
      servo.frequency.value = damp(servo.frequency.value, 68 + speed * 34, 4, dt);
      servoGain.gain.value = damp(servoGain.gain.value, state.moving ? .012 + speed * .004 : .002, 4, dt);
      humGain.gain.value = damp(humGain.gain.value, state.scanning ? .04 : .022, 3, dt);
      if (state.scanning && performance.now() - lastScanPing > 620) {
        lastScanPing = performance.now(); beep(840 + Math.random() * 120, .065, .024);
      }
    },
    footstep(strength = .5) {
      if (!ctx) return;
      burst({ freq: 170 + Math.random() * 55, q: 1.4, gain: .08 + strength * .07, duration: .13, type: 'lowpass' });
      burst({ freq: 1800 + Math.random() * 700, q: 2.8, gain: .018, duration: .045, type: 'bandpass' });
    },
    scanStart() { beep(460, .16, .035); },
    confirm() { beep(720, .1, .06); setTimeout(() => beep(980, .16, .04), 90); },
    complete() { setTimeout(() => beep(520, .14, .05), 0); setTimeout(() => beep(680, .14, .05), 160); setTimeout(() => beep(920, .32, .06), 330); },
    radio() { burst({ freq: 2500, q: 4, gain: .025, duration: .09, type: 'bandpass' }); },
    mute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : .32;
      return muted;
    },
    get muted() { return muted; }
  };
}
