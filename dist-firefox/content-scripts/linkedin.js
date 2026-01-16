/**
 * Fake Job Detector - LinkedIn v3.0
 * Détection améliorée avec extraction structurée des données LinkedIn
 */

(function() {
  'use strict';

  console.log('[FJD] LinkedIn content script chargé');

  if (!window.FJD_PertinenceAnalyzer) {
    console.error('[FJD] Analyseur de pertinence non disponible');
    return;
  }

  const Analyzer = window.FJD_PertinenceAnalyzer;
  const SalaryAnalyzer = window.FJD_SalaryMarketAnalyzer;
  const t = (key, params) => window.FJD_I18n?.t(key, params) || key;

  const SELECTORS = {
    jobCards: '.jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item, .jobs-search-results-list__list-item, [data-job-id], .jobs-search-two-pane__job-card-container--viewport-tracking-0',
    jobTitle: '.job-card-list__title, .job-card-container__link, .artdeco-entity-lockup__title, a[data-tracking-control-name*="title"], .job-card-list__title--link',
    company: '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .job-card-container__company-name, .job-card-list__company-name',
    location: '.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-card-container__metadata-wrapper',
    detailContainer: '.jobs-description, .jobs-box__html-content, .jobs-description-content__text, .jobs-description__content',
    detailTitle: '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, .t-24.t-bold',
    detailCompany: '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .jobs-unified-top-card__subtitle-primary-grouping'
  };

  let observer = null;
  let lastUrl = window.location.href;
  let debounceTimer = null;
  let scrollTimer = null;
  let rafId = null;
  let processedElements = new WeakSet();
  let retryCount = 0;
  const MAX_RETRIES = 10;
  let lastAnalysis = null;

  // Message listener pour le popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCurrentJobAnalysis') {
      sendResponse({
        success: !!lastAnalysis,
        analysis: lastAnalysis
      });
    }
    return true;
  });

  const StatsTracker = {
    pending: { analyzed: 0, flagged: 0, critical: 0 },
    debounceTimer: null,
    track(score) {
      this.pending.analyzed++;
      if (score <= 45) this.pending.flagged++;
      if (score <= 25) this.pending.critical++;
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.flush(), 500);
    },
    flush() {
      if (this.pending.analyzed === 0) return;
      try { chrome.runtime?.sendMessage({ type: 'UPDATE_STATS', data: { ...this.pending } }); } catch (e) {}
      this.pending = { analyzed: 0, flagged: 0, critical: 0 };
    }
  };

  // ============================================================================
  // EXTRACTION DE DONNÉES SPÉCIFIQUE LINKEDIN
  // ============================================================================

  const LinkedInParser = {
    // Extraire le salaire du texte LinkedIn
    // Formats variés: "45 000 € - 55 000 €/an", "50K€ - 60K€", "3 500 €/mois"
    extractSalary(text) {
      // Format: XX XXX € - XX XXX €/an ou par an
      let match = text.match(/(\d{1,3})\s*(\d{3})\s*€?\s*[-–àa]\s*(\d{1,3})\s*(\d{3})\s*€\s*(?:\/\s*an|par\s*an|annuel)/i);
      if (match) {
        return {
          min: parseInt(match[1] + match[2]),
          max: parseInt(match[3] + match[4]),
          type: 'annual',
          raw: match[0]
        };
      }

      // Format: XXK€ - XXK€
      match = text.match(/(\d{2,3})\s*k\s*€?\s*[-–àa]\s*(\d{2,3})\s*k\s*€?/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          type: 'annual',
          raw: match[0]
        };
      }

      // Format mensuel: X XXX €/mois
      match = text.match(/(\d{1,2})\s*(\d{3})\s*€\s*(?:\/\s*mois|par\s*mois|mensuel)/i);
      if (match) {
        const monthly = parseInt(match[1] + match[2]);
        const annual = monthly * 12;
        return { min: annual * 0.95, max: annual * 1.05, type: 'monthly', raw: match[0] };
      }

      return null;
    },

    // Extraire le niveau de diplôme
    extractDiploma(text) {
      const levels = {
        'bac8': /bac\s*\+?\s*8|doctorat|phd|doctorate/i,
        'bac5': /bac\s*\+?\s*5|master|ingénieur|mba|grandes?\s*écoles?|engineering\s*degree/i,
        'bac3': /bac\s*\+?\s*3|licence|bachelor|degree/i,
        'bac2': /bac\s*\+?\s*2|bts|dut|deug|associate/i,
        'bac': /\bniveau\s*bac\b|\bbac\b(?!\s*\+)|baccalauréat|high\s*school/i,
        'cap_bep': /cap|bep|certificat|vocational/i
      };

      for (const [level, pattern] of Object.entries(levels)) {
        if (pattern.test(text)) return level;
      }
      return null;
    },

    // Extraire l'expérience requise
    extractExperience(text) {
      // Format: X+ years / X ans d'expérience
      let match = text.match(/(\d+)\s*\+?\s*(?:years?|ans?)\s*(?:of\s*)?(?:experience|d['']?exp)/i);
      if (match) return parseInt(match[1]);

      // Format: X-Y years/ans
      match = text.match(/(\d+)\s*[-–àa]\s*(\d+)\s*(?:years?|ans?)/i);
      if (match) return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);

      // Entry level
      if (/entry\s*level|débutant|junior|stage|intern/i.test(text)) return 0;

      // Senior
      if (/senior|expert|lead|principal|staff/i.test(text)) return 7;
      if (/mid[-\s]?level|confirmé|expérimenté/i.test(text)) return 4;

      return null;
    },

    // Extraire le type de contrat
    extractContractType(text) {
      if (/\b(?:cdi|permanent|full[- ]?time\s*contract)\b/i.test(text)) return 'CDI';
      if (/\b(?:cdd|temporary|fixed[- ]?term)\b/i.test(text)) return 'CDD';
      if (/\bintérim\b|temporary\s*work/i.test(text)) return 'Intérim';
      if (/\b(?:stage|internship)\b/i.test(text)) return 'Stage';
      if (/\b(?:alternance|apprenticeship|apprentissage)\b/i.test(text)) return 'Alternance';
      if (/\b(?:freelance|contractor|self[- ]?employed)\b/i.test(text)) return 'Freelance';
      if (/part[- ]?time|temps\s*partiel/i.test(text)) return 'Temps partiel';
      if (/full[- ]?time|temps\s*plein/i.test(text)) return 'Temps plein';
      return null;
    },

    // Extraire le télétravail
    extractRemoteWork(text) {
      if (/100\s*%\s*(?:remote|télétravail)|fully\s*remote|full\s*remote|télétravail\s*(?:complet|total)/i.test(text)) return 'complet';
      if (/(?:hybrid|hybride|télétravail\s*(?:partiel))/i.test(text)) return 'partiel';
      if (/(?:remote|télétravail)\s*(?:occasionnel|ponctuel|flexible)/i.test(text)) return 'occasionnel';
      if (/(?:on[- ]?site|sur\s*site|présentiel)/i.test(text)) return 'presentiel';
      if (/remote|télétravail/i.test(text)) return 'possible';
      return null;
    },

    // Détecter si c'est un cabinet de recrutement
    isRecruitmentAgency(text) {
      return /cabinet\s*(?:de\s*)?recrutement|staffing|recruiting|headhunt|talent\s*acquisition|michael\s*page|hays|randstad|manpower|adecco|robert\s*half|korn\s*ferry/i.test(text);
    },

    // Détecter si l'offre est republiée
    isReposted(text) {
      return /reposted|republiée/i.test(text);
    },

    // Extraire le nombre de jours depuis publication
    extractPostedDaysAgo(text) {
      // Format: "Posted X days ago", "Il y a X jours"
      let match = text.match(/(?:posted|publiée?)\s*(\d+)\s*(?:days?|jours?)\s*ago/i);
      if (match) return parseInt(match[1]);

      match = text.match(/il\s*y\s*a\s*(\d+)\s*(?:jours?|semaines?)/i);
      if (match) {
        const num = parseInt(match[1]);
        return /semaines?/i.test(match[0]) ? num * 7 : num;
      }

      // "Just now", "Aujourd'hui"
      if (/just\s*now|aujourd'?hui|today/i.test(text)) return 0;

      // "X weeks ago"
      match = text.match(/(\d+)\s*weeks?\s*ago/i);
      if (match) return parseInt(match[1]) * 7;

      // "X months ago"
      match = text.match(/(\d+)\s*months?\s*ago/i);
      if (match) return parseInt(match[1]) * 30;

      return null;
    },

    // Détecter le secteur d'activité
    extractSector(text) {
      const sectors = [
        { name: 'tech', pattern: /(?:software|tech|saas|digital|data|cloud|cyber|devops|ai|machine\s*learning|développ|informatique)/i },
        { name: 'finance', pattern: /(?:banking|banque|finance|insurance|assurance|fintech|investment)/i },
        { name: 'sante', pattern: /(?:health|santé|medical|pharma|biotech|healthcare)/i },
        { name: 'commerce', pattern: /(?:retail|e-?commerce|distribution|sales|vente)/i },
        { name: 'industrie', pattern: /(?:manufacturing|industrie|automotive|aerospace|production)/i },
        { name: 'services', pattern: /(?:consulting|conseil|professional\s*services)/i },
        { name: 'energie', pattern: /(?:energy|énergie|oil|gas|renewable|nuclear)/i }
      ];

      for (const sector of sectors) {
        if (sector.pattern.test(text)) return sector.name;
      }
      return null;
    },

    // Extraire le nombre de collaborateurs
    extractCompanySize(text) {
      const match = text.match(/(\d+(?:\s*\d+)*)\s*(?:employees?|collaborateurs?|salariés?)/i);
      if (match) {
        return parseInt(match[1].replace(/\s/g, ''));
      }
      if (/startup|small\s*company/i.test(text)) return 50;
      if (/large\s*company|grande\s*entreprise/i.test(text)) return 1000;
      return null;
    },

    // Extraire le nombre de candidats
    extractApplicantCount(text) {
      // Format: "X applicants" ou "X candidats" ou "Over X applicants"
      let match = text.match(/(?:over\s+)?(\d+)\s*(?:applicants?|candidat(?:ure)?s?)/i);
      if (match) return parseInt(match[1]);

      // Format: "X personnes ont postulé"
      match = text.match(/(\d+)\s*personnes?\s*(?:ont\s*)?postulé/i);
      if (match) return parseInt(match[1]);

      // Format avec virgule "1,234 applicants"
      match = text.match(/(\d{1,3}(?:,\d{3})*)\s*(?:applicants?|candidat(?:ure)?s?)/i);
      if (match) return parseInt(match[1].replace(/,/g, ''));

      return null;
    }
  };

  // ============================================================================
  // UI
  // ============================================================================

  const UI = {
    createBadge(result) {
      const badge = document.createElement('div');
      const cls = result.classification;

      // Déterminer le style forcé si offre saturée ou mauvaise
      let badgeColor = cls.color;
      let badgeBg = cls.bgColor;
      let badgeLabel = cls.label;

      // Forcer le style si offre marquée comme mauvaise (+80 candidats ou problèmes d'expérience)
      if (result.forceStatus === 'danger' || result.isBadOffer) {
        badgeColor = '#dc2626';
        badgeBg = '#fee2e2';
        badgeLabel = 'Mauvaise offre';
      } else if (result.forceStatus === 'warning' || result.shouldShowWarning) {
        if (result.pertinenceScore < 50) {
          badgeColor = '#ea580c';
          badgeBg = '#ffedd5';
          badgeLabel = 'Offre douteuse';
        }
      }

      badge.className = 'fjd-badge';
      badge.style.cssText = `
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 10px; border-radius: 16px; cursor: pointer;
        font-size: 11px; font-weight: 600; font-family: system-ui, sans-serif;
        background: ${badgeBg}; color: ${badgeColor};
        border: 1px solid ${badgeColor}40;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: all 0.2s ease; z-index: 100;
      `;

      // Créer les éléments du badge de manière sécurisée (sans innerHTML)
      const labelSpan = document.createElement('span');
      labelSpan.textContent = badgeLabel;

      const scoreSpan = document.createElement('span');
      scoreSpan.style.cssText = `background: ${badgeColor}25; padding: 2px 5px; border-radius: 8px; font-weight: 700;`;
      scoreSpan.textContent = `${result.pertinenceScore}%`;

      badge.appendChild(labelSpan);
      badge.appendChild(scoreSpan);

      // Ajouter indicateur nombre de candidats si offre saturée
      const applicantInfo = result.platform?.applicantPenalty;
      if (applicantInfo?.isBadOffer && result.platform?.applicantCount) {
        const applicantSpan = document.createElement('span');
        applicantSpan.style.cssText = 'margin-left: 2px; font-size: 9px; opacity: 0.9;';
        applicantSpan.textContent = `${result.platform.applicantCount}+👥`;
        badge.appendChild(applicantSpan);
      }

      badge.title = t('modal.clickForDetails');
      badge.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.showPanel(result); });
      return badge;
    },

    showPanel(result) {
      this.closePanel();

      const overlay = document.createElement('div');
      overlay.className = 'fjd-overlay';
      overlay.style.cssText = 'position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.6);';
      overlay.onclick = () => this.closePanel();
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);

      const panel = document.createElement('div');
      panel.className = 'fjd-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'fjd-panel-title');
      panel.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 95%; max-width: 520px; max-height: 85vh; background: white;
        border-radius: 12px; z-index: 10001;
        box-shadow: 0 20px 40px rgba(0,0,0,0.25);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px; line-height: 1.5; color: #1e293b;
        display: flex; flex-direction: column;
      `;

      const cls = result.classification;
      const s = result.scores;
      const d = result.detected;
      const extra = result.linkedinData || {};

      const diplomaLabels = {
        'cap_bep': t('diploma.capBep'), 'bac': t('diploma.bac'), 'bac2': t('diploma.bac2'),
        'bac3': t('diploma.bac3'), 'bac5': t('diploma.bac5'), 'bac8': t('diploma.bac8')
      };

      const remoteLabels = {
        'complet': t('remote.full'),
        'partiel': t('remote.hybrid'),
        'occasionnel': t('remote.occasional'),
        'possible': t('remote.possible'),
        'presentiel': t('remote.onsite')
      };

      // Analyse des débouchés et reconversions
      const CareerPathways = window.FJD_CareerPathways;
      const careerData = CareerPathways ? CareerPathways.analyze(result.jobTitle || '') : { debouches: [], reconversion: [] };

      panel.innerHTML = `
        <header style="background: linear-gradient(135deg, ${cls.bgColor} 0%, ${cls.color}15 100%); padding: 18px 20px; border-bottom: 1px solid ${cls.color}30; flex-shrink: 0; border-radius: 12px 12px 0 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div id="fjd-panel-title" style="font-size: 28px; font-weight: 700; color: ${cls.color};" role="status" aria-live="polite">${result.pertinenceScore}%</div>
              <div style="font-size: 14px; color: ${cls.color}; font-weight: 500;">${cls.label}</div>
            </div>
            <button class="fjd-close" aria-label="${t('modal.closePanel')}" style="background: none; border: none; font-size: 26px; cursor: pointer; color: #475569; padding: 8px; border-radius: 6px; transition: background 0.2s;">&times;</button>
          </div>
          ${result.jobTitle ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid ${cls.color}25;">
              <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; line-height: 1.4;">${result.jobTitle}</h2>
              ${result.company ? `<p style="font-size: 13px; color: #64748b; margin: 4px 0 0 0;">${result.company}</p>` : ''}
            </div>
          ` : ''}
        </header>

        <main style="padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0;">
          <section aria-label="${t('modal.profileAnalysis')}" style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
            <h3 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 10px 0;">${t('modal.profileAnalysis')}</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
              <div><span style="color: #64748b;">${t('modal.diploma')}:</span> <strong style="color: #1e293b;">${d.diploma ? diplomaLabels[d.diploma] : t('modal.notSpecified')}</strong></div>
              <div><span style="color: #64748b;">${t('modal.experience')}:</span> <strong style="color: #1e293b;">${d.experience !== null ? d.experience + ' ' + (d.experience > 1 ? t('modal.years') : t('modal.year')) : t('modal.notSpecified')}</strong></div>
              <div><span style="color: #64748b;">${t('modal.contract')}:</span> <strong style="color: #1e293b;">${extra.contractType || '-'}</strong></div>
              <div><span style="color: #64748b;">${t('modal.location')}:</span> <strong style="color: #1e293b;">${d.location || '-'}</strong></div>
            </div>
            ${extra.remoteWork ? `<div style="margin-top: 8px;"><span style="color: #64748b; font-size: 13px;">${t('modal.mode')}:</span> <strong style="color: #0d9488; font-size: 13px;">${remoteLabels[extra.remoteWork] || extra.remoteWork}</strong></div>` : ''}
            ${extra.companySize ? `<div style="margin-top: 8px;"><span style="color: #64748b; font-size: 13px;">${t('modal.size')}:</span> <strong style="color: #1e293b; font-size: 13px;">${extra.companySize.toLocaleString()} ${t('modal.collaborators')}</strong></div>` : ''}
            ${extra.isAgency ? `<div role="status" style="margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 4px; font-size: 12px; color: #92400e; font-weight: 500;">${t('modal.recruitmentAgency')}</div>` : ''}
            ${d.salary ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
                <span style="color: #64748b; font-size: 13px;">${t('modal.salary')}:</span>
                <strong style="color: #1e293b; font-size: 13px;">${Math.round(d.salary.min/1000)}k - ${Math.round(d.salary.max/1000)}k€/an</strong>
                ${s.market.expected ? `<span style="color: #64748b; font-size: 12px;"> (${t('modal.expected')}: ${Math.round(s.market.expected.min/1000)}k-${Math.round(s.market.expected.max/1000)}k€)</span>` : ''}
              </div>
            ` : `<div role="alert" style="margin-top: 10px; padding: 6px 10px; background: #fef2f2; border-radius: 4px; font-size: 12px; color: #dc2626; font-weight: 500;">${t('modal.salaryNotProvided')}</div>`}
          </section>

          <section aria-label="${t('modal.criteriaScores')}" style="margin-bottom: 18px;">
            <h3 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 12px 0;">${t('modal.criteriaScores')}</h3>
            ${[
              { name: t('modal.legitimacy'), score: s.legitimacy.score, desc: t('modal.authenticity') },
              { name: t('modal.market'), score: s.market.score, desc: t('modal.salaryVsMarket') },
              { name: t('modal.quality'), score: s.quality.score, desc: t('modal.writing') },
              { name: t('modal.profile'), score: s.profile.score, desc: t('modal.diplomaExp') },
              { name: t('modal.coherence'), score: s.coherence.score, desc: t('modal.logic') }
            ].map(item => {
              const col = item.score >= 70 ? '#16a34a' : item.score >= 50 ? '#ca8a04' : '#dc2626';
              return `
                <div style="margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px;">
                    <span style="color: #334155;">${item.name} <span style="color: #64748b;">(${item.desc})</span></span>
                    <span style="color: ${col}; font-weight: 600;">${item.score}%</span>
                  </div>
                  <div style="height: 6px; background: #e2e8f0; border-radius: 3px;" role="meter" aria-valuenow="${item.score}" aria-valuemin="0" aria-valuemax="100" aria-label="${item.name}">
                    <div style="width: ${item.score}%; height: 100%; background: ${col}; border-radius: 3px; transition: width 0.3s ease;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </section>

          ${s.market.details.length > 0 ? `
            <section aria-label="${t('modal.salaryAnalysis')}" style="margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 8px 0;">${t('modal.salaryAnalysis')}</h4>
              <ul style="font-size: 13px; color: #64748b; margin: 0; padding-left: 18px; line-height: 1.6;">${s.market.details.map(det => `<li>${det}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.greenFlags.length > 0 ? `
            <section aria-label="${t('modal.positivePoints')}" style="background: #f0fdf4; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #166534; margin: 0 0 8px 0;">${t('modal.positivePoints')} (${result.signals.greenFlags.length})</h4>
              <div style="font-size: 13px; color: #15803d; line-height: 1.6;">
                ${result.signals.greenFlags.slice(0, 6).map(f => `<span style="display: inline-block; background: #dcfce7; padding: 4px 8px; border-radius: 4px; margin: 3px 6px 3px 0;">${f.label}</span>`).join('')}
              </div>
            </section>
          ` : ''}

          ${result.signals.redFlags.length > 0 ? `
            <section aria-label="${t('modal.alerts')}" role="alert" style="background: #fef2f2; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #991b1b; margin: 0 0 8px 0;">${t('modal.alerts')} (${result.signals.redFlags.length})</h4>
              <ul style="font-size: 13px; color: #dc2626; margin: 0; padding-left: 18px; line-height: 1.6;">${result.signals.redFlags.slice(0, 5).map(f => `<li>${f.label}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.warnings.length > 0 ? `
            <section aria-label="${t('modal.attentionPoints')}" style="background: #fffbeb; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 8px 0;">${t('modal.attentionPoints')}</h4>
              <ul style="font-size: 13px; color: #b45309; margin: 0; padding-left: 18px; line-height: 1.6;">${result.signals.warnings.slice(0, 4).map(w => `<li>${w}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.recommendations.length > 0 ? `
            <section aria-label="${t('modal.recommendations')}" style="background: #eff6ff; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #1e40af; margin: 0 0 8px 0;">${t('modal.recommendations')}</h4>
              <ul style="font-size: 13px; color: #2563eb; margin: 0; padding-left: 18px; line-height: 1.6;">${result.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${careerData.debouches && careerData.debouches.length > 0 ? `
            <section aria-label="${t('modal.careerEvolutions')}" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #a7f3d0;">
              <h4 style="font-size: 13px; font-weight: 600; color: #059669; margin: 0 0 10px 0;">
                ${t('modal.careerEvolutions')}
              </h4>
              <ul style="list-style: none; margin: 0; padding: 0; font-size: 13px; color: #047857;">
                ${careerData.debouches.map(deb => `
                  <li style="margin-bottom: 8px; padding-left: 14px; border-left: 3px solid #10b981;">
                    <strong style="display: block; color: #065f46;">${deb.title}</strong>
                    <span style="font-size: 12px; color: #059669;">${deb.years} • ${deb.desc}</span>
                  </li>
                `).join('')}
              </ul>
            </section>
          ` : ''}

          ${careerData.reconversion && careerData.reconversion.length > 0 ? `
            <section aria-label="${t('modal.reconversionPaths')}" style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #c4b5fd;">
              <h4 style="font-size: 13px; font-weight: 600; color: #7c3aed; margin: 0 0 10px 0;">
                ${t('modal.reconversionPaths')}
              </h4>
              <ul style="list-style: none; margin: 0; padding: 0; font-size: 13px; color: #6d28d9;">
                ${careerData.reconversion.map(r => `
                  <li style="margin-bottom: 8px; padding-left: 14px; border-left: 3px solid #8b5cf6;">
                    <strong style="display: block; color: #5b21b6;">${r.title}</strong>
                    <span style="font-size: 12px; color: #7c3aed;">${r.desc}</span>
                  </li>
                `).join('')}
              </ul>
            </section>
          ` : ''}

          <div id="fjd-salary-analysis-container"></div>
          ${d.salary && SalaryAnalyzer ? `
            <button id="fjd-salary-toggle" class="fjd-salary-toggle" aria-expanded="false" style="
              margin-top: 14px; width: 100%; padding: 12px 18px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white; border: none; border-radius: 8px;
              font-size: 14px; font-weight: 600; cursor: pointer;
              transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
            ">
              ${t('modal.viewSalaryAnalysis')}
            </button>
          ` : ''}
        </main>
      `;

      document.body.appendChild(panel);
      const closeBtn = panel.querySelector('.fjd-close');
      closeBtn.onclick = () => this.closePanel();
      closeBtn.onmouseenter = () => { closeBtn.style.background = '#f1f5f9'; };
      closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; };
      closeBtn.focus();
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closePanel(); }, { once: true });

      // Handler pour le toggle de l'analyse salariale
      const salaryToggle = panel.querySelector('#fjd-salary-toggle');
      if (salaryToggle && SalaryAnalyzer && d.salary) {
        salaryToggle.onmouseenter = () => { salaryToggle.style.transform = 'translateY(-1px)'; salaryToggle.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'; };
        salaryToggle.onmouseleave = () => { salaryToggle.style.transform = 'translateY(0)'; salaryToggle.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'; };
        salaryToggle.onclick = () => {
          const container = panel.querySelector('#fjd-salary-analysis-container');
          if (container.innerHTML) {
            container.innerHTML = '';
            salaryToggle.textContent = t('modal.viewSalaryAnalysis');
          } else {
            const avgSalary = Math.round((d.salary.min + d.salary.max) / 2);
            const analysis = SalaryAnalyzer.analyze({
              offeredSalary: avgSalary,
              experienceYears: extra.experience || d.experience || 3,
              sector: extra.sector || 'default',
              location: (d.location || '').toLowerCase().includes('paris') ? 'paris' : 'province',
              isCadre: true
            });
            container.innerHTML = SalaryAnalyzer.generateHTML(analysis);
            salaryToggle.textContent = t('modal.hideSalaryAnalysis');
          }
        };
      }
    },

    closePanel() {
      document.querySelectorAll('.fjd-panel, .fjd-overlay').forEach(el => el.remove());
    }
  };

  // ============================================================================
  // MARQUEURS VISUELS DE FLAGS
  // ============================================================================

  function addFlagMarkers(card, result) {
    // Supprimer les anciens marqueurs
    card.querySelectorAll('.fjd-flag-marker').forEach(el => el.remove());

    const container = document.createElement('div');
    container.className = 'fjd-flag-marker';
    container.style.cssText = `
      display: flex; flex-wrap: wrap; gap: 4px;
      position: absolute; bottom: 8px; left: 8px; right: 70px;
      pointer-events: none; z-index: 50;
    `;

    // Red Flags (max 3)
    const redFlags = result.signals?.redFlags || [];
    redFlags.slice(0, 3).forEach(flag => {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;
      `;
      marker.textContent = `⚠ ${flag.label}`;
      marker.title = flag.label;
      container.appendChild(marker);
    });

    // Green Flags (max 2, seulement si pas de red flags)
    if (redFlags.length === 0) {
      const greenFlags = result.signals?.greenFlags || [];
      greenFlags.slice(0, 2).forEach(flag => {
        const marker = document.createElement('span');
        marker.style.cssText = `
          display: inline-flex; align-items: center; gap: 2px;
          padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
          background: #dcfce7; color: #16a34a; border: 1px solid #86efac;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;
        `;
        marker.textContent = `✓ ${flag.label}`;
        marker.title = flag.label;
        container.appendChild(marker);
      });
    }

    // Marqueurs spéciaux
    if (result.repostedCheck?.isReposted) {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fed7aa; color: #c2410c; border: 1px solid #fb923c;
      `;
      marker.textContent = `🔄 ${t('modal.reposted')}`;
      container.appendChild(marker);
    }

    if (result.entryLevelCheck?.isIncoherent) {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fef3c7; color: #b45309; border: 1px solid #fcd34d;
      `;
      marker.textContent = `⚡ ${t('modal.incoherent')}`;
      marker.title = result.entryLevelCheck.issues[0]?.label || t('modal.incoherenceDetected');
      container.appendChild(marker);
    }

    // Marqueur pour problèmes d'expérience
    if (result.experienceAnalysis?.isProblematic) {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fce7f3; color: #be185d; border: 1px solid #f9a8d4;
      `;
      marker.textContent = '📊 Exp. suspecte';
      marker.title = result.experienceAnalysis.issues[0]?.label || 'Expérience demandée incohérente';
      container.appendChild(marker);
    }

    // Marqueur pour offre saturée (+80 candidats)
    if (result.platform?.applicantPenalty?.isBadOffer) {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5;
      `;
      const count = result.platform?.applicantCount || '80+';
      marker.textContent = `👥 ${count} candidats`;
      marker.title = result.platform.applicantPenalty.label || 'Offre saturée';
      container.appendChild(marker);
    }

    if (container.children.length > 0) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(container);
    }
  }

  // ============================================================================
  // EXTRACTION ET ANALYSE
  // ============================================================================

  function extractJobData(card) {
    const getText = (sel) => {
      for (const s of sel.split(', ')) {
        const el = card.querySelector(s);
        if (el && el.textContent.trim()) return el.textContent.trim();
      }
      return '';
    };

    const fullText = card.textContent || '';

    // Extraction des données structurées LinkedIn
    const salary = LinkedInParser.extractSalary(fullText);
    const diploma = LinkedInParser.extractDiploma(fullText);
    const experience = LinkedInParser.extractExperience(fullText);
    const contractType = LinkedInParser.extractContractType(fullText);
    const remoteWork = LinkedInParser.extractRemoteWork(fullText);
    const isAgency = LinkedInParser.isRecruitmentAgency(fullText);
    const sector = LinkedInParser.extractSector(fullText);
    const companySize = LinkedInParser.extractCompanySize(fullText);

    let enrichedText = fullText;
    if (salary) {
      enrichedText += ` salaire ${salary.min} à ${salary.max} € `;
    }

    return {
      title: getText(SELECTORS.jobTitle),
      company: getText(SELECTORS.company),
      location: getText(SELECTORS.location),
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: enrichedText,
      linkedinData: {
        salary, diploma, experience, contractType, remoteWork, isAgency, sector, companySize,
        isReposted: LinkedInParser.isReposted(fullText),
        postedDaysAgo: LinkedInParser.extractPostedDaysAgo(fullText)
      }
    };
  }

  function analyzeCard(card) {
    if (processedElements.has(card) || card.querySelector('.fjd-badge')) return;
    if (card.offsetHeight < 40) return;
    if (card.closest('[data-fjd-processed]')) return;

    processedElements.add(card);
    card.setAttribute('data-fjd-processed', 'true');

    const jobData = extractJobData(card);
    if (!jobData.title || jobData.title.length < 3) return;

    const result = Analyzer.evaluate(jobData, {
      platform: 'linkedin',
      applicantCount: null,
      isReposted: jobData.linkedinData.isReposted,
      postedDaysAgo: jobData.linkedinData.postedDaysAgo
    });
    result.linkedinData = jobData.linkedinData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    const badge = UI.createBadge(result);

    // Ajouter marqueurs visuels de flags
    addFlagMarkers(card, result);
    badge.style.position = 'absolute';
    badge.style.top = '8px';
    badge.style.right = '8px';

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(badge);
    StatsTracker.track(result.pertinenceScore);

    if (result.pertinenceScore <= 25) {
      card.style.borderLeft = '4px solid #dc2626';
    } else if (result.pertinenceScore <= 45) {
      card.style.borderLeft = '4px solid #ea580c';
    } else if (result.pertinenceScore >= 75) {
      card.style.borderLeft = '4px solid #16a34a';
    }

    console.log(`[FJD] LinkedIn: "${jobData.title.substring(0, 40)}..." - ${result.pertinenceScore}%`, {
      salary: jobData.linkedinData.salary,
      diploma: jobData.linkedinData.diploma,
      exp: jobData.linkedinData.experience
    });
  }

  function analyzeDetail() {
    const container = document.querySelector(SELECTORS.detailContainer);
    if (!container || container.hasAttribute('data-fjd')) return;
    container.setAttribute('data-fjd', 'true');

    const pageText = document.body.textContent || '';
    const salary = LinkedInParser.extractSalary(pageText);
    const diploma = LinkedInParser.extractDiploma(pageText);
    const experience = LinkedInParser.extractExperience(pageText);
    const contractType = LinkedInParser.extractContractType(pageText);
    const remoteWork = LinkedInParser.extractRemoteWork(pageText);
    const isAgency = LinkedInParser.isRecruitmentAgency(pageText);
    const companySize = LinkedInParser.extractCompanySize(pageText);
    const applicantCount = LinkedInParser.extractApplicantCount(pageText);
    const isReposted = LinkedInParser.isReposted(pageText);
    const postedDaysAgo = LinkedInParser.extractPostedDaysAgo(pageText);

    const jobData = {
      title: document.querySelector(SELECTORS.detailTitle)?.textContent?.trim() || '',
      company: document.querySelector(SELECTORS.detailCompany)?.textContent?.trim() || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: container.textContent || '',
      linkedinData: { salary, diploma, experience, contractType, remoteWork, isAgency, companySize, applicantCount, isReposted, postedDaysAgo }
    };

    if (!jobData.title && !jobData.description) return;

    const result = Analyzer.evaluate(jobData, {
      platform: 'linkedin',
      applicantCount: applicantCount,
      isReposted: isReposted,
      postedDaysAgo: postedDaysAgo
    });
    result.linkedinData = jobData.linkedinData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    // Stocker l'analyse pour le popup
    lastAnalysis = {
      score: result.pertinenceScore,
      status: result.status,
      redFlags: result.signals?.redFlags || [],
      greenFlags: result.signals?.greenFlags || [],
      jobTitle: jobData.title,
      company: jobData.company
    };

    const badge = UI.createBadge(result);
    badge.style.marginBottom = '12px';

    container.insertBefore(badge, container.firstChild);
    StatsTracker.track(result.pertinenceScore);
  }

  function findJobCards() {
    let cards = document.querySelectorAll(SELECTORS.jobCards);

    if (cards.length === 0) {
      // Stratégie alternative pour LinkedIn
      const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"], a[href*="/jobs/collections/"]');
      const cardSet = new Set();
      jobLinks.forEach(link => {
        let parent = link.closest('li') || link.closest('[data-job-id]') || link.closest('.job-card-container');
        if (parent && parent.offsetHeight > 50) cardSet.add(parent);
      });
      cards = Array.from(cardSet);
    }

    return cards;
  }

  function analyzePage() {
    const cards = findJobCards();

    if (cards.length === 0 && retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(analyzePage, 500);
      return;
    }

    console.log(`[FJD] LinkedIn: ${cards.length} cartes trouvées`);
    cards.forEach(analyzeCard);
    analyzeDetail();
    retryCount = 0;
  }

  // Analyse rapide des cartes visibles dans le viewport
  function analyzeVisibleCards() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const cards = findJobCards();
      cards.forEach(card => {
        // Vérifier si la carte est visible dans le viewport
        const rect = card.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight + 200 && rect.bottom > -200;
        if (isVisible) analyzeCard(card);
      });
    });
  }

  function init() {
    console.log('[FJD] LinkedIn analyzer v3.1 initialisé (scroll rapide)');

    // Analyse initiale rapide
    setTimeout(analyzePage, 300);

    // MutationObserver avec debounce court
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(analyzePage, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Scroll listener avec debounce très court pour réactivité
    const scrollContainers = [
      document.querySelector('.jobs-search-results-list'),
      document.querySelector('.scaffold-layout__list'),
      document.querySelector('.jobs-search-two-pane__wrapper'),
      window
    ].filter(Boolean);

    scrollContainers.forEach(container => {
      container.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(analyzeVisibleCards, 50);
      }, { passive: true });
    });

    // Fallback: écouter le scroll global
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(analyzeVisibleCards, 50);
    }, { passive: true });

    // Détection changement d'URL
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        retryCount = 0;
        processedElements = new WeakSet();
        document.querySelectorAll('[data-fjd-processed], [data-fjd]').forEach(el => {
          el.removeAttribute('data-fjd-processed');
          el.removeAttribute('data-fjd');
        });
        document.querySelectorAll('.fjd-badge').forEach(el => el.remove());
        setTimeout(analyzePage, 300);
      }
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();