/**
 * scene-audio.js
 * Shared audio feedback component using Web Audio API.
 * Plays synthesized tones for spawn, reset, and UI click events.
 * No external audio files required.
 *
 * Usage: Add <script src="../components/scene-audio.js"></script> to any scene.
 * The component auto-registers and listens for scene-level events.
 */
AFRAME.registerComponent('scene-audio', {
  init: function () {
    this.ctx = null; // Lazy-init AudioContext on first user gesture

    // Bind handlers
    this._onSpawn = this._onSpawn.bind(this);
    this._onReset = this._onReset.bind(this);
    this._onClick = this._onClick.bind(this);

    // Listen for spawn-manager events
    this.el.addEventListener('child-attached', this._onSpawn);

    // Listen for custom events from spawn-manager
    window.addEventListener('physics-sandbox:object-spawned', this._onSpawn);
    window.addEventListener('physics-sandbox:objects-reset', this._onReset);

    // UI click sounds — delegate from scene
    this.el.addEventListener('click', this._onClick);
  },

  _ensureContext: function () {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        // Audio not available — fail silently
        return null;
      }
    }
    // Resume if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  },

  _playTone: function (frequency, duration, type, ramp) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    if (ramp === 'up') {
      osc.frequency.linearRampToValueAtTime(frequency * 1.5, ctx.currentTime + duration);
    } else if (ramp === 'down') {
      osc.frequency.linearRampToValueAtTime(frequency * 0.5, ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  },

  _onSpawn: function () {
    // Rising tone — confirms object creation
    this._playTone(440, 0.15, 'sine', 'up');
  },

  _onReset: function () {
    // Descending tone — confirms cleanup
    this._playTone(660, 0.2, 'triangle', 'down');
  },

  _onClick: function (evt) {
    // Only play for clickable elements (buttons), not general scene clicks
    const target = evt.target || evt.detail && evt.detail.el;
    if (target && target.classList && target.classList.contains('clickable')) {
      this._playTone(880, 0.06, 'sine');
    }
  },

  remove: function () {
    window.removeEventListener('physics-sandbox:object-spawned', this._onSpawn);
    window.removeEventListener('physics-sandbox:objects-reset', this._onReset);
    if (this.ctx) {
      this.ctx.close();
    }
  }
});

// Auto-attach to scene when the component is loaded
document.addEventListener('DOMContentLoaded', function () {
  const scene = document.querySelector('a-scene');
  if (scene) {
    scene.setAttribute('scene-audio', '');
  }
});
