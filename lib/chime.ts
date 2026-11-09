// One soft chime for PAID (brief 1.5: "one soft chime"). Synthesised, so there is no audio asset to load or license.
let ctx: AudioContext | null = null;

// Must be called from a user gesture once (the "Tap to start" press) so later chimes are allowed to play.
export function unlockAudio() {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function playChime() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [659.25, 987.77].forEach((freq, i) => { // E5 then B5, a gentle fifth
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.16, now + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.9);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 1);
  });
}
