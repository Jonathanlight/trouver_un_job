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
  const t = (key, params) => window.FJD_I18n?.t(key, params) || key;

  // ============================================================================
  // RED FLAGS SPÉCIFIQUES HELLOWORK
  // HelloWork a beaucoup de fausses offres bien formatées
  // ============================================================================

  const HELLOWORK_RED_FLAGS = {
    // Patterns spécifiques à HelloWork
    platformPatterns: [
      { pattern: /offre\s*sponsorisée/i, impact: -8, label: "Offre sponsorisée" },
      { pattern: /super\s*recruteur/i, impact: -5, label: "Super Recruteur HelloWork" },
      { pattern: /postuler\s*en\s*1\s*clic/i, impact: -3, label: "Candidature simplifiée" },
      { pattern: /(\d+)\s*offres?\s*similaires?/i, impact: -5, label: "Nombreuses offres similaires" }
    ],

    // Patterns de fausses offres bien formatées
    fakeJobPatterns: [
      { pattern: /nous\s*recherchons\s*pour\s*(nos\s*)?clients?/i, impact: -12, label: "Cabinet multi-clients" },
      { pattern: /plusieurs\s*postes?\s*(à\s*pourvoir|disponibles?)/i, impact: -8, label: "Postes multiples vagues" },
      { pattern: /secteur\s*(confidentiel|non\s*précisé)/i, impact: -15, label: "Secteur caché" },
      { pattern: /mission\s*d'?intérim\s*(longue\s*durée|renouvelable)/i, impact: -5, label: "Intérim déguisé" },
      { pattern: /poste\s*(évolutif|à\s*définir)/i, impact: -8, label: "Poste flou" },
      { pattern: /profil\s*(polyvalent|adaptable)/i, impact: -5, label: "Profil trop vague" },
      { pattern: /rémunération\s*(attractive|selon\s*profil|à\s*négocier)/i, impact: -6, label: "Salaire non précisé" }
    ],

    // Vérifications de qualité spécifiques HelloWork
    qualityChecks: [
      { check: (desc) => desc && desc.length < 300, impact: -10, label: "Description trop courte" },
      { check: (desc) => desc && (desc.match(/\n/g) || []).length < 5, impact: -5, label: "Peu structurée" },
      { check: (company) => company && company.toLowerCase().includes('recrutement'), impact: -8, label: "Cabinet de recrutement" },
      { check: (company) => company && /interim|adecco|manpower|randstad|synergie/i.test(company), impact: -6, label: "Agence d'intérim" }
    ]
  };

  function applyHelloWorkRedFlags(text, jobData) {
    let totalImpact = 0;
    const flags = [];

    // Appliquer les patterns de plateforme
    for (const flag of HELLOWORK_RED_FLAGS.platformPatterns) {
      if (flag.pattern.test(text)) {
        totalImpact += flag.impact;
        flags.push({ label: flag.label, impact: flag.impact });
      }
    }

    // Appliquer les patterns de fausses offres
    for (const flag of HELLOWORK_RED_FLAGS.fakeJobPatterns) {
      if (flag.pattern.test(text)) {
        totalImpact += flag.impact;
        flags.push({ label: flag.label, impact: flag.impact });
      }
    }

    // Appliquer les vérifications de qualité
    for (const check of HELLOWORK_RED_FLAGS.qualityChecks) {
      const value = check.check.length === 1 ? jobData.description : jobData.company;
      if (check.check(value)) {
        totalImpact += check.impact;
        flags.push({ label: check.label, impact: check.impact });
      }
    }

    return { totalImpact, flags };
  }

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
    },

    // Extraire le nombre de candidatures si disponible
    extractApplicantCount(text) {
      // Formats HelloWork: "X candidatures", "X personnes ont postulé", "Postulez parmi les X premiers"
      const patterns = [
        /(\d+)\s*(?:candidatures?|candidats?)/i,
        /(\d+)\s*(?:personnes?\s*ont\s*postulé)/i,
        /postulé\s*par\s*(\d+)/i,
        /parmi\s*les\s*(\d+)\s*premiers?/i,
        /déjà\s*(\d+)\s*candidat/i
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return parseInt(match[1]);
        }
      }
      return null;
    },

    // Détecter si l'offre est republiée/actualisée
    isReposted(text) {
      return /republiée|actualisée|mise\s*à\s*jour|prolongée/i.test(text);
    },

    // Extraire le nombre de jours depuis publication
    extractPostedDaysAgo(text) {
      let match = text.match(/publiée?\s*(il\s*y\s*a\s*)?(\d+)\s*(?:jours?)/i);
      if (match) return parseInt(match[2]);

      match = text.match(/il\s*y\s*a\s*(\d+)\s*(?:semaines?)/i);
      if (match) return parseInt(match[1]) * 7;

      match = text.match(/il\s*y\s*a\s*(\d+)\s*(?:mois)/i);
      if (match) return parseInt(match[1]) * 30;

      if (/aujourd'?hui|ce\s*jour/i.test(text)) return 0;
      if (/hier/i.test(text)) return 1;

      return null;
    }
  };

  // ============================================================================
  // MARQUEURS VISUELS DE FLAGS
  // ============================================================================

  function addFlagMarkers(card, result) {
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

    // Green Flags si pas de red flags
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

    if (container.children.length > 0) {
      if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
      card.appendChild(container);
    }
  }

  // ============================================================================
  // UI
  // ============================================================================

  const UI = {
    createBadge(result) {
      const badge = document.createElement('div');
      const cls = result.classification;
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
      badge.innerHTML = `
        <span>${cls.label}</span>
        <span style="background: ${cls.color}25; padding: 2px 5px; border-radius: 8px; font-weight: 700;">${result.pertinenceScore}%</span>
      `;
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
      const hw = result.helloworkData || {};

      const diplomaLabels = {
        'cap_bep': t('diploma.capBep'), 'bac': t('diploma.bac'), 'bac2': t('diploma.bac2'),
        'bac3': t('diploma.bac3'), 'bac5': t('diploma.bac5'), 'bac8': t('diploma.bac8')
      };

      const remoteLabels = {
        'complet': t('remote.full'),
        'partiel': t('remote.partial'),
        'occasionnel': t('remote.occasional'),
        'possible': t('remote.possible')
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
            <button class="fjd-close" aria-label="Fermer le panneau" style="background: none; border: none; font-size: 26px; cursor: pointer; color: #475569; padding: 8px; border-radius: 6px; transition: background 0.2s;">&times;</button>
          </div>
          ${result.jobTitle ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid ${cls.color}25;">
              <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; line-height: 1.4;">${result.jobTitle}</h2>
              ${result.company ? `<p style="font-size: 13px; color: #64748b; margin: 4px 0 0 0;">${result.company}</p>` : ''}
            </div>
          ` : ''}
        </header>

        <main style="padding: 18px 20px; overflow-y: auto; flex: 1; min-height: 0;">
          <section aria-label="Analyse du profil" style="background: #f8fafc; border-radius: 8px; padding: 14px; margin-bottom: 18px;">
            <h3 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 10px 0;">Analyse du profil</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
              <div><span style="color: #64748b;">Diplôme:</span> <strong style="color: #1e293b;">${d.diploma ? diplomaLabels[d.diploma] : 'Non précisé'}</strong></div>
              <div><span style="color: #64748b;">Expérience:</span> <strong style="color: #1e293b;">${d.experience !== null ? d.experience + ' an' + (d.experience > 1 ? 's' : '') : 'Non précisé'}</strong></div>
              <div><span style="color: #64748b;">Contrat:</span> <strong style="color: #1e293b;">${hw.contractType || '-'}</strong></div>
              <div><span style="color: #64748b;">Localisation:</span> <strong style="color: #1e293b;">${d.location || '-'}</strong></div>
            </div>
            ${hw.remoteWork ? `<div style="margin-top: 8px;"><span style="color: #64748b; font-size: 13px;">Mode:</span> <strong style="color: #0d9488; font-size: 13px;">${remoteLabels[hw.remoteWork] || hw.remoteWork}</strong></div>` : ''}
            ${hw.isAgency ? `<div role="status" style="margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 4px; font-size: 12px; color: #92400e; font-weight: 500;">Cabinet de recrutement</div>` : ''}
            ${d.salary ? `
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
                <span style="color: #64748b; font-size: 13px;">Salaire:</span>
                <strong style="color: #1e293b; font-size: 13px;">${Math.round(d.salary.min/1000)}k - ${Math.round(d.salary.max/1000)}k€/an</strong>
                ${s.market.expected ? `<span style="color: #64748b; font-size: 12px;"> (attendu: ${Math.round(s.market.expected.min/1000)}k-${Math.round(s.market.expected.max/1000)}k€)</span>` : ''}
              </div>
            ` : '<div role="alert" style="margin-top: 10px; padding: 6px 10px; background: #fef2f2; border-radius: 4px; font-size: 12px; color: #dc2626; font-weight: 500;">Salaire non communiqué</div>'}
          </section>

          <section aria-label="Scores par critère" style="margin-bottom: 18px;">
            <h3 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 12px 0;">Scores par critère</h3>
            ${[
              { name: 'Légitimité', score: s.legitimacy.score, desc: 'Authenticité' },
              { name: 'Marché', score: s.market.score, desc: 'Salaire vs marché' },
              { name: 'Qualité', score: s.quality.score, desc: 'Rédaction' },
              { name: 'Profil', score: s.profile.score, desc: 'Diplôme/exp' },
              { name: 'Cohérence', score: s.coherence.score, desc: 'Logique' }
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
            <section aria-label="Analyse salariale" style="margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #334155; margin: 0 0 8px 0;">Analyse salariale</h4>
              <ul style="font-size: 13px; color: #64748b; margin: 0; padding-left: 18px; line-height: 1.6;">${s.market.details.map(det => `<li>${det}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.greenFlags.length > 0 ? `
            <section aria-label="Points positifs" style="background: #f0fdf4; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #166534; margin: 0 0 8px 0;">Points positifs (${result.signals.greenFlags.length})</h4>
              <div style="font-size: 13px; color: #15803d; line-height: 1.6;">
                ${result.signals.greenFlags.slice(0, 6).map(f => `<span style="display: inline-block; background: #dcfce7; padding: 4px 8px; border-radius: 4px; margin: 3px 6px 3px 0;">${f.label}</span>`).join('')}
              </div>
            </section>
          ` : ''}

          ${result.signals.redFlags.length > 0 ? `
            <section aria-label="Alertes" role="alert" style="background: #fef2f2; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #991b1b; margin: 0 0 8px 0;">Alertes (${result.signals.redFlags.length})</h4>
              <ul style="font-size: 13px; color: #dc2626; margin: 0; padding-left: 18px; line-height: 1.6;">${result.signals.redFlags.slice(0, 5).map(f => `<li>${f.label}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.warnings.length > 0 ? `
            <section aria-label="Points d'attention" style="background: #fffbeb; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #92400e; margin: 0 0 8px 0;">Points d'attention</h4>
              <ul style="font-size: 13px; color: #b45309; margin: 0; padding-left: 18px; line-height: 1.6;">${result.signals.warnings.slice(0, 4).map(w => `<li>${w}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.recommendations.length > 0 ? `
            <section aria-label="Recommandations" style="background: #eff6ff; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px;">
              <h4 style="font-size: 13px; font-weight: 600; color: #1e40af; margin: 0 0 8px 0;">Recommandations</h4>
              <ul style="font-size: 13px; color: #2563eb; margin: 0; padding-left: 18px; line-height: 1.6;">${result.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${careerData.debouches && careerData.debouches.length > 0 ? `
            <section aria-label="Évolutions de carrière" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #a7f3d0;">
              <h4 style="font-size: 13px; font-weight: 600; color: #059669; margin: 0 0 10px 0;">
                Évolutions de carrière possibles
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
            <section aria-label="Pistes de reconversion" style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 8px; padding: 14px; margin-bottom: 14px; border: 1px solid #c4b5fd;">
              <h4 style="font-size: 13px; font-weight: 600; color: #7c3aed; margin: 0 0 10px 0;">
                Pistes de reconversion
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
              Voir l'analyse salariale complète
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
              experienceYears: hw.experience || d.experience || 3,
              sector: hw.sector || 'default',
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
    const applicantCount = HelloWorkParser.extractApplicantCount(fullText);

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
        sector,
        applicantCount,
        isReposted: HelloWorkParser.isReposted(fullText),
        postedDaysAgo: HelloWorkParser.extractPostedDaysAgo(fullText)
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

    // Appliquer les red flags spécifiques HelloWork
    const fullText = card.textContent || '';
    const helloworkFlags = applyHelloWorkRedFlags(fullText, jobData);

    // Analyser avec l'analyseur de pertinence - avec contexte HelloWork
    const result = Analyzer.evaluate(jobData, {
      platform: 'hellowork',
      applicantCount: jobData.helloworkData.applicantCount,
      isReposted: jobData.helloworkData.isReposted,
      postedDaysAgo: jobData.helloworkData.postedDaysAgo
    });

    // Ajouter les flags HelloWork aux red flags existants
    if (helloworkFlags.flags.length > 0) {
      for (const flag of helloworkFlags.flags) {
        result.signals.redFlags.push({ label: flag.label, impact: flag.impact, severity: 'medium' });
      }
      // Ajuster le score final avec les pénalités HelloWork
      result.pertinenceScore = Math.max(0, result.pertinenceScore + helloworkFlags.totalImpact);
      // Recalculer la classification si nécessaire
      if (result.pertinenceScore < result.classification.minScore) {
        const CLASSIFICATIONS = Analyzer.CLASSIFICATIONS;
        for (const cls of Object.values(CLASSIFICATIONS)) {
          if (result.pertinenceScore >= cls.minScore) {
            result.classification = { ...cls };
            break;
          }
        }
      }
    }

    // Ajouter les données HelloWork au résultat
    result.helloworkData = jobData.helloworkData;
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
    const applicantCount = HelloWorkParser.extractApplicantCount(pageText);
    const isReposted = HelloWorkParser.isReposted(pageText);
    const postedDaysAgo = HelloWorkParser.extractPostedDaysAgo(pageText);

    const jobData = {
      title,
      company: document.querySelector(SELECTORS.company)?.textContent?.trim() || '',
      location: document.querySelector(SELECTORS.location)?.textContent?.trim() || '',
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: container.textContent || '',
      helloworkData: { salary, diploma, experience, contractType, remoteWork, isAgency, applicantCount, isReposted, postedDaysAgo }
    };

    // Appliquer les red flags spécifiques HelloWork
    const helloworkFlags = applyHelloWorkRedFlags(pageText, jobData);

    // Analyser avec contexte HelloWork
    const result = Analyzer.evaluate(jobData, {
      platform: 'hellowork',
      applicantCount: applicantCount,
      isReposted: isReposted,
      postedDaysAgo: postedDaysAgo
    });

    // Ajouter les flags HelloWork
    if (helloworkFlags.flags.length > 0) {
      for (const flag of helloworkFlags.flags) {
        result.signals.redFlags.push({ label: flag.label, impact: flag.impact, severity: 'medium' });
      }
      result.pertinenceScore = Math.max(0, result.pertinenceScore + helloworkFlags.totalImpact);
    }

    result.helloworkData = jobData.helloworkData;
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
