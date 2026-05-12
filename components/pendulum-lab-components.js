/**
 * pendulum-lab-components.js
 * All A-Frame components specific to the Pendulum Observatory lab.
 * Extracted from the legacy standalone pendulum-lab.html for use in the SPA architecture.
 */

if (!AFRAME.components['pendulum']) {
  AFRAME.registerComponent('pendulum', {
    schema: {
      length:  { type: 'number', default: 3 },
      angle:   { type: 'number', default: 45 },
      damping: { type: 'number', default: 0 },
      mass:    { type: 'number', default: 5 }
    },

    init: function () {
      this.pivotY = 6;
      this.angularVel = 0;
      this.currentAngle = 0;
      this.running = false;
      this.bob = null;
      this.rope = null;
      this.trailDots = [];
      this.lastTrailTime = 0;
      this.MAX_TRAIL_DOTS = 30;
      this.halfPeriodCount = 0;
      this.lastAngleSign = 0;
      this.periodStart = 0;
      this.lastPeriod = 0;
      this.energyScale = 1;
      this.keBar = null;
      this.peBar = null;
      this.totalBar = null;
      this.periodText = null;
      this.massText = null;
      // Cache references after the scene loads
      const cacheRefs = () => {
        this.keBar = document.getElementById('ke-bar');
        this.peBar = document.getElementById('pe-bar');
        this.totalBar = document.getElementById('total-bar');
        this.periodText = document.getElementById('period-text');
        this.massText = document.getElementById('mass-text');
      };
      if (this.el.sceneEl.hasLoaded) cacheRefs();
      else this.el.sceneEl.addEventListener('loaded', cacheRefs);

      // Teardown: clean up bob and trail on scene transition
      this._onTeardown = () => { this.removeBob(); };
      window.addEventListener('scene-teardown', this._onTeardown);
    },

    remove: function() {
      this.removeBob();
      window.removeEventListener('scene-teardown', this._onTeardown);
    },

    createBob: function (modelUrl) {
      this.removeBob();
      const scene = this.el.sceneEl;
      this.bob = window.ModelSpawner.instantiateModel({
        sceneEl: scene,
        model: modelUrl,
        enableDragger: true,
        dynamicBody: false,
        onModelError: () => {
          const st = document.getElementById('selection-text');
          if (st) st.setAttribute('text', 'value: Load Error; align: center; width: 1.25; color: #f44336');
        }
      });

      this.rope = document.createElement('a-cylinder');
      this.rope.setAttribute('radius', '0.02');
      this.rope.setAttribute('material', 'color:#ccc;emissive:#444;emissiveIntensity:0.3');
      scene.appendChild(this.rope);

      this.currentAngle = (this.data.angle * Math.PI) / 180;
      this.angularVel = 0;
      this.running = false;

      const maxPE = this.data.mass * 9.8 * (this.data.length - this.data.length * Math.cos(this.currentAngle));
      this.energyScale = Math.max(maxPE, 1);
      this.halfPeriodCount = 0;
      this.lastAngleSign = Math.sign(this.currentAngle);
      this.periodStart = 0;
      this.lastPeriod = 0;
      if (this.periodText) {
        this.periodText.setAttribute('text', 'value:Swing: --; align:center; width:2.5; color:#FFEB3B');
      }
      this.updateBobPosition();
      this.updateEnergyBars(0);
    },

    release: function () {
      if (!this.bob) return;
      this.running = true;
      this.periodStart = performance.now();
      this.halfPeriodCount = 0;
      this.prevAngle = this.currentAngle;
      window.dispatchEvent(new CustomEvent('physics-sandbox:pendulum-released'));
    },

    updateBobPosition: function () {
      if (!this.bob) return;
      const length = this.data.length;
      const angle = this.currentAngle;
      const bobX = length * Math.sin(angle);
      const bobY = this.pivotY - length * Math.cos(angle);
      this.bob.setAttribute('position', `${bobX} ${bobY} -4`);
      if (this.rope) {
        const midX = bobX / 2;
        const midY = (this.pivotY + bobY) / 2;
        const ropeLength = Math.sqrt((bobX * bobX) + ((this.pivotY - bobY) * (this.pivotY - bobY)));
        const ropeAngle = Math.atan2(bobX, this.pivotY - bobY) * 180 / Math.PI;
        this.rope.setAttribute('position', `${midX} ${midY} -4`);
        this.rope.setAttribute('height', ropeLength);
        this.rope.setAttribute('rotation', `0 0 ${ropeAngle}`);
      }
    },

    updateEnergyBars: function (time) {
      const length = this.data.length;
      const mass = this.data.mass;
      const gravity = 9.8;
      const velocity = this.angularVel * length;
      const height = length - length * Math.cos(this.currentAngle);
      const kinetic = 0.5 * mass * velocity * velocity;
      const potential = mass * gravity * height;
      const maxW = 1.8;
      const keW = Math.min((kinetic / this.energyScale) * maxW, maxW) || 0.01;
      const peW = Math.min((potential / this.energyScale) * maxW, maxW) || 0.01;
      const totalW = Math.min(((kinetic + potential) / this.energyScale) * maxW, maxW) || 0.01;
      const barLeft = -0.6;
      if (this.keBar) {
        this.keBar.setAttribute('geometry', `primitive:box;width:${keW};height:0.22;depth:0.05`);
        this.keBar.setAttribute('position', `${barLeft + keW / 2} 0.35 0`);
      }
      if (this.peBar) {
        this.peBar.setAttribute('geometry', `primitive:box;width:${peW};height:0.22;depth:0.05`);
        this.peBar.setAttribute('position', `${barLeft + peW / 2} 0 0`);
      }
      if (this.totalBar) {
        this.totalBar.setAttribute('geometry', `primitive:box;width:${totalW};height:0.22;depth:0.05`);
        this.totalBar.setAttribute('position', `${barLeft + totalW / 2} -0.35 0`);
      }
    },

    addTrailDot: function (time) {
      if (time - this.lastTrailTime < 80) return;
      this.lastTrailTime = time;
      if (!this.bob) return;
      const pos = this.bob.getAttribute('position');
      if (!pos) return;
      const dot = document.createElement('a-sphere');
      dot.setAttribute('position', `${pos.x} ${pos.y} ${pos.z}`);
      dot.setAttribute('radius', '0.04');
      dot.setAttribute('material', 'color:#00ffcc;emissive:#00ffcc;emissiveIntensity:0.6;opacity:0.7;transparent:true');
      this.el.sceneEl.appendChild(dot);
      this.trailDots.push({ el: dot, born: time });
      if (this.trailDots.length > this.MAX_TRAIL_DOTS) {
        const old = this.trailDots.shift();
        if (old.el.parentNode) old.el.parentNode.removeChild(old.el);
      }
    },

    fadeTrail: function (time) {
      for (let i = this.trailDots.length - 1; i >= 0; i--) {
        const dot = this.trailDots[i];
        const age = time - dot.born;
        if (age > 3000) {
          if (dot.el.parentNode) dot.el.parentNode.removeChild(dot.el);
          this.trailDots.splice(i, 1);
        } else if (age > 2000) {
          const opacity = 0.7 * (1 - (age - 2000) / 1000);
          dot.el.setAttribute('material', `color:#00ffcc;emissive:#00ffcc;emissiveIntensity:0.6;opacity:${Math.max(opacity, 0.05)};transparent:true`);
        }
      }
    },

    clearTrail: function () {
      this.trailDots.forEach(dot => {
        if (dot.el && dot.el.parentNode) dot.el.parentNode.removeChild(dot.el);
      });
      this.trailDots = [];
    },

    detectPeriod: function (time) {
      if (this.prevAngle !== undefined) {
        const crossedZero = (this.prevAngle > 0 && this.currentAngle <= 0) ||
                            (this.prevAngle < 0 && this.currentAngle >= 0);
        if (crossedZero) {
          this.halfPeriodCount++;
          if (this.halfPeriodCount >= 2) {
            const elapsed = (performance.now() - this.periodStart) / 1000;
            this.lastPeriod = elapsed;
            this.periodStart = performance.now();
            this.halfPeriodCount = 0;
            if (this.periodText) {
              this.periodText.setAttribute('text', `value:Swing: ${this.lastPeriod.toFixed(1)}s; align:center; width:2.5; color:#FFEB3B`);
            }
            window.dispatchEvent(new CustomEvent('physics-sandbox:period-measured', { detail: { period: this.lastPeriod } }));
          }
        }
      }
      this.prevAngle = this.currentAngle;
    },

    tick: function (t, dt) {
      if (!this.bob) return;
      this.fadeTrail(t);
      if (!this.running) return;
      const dtSeconds = Math.min(dt / 1000, 0.05);
      const gravity = 9.8;
      const length = this.data.length;
      const alpha = -(gravity / length) * Math.sin(this.currentAngle);
      this.angularVel += alpha * dtSeconds;
      this.angularVel *= (1 - this.data.damping * dtSeconds);
      this.currentAngle += this.angularVel * dtSeconds;
      this.updateBobPosition();
      this.updateEnergyBars(t);
      this.addTrailDot(t);
      this.detectPeriod(t);
    },

    removeBob: function () {
      if (this.bob && this.bob.parentNode) this.bob.parentNode.removeChild(this.bob);
      if (this.rope && this.rope.parentNode) this.rope.parentNode.removeChild(this.rope);
      this.bob = null;
      this.rope = null;
      this.running = false;
      this.clearTrail();
      const reset = (id, geo) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('geometry', geo);
      };
      reset('ke-bar',    'primitive:box;width:0.01;height:0.22;depth:0.05');
      reset('pe-bar',    'primitive:box;width:0.01;height:0.22;depth:0.05');
      reset('total-bar', 'primitive:box;width:0.01;height:0.22;depth:0.05');
      if (this.periodText) this.periodText.setAttribute('text', 'value:Swing: --; align:center; width:2.5; color:#FFEB3B');
    }
  });
}
