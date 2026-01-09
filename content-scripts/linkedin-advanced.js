/**
 * Content Script - LinkedIn Jobs (Version Avancée)
 * Analyse améliorée avec multi-classification, comparaison marché et agents IA
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    thresholds: { suspect: 30, danger: 50, scam: 70 },
    linkedin: {
      highApplicants: 50,       // À partir de 50 = concurrence élevée
      veryHighApplicants: 100,  // À partir de 100 = très élevée
      ghostJobApplicants: 300,  // Ghost job probable
      criticalApplicants: 500   // Ghost job certain
    },
    posting: {
      oldWeeks: 3,              // Plus de 3 semaines = offre ancienne
      veryOldWeeks: 6           // Plus de 6 semaines = très ancienne
    },
    marketMultipliers: { paris: 1.15, grandesVilles: 1.05, regions: 0.95 }
  };

  // ============================================================================
  // DONNÉES MARCHÉ INTÉGRÉES
  // ============================================================================

  const MARKET_DATA = {
    salaryRanges: {
      'tech': { junior: [32000, 42000], confirme: [42000, 55000], senior: [55000, 75000], manager: [75000, 110000] },
      'marketing': { junior: [28000, 35000], confirme: [35000, 48000], senior: [48000, 65000], manager: [65000, 90000] },
      'commercial': { junior: [26000, 35000], confirme: [35000, 50000], senior: [48000, 70000], manager: [70000, 100000] },
      'finance': { junior: [32000, 42000], confirme: [42000, 58000], senior: [55000, 80000], manager: [85000, 130000] },
      'rh': { junior: [28000, 35000], confirme: [35000, 48000], senior: [45000, 62000], manager: [65000, 90000] },
      'default': { junior: [26000, 35000], confirme: [35000, 48000], senior: [46000, 65000], manager: [68000, 95000] }
    }
  };

  // ============================================================================
  // CLASSIFICATIONS
  // ============================================================================

  const CLASSIFICATIONS = {
    LEGITIME: { code: 'LEGITIME', label: 'Légitime', icon: '✅', color: '#16a34a', bgColor: '#dcfce7' },
    PROFESSIONNELLE: { code: 'PROFESSIONNELLE', label: 'Professionnelle', icon: '💼', color: '#059669', bgColor: '#d1fae5' },
    ADAPTEE_MARCHE: { code: 'ADAPTEE_MARCHE', label: 'Adaptée au marché', icon: '📊', color: '#0d9488', bgColor: '#ccfbf1' },
    PASSABLE: { code: 'PASSABLE', label: 'Passable', icon: '⚡', color: '#ca8a04', bgColor: '#fef9c3' },
    SOUS_EVALUEE: { code: 'SOUS_EVALUEE', label: 'Sous-évaluée', icon: '📉', color: '#d97706', bgColor: '#fef3c7' },
    INCOHERENTE: { code: 'INCOHERENTE', label: 'Incohérente', icon: '🔀', color: '#ea580c', bgColor: '#ffedd5' },
    REPUBLICEE: { code: 'REPUBLICEE', label: 'Offre Republiée', icon: '🔄', color: '#9333ea', bgColor: '#f3e8ff' },
    CONCURRENCE_ELEVEE: { code: 'CONCURRENCE_ELEVEE', label: 'Forte concurrence', icon: '👥', color: '#0891b2', bgColor: '#cffafe' },
    OFFRE_ANCIENNE: { code: 'OFFRE_ANCIENNE', label: 'Offre ancienne', icon: '⏰', color: '#78716c', bgColor: '#f5f5f4' },
    A_VERIFIER: { code: 'A_VERIFIER', label: 'À vérifier', icon: '🔍', color: '#dc2626', bgColor: '#fee2e2' },
    GHOST_JOB: { code: 'GHOST_JOB', label: 'Ghost Job', icon: '👻', color: '#7c3aed', bgColor: '#ede9fe' },
    FAUSSE_OFFRE: { code: 'FAUSSE_OFFRE', label: 'Fausse offre', icon: '🎭', color: '#be185d', bgColor: '#fce7f3' },
    A_FUIR: { code: 'A_FUIR', label: 'À fuir', icon: '🚫', color: '#dc2626', bgColor: '#fee2e2' },
    ARNAQUE: { code: 'ARNAQUE', label: 'Arnaque', icon: '🚨', color: '#991b1b', bgColor: '#fecaca' }
  };

  // ============================================================================
  // PATTERNS DE DÉTECTION ÉTENDUS
  // ============================================================================

  const RED_FLAGS = {
    financial_scam: [
      { pattern: /paiement\s*(requis|nécessaire|obligatoire)/i, weight: 55, severity: 'critical', message: "Paiement requis avant embauche" },
      { pattern: /frais\s*(de\s*)?(inscription|formation|dossier)/i, weight: 55, severity: 'critical', message: "Frais demandés" },
      { pattern: /investissement\s*(initial|de\s*départ)/i, weight: 55, severity: 'critical', message: "Investissement initial demandé" },
      { pattern: /acheter?\s*(le\s*)?(kit|stock|matériel)/i, weight: 50, severity: 'critical', message: "Achat de matériel obligatoire" },
      { pattern: /virement\s*(bancaire)?\s*(pour|avant)/i, weight: 50, severity: 'critical', message: "Virement demandé" },
      { pattern: /crypto|bitcoin|ethereum|nft|web3/i, weight: 40, severity: 'high', message: "Mention crypto/NFT suspecte" }
    ],
    unrealistic_promises: [
      { pattern: /gagn(er|ez)\s*(jusqu'?à\s*)?\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, weight: 45, severity: 'critical', message: "Promesse de gains irréalistes" },
      { pattern: /revenu\s*(passif|illimité|garanti)/i, weight: 45, severity: 'critical', message: "Revenu passif/illimité promis" },
      { pattern: /devenez?\s*(riche|millionnaire)/i, weight: 50, severity: 'critical', message: "Promesse d'enrichissement rapide" },
      { pattern: /sans\s*(effort|travail|compétence)/i, weight: 40, severity: 'critical', message: "Promesse sans effort" },
      { pattern: /résultats?\s*garantis?/i, weight: 35, severity: 'high', message: "Résultats garantis" }
    ],
    abnormal_process: [
      { pattern: /embauche\s*(immédiate|garantie|sans\s*entretien)/i, weight: 40, severity: 'high', message: "Embauche sans processus normal" },
      { pattern: /pas\s*(d'?|de\s*)entretien/i, weight: 45, severity: 'critical', message: "Pas d'entretien requis" },
      { pattern: /commenc(er|ez)\s*(immédiatement|aujourd'?hui|demain)/i, weight: 35, severity: 'high', message: "Démarrage immédiat suspect" },
      { pattern: /urgent\s*!|!!!|recrutement\s*urgent/i, weight: 25, severity: 'medium', message: "Urgence excessive" },
      { pattern: /places?\s*limitées?|dernière\s*chance/i, weight: 30, severity: 'high', message: "Fausse rareté/pression" }
    ],
    mlm_network: [
      { pattern: /parrain(age|er)|filleul/i, weight: 45, severity: 'critical', message: "Structure de parrainage MLM" },
      { pattern: /réseau\s*(de\s*)?(vente|distribution)/i, weight: 40, severity: 'high', message: "Structure réseau MLM" },
      { pattern: /commission\s*(sur|de)\s*recrutement/i, weight: 45, severity: 'critical', message: "Commission de recrutement" },
      { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, weight: 45, severity: 'critical', message: "MLM détecté" },
      { pattern: /downline|upline|plan\s*de\s*compensation/i, weight: 50, severity: 'critical', message: "Terminologie MLM" }
    ],
    unprofessional_contact: [
      { pattern: /@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i, weight: 25, severity: 'medium', message: "Email non professionnel" },
      { pattern: /whatsapp|telegram\s*(pour\s*postuler|uniquement)/i, weight: 35, severity: 'high', message: "Contact via messagerie uniquement" },
      { pattern: /envoy(er|ez)\s*(cv|candidature)\s*(par|via)\s*(whatsapp|telegram)/i, weight: 40, severity: 'high', message: "CV via messagerie" }
    ],
    ghost_job_indicators: [
      { pattern: /publié(e)?\s*(il\s*y\s*a|depuis)\s*(plus\s*de\s*)?(3|4|5|6)\s*mois/i, weight: 35, severity: 'high', message: "Offre publiée depuis longtemps" },
      { pattern: /vivier\s*(de\s*)?(candidats?|talents?)/i, weight: 35, severity: 'high', message: "Constitution de vivier" },
      { pattern: /pour\s*(nos\s*)?futurs?\s*(besoins?|projets?)/i, weight: 30, severity: 'high', message: "Pas de besoin immédiat" }
    ],
    data_harvesting: [
      { pattern: /numéro\s*(de\s*)?(sécurité\s*sociale|sécu)/i, weight: 45, severity: 'critical', message: "N° sécu demandé" },
      { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|passeport)/i, weight: 40, severity: 'critical', message: "Pièce d'identité demandée" },
      { pattern: /rib\s*(avant|pour)/i, weight: 40, severity: 'critical', message: "RIB demandé avant embauche" }
    ],
    coherence_issues: [
      { pattern: /junior.{0,30}(10|15|20)\+?\s*ans?\s*(d')?exp/i, weight: 35, severity: 'high', message: "Incohérence niveau/expérience" },
      { pattern: /senior.{0,30}(0|1|2)\s*ans?\s*(d')?exp/i, weight: 30, severity: 'medium', message: "Senior avec peu d'expérience requise" },
      { pattern: /stage.{0,50}cdi(?!\s*après)/i, weight: 25, severity: 'medium', message: "Type de contrat contradictoire" }
    ]
  };

  const GREEN_FLAGS = [
    { pattern: /cdi\s*(temps\s*plein)?/i, weight: -12, message: "CDI précisé" },
    { pattern: /convention\s*collective/i, weight: -15, message: "Convention collective mentionnée" },
    { pattern: /mutuelle|tickets?\s*restaurant/i, weight: -8, message: "Avantages sociaux" },
    { pattern: /processus\s*(de\s*)?recrutement\s*:/i, weight: -12, message: "Processus de recrutement détaillé" },
    { pattern: /entretien(s)?\s*(avec|rh|technique|manager)/i, weight: -10, message: "Entretiens structurés" },
    { pattern: /\d{2}[\s,.]?\d{3}\s*[-àa]\s*\d{2}[\s,.]?\d{3}\s*(€|euros?)/i, weight: -12, message: "Fourchette salariale précise" },
    { pattern: /n°\s*siret|siret\s*:\s*\d/i, weight: -10, message: "SIRET mentionné" },
    { pattern: /13(ème|e)\s*mois|rtt\s*\d+/i, weight: -10, message: "Avantages détaillés" },
    { pattern: /participation|intéressement/i, weight: -10, message: "Participation/intéressement" },
    { pattern: /\d+\s*(collaborateurs?|salariés?)/i, weight: -8, message: "Taille entreprise précisée" },
    { pattern: /missions?\s*:\s*.{50,}/i, weight: -10, message: "Missions détaillées" },
    { pattern: /créée?\s*en\s*\d{4}/i, weight: -8, message: "Ancienneté entreprise" }
  ];

  // ============================================================================
  // SÉLECTEURS LINKEDIN
  // ============================================================================

  const SELECTORS = {
    jobCards: '.jobs-search-results__list-item, .job-card-container, .scaffold-layout__list-item',
    jobTitle: '.job-card-list__title, .job-card-container__link, .artdeco-entity-lockup__title',
    company: '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle',
    location: '.job-card-container__metadata-item, .artdeco-entity-lockup__caption',
    detailContainer: '.jobs-description, .jobs-box__html-content, .jobs-description-content__text',
    detailTitle: '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24',
    detailCompany: '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name',
    detailLocation: '.job-details-jobs-unified-top-card__primary-description-container',
    detailSalary: '.job-details-jobs-unified-top-card__job-insight'
  };

  let observer = null;
  let lastUrl = location.href;
  let debounceTimer = null;

  // ============================================================================
  // SUIVI DES STATISTIQUES
  // ============================================================================

  const StatsTracker = {
    pending: { analyzed: 0, flagged: 0, critical: 0 },
    debounceTimer: null,

    trackAnalysis(score) {
      this.pending.analyzed++;
      if (score >= 30) this.pending.flagged++;
      if (score >= 70) this.pending.critical++;

      // Debounce pour éviter trop de messages
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.flush(), 1000);
    },

    flush() {
      if (this.pending.analyzed === 0) return;

      try {
        chrome.runtime?.sendMessage({
          type: 'UPDATE_STATS',
          data: { ...this.pending }
        });
      } catch (e) {
        console.log('[FJD] Stats tracking error:', e);
      }

      this.pending = { analyzed: 0, flagged: 0, critical: 0 };
    },

    notifyJobAnalyzed(analysis, title) {
      try {
        chrome.runtime?.sendMessage({
          type: 'JOB_ANALYZED',
          data: {
            score: analysis.score,
            title: title,
            classification: analysis.primaryClassification?.code
          }
        });
      } catch (e) {
        // Silencieux si pas de contexte d'extension
      }
    }
  };

  // ============================================================================
  // ANALYSEUR AVANCÉ
  // ============================================================================

  const AdvancedAnalyzer = {
    analyze(jobData) {
      const fullText = `${jobData.title} ${jobData.company} ${jobData.location} ${jobData.salary || ''} ${jobData.description}`.toLowerCase();

      // Détection domaine et niveau
      const domain = this.detectDomain(fullText);
      const level = this.detectLevel(fullText);

      // Analyse des signaux
      const redFlagResults = this.analyzeRedFlags(fullText);
      const greenFlagResults = this.analyzeGreenFlags(fullText);
      const marketAnalysis = this.analyzeMarket(jobData, domain, level);
      const coherenceAnalysis = this.analyzeCoherence(fullText, domain, level);
      const linkedInSpecific = this.analyzeLinkedInSpecifics(jobData, fullText);

      // Calcul du score
      let totalScore = 0;
      totalScore += redFlagResults.totalWeight;
      totalScore += greenFlagResults.totalWeight;
      totalScore += marketAnalysis.scoreAdjustment;
      totalScore += coherenceAnalysis.scoreAdjustment;
      totalScore += linkedInSpecific.scoreAdjustment;

      // Ajustements structurels
      if (!jobData.company || jobData.company.length < 2) {
        totalScore += 30;
        redFlagResults.flags.push({ category: 'structure', message: "Entreprise non identifiée", weight: 30, severity: 'high' });
      }
      if (jobData.description && jobData.description.length < 100) {
        totalScore += 20;
        redFlagResults.flags.push({ category: 'structure', message: "Description très courte", weight: 20, severity: 'medium' });
      }

      const normalizedScore = Math.min(100, Math.max(0, totalScore));

      // Déterminer les classifications
      const classifications = this.determineClassifications(
        normalizedScore, redFlagResults, greenFlagResults, marketAnalysis, linkedInSpecific
      );

      return {
        score: normalizedScore,
        primaryClassification: classifications[0],
        secondaryClassifications: classifications.slice(1),
        domain,
        level,
        redFlags: redFlagResults.flags,
        greenFlags: greenFlagResults.flags,
        marketAnalysis,
        coherenceIssues: coherenceAnalysis.issues,
        linkedInAnalysis: linkedInSpecific,
        summary: this.generateSummary(normalizedScore, classifications[0], redFlagResults, marketAnalysis),
        recommendations: this.generateRecommendations(classifications[0], redFlagResults, marketAnalysis, linkedInSpecific),
        riskLevel: this.getRiskLevel(normalizedScore)
      };
    },

    detectDomain(text) {
      const patterns = {
        'tech': /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia|machine/i,
        'marketing': /marketing|communication|community|seo|sea|growth|content|brand|digital/i,
        'commercial': /commercial|vente|sales|account|business\s*develop/i,
        'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk/i,
        'rh': /ressources\s*humaines|rh|recrutement|talent|paie/i
      };
      for (const [domain, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) return domain;
      }
      return 'default';
    },

    detectLevel(text) {
      if (/stage|stagiaire|intern|alternance/i.test(text)) return 'junior';
      if (/junior|débutant|0-2\s*ans?/i.test(text)) return 'junior';
      if (/confirmé|intermédiaire|3-5\s*ans?/i.test(text)) return 'confirme';
      if (/senior|expérimenté|5\+?\s*ans?|expert/i.test(text)) return 'senior';
      if (/manager|directeur|head\s*of|responsable|lead/i.test(text)) return 'manager';
      return 'confirme';
    },

    analyzeRedFlags(text) {
      const flags = [];
      let totalWeight = 0;

      for (const [category, patterns] of Object.entries(RED_FLAGS)) {
        for (const flag of patterns) {
          if (flag.pattern.test(text)) {
            flags.push({ category, message: flag.message, weight: flag.weight, severity: flag.severity });
            totalWeight += flag.weight;
          }
        }
      }

      return { flags, totalWeight };
    },

    analyzeGreenFlags(text) {
      const flags = [];
      let totalWeight = 0;

      for (const flag of GREEN_FLAGS) {
        if (flag.pattern.test(text)) {
          flags.push({ message: flag.message, weight: Math.abs(flag.weight) });
          totalWeight += flag.weight;
        }
      }

      return { flags, totalWeight };
    },

    analyzeMarket(jobData, domain, level) {
      const result = { position: 'unknown', scoreAdjustment: 0, details: [], salaryInfo: null };

      const salaryText = jobData.salary || jobData.description || '';
      const salaryMatch = salaryText.match(/(\d{2})[.,\s]?(\d{3})\s*[-àa]\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?)/i)
                       || salaryText.match(/(\d{2,3})\s*k\s*[-àa]\s*(\d{2,3})\s*k/i);

      if (!salaryMatch) {
        result.details.push("Salaire non précisé");
        return result;
      }

      const numbers = salaryMatch[0].match(/\d+/g);
      let minSalary = parseInt(numbers[0]);
      let maxSalary = numbers[1] ? parseInt(numbers[1]) : minSalary;

      if (/k/i.test(salaryMatch[0]) || minSalary < 200) {
        minSalary *= 1000;
        maxSalary *= 1000;
      }

      result.salaryInfo = { min: minSalary, max: maxSalary, avg: (minSalary + maxSalary) / 2 };

      const marketRange = MARKET_DATA.salaryRanges[domain]?.[level] || MARKET_DATA.salaryRanges['default'][level];
      result.marketRange = { min: marketRange[0], max: marketRange[1] };

      const avgSalary = result.salaryInfo.avg;

      if (avgSalary < marketRange[0] * 0.7) {
        result.position = 'tres_sous_evalue';
        result.scoreAdjustment = 20;
        result.details.push(`Salaire très en dessous du marché (${Math.round(avgSalary/1000)}k vs ${Math.round(marketRange[0]/1000)}-${Math.round(marketRange[1]/1000)}k)`);
      } else if (avgSalary < marketRange[0] * 0.9) {
        result.position = 'sous_evalue';
        result.scoreAdjustment = 10;
        result.details.push("Salaire légèrement sous le marché");
      } else if (avgSalary > marketRange[1] * 1.5) {
        result.position = 'suspect_trop_eleve';
        result.scoreAdjustment = 25;
        result.details.push("Salaire anormalement élevé - vérifier la légitimité");
      } else if (avgSalary > marketRange[1] * 1.2) {
        result.position = 'au_dessus_marche';
        result.scoreAdjustment = -5;
        result.details.push("Salaire attractif");
      } else {
        result.position = 'conforme';
        result.scoreAdjustment = -10;
        result.details.push("Salaire conforme au marché");
      }

      return result;
    },

    analyzeCoherence(text, domain, level) {
      const issues = [];
      let scoreAdjustment = 0;

      if (/junior|débutant/i.test(text) && /\b(8|10|15|20)\+?\s*ans?\s*(d')?exp/i.test(text)) {
        issues.push("Poste junior demandant beaucoup d'expérience");
        scoreAdjustment += 25;
      }

      if (/senior|lead/i.test(text) && /sans\s*expérience|débutant\s*accepté/i.test(text)) {
        issues.push("Poste senior acceptant les débutants");
        scoreAdjustment += 20;
      }

      if (/100\s*%\s*(remote|télétravail)/i.test(text)) {
        const physicalRoles = /logistique|manutention|accueil|magasinier|production/i;
        if (physicalRoles.test(text)) {
          issues.push("Télétravail 100% pour poste physique");
          scoreAdjustment += 25;
        }
      }

      return { issues, scoreAdjustment };
    },

    analyzeLinkedInSpecifics(jobData, text) {
      const result = {
        scoreAdjustment: 0,
        applicantAnalysis: null,
        postingAnalysis: null,
        repostedAnalysis: null,
        ghostIndicators: [],
        warnings: [],
        recommendations: []
      };

      // ========== 1. DÉTECTION OFFRE REPUBLIÉE ==========
      const repostedMatch = text.match(/republi[ée]e?\s*(il\s*y\s*a)?\s*(\d+)?\s*(jours?|semaines?|mois)?/i);
      if (repostedMatch || /reposted/i.test(text)) {
        result.repostedAnalysis = {
          isReposted: true,
          message: "🔄 Offre republiée - le poste n'a pas été pourvu précédemment"
        };
        result.scoreAdjustment += 15;
        result.warnings.push("Offre republiée - peut indiquer des difficultés de recrutement");
        result.ghostIndicators.push("Offre republiée");
      }

      // ========== 2. ANALYSE DU NOMBRE DE CANDIDATS (NOUVEAUX SEUILS) ==========
      if (jobData.applicantCount) {
        const count = jobData.applicantCount;

        if (count >= CONFIG.linkedin.criticalApplicants) {
          // 500+ candidats = Ghost Job certain
          result.applicantAnalysis = {
            count,
            level: 'critical',
            message: `🚨 ${count}+ candidatures - Ghost Job très probable`,
            color: '#dc2626'
          };
          result.scoreAdjustment += 40;
          result.ghostIndicators.push("Nombre excessif de candidatures (500+)");
        } else if (count >= CONFIG.linkedin.ghostJobApplicants) {
          // 300+ candidats = Ghost Job probable
          result.applicantAnalysis = {
            count,
            level: 'very_high',
            message: `⚠️ ${count} candidatures - Possible Ghost Job`,
            color: '#ea580c'
          };
          result.scoreAdjustment += 30;
          result.ghostIndicators.push("Très nombreuses candidatures (300+)");
        } else if (count >= CONFIG.linkedin.veryHighApplicants) {
          // 100+ candidats = Concurrence très élevée
          result.applicantAnalysis = {
            count,
            level: 'high',
            message: `👥 ${count}+ candidatures - Concurrence très élevée`,
            color: '#f59e0b'
          };
          result.scoreAdjustment += 20;
          result.warnings.push("Plus de 100 candidats - chances réduites");
        } else if (count >= CONFIG.linkedin.highApplicants) {
          // 50+ candidats = Concurrence élevée
          result.applicantAnalysis = {
            count,
            level: 'medium',
            message: `👥 ${count} candidatures - Concurrence élevée`,
            color: '#eab308'
          };
          result.scoreAdjustment += 10;
          result.warnings.push("50+ candidats - personnalisez votre candidature");
        } else if (count >= 20) {
          result.applicantAnalysis = {
            count,
            level: 'moderate',
            message: `${count} candidatures - Concurrence modérée`,
            color: '#84cc16'
          };
          result.scoreAdjustment += 5;
        } else if (count < 10) {
          result.applicantAnalysis = {
            count,
            level: 'good',
            message: `✅ Seulement ${count} candidatures - Bonne opportunité`,
            color: '#22c55e'
          };
          result.scoreAdjustment -= 5;
        }
      }

      // ========== 3. ANALYSE DE L'ANCIENNETÉ DE L'OFFRE ==========
      let postingAgeWeeks = null;

      // Extraction depuis postedDate (format LinkedIn)
      if (jobData.postedDate) {
        const dateText = jobData.postedDate.toLowerCase();

        // Mois
        const monthMatch = dateText.match(/(\d+)\s*(mois|months?)/i);
        if (monthMatch) {
          const months = parseInt(monthMatch[1]);
          postingAgeWeeks = months * 4;
        }

        // Semaines
        const weekMatch = dateText.match(/(\d+)\s*(semaines?|weeks?)/i);
        if (weekMatch) {
          postingAgeWeeks = parseInt(weekMatch[1]);
        }

        // Jours
        const dayMatch = dateText.match(/(\d+)\s*(jours?|days?)/i);
        if (dayMatch) {
          postingAgeWeeks = Math.floor(parseInt(dayMatch[1]) / 7);
        }
      }

      // Extraction depuis le texte complet (ex: "il y a 3 semaines")
      const textAgeMatch = text.match(/il\s*y\s*a\s*(\d+)\s*(jours?|semaines?|mois)/i);
      if (textAgeMatch && !postingAgeWeeks) {
        const value = parseInt(textAgeMatch[1]);
        const unit = textAgeMatch[2].toLowerCase();
        if (unit.startsWith('mois')) {
          postingAgeWeeks = value * 4;
        } else if (unit.startsWith('semaine')) {
          postingAgeWeeks = value;
        } else {
          postingAgeWeeks = Math.floor(value / 7);
        }
      }

      if (postingAgeWeeks !== null) {
        if (postingAgeWeeks >= CONFIG.posting.veryOldWeeks) {
          // Plus de 6 semaines
          result.postingAnalysis = {
            weeks: postingAgeWeeks,
            level: 'very_old',
            message: `⏰ Offre publiée depuis ${postingAgeWeeks}+ semaines - Très ancienne`,
            color: '#78716c'
          };
          result.scoreAdjustment += 25;
          result.ghostIndicators.push(`Offre très ancienne (${postingAgeWeeks} semaines)`);
        } else if (postingAgeWeeks >= CONFIG.posting.oldWeeks) {
          // Plus de 3 semaines
          result.postingAnalysis = {
            weeks: postingAgeWeeks,
            level: 'old',
            message: `⏰ Offre publiée depuis ${postingAgeWeeks} semaines - Ancienne`,
            color: '#a3a3a3'
          };
          result.scoreAdjustment += 15;
          result.warnings.push("Offre de plus de 3 semaines - vérifier si toujours active");
        } else if (postingAgeWeeks >= 2) {
          result.postingAnalysis = {
            weeks: postingAgeWeeks,
            level: 'moderate',
            message: `${postingAgeWeeks} semaines`,
            color: '#84cc16'
          };
        } else {
          result.postingAnalysis = {
            weeks: postingAgeWeeks,
            level: 'recent',
            message: `✅ Offre récente`,
            color: '#22c55e'
          };
          result.scoreAdjustment -= 5;
        }
      }

      // ========== 4. VÉRIFICATION COHÉRENCE SALAIRE/POSTE ==========
      // Vérifier si le salaire correspond au niveau requis
      const hasSeniorTitle = /senior|lead|principal|staff|architect/i.test(text);
      const hasJuniorTitle = /junior|débutant|entry|stagiaire|intern/i.test(text);

      // Extraire le salaire s'il existe
      const salaryMatch = text.match(/(\d{2,3})\s*k/gi) || text.match(/(\d{2})[.,\s]?(\d{3})\s*€/gi);
      if (salaryMatch) {
        let maxSalary = 0;
        salaryMatch.forEach(s => {
          const num = parseInt(s.match(/\d+/)[0]);
          const salary = num < 200 ? num * 1000 : num;
          if (salary > maxSalary) maxSalary = salary;
        });

        if (hasSeniorTitle && maxSalary < 50000) {
          result.warnings.push("Salaire bas pour un poste Senior");
          result.scoreAdjustment += 10;
        }
        if (hasJuniorTitle && maxSalary > 55000) {
          result.warnings.push("Salaire élevé pour un poste Junior - vérifier");
          result.scoreAdjustment += 5;
        }
      }

      // ========== 5. DÉTECTION "RÉPONSES GÉRÉES EN DEHORS DE LINKEDIN" ==========
      if (/réponses?\s*gérées?\s*en\s*dehors/i.test(text) || /responses?\s*managed\s*outside/i.test(text)) {
        result.warnings.push("Candidatures gérées hors LinkedIn - peut ralentir le processus");
        result.scoreAdjustment += 5;
      }

      // ========== 6. DÉTECTION RECRUITER EXTERNE ==========
      if (/cabinet|recruteur|headhunter|recruitment\s*agency/i.test(text)) {
        result.warnings.push("Via cabinet de recrutement - pas de contact direct avec l'entreprise");
      }

      // ========== 7. VÉRIFICATION ENTRY LEVEL AVEC EXPÉRIENCE ==========
      if (/entry\s*level/i.test(text) && /\d+\s*ans?\s*(d')?exp/i.test(text)) {
        const yearsMatch = text.match(/(\d+)\s*ans?/);
        if (yearsMatch && parseInt(yearsMatch[1]) >= 3) {
          result.warnings.push("Entry level demandant de l'expérience - incohérent");
          result.scoreAdjustment += 15;
        }
      }

      // ========== 8. COMBINAISON OFFRE REPUBLICÉE + ANCIENNE + NOMBREUX CANDIDATS ==========
      if (result.repostedAnalysis?.isReposted && postingAgeWeeks >= 3 && jobData.applicantCount >= 50) {
        result.ghostIndicators.push("Combinaison suspecte: republiée + ancienne + nombreux candidats");
        result.scoreAdjustment += 15;
      }

      return result;
    },

    determineClassifications(score, redFlags, greenFlags, marketAnalysis, linkedInSpecific) {
      const classifications = [];

      // Classification principale
      if (score >= 70) {
        classifications.push(CLASSIFICATIONS.ARNAQUE);
      } else if (score >= 60) {
        classifications.push(CLASSIFICATIONS.A_FUIR);
      } else if (score >= 50) {
        const hasDataHarvesting = redFlags.flags.some(f => f.category === 'data_harvesting');
        const hasGhostIndicators = linkedInSpecific.ghostIndicators.length > 0 ||
                                   redFlags.flags.some(f => f.category === 'ghost_job_indicators');

        if (hasDataHarvesting) {
          classifications.push(CLASSIFICATIONS.FAUSSE_OFFRE);
        } else if (hasGhostIndicators) {
          classifications.push(CLASSIFICATIONS.GHOST_JOB);
        } else {
          classifications.push(CLASSIFICATIONS.A_VERIFIER);
        }
      } else if (score >= 35) {
        const hasCoherenceIssues = redFlags.flags.some(f => f.category === 'coherence_issues');
        classifications.push(hasCoherenceIssues ? CLASSIFICATIONS.INCOHERENTE : CLASSIFICATIONS.A_VERIFIER);
      } else if (score >= 20) {
        if (marketAnalysis.position?.includes('sous')) {
          classifications.push(CLASSIFICATIONS.SOUS_EVALUEE);
        } else {
          classifications.push(CLASSIFICATIONS.PASSABLE);
        }
      } else if (score >= 10) {
        classifications.push(greenFlags.flags.length >= 5 ? CLASSIFICATIONS.PROFESSIONNELLE : CLASSIFICATIONS.ADAPTEE_MARCHE);
      } else {
        classifications.push(CLASSIFICATIONS.LEGITIME);
      }

      // ========== CLASSIFICATIONS SECONDAIRES ==========

      // Offre republiée
      if (linkedInSpecific.repostedAnalysis?.isReposted) {
        classifications.push(CLASSIFICATIONS.REPUBLICEE);
      }

      // Forte concurrence (50+ candidats)
      if (linkedInSpecific.applicantAnalysis?.level === 'medium' ||
          linkedInSpecific.applicantAnalysis?.level === 'high' ||
          linkedInSpecific.applicantAnalysis?.level === 'very_high') {
        classifications.push(CLASSIFICATIONS.CONCURRENCE_ELEVEE);
      }

      // Offre ancienne (3+ semaines)
      if (linkedInSpecific.postingAnalysis?.level === 'old' ||
          linkedInSpecific.postingAnalysis?.level === 'very_old') {
        classifications.push(CLASSIFICATIONS.OFFRE_ANCIENNE);
      }

      // Salaire conforme au marché
      if (marketAnalysis.position === 'conforme' && classifications[0].code !== 'ADAPTEE_MARCHE') {
        classifications.push(CLASSIFICATIONS.ADAPTEE_MARCHE);
      }

      // Offre professionnelle
      if (greenFlags.flags.length >= 8 && score < 30) {
        classifications.push(CLASSIFICATIONS.PROFESSIONNELLE);
      }

      return classifications;
    },

    generateSummary(score, classification, redFlags, marketAnalysis) {
      let summary = `${classification.icon} ${classification.label} (Score: ${score}/100)\n`;
      summary += `${this.getClassificationDescription(classification.code)}\n`;

      const criticalFlags = redFlags.flags.filter(f => f.severity === 'critical');
      if (criticalFlags.length > 0) {
        summary += `\n🚨 ${criticalFlags.length} alerte(s) critique(s)`;
      }

      if (marketAnalysis.position && marketAnalysis.position !== 'unknown') {
        summary += `\n📊 Marché: ${marketAnalysis.details[0] || marketAnalysis.position}`;
      }

      return summary;
    },

    getClassificationDescription(code) {
      const descriptions = {
        'LEGITIME': 'Offre professionnelle et cohérente avec le marché',
        'PROFESSIONNELLE': 'Offre bien structurée, entreprise identifiable',
        'ADAPTEE_MARCHE': 'Conditions alignées avec les standards du secteur',
        'PASSABLE': 'Quelques éléments manquants mais acceptable',
        'SOUS_EVALUEE': 'Salaire ou conditions en dessous du marché',
        'INCOHERENTE': 'Contradictions ou informations incohérentes',
        'A_VERIFIER': 'Éléments suspects nécessitant une vérification',
        'GHOST_JOB': 'Offre probablement inactive ou pour affichage',
        'FAUSSE_OFFRE': 'Offre fictive pour collecte de données',
        'A_FUIR': 'Multiples signaux d\'alerte graves',
        'ARNAQUE': 'Caractéristiques typiques d\'une escroquerie'
      };
      return descriptions[code] || '';
    },

    generateRecommendations(classification, redFlags, marketAnalysis, linkedInSpecific) {
      const recommendations = [];

      switch (classification.code) {
        case 'ARNAQUE':
          recommendations.push("❌ Ne pas postuler - caractéristiques d'arnaque détectées");
          recommendations.push("🚫 Ne jamais fournir d'informations personnelles ou financières");
          recommendations.push("📢 Signaler cette offre à LinkedIn");
          break;
        case 'A_FUIR':
          recommendations.push("⚠️ Éviter cette offre - trop de signaux d'alerte");
          recommendations.push("🔍 Faire des recherches approfondies si vraiment intéressé");
          break;
        case 'GHOST_JOB':
          recommendations.push("👻 Offre probablement inactive");
          recommendations.push("📧 Contacter directement l'entreprise via son site");
          recommendations.push("👤 Vérifier le profil du recruteur");
          break;
        case 'FAUSSE_OFFRE':
          recommendations.push("🎭 Cette offre semble être pour la collecte de données");
          recommendations.push("🚫 Ne pas fournir d'informations sensibles");
          break;
        case 'SOUS_EVALUEE':
          recommendations.push("📉 Salaire en dessous du marché");
          recommendations.push("💬 Négocier la rémunération si le poste vous intéresse");
          recommendations.push("🔍 Vérifier les avantages complémentaires");
          break;
        case 'INCOHERENTE':
          recommendations.push("🔀 Contradictions détectées dans l'offre");
          recommendations.push("📞 Demander des clarifications au recruteur");
          break;
        case 'PASSABLE':
        case 'A_VERIFIER':
          recommendations.push("🔍 Vérifier l'entreprise sur LinkedIn et Glassdoor");
          recommendations.push("📋 Demander plus de détails lors du premier contact");
          break;
        case 'LEGITIME':
        case 'PROFESSIONNELLE':
        case 'ADAPTEE_MARCHE':
          recommendations.push("✅ Offre correcte - vous pouvez postuler");
          if (marketAnalysis.position === 'au_dessus_marche') {
            recommendations.push("💰 Conditions attractives par rapport au marché");
          }
          break;
      }

      // Recommandations LinkedIn spécifiques
      if (linkedInSpecific.applicantAnalysis?.level === 'critical') {
        recommendations.push("👻 Contacter directement l'entreprise - offre peut-être inactive");
      }
      if (linkedInSpecific.applicantAnalysis?.level === 'high') {
        recommendations.push("📝 Personnaliser fortement votre candidature");
      }

      return [...new Set(recommendations)].slice(0, 6);
    },

    getRiskLevel(score) {
      if (score >= 70) return { level: 'critical', label: 'Très suspect', color: '#dc2626' };
      if (score >= 50) return { level: 'high', label: 'Suspect', color: '#ea580c' };
      if (score >= 30) return { level: 'medium', label: 'À vérifier', color: '#ca8a04' };
      if (score >= 15) return { level: 'low', label: 'Prudence', color: '#65a30d' };
      return { level: 'safe', label: 'Légitime', color: '#16a34a' };
    }
  };

  // ============================================================================
  // INTERFACE UTILISATEUR
  // ============================================================================

  const UI = {
    createBadge(analysis) {
      const badge = document.createElement('div');
      const classification = analysis.primaryClassification;
      badge.className = `fjd-badge fjd-badge--${analysis.riskLevel.level}`;
      badge.style.cssText = `
        display: inline-flex; align-items: center; gap: 6px;
        padding: 4px 10px; border-radius: 16px; cursor: pointer;
        font-size: 12px; font-weight: 600; font-family: system-ui, sans-serif;
        background: ${classification.bgColor}; color: ${classification.color};
        border: 1px solid ${classification.color}30;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: transform 0.15s, box-shadow 0.15s;
      `;
      badge.innerHTML = `<span>${classification.icon}</span><span>${classification.label}</span>`;
      badge.title = `Score: ${analysis.score}/100 | Cliquez pour les détails`;

      badge.addEventListener('mouseenter', () => {
        badge.style.transform = 'scale(1.05)';
        badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      });
      badge.addEventListener('mouseleave', () => {
        badge.style.transform = 'scale(1)';
        badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      });
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showDetailPanel(analysis);
      });

      return badge;
    },

    showDetailPanel(analysis) {
      this.closeDetailPanel();

      const overlay = document.createElement('div');
      overlay.className = 'fjd-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
      `;
      overlay.addEventListener('click', () => this.closeDetailPanel());
      document.body.appendChild(overlay);

      const panel = document.createElement('div');
      panel.className = 'fjd-panel';
      panel.style.cssText = `
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 90%; max-width: 480px; max-height: 85vh;
        background: white; border-radius: 16px; z-index: 10001;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
      `;

      const classification = analysis.primaryClassification;
      const circ = 2 * Math.PI * 52;
      const offset = circ - (analysis.score / 100) * circ;

      panel.innerHTML = `
        <div style="background: linear-gradient(135deg, ${classification.color}15, ${classification.color}05);
                    padding: 20px; border-bottom: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0; font-size: 18px; color: #1f2937;">
              ${classification.icon} Analyse détaillée
            </h2>
            <button class="fjd-panel__close" style="background: none; border: none; font-size: 20px;
                    cursor: pointer; color: #6b7280; padding: 4px;">&times;</button>
          </div>
        </div>

        <div style="padding: 24px; overflow-y: auto; max-height: calc(85vh - 80px);">
          <!-- Score circulaire -->
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="position: relative; display: inline-block;">
              <svg viewBox="0 0 120 120" width="100" height="100">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" stroke-width="8"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="${classification.color}"
                        stroke-width="8" stroke-linecap="round"
                        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                        transform="rotate(-90 60 60)"/>
              </svg>
              <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                           font-size: 28px; font-weight: 700; color: ${classification.color};">
                ${analysis.score}
              </span>
            </div>
            <div style="margin-top: 8px; font-size: 16px; font-weight: 600; color: ${classification.color};">
              ${classification.label}
            </div>
            <div style="margin-top: 4px; font-size: 13px; color: #6b7280;">
              ${this.getClassificationDescription(classification.code)}
            </div>
          </div>

          <!-- Analyse marché -->
          ${analysis.marketAnalysis.position !== 'unknown' ? `
            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">
                📊 Comparaison marché
              </h3>
              <div style="font-size: 13px; color: #4b5563;">
                ${analysis.marketAnalysis.details.map(d => `<p style="margin: 4px 0;">• ${d}</p>`).join('')}
                ${analysis.marketAnalysis.salaryInfo ? `
                  <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">
                    Offre: ${Math.round(analysis.marketAnalysis.salaryInfo.min/1000)}k - ${Math.round(analysis.marketAnalysis.salaryInfo.max/1000)}k€
                    | Marché (${analysis.domain}/${analysis.level}): ${Math.round(analysis.marketAnalysis.marketRange.min/1000)}k - ${Math.round(analysis.marketAnalysis.marketRange.max/1000)}k€
                  </p>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- LinkedIn spécifique -->
          ${analysis.linkedInAnalysis.applicantAnalysis ? `
            <div style="background: #faf5ff; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
                👥 Analyse LinkedIn
              </h3>
              <p style="margin: 0; font-size: 13px; color: #6b46c1;">
                ${analysis.linkedInAnalysis.applicantAnalysis.message}
              </p>
              ${analysis.linkedInAnalysis.ghostIndicators.length > 0 ? `
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #7c3aed;">
                  👻 ${analysis.linkedInAnalysis.ghostIndicators.join(', ')}
                </p>
              ` : ''}
            </div>
          ` : ''}

          <!-- Alertes -->
          ${analysis.redFlags.length > 0 ? `
            <div style="margin-bottom: 16px;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">
                🚩 Signaux d'alerte (${analysis.redFlags.length})
              </h3>
              ${analysis.redFlags.slice(0, 8).map(flag => `
                <div style="display: flex; justify-content: space-between; align-items: center;
                            padding: 10px 12px; background: ${flag.severity === 'critical' ? '#fef2f2' :
                            flag.severity === 'high' ? '#fff7ed' : '#fffbeb'};
                            border-radius: 8px; margin-bottom: 6px; font-size: 13px;">
                  <span style="color: ${flag.severity === 'critical' ? '#dc2626' :
                               flag.severity === 'high' ? '#ea580c' : '#ca8a04'};">
                    ${flag.message}
                  </span>
                  <span style="font-weight: 600; color: #9ca3af;">+${flag.weight}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Points positifs -->
          ${analysis.greenFlags.length > 0 ? `
            <div style="margin-bottom: 16px;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">
                ✅ Points positifs (${analysis.greenFlags.length})
              </h3>
              ${analysis.greenFlags.slice(0, 5).map(flag => `
                <div style="display: flex; justify-content: space-between; align-items: center;
                            padding: 10px 12px; background: #f0fdf4;
                            border-radius: 8px; margin-bottom: 6px; font-size: 13px;">
                  <span style="color: #16a34a;">${flag.message}</span>
                  <span style="font-weight: 600; color: #22c55e;">-${flag.weight}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <!-- Recommandations -->
          ${analysis.recommendations.length > 0 ? `
            <div style="background: #f0f9ff; border-radius: 12px; padding: 16px;">
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #0369a1;">
                💡 Recommandations
              </h3>
              ${analysis.recommendations.map(rec => `
                <p style="margin: 8px 0; font-size: 13px; color: #0284c7;">→ ${rec}</p>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;

      document.body.appendChild(panel);
      panel.querySelector('.fjd-panel__close').addEventListener('click', () => this.closeDetailPanel());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeDetailPanel(); }, { once: true });
    },

    getClassificationDescription(code) {
      const descriptions = {
        'LEGITIME': 'Offre professionnelle et cohérente avec le marché',
        'PROFESSIONNELLE': 'Offre bien structurée, entreprise identifiable',
        'ADAPTEE_MARCHE': 'Conditions alignées avec les standards du secteur',
        'PASSABLE': 'Quelques éléments manquants mais acceptable',
        'SOUS_EVALUEE': 'Salaire ou conditions en dessous du marché',
        'INCOHERENTE': 'Contradictions ou informations incohérentes',
        'A_VERIFIER': 'Éléments suspects nécessitant une vérification',
        'GHOST_JOB': 'Offre probablement inactive ou pour affichage',
        'FAUSSE_OFFRE': 'Offre fictive pour collecte de données',
        'A_FUIR': 'Multiples signaux d\'alerte graves',
        'ARNAQUE': 'Caractéristiques typiques d\'une escroquerie'
      };
      return descriptions[code] || '';
    },

    closeDetailPanel() {
      document.querySelectorAll('.fjd-panel, .fjd-overlay').forEach(el => el.remove());
    },

    showToast(message, type = 'info') {
      document.querySelector('.fjd-toast')?.remove();
      const toast = document.createElement('div');
      toast.className = 'fjd-toast';
      toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 10002;
        padding: 12px 20px; border-radius: 8px;
        background: ${type === 'warning' ? '#fef3c7' : type === 'error' ? '#fee2e2' : '#dbeafe'};
        color: ${type === 'warning' ? '#92400e' : type === 'error' ? '#991b1b' : '#1e40af'};
        font-size: 14px; font-family: system-ui, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex; align-items: center; gap: 8px;
        animation: slideIn 0.3s ease;
      `;
      toast.innerHTML = `<span>${type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️'}</span><span>${message}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
  };

  // ============================================================================
  // LOGIQUE PRINCIPALE
  // ============================================================================

  function init() {
    console.log('[Fake Job Detector] LinkedIn Advanced initialise v2.0');
    setTimeout(analyzeCurrentPage, 1500);
    setupObserver();
    setupUrlWatcher();
    injectStyles();
  }

  function injectStyles() {
    if (document.getElementById('fjd-styles')) return;
    const style = document.createElement('style');
    style.id = 'fjd-styles';
    style.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }

  function setupObserver() {
    observer = new MutationObserver((mutations) => {
      const shouldAnalyze = mutations.some(m => m.addedNodes.length > 0);
      if (shouldAnalyze) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(analyzeCurrentPage, 800);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupUrlWatcher() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(analyzeCurrentPage, 1000);
      }
    }, 500);
  }

  function analyzeCurrentPage() {
    document.querySelectorAll(SELECTORS.jobCards).forEach(card => {
      if (!card.hasAttribute('data-fjd-analyzed') && !card.querySelector('.fjd-badge')) {
        analyzeJobCard(card);
        card.setAttribute('data-fjd-analyzed', 'true');
      }
    });

    const detailContainer = document.querySelector(SELECTORS.detailContainer);
    if (detailContainer && !detailContainer.hasAttribute('data-fjd-analyzed')) {
      analyzeJobDetail();
      detailContainer.setAttribute('data-fjd-analyzed', 'true');
    }
  }

  function analyzeJobCard(card) {
    const jobData = extractJobDataFromCard(card);
    if (!jobData.title) return;
    if (card.querySelector('.fjd-badge')) return;

    const analysis = AdvancedAnalyzer.analyze(jobData);
    const badge = UI.createBadge(analysis);
    badge.style.cssText += 'position: absolute; top: 8px; right: 8px; z-index: 100;';

    if (window.getComputedStyle(card).position === 'static') {
      card.style.position = 'relative';
    }
    card.appendChild(badge);

    // Tracking des statistiques
    StatsTracker.trackAnalysis(analysis.score);

    // Style visuel selon le niveau de risque
    if (analysis.score >= 70) {
      card.style.borderLeft = '4px solid #dc2626';
      card.style.backgroundColor = 'rgba(220, 38, 38, 0.03)';
    } else if (analysis.score >= 50) {
      card.style.borderLeft = '4px solid #ea580c';
      card.style.backgroundColor = 'rgba(234, 88, 12, 0.02)';
    } else if (analysis.primaryClassification.code === 'GHOST_JOB') {
      card.style.borderLeft = '4px solid #7c3aed';
      card.style.backgroundColor = 'rgba(124, 58, 237, 0.02)';
    }
  }

  function extractJobDataFromCard(card) {
    const getText = (sel) => card.querySelector(sel)?.textContent?.trim() || '';
    return {
      title: getText(SELECTORS.jobTitle),
      company: getText(SELECTORS.company),
      location: getText(SELECTORS.location),
      description: card.textContent || '',
      url: window.location.href
    };
  }

  function analyzeJobDetail() {
    const jobData = extractJobDetailData();
    if (!jobData.title && !jobData.description) return;

    const analysis = AdvancedAnalyzer.analyze(jobData);
    const titleElement = document.querySelector(SELECTORS.detailTitle);

    if (titleElement && !titleElement.parentElement?.querySelector('.fjd-badge-container')) {
      const badgeContainer = document.createElement('div');
      badgeContainer.className = 'fjd-badge-container';
      badgeContainer.style.cssText = 'margin: 12px 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;';

      const badge = UI.createBadge(analysis);
      badge.style.fontSize = '13px';
      badge.style.padding = '6px 14px';
      badgeContainer.appendChild(badge);

      // Afficher les classifications secondaires
      if (analysis.secondaryClassifications.length > 0) {
        analysis.secondaryClassifications.slice(0, 2).forEach(cls => {
          const secondaryBadge = document.createElement('span');
          secondaryBadge.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px;
            padding: 4px 10px; border-radius: 12px;
            font-size: 11px; font-weight: 500;
            background: ${cls.bgColor}; color: ${cls.color};
            border: 1px solid ${cls.color}20;
          `;
          secondaryBadge.innerHTML = `<span>${cls.icon}</span><span>${cls.label}</span>`;
          badgeContainer.appendChild(secondaryBadge);
        });
      }

      const explainer = document.createElement('span');
      explainer.textContent = 'Cliquez pour l\'analyse complète';
      explainer.style.cssText = 'font-size: 11px; color: #666; font-style: italic;';
      badgeContainer.appendChild(explainer);

      titleElement.parentNode.insertBefore(badgeContainer, titleElement.nextSibling);

      // Tracking des statistiques pour l'offre détaillée
      StatsTracker.trackAnalysis(analysis.score);
      StatsTracker.notifyJobAnalyzed(analysis, jobData.title);

      // Notification selon le niveau de risque
      if (analysis.score >= 70) {
        UI.showToast(`🚨 Arnaque probable! ${analysis.redFlags.length} alertes détectées`, 'error');
      } else if (analysis.score >= 50) {
        UI.showToast(`⚠️ ${analysis.redFlags.length} signal(s) d'alerte - Vérifiez cette offre`, 'warning');
      } else if (analysis.primaryClassification.code === 'GHOST_JOB') {
        UI.showToast(`👻 Possible Ghost Job - ${analysis.linkedInAnalysis.applicantAnalysis?.message || 'Vérifiez'}`, 'warning');
      }
    }
  }

  function extractJobDetailData() {
    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';
    const pageText = document.body.textContent || '';

    let description = '';
    document.querySelectorAll(SELECTORS.detailContainer).forEach(c => description += ' ' + c.textContent);

    // Extraire nombre de candidats
    const applicantMatch = pageText.match(/(\d+)\+?\s*(candidat|applicant)/i)
                        || pageText.match(/plus\s*de\s*(\d+)\s*(candidat|personnes?)/i)
                        || pageText.match(/over\s*(\d+)\s*applicant/i);

    // Extraire date de publication
    const dateMatch = pageText.match(/(?:posted|publi[ée]e?)\s*(?:il y a)?\s*(\d+)\s*(jours?|semaines?|mois|days?|weeks?|months?)/i)
                   || pageText.match(/il\s*y\s*a\s*(\d+)\s*(jours?|semaines?|mois)/i);

    return {
      title: getText(SELECTORS.detailTitle),
      company: getText(SELECTORS.detailCompany),
      location: getText(SELECTORS.detailLocation),
      salary: getText(SELECTORS.detailSalary),
      description: description.trim(),
      applicantCount: applicantMatch ? parseInt(applicantMatch[1]) : null,
      postedDate: dateMatch ? dateMatch[0] : null,
      url: window.location.href
    };
  }

  // ============================================================================
  // DÉMARRAGE
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
