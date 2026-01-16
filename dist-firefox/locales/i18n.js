/**
 * TrouverUnJob - Module i18n
 * Gestion de la traduction multilingue
 */

const I18n = (() => {
  const SUPPORTED_LANGUAGES = ['fr', 'en', 'it', 'de', 'es', 'zh'];
  const DEFAULT_LANGUAGE = 'fr';

  let currentLanguage = DEFAULT_LANGUAGE;
  let translations = {};
  let isLoaded = false;

  /**
   * Detecte la langue preferee du navigateur
   * @returns {string} Code langue (fr, en, it, de, es, zh)
   */
  function detectLanguage() {
    const browserLang = navigator.language.split('-')[0].toLowerCase();
    return SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
  }

  /**
   * Charge les traductions pour une langue
   * @param {string} lang - Code langue
   * @returns {Promise<Object>} Traductions
   */
  async function loadTranslations(lang) {
    try {
      const url = chrome.runtime.getURL(`locales/${lang}.json`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
      return await response.json();
    } catch (error) {
      console.error(`[i18n] Error loading ${lang}:`, error);
      // Fallback au francais si erreur
      if (lang !== DEFAULT_LANGUAGE) {
        return loadTranslations(DEFAULT_LANGUAGE);
      }
      return {};
    }
  }

  /**
   * Initialise le systeme i18n
   * Priorite: stockage > navigateur > defaut
   * @returns {Promise<string>} Langue initialisee
   */
  async function init() {
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
      console.error('[i18n] Init error:', error);
      currentLanguage = DEFAULT_LANGUAGE;
      translations = await loadTranslations(DEFAULT_LANGUAGE);
      isLoaded = true;
      return currentLanguage;
    }
  }

  /**
   * Change la langue et sauvegarde la preference
   * @param {string} lang - Code langue
   * @returns {Promise<boolean>} Succes
   */
  async function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      console.error(`[i18n] Unsupported language: ${lang}`);
      return false;
    }

    try {
      translations = await loadTranslations(lang);
      currentLanguage = lang;
      await chrome.storage.local.set({ language: lang });
      return true;
    } catch (error) {
      console.error('[i18n] setLanguage error:', error);
      return false;
    }
  }

  /**
   * Obtient une traduction par cle
   * @param {string} key - Cle de traduction (ex: "popup.analyzed")
   * @param {Object} params - Parametres de remplacement (ex: {title: "Dev"})
   * @returns {string} Texte traduit
   */
  function t(key, params = {}) {
    if (!isLoaded) {
      console.warn('[i18n] Not loaded yet');
      return key;
    }

    // Naviguer dans l'objet avec la cle (popup.analyzed -> translations.popup.analyzed)
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Cle non trouvee, retourner la cle
        return key;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Remplacer les parametres {param}
    let result = value;
    for (const [param, replacement] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), replacement);
    }

    return result;
  }

  /**
   * Traduit tous les elements avec data-i18n
   * @param {Element} root - Element racine (defaut: document)
   */
  function translatePage(root = document) {
    const elements = root.querySelectorAll('[data-i18n]');

    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);

      // Gerer les attributs specifiques
      const attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, translation);
      } else {
        el.textContent = translation;
      }
    });

    // Traduire les placeholders
    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });

    // Traduire les titres
    const titles = root.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
  }

  /**
   * Obtient la langue courante
   * @returns {string} Code langue
   */
  function getCurrentLanguage() {
    return currentLanguage;
  }

  /**
   * Obtient la liste des langues supportees
   * @returns {string[]} Codes langue
   */
  function getSupportedLanguages() {
    return [...SUPPORTED_LANGUAGES];
  }

  /**
   * Verifie si le systeme est charge
   * @returns {boolean}
   */
  function isReady() {
    return isLoaded;
  }

  return {
    init,
    setLanguage,
    t,
    translatePage,
    getCurrentLanguage,
    getSupportedLanguages,
    detectLanguage,
    isReady
  };
})();

// Export pour les modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = I18n;
}
