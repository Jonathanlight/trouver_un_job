/**
 * Fake Job Detector - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialiser i18n
  await initI18n();

  // Charger les statistiques
  await loadStats();

  // Charger les parametres
  await loadSettings();

  // Charger l'analyse de l'offre actuelle
  await loadCurrentJobAnalysis();

  // Evenements des toggles
  setupSettingsListeners();

  // Evenement du bouton de reinitialisation
  document.getElementById('btn-clear-stats').addEventListener('click', clearStats);

  // Evenement du selecteur de langue
  document.getElementById('language-selector').addEventListener('change', handleLanguageChange);
});

/**
 * Initialise le systeme i18n
 */
async function initI18n() {
  try {
    const currentLang = await I18n.init();

    // Mettre a jour le selecteur de langue
    const selector = document.getElementById('language-selector');
    selector.value = currentLang;

    // Traduire la page
    I18n.translatePage();
  } catch (error) {
    console.error('Erreur lors de l\'initialisation i18n:', error);
  }
}

/**
 * Gere le changement de langue
 */
async function handleLanguageChange(e) {
  const newLang = e.target.value;

  try {
    const success = await I18n.setLanguage(newLang);
    if (success) {
      I18n.translatePage();
      showFeedback(I18n.t('popup.settingSaved') + ' ✓');
    }
  } catch (error) {
    console.error('Erreur lors du changement de langue:', error);
  }
}

/**
 * Charge les statistiques depuis le storage
 */
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['stats']);
    const stats = result.stats || { analyzed: 0, flagged: 0, critical: 0 };

    document.getElementById('stat-analyzed').textContent = formatNumber(stats.analyzed);
    document.getElementById('stat-flagged').textContent = formatNumber(stats.flagged);
    document.getElementById('stat-critical').textContent = formatNumber(stats.critical);
  } catch (error) {
    console.error('Erreur lors du chargement des stats:', error);
  }
}

/**
 * Charge les parametres
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {
      autoAnalyze: true,
      showBadges: true,
      notifyHighRisk: false
    };

    document.getElementById('setting-auto-analyze').checked = settings.autoAnalyze;
    document.getElementById('setting-show-badges').checked = settings.showBadges;
    document.getElementById('setting-notify').checked = settings.notifyHighRisk;
  } catch (error) {
    console.error('Erreur lors du chargement des parametres:', error);
  }
}

/**
 * Cree un element de flag de maniere securisee
 */
function createFlagItem(flag, isRed) {
  const li = document.createElement('li');
  li.className = isRed ? 'flag-item flag-item--red' : 'flag-item flag-item--green';

  const impactSpan = document.createElement('span');
  impactSpan.className = 'flag-item__impact';
  const impactValue = flag.impact || flag.score || 0;
  impactSpan.textContent = isRed ? (impactValue > 0 ? '+' + impactValue : impactValue) : '+' + impactValue;

  const labelText = document.createTextNode(' ' + flag.label);

  li.appendChild(impactSpan);
  li.appendChild(labelText);

  return li;
}

/**
 * Charge l'analyse de l'offre d'emploi actuelle
 */
