/**
 * Fake Job Detector - HelloWork v3.0
 * Détection améliorée avec extraction structurée des données HelloWork
 */

(function() {
  'use strict';

  console.log('[FJD] HelloWork content script chargé');

  if (!window.FJD_PertinenceAnalyzer) {
    console.error('[FJD] Analyseur de pertinence non disponible');
    return;
  }

  const Analyzer = window.FJD_PertinenceAnalyzer;
  const SalaryAnalyzer = window.FJD_SalaryMarketAnalyzer;

  // Sélecteurs spécifiques HelloWork
  const SELECTORS = {
    // Cartes d'offres - sélecteurs multiples pour robustesse
    jobCards: [
      '[data-cy="searchResultCard"]',
      '[data-testid="searchResultCard"]',
      'article[class*="Card"]',
      'div[class*="searchResult"]',
      'a[href*="/fr-fr/emploi/"]',
      'a[href*="/emplois/"]',
      '.tw-relative.tw-flex',
      'li[class*="result"]'
    ].join(', '),

    // Titre du poste
    jobTitle: [
      '[data-cy="jobTitle"]',
      '[data-testid="jobTitle"]',
      'h2[class*="title"]',
      'h3[class*="title"]',
      'a[class*="title"]',
      '.job-title',
      'h2',
      'h3'
    ].join(', '),

    // Entreprise
    company: [
      '[data-cy="companyName"]',
      '[data-testid="companyName"]',
      '[class*="company"]',
      '.employer-name',
      'span[class*="Company"]'
    ].join(', '),

    // Localisation
    location: [
      '[data-cy="location"]',
      '[data-testid="location"]',
      '[class*="location"]',
      '[class*="city"]'
    ].join(', '),

    // Page détail
    detailContainer: [
      '[data-cy="jobDescription"]',
      '[data-testid="jobDescription"]',
      '#job-description',
      '.job-description',
      'article[class*="description"]',
      '[class*="Description"]',
      'main article'
    ].join(', '),

    detailTitle: 'h1'
  };

  let observer = null;
  let lastUrl = window.location.href;
  let debounceTimer = null;
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
  // EXTRACTION DE DONNÉES SPÉCIFIQUE HELLOWORK
  // ============================================================================

  const HelloWorkParser = {
    // Extraire le salaire du texte HelloWork
    // Formats: "35 000 - 40 000 € / an", "50 000 € / an", "45k - 50k€"
    extractSalary(text) {
      // Format: XX 000 - XX 000 € / an
      let match = text.match(/(\d{1,3})\s*(\d{3})\s*[-–àa]\s*(\d{1,3})\s*(\d{3})\s*€?\s*(?:\/\s*an|annuel|brut)/i);
      if (match) {
        return {
          min: parseInt(match[1] + match[2]),
          max: parseInt(match[3] + match[4]),
          raw: match[0]
        };
      }

      // Format: XX XXX € / an (unique)
      match = text.match(/(\d{1,3})\s*(\d{3})\s*€\s*(?:\/\s*an|annuel|brut)/i);
      if (match) {
        const val = parseInt(match[1] + match[2]);
        return { min: val * 0.9, max: val * 1.1, raw: match[0] };
      }

      // Format: XXk - XXk€
      match = text.match(/(\d{2,3})\s*k\s*€?\s*[-–àa]\s*(\d{2,3})\s*k/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          raw: match[0]
        };
      }

      return null;
    },

    // Extraire le niveau de diplôme
    // Formats: "Bac +2", "Bac+5", "Bac +3, Bac +4"
    extractDiploma(text) {
      // Chercher le plus haut niveau mentionné
      const levels = {
        'bac8': /bac\s*\+?\s*8|doctorat|phd/i,
        'bac5': /bac\s*\+?\s*5|master|ingénieur/i,
        'bac3': /bac\s*\+?\s*3|licence|bachelor/i,
        'bac2': /bac\s*\+?\s*2|bts|dut|deug/i,
        'bac': /\bbac\b(?!\s*\+)|niveau\s*bac\b|baccalauréat/i,
        'cap_bep': /cap|bep|certificat/i
      };

      // Retourner le niveau le plus élevé trouvé
      for (const [level, pattern] of Object.entries(levels)) {
        if (pattern.test(text)) return level;
      }
      return null;
    },

    // Extraire l'expérience requise
    // Formats: "Exp. - 1 an", "Exp. 5 ans min.", "Exp. 3 à 5 ans", "3 ans d'expérience"
    extractExperience(text) {
      // Format HelloWork: "Exp. X ans" ou "Exp. - 1 an" (débutant)
      let match = text.match(/exp\.?\s*[-–]?\s*(\d+)\s*(?:à\s*(\d+)\s*)?ans?/i);
      if (match) {
        if (match[2]) {
          return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);
        }
        return parseInt(match[1]);
      }

      // Format: "X ans min." ou "X ans minimum"
      match = text.match(/(\d+)\s*ans?\s*(?:min\.?|minimum)/i);
      if (match) return parseInt(match[1]);

      // Format: "X ans d'expérience"
      match = text.match(/(\d+)\s*ans?\s*d['']?exp/i);
      if (match) return parseInt(match[1]);

      // Débutant accepté
      if (/débutant|sans\s*expérience|junior/i.test(text)) return 0;

      // Senior/Confirmé sans chiffre
      if (/senior|expert/i.test(text)) return 7;
      if (/confirmé/i.test(text)) return 4;

      return null;
    },

    // Extraire le type de contrat
    extractContractType(text) {
      if (/\bcdi\b/i.test(text)) return 'CDI';
      if (/\bcdd\b/i.test(text)) return 'CDD';
      if (/\bintérim\b/i.test(text)) return 'Intérim';
      if (/\bstage\b/i.test(text)) return 'Stage';
      if (/\balternance\b/i.test(text)) return 'Alternance';
      if (/\bfreelance\b/i.test(text)) return 'Freelance';
      return null;
    },

    // Extraire le télétravail
    extractRemoteWork(text) {
      if (/télétravail\s*complet|100\s*%\s*remote/i.test(text)) return 'complet';
      if (/télétravail\s*partiel/i.test(text)) return 'partiel';
      if (/télétravail\s*occasionnel/i.test(text)) return 'occasionnel';
      if (/télétravail/i.test(text)) return 'possible';
      return null;
    },

    // Détecter si c'est un cabinet de recrutement
    isRecruitmentAgency(text) {
      return /cabinet\s*de\s*recrutement|super\s*recruteur|recrutement$/i.test(text);
    },

    // Détecter le secteur d'activité
    extractSector(text) {
      const sectors = [
        { name: 'tech', pattern: /secteur\s*informatique|esn|ssii|tech|digital/i },
        { name: 'finance', pattern: /banque|assurance|finance|comptab/i },
        { name: 'sante', pattern: /santé|médical|pharma/i },
        { name: 'commerce', pattern: /commerce|retail|distribution/i },
        { name: 'industrie', pattern: /industrie|manufactur|production/i },
        { name: 'services', pattern: /services?\s*aux\s*entreprises/i }
      ];

      for (const sector of sectors) {
        if (sector.pattern.test(text)) return sector.name;
      }
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
      const hw = result.helloworkData || {};

      const diplomaLabels = {
        'cap_bep': 'CAP/BEP', 'bac': 'Bac', 'bac2': 'Bac+2',
        'bac3': 'Bac+3', 'bac5': 'Bac+5', 'bac8': 'Doctorat'
      };

      const remoteLabels = {
        'complet': 'Télétravail complet',
        'partiel': 'Télétravail partiel',
        'occasionnel': 'Télétravail occasionnel',
        'possible': 'Télétravail possible'
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
      profileGrid.appendChild(DOM.keyValue('Contrat', hw.contractType || '-'));
      profileGrid.appendChild(DOM.keyValue('Localisation', d.location || '-'));
      profileSection.appendChild(profileGrid);

      if (hw.remoteWork) {
        const remoteDiv = document.createElement('div');
        remoteDiv.style.cssText = 'margin-top: 8px;';
        const remoteLabel = DOM.span('Mode: ', 'color: #64748b; font-size: 13px;');
        const remoteValue = document.createElement('strong');
        remoteValue.style.cssText = 'color: #0d9488; font-size: 13px;';
        remoteValue.textContent = remoteLabels[hw.remoteWork] || hw.remoteWork;
        remoteDiv.appendChild(remoteLabel);
        remoteDiv.appendChild(remoteValue);
        profileSection.appendChild(remoteDiv);
      }

      if (hw.isAgency) {
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
              experienceYears: hw.experience || d.experience || 3,
              sector: hw.sector || 'default',
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
    const getText = (selectors) => {
      for (const sel of selectors.split(', ')) {
        const el = card.querySelector(sel);
        if (el && el.textContent.trim()) return el.textContent.trim();
      }
      return '';
    };

    // Récupérer tout le texte de la carte pour l'analyse
    const fullText = card.textContent || '';

    // Extraction des données structurées HelloWork
    const salary = HelloWorkParser.extractSalary(fullText);
    const diploma = HelloWorkParser.extractDiploma(fullText);
    const experience = HelloWorkParser.extractExperience(fullText);
    const contractType = HelloWorkParser.extractContractType(fullText);
    const remoteWork = HelloWorkParser.extractRemoteWork(fullText);
    const isAgency = HelloWorkParser.isRecruitmentAgency(fullText);
    const sector = HelloWorkParser.extractSector(fullText);

    // Construire le texte avec les données structurées pour l'analyseur
    let enrichedText = fullText;

    // Ajouter explicitement le salaire au format que l'analyseur comprend
    if (salary) {
      enrichedText += ` salaire ${salary.min} à ${salary.max} € `;
    }

    return {
      title: getText(SELECTORS.jobTitle),
      company: getText(SELECTORS.company),
      location: getText(SELECTORS.location),
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: enrichedText,
      // Données HelloWork spécifiques
      helloworkData: {
        salary,
        diploma,
        experience,
        contractType,
        remoteWork,
        isAgency,
        sector
      }
    };
  }

  function analyzeCard(card) {
    if (processedElements.has(card) || card.querySelector('.fjd-badge')) return;

    // Vérifier si c'est un élément pertinent (pas trop petit, pas un sous-élément)
    if (card.offsetHeight < 50) return;
    if (card.closest('[data-fjd-processed]')) return;

    processedElements.add(card);
    card.setAttribute('data-fjd-processed', 'true');

    const jobData = extractJobData(card);
    if (!jobData.title || jobData.title.length < 3) return;

    // Analyser avec l'analyseur de pertinence
    const result = Analyzer.evaluate(jobData, {});

    // Ajouter les données HelloWork au résultat
    result.helloworkData = jobData.helloworkData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    const badge = UI.createBadge(result);
    badge.style.position = 'absolute';
    badge.style.top = '8px';
    badge.style.right = '8px';

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(badge);
    StatsTracker.track(result.pertinenceScore);

    // Bordure colorée selon le score
    if (result.pertinenceScore <= 25) {
      card.style.borderLeft = '4px solid #dc2626';
    } else if (result.pertinenceScore <= 45) {
      card.style.borderLeft = '4px solid #ea580c';
    } else if (result.pertinenceScore >= 75) {
      card.style.borderLeft = '4px solid #16a34a';
    }

    console.log(`[FJD] HelloWork: "${jobData.title.substring(0, 40)}..." - ${result.pertinenceScore}%`, {
      salary: jobData.helloworkData.salary,
      diploma: jobData.helloworkData.diploma,
      exp: jobData.helloworkData.experience
    });
  }

  function analyzeDetail() {
    const container = document.querySelector(SELECTORS.detailContainer);
    if (!container || container.hasAttribute('data-fjd')) return;

    const title = document.querySelector(SELECTORS.detailTitle)?.textContent?.trim();
    if (!title) return;

    container.setAttribute('data-fjd', 'true');

    // Récupérer tout le texte de la page pour une meilleure extraction
    const pageText = document.body.textContent || '';

    const salary = HelloWorkParser.extractSalary(pageText);
    const diploma = HelloWorkParser.extractDiploma(pageText);
    const experience = HelloWorkParser.extractExperience(pageText);
    const contractType = HelloWorkParser.extractContractType(pageText);
    const remoteWork = HelloWorkParser.extractRemoteWork(pageText);
    const isAgency = HelloWorkParser.isRecruitmentAgency(pageText);

    const jobData = {
      title,
      company: document.querySelector(SELECTORS.company)?.textContent?.trim() || '',
      location: document.querySelector(SELECTORS.location)?.textContent?.trim() || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: container.textContent || '',
      helloworkData: { salary, diploma, experience, contractType, remoteWork, isAgency }
    };

    const result = Analyzer.evaluate(jobData, {});
    result.helloworkData = jobData.helloworkData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    const badge = UI.createBadge(result);
    badge.style.marginBottom = '12px';

    const titleEl = document.querySelector(SELECTORS.detailTitle);
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
    } else {
      container.insertBefore(badge, container.firstChild);
    }

    StatsTracker.track(result.pertinenceScore);
  }

  function findJobCards() {
    // Essayer plusieurs stratégies pour trouver les cartes
    let cards = document.querySelectorAll(SELECTORS.jobCards);

    if (cards.length === 0) {
      // Stratégie alternative: chercher les liens vers des offres
      const links = document.querySelectorAll('a[href*="/emploi/"], a[href*="/emplois/"]');
      const cardSet = new Set();
      links.forEach(link => {
        // Remonter jusqu'à trouver un conteneur de carte
        let parent = link.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          if (parent.tagName === 'ARTICLE' ||
              parent.tagName === 'LI' ||
              parent.className.includes('card') ||
              parent.className.includes('result')) {
            cardSet.add(parent);
            break;
          }
          parent = parent.parentElement;
        }
      });
      cards = Array.from(cardSet);
    }

    return cards;
  }

  function analyzePage() {
    const cards = findJobCards();

    if (cards.length === 0 && retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(analyzePage, 600);
      return;
    }

    console.log(`[FJD] HelloWork: ${cards.length} cartes trouvées`);

    cards.forEach(analyzeCard);
    analyzeDetail();
    retryCount = 0;
  }

  function init() {
    console.log('[FJD] HelloWork analyzer v3.0 initialisé');
    setTimeout(analyzePage, 500);

    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(analyzePage, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        retryCount = 0;
        processedElements = new WeakSet();
        document.querySelectorAll('[data-fjd], [data-fjd-processed]').forEach(el => {
          el.removeAttribute('data-fjd');
          el.removeAttribute('data-fjd-processed');
        });
        document.querySelectorAll('.fjd-badge').forEach(el => el.remove());
        setTimeout(analyzePage, 500);
      }
    }, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
