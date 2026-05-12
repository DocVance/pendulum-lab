/**
 * object-dragger.js (formerly object-loader.js)
 * Centralized interaction manager + per-object dragger component.
 * 
 * Fixes addressed:
 *  - Single global listener manager (no per-instance window listeners)
 *  - Native pointerdown for right-click push (bypasses A-Frame synthetic events)
 *  - Camera look-controls disabled while dragging
 *  - Visual hover/grab feedback (emissive glow)
 *  - Blur/visibility guard to release grabbed objects on focus loss
 *  - Mobile touch support via pointer events
 *  - VR controller grip support
 */

// ─── Global Interaction Manager (singleton) ─────────────────────────────────
// Owns all window-level listeners and delegates to the active dragged object.
const InteractionManager = {
  activeTarget: null,   // The object-dragger component currently being dragged
  cameraEl: null,       // Cached reference to a-camera
  cursorEl: null,       // Cached reference to the cursor
  initialized: false,

  init: function () {
    if (this.initialized) return;
    this.initialized = true;

    this.cameraEl = document.querySelector('a-camera');
    this.cursorEl = document.querySelector('[cursor]');

    const canvas = document.querySelector('.a-canvas') || document.querySelector('canvas');
    if (!canvas) {
      // Retry after scene loads
      document.querySelector('a-scene').addEventListener('loaded', () => this.init());
      return;
    }

    // Pointer events work for both mouse and touch
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    canvas.addEventListener('pointerup',   this.onPointerUp.bind(this));
    canvas.addEventListener('wheel',       this.onWheel.bind(this), { passive: false });

    // VR controllers secondary button for force push
    this._onVRSecondaryButton = this.handleVRForcePush.bind(this);
    window.addEventListener('bbuttondown', this._onVRSecondaryButton);
    window.addEventListener('ybuttondown', this._onVRSecondaryButton);

    // Guard: release object if user tabs away or window loses focus
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.activeTarget) {
        this.activeTarget.forceRelease();
      }
    });
    window.addEventListener('blur', () => {
      if (this.activeTarget) {
        this.activeTarget.forceRelease();
      }
    });
  },

  onPointerDown: function (evt) {
    // Right-click (button 2) → force push via raycast
    if (evt.button === 2) {
      this.handleForcePush();
      return;
    }
    // Left-click is handled by A-Frame's cursor raycaster → object-dragger.onGrab
  },

  onPointerMove: function (evt) {
    if (!this.activeTarget) return;
    this.activeTarget.updateTargetPosition();
  },

  onPointerUp: function (evt) {
    if (evt.button === 2) return; // Right-click release, ignore
    if (!this.activeTarget) return;
    this.activeTarget.releaseObject();
  },

  onWheel: function (evt) {
    if (!this.activeTarget) return;
    evt.preventDefault();
    const scrollFactor = -0.005;
    this.activeTarget.grabDepth += evt.deltaY * scrollFactor;
    this.activeTarget.grabDepth = Math.max(0.5, Math.min(10, this.activeTarget.grabDepth));
    this.activeTarget.updateTargetPosition();
  },

  handleVRForcePush: function (evt) {
    if (this.activeTarget) return; // Don't push what is held
    const controllerEl = evt.target;
    if (!controllerEl || !controllerEl.components.raycaster) return;

    controllerEl.components.raycaster.checkIntersections();
    const intersections = controllerEl.components.raycaster.intersections;
    if (intersections.length === 0) return;

    this.applyForcePushToIntersections(intersections, controllerEl);
  },

  handleForcePush: function () {
    const cursorEl = this.cursorEl || document.querySelector('[cursor]');
    if (!cursorEl || !cursorEl.components.raycaster) return;

    cursorEl.components.raycaster.checkIntersections();
    const intersections = cursorEl.components.raycaster.intersections;
    if (intersections.length === 0) return;

    const cameraEl = this.cameraEl || document.querySelector('a-camera');
    this.applyForcePushToIntersections(intersections, cameraEl);
  },

  applyForcePushToIntersections: function (intersections, originEl) {
    for (let i = 0; i < intersections.length; i++) {
      let targetEl = intersections[i].object.el;
      while (targetEl && !targetEl.hasAttribute('object-dragger')) {
        targetEl = targetEl.parentEl;
      }
      
      if (targetEl && targetEl.hasAttribute('object-dragger')) {
        const originPos = new THREE.Vector3();
        originEl.object3D.getWorldPosition(originPos);
        const objPos = new THREE.Vector3();
        targetEl.object3D.getWorldPosition(objPos);

        const forceDir = objPos.clone().sub(originPos).normalize();
        const pushStrength = 18;
        const impulse = forceDir.multiplyScalar(pushStrength);

        targetEl.dispatchEvent(new CustomEvent('physics-sandbox:apply-generic-impulse', {
          detail: { impulse: impulse }
        }));
        break;
      }
    }
  }
};

