import { useCallback, useRef } from "react";

export function useSoundManager(isMuted: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtxRef.current = new AudioContextClass();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch (e) {
      console.warn("Failed to initialize AudioContext", e);
      return null;
    }
  };

  // 1. DIce Roll sound: Rapid rumble & pitch tumbling
  const playRoll = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Synthesize 5 rolling clicks offset slightly to sound like tumbling dice
      for (let i = 0; i < 6; i++) {
        const time = now + i * 0.08;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "triangle";
        // Start high, slide down fast to a wooden rumble sound
        osc.frequency.setValueAtTime(320 + Math.random() * 180, time);
        osc.frequency.exponentialRampToValueAtTime(45, time + 0.06);

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

        osc.start(time);
        osc.stop(time + 0.07);
      }
    } catch (e) {
      console.warn("Audio playRoll error:", e);
    }
  }, [isMuted]);

  // 2. Token Move sound: High-quality sweet ascending bounce sound
  const playMove = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(260, now);
      // Sweeps up gracefully for a bouncing sensation
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.15);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {
      console.warn("Audio playMove error:", e);
    }
  }, [isMuted]);

  // 3. Capture sound: Explosive retro noise/strike sweep when hitting an opponent's token!
  const playCapture = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Primary synth oscillator for metallic hit
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.35);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.36);

      // Low frequency rumble sub-synth to represent the impact
      const oscRumble = ctx.createOscillator();
      const gainRumble = ctx.createGain();
      oscRumble.type = "square";
      oscRumble.connect(gainRumble);
      gainRumble.connect(ctx.destination);

      oscRumble.frequency.setValueAtTime(120, now);
      oscRumble.frequency.exponentialRampToValueAtTime(40, now + 0.25);

      gainRumble.gain.setValueAtTime(0.12, now);
      gainRumble.gain.linearRampToValueAtTime(0.001, now + 0.25);

      oscRumble.start(now);
      oscRumble.stop(now + 0.26);

    } catch (e) {
      console.warn("Audio playCapture error:", e);
    }
  }, [isMuted]);

  // 4. Triumph Win Fanfare: Fast ascending major scale arpeggio
  const playWin = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // High-register celebratory arpeggiation (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      
      notes.forEach((freq, idx) => {
        const time = now + idx * 0.11;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time);

        // Subtly soften the high pitch
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(2500, time);

        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

        osc.start(time);
        osc.stop(time + 0.32);
      });
    } catch (e) {
      console.warn("Audio playWin error:", e);
    }
  }, [isMuted]);

  // 5. Retro Sad Loss sound: Decreasing minor arpeggio
  const playLoss = useCallback(() => {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Somber descent (A4 -> F4 -> D4 -> Bb3)
      const notes = [440.00, 349.23, 293.66, 233.08];

      notes.forEach((freq, idx) => {
        const time = now + idx * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.linearRampToValueAtTime(freq - 15, time + 0.22); // mournful minor slide

        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

        osc.start(time);
        osc.stop(time + 0.24);
      });
    } catch (e) {
      console.warn("Audio playLoss error:", e);
    }
  }, [isMuted]);

  return {
    playRoll,
    playMove,
    playCapture,
    playWin,
    playLoss,
  };
}
