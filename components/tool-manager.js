/**
 * tool-manager.js
 * Tracks the currently equipped tool for gamified interactions.
 */
window.ToolManager = {
  TOOLS: {
    GRAB: 'grab',
    PUSH: 'push',
    SCALE: 'scale',
    ANIMATE: 'animate',
    GRAPPLE: 'grapple'
  },
  
  equippedTool: 'grab',
  
  equipTool: function (toolId) {
    if (Object.values(this.TOOLS).includes(toolId)) {
      this.equippedTool = toolId;
      window.dispatchEvent(new CustomEvent('physics-sandbox:tool-equipped', { detail: { tool: toolId } }));
      this.updateCursorColor();
    }
  },

  getEquippedTool: function () {
    return this.equippedTool;
  },
  
  updateCursorColor: function () {
    const colors = {
      grab: '#ffffff',
      push: '#ff3366',
      scale: '#33ff55',
      animate: '#aa33ff',
      grapple: '#ffaa33'
    };
    
    // Update cursor colors so the user knows what tool is active
    document.querySelectorAll('[raycaster]').forEach(el => {
       if (el.components.raycaster && el.components.raycaster.data) {
           el.setAttribute('raycaster', 'lineColor', colors[this.equippedTool] || '#ffffff');
       }
    });

    const cursorEl = document.querySelector('[cursor] > a-entity'); // If standard reticle is a child
    if (cursorEl && cursorEl.tagName === 'A-ENTITY') {
        cursorEl.setAttribute('material', 'color', colors[this.equippedTool] || '#ffffff');
    }
  }
};
