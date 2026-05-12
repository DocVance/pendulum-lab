/**
 * reset-zone.js
 * Catch fallen objects and return them to the spawn area.
 * Reads the spawn offset from spawn-manager instead of hardcoding coordinates.
 */
AFRAME.registerComponent('reset-zone', {
  schema: {
    yMin: { type: 'number', default: -3.0 },
    xMin: { type: 'number', default: -40.0 },
    xMax: { type: 'number', default: 40.0 },
    zMin: { type: 'number', default: -40.0 },
    zMax: { type: 'number', default: 40.0 },
    throttle: { type: 'number', default: 500 }
  },

  init: function () {
    this.spawnManagerEl = this.el.sceneEl ? this.el.sceneEl.querySelector('[spawn-manager]') : document.querySelector('[spawn-manager]');
    this.timeAccumulator = 0;
  },

  parseVec3: function (value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const parts = value.trim().split(/\s+/).map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        return { x: parts[0], y: parts[1], z: parts[2] };
      }
      return null;
    }

    if (typeof value === 'object' && value.x != null && value.y != null && value.z != null) {
      return value;
    }

    return null;
  },

  getSpawnOffset: function (el) {
    const elementResetPosition = el ? this.parseVec3(el.getAttribute('data-reset-position')) : null;
    if (elementResetPosition) {
      return elementResetPosition;
    }

    if (this.spawnManagerEl && this.spawnManagerEl.components['spawn-manager']) {
      const manager = this.spawnManagerEl.components['spawn-manager'];
      if (typeof manager.getSpawnPosition === 'function') {
        return manager.getSpawnPosition();
      }
      return manager.data.spawnOffset;
    }
    // Fallback
    return { x: 0, y: 1.0, z: -3 };
  },

  resetObject: function (el) {
    const offset = this.getSpawnOffset(el);
    el.setAttribute('position', `${offset.x} ${offset.y} ${offset.z}`);

    const body = el.components['dynamic-body'];
    if (body && body.body) {
      body.syncToPhysics();
      body.body.velocity.set(0, 0, 0);
      body.body.angularVelocity.set(0, 0, 0);
    }
  },

  // Throttled algorithmic check to keep objects in bounds, replacing expensive DOM queries and collide events
  tick: function (time, timeDelta) {
    this.timeAccumulator += timeDelta;
    if (this.timeAccumulator < this.data.throttle) return;
    this.timeAccumulator = 0;

    const mgr = this.spawnManagerEl && this.spawnManagerEl.components['spawn-manager']
      ? this.spawnManagerEl.components['spawn-manager']
      : null;

    if (!mgr || !mgr.spawnedObjects) return;

    const objects = mgr.spawnedObjects;

    // Fallback if spawn-manager fails to list objects (should be rare)
    if (!objects || objects.length === 0) return;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (!obj || !obj.object3D) continue;

      const pos = obj.object3D.position;

      if (
        pos.y < this.data.yMin ||
        pos.x < this.data.xMin ||
        pos.x > this.data.xMax ||
        pos.z < this.data.zMin ||
        pos.z > this.data.zMax
      ) {
        console.log("Object fell out of bounds. Resetting...");
        this.resetObject(obj);
      }
    }
  }
});
