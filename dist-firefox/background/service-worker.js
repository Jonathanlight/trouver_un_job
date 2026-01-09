/**
 * Background Script - TrouverUnJob (Firefox)
 * Gère la communication entre les content scripts et le popup
 */

// Polyfill pour compatibilité Chrome/Firefox
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// État global de l'extension
const state = {
  analyzedJobs: new Map(),
  settings: {
    autoAnalyze: true,
    showBadges: true,
    notifyHighRisk: true
  }
};

// Charger les paramètres au démarrage
browserAPI.storage.local.get(['settings']).then((result) => {
  if (result.settings) {
    Object.assign(state.settings, result.settings);
  }
}).catch(() => {});

// Écouter les messages des content scripts
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
      browserAPI.storage.local.set({ settings: state.settings });
      sendResponse({ success: true });
      return false;

    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;

    case 'CLEAR_STATS':
      browserAPI.storage.local.set({ stats: { analyzed: 0, flagged: 0, critical: 0 } });
      sendResponse({ success: true });
      return false;

    case 'UPDATE_STATS':
      updateStatsFromContentScript(message.data)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;

    case 'JOB_ANALYZED':
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
  const jobId = generateJobId(jobData);

  // Analyse basique côté background
  const analysis = {
    score: 50,
    riskLevel: { level: 'medium' }
  };

  // Stocker l'analyse
  state.analyzedJobs.set(jobId, {
    ...analysis,
    jobData,
    analyzedAt: Date.now()
  });

  // Mettre à jour les statistiques
  await updateStats(analysis);

  // Mettre à jour le badge si nécessaire
  if (state.settings.showBadges && tabId) {
    updateBadge(tabId, analysis.riskLevel.level);
  }

  return { jobId, analysis };
}

/**
 * Génère un ID unique pour une offre
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
 * Met à jour les statistiques
 */
async function updateStats(analysis) {
  const result = await browserAPI.storage.local.get(['stats']);
  const stats = result.stats || { analyzed: 0, flagged: 0, critical: 0 };

  stats.analyzed++;
  if (analysis.score >= 30) stats.flagged++;
  if (analysis.score >= 70) stats.critical++;

  await browserAPI.storage.local.set({ stats });
}

/**
 * Récupère les statistiques
 */
async function getStats() {
  const result = await browserAPI.storage.local.get(['stats']);
  return result.stats || { analyzed: 0, flagged: 0, critical: 0 };
}

/**
 * Met à jour le badge de l'extension
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

  // Firefox MV2 utilise browserAction
  browserAPI.browserAction.setBadgeText({ text: config.text, tabId });
  browserAPI.browserAction.setBadgeBackgroundColor({ color: config.color, tabId });
}

/**
 * Mise à jour des stats depuis les content scripts
 */
async function updateStatsFromContentScript(data) {
  const result = await browserAPI.storage.local.get(['stats']);
  const stats = result.stats || { analyzed: 0, flagged: 0, critical: 0 };

  if (data.analyzed) stats.analyzed += data.analyzed;
  if (data.flagged) stats.flagged += data.flagged;
  if (data.critical) stats.critical += data.critical;

  await browserAPI.storage.local.set({ stats });
}

/**
 * Gère la notification d'une offre analysée
 */
function handleJobAnalyzedNotification(data, tabId) {
  if (data.score >= 70 && tabId) {
    updateBadge(tabId, 'critical');
  } else if (data.score >= 50 && tabId) {
    updateBadge(tabId, 'high');
  } else if (data.score >= 30 && tabId) {
    updateBadge(tabId, 'medium');
  }

  if (state.settings.notifyHighRisk && data.score >= 70 && data.title) {
    browserAPI.notifications?.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Offre suspecte détectée',
      message: `L'offre "${data.title}" présente de nombreux signaux d'alerte.`
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
}, 60 * 60 * 1000);