// ─── Per-Object Dragger Component ────────────────────────────────────────────
AFRAME.registerComponent('object-dragger', {
  init: function () {
    this.isDragging = false;
    this.isDesktopGrab = false;

    // Initialize the singleton manager on first component
    InteractionManager.init();

    this.cameraEl = InteractionManager.cameraEl || document.querySelector('a-camera');
    this.cursorEl = InteractionManager.cursorEl || document.querySelector('[cursor]');
    this.activeRaycasterEl = null;
    this.grabDepth = 3;
    this.velocityHistory = [];
    this.lastTime = 0;
    this.originalEmissive = null;
    this.originalBodyMass = null;
    this.originalBodyType = null;

    // A-Frame cursor events (work for mouse, touch, and laser-controls)
    this.el.addEventListener('mousedown', this.onGrab.bind(this));

    // Hover feedback
    this.el.addEventListener('mouseenter', this.onHoverEnter.bind(this));
    this.el.addEventListener('mouseleave', this.onHoverLeave.bind(this));

    // VR controller grip support
    this.el.addEventListener('gripdown', this.onGrab.bind(this));
    this.el.addEventListener('gripup', () => this.releaseObject());
    this.el.addEventListener('triggerdown', this.onGrab.bind(this));
    this.el.addEventListener('triggerup', () => this.releaseObject());
    this.el.addEventListener('axismove', this.onAxisMove.bind(this));
  },

  onAxisMove: function (evt) {
    if (!this.isDragging) return;
    const yAxis = evt.detail.axis[1];
    if (Math.abs(yAxis) > 0.2) {
      const scrollFactor = -0.05;
      this.grabDepth += yAxis * scrollFactor;
      this.grabDepth = Math.max(0.5, Math.min(10, this.grabDepth));
      this.updateTargetPosition();
    }
  },

  resolveRaycasterEl: function (evt) {
    if (evt && evt.detail) {
      if (evt.detail.cursorEl && evt.detail.cursorEl.components && evt.detail.cursorEl.components.raycaster) {
        return evt.detail.cursorEl;
      }
      if (evt.detail.hand && evt.detail.hand.components && evt.detail.hand.components.raycaster) {
        return evt.detail.hand;
      }
      if (evt.detail.raycaster && evt.detail.raycaster.el && evt.detail.raycaster.el.components && evt.detail.raycaster.el.components.raycaster) {
        return evt.detail.raycaster.el;
      }
    }

    if (evt && evt.target && evt.target.components && evt.target.components.raycaster) {
      return evt.target;
    }

    return this.cursorEl;
  },

  onHoverEnter: function () {
    if (this.isDragging) return;
    // Store original and apply glow
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      mesh.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material._origEmissive = node.material.emissive ? node.material.emissive.clone() : new THREE.Color(0, 0, 0);
          node.material.emissive = new THREE.Color(0.15, 0.4, 0.15);
        }
      });
    }
  },

  onHoverLeave: function () {
    if (this.isDragging) return;
    this.restoreEmissive();
  },

  restoreEmissive: function () {
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      mesh.traverse((node) => {
        if (node.isMesh && node.material && node.material._origEmissive) {
          node.material.emissive.copy(node.material._origEmissive);
        }
      });
    }
  },

  _checkIsDesktopGrab: function (evt) {
    // Determine if this grab is from desktop mouse vs VR controller.
    // VR grabs come via gripdown/triggerdown from laser-controls entities;
    // desktop grabs come via mousedown from the mouse cursor entity.
    const isVRGrab = evt && evt.type && (evt.type === 'gripdown' || evt.type === 'triggerdown');
    const sceneEl = this.el.sceneEl;
    const inXRSession = sceneEl && sceneEl.is && sceneEl.is('vr-mode');
    return !isVRGrab && !inXRSession;
  },

  _applyGrabHighlight: function () {
    // Apply grab highlight (brighter glow)
    const mesh = this.el.getObject3D('mesh');
    if (mesh) {
      mesh.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material.emissive = new THREE.Color(0.2, 0.6, 0.9);
        }
      });
    }
  },

  _disableLookControlsIfNeeded: function () {
    // Only disable camera look-controls for desktop mouse grabs.
    // In VR, head tracking must remain active while holding objects.
    if (this.isDesktopGrab && this.cameraEl) {
      this.cameraEl.setAttribute('look-controls', 'mouseEnabled', false);
    }
  },

  _switchBodyToKinematic: function () {
    this.el.dispatchEvent(new CustomEvent('physics-sandbox:kinematic-start'));
  },

  _calculateInitialGrabDepth: function () {
    const raycasterEl = this.activeRaycasterEl || this.cursorEl;
    if (raycasterEl && raycasterEl.components.raycaster && raycasterEl.components.raycaster.raycaster) {
      const origin = raycasterEl.components.raycaster.raycaster.ray.origin;
      const objPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(objPos);
      this.grabDepth = Math.max(0.2, origin.distanceTo(objPos));
    } else {
      const camPos = new THREE.Vector3();
      this.cameraEl.object3D.getWorldPosition(camPos);
      const objPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(objPos);
      this.grabDepth = Math.max(1, camPos.distanceTo(objPos));
    }
  },

  onGrab: function (evt) {
    if (InteractionManager.activeTarget) return;

    this.activeRaycasterEl = this.resolveRaycasterEl(evt);
    const activeTool = window.ToolManager ? window.ToolManager.getEquippedTool() : 'grab';

    if (activeTool === 'grab') {
      this.isDragging = true;
      InteractionManager.activeTarget = this;
      this.velocityHistory = [];
      this.lastTime = performance.now();

      this.isDesktopGrab = this._checkIsDesktopGrab(evt);
      this._applyGrabHighlight();
      this._disableLookControlsIfNeeded();
      this._switchBodyToKinematic();
      this._calculateInitialGrabDepth();
    } else if (activeTool === 'push') {
      const originPos = new THREE.Vector3();
      const originEl = this.activeRaycasterEl || this.cameraEl;
      originEl.object3D.getWorldPosition(originPos);
      const objPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(objPos);

      const forceDir = objPos.clone().sub(originPos).normalize();
      const pushStrength = 18;
      const impulse = forceDir.multiplyScalar(pushStrength);

      this.el.dispatchEvent(new CustomEvent('physics-sandbox:apply-generic-impulse', {
        detail: { impulse: impulse }
      }));
    } else if (activeTool === 'scale') {
      const ammoComp = this.el.components['ammo-body'];
      if (!ammoComp || !ammoComp.body) return;
      
      const velVec = ammoComp.body.getLinearVelocity();
      const isResting = Math.abs(velVec.x()) < 0.1 && Math.abs(velVec.y()) < 0.1 && Math.abs(velVec.z()) < 0.1;
      
      if (isResting) {
        const currentScale = this.el.getAttribute('scale') || {x: 1, y: 1, z: 1};
        // Grow on normal grab. A secondary mechanism could shrink later.
        const sf = 1.2;
        this.el.setAttribute('scale', `${currentScale.x * sf} ${currentScale.y * sf} ${currentScale.z * sf}`);
      } else {
        console.warn("Cannot scale non-resting object to preserve Ammo.js stability.");
      }
    } else if (activeTool === 'animate') {
      if (this.el.hasAttribute('animation-mixer')) {
         this.el.setAttribute('animation-mixer', 'clip: dance; loop: once; crossFadeDuration: 0.2;');
         // Recover idle animation after 5 seconds
         setTimeout(() => {
             if (this.el.hasAttribute('animation-mixer')) {
                this.el.setAttribute('animation-mixer', 'clip: *; loop: repeat;');
             }
         }, 5000);
      }
    } else if (activeTool === 'grapple') {
      // Move camera rig smoothly to the object
      let cameraRig = document.getElementById('cameraRig');
      if (!cameraRig && this.cameraEl) {
         cameraRig = this.cameraEl.parentEl && this.cameraEl.parentEl.tagName === 'A-ENTITY' ? this.cameraEl.parentEl : this.cameraEl;
      }
      if (cameraRig) {
        const targetPos = new THREE.Vector3();
        this.el.object3D.getWorldPosition(targetPos);
        cameraRig.setAttribute('animation__grapple', `property: position; to: ${targetPos.x} ${targetPos.y + 1} ${targetPos.z + 1}; dur: 800; easing: easeInOutQuad`);
      }
    }
  },

  releaseObject: function () {
    if (!this.isDragging) return;
    this.isDragging = false;
    InteractionManager.activeTarget = null;
    this.activeRaycasterEl = null;

    // Restore camera look
    if (this.isDesktopGrab && this.cameraEl) {
      this.cameraEl.setAttribute('look-controls', 'mouseEnabled', true);
    }
    this.isDesktopGrab = false;

    // Restore visual
    this.restoreEmissive();

    // Average the recent velocity samples for throw direction
    let finalVelocity = new THREE.Vector3(0, 0, 0);
    if (this.velocityHistory.length > 0) {
      let sumX = 0, sumY = 0, sumZ = 0;
      this.velocityHistory.forEach(v => { sumX += v.x; sumY += v.y; sumZ += v.z; });
      const count = this.velocityHistory.length;
      finalVelocity.set(sumX / count, sumY / count, sumZ / count);
    }

    this.el.dispatchEvent(new CustomEvent('physics-sandbox:kinematic-end'));
    this.el.dispatchEvent(new CustomEvent('physics-sandbox:apply-impulse', {
      detail: { velocity: finalVelocity }
    }));
  },

  forceRelease: function () {
    // Called by InteractionManager on blur/visibility loss
    this.releaseObject();
  },

  updateTargetPosition: function () {
    if (!this.isDragging) return;

    const raycasterEl = this.activeRaycasterEl || this.cursorEl;
    if (!raycasterEl || !raycasterEl.components.raycaster) return;

    const raycaster = raycasterEl.components.raycaster.raycaster;
    if (!raycaster || !raycaster.ray) return;

    const origin = raycaster.ray.origin;
    const direction = raycaster.ray.direction;
    const newPos = origin.clone().add(direction.clone().multiplyScalar(this.grabDepth));

    // Track velocity for throwing
    const oldPosVec = new THREE.Vector3();
    this.el.object3D.getWorldPosition(oldPosVec);

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    if (dt > 0.01) {
      const vel = newPos.clone().sub(oldPosVec).divideScalar(dt);
      this.velocityHistory.push(vel);
      if (this.velocityHistory.length > 5) {
        this.velocityHistory.shift();
      }
      this.lastTime = now;
    }

    this.el.setAttribute('position', `${newPos.x} ${newPos.y} ${newPos.z}`);
  },

  remove: function () {
    if (InteractionManager.activeTarget === this) {
      InteractionManager.activeTarget = null;
    }
    this.activeRaycasterEl = null;
    this.restoreEmissive();
  }
});
