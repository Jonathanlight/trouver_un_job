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
    },

    // Détecter si l'offre est republiée/actualisée
    isReposted(text) {
      return /republiée|actualisée|mise\s*à\s*jour|prolongée/i.test(text);
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
      marker.textContent = `🔄 Republiée`;
      container.appendChild(marker);
    }

    if (result.entryLevelCheck?.isIncoherent) {
      const marker = document.createElement('span');
      marker.style.cssText = `
        display: inline-flex; align-items: center; gap: 2px;
        padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600;
        background: #fef3c7; color: #b45309; border: 1px solid #fcd34d;
      `;
      marker.textContent = `⚡ Incohérent`;
      marker.title = result.entryLevelCheck.issues[0]?.label || 'Incohérence détectée';
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

      // Analyse des débouchés et reconversions
      const CareerPathways = window.FJD_CareerPathways;
      const careerData = CareerPathways ? CareerPathways.analyze(result.jobTitle || '') : { debouches: [], reconversion: [] };

      panel.innerHTML = `
        <header style="background: linear-gradient(135deg, ${cls.bgColor} 0%, ${cls.color}18 100%); padding: 20px 24px; border-bottom: 1px solid ${cls.color}25; flex-shrink: 0; border-radius: 16px 16px 0 0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div id="fjd-panel-title" style="font-size: 32px; font-weight: 800; color: ${cls.color}; letter-spacing: -0.5px; line-height: 1.1;">${result.pertinenceScore}%</div>
              <div style="font-size: 15px; font-weight: 600; color: ${cls.color}; margin-top: 4px;">${cls.label}</div>
            </div>
            <button class="fjd-close" aria-label="Fermer le panneau" style="background: rgba(0,0,0,0.1); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 20px; cursor: pointer; color: #374151; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">&times;</button>
          </div>
          ${result.jobTitle ? `
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid ${cls.color}20;">
              <h2 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3;">${result.jobTitle}</h2>
              ${result.company ? `<p style="font-size: 14px; color: #475569; margin: 6px 0 0 0;">${result.company}</p>` : ''}
            </div>
          ` : ''}
        </header>

        <main style="padding: 20px 24px; overflow-y: auto; flex: 1; min-height: 0;">
          <section style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 20px;" aria-label="Analyse du profil">
            <h3 style="font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">Analyse du profil</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px;">
              <div style="line-height: 1.4;"><span style="color: #64748b;">Diplôme:</span> <strong style="color: #0f172a;">${d.diploma ? diplomaLabels[d.diploma] : 'Non précisé'}</strong></div>
              <div style="line-height: 1.4;"><span style="color: #64748b;">Expérience:</span> <strong style="color: #0f172a;">${d.experience !== null ? d.experience + ' an' + (d.experience > 1 ? 's' : '') : 'Non précisé'}</strong></div>
              <div style="line-height: 1.4;"><span style="color: #64748b;">Contrat:</span> <strong style="color: #0f172a;">${extra.contractType || '-'}</strong></div>
              <div style="line-height: 1.4;"><span style="color: #64748b;">Lieu:</span> <strong style="color: #0f172a;">${d.location || extra.location || '-'}</strong></div>
            </div>
            ${extra.remoteWork ? `<div style="margin-top: 10px; font-size: 14px; line-height: 1.4;"><span style="color: #64748b;">Mode:</span> <strong style="color: #0d9488;">${remoteLabels[extra.remoteWork] || extra.remoteWork}</strong></div>` : ''}
            ${extra.companySize ? `<div style="margin-top: 8px; font-size: 14px; line-height: 1.4;"><span style="color: #64748b;">Taille:</span> <strong style="color: #0f172a;">${extra.companySize.toLocaleString()} collaborateurs</strong></div>` : ''}
            ${extra.sector ? `<div style="margin-top: 8px; font-size: 14px; line-height: 1.4;"><span style="color: #64748b;">Secteur:</span> <strong style="color: #4f46e5;">${extra.sector}</strong></div>` : ''}
            ${d.salary ? `
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 14px; line-height: 1.4;">
                <span style="color: #64748b;">Salaire:</span>
                <strong style="color: #0f172a;">${Math.round(d.salary.min/1000)}k - ${Math.round(d.salary.max/1000)}k€/an</strong>
                ${s.market.expected ? `<span style="color: #64748b; font-size: 13px;"> (attendu: ${Math.round(s.market.expected.min/1000)}k-${Math.round(s.market.expected.max/1000)}k€)</span>` : ''}
              </div>
            ` : '<div style="margin-top: 12px; padding: 10px 12px; background: #fef2f2; border-radius: 8px; font-size: 13px; color: #b91c1c; font-weight: 500;">Salaire non communiqué</div>'}
          </section>

          <section style="margin-bottom: 20px;" aria-label="Scores par critère">
            <h3 style="font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 14px 0; text-transform: uppercase; letter-spacing: 0.5px;">Scores par critère</h3>
            ${[
              { name: 'Légitimité', score: s.legitimacy.score, desc: 'Authenticité' },
              { name: 'Marché', score: s.market.score, desc: 'Salaire vs marché' },
              { name: 'Qualité', score: s.quality.score, desc: 'Rédaction' },
              { name: 'Profil', score: s.profile.score, desc: 'Diplôme/exp' },
              { name: 'Cohérence', score: s.coherence.score, desc: 'Logique' }
            ].map(item => {
              const col = item.score >= 70 ? '#15803d' : item.score >= 50 ? '#a16207' : '#b91c1c';
              return `
                <div style="margin-bottom: 10px;" role="meter" aria-valuenow="${item.score}" aria-valuemin="0" aria-valuemax="100" aria-label="${item.name}: ${item.score}%">
                  <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; line-height: 1.4;">
                    <span style="color: #1e293b; font-weight: 500;">${item.name} <span style="color: #64748b; font-weight: 400;">(${item.desc})</span></span>
                    <span style="color: ${col}; font-weight: 700;">${item.score}%</span>
                  </div>
                  <div style="height: 6px; background: #e2e8f0; border-radius: 3px;" role="presentation">
                    <div style="width: ${item.score}%; height: 100%; background: ${col}; border-radius: 3px; transition: width 0.3s ease;"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </section>

          ${s.market.details.length > 0 ? `
            <section style="margin-bottom: 16px;" aria-label="Détails salariaux">
              <h4 style="font-size: 13px; font-weight: 700; color: #334155; margin: 0 0 10px 0;">Détails salariaux</h4>
              <ul style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0; padding-left: 20px;">${s.market.details.map(det => `<li style="margin-bottom: 4px;">${det}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.greenFlags.length > 0 ? `
            <section style="background: #f0fdf4; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #bbf7d0;" aria-label="Points positifs">
              <h4 style="font-size: 13px; font-weight: 700; color: #166534; margin: 0 0 10px 0;">Points positifs (${result.signals.greenFlags.length})</h4>
              <div style="font-size: 13px; color: #166534; line-height: 1.5;">
                ${result.signals.greenFlags.slice(0, 6).map(f => `<span style="display: inline-block; background: #dcfce7; padding: 4px 10px; border-radius: 6px; margin: 3px 6px 3px 0; font-weight: 500;">${f.label}</span>`).join('')}
              </div>
            </section>
          ` : ''}

          ${result.signals.redFlags.length > 0 ? `
            <section style="background: #fef2f2; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #fecaca;" aria-label="Alertes" role="alert">
              <h4 style="font-size: 13px; font-weight: 700; color: #991b1b; margin: 0 0 10px 0;">Alertes (${result.signals.redFlags.length})</h4>
              <ul style="font-size: 13px; color: #b91c1c; line-height: 1.6; margin: 0; padding-left: 20px;">${result.signals.redFlags.slice(0, 5).map(f => `<li style="margin-bottom: 4px;">${f.label}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.signals.warnings.length > 0 ? `
            <section style="background: #fffbeb; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #fde68a;" aria-label="Points d'attention">
              <h4 style="font-size: 13px; font-weight: 700; color: #92400e; margin: 0 0 10px 0;">Points d'attention</h4>
              <ul style="font-size: 13px; color: #a16207; line-height: 1.6; margin: 0; padding-left: 20px;">${result.signals.warnings.slice(0, 4).map(w => `<li style="margin-bottom: 4px;">${w}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${result.recommendations.length > 0 ? `
            <section style="background: #eff6ff; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; border: 1px solid #bfdbfe;" aria-label="Recommandations">
              <h4 style="font-size: 13px; font-weight: 700; color: #1e40af; margin: 0 0 10px 0;">Recommandations</h4>
              <ul style="font-size: 13px; color: #1d4ed8; line-height: 1.6; margin: 0; padding-left: 20px;">${result.recommendations.map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join('')}</ul>
            </section>
          ` : ''}

          ${careerData.debouches && careerData.debouches.length > 0 ? `
            <section style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #a7f3d0;" aria-label="Évolutions de carrière">
              <h4 style="font-size: 14px; font-weight: 700; color: #047857; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                <span aria-hidden="true">📈</span> Évolutions de carrière possibles
              </h4>
              <div style="font-size: 13px; color: #065f46;">
                ${careerData.debouches.map(deb => `
                  <div style="margin-bottom: 10px; padding-left: 14px; border-left: 3px solid #10b981;">
                    <div style="font-weight: 600; font-size: 14px; line-height: 1.4;">${deb.title}</div>
                    <div style="color: #047857; font-size: 12px; margin-top: 2px; line-height: 1.4;">${deb.years} • ${deb.desc}</div>
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}

          ${careerData.reconversion && careerData.reconversion.length > 0 ? `
            <section style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #c4b5fd;" aria-label="Pistes de reconversion">
              <h4 style="font-size: 14px; font-weight: 700; color: #6d28d9; margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px;">
                <span aria-hidden="true">🔄</span> Pistes de reconversion
              </h4>
              <div style="font-size: 13px; color: #5b21b6;">
                ${careerData.reconversion.map(rec => `
                  <div style="margin-bottom: 10px; padding-left: 14px; border-left: 3px solid #8b5cf6;">
                    <div style="font-weight: 600; font-size: 14px; line-height: 1.4;">${rec.title}</div>
                    <div style="color: #7c3aed; font-size: 12px; margin-top: 2px; line-height: 1.4;">${rec.desc}</div>
                  </div>
                `).join('')}
              </div>
            </section>
          ` : ''}

          <div id="fjd-salary-analysis-container" role="region" aria-label="Analyse salariale détaillée"></div>
          ${d.salary && SalaryAnalyzer ? `
            <button id="fjd-salary-toggle" class="fjd-salary-toggle" aria-expanded="false" aria-controls="fjd-salary-analysis-container" style="
              margin-top: 16px; width: 100%; padding: 14px 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white; border: none; border-radius: 10px;
              font-size: 14px; font-weight: 600; cursor: pointer;
              transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.35);
              display: flex; align-items: center; justify-content: center; gap: 8px;
            ">
              <span aria-hidden="true">📊</span> Voir l'analyse salariale complète
            </button>
          ` : ''}
        </main>
      `;

      document.body.appendChild(panel);
      panel.querySelector('.fjd-close').onclick = () => this.closePanel();
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
            salaryToggle.textContent = '📊 Voir l\'analyse salariale complète';
          } else {
            const avgSalary = Math.round((d.salary.min + d.salary.max) / 2);
            const analysis = SalaryAnalyzer.analyze({
              offeredSalary: avgSalary,
              experienceYears: extra.experience || d.experience || 3,
              sector: extra.sector || 'default',
              location: (d.location || extra.location || '').toLowerCase().includes('paris') ? 'paris' : 'province',
              isCadre: true
            });
            container.innerHTML = SalaryAnalyzer.generateHTML(analysis);
            salaryToggle.textContent = '📊 Masquer l\'analyse salariale';
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
      wttjData: {
        salary, diploma, experience, contractType, remoteWork, companySize, sector, jobAge, location,
        isReposted: WTTJParser.isReposted(fullText),
        postedDaysAgo: jobAge  // jobAge est déjà en jours
      }
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

    const result = Analyzer.evaluate(jobData, {
      platform: 'wttj',
      applicantCount: null,
      isReposted: jobData.wttjData.isReposted,
      postedDaysAgo: jobData.wttjData.postedDaysAgo
    });
    result.wttjData = jobData.wttjData;
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