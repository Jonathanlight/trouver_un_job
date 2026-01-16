/**
 * TrouverUnJob - Module i18n pour Content Scripts
 * Gestion de la traduction multilingue dans les content scripts
 */

(function() {
  'use strict';

  const SUPPORTED_LANGUAGES = ['fr', 'en', 'it', 'de', 'es', 'zh'];
  const DEFAULT_LANGUAGE = 'fr';

  let currentLanguage = DEFAULT_LANGUAGE;
  let translations = null;
  let isLoaded = false;
  let loadPromise = null;

  /**
   * Detecte la langue preferee du navigateur
   */
  function detectLanguage() {
    const browserLang = navigator.language.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
  }

  /**
   * Charge les traductions pour une langue
   */
  async function loadTranslations(lang) {
    try {
      const url = chrome.runtime.getURL(`locales/${lang}.json`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
      return await response.json();
    } catch (error) {
      console.error('[FJD i18n] Error loading translations:', error);
      if (lang !== DEFAULT_LANGUAGE) {
        return loadTranslations(DEFAULT_LANGUAGE);
      }
      return null;
    }
  }

  /**
   * Initialise le systeme i18n
   */
  async function init() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        // Verifier si une langue est sauvegardee
        const result = await chrome.storage.local.get(['language']);

        if (result.language && SUPPORTED_LANGUAGES.includes(result.language)) {
          currentLanguage = result.language;
        } else {
          currentLanguage = detectLanguage();
        }

        translations = await loadTranslations(currentLanguage);
        isLoaded = true;

        return currentLanguage;
      } catch (error) {
        console.error('[FJD i18n] Init error:', error);
        currentLanguage = DEFAULT_LANGUAGE;
        translations = await loadTranslations(DEFAULT_LANGUAGE);
        isLoaded = true;
        return currentLanguage;
      }
    })();

    return loadPromise;
  }

  /**
   * Obtient une traduction par cle
   */
  function t(key, params = {}) {
    if (!translations) {
      return key;
    }

    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    let result = value;
    for (const [param, replacement] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), replacement);
    }

    return result;
  }

  /**
   * Obtient la langue courante
   */
  function getCurrentLanguage() {
    return currentLanguage;
  }

  /**
   * Verifie si le systeme est charge
   */
  function isReady() {
    return isLoaded;
  }

  /**
   * Attend que le systeme soit pret
   */
  async function waitReady() {
    if (isLoaded) return true;
    await init();
    return isLoaded;
  }

  // Ecouter les changements de langue
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.language) {
      const newLang = changes.language.newValue;
      if (SUPPORTED_LANGUAGES.includes(newLang) && newLang !== currentLanguage) {
        loadTranslations(newLang).then(trans => {
          if (trans) {
            translations = trans;
            currentLanguage = newLang;
            // Dispatch event pour notifier les content scripts
            window.dispatchEvent(new CustomEvent('fjd-language-changed', { detail: { language: newLang } }));
          }
        });
      }
    }
  });

  // Initialiser automatiquement
  init();

  // Export global
  window.FJD_I18n = {
    init,
    t,
    getCurrentLanguage,
    isReady,
    waitReady
  };

  console.log('[FJD] i18n content module loaded');
})();
