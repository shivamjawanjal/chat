/**
 * audio.js — Sound notification handler
 * Uses the Web Audio API to generate tones without external files.
 */
const AudioManager = (() => {
  let ctx = null;
  let enabled = true;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playTone({ frequency = 440, type = 'sine', duration = 0.12, volume = 0.25, fadeOut = true } = {}) {
    if (!enabled) return;
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ac.currentTime);
      gain.gain.setValueAtTime(volume, ac.currentTime);
      if (fadeOut) gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration);
    } catch (_) { /* silently fail */ }
  }

  return {
    /** Short chime for incoming message */
    playReceive() {
      playTone({ frequency: 880, duration: 0.15, volume: 0.18 });
      setTimeout(() => playTone({ frequency: 1100, duration: 0.12, volume: 0.14 }), 90);
    },
    /** Soft pop for sent message */
    playSend() {
      playTone({ frequency: 660, type: 'triangle', duration: 0.1, volume: 0.1 });
    },
    /** Rising arpeggio for friend request */
    playFriendRequest() {
      [440, 550, 660].forEach((f, i) => {
        setTimeout(() => playTone({ frequency: f, duration: 0.12, volume: 0.15 }), i * 80);
      });
    },
    /** Short blip for notification */
    playNotification() {
      playTone({ frequency: 720, type: 'triangle', duration: 0.2, volume: 0.15 });
    },
    setEnabled(val) { enabled = !!val; },
    isEnabled() { return enabled; },
  };
})();
