/**
 * Configuration centralisée pour Fake Job Detector
 * Charge les variables d'environnement et fournit des valeurs par défaut
 */

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

const DEFAULT_CONFIG = {
  // Mode & Debug
  nodeEnv: 'development',
  debugMode: false,
  logLevel: 'info',

  // Seuils de score
  thresholds: {
    suspect: 30,
    danger: 50,
    scam: 70
  },

  // LinkedIn
  linkedin: {
    ghostJobApplicants: 300,
    criticalApplicants: 500,
    analyzeApplicants: true
  },

  // Indeed
  indeed: {
    flagUrgent: true,
    urgentWeight: 15
  },

  // Multiplicateurs marché par région
  marketMultipliers: {
    paris: 1.15,
    grandesVilles: 1.05,
    regions: 0.95
  },

  // Agents IA
  agents: {
    scamDetector: { enabled: true, weight: 1.5 },
    coherence: { enabled: true, weight: 1.2 },
    market: { enabled: true, weight: 1.0 },
    professionalism: { enabled: true, weight: 0.8 },
    ghostJob: { enabled: true, weight: 1.1 }
  },

  // MCP Server
  mcpServer: {
    port: 3000,
    host: 'localhost',
    cacheEnabled: true,
    cacheTtlMinutes: 30
  },

  // Notifications
  notifications: {
    enabled: true,
    sound: false
  },

  // Stockage
  storage: {
    analysisTtlHours: 24,
    maxAnalyses: 1000
  }
};

// ============================================================================
// CHARGEMENT DE LA CONFIGURATION
// ============================================================================

/**
 * Parse une valeur booléenne depuis une string
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() === 'true';
}

/**
 * Parse un nombre depuis une string
 */
function parseNumber(value, defaultValue = 0) {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Charge la configuration depuis process.env (Node.js) ou les valeurs par défaut
 */
function loadConfig() {
  // En environnement navigateur, utiliser les valeurs par défaut
  // ou charger depuis chrome.storage.sync
  if (typeof process === 'undefined' || !process.env) {
    return { ...DEFAULT_CONFIG };
  }

  const env = process.env;

  return {
    nodeEnv: env.NODE_ENV || DEFAULT_CONFIG.nodeEnv,
    debugMode: parseBoolean(env.DEBUG_MODE, DEFAULT_CONFIG.debugMode),
    logLevel: env.LOG_LEVEL || DEFAULT_CONFIG.logLevel,

    thresholds: {
      suspect: parseNumber(env.SCORE_THRESHOLD_SUSPECT, DEFAULT_CONFIG.thresholds.suspect),
      danger: parseNumber(env.SCORE_THRESHOLD_DANGER, DEFAULT_CONFIG.thresholds.danger),
      scam: parseNumber(env.SCORE_THRESHOLD_SCAM, DEFAULT_CONFIG.thresholds.scam)
    },

    linkedin: {
      ghostJobApplicants: parseNumber(env.LINKEDIN_GHOST_JOB_APPLICANTS, DEFAULT_CONFIG.linkedin.ghostJobApplicants),
      criticalApplicants: parseNumber(env.LINKEDIN_CRITICAL_APPLICANTS, DEFAULT_CONFIG.linkedin.criticalApplicants),
      analyzeApplicants: parseBoolean(env.LINKEDIN_ANALYZE_APPLICANTS, DEFAULT_CONFIG.linkedin.analyzeApplicants)
    },

    indeed: {
      flagUrgent: parseBoolean(env.INDEED_FLAG_URGENT, DEFAULT_CONFIG.indeed.flagUrgent),
      urgentWeight: parseNumber(env.INDEED_URGENT_WEIGHT, DEFAULT_CONFIG.indeed.urgentWeight)
    },

    marketMultipliers: {
      paris: parseNumber(env.MARKET_MULTIPLIER_PARIS, DEFAULT_CONFIG.marketMultipliers.paris),
      grandesVilles: parseNumber(env.MARKET_MULTIPLIER_GRANDES_VILLES, DEFAULT_CONFIG.marketMultipliers.grandesVilles),
      regions: parseNumber(env.MARKET_MULTIPLIER_REGIONS, DEFAULT_CONFIG.marketMultipliers.regions)
    },

    agents: {
      scamDetector: {
        enabled: parseBoolean(env.AGENT_SCAM_DETECTOR_ENABLED, DEFAULT_CONFIG.agents.scamDetector.enabled),
        weight: parseNumber(env.AGENT_SCAM_DETECTOR_WEIGHT, DEFAULT_CONFIG.agents.scamDetector.weight)
      },
      coherence: {
        enabled: parseBoolean(env.AGENT_COHERENCE_ENABLED, DEFAULT_CONFIG.agents.coherence.enabled),
        weight: parseNumber(env.AGENT_COHERENCE_WEIGHT, DEFAULT_CONFIG.agents.coherence.weight)
      },
      market: {
        enabled: parseBoolean(env.AGENT_MARKET_ENABLED, DEFAULT_CONFIG.agents.market.enabled),
        weight: parseNumber(env.AGENT_MARKET_WEIGHT, DEFAULT_CONFIG.agents.market.weight)
      },
      professionalism: {
        enabled: parseBoolean(env.AGENT_PROFESSIONALISM_ENABLED, DEFAULT_CONFIG.agents.professionalism.enabled),
        weight: parseNumber(env.AGENT_PROFESSIONALISM_WEIGHT, DEFAULT_CONFIG.agents.professionalism.weight)
      },
      ghostJob: {
        enabled: parseBoolean(env.AGENT_GHOST_JOB_ENABLED, DEFAULT_CONFIG.agents.ghostJob.enabled),
        weight: parseNumber(env.AGENT_GHOST_JOB_WEIGHT, DEFAULT_CONFIG.agents.ghostJob.weight)
      }
    },

    mcpServer: {
      port: parseNumber(env.MCP_SERVER_PORT, DEFAULT_CONFIG.mcpServer.port),
      host: env.MCP_SERVER_HOST || DEFAULT_CONFIG.mcpServer.host,
      cacheEnabled: parseBoolean(env.MCP_CACHE_ENABLED, DEFAULT_CONFIG.mcpServer.cacheEnabled),
      cacheTtlMinutes: parseNumber(env.MCP_CACHE_TTL_MINUTES, DEFAULT_CONFIG.mcpServer.cacheTtlMinutes)
    },

    notifications: {
      enabled: parseBoolean(env.NOTIFICATIONS_ENABLED, DEFAULT_CONFIG.notifications.enabled),
      sound: parseBoolean(env.NOTIFICATIONS_SOUND, DEFAULT_CONFIG.notifications.sound)
    },

    storage: {
      analysisTtlHours: parseNumber(env.STORAGE_ANALYSIS_TTL_HOURS, DEFAULT_CONFIG.storage.analysisTtlHours),
      maxAnalyses: parseNumber(env.STORAGE_MAX_ANALYSES, DEFAULT_CONFIG.storage.maxAnalyses)
    }
  };
}

// ============================================================================
// CONFIGURATION POUR EXTENSION NAVIGATEUR
// ============================================================================

/**
 * Charge la configuration depuis chrome.storage.sync pour l'extension
 */
async function loadBrowserConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return { ...DEFAULT_CONFIG };
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(['config'], (result) => {
      if (result.config) {
        resolve({ ...DEFAULT_CONFIG, ...result.config });
      } else {
        resolve({ ...DEFAULT_CONFIG });
      }
    });
  });
}

