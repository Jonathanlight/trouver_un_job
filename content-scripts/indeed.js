/**
 * Fake Job Detector - Indeed v3.0
 * Détection améliorée avec extraction structurée des données Indeed
 */

(function() {
  'use strict';

  console.log('[FJD] Indeed content script chargé');

  if (!window.FJD_PertinenceAnalyzer) {
    console.error('[FJD] Analyseur de pertinence non disponible');
    return;
  }

  const Analyzer = window.FJD_PertinenceAnalyzer;
  const SalaryAnalyzer = window.FJD_SalaryMarketAnalyzer;

  const SELECTORS = {
    jobCards: '[data-jk]:not([data-fjd-processed]), .job_seen_beacon:not([data-fjd-processed]), .jobsearch-ResultsList > li:not([data-fjd-processed]), .resultContent:not([data-fjd-processed])',
    jobTitle: '.jobTitle, .jcs-JobTitle, h2.jobTitle > a, [data-testid="jobTitle"], a[data-jk]',
    company: '.companyName, [data-testid="company-name"], .company, .css-63koeb',
    location: '.companyLocation, [data-testid="text-location"], .css-1p0sjhy',
    salary: '.salary-snippet, .salaryText, [data-testid="attribute_snippet_testid"], .metadata.salary-snippet-container, .css-1cvvo1b',
    contractType: '.metadata, [data-testid="attribute_snippet_testid"]',
    detailContainer: '#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="jobDescriptionText"]',
    detailTitle: '.jobsearch-JobInfoHeader-title, h1[data-testid="jobTitle"], .icl-u-xs-mb--xs',
    detailCompany: '[data-testid="inlineHeader-companyName"], .jobsearch-InlineCompanyRating-companyHeader'
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
  // EXTRACTION DE DONNÉES SPÉCIFIQUE INDEED
  // ============================================================================

  const IndeedParser = {
    // Extraire le salaire du texte Indeed
    // Formats: "2 000 € - 2 500 € par mois", "35 000 € - 45 000 € par an", "De 30 000 € à 35 000 €"
    extractSalary(text) {
      // Format: XX XXX € - XX XXX € par an
      let match = text.match(/(\d{1,3})\s*(\d{3})\s*€?\s*[-–àa]\s*(\d{1,3})\s*(\d{3})\s*€\s*(?:par\s*an|\/\s*an|annuel|brut\s*annuel)/i);
      if (match) {
        return {
          min: parseInt(match[1] + match[2]),
          max: parseInt(match[3] + match[4]),
          type: 'annual',
          raw: match[0]
        };
      }

      // Format: XX XXX € par an (unique)
      match = text.match(/(\d{1,3})\s*(\d{3})\s*€\s*(?:par\s*an|\/\s*an|annuel)/i);
      if (match) {
        const val = parseInt(match[1] + match[2]);
        return { min: val * 0.9, max: val * 1.1, type: 'annual', raw: match[0] };
      }

      // Format mensuel: X XXX € - X XXX € par mois
      match = text.match(/(\d{1,2})\s*(\d{3})\s*€?\s*[-–àa]\s*(\d{1,2})\s*(\d{3})\s*€\s*(?:par\s*mois|\/\s*mois|mensuel)/i);
      if (match) {
        const min = parseInt(match[1] + match[2]) * 12;
        const max = parseInt(match[3] + match[4]) * 12;
        return { min, max, type: 'monthly', raw: match[0] };
      }

      // Format: De XX XXX € à XX XXX €
      match = text.match(/de\s*(\d{1,3})\s*(\d{3})\s*€\s*à\s*(\d{1,3})\s*(\d{3})\s*€/i);
      if (match) {
        return {
          min: parseInt(match[1] + match[2]),
          max: parseInt(match[3] + match[4]),
          type: 'annual',
          raw: match[0]
        };
      }

      // Format: XXk - XXk€
      match = text.match(/(\d{2,3})\s*k\s*€?\s*[-–àa]\s*(\d{2,3})\s*k/i);
      if (match) {
        return {
          min: parseInt(match[1]) * 1000,
          max: parseInt(match[2]) * 1000,
          type: 'annual',
          raw: match[0]
        };
      }

      // Format horaire: XX,XX €/heure
      match = text.match(/(\d{1,2})[,.](\d{2})\s*€\s*(?:\/\s*heure|de\s*l'heure|par\s*heure|\/h)/i);
      if (match) {
        const hourly = parseFloat(match[1] + '.' + match[2]);
        const annual = hourly * 35 * 52;
        return { min: annual * 0.9, max: annual * 1.1, type: 'hourly', hourlyRate: hourly, raw: match[0] };
      }

      return null;
    },

    // Extraire le niveau de diplôme
    extractDiploma(text) {
      const levels = {
        'bac8': /bac\s*\+?\s*8|doctorat|phd/i,
        'bac5': /bac\s*\+?\s*5|master|ingénieur|grandes?\s*écoles?/i,
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
    extractExperience(text) {
      // Format: X ans d'expérience / X+ ans
      let match = text.match(/(\d+)\s*\+?\s*ans?\s*(?:d['']?)?(?:expérience|exp\.?|minimum)/i);
      if (match) return parseInt(match[1]);

      // Format: X à Y ans
      match = text.match(/(\d+)\s*[-àa]\s*(\d+)\s*ans?/i);
      if (match) return Math.round((parseInt(match[1]) + parseInt(match[2])) / 2);

      // Débutant
      if (/débutant|sans\s*expérience|junior|première\s*expérience/i.test(text)) return 0;

      // Senior/Confirmé
      if (/senior|expert/i.test(text)) return 7;
      if (/confirmé|expérimenté/i.test(text)) return 4;

      return null;
    },

    // Extraire le type de contrat
    extractContractType(text) {
      if (/\bcdi\b/i.test(text)) return 'CDI';
      if (/\bcdd\b/i.test(text)) return 'CDD';
      if (/\bintérim\b/i.test(text)) return 'Intérim';
      if (/\bstage\b/i.test(text)) return 'Stage';
      if (/\balternance\b|apprentissage/i.test(text)) return 'Alternance';
      if (/\bfreelance\b|indépendant/i.test(text)) return 'Freelance';
      if (/temps\s*partiel/i.test(text)) return 'Temps partiel';
      if (/temps\s*plein/i.test(text)) return 'Temps plein';
      return null;
    },

    // Extraire le télétravail
    extractRemoteWork(text) {
      if (/100\s*%\s*(?:remote|télétravail)|télétravail\s*(?:complet|total)|full\s*remote/i.test(text)) return 'complet';
      if (/télétravail\s*(?:partiel|hybride)|hybrid/i.test(text)) return 'partiel';
      if (/télétravail\s*(?:occasionnel|ponctuel)/i.test(text)) return 'occasionnel';
      if (/télétravail|remote|travail\s*à\s*distance/i.test(text)) return 'possible';
      return null;
    },

    // Détecter si c'est un cabinet de recrutement/intérim
    isRecruitmentAgency(text) {
      return /cabinet\s*(?:de\s*)?recrutement|agence\s*(?:d['']?)?intérim|interim|adecco|manpower|randstad|proman|synergie|page\s*personnel|michael\s*page|hays|spring|expectra/i.test(text);
    },

    // Détecter le secteur d'activité
    extractSector(text) {
      const sectors = [
        { name: 'tech', pattern: /informatique|développ|software|saas|tech|digital|data|cloud|cyber|devops/i },
        { name: 'finance', pattern: /banque|assurance|finance|comptab|audit/i },
        { name: 'sante', pattern: /santé|médical|pharma|hôpital|clinique/i },
        { name: 'commerce', pattern: /commerce|retail|distribution|vente/i },
        { name: 'industrie', pattern: /industrie|manufactur|production|usine/i },
        { name: 'services', pattern: /services?\s*aux\s*entreprises|conseil|consulting/i },
        { name: 'energie', pattern: /énergie|électric|nucléaire|renouvelable/i }
      ];

      for (const sector of sectors) {
        if (sector.pattern.test(text)) return sector.name;
      }
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
      const extra = result.indeedData || {};

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
              <div><span style="color: #64748b;">Contrat:</span> <strong style="color: #1e293b;">${extra.contractType || '-'}</strong></div>
              <div><span style="color: #64748b;">Localisation:</span> <strong style="color: #1e293b;">${d.location || '-'}</strong></div>
            </div>
            ${extra.remoteWork ? `<div style="margin-top: 8px;"><span style="color: #64748b; font-size: 13px;">Mode:</span> <strong style="color: #0d9488; font-size: 13px;">${remoteLabels[extra.remoteWork] || extra.remoteWork}</strong></div>` : ''}
            ${extra.isAgency ? `<div role="status" style="margin-top: 8px; padding: 6px 10px; background: #fef3c7; border-radius: 4px; font-size: 12px; color: #92400e; font-weight: 500;">Via cabinet de recrutement / intérim</div>` : ''}
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

      // Analyse salariale complète
      const salaryToggle = panel.querySelector('#fjd-salary-toggle');
      if (salaryToggle && SalaryAnalyzer && d.salary) {
        salaryToggle.onclick = () => {
          const container = panel.querySelector('#fjd-salary-analysis-container');
          if (container.innerHTML) {
            container.innerHTML = '';
            salaryToggle.textContent = '📊 Voir l\'analyse salariale complète';
            salaryToggle.classList.remove('fjd-salary-toggle--expanded');
          } else {
            const avgSalary = Math.round((d.salary.min + d.salary.max) / 2);
            const analysis = SalaryAnalyzer.analyze({
              offeredSalary: avgSalary,
              experienceYears: d.experience,
              sector: extra.sector || d.sector || 'default',
              location: d.location?.toLowerCase().includes('paris') ? 'paris' :
                        d.location?.toLowerCase().includes('lyon') ? 'lyon' : 'province',
              isCadre: true
            });
            container.innerHTML = SalaryAnalyzer.generateHTML(analysis);
            salaryToggle.textContent = '✕ Masquer l\'analyse salariale';
            salaryToggle.classList.add('fjd-salary-toggle--expanded');
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

    // Extraction des données structurées Indeed
    const salary = IndeedParser.extractSalary(fullText);
    const diploma = IndeedParser.extractDiploma(fullText);
    const experience = IndeedParser.extractExperience(fullText);
    const contractType = IndeedParser.extractContractType(fullText);
    const remoteWork = IndeedParser.extractRemoteWork(fullText);
    const isAgency = IndeedParser.isRecruitmentAgency(fullText);
    const sector = IndeedParser.extractSector(fullText);

    // Enrichir le texte pour l'analyseur
    let enrichedText = fullText;
    if (salary) {
      enrichedText += ` salaire ${salary.min} à ${salary.max} € `;
    }

    return {
      title: getText(SELECTORS.jobTitle),
      company: getText(SELECTORS.company),
      location: getText(SELECTORS.location),
      salary: salary ? `${salary.min} - ${salary.max} € / an` : getText(SELECTORS.salary),
      description: enrichedText,
      indeedData: { salary, diploma, experience, contractType, remoteWork, isAgency, sector }
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
    result.indeedData = jobData.indeedData;
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

    console.log(`[FJD] Indeed: "${jobData.title.substring(0, 40)}..." - ${result.pertinenceScore}%`, {
      salary: jobData.indeedData.salary,
      diploma: jobData.indeedData.diploma,
      exp: jobData.indeedData.experience
    });
  }

  function analyzeDetail() {
    const container = document.querySelector(SELECTORS.detailContainer);
    if (!container || container.hasAttribute('data-fjd')) return;
    container.setAttribute('data-fjd', 'true');

    const pageText = document.body.textContent || '';
    const salary = IndeedParser.extractSalary(pageText);
    const diploma = IndeedParser.extractDiploma(pageText);
    const experience = IndeedParser.extractExperience(pageText);
    const contractType = IndeedParser.extractContractType(pageText);
    const remoteWork = IndeedParser.extractRemoteWork(pageText);
    const isAgency = IndeedParser.isRecruitmentAgency(pageText);

    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    const jobData = {
      title: getText(SELECTORS.detailTitle),
      company: getText(SELECTORS.detailCompany),
      salary: salary ? `${salary.min} - ${salary.max} € / an` : '',
      description: container.textContent || '',
      indeedData: { salary, diploma, experience, contractType, remoteWork, isAgency }
    };

    if (!jobData.title && !jobData.description) return;

    const result = Analyzer.evaluate(jobData, {});
    result.indeedData = jobData.indeedData;
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
      // Stratégie alternative
      const links = document.querySelectorAll('a[data-jk], a[href*="/viewjob"], a[href*="/rc/clk"]');
      const cardSet = new Set();
      links.forEach(link => {
        let parent = link.closest('[data-jk]') || link.closest('.job_seen_beacon') || link.closest('li');
        if (parent) cardSet.add(parent);
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

    console.log(`[FJD] Indeed: ${cards.length} cartes trouvées`);
    cards.forEach(analyzeCard);
    analyzeDetail();
    retryCount = 0;
  }

  function init() {
    console.log('[FJD] Indeed analyzer v3.0 initialisé');
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
        document.querySelectorAll('[data-fjd-processed], [data-fjd]').forEach(el => {
          el.removeAttribute('data-fjd-processed');
          el.removeAttribute('data-fjd');
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