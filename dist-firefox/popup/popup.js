/**
 * Fake Job Detector - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Charger les statistiques
  await loadStats();
  
  // Charger les paramètres
  await loadSettings();
  
  // Événements des toggles
  setupSettingsListeners();
  
  // Événement du bouton de réinitialisation
  document.getElementById('btn-clear-stats').addEventListener('click', clearStats);
});

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
 * Charge les paramètres
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
    console.error('Erreur lors du chargement des paramètres:', error);
  }
}

/**
 * Configure les listeners pour les paramètres
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
        showFeedback('Paramètre enregistré ✓');
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
      }
    });
  }
}

/**
 * Réinitialise les statistiques
 */
async function clearStats() {
  try {
    await chrome.storage.local.set({
      stats: { analyzed: 0, flagged: 0, critical: 0 }
    });
    
    document.getElementById('stat-analyzed').textContent = '0';
    document.getElementById('stat-flagged').textContent = '0';
    document.getElementById('stat-critical').textContent = '0';
    
    showFeedback('Statistiques réinitialisées ✓');
  } catch (error) {
    console.error('Erreur lors de la réinitialisation:', error);
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
