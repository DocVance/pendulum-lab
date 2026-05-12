/**
 * object-physics-adapter.js
 * Isolates physics-engine specific code (Ammo.js) from the generic interaction scripts.
 */
AFRAME.registerComponent('object-physics-adapter', {
  init: function () {
    this.onKinematicStart = this.onKinematicStart.bind(this);
    this.onKinematicEnd = this.onKinematicEnd.bind(this);
    this.onApplyImpulse = this.onApplyImpulse.bind(this);
    this.onApplyGenericImpulse = this.onApplyGenericImpulse.bind(this);

    this.el.addEventListener('physics-sandbox:kinematic-start', this.onKinematicStart);
    this.el.addEventListener('physics-sandbox:kinematic-end', this.onKinematicEnd);
    this.el.addEventListener('physics-sandbox:apply-impulse', this.onApplyImpulse);
    this.el.addEventListener('physics-sandbox:apply-generic-impulse', this.onApplyGenericImpulse);
  },

  remove: function () {
    this.el.removeEventListener('physics-sandbox:kinematic-start', this.onKinematicStart);
    this.el.removeEventListener('physics-sandbox:kinematic-end', this.onKinematicEnd);
    this.el.removeEventListener('physics-sandbox:apply-impulse', this.onApplyImpulse);
    this.el.removeEventListener('physics-sandbox:apply-generic-impulse', this.onApplyGenericImpulse);
  },

  onKinematicStart: function () {
    const ammoComp = this.el.components['ammo-body'];
    if (ammoComp && ammoComp.body && window.Ammo) {
      ammoComp.body.setGravity(new window.Ammo.btVector3(0, 0, 0));
      const zero = new window.Ammo.btVector3(0, 0, 0);
      ammoComp.body.setLinearVelocity(zero);
      ammoComp.body.setAngularVelocity(zero);
      window.Ammo.destroy(zero);
      ammoComp.body.activate(true);
    }
  },

  onKinematicEnd: function () {
    const ammoComp = this.el.components['ammo-body'];
    if (ammoComp && ammoComp.body && window.Ammo) {
      const sceneGravity = this.el.sceneEl.systems.physics
        ? this.el.sceneEl.systems.physics.options.gravity
        : -9.8;
      ammoComp.body.setGravity(new window.Ammo.btVector3(0, sceneGravity, 0));
      ammoComp.body.activate(true);

      const worldPos = new window.THREE.Vector3();
      this.el.object3D.getWorldPosition(worldPos);
      const transform = ammoComp.body.getWorldTransform();
      const origin = transform.getOrigin();
      origin.setValue(worldPos.x, worldPos.y, worldPos.z);
      ammoComp.body.setWorldTransform(transform);
      ammoComp.body.getMotionState().setWorldTransform(transform);
    }
  },

  onApplyImpulse: function (evt) {
    const ammoComp = this.el.components['ammo-body'];
    if (ammoComp && ammoComp.body && window.Ammo) {
      if (!evt.detail || !evt.detail.velocity) return;

      let impulseVec = evt.detail.velocity;
      const mass = ammoComp.data.mass != null ? ammoComp.data.mass : 5;
      const throwScale = Math.max(0.5, Math.min(mass, 20));

      const btImpulse = new window.Ammo.btVector3(
        impulseVec.x * throwScale * 0.4,
        impulseVec.y * throwScale * 0.4,
        impulseVec.z * throwScale * 0.4
      );
      const btPos = new window.Ammo.btVector3(0, 0, 0);
      ammoComp.body.applyImpulse(btImpulse, btPos);
      window.Ammo.destroy(btImpulse);
      window.Ammo.destroy(btPos);
    }
  },

  onApplyGenericImpulse: function (evt) {
    const ammoComp = this.el.components['ammo-body'];
    if (ammoComp && ammoComp.body && window.Ammo) {
      if (!evt.detail || !evt.detail.impulse) return;

      let impulseVec = evt.detail.impulse;
      const btImpulse = new window.Ammo.btVector3(impulseVec.x, impulseVec.y, impulseVec.z);
      const btPos = new window.Ammo.btVector3(0, 0, 0);
      ammoComp.body.applyImpulse(btImpulse, btPos);
      window.Ammo.destroy(btImpulse);
      window.Ammo.destroy(btPos);
    }
  }
});
