/**
 * Fake Job Detector - Welcome to the Jungle v3.0
 * Détection améliorée avec extraction structurée des données WTTJ
 */

(function() {
  'use strict';

  console.log('[FJD] Welcome to the Jungle content script chargé');

  if (!window.FJD_PertinenceAnalyzer) {
    console.error('[FJD] Analyseur de pertinence non disponible');
    return;
  }

  const Analyzer = window.FJD_PertinenceAnalyzer;
  const SalaryAnalyzer = window.FJD_SalaryMarketAnalyzer;

  // Sélecteurs spécifiques Welcome to the Jungle
  const SELECTORS = {
    // Liste de résultats - multiples sélecteurs pour robustesse
    jobCards: [
      '[data-testid="search-results-list-item-wrapper"]',
      '[data-testid="job-card"]',
      'a[href*="/companies/"][href*="/jobs/"]',
      'article[class*="sc-"]',
      'div[class*="JobCard"]',
      'li[class*="ais-Hits-item"]',
      'div[data-algolia-queryid]'
    ].join(', '),

    // Titre du poste
    jobTitle: [
      '[data-testid="job-card-title"]',
      'h3[class*="title"]',
      'h4[class*="title"]',
      '[class*="JobTitle"]',
      'span[class*="title"]'
    ].join(', '),

    // Entreprise
    company: [
      '[data-testid="job-card-company"]',
      '[class*="CompanyName"]',
      '[class*="company"]',
      'span[class*="Company"]'
    ].join(', '),

    // Page détail
    detailContainer: [
      '[data-testid="job-section-description"]',
      '[class*="JobDescription"]',
      'section[class*="description"]',
      'div[class*="JobBody"]',
      'main section'
    ].join(', '),

    detailTitle: [
      '[data-testid="job-header-title"]',
      '[data-testid="job-title"]',
      'h1[class*="title"]',
      'h1'
    ].join(', '),

    detailCompany: [
      '[data-testid="job-header-company"]',
      '[data-testid="job-company-name"]',
      '[class*="CompanyLink"]',
      'a[href*="/companies/"]'
    ].join(', ')
  };

  let observer = null;
  let lastUrl = window.location.href;
  let debounceTimer = null;
  let scrollTimer = null;
  let rafId = null;
  let processedElements = new WeakSet();
  let retryCount = 0;
  const MAX_RETRIES = 20; // Plus de retries pour les pages lentes

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
  // EXTRACTION DE DONNÉES SPÉCIFIQUE WELCOME TO THE JUNGLE
  // ============================================================================

  const WTTJParser = {
    // Extraire le salaire - formats WTTJ spécifiques
    // "65 à 80 €", "38K à 40K €", "45K à 50K €", "≥ 36 €", "40K à 55K €"
    extractSalary(text) {
      // Format: XXK à XXK € (avec K majuscule)
      let match = text.match(/(\d{2,3})\s*K\s*(?:€)?\s*à\s*(\d{2,3})\s*K\s*€?/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          type: 'annual',
          raw: match[0]
        };
      }

      // Format WTTJ: "Salaire : XX à XX €" (en milliers implicite)
      match = text.match(/Salaire\s*:\s*(\d{2,3})\s*à\s*(\d{2,3})\s*€/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          type: 'annual',
          raw: match[0]
        };
      }

      // Format: ≥ XXK € ou >= XXK (minimum)
      match = text.match(/[≥>=]\s*(\d{2,3})\s*K?\s*€?/i);
      if (match) {
        const base = parseInt(match[1]) * 1000;
        return {
          min: base,
          max: base * 1.25,
          type: 'minimum',
          raw: match[0]
        };
      }

      // Format standard: XX XXX € - XX XXX €
      match = text.match(/(\d{1,3})\s*(\d{3})\s*€?\s*[-–àa]\s*(\d{1,3})\s*(\d{3})\s*€/i);
      if (match) {
        return {
          min: parseInt(match[1] + match[2]),
          max: parseInt(match[3] + match[4]),
          type: 'annual',
          raw: match[0]
        };
      }

      // Format: XXk - XXk
      match = text.match(/(\d{2,3})\s*k\s*€?\s*[-–àa]\s*(\d{2,3})\s*k/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          type: 'annual',
          raw: match[0]
        };
      }

      return null;
    },

    // Extraire le niveau de diplôme
    extractDiploma(text) {
      const levels = {
        'bac8': /bac\s*\+?\s*8|doctorat|phd/i,
        'bac5': /bac\s*\+?\s*5|master|ingénieur|mba|grandes?\s*écoles?/i,
        'bac3': /bac\s*\+?\s*3|licence|bachelor/i,
        'bac2': /bac\s*\+?\s*2|bts|dut|deug/i,
        'bac': /\bniveau\s*bac\b|\bbac\b(?!\s*\+)|baccalauréat/i,
        'cap_bep': /cap|bep|certificat/i
      };

      for (const [level, pattern] of Object.entries(levels)) {
        if (pattern.test(text)) return level;
      }
      return null;
    },

    // Extraire l'expérience requise
    // Format WTTJ: "> 3 ans", "Expérience : > 3 ans", "3-5 ans d'expérience"
    extractExperience(text) {
      // Format WTTJ: "> X ans" ou "Expérience : > X ans"
      let match = text.match(/(?:expérience\s*:?\s*)?>\s*(\d+)\s*ans?/i);
      if (match) return parseInt(match[1]);

      // Format: X-Y ans
      match = text.match(/(\d+)\s*[-–àa]\s*(\d+)\s*ans?/i);
      if (match) return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);

      // Format: X ans d'expérience / X+ ans
      match = text.match(/(\d+)\s*\+?\s*ans?\s*(?:d['']?)?(?:expérience|exp\.?|minimum)/i);
      if (match) return parseInt(match[1]);

      // Junior / Débutant
      if (/junior|débutant|entry|première\s*expérience/i.test(text)) return 0;

      // Senior
      if (/senior|expert|lead|staff/i.test(text)) return 7;
      if (/confirmé|expérimenté|mid[-\s]?level/i.test(text)) return 4;

      return null;
    },

    // Extraire le type de contrat
    extractContractType(text) {
      if (/\bcdi\b/i.test(text)) return 'CDI';
      if (/\bcdd\b/i.test(text)) return 'CDD';
      if (/\bstage\b|internship/i.test(text)) return 'Stage';
      if (/\balternance\b|apprentissage/i.test(text)) return 'Alternance';
      if (/\bfreelance\b|indépendant/i.test(text)) return 'Freelance';
      if (/\bintérim\b/i.test(text)) return 'Intérim';
      if (/temps\s*partiel|part[- ]?time/i.test(text)) return 'Temps partiel';
      return null;
    },

    // Extraire le télétravail - formats WTTJ
    // "Télétravail fréquent", "Télétravail occasionnel", "Télétravail non autorisé", "Télétravail total"
    extractRemoteWork(text) {
      if (/télétravail\s*(?:total|complet)|full\s*remote/i.test(text)) return 'complet';
      if (/télétravail\s*fréquent/i.test(text)) return 'frequent';
      if (/télétravail\s*occasionnel|télétravail\s*partiel/i.test(text)) return 'occasionnel';
      if (/télétravail\s*non\s*autorisé|on[- ]?site|sur\s*site|présentiel/i.test(text)) return 'non';
      if (/télétravail|remote/i.test(text)) return 'possible';
      return null;
    },

    // Extraire le nombre de collaborateurs
    // Format WTTJ: "65 collaborateurs", "1 900 collaborateurs"
    extractCompanySize(text) {
      const match = text.match(/(\d+(?:\s*\d+)*)\s*collaborateurs?/i);
      if (match) {
        return parseInt(match[1].replace(/\s/g, ''));
      }
      return null;
    },

    // Extraire le secteur d'activité - tags WTTJ
    extractSector(text) {
      const sectors = [
        { name: 'tech', pattern: /(?:logiciels?|saas|cloud|it\s*\/?\s*digital|tech|software|data|cyber|intelligence\s*artificielle)/i },
        { name: 'finance', pattern: /(?:banque|assurance|finance|fintech|banking)/i },
        { name: 'sante', pattern: /(?:santé|médical|pharma|biotech|edtech)/i },
        { name: 'commerce', pattern: /(?:e-?commerce|retail|distribution|mode)/i },
        { name: 'industrie', pattern: /(?:industrie|manufacturing|automobile|aéronautique)/i },
        { name: 'services', pattern: /(?:consulting|conseil|marketing|communication|digital\s*marketing)/i },
        { name: 'media', pattern: /(?:média|édition|presse|publishing)/i },
        { name: 'energie', pattern: /(?:énergie|mobilité|energy)/i }
      ];

      for (const sector of sectors) {
        if (sector.pattern.test(text)) return sector.name;
      }
      return null;
    },

    // Extraire l'ancienneté de l'offre
    extractJobAge(text) {
      const match = text.match(/il\s*y\s*a\s*(\d+)\s*(jour|semaine|mois|heure)/i);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.includes('heure')) return value / 24;
        if (unit.includes('jour')) return value;
        if (unit.includes('semaine')) return value * 7;
        if (unit.includes('mois')) return value * 30;
      }
      if (/hier/i.test(text)) return 1;
      if (/aujourd'hui/i.test(text)) return 0;
      return null;
    },

    // Extraire la localisation
    extractLocation(text) {
      const match = text.match(/(?:Paris|Lyon|Marseille|Bordeaux|Nantes|Toulouse|Lille|Nice|Strasbourg|Montpellier|Rennes|Grenoble|Rouen|Toulon|France|Remote)[^,\n]*/i);
      return match ? match[0].trim() : null;
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
        width: 95%; max-width: 560px; max-height: 85vh; background: #ffffff;
        border-radius: 16px; z-index: 10001;
        box-shadow: 0 25px 50px rgba(0,0,0,0.25);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px; line-height: 1.5; color: #1e293b;
        display: flex; flex-direction: column;
      `;

      const cls = result.classification;
      const s = result.scores;
      const d = result.detected;
      const extra = result.wttjData || {};

      const diplomaLabels = {
        'cap_bep': 'CAP/BEP', 'bac': 'Bac', 'bac2': 'Bac+2',
        'bac3': 'Bac+3', 'bac5': 'Bac+5', 'bac8': 'Doctorat'
      };

      const remoteLabels = {
        'complet': 'Télétravail total',
        'frequent': 'Télétravail fréquent',
        'occasionnel': 'Télétravail occasionnel',
        'possible': 'Télétravail possible',
        'non': 'Présentiel uniquement'
      };

      const CareerPathways = window.FJD_CareerPathways;
      const careerData = CareerPathways ? CareerPathways.analyze(result.jobTitle || '') : { debouches: [], reconversion: [] };

      // Build header
      const header = document.createElement('header');
      header.style.cssText = `background: linear-gradient(135deg, ${cls.bgColor} 0%, ${cls.color}18 100%); padding: 20px 24px; border-bottom: 1px solid ${cls.color}25; flex-shrink: 0; border-radius: 16px 16px 0 0;`;

      const headerRow = DOM.div('display: flex; justify-content: space-between; align-items: flex-start;');

      const scoreDiv = document.createElement('div');
      const scoreTitle = document.createElement('div');
      scoreTitle.id = 'fjd-panel-title';
      scoreTitle.style.cssText = `font-size: 32px; font-weight: 800; color: ${cls.color}; letter-spacing: -0.5px; line-height: 1.1;`;
      scoreTitle.textContent = result.pertinenceScore + '%';

      const scoreLabel = document.createElement('div');
      scoreLabel.style.cssText = `font-size: 15px; font-weight: 600; color: ${cls.color}; margin-top: 4px;`;
      scoreLabel.textContent = cls.label;

      scoreDiv.appendChild(scoreTitle);
      scoreDiv.appendChild(scoreLabel);

      const closeBtn = document.createElement('button');
      closeBtn.className = 'fjd-close';
      closeBtn.setAttribute('aria-label', 'Fermer le panneau');
      closeBtn.style.cssText = 'background: rgba(0,0,0,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 20px; cursor: pointer; color: #374151; display: flex; align-items: center; justify-content: center; transition: all 0.2s;';
      closeBtn.textContent = '\u00D7';

      headerRow.appendChild(scoreDiv);
      headerRow.appendChild(closeBtn);
      header.appendChild(headerRow);

      if (result.jobTitle) {
        const jobInfo = document.createElement('div');
        jobInfo.style.cssText = `margin-top: 16px; padding-top: 16px; border-top: 1px solid ${cls.color}20;`;

        const jobTitle = document.createElement('h2');
        jobTitle.style.cssText = 'font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3;';
        jobTitle.textContent = result.jobTitle;
        jobInfo.appendChild(jobTitle);

        if (result.company) {
          const companyP = document.createElement('p');
          companyP.style.cssText = 'font-size: 14px; color: #475569; margin: 6px 0 0 0;';
          companyP.textContent = result.company;
          jobInfo.appendChild(companyP);
        }
        header.appendChild(jobInfo);
      }

      panel.appendChild(header);

      // Build main content
      const main = document.createElement('main');
      main.style.cssText = 'padding: 20px 24px; overflow-y: auto; flex: 1; min-height: 0;';

      // Profile section
      const profileSection = document.createElement('section');
      profileSection.setAttribute('aria-label', 'Analyse du profil');
      profileSection.style.cssText = 'background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px;';

      const profileHeader = document.createElement('h3');
      profileHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;';
      profileHeader.textContent = 'Analyse du profil';
      profileSection.appendChild(profileHeader);

      const profileGrid = DOM.div('display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;');
      profileGrid.appendChild(DOM.keyValue('Diplôme', d.diploma ? diplomaLabels[d.diploma] : 'Non précisé'));
      profileGrid.appendChild(DOM.keyValue('Expérience', d.experience !== null ? d.experience + ' an' + (d.experience > 1 ? 's' : '') : 'Non précisé'));
      profileGrid.appendChild(DOM.keyValue('Contrat', extra.contractType || '-'));
      profileGrid.appendChild(DOM.keyValue('Lieu', d.location || extra.location || '-'));
      profileSection.appendChild(profileGrid);

      if (extra.remoteWork) {
        const remoteDiv = document.createElement('div');
        remoteDiv.style.cssText = 'margin-top: 10px; font-size: 14px; line-height: 1.4;';
        const remoteLabel = DOM.span('Mode: ', 'color: #64748b;');
        const remoteValue = document.createElement('strong');
        remoteValue.style.cssText = 'color: #0d9488;';
        remoteValue.textContent = remoteLabels[extra.remoteWork] || extra.remoteWork;
        remoteDiv.appendChild(remoteLabel);
        remoteDiv.appendChild(remoteValue);
        profileSection.appendChild(remoteDiv);
      }

      if (extra.companySize) {
        const sizeDiv = document.createElement('div');
        sizeDiv.style.cssText = 'margin-top: 8px; font-size: 14px; line-height: 1.4;';
        const sizeLabel = DOM.span('Taille: ', 'color: #64748b;');
        const sizeValue = document.createElement('strong');
        sizeValue.style.cssText = 'color: #0f172a;';
        sizeValue.textContent = extra.companySize.toLocaleString() + ' collaborateurs';
        sizeDiv.appendChild(sizeLabel);
        sizeDiv.appendChild(sizeValue);
        profileSection.appendChild(sizeDiv);
      }

      if (extra.sector) {
        const sectorDiv = document.createElement('div');
        sectorDiv.style.cssText = 'margin-top: 8px; font-size: 14px; line-height: 1.4;';
        const sectorLabel = DOM.span('Secteur: ', 'color: #64748b;');
        const sectorValue = document.createElement('strong');
        sectorValue.style.cssText = 'color: #4f46e5;';
        sectorValue.textContent = extra.sector;
        sectorDiv.appendChild(sectorLabel);
        sectorDiv.appendChild(sectorValue);
        profileSection.appendChild(sectorDiv);
      }

      if (d.salary) {
        const salaryDiv = document.createElement('div');
        salaryDiv.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 14px; line-height: 1.4;';
        const salaryLabel = DOM.span('Salaire: ', 'color: #64748b;');
        const salaryValue = document.createElement('strong');
        salaryValue.style.cssText = 'color: #0f172a;';
        salaryValue.textContent = Math.round(d.salary.min/1000) + 'k - ' + Math.round(d.salary.max/1000) + 'k€/an';
        salaryDiv.appendChild(salaryLabel);
        salaryDiv.appendChild(salaryValue);
        if (s.market.expected) {
          const expectedSpan = DOM.span(' (attendu: ' + Math.round(s.market.expected.min/1000) + 'k-' + Math.round(s.market.expected.max/1000) + 'k€)', 'color: #64748b; font-size: 13px;');
          salaryDiv.appendChild(expectedSpan);
        }
        profileSection.appendChild(salaryDiv);
      } else {
        const noSalaryDiv = document.createElement('div');
        noSalaryDiv.style.cssText = 'margin-top: 12px; padding: 10px 12px; background: #fef2f2; border-radius: 8px; font-size: 13px; color: #b91c1c; font-weight: 500;';
        noSalaryDiv.textContent = 'Salaire non communiqué';
        profileSection.appendChild(noSalaryDiv);
      }

      main.appendChild(profileSection);

      // Scores section
      const scoresSection = document.createElement('section');
      scoresSection.setAttribute('aria-label', 'Scores par critère');
      scoresSection.style.cssText = 'margin-bottom: 20px;';

      const scoresHeader = document.createElement('h3');
      scoresHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 14px 0; text-transform: uppercase; letter-spacing: 0.5px;';
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
        const col = item.score >= 70 ? '#15803d' : item.score >= 50 ? '#a16207' : '#b91c1c';
        const labelText = item.name + ' (' + item.desc + ')';
        scoresSection.appendChild(DOM.progressBar(item.score, col, labelText));
      });

      main.appendChild(scoresSection);

      // Market details
      if (s.market.details.length > 0) {
        const marketSection = document.createElement('section');
        marketSection.setAttribute('aria-label', 'Détails salariaux');
        marketSection.style.cssText = 'margin-bottom: 16px;';
        const marketHeader = document.createElement('h4');
        marketHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 10px 0;';
        marketHeader.textContent = 'Détails salariaux';
        marketSection.appendChild(marketHeader);
        marketSection.appendChild(DOM.ul(s.market.details, 'font-size: 13px; color: #475569; line-height: 1.6; margin: 0; padding-left: 20px;'));
        main.appendChild(marketSection);
      }

      // Green flags
      if (result.signals.greenFlags.length > 0) {
        const greenSection = document.createElement('section');
        greenSection.setAttribute('aria-label', 'Points positifs');
        greenSection.style.cssText = 'background: #f0fdf4; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #bbf7d0;';
        const greenHeader = document.createElement('h4');
        greenHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #166534; margin: 0 0 10px 0;';
        greenHeader.textContent = 'Points positifs (' + result.signals.greenFlags.length + ')';
        greenSection.appendChild(greenHeader);
        const greenTags = DOM.div('font-size: 13px; color: #166534; line-height: 1.5;');
        result.signals.greenFlags.slice(0, 6).forEach(f => {
          const tag = document.createElement('span');
          tag.style.cssText = 'display: inline-block; background: #dcfce7; padding: 4px 10px; border-radius: 6px; margin: 3px 6px 3px 0; font-weight: 500;';
          tag.textContent = f.label;
          greenTags.appendChild(tag);
        });
        greenSection.appendChild(greenTags);
        main.appendChild(greenSection);
      }

      // Red flags
      if (result.signals.redFlags.length > 0) {
        const redSection = document.createElement('section');
        redSection.setAttribute('aria-label', 'Alertes');
        redSection.setAttribute('role', 'alert');
        redSection.style.cssText = 'background: #fef2f2; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #fecaca;';
        const redHeader = document.createElement('h4');
        redHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #991b1b; margin: 0 0 10px 0;';
        redHeader.textContent = 'Alertes (' + result.signals.redFlags.length + ')';
        redSection.appendChild(redHeader);
        redSection.appendChild(DOM.ul(result.signals.redFlags.slice(0, 5).map(f => f.label), 'font-size: 13px; color: #b91c1c; line-height: 1.6; margin: 0; padding-left: 20px;'));
        main.appendChild(redSection);
      }

      // Warnings
      if (result.signals.warnings.length > 0) {
        const warnSection = document.createElement('section');
        warnSection.setAttribute('aria-label', "Points d'attention");
        warnSection.style.cssText = 'background: #fffbeb; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #fde68a;';
        const warnHeader = document.createElement('h4');
        warnHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #92400e; margin: 0 0 10px 0;';
        warnHeader.textContent = "Points d'attention";
        warnSection.appendChild(warnHeader);
        warnSection.appendChild(DOM.ul(result.signals.warnings.slice(0, 4), 'font-size: 13px; color: #a16207; line-height: 1.6; margin: 0; padding-left: 20px;'));
        main.appendChild(warnSection);
      }

      // Recommendations
      if (result.recommendations.length > 0) {
        const recoSection = document.createElement('section');
        recoSection.setAttribute('aria-label', 'Recommandations');
        recoSection.style.cssText = 'background: #eff6ff; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #bfdbfe;';
        const recoHeader = document.createElement('h4');
        recoHeader.style.cssText = 'font-size: 13px; font-weight: 700; color: #1e40af; margin: 0 0 10px 0;';
        recoHeader.textContent = 'Recommandations';
        recoSection.appendChild(recoHeader);
        recoSection.appendChild(DOM.ul(result.recommendations, 'font-size: 13px; color: #1d4ed8; line-height: 1.6; margin: 0; padding-left: 20px;'));
        main.appendChild(recoSection);
      }

      // Career pathways - Debouches
      if (careerData.debouches && careerData.debouches.length > 0) {
        const careerSection = document.createElement('section');
        careerSection.setAttribute('aria-label', 'Évolutions de carrière');
        careerSection.style.cssText = 'background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #a7f3d0;';
        const careerHeader = document.createElement('h4');
        careerHeader.style.cssText = 'font-size: 14px; font-weight: 700; color: #047857; margin: 0 0 12px 0;';
        careerHeader.textContent = 'Évolutions de carrière possibles';
        careerSection.appendChild(careerHeader);

        const careerList = document.createElement('div');
        careerList.style.cssText = 'font-size: 13px; color: #065f46;';
        careerData.debouches.forEach(deb => {
          const item = document.createElement('div');
          item.style.cssText = 'margin-bottom: 10px; padding-left: 14px; border-left: 3px solid #10b981;';
          const title = document.createElement('div');
          title.style.cssText = 'font-weight: 600; font-size: 14px; line-height: 1.4;';
          title.textContent = deb.title;
          const desc = document.createElement('div');
          desc.style.cssText = 'color: #047857; font-size: 12px; margin-top: 2px; line-height: 1.4;';
          desc.textContent = deb.years + ' \u2022 ' + deb.desc;
          item.appendChild(title);
          item.appendChild(desc);
          careerList.appendChild(item);
        });
        careerSection.appendChild(careerList);
        main.appendChild(careerSection);
      }

      // Career pathways - Reconversion
      if (careerData.reconversion && careerData.reconversion.length > 0) {
        const reconSection = document.createElement('section');
        reconSection.setAttribute('aria-label', 'Pistes de reconversion');
        reconSection.style.cssText = 'background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #c4b5fd;';
        const reconHeader = document.createElement('h4');
        reconHeader.style.cssText = 'font-size: 14px; font-weight: 700; color: #6d28d9; margin: 0 0 12px 0;';
        reconHeader.textContent = 'Pistes de reconversion';
        reconSection.appendChild(reconHeader);

        const reconList = document.createElement('div');
        reconList.style.cssText = 'font-size: 13px; color: #5b21b6;';
        careerData.reconversion.forEach(r => {
          const item = document.createElement('div');
          item.style.cssText = 'margin-bottom: 10px; padding-left: 14px; border-left: 3px solid #8b5cf6;';
          const title = document.createElement('div');
          title.style.cssText = 'font-weight: 600; font-size: 14px; line-height: 1.4;';
          title.textContent = r.title;
          const desc = document.createElement('div');
          desc.style.cssText = 'color: #7c3aed; font-size: 12px; margin-top: 2px; line-height: 1.4;';
          desc.textContent = r.desc;
          item.appendChild(title);
          item.appendChild(desc);
          reconList.appendChild(item);
        });
        reconSection.appendChild(reconList);
        main.appendChild(reconSection);
      }

      // Salary analysis container
      const salaryContainer = document.createElement('div');
      salaryContainer.id = 'fjd-salary-analysis-container';
      salaryContainer.setAttribute('role', 'region');
      salaryContainer.setAttribute('aria-label', 'Analyse salariale détaillée');
      main.appendChild(salaryContainer);

      // Salary toggle button
      if (d.salary && SalaryAnalyzer) {
        const salaryToggle = document.createElement('button');
        salaryToggle.id = 'fjd-salary-toggle';
        salaryToggle.className = 'fjd-salary-toggle';
        salaryToggle.setAttribute('aria-expanded', 'false');
        salaryToggle.setAttribute('aria-controls', 'fjd-salary-analysis-container');
        salaryToggle.style.cssText = `
          margin-top: 16px; width: 100%; padding: 14px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; border: none; border-radius: 10px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
          display: flex; align-items: center; justify-content: center; gap: 8px;
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
              location: (d.location || extra.location || '').toLowerCase().includes('paris') ? 'paris' : 'province',
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

    // Extraction des données structurées WTTJ
    const salary = WTTJParser.extractSalary(fullText);
    const diploma = WTTJParser.extractDiploma(fullText);
    const experience = WTTJParser.extractExperience(fullText);
    const contractType = WTTJParser.extractContractType(fullText);
    const remoteWork = WTTJParser.extractRemoteWork(fullText);
    const companySize = WTTJParser.extractCompanySize(fullText);
    const sector = WTTJParser.extractSector(fullText);
    const jobAge = WTTJParser.extractJobAge(fullText);
    const location = WTTJParser.extractLocation(fullText);

    let enrichedText = fullText;
    if (salary) {
      enrichedText += ` salaire ${salary.min} à ${salary.max} € `;
    }

    // Extraire le titre depuis le lien ou le texte
    let title = getText(SELECTORS.jobTitle);
    if (!title) {
      const link = card.querySelector('a[href*="/jobs/"]');
      if (link) {
        const linkText = link.textContent.trim();
        if (linkText.length > 5 && linkText.length < 150) {
          title = linkText.split('\n')[0].trim();
        }
      }
    }

    // Extraire l'entreprise
    let company = getText(SELECTORS.company);
    if (!company) {
      const companyLink = card.querySelector('a[href*="/companies/"]');
      if (companyLink) {
        company = companyLink.textContent?.trim().split('\n')[0] || '';
      }
    }
    if (!company) {
      const textParts = fullText.split('\n').filter(p => p.trim().length > 2);
      if (textParts.length > 1) {
        company = textParts[0].trim();
      }
    }

    return {
      title: title.substring(0, 200),
      company: company.substring(0, 100),
      location: location || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: enrichedText,
      wttjData: { salary, diploma, experience, contractType, remoteWork, companySize, sector, jobAge, location }
    };
  }

  function analyzeCard(card) {
    if (!card || !card.nodeType || card.nodeType !== 1) return;
    if (processedElements.has(card) || card.querySelector('.fjd-badge')) return;
    if (card.offsetHeight < 30) return;
    if (card.closest('[data-fjd-processed]')) return;

    // Vérifier que c'est bien une carte d'offre
    const isJobLink = card.tagName === 'A' && card.href && card.href.includes('/jobs/');
    const hasJobLink = card.querySelector('a[href*="/jobs/"]') || isJobLink;
    if (!hasJobLink) return;

    processedElements.add(card);
    card.setAttribute('data-fjd-processed', 'true');

    const jobData = extractJobData(card);
    if (!jobData.title || jobData.title.length < 3) return;

    const result = Analyzer.evaluate(jobData, {});
    result.wttjData = jobData.wttjData;
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

    console.log(`[FJD] WTTJ: "${jobData.title.substring(0, 40)}..." - ${result.pertinenceScore}%`, {
      salary: jobData.wttjData.salary,
      diploma: jobData.wttjData.diploma,
      exp: jobData.wttjData.experience,
      remote: jobData.wttjData.remoteWork
    });
  }

  function analyzeDetail() {
    // Vérifier si on est sur une page de détail d'offre
    if (!window.location.pathname.includes('/jobs/')) return;

    // Trouver le container principal de l'offre
    let container = document.querySelector(SELECTORS.detailContainer);

    // Fallbacks pour trouver le container
    if (!container) {
      container = document.querySelector('main section, [role="main"] section, article');
    }

    if (!container || container.hasAttribute('data-fjd')) return;
    container.setAttribute('data-fjd', 'true');

    // Extraire le texte de la section principale (pas les offres suggérées)
    const mainSection = document.querySelector('main > div:first-child, [role="main"] > div:first-child') || container;
    const pageText = mainSection.textContent || '';

    const salary = WTTJParser.extractSalary(pageText);
    const diploma = WTTJParser.extractDiploma(pageText);
    const experience = WTTJParser.extractExperience(pageText);
    const contractType = WTTJParser.extractContractType(pageText);
    const remoteWork = WTTJParser.extractRemoteWork(pageText);
    const companySize = WTTJParser.extractCompanySize(pageText);
    const sector = WTTJParser.extractSector(pageText);
    const loc = WTTJParser.extractLocation(pageText);

    // Essayer plusieurs sélecteurs pour le titre
    let title = '';
    const titleSelectors = [
      '[data-testid="job-header-title"]',
      'h1[class*="sc-"]',
      'h1',
      '[class*="JobTitle"]',
      'header h1'
    ];
    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        title = el.textContent.trim();
        break;
      }
    }

    // Essayer plusieurs sélecteurs pour l'entreprise
    let company = '';
    const companySelectors = [
      '[data-testid="job-header-company"]',
      'a[href*="/companies/"] span',
      'a[href*="/companies/"]',
      '[class*="CompanyName"]'
    ];
    for (const sel of companySelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        company = el.textContent.trim().split('\n')[0];
        break;
      }
    }

    const jobData = {
      title,
      company,
      location: loc || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: pageText,
      wttjData: { salary, diploma, experience, contractType, remoteWork, companySize, sector, location: loc }
    };

    if (!jobData.title && !jobData.description) return;

    const result = Analyzer.evaluate(jobData, {});
    result.wttjData = jobData.wttjData;
    result.jobTitle = jobData.title;
    result.company = jobData.company;

    const badge = UI.createBadge(result);
    badge.style.marginBottom = '16px';
    badge.style.marginTop = '8px';
    badge.style.display = 'inline-flex';

    // Insérer le badge après le titre
    const titleEl = document.querySelector('h1');
    if (titleEl && titleEl.parentNode && !titleEl.parentNode.querySelector('.fjd-badge')) {
      titleEl.parentNode.insertBefore(badge, titleEl.nextSibling);
    } else if (container && !container.querySelector('.fjd-badge')) {
      container.insertBefore(badge, container.firstChild);
    }

    StatsTracker.track(result.pertinenceScore);
    console.log(`[FJD] WTTJ Detail: "${title.substring(0, 40)}..." - ${result.pertinenceScore}%`);
  }

  // Analyser les offres suggérées ("D'autres offres vous correspondent")
  function analyzeRelatedJobs() {
    // Chercher la section des offres suggérées
    const relatedSections = document.querySelectorAll('section, div[class*="sc-"]');

    relatedSections.forEach(section => {
      const sectionText = section.textContent || '';

      // Détecter si c'est une section d'offres suggérées
      const isRelatedSection = (
        sectionText.includes('D\'autres offres') ||
        sectionText.includes('Ces entreprises recrutent') ||
        sectionText.includes('Offres similaires') ||
        sectionText.includes('Voir toutes les offres')
      );

      if (!isRelatedSection) return;

      console.log('[FJD] WTTJ: Section offres suggérées détectée');

      // Trouver les cartes d'offres dans cette section
      const jobLinks = section.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]');
      console.log(`[FJD] WTTJ: ${jobLinks.length} offres suggérées trouvées`);

      jobLinks.forEach(link => {
        // Remonter pour trouver le conteneur de la carte
        let card = link;
        for (let i = 0; i < 6 && card; i++) {
          card = card.parentElement;
          if (!card) break;

          // Vérifier si c'est un bon conteneur
          if (card.offsetHeight > 80 && card.offsetWidth > 200) {
            const text = card.textContent || '';
            if ((text.includes('CDI') || text.includes('CDD') || text.includes('Stage')) &&
                text.includes('collaborateur')) {
              break;
            }
          }
        }

        if (card && !processedElements.has(card) && !card.querySelector('.fjd-badge')) {
          analyzeCard(card);
        }
      });
    });
  }

  function findJobCards() {
    let cards = [];
    const foundSet = new Set();

    // Debug: Log initial search
    console.log('[FJD] WTTJ: Recherche de cartes...');

    // Méthode 1: Sélecteurs directs
    const directCards = document.querySelectorAll(SELECTORS.jobCards);
    console.log(`[FJD] WTTJ: Sélecteurs directs: ${directCards.length} éléments`);
    directCards.forEach(card => {
      if (!processedElements.has(card) && !foundSet.has(card)) {
        cards.push(card);
        foundSet.add(card);
      }
    });

    // Méthode 2: Trouver via les liens contenant /companies/ et /jobs/
    const jobLinks = document.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]');
    console.log(`[FJD] WTTJ: Liens jobs trouvés: ${jobLinks.length}`);

    jobLinks.forEach(link => {
      if (processedElements.has(link)) return;

      // Remonter pour trouver le conteneur de la carte
      let parent = link;
      let bestContainer = null;

      for (let i = 0; i < 8 && parent; i++) {
        parent = parent.parentElement;
        if (!parent || parent === document.body) break;

        const tagName = parent.tagName;
        const className = parent.className || '';
        const testId = parent.getAttribute?.('data-testid') || '';

        // Critères pour un bon conteneur
        const isGoodContainer = (
          tagName === 'ARTICLE' ||
          tagName === 'LI' ||
          tagName === 'DIV' && (
            className.includes('sc-') || // styled-components
            className.includes('Card') ||
            className.includes('card') ||
            className.includes('Item') ||
            className.includes('item') ||
            className.includes('result') ||
            className.includes('job') ||
            testId.includes('item') ||
            testId.includes('card') ||
            testId.includes('result')
          )
        );

        // Vérifier la taille et le contenu
        if (parent.offsetHeight > 80 && parent.offsetWidth > 200) {
          const hasMultipleTexts = parent.textContent.split('\n').filter(t => t.trim().length > 2).length > 3;
          if (isGoodContainer || hasMultipleTexts) {
            bestContainer = parent;
            // Continuer à chercher un meilleur parent
          }
        }
      }

      // Utiliser le meilleur conteneur trouvé, ou le lien lui-même
      const cardElement = bestContainer || link;
      if (!processedElements.has(cardElement) && !foundSet.has(cardElement) && cardElement.offsetHeight > 30) {
        cards.push(cardElement);
        foundSet.add(cardElement);
      }
    });

    // Méthode 3: Fallback - chercher tous les DIVs/articles avec du contenu job-like
    if (cards.length === 0) {
      const allDivs = document.querySelectorAll('div[class*="sc-"], article, li');
      allDivs.forEach(div => {
        if (processedElements.has(div) || foundSet.has(div)) return;
        if (div.offsetHeight < 80 || div.offsetWidth < 200) return;

        const text = div.textContent || '';
        const hasJobContent = (
          (text.includes('CDI') || text.includes('CDD') || text.includes('Stage') || text.includes('Alternance')) &&
          (text.includes('collaborateur') || text.includes('il y a')) &&
          div.querySelector('a[href*="/jobs/"]')
        );

        if (hasJobContent) {
          cards.push(div);
          foundSet.add(div);
        }
      });
      console.log(`[FJD] WTTJ: Fallback DIVs: ${cards.length} cartes`);
    }

    console.log(`[FJD] WTTJ: Total cartes trouvées: ${cards.length}`);
    return cards;
  }

  function analyzePage() {
    const cards = findJobCards();

    if (cards.length === 0 && retryCount < MAX_RETRIES) {
      retryCount++;
      // Délai progressif: commence court puis s'allonge pour les pages lentes
      const delay = Math.min(200 + (retryCount * 150), 1000);
      setTimeout(analyzePage, delay);
      return;
    }

    if (cards.length > 0) {
      console.log(`[FJD] WTTJ: ${cards.length} cartes trouvées (retry: ${retryCount})`);
    }
    cards.forEach(analyzeCard);
    analyzeDetail();
    analyzeRelatedJobs(); // Analyser les offres suggérées en bas de page
    retryCount = 0;
  }

  // Analyse rapide des cartes visibles dans le viewport
  function analyzeVisibleCards() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      const cards = findJobCards();
      cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight + 300 && rect.bottom > -300;
        if (isVisible) analyzeCard(card);
      });
    });
  }

  // Attendre que le loader WTTJ disparaisse
  function waitForContent(callback, maxWait = 10000) {
    const startTime = Date.now();

    function check() {
      // Chercher des indicateurs que le contenu est chargé
      const hasLoader = document.querySelector('[class*="Loader"], [class*="loader"], [class*="Loading"], [class*="Spinner"], [class*="spinner"]');
      const hasJobLinks = document.querySelectorAll('a[href*="/companies/"][href*="/jobs/"]').length > 0;
      const hasJobContent = document.body.textContent.includes('collaborateur');

      if (hasJobLinks || hasJobContent) {
        console.log('[FJD] WTTJ: Contenu détecté, démarrage analyse');
        callback();
        return;
      }

      if (hasLoader) {
        console.log('[FJD] WTTJ: Loader détecté, attente...');
      }

      if (Date.now() - startTime < maxWait) {
        setTimeout(check, 200);
      } else {
        console.log('[FJD] WTTJ: Timeout, tentative d\'analyse quand même');
        callback();
      }
    }

    check();
  }

  function init() {
    console.log('[FJD] Welcome to the Jungle analyzer v3.2 initialisé (loader supporté)');

    // Attendre que le contenu soit chargé (après le loader)
    waitForContent(() => {
      analyzePage();

      // Re-analyser plusieurs fois pour être sûr
      setTimeout(analyzePage, 500);
      setTimeout(analyzePage, 1500);
      setTimeout(analyzePage, 3000);
    });

    // MutationObserver pour détecter quand le contenu apparaît après le loader
    observer = new MutationObserver((mutations) => {
      // Vérifier si des liens jobs ont été ajoutés
      const hasNewJobLinks = mutations.some(m =>
        Array.from(m.addedNodes).some(node =>
          node.nodeType === 1 && (
            node.querySelector?.('a[href*="/jobs/"]') ||
            (node.tagName === 'A' && node.href?.includes('/jobs/'))
          )
        )
      );

      if (hasNewJobLinks) {
        console.log('[FJD] WTTJ: Nouveaux liens jobs détectés');
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(analyzePage, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Scroll listeners pour détection rapide au scroll
    const scrollContainers = [
      document.querySelector('[data-testid="search-results-list"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      window
    ].filter(Boolean);

    scrollContainers.forEach(container => {
      container.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(analyzeVisibleCards, 50);
      }, { passive: true });
    });

    // Écouter le scroll global
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(analyzeVisibleCards, 50);
    }, { passive: true });

    // Polling continu pour détecter les nouvelles cartes (pages lentes/dynamiques)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      const newCards = findJobCards();
      if (newCards.length > 0) {
        newCards.forEach(analyzeCard);
      }
      // Arrêter le polling après 15 secondes
      if (pollCount > 30) clearInterval(pollInterval);
    }, 500);

    // Surveiller les changements d'URL (SPA)
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

        console.log('[FJD] WTTJ: Changement d\'URL détecté, attente du contenu...');

        // Attendre que le nouveau contenu soit chargé
        waitForContent(() => {
          analyzePage();
          setTimeout(analyzePage, 500);
          setTimeout(analyzePage, 1500);
        });
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();