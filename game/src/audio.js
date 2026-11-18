// Procedural sound only: every effect is an oscillator or filtered noise made here, no audio
// file is ever loaded. The context is created on the first user gesture (browsers block sound
// before one) and every call is a no-op until then, so staged screenshots stay silent and safe.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let engine = null;
  let siren = null;
  let sirenPhase = 0;
  let sirenTimer = 0;
  let muted = false;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      engine = { osc: ctx.createOscillator(), gain: ctx.createGain(), filter: ctx.createBiquadFilter() };
      engine.osc.type = 'sawtooth';
      engine.osc.frequency.value = 42;
      engine.filter.type = 'lowpass';
      engine.filter.frequency.value = 420;
      engine.gain.gain.value = 0;
      engine.osc.connect(engine.filter);
      engine.filter.connect(engine.gain);
      engine.gain.connect(master);
      engine.osc.start();
      siren = { osc: ctx.createOscillator(), gain: ctx.createGain() };
      siren.osc.type = 'square';
      siren.osc.frequency.value = 720;
      siren.gain.gain.value = 0;
      siren.osc.connect(siren.gain);
      siren.gain.connect(master);
      siren.osc.start();
    } catch {
      ctx = null;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    unlock,
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    /** Continuous layers, called every frame: engine hum while driving, siren by police range. */
    update(dt, driving, speed01, policeNear) {
      if (!ctx) return;
      if (engine) {
        const target = driving ? 0.05 + speed01 * 0.075 : 0;
        engine.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engine.osc.frequency.setTargetAtTime(42 + speed01 * 96, ctx.currentTime, 0.08);
        engine.filter.frequency.setTargetAtTime(380 + speed01 * 900, ctx.currentTime, 0.1);
      }
      if (siren) {
        const near = policeNear < 900;
        siren.gain.gain.setTargetAtTime(near ? 0.028 * (1 - policeNear / 950) : 0, ctx.currentTime, 0.15);
        if (near) {
          sirenTimer += dt;
          if (sirenTimer > 0.42) {
            sirenTimer = 0;
            sirenPhase = 1 - sirenPhase;
            siren.osc.frequency.setTargetAtTime(sirenPhase ? 880 : 660, ctx.currentTime, 0.02);
          }
        }
      }
    },
    punch() { noise(0.12, 0.5, 300); blip(90, 0.1, 'sine', 0.4, 55); },
    gunshot() { noise(0.14, 0.55, 2400, 'highpass'); blip(220, 0.08, 'square', 0.25, 70); },
    pickup() { blip(660, 0.09, 'sine', 0.35); setTimeout(() => blip(990, 0.14, 'sine', 0.35), 70); },
    crash(hard) { noise(0.25, hard ? 0.6 : 0.3, 500); },
    click() { blip(520, 0.05, 'sine', 0.2); },
    denied() { blip(160, 0.16, 'square', 0.22, 110); },
    /** Four-note mission-complete jingle. */
    jingle() {
      if (!ctx) return;
      [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => blip(freq, 0.22, 'triangle', 0.32), i * 110));
    },
    busted() { [392, 330, 262].forEach((freq, i) => setTimeout(() => blip(freq, 0.3, 'triangle', 0.3), i * 160)); },
  };
}