/**
 * Sauvegarde la configuration dans chrome.storage.sync
 */
async function saveBrowserConfig(config) {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.warn('chrome.storage not available');
    return false;
  }

  return new Promise((resolve) => {
    chrome.storage.sync.set({ config }, () => {
      resolve(true);
    });
  });
}

// ============================================================================
// VILLES ET RÉGIONS
// ============================================================================

const GRANDES_VILLES = [
  'lyon', 'marseille', 'toulouse', 'nice', 'nantes',
  'strasbourg', 'montpellier', 'bordeaux', 'lille', 'rennes'
];

const PARIS_REGION = [
  'paris', 'île-de-france', 'ile-de-france', 'idf',
  'hauts-de-seine', 'seine-saint-denis', 'val-de-marne',
  'yvelines', 'essonne', 'val-d\'oise', 'seine-et-marne'
];

/**
 * Détermine le multiplicateur de salaire selon la localisation
 */
function getLocationMultiplier(location, config = null) {
  const cfg = config || loadConfig();
  const loc = (location || '').toLowerCase();

  // Paris / Île-de-France
  if (PARIS_REGION.some(p => loc.includes(p))) {
    return cfg.marketMultipliers.paris;
  }

  // Grandes villes
  if (GRANDES_VILLES.some(v => loc.includes(v))) {
    return cfg.marketMultipliers.grandesVilles;
  }

  // Autres régions
  return cfg.marketMultipliers.regions;
}

// ============================================================================
// EXPORTS
// ============================================================================

const config = loadConfig();

export {
  config,
  DEFAULT_CONFIG,
  loadConfig,
  loadBrowserConfig,
  saveBrowserConfig,
  getLocationMultiplier,
  GRANDES_VILLES,
  PARIS_REGION
};

// Export pour CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    config,
    DEFAULT_CONFIG,
    loadConfig,
    loadBrowserConfig,
    saveBrowserConfig,
    getLocationMultiplier,
    GRANDES_VILLES,
    PARIS_REGION
  };
}