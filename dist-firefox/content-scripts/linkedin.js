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
    }
  };

  // ============================================================================
  // UI - Safe DOM manipulation (no innerHTML)
  // ============================================================================

  const DOM = window.FJD_DOM;

  const UI = {
    createBadge(result) {
      const cls = result.classification;
      const badge = document.createElement('div');
      badge.className = 'fjd-badge';
      badge.style.cssText = `
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 10px; border-radius: 16px; cursor: pointer;
        font-size: 11px; font-weight: 600; font-family: system-ui, sans-serif;
        background: ${cls.bgColor}; color: ${cls.color};
        border: 1px solid ${cls.color}40;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: all 0.2s ease; z-index: 100;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = cls.label;

      const scoreSpan = document.createElement('span');
      scoreSpan.style.cssText = `background: ${cls.color}25; padding: 2px 5px; border-radius: 8px; font-weight: 700;`;
      scoreSpan.textContent = result.pertinenceScore + '%';

      badge.appendChild(labelSpan);
      badge.appendChild(scoreSpan);
      badge.title = 'Cliquez pour les détails';
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
        'cap_bep': 'CAP/BEP', 'bac': 'Bac', 'bac2': 'Bac+2',
        'bac3': 'Bac+3', 'bac5': 'Bac+5', 'bac8': 'Doctorat'
      };

      const remoteLabels = {
        'complet': 'Télétravail complet',
        'partiel': 'Hybride',
        'occasionnel': 'Télétravail occasionnel',
        'possible': 'Télétravail possible',
        'presentiel': 'Sur site'
      };

      const CareerPathways = window.FJD_CareerPathways;
      const careerData = CareerPathways ? CareerPathways.analyze(result.jobTitle || '') : { debouches: [], reconversion: [] };

      // Build header
      const header = document.createElement('header');
      header.style.cssText = `background: linear-gradient(135deg, ${cls.bgColor} 0%, ${cls.color}15 100%); padding: 18px 20px; border-bottom: 1px solid ${cls.color}30; flex-shrink: 0; border-radius: 12px 12px 0 0;`;

      const headerRow = DOM.div('display: flex; justify-content: space-between; align-items: center;');

      const scoreDiv = document.createElement('div');
      const scoreTitle = document.createElement('div');
      scoreTitle.id = 'fjd-panel-title';
      scoreTitle.style.cssText = `font-size: 28px; font-weight: 700; color: ${cls.color};`;
      scoreTitle.setAttribute('role', 'status');
      scoreTitle.setAttribute('aria-live', 'polite');
      scoreTitle.textContent = result.pertinenceScore + '%';

      const scoreLabel = document.createElement('div');
      scoreLabel.style.cssText = `font-size: 14px; color: ${cls.color}; font-weight: 500;`;
      scoreLabel.textContent = cls.label;

      scoreDiv.appendChild(scoreTitle);
      scoreDiv.appendChild(scoreLabel);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'fjd-close';
      closeBtn.setAttribute('aria-label', 'Fermer le panneau');
      closeBtn.style.cssText = 'background: none; border: none; font-size: 26px; cursor: pointer; color: #475569; padding: 8px; border-radius: 6px; transition: background 0.2s;';
      closeBtn.textContent = '\u00D7';

      headerRow.appendChild(scoreDiv);
      headerRow.appendChild(closeBtn);
      header.appendChild(headerRow);

      if (result.jobTitle) {
        const jobInfo = document.createElement('div');
        jobInfo.style.cssText = `margin-top: 14px; padding-top: 14px; border-top: 1px solid ${cls.color}25;`;

        const jobTitle = document.createElement('h2');
        jobTitle.style.cssText = 'font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; line-height: 1.4;';
        jobTitle.textContent = result.jobTitle;
        jobInfo.appendChild(jobTitle);

        if (result.company) {
          const companyP = document.createElement('p');
          companyP.style.cssText = 'font-size: 13px; color: #64748b; margin: 4px 0 0 0;';
          companyP.textContent = result.company;
          jobInfo.appendChild(companyP);
        }
        header.appendChild(jobInfo);
      }

      panel.appendChild(header);

      // Build main content
      const main = document.createElement('main');
      main.style.cssText = 'padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0;';

      // Profile section
      const profileSection = document.createElement('section');
      profileSection.setAttribute('aria-label', 'Analyse du profil');
      profileSection.style.cssText = 'background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 18px;';

      const profileHeader = document.createElement('h3');
      profileHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 10px 0;';
      profileHeader.textContent = 'Analyse du profil';
      profileSection.appendChild(profileHeader);

      const profileGrid = DOM.div('display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;');
      profileGrid.appendChild(DOM.keyValue('Diplôme', d.diploma ? diplomaLabels[d.diploma] : 'Non précisé'));
      profileGrid.appendChild(DOM.keyValue('Expérience', d.experience !== null ? d.experience + ' an' + (d.experience > 1 ? 's' : '') : 'Non précisé'));
      profileGrid.appendChild(DOM.keyValue('Contrat', extra.contractType || '-'));
      profileGrid.appendChild(DOM.keyValue('Localisation', d.location || '-'));
      profileSection.appendChild(profileGrid);

      if (extra.remoteWork) {
        const remoteDiv = document.createElement('div');
        remoteDiv.style.cssText = 'margin-top: 8px;';
        const remoteLabel = DOM.span('Mode: ', 'color: #64748b; font-size: 13px;');
        const remoteValue = document.createElement('strong');
        remoteValue.style.cssText = 'color: #0d9488; font-size: 13px;';
        remoteValue.textContent = remoteLabels[extra.remoteWork] || extra.remoteWork;
        remoteDiv.appendChild(remoteLabel);
        remoteDiv.appendChild(remoteValue);
        profileSection.appendChild(remoteDiv);
      }

      if (extra.companySize) {
        const sizeDiv = document.createElement('div');
        sizeDiv.style.cssText = 'margin-top: 8px;';
        const sizeLabel = DOM.span('Taille: ', 'color: #64748b; font-size: 13px;');
        const sizeValue = document.createElement('strong');
        sizeValue.style.cssText = 'color: #1e293b; font-size: 13px;';
        sizeValue.textContent = extra.companySize.toLocaleString() + ' collaborateurs';
        sizeDiv.appendChild(sizeLabel);
        sizeDiv.appendChild(sizeValue);
        profileSection.appendChild(sizeDiv);
      }

      if (extra.isAgency) {
        const agencyDiv = document.createElement('div');
        agencyDiv.setAttribute('role', 'status');
        agencyDiv.style.cssText = 'margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 4px; font-size: 12px; color: #92400e; font-weight: 500;';
        agencyDiv.textContent = 'Cabinet de recrutement';
        profileSection.appendChild(agencyDiv);
      }

      if (d.salary) {
        const salaryDiv = document.createElement('div');
        salaryDiv.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0;';
        const salaryLabel = DOM.span('Salaire: ', 'color: #64748b; font-size: 13px;');
        const salaryValue = document.createElement('strong');
        salaryValue.style.cssText = 'color: #1e293b; font-size: 13px;';
        salaryValue.textContent = Math.round(d.salary.min/1000) + 'k - ' + Math.round(d.salary.max/1000) + 'k€/an';
        salaryDiv.appendChild(salaryLabel);
        salaryDiv.appendChild(salaryValue);
        if (s.market.expected) {
          const expectedSpan = DOM.span(' (attendu: ' + Math.round(s.market.expected.min/1000) + 'k-' + Math.round(s.market.expected.max/1000) + 'k€)', 'color: #64748b; font-size: 12px;');
          salaryDiv.appendChild(expectedSpan);
        }
        profileSection.appendChild(salaryDiv);
      } else {
        const noSalaryDiv = document.createElement('div');
        noSalaryDiv.setAttribute('role', 'alert');
        noSalaryDiv.style.cssText = 'margin-top: 10px; padding: 6px 10px; background: #fef2f2; border-radius: 4px; font-size: 12px; color: #dc2626; font-weight: 500;';
        noSalaryDiv.textContent = 'Salaire non communiqué';
        profileSection.appendChild(noSalaryDiv);
      }

      main.appendChild(profileSection);

      // Scores section
      const scoresSection = document.createElement('section');
      scoresSection.setAttribute('aria-label', 'Scores par critère');
      scoresSection.style.cssText = 'margin-bottom: 18px;';

      const scoresHeader = document.createElement('h3');
      scoresHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 12px 0;';
      scoresHeader.textContent = 'Scores par critère';
      scoresSection.appendChild(scoresHeader);

      const scoreItems = [
        { name: 'Légitimité', score: s.legitimacy.score, desc: 'Authenticité' },
        { name: 'Marché', score: s.market.score, desc: 'Salaire vs marché' },
        { name: 'Qualité', score: s.quality.score, desc: 'Rédaction' },
        { name: 'Profil', score: s.profile.score, desc: 'Diplôme/exp' },
        { name: 'Cohérence', score: s.coherence.score, desc: 'Logique' }
      ];

      scoreItems.forEach(item => {
        const col = item.score >= 70 ? '#16a34a' : item.score >= 50 ? '#ca8a04' : '#dc2626';
        const labelText = item.name + ' (' + item.desc + ')';
        scoresSection.appendChild(DOM.progressBar(item.score, col, labelText));
      });

      main.appendChild(scoresSection);

      // Market details
      if (s.market.details.length > 0) {
        const marketSection = document.createElement('section');
        marketSection.setAttribute('aria-label', 'Analyse salariale');
        marketSection.style.cssText = 'margin-bottom: 14px;';
        const marketHeader = document.createElement('h4');
        marketHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 8px 0;';
        marketHeader.textContent = 'Analyse salariale';
        marketSection.appendChild(marketHeader);
        marketSection.appendChild(DOM.ul(s.market.details, 'font-size: 13px; color: #64748b; margin: 0; padding-left: 18px; line-height: 1.6;'));
        main.appendChild(marketSection);
      }

      // Green flags
      if (result.signals.greenFlags.length > 0) {
        const greenSection = document.createElement('section');
        greenSection.setAttribute('aria-label', 'Points positifs');
        greenSection.style.cssText = 'background: #f0fdf4; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;';
        const greenHeader = document.createElement('h4');
        greenHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #166534; margin: 0 0 8px 0;';
        greenHeader.textContent = 'Points positifs (' + result.signals.greenFlags.length + ')';
        greenSection.appendChild(greenHeader);
        const greenTags = DOM.div('font-size: 13px; color: #15803d; line-height: 1.6;');
        result.signals.greenFlags.slice(0, 6).forEach(f => {
          greenTags.appendChild(DOM.tag(f.label, '#dcfce7', '#15803d'));
        });
        greenSection.appendChild(greenTags);
        main.appendChild(greenSection);
      }

      // Red flags
      if (result.signals.redFlags.length > 0) {
        const redSection = document.createElement('section');
        redSection.setAttribute('aria-label', 'Alertes');
        redSection.setAttribute('role', 'alert');
        redSection.style.cssText = 'background: #fef2f2; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;';
        const redHeader = document.createElement('h4');
        redHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #991b1b; margin: 0 0 8px 0;';
        redHeader.textContent = 'Alertes (' + result.signals.redFlags.length + ')';
        redSection.appendChild(redHeader);
        redSection.appendChild(DOM.ul(result.signals.redFlags.slice(0, 5).map(f => f.label), 'font-size: 13px; color: #dc2626; margin: 0; padding-left: 18px; line-height: 1.6;'));
        main.appendChild(redSection);
      }

      // Warnings
      if (result.signals.warnings.length > 0) {
        const warnSection = document.createElement('section');
        warnSection.setAttribute('aria-label', "Points d'attention");
        warnSection.style.cssText = 'background: #fffbeb; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;';
        const warnHeader = document.createElement('h4');
        warnHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 8px 0;';
        warnHeader.textContent = "Points d'attention";
        warnSection.appendChild(warnHeader);
        warnSection.appendChild(DOM.ul(result.signals.warnings.slice(0, 4), 'font-size: 13px; color: #b45309; margin: 0; padding-left: 18px; line-height: 1.6;'));
        main.appendChild(warnSection);
      }

      // Recommendations
      if (result.recommendations.length > 0) {
        const recoSection = document.createElement('section');
        recoSection.setAttribute('aria-label', 'Recommandations');
        recoSection.style.cssText = 'background: #eff6ff; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;';
        const recoHeader = document.createElement('h4');
        recoHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #1e40af; margin: 0 0 8px 0;';
        recoHeader.textContent = 'Recommandations';
        recoSection.appendChild(recoHeader);
        recoSection.appendChild(DOM.ul(result.recommendations, 'font-size: 13px; color: #2563eb; margin: 0; padding-left: 18px; line-height: 1.6;'));
        main.appendChild(recoSection);
      }

      // Career pathways - Debouches
      if (careerData.debouches && careerData.debouches.length > 0) {
        const careerSection = document.createElement('section');
        careerSection.setAttribute('aria-label', 'Évolutions de carrière');
        careerSection.style.cssText = 'background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #a7f3d0;';
        const careerHeader = document.createElement('h4');
        careerHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #059669; margin: 0 0 10px 0;';
        careerHeader.textContent = 'Évolutions de carrière possibles';
        careerSection.appendChild(careerHeader);

        const careerList = document.createElement('ul');
        careerList.style.cssText = 'list-style: none; margin: 0; padding: 0; font-size: 13px; color: #047857;';
        careerData.debouches.forEach(deb => {
          const li = document.createElement('li');
          li.style.cssText = 'margin-bottom: 8px; padding-left: 14px; border-left: 3px solid #10b981;';
          const title = document.createElement('strong');
          title.style.cssText = 'display: block; color: #065f46;';
          title.textContent = deb.title;
          const desc = document.createElement('span');
          desc.style.cssText = 'font-size: 12px; color: #059669;';
          desc.textContent = deb.years + ' \u2022 ' + deb.desc;
          li.appendChild(title);
          li.appendChild(desc);
          careerList.appendChild(li);
        });
        careerSection.appendChild(careerList);
        main.appendChild(careerSection);
      }

      // Career pathways - Reconversion
      if (careerData.reconversion && careerData.reconversion.length > 0) {
        const reconSection = document.createElement('section');
        reconSection.setAttribute('aria-label', 'Pistes de reconversion');
        reconSection.style.cssText = 'background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #c4b5fd;';
        const reconHeader = document.createElement('h4');
        reconHeader.style.cssText = 'font-size: 13px; font-weight: 600; color: #7c3aed; margin: 0 0 10px 0;';
        reconHeader.textContent = 'Pistes de reconversion';
        reconSection.appendChild(reconHeader);

        const reconList = document.createElement('ul');
        reconList.style.cssText = 'list-style: none; margin: 0; padding: 0; font-size: 13px; color: #6d28d9;';
        careerData.reconversion.forEach(r => {
          const li = document.createElement('li');
          li.style.cssText = 'margin-bottom: 8px; padding-left: 14px; border-left: 3px solid #8b5cf6;';
          const title = document.createElement('strong');
          title.style.cssText = 'display: block; color: #5b21b6;';
          title.textContent = r.title;
          const desc = document.createElement('span');
          desc.style.cssText = 'font-size: 12px; color: #7c3aed;';
          desc.textContent = r.desc;
          li.appendChild(title);
          li.appendChild(desc);
          reconList.appendChild(li);
        });
        reconSection.appendChild(reconList);
        main.appendChild(reconSection);
      }

      // Salary analysis container
      const salaryContainer = document.createElement('div');
      salaryContainer.id = 'fjd-salary-analysis-container';
      main.appendChild(salaryContainer);

      // Salary toggle button
      if (d.salary && SalaryAnalyzer) {
        const salaryToggle = document.createElement('button');
        salaryToggle.id = 'fjd-salary-toggle';
        salaryToggle.className = 'fjd-salary-toggle';
        salaryToggle.setAttribute('aria-expanded', 'false');
        salaryToggle.style.cssText = `
          margin-top: 14px; width: 100%; padding: 12px 18px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; border: none; border-radius: 8px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        `;
        salaryToggle.textContent = "Voir l'analyse salariale complète";

        salaryToggle.onmouseenter = () => { salaryToggle.style.transform = 'translateY(-1px)'; salaryToggle.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'; };
        salaryToggle.onmouseleave = () => { salaryToggle.style.transform = 'translateY(0)'; salaryToggle.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)'; };

        salaryToggle.onclick = () => {
          if (salaryContainer.hasChildNodes()) {
            while (salaryContainer.firstChild) {
              salaryContainer.removeChild(salaryContainer.firstChild);
            }
            salaryToggle.textContent = "Voir l'analyse salariale complète";
          } else {
            const avgSalary = Math.round((d.salary.min + d.salary.max) / 2);
            const analysis = SalaryAnalyzer.analyze({
              offeredSalary: avgSalary,
              experienceYears: extra.experience || d.experience || 3,
              sector: extra.sector || 'default',
              location: (d.location || '').toLowerCase().includes('paris') ? 'paris' : 'province',
              isCadre: true
            });
            if (SalaryAnalyzer.generateDOM) {
              salaryContainer.appendChild(SalaryAnalyzer.generateDOM(analysis));
            } else {
              const salaryText = document.createElement('div');
              salaryText.style.cssText = 'padding: 12px; background: #f8fafc; border-radius: 8px; margin-top: 12px;';
              salaryText.textContent = 'Analyse salariale: ' + (analysis.verdict || 'Non disponible');
              salaryContainer.appendChild(salaryText);
            }
            salaryToggle.textContent = "Masquer l'analyse salariale";
          }
        };

        main.appendChild(salaryToggle);
      }

      panel.appendChild(main);
      document.body.appendChild(panel);

      closeBtn.onclick = () => this.closePanel();
      closeBtn.onmouseenter = () => { closeBtn.style.background = '#f1f5f9'; };
      closeBtn.onmouseleave = () => { closeBtn.style.background = 'none'; };
      closeBtn.focus();
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closePanel(); }, { once: true });
    },

    closePanel() {
      document.querySelectorAll('.fjd-panel, .fjd-overlay').forEach(el => el.remove());
    }
  };

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
      linkedinData: { salary, diploma, experience, contractType, remoteWork, isAgency, sector, companySize }
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

    const result = Analyzer.evaluate(jobData, {});
    result.linkedinData = jobData.linkedinData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    const badge = UI.createBadge(result);
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

    const jobData = {
      title: document.querySelector(SELECTORS.detailTitle)?.textContent?.trim() || '',
      company: document.querySelector(SELECTORS.detailCompany)?.textContent?.trim() || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: container.textContent || '',
      linkedinData: { salary, diploma, experience, contractType, remoteWork, isAgency, companySize }
    };

    if (!jobData.title && !jobData.description) return;

    const result = Analyzer.evaluate(jobData, {});
    result.linkedinData = jobData.linkedinData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

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