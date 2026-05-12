/**
 * i18n.js — Lightweight internationalization loader
 *
 * Usage:
 *   <script src="i18n/i18n.js"></script>
 *
 * In HTML:
 *   <span data-i18n="home.start">Start Exploring</span>
 *   <input data-i18n-placeholder="library.search">
 *
 * In JS:
 *   I18n.t('library.title')  → "Model Library"
 *   I18n.setLanguage('es')   → reloads + re-applies
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'physics-sandbox:lang';
  var DEFAULT_LANG = 'en';
  var cache = {};        // { 'en': {...}, 'es': {...} }
  var currentLang = DEFAULT_LANG;
  var basePath = '';     // resolved at init

  function resolveBasePath() {
    // Detect if we're in a subdirectory (e.g. /scenes/)
    var scripts = document.querySelectorAll('script[src*="i18n.js"]');
    if (scripts.length > 0) {
      var src = scripts[0].getAttribute('src');
      // src could be "i18n/i18n.js" or "../i18n/i18n.js"
      basePath = src.replace('i18n.js', '');
    } else {
      basePath = 'i18n/';
    }
  }

  function getNestedValue(obj, keyPath) {
    var keys = keyPath.split('.');
    var val = obj;
    for (var i = 0; i < keys.length; i++) {
      if (val == null) return null;
      val = val[keys[i]];
    }
    return val;
  }

  function loadLanguage(lang, callback) {
    if (cache[lang]) {
      callback(cache[lang]);
      return;
    }

    var url = basePath + lang + '.json';
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load ' + url);
        return res.json();
      })
      .then(function (data) {
        cache[lang] = data;
        callback(data);
      })
      .catch(function (err) {
        console.warn('[i18n] Could not load language "' + lang + '":', err.message);
        // Fallback to English
        if (lang !== DEFAULT_LANG) {
          loadLanguage(DEFAULT_LANG, callback);
        }
      });
  }

  function applyToDOM(data) {
    // Text content
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      var key = elements[i].getAttribute('data-i18n');
      var val = getNestedValue(data, key);
      if (val != null) {
        elements[i].textContent = val;
      }
    }

    // Placeholders
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholders.length; j++) {
      var pKey = placeholders[j].getAttribute('data-i18n-placeholder');
      var pVal = getNestedValue(data, pKey);
      if (pVal != null) {
        placeholders[j].setAttribute('placeholder', pVal);
      }
    }

    // Title attributes
    var titles = document.querySelectorAll('[data-i18n-title]');
    for (var k = 0; k < titles.length; k++) {
      var tKey = titles[k].getAttribute('data-i18n-title');
      var tVal = getNestedValue(data, tKey);
      if (tVal != null) {
        titles[k].setAttribute('title', tVal);
      }
    }
  }

  // Public API
  window.I18n = {
    init: function (lang) {
      resolveBasePath();
      currentLang = lang || localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
      localStorage.setItem(STORAGE_KEY, currentLang);
      loadLanguage(currentLang, function (data) {
        applyToDOM(data);
        document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: currentLang } }));
      });
    },

    setLanguage: function (lang) {
      currentLang = lang;
      localStorage.setItem(STORAGE_KEY, lang);
      loadLanguage(lang, function (data) {
        applyToDOM(data);
        document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: lang } }));
      });
    },

    t: function (key, params) {
      var data = cache[currentLang];
      if (!data) return key;
      var val = getNestedValue(data, key);
      if (val == null) return key;
      
      if (params && typeof params === 'object') {
        for (var p in params) {
          if (params.hasOwnProperty(p)) {
            val = val.replace(new RegExp('\\{' + p + '\\}', 'g'), params[p]);
          }
        }
      }
      return val;
    },

    getLang: function () {
      return currentLang;
    },

    reapply: function () {
      var data = cache[currentLang];
      if (data) applyToDOM(data);
    }
  };
})();
