/**
 * i18n-text.js — A-Frame component for localized text
 * 
 * Usage:
 *   <a-entity i18n-text="key: hub.title" text="color: #fff"></a-entity>
 *   
 *   To pass parameters (e.g., for "Score: {score}"):
 *   <a-entity i18n-text="key: game.score; params: {&quot;score&quot;: 10}"></a-entity>
 */
AFRAME.registerComponent('i18n-text', {
  schema: {
    key: { type: 'string' },
    params: { type: 'string', default: '{}' } // JSON stringified object
  },

  init: function () {
    this.updateText = this.updateText.bind(this);
    
    // Listen for global language changes
    document.addEventListener('i18n:ready', this.updateText);
    document.addEventListener('i18n:changed', this.updateText);
    
    // Initial update if i18n is already loaded
    if (window.I18n && window.I18n.getLang()) {
      this.updateText();
    }
  },

  update: function (oldData) {
    if (oldData.key !== this.data.key || oldData.params !== this.data.params) {
      this.updateText();
    }
  },

  updateText: function () {
    if (!window.I18n || !this.data.key) return;
    
    let paramsObj = {};
    if (this.data.params !== '{}') {
      try {
        paramsObj = JSON.parse(this.data.params);
      } catch (e) {
        console.warn('[i18n-text] Invalid params JSON:', this.data.params);
      }
    }
    
    const translatedString = window.I18n.t(this.data.key, paramsObj);
    
    // Safely update the A-Frame text component
    this.el.setAttribute('text', 'value', translatedString);
  },

  remove: function () {
    document.removeEventListener('i18n:ready', this.updateText);
    document.removeEventListener('i18n:changed', this.updateText);
  }
});
