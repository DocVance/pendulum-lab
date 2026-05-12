/**
 * player-physics.js
 *
 * Gives the player rig:
 *   - Gravity with floor detection (raycast + hard-floor safety clamp)
 *   - Jump (Space)
 *   - Fly mode toggle (G key) — no gravity, Q/E or Space/Shift for up/down
 *   - Wall nudge via 8-direction horizontal capsule rays
 *
 * Usage:
 *   <a-entity id="rig" position="0 0.5 0"
 *             movement-controls="speed: 0.6"
 *             player-physics>
 */
AFRAME.registerComponent('player-physics', {
  schema: {
    gravity:       { type: 'number',  default: -20  }, // m/s² (stronger for snappy feel)
    jumpSpeed:     { type: 'number',  default: 7    }, // m/s upward on jump
    floorY:        { type: 'number',  default: 0.5  }, // absolute hard-floor Y (rig origin)
    capsuleRadius: { type: 'number',  default: 0.38 }, // horizontal collision radius
    capsuleHeight: { type: 'number',  default: 1.8  }, // total player height
    rayLength:     { type: 'number',  default: 1.5  }, // downward ray length
    maxFallSpeed:  { type: 'number',  default: -30  }, // terminal velocity cap
    flySpeed:      { type: 'number',  default: 5    }, // m/s in fly mode
    flyMode:       { type: 'boolean', default: false }, // can be toggled at runtime
    // ── Soft boundary clamp ──────────────────────────────────────────────────
    // Set per-scene by the prefab root entity via data attributes applied by
    // the scene controller or spa-router. Use permissive defaults (very large)
    // so scenes without explicit boundaries are unconstrained.
    boundaryMinX:       { type: 'number', default: -200 },
    boundaryMaxX:       { type: 'number', default:  200 },
    boundaryMinZ:       { type: 'number', default: -200 },
    boundaryMaxZ:       { type: 'number', default:  200 },
    // Force applied per metre of boundary penetration (m/s² equivalent push)
    boundaryPushForce:  { type: 'number', default: 18 }
  },

  init: function () {
    this.yVelocity      = 0;
    this.isGrounded     = false;
    this.jumpRequested  = false;
    this._meshCache     = [];
    this._cacheAge      = -999; // force rebuild on first tick
    this._pos           = this.el.object3D.position;
    this._sceneEl       = this.el.sceneEl;

    // THREE raycaster (reused each tick)
    this._rc     = new THREE.Raycaster();
    this._down   = new THREE.Vector3(0, -1, 0);

    // Key state
    this._keys = {};
    this._onKeyDown = (e) => {
      this._keys[e.code] = true;

      if (['INPUT', 'TEXTAREA'].includes((document.activeElement || {}).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.data.flyMode && this.isGrounded) {
          this.jumpRequested = true;
        }
      }
      // Fly mode vertical — E=up, Q=down (Space/Shift are consumed by movement-controls)
      // These keys are also usable in gravity mode without conflict
      if (e.code === 'KeyG') {
        this._toggleFlyMode();
      }
    };
    this._onKeyUp = (e) => { this._keys[e.code] = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);

    // Rebuild mesh cache whenever a new scene loads
    this._onSceneLoaded = () => { this._cacheAge = -999; };
    window.addEventListener('scene-loaded', this._onSceneLoaded);
    this._sceneEl.addEventListener('loaded', this._onSceneLoaded);

    // Show status in console for fly mode
    console.log('[player-physics] Ready. Press G to toggle fly mode.');
  },

  _toggleFlyMode: function () {
    const next = !this.data.flyMode;
    this.el.setAttribute('player-physics', 'flyMode', next);
    this.el.setAttribute('movement-controls', 'fly', next);
    if (next) {
      this.yVelocity = 0; // stop gravity momentum when entering fly mode
    }
    console.log('[player-physics] Fly mode:', next ? 'ON (E=up, Q=down)' : 'OFF');

    // Optional: show a brief HUD toast if the toast API exists
    const st = document.getElementById('selection-text');
    if (st) {
      const prev = st.getAttribute('text');
      st.setAttribute('text', `value:FLY MODE: ${next ? 'ON' : 'OFF'};align:center;width:1.5;color:${next ? '#00ffcc' : '#ff9900'}`);
      setTimeout(() => { if (st) st.setAttribute('text', prev); }, 1800);
    }
  },

  tick: function (time, deltaMs) {
    if (!deltaMs || deltaMs > 200) return;
    const dt = Math.min(deltaMs / 1000, 0.05);

    // ── Rebuild mesh cache if stale (every 1.5s, or on scene change) ──
    if (time - this._cacheAge > 1500) {
      this._rebuildMeshCache();
      this._cacheAge = time;
    }

    if (this.data.flyMode) {
      this._tickFly(dt);
    } else {
      this._tickGravity(dt);
    }

    this._tickWallCollision();
    this._tickBoundary(dt);
  },

  // ── Gravity mode ──────────────────────────────────────────────────────────
  _tickGravity: function (dt) {
    // Handle jump request
    if (this.jumpRequested && this.isGrounded) {
      this.yVelocity  = this.data.jumpSpeed;
      this.isGrounded = false;
    }
    this.jumpRequested = false;

    // Accumulate gravity
    this.yVelocity += this.data.gravity * dt;
    this.yVelocity  = Math.max(this.yVelocity, this.data.maxFallSpeed);

    // Move
    this._pos.y += this.yVelocity * dt;

    // ── Floor detection: try raycast first, then hard clamp ──
    const floorY = this._detectFloor();

    if (this._pos.y <= floorY) {
      this._pos.y  = floorY;
      this.yVelocity = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  },

  // ── Fly mode ──────────────────────────────────────────────────────────────
  _tickFly: function (dt) {
    const spd = this.data.flySpeed;
    // E = ascend, Q = descend (reliable — not consumed by aframe-extras)
    if (this._keys['KeyE']) this._pos.y += spd * dt;
    if (this._keys['KeyQ']) this._pos.y -= spd * dt;
    this.isGrounded = false;
    this.yVelocity  = 0;
  },

  // ── Floor detection ───────────────────────────────────────────────────────
  // Returns the Y position the rig origin should sit at (i.e. floorSurface + 0)
  // Combined: raycast hit OR hard schema floor, whichever is higher.
  _detectFloor: function () {
    const hardFloor = this.data.floorY;

    // Cast a ray straight down from slightly above rig origin
    const origin = new THREE.Vector3(this._pos.x, this._pos.y + 0.15, this._pos.z);
    this._rc.set(origin, this._down);
    this._rc.far = this.data.rayLength;

    let rayFloor = null;

    if (this._meshCache.length > 0) {
      const hits = this._rc.intersectObjects(this._meshCache, false);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.face && h.distance > 0.01) {
          // hit.point.y is the surface Y; rig origin should sit there
          rayFloor = h.point.y;
          break;
        }
      }
    }

    // Use whichever floor is higher (prevents falling through thin meshes)
    if (rayFloor !== null) {
      return Math.max(rayFloor, hardFloor);
    }
    return hardFloor;
  },

  // ── Wall collision (8-direction horizontal capsule push-out) ─────────────
  _tickWallCollision: function () {
    if (this._meshCache.length === 0) return;

    const mid = new THREE.Vector3(
      this._pos.x,
      this._pos.y + this.data.capsuleHeight * 0.5,
      this._pos.z
    );
    const r = this.data.capsuleRadius;

    for (let i = 0; i < 8; i++) {
      const angle  = (i / 8) * Math.PI * 2;
      const dir    = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      this._rc.set(mid, dir);
      this._rc.far = r * 1.15;

      const hits = this._rc.intersectObjects(this._meshCache, false);
      if (hits.length > 0 && hits[0].distance > 0) {
        const pen = r - hits[0].distance;
        if (pen > 0) {
          this._pos.x -= dir.x * pen;
          this._pos.z -= dir.z * pen;
        }
      }
    }
  },

  // ── Soft boundary clamp ───────────────────────────────────────────────────
  // Pushes the player back inside the play area if they stray outside.
  // The push force is proportional to penetration depth, giving a
  // "force-field" feel rather than a hard teleport.
  _tickBoundary: function (dt) {
    const d = this.data;
    const pos = this._pos;
    const force = d.boundaryPushForce;

    if (pos.x < d.boundaryMinX) {
      pos.x += (d.boundaryMinX - pos.x) * force * dt;
    } else if (pos.x > d.boundaryMaxX) {
      pos.x -= (pos.x - d.boundaryMaxX) * force * dt;
    }

    if (pos.z < d.boundaryMinZ) {
      pos.z += (d.boundaryMinZ - pos.z) * force * dt;
    } else if (pos.z > d.boundaryMaxZ) {
      pos.z -= (pos.z - d.boundaryMaxZ) * force * dt;
    }
  },

  // ── Mesh cache builder ────────────────────────────────────────────────────
  _rebuildMeshCache: function () {
    const meshes = [];
    this._sceneEl.object3D.traverse((node) => {
      if (!node.isMesh || !node.visible) return;

      // Skip rig itself and its children
      const el = node.el;
      if (el) {
        if (el.id === 'rig') return;
        // Walk parent chain to skip rig children
        let p = el.parentEl;
        while (p) { if (p.id === 'rig') return; p = p.parentEl; }
        // Skip text-only entities and UI panels
        if (el.hasAttribute('text')) return;
      }

      // Skip materials that are fully transparent (UI planes, etc.)
      const mat = Array.isArray(node.material) ? node.material[0] : node.material;
      if (!mat) return;
      if (mat.transparent && mat.opacity < 0.15) return;

      // Skip tiny objects (thinner than 2 cm — baseboard strips, etc.)
      const box = new THREE.Box3().setFromObject(node);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim < 0.5) return; // ignore tiny decorative strips

      // Only keep meshes with real geometry
      if (!node.geometry || !node.geometry.attributes.position) return;

      meshes.push(node);
    });

    this._meshCache = meshes;
    console.log(`[player-physics] Mesh cache rebuilt: ${meshes.length} collidable meshes`);
  },

  remove: function () {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
    window.removeEventListener('scene-loaded', this._onSceneLoaded);
  }
});
