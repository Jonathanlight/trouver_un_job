/**
 * Service Worker - Fake Job Detector
 * Gere la communication entre les content scripts et le popup
 */

// Etat global de l'extension
const state = {
  analyzedJobs: new Map(),
  settings: {
    autoAnalyze: true,
    showBadges: true,
    notifyHighRisk: true
  },
  translations: null,
  currentLanguage: 'fr'
};

// Langues supportees
const SUPPORTED_LANGUAGES = ['fr', 'en', 'it', 'de', 'es', 'zh'];
const DEFAULT_LANGUAGE = 'fr';

/**
 * Charge les traductions pour le service worker
 */
async function loadTranslations(lang) {
  try {
    const url = chrome.runtime.getURL(`locales/${lang}.json`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
    state.translations = await response.json();
    state.currentLanguage = lang;
  } catch (error) {
    console.error('[SW] Error loading translations:', error);
    if (lang !== DEFAULT_LANGUAGE) {
      await loadTranslations(DEFAULT_LANGUAGE);
    }
  }
}

/**
 * Obtient une traduction
 */
function t(key, params = {}) {
  if (!state.translations) return key;

  const keys = key.split('.');
  let value = state.translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }

  if (typeof value !== 'string') return key;

  let result = value;
  for (const [param, replacement] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${param}\\}`, 'g'), replacement);
  }

  return result;
}

/**
 * Initialise le service worker
 */
async function init() {
  // Charger les parametres
  const result = await chrome.storage.local.get(['settings', 'language']);

  if (result.settings) {
    Object.assign(state.settings, result.settings);
  }

  // Charger la langue
  let lang = result.language;
  if (!lang || !SUPPORTED_LANGUAGES.includes(lang)) {
    lang = DEFAULT_LANGUAGE;
  }

  await loadTranslations(lang);
}

// Initialiser au demarrage
init();

// Ecouter les changements de langue
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.language) {
    const newLang = changes.language.newValue;
    if (SUPPORTED_LANGUAGES.includes(newLang)) {
      loadTranslations(newLang);
    }
  }
});

// Ecouter les messages des content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ANALYZE_JOB':
      handleAnalyzeJob(message.data, sender.tab?.id)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'GET_ANALYSIS':
      const analysis = state.analyzedJobs.get(message.jobId);
      sendResponse(analysis || null);
      return false;

    case 'GET_SETTINGS':
      sendResponse(state.settings);
      return false;

    case 'UPDATE_SETTINGS':
      Object.assign(state.settings, message.settings);
      chrome.storage.local.set({ settings: state.settings });
      sendResponse({ success: true });
      return false;

    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;

    case 'CLEAR_STATS':
      chrome.storage.local.set({ stats: { analyzed: 0, flagged: 0, critical: 0 } });
      sendResponse({ success: true });
      return false;

    case 'UPDATE_STATS':
      // Mise a jour directe des stats depuis les content scripts avances
      updateStatsFromContentScript(message.data)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'JOB_ANALYZED':
      // Notification qu'une offre a ete analysee (pour mise a jour en temps reel)
      handleJobAnalyzedNotification(message.data, sender.tab?.id);
      sendResponse({ success: true });
      return false;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

/**
 * Analyse une offre d'emploi
 */
async function handleAnalyzeJob(jobData, tabId) {
  const { JobAnalyzer } = await import('../src/analyzer/job-analyzer.js');
  const analyzer = new JobAnalyzer();

  const analysis = analyzer.analyze(jobData);
  const jobId = generateJobId(jobData);

  // Stocker l'analyse
  state.analyzedJobs.set(jobId, {
    ...analysis,
    jobData,
    analyzedAt: Date.now()
  });

  // Mettre a jour les statistiques
  await updateStats(analysis);

  // Mettre a jour le badge si necessaire
  if (state.settings.showBadges && tabId) {
    updateBadge(tabId, analysis.riskLevel.level);
  }

  // Notification pour les offres a haut risque
  if (state.settings.notifyHighRisk && analysis.score >= 70) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: t('notifications.suspiciousTitle'),
      message: t('notifications.suspiciousBody', { title: jobData.title })
    });
  }

  return { jobId, analysis };
}

/**
 * Genere un ID unique pour une offre
 */
function generateJobId(jobData) {
  const str = `${jobData.title}-${jobData.company}-${jobData.url || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `job_${Math.abs(hash)}`;
}

/**
 * Met a jour les statistiques
 */
async function updateStats(analysis) {
  const result = await chrome.storage.local.get(['stats']);
  const stats = result.stats || { analyzed: 0, flagged: 0, critical: 0 };

  stats.analyzed++;
  if (analysis.score >= 30) stats.flagged++;
  if (analysis.score >= 70) stats.critical++;

  await chrome.storage.local.set({ stats });
}

/**
 * Recupere les statistiques
 */
async function getStats() {
  const result = await chrome.storage.local.get(['stats']);
  return result.stats || { analyzed: 0, flagged: 0, critical: 0 };
}

/**
 * Met a jour le badge de l'extension
 */
function updateBadge(tabId, riskLevel) {
  const badgeConfig = {
    critical: { text: '!', color: '#dc2626' },
    high: { text: '!', color: '#ea580c' },
    medium: { text: '?', color: '#ca8a04' },
    low: { text: '', color: '#65a30d' },
    safe: { text: '✓', color: '#16a34a' }
  };

  const config = badgeConfig[riskLevel] || badgeConfig.safe;

  chrome.action.setBadgeText({ text: config.text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: config.color, tabId });
}

/**
 * Mise a jour des stats depuis les content scripts avances
 */
async function updateStatsFromContentScript(data) {
  const result = await chrome.storage.local.get(['stats']);
  const stats = result.stats || { analyzed: 0, flagged: 0, critical: 0 };

  if (data.analyzed) stats.analyzed += data.analyzed;
  if (data.flagged) stats.flagged += data.flagged;
  if (data.critical) stats.critical += data.critical;

  await chrome.storage.local.set({ stats });
}

/**
 * Gere la notification d'une offre analysee
 */
function handleJobAnalyzedNotification(data, tabId) {
  // Mise a jour du badge si score eleve
  if (data.score >= 70 && tabId) {
    updateBadge(tabId, 'critical');
  } else if (data.score >= 50 && tabId) {
    updateBadge(tabId, 'high');
  } else if (data.score >= 30 && tabId) {
    updateBadge(tabId, 'medium');
  }

  // Notification pour offres critiques
  if (state.settings.notifyHighRisk && data.score >= 70 && data.title) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: t('notifications.criticalTitle'),
      message: t('notifications.criticalBody', { title: data.title })
    });
  }
}

// Nettoyer les anciennes analyses (plus de 24h)
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;

  for (const [jobId, data] of state.analyzedJobs) {
    if (now - data.analyzedAt > maxAge) {
      state.analyzedJobs.delete(jobId);
    }
  }
}, 60 * 60 * 1000); // Toutes les heures