async function loadCurrentJobAnalysis() {
  const analysisSection = document.getElementById('analysis-section');
  const analysisEmpty = document.getElementById('analysis-empty');
  const analysisScore = document.getElementById('analysis-score');
  const redflagsGroup = document.getElementById('redflags-group');
  const greenflagsGroup = document.getElementById('greenflags-group');
  const redflagsList = document.getElementById('redflags-list');
  const greenflagsList = document.getElementById('greenflags-list');

  try {
    // Obtenir l'onglet actif
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      return;
    }

    // Verifier si c'est un site supporte
    const supportedSites = ['indeed.com', 'indeed.fr', 'linkedin.com', 'hellowork.com', 'hellowork.io', 'welcometothejungle.com'];
    const isSupported = supportedSites.some(site => tab.url.includes(site));

    if (!isSupported) {
      return;
    }

    // Afficher la section d'analyse
    analysisSection.style.display = 'block';

    // Demander l'analyse au content script
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentJobAnalysis' });

      if (response && response.success && response.analysis) {
        const { score, redFlags, greenFlags, status } = response.analysis;

        // Afficher le score
        const scoreValue = analysisScore.querySelector('.analysis__score-value');
        scoreValue.textContent = score;
        analysisScore.className = 'analysis__score';
        if (status === 'danger') {
          analysisScore.classList.add('analysis__score--danger');
        } else if (status === 'warning') {
          analysisScore.classList.add('analysis__score--warning');
        } else {
          analysisScore.classList.add('analysis__score--good');
        }

        // Afficher les red flags
        if (redFlags && redFlags.length > 0) {
          redflagsGroup.style.display = 'block';
          redflagsList.textContent = '';
          redFlags.forEach(flag => {
            redflagsList.appendChild(createFlagItem(flag, true));
          });
        }

        // Afficher les green flags
        if (greenFlags && greenFlags.length > 0) {
          greenflagsGroup.style.display = 'block';
          greenflagsList.textContent = '';
          greenFlags.forEach(flag => {
            greenflagsList.appendChild(createFlagItem(flag, false));
          });
        }

        // Si aucun flag
        if ((!redFlags || redFlags.length === 0) && (!greenFlags || greenFlags.length === 0)) {
          analysisEmpty.style.display = 'block';
          analysisEmpty.textContent = I18n.t('popup.noFlags');
        }
      } else {
        // Pas d'analyse disponible
        analysisEmpty.style.display = 'block';
        analysisScore.style.display = 'none';
      }
    } catch (err) {
      // Content script non charge ou pas de reponse
      analysisEmpty.style.display = 'block';
      analysisScore.style.display = 'none';
    }
  } catch (error) {
    console.error('Erreur lors du chargement de l\'analyse:', error);
  }
}

/**
 * Configure les listeners pour les parametres
 */
function setupSettingsListeners() {
  const settingsMap = {
    'setting-auto-analyze': 'autoAnalyze',
    'setting-show-badges': 'showBadges',
    'setting-notify': 'notifyHighRisk'
  };

  for (const [elementId, settingKey] of Object.entries(settingsMap)) {
    document.getElementById(elementId).addEventListener('change', async (e) => {
      try {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        settings[settingKey] = e.target.checked;
        await chrome.storage.local.set({ settings });

        // Feedback visuel
        showFeedback(I18n.t('popup.settingSaved') + ' ✓');
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
      }
    });
  }
}

/**
 * Reinitialise les statistiques
 */
async function clearStats() {
  try {
    await chrome.storage.local.set({
      stats: { analyzed: 0, flagged: 0, critical: 0 }
    });

    document.getElementById('stat-analyzed').textContent = '0';
    document.getElementById('stat-flagged').textContent = '0';
    document.getElementById('stat-critical').textContent = '0';

    showFeedback(I18n.t('popup.statsReset') + ' ✓');
  } catch (error) {
    console.error('Erreur lors de la reinitialisation:', error);
  }
}

/**
 * Formate un nombre pour l'affichage
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Affiche un feedback temporaire
 */
function showFeedback(message) {
  // Supprimer tout feedback existant
  const existing = document.querySelector('.feedback');
  if (existing) existing.remove();

  const feedback = document.createElement('div');
  feedback.className = 'feedback';
  feedback.textContent = message;
  feedback.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(34, 197, 94, 0.9);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    z-index: 1000;
    animation: fadeInUp 0.3s ease;
  `;

  document.body.appendChild(feedback);

  setTimeout(() => {
    feedback.style.opacity = '0';
    feedback.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => feedback.remove(), 300);
  }, 2000);
}

// Ajouter les styles d'animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .feedback {
    transition: all 0.3s ease;
  }
`;
document.head.appendChild(style);
