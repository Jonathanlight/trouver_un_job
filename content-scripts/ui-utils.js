/**
 * UI Utilities - Composants UI réutilisables
 */

export const UI = {
  /**
   * Crée un badge de risque
   */
  createBadge(analysis) {
    const badge = document.createElement('div');
    badge.className = `fjd-badge fjd-badge--${analysis.riskLevel.level}`;
    badge.innerHTML = `
      <span class="fjd-badge__icon">${this.getRiskIcon(analysis.riskLevel.level)}</span>
      <span class="fjd-badge__text">${analysis.riskLevel.label}</span>
    `;
    badge.title = `Score de risque: ${analysis.score}/100`;
    
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDetailPanel(analysis);
    });
    
    return badge;
  },

  /**
   * Retourne l'icône appropriée selon le niveau de risque
   */
  getRiskIcon(level) {
    const icons = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      low: '👁️',
      safe: '✅'
    };
    return icons[level] || '❓';
  },

  /**
   * Affiche le panneau de détails
   */
  showDetailPanel(analysis) {
    // Supprimer tout panneau existant
    this.closeDetailPanel();

    // Créer l'overlay
    const overlay = document.createElement('div');
    overlay.className = 'fjd-overlay';
    overlay.addEventListener('click', () => this.closeDetailPanel());
    document.body.appendChild(overlay);

    // Créer le panneau
    const panel = document.createElement('div');
    panel.className = 'fjd-panel';
    panel.innerHTML = this.generatePanelHTML(analysis);
    document.body.appendChild(panel);

    // Événement de fermeture
    panel.querySelector('.fjd-panel__close').addEventListener('click', () => {
      this.closeDetailPanel();
    });

    // Fermer avec Escape
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeDetailPanel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Ferme le panneau de détails
   */
  closeDetailPanel() {
    document.querySelectorAll('.fjd-panel, .fjd-overlay').forEach(el => el.remove());
  },

  /**
   * Génère le HTML du panneau
   */
  generatePanelHTML(analysis) {
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (analysis.score / 100) * circumference;
    
    return `
      <div class="fjd-panel__header">
        <h2 class="fjd-panel__title">
          ${this.getRiskIcon(analysis.riskLevel.level)}
          Analyse de l'offre
        </h2>
        <button class="fjd-panel__close" aria-label="Fermer">✕</button>
      </div>
      
      <div class="fjd-panel__content">
        <!-- Score -->
        <div class="fjd-score">
          <div class="fjd-score__circle">
            <svg class="fjd-score__svg" viewBox="0 0 120 120" width="120" height="120">
              <circle class="fjd-score__background" cx="60" cy="60" r="52"/>
              <circle 
                class="fjd-score__progress" 
                cx="60" 
                cy="60" 
                r="52"
                stroke="${analysis.riskLevel.color}"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
              />
            </svg>
            <span class="fjd-score__value" style="color: ${analysis.riskLevel.color}">
              ${analysis.score}
            </span>
          </div>
          <span class="fjd-score__label" style="color: ${analysis.riskLevel.color}">
            ${analysis.riskLevel.label}
          </span>
        </div>

        <!-- Résumé -->
        <p style="text-align: center; color: #4b5563; margin-bottom: 24px; line-height: 1.6;">
          ${analysis.summary}
        </p>

        <!-- Alertes détectées -->
        ${analysis.detectedFlags.length > 0 ? `
          <div class="fjd-alerts">
            <h3 class="fjd-alerts__title">🚩 Signaux d'alerte (${analysis.detectedFlags.length})</h3>
            ${analysis.detectedFlags.map(flag => `
              <div class="fjd-alert fjd-alert--${flag.severity}">
                <span class="fjd-alert__icon">${this.getSeverityIcon(flag.severity)}</span>
                <span class="fjd-alert__text">${flag.message}</span>
                <span class="fjd-alert__weight">+${flag.weight}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Points positifs -->
        ${analysis.positiveFlags.length > 0 ? `
          <div class="fjd-positives">
            <h3 class="fjd-alerts__title">✅ Points positifs</h3>
            ${analysis.positiveFlags.map(flag => `
              <div class="fjd-positive">
                <span class="fjd-positive__icon">✓</span>
                <span>${flag.message}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Recommandations -->
        ${analysis.recommendations.length > 0 ? `
          <div class="fjd-recommendations">
            <h3 class="fjd-recommendations__title">
              💡 Recommandations
            </h3>
            ${analysis.recommendations.map(rec => `
              <div class="fjd-recommendation">
                <span class="fjd-recommendation__bullet">→</span>
                <span>${rec}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  /**
   * Retourne l'icône de sévérité
   */
  getSeverityIcon(severity) {
    const icons = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🟢'
    };
    return icons[severity] || '⚪';
  },

  /**
   * Affiche un toast
   */
  showToast(message, type = 'info') {
    const existing = document.querySelector('.fjd-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `fjd-toast fjd-toast--${type}`;
    toast.innerHTML = `
      <span>${type === 'warning' ? '⚠️' : 'ℹ️'}</span>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  /**
   * Crée un bouton d'analyse
   */
  createAnalyzeButton(onClick) {
    const button = document.createElement('button');
    button.className = 'fjd-analyze-btn';
    button.innerHTML = `
      <span>🔍</span>
      <span>Analyser</span>
    `;
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      button.classList.add('fjd-analyze-btn--loading');
      button.innerHTML = `
        <span class="fjd-analyze-btn__spinner"></span>
        <span>Analyse...</span>
      `;
      
      await onClick();
      
      button.classList.remove('fjd-analyze-btn--loading');
    });
    
    return button;
  }
};

export default UI;
