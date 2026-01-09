/**
 * Content Script - Indeed Jobs (Version Avancée)
 * Analyse améliorée avec multi-classification, comparaison marché et agents IA
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    thresholds: { suspect: 30, danger: 50, scam: 70 },
    indeed: { flagUrgent: true, urgentWeight: 15 },
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
      'logistique': { junior: [24000, 32000], confirme: [32000, 42000], senior: [40000, 55000], manager: [60000, 85000] },
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
      { pattern: /frais\s*(de\s*)?(inscription|formation|dossier|administratif)/i, weight: 55, severity: 'critical', message: "Frais demandés" },
      { pattern: /investissement\s*(initial|de\s*départ|personnel)/i, weight: 55, severity: 'critical', message: "Investissement initial demandé" },
      { pattern: /acheter?\s*(le\s*)?(kit|stock|matériel|produits?)/i, weight: 50, severity: 'critical', message: "Achat de matériel obligatoire" },
      { pattern: /avancer?\s*(de\s*l'?)?argent/i, weight: 55, severity: 'critical', message: "Avance d'argent demandée" },
      { pattern: /crypto|bitcoin|ethereum|nft|web3\s*job/i, weight: 40, severity: 'high', message: "Mention crypto/NFT suspecte" },
      { pattern: /minage|mining\s*(de\s*)?(crypto|bitcoin)/i, weight: 45, severity: 'critical', message: "Activité de minage" }
    ],
    unrealistic_promises: [
      { pattern: /gagn(er|ez)\s*(jusqu'?à\s*)?\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, weight: 45, severity: 'critical', message: "Promesse de gains irréalistes" },
      { pattern: /revenu\s*(passif|illimité|garanti)/i, weight: 45, severity: 'critical', message: "Revenu passif/illimité promis" },
      { pattern: /indépendance\s*financière/i, weight: 35, severity: 'high', message: "Promesse d'indépendance financière" },
      { pattern: /devenez?\s*(riche|millionnaire)/i, weight: 50, severity: 'critical', message: "Promesse d'enrichissement rapide" },
      { pattern: /sans\s*(effort|travail|compétence)/i, weight: 40, severity: 'critical', message: "Promesse sans effort" },
      { pattern: /argent\s*facile/i, weight: 50, severity: 'critical', message: "Argent facile promis" },
      { pattern: /\d{3,}\s*€?\s*(par|\/)\s*heure/i, weight: 40, severity: 'critical', message: "Taux horaire irréaliste" }
    ],
    abnormal_process: [
      { pattern: /embauche\s*(immédiate|garantie|sans\s*entretien)/i, weight: 40, severity: 'high', message: "Embauche sans processus normal" },
      { pattern: /pas\s*(d'?|de\s*)entretien/i, weight: 45, severity: 'critical', message: "Pas d'entretien requis" },
      { pattern: /commenc(er|ez)\s*(immédiatement|aujourd'?hui|demain|maintenant)/i, weight: 35, severity: 'high', message: "Démarrage immédiat suspect" },
      { pattern: /urgent(ly)?\s*hiring|recrutement\s*urgent/i, weight: 20, severity: 'medium', message: "Recrutement urgent" },
      { pattern: /places?\s*limitées?|dernière\s*chance/i, weight: 30, severity: 'high', message: "Fausse rareté/pression" },
      { pattern: /hiring\s*immediately|embauche\s*immédiate/i, weight: 25, severity: 'high', message: "Embauche immédiate" }
    ],
    mlm_network: [
      { pattern: /parrain(age|er)|filleul/i, weight: 45, severity: 'critical', message: "Structure de parrainage MLM" },
      { pattern: /réseau\s*(de\s*)?(vente|distribution|partenaires)/i, weight: 40, severity: 'high', message: "Structure réseau MLM" },
      { pattern: /commission\s*(sur|de)\s*recrutement/i, weight: 45, severity: 'critical', message: "Commission de recrutement" },
      { pattern: /recrut(er|ez)\s*(votre|des)\s*(équipe|réseau)/i, weight: 40, severity: 'critical', message: "Recrutement d'équipe requis" },
      { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, weight: 45, severity: 'critical', message: "MLM détecté" },
      { pattern: /vente\s*(directe|à\s*domicile)\s*indépendant/i, weight: 30, severity: 'high', message: "Vente directe MLM potentiel" },
      { pattern: /downline|upline|plan\s*de\s*compensation/i, weight: 50, severity: 'critical', message: "Terminologie MLM" }
    ],
    unprofessional_contact: [
      { pattern: /@(gmail|yahoo|hotmail|outlook|live|aol)\.(com|fr)/i, weight: 25, severity: 'medium', message: "Email non professionnel" },
      { pattern: /whatsapp|telegram|signal\s*(pour\s*postuler|uniquement)/i, weight: 35, severity: 'high', message: "Contact via messagerie uniquement" },
      { pattern: /envoy(er|ez)\s*(cv|candidature)\s*(par|via|sur)\s*(whatsapp|telegram)/i, weight: 40, severity: 'high', message: "CV via messagerie" },
      { pattern: /contact(er|ez)?\s*:?\s*\+?\d{10,}/i, weight: 20, severity: 'medium', message: "Numéro direct sans entreprise" }
    ],
    data_harvesting: [
      { pattern: /numéro\s*(de\s*)?(sécurité\s*sociale|sécu)/i, weight: 45, severity: 'critical', message: "N° sécu demandé" },
      { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|carte\s*d'?identité|passeport)/i, weight: 40, severity: 'critical', message: "Pièce d'identité demandée" },
      { pattern: /rib|relevé\s*(d'?)?identité\s*bancaire/i, weight: 40, severity: 'critical', message: "RIB demandé avant embauche" },
      { pattern: /formulaire\s*(complet|détaillé)\s*(obligatoire|requis)/i, weight: 30, severity: 'high', message: "Formulaire excessif" }
    ],
    coherence_issues: [
      { pattern: /junior.{0,30}(10|15|20)\+?\s*ans?\s*(d')?exp/i, weight: 35, severity: 'high', message: "Incohérence niveau/expérience" },
      { pattern: /senior.{0,30}(0|1|2)\s*ans?\s*(d')?exp/i, weight: 30, severity: 'medium', message: "Senior avec peu d'expérience requise" },
      { pattern: /débutant.{0,30}(expert|confirmé|senior)/i, weight: 35, severity: 'high', message: "Contradiction niveau d'expérience" },
      { pattern: /stage.{0,50}(cdi|cdd)|cdi.{0,50}stage/i, weight: 30, severity: 'high', message: "Type de contrat contradictoire" }
    ],
    suspicious_remote: [
      { pattern: /100\s*%\s*remote.{0,30}(sans\s*expérience|débutant)/i, weight: 30, severity: 'high', message: "Remote 100% pour débutant suspect" },
      { pattern: /travail(ler)?\s*(à\s*)?domicile.{0,30}(sans|aucune)\s*compétence/i, weight: 35, severity: 'high', message: "Télétravail sans compétence requise" },
      { pattern: /home\s*office.{0,30}gagn(er|ez)/i, weight: 30, severity: 'high', message: "Promesse de gains en télétravail" }
    ]
  };

  const GREEN_FLAGS = [
    { pattern: /cdi\s*(temps\s*plein|35h|39h)?/i, weight: -12, message: "CDI précisé" },
    { pattern: /cdd\s*\d+\s*mois/i, weight: -8, message: "CDD avec durée précisée" },
    { pattern: /convention\s*collective\s*(syntec|métallurgie|banque|commerce)?/i, weight: -15, message: "Convention collective mentionnée" },
    { pattern: /mutuelle\s*(entreprise|famille|100\s*%)?/i, weight: -10, message: "Mutuelle précisée" },
    { pattern: /tickets?\s*restaurant|carte\s*resto/i, weight: -8, message: "Tickets restaurant" },
    { pattern: /participation|intéressement/i, weight: -10, message: "Participation/intéressement" },
    { pattern: /processus\s*(de\s*)?recrutement\s*:/i, weight: -12, message: "Processus détaillé" },
    { pattern: /entretien(s)?\s*(avec|rh|technique|manager)/i, weight: -10, message: "Entretiens structurés" },
    { pattern: /\d{2}[\s,.]?\d{3}\s*[-àa]\s*\d{2}[\s,.]?\d{3}\s*(€|euros?)/i, weight: -12, message: "Fourchette salariale précise" },
    { pattern: /n°\s*siret|siret\s*:\s*\d/i, weight: -10, message: "SIRET mentionné" },
    { pattern: /13(ème|e)\s*mois/i, weight: -10, message: "13ème mois" },
    { pattern: /rtt\s*\d+\s*jours?/i, weight: -8, message: "RTT précisés" },
    { pattern: /\d+\s*(collaborateurs?|salariés?|employés?)/i, weight: -8, message: "Taille entreprise précisée" },
    { pattern: /créée?\s*en\s*\d{4}|depuis\s*\d{4}/i, weight: -8, message: "Ancienneté entreprise" },
    { pattern: /missions?\s*(principales?)?\s*:\s*.{50,}/i, weight: -10, message: "Missions détaillées" },
    { pattern: /télétravail\s*(\d+\s*jours?|partiel|hybride)/i, weight: -8, message: "Télétravail cadré" }
  ];

  // ============================================================================
  // SÉLECTEURS INDEED
  // ============================================================================

  const SELECTORS = {
    jobCards: '.job_seen_beacon, .jobsearch-ResultsList > li, .resultContent, .slider_item',
    jobTitle: '.jcs-JobTitle, .jobTitle, [data-testid="jobTitle"], .jobTitle-new498',
    company: '.companyName, [data-testid="company-name"], .company_location .companyName',
    location: '.companyLocation, [data-testid="company-location"]',
    salary: '.salaryText, .salary-snippet, [data-testid="attribute_snippet_testid"]',
    detailContainer: '#jobDescriptionText, .jobsearch-JobComponent-description',
    detailTitle: '.jobsearch-JobInfoHeader-title, [data-testid="jobsearch-JobInfoHeader-title"]',
    detailCompany: '.jobsearch-InlineCompanyRating-companyHeader, [data-testid="inlineHeader-companyName"]',
    detailLocation: '.jobsearch-JobInfoHeader-subtitle, [data-testid="jobsearch-JobInfoHeader-subtitle"]',
    detailSalary: '#salaryInfoAndJobType, .jobsearch-JobMetadataHeader-item'
  };

  let observer = null;
  let lastUrl = location.href;
  let debounceTimer = null;

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
      const indeedSpecific = this.analyzeIndeedSpecifics(jobData, fullText);

      // Calcul du score
      let totalScore = 0;
      totalScore += redFlagResults.totalWeight;
      totalScore += greenFlagResults.totalWeight;
      totalScore += marketAnalysis.scoreAdjustment;
      totalScore += coherenceAnalysis.scoreAdjustment;
      totalScore += indeedSpecific.scoreAdjustment;

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
        normalizedScore, redFlagResults, greenFlagResults, marketAnalysis, indeedSpecific
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
        indeedAnalysis: indeedSpecific,
        summary: this.generateSummary(normalizedScore, classifications[0], redFlagResults, marketAnalysis),
        recommendations: this.generateRecommendations(classifications[0], redFlagResults, marketAnalysis, indeedSpecific),
        riskLevel: this.getRiskLevel(normalizedScore)
      };
    },

    detectDomain(text) {
      const patterns = {
        'tech': /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia|machine/i,
        'marketing': /marketing|communication|community|seo|sea|growth|content|brand|digital/i,
        'commercial': /commercial|vente|sales|account|business\s*develop|négociateur/i,
        'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk/i,
        'rh': /ressources\s*humaines|rh|recrutement|talent|paie/i,
        'logistique': /logistique|supply\s*chain|approvisionnement|transport|magasinier|préparateur|cariste/i
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
                       || salaryText.match(/(\d{2,3})\s*k\s*[-àa]\s*(\d{2,3})\s*k/i)
                       || salaryText.match(/(\d[\s,.]?\d{3})\s*(€|euros?)\s*(\/\s*mois|mensuel|par\s*mois)/i);

      if (!salaryMatch) {
        // Vérifier si Indeed affiche un salaire estimé
        if (/estimated|estimé/i.test(salaryText)) {
          result.details.push("Salaire estimé par Indeed (non confirmé)");
          result.isEstimated = true;
        } else {
          result.details.push("Salaire non précisé");
        }
        return result;
      }

      const numbers = salaryMatch[0].match(/\d+/g);
      let minSalary = parseInt(numbers[0].replace(/\s/g, ''));
      let maxSalary = numbers[1] ? parseInt(numbers[1].replace(/\s/g, '')) : minSalary;

      // Convertir en annuel si nécessaire
      if (/mois|mensuel|month/i.test(salaryMatch[0])) {
        minSalary *= 12;
        maxSalary *= 12;
      } else if (/k/i.test(salaryMatch[0]) || minSalary < 200) {
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
        const physicalRoles = /logistique|manutention|accueil|magasinier|production|cariste|préparateur/i;
        if (physicalRoles.test(text)) {
          issues.push("Télétravail 100% pour poste physique");
          scoreAdjustment += 25;
        }
      }

      // Freelance déguisé
      if (/cdi|cdd|permanent/i.test(text) && /auto-?entrepreneur|freelance|indépendant/i.test(text)) {
        issues.push("Possible freelance déguisé en contrat");
        scoreAdjustment += 20;
      }

      return { issues, scoreAdjustment };
    },

    analyzeIndeedSpecifics(jobData, text) {
      const result = { scoreAdjustment: 0, indicators: [], recommendations: [] };

      // Vérifier si recrutement urgent
      if (/urgent(ly)?\s*hiring|recrutement\s*urgent/i.test(text)) {
        result.indicators.push({ type: 'urgent', message: 'Recrutement urgent', score: 15 });
        result.scoreAdjustment += CONFIG.indeed.urgentWeight;
      }

      // Vérifier si embauche immédiate
      if (/hiring\s*immediately|embauche\s*immédiate/i.test(text)) {
        result.indicators.push({ type: 'immediate', message: 'Embauche immédiate', score: 20 });
        result.scoreAdjustment += 20;
      }

      // Analyse du salaire Indeed
      if (jobData.salary) {
        if (/estimated|estimé/i.test(jobData.salary)) {
          result.indicators.push({ type: 'salary_estimated', message: 'Salaire estimé par Indeed', score: 5 });
          result.scoreAdjustment += 5;
          result.recommendations.push("Demander confirmation du salaire réel");
        }
      } else {
        result.indicators.push({ type: 'salary_missing', message: 'Salaire non précisé', score: 10 });
        result.scoreAdjustment += 10;
        result.recommendations.push("Demander le salaire dès le premier contact");
      }

      // Analyse des avis entreprise (si mentionnés)
      const reviewMatch = text.match(/(\d+(?:\.\d)?)\s*(?:out\s*of\s*5|\/5|étoiles?|stars?)/i);
      if (reviewMatch) {
        const rating = parseFloat(reviewMatch[1]);
        if (rating >= 4.0) {
          result.indicators.push({ type: 'good_reviews', message: `Note entreprise: ${rating}/5`, score: -8 });
          result.scoreAdjustment -= 8;
        } else if (rating >= 3.0) {
          result.indicators.push({ type: 'avg_reviews', message: `Note entreprise correcte: ${rating}/5`, score: -3 });
          result.scoreAdjustment -= 3;
        } else {
          result.indicators.push({ type: 'bad_reviews', message: `Note entreprise faible: ${rating}/5`, score: 10 });
          result.scoreAdjustment += 10;
          result.recommendations.push("Lire les avis sur Glassdoor et Indeed");
        }
      }

      // Vérifier méthode de candidature
      if (/apply\s*on\s*company\s*site|postuler\s*sur\s*le\s*site/i.test(text)) {
        result.indicators.push({ type: 'external_apply', message: 'Candidature externe', score: 0 });
      } else if (/apply\s*now|postuler\s*maintenant|indeed\s*apply/i.test(text)) {
        result.indicators.push({ type: 'indeed_apply', message: 'Indeed Apply disponible', score: -3 });
        result.scoreAdjustment -= 3;
      }

      return result;
    },

    determineClassifications(score, redFlags, greenFlags, marketAnalysis, indeedSpecific) {
      const classifications = [];

      // Classification principale
      if (score >= 70) {
        classifications.push(CLASSIFICATIONS.ARNAQUE);
      } else if (score >= 60) {
        classifications.push(CLASSIFICATIONS.A_FUIR);
      } else if (score >= 50) {
        const hasDataHarvesting = redFlags.flags.some(f => f.category === 'data_harvesting');
        const hasMlm = redFlags.flags.some(f => f.category === 'mlm_network');

        if (hasDataHarvesting) {
          classifications.push(CLASSIFICATIONS.FAUSSE_OFFRE);
        } else if (hasMlm) {
          classifications.push(CLASSIFICATIONS.A_FUIR);
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

      // Classifications secondaires
      if (marketAnalysis.position === 'conforme' && classifications[0].code !== 'ADAPTEE_MARCHE') {
        classifications.push(CLASSIFICATIONS.ADAPTEE_MARCHE);
      }
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

    generateRecommendations(classification, redFlags, marketAnalysis, indeedSpecific) {
      const recommendations = [];

      switch (classification.code) {
        case 'ARNAQUE':
          recommendations.push("❌ Ne pas postuler - caractéristiques d'arnaque détectées");
          recommendations.push("🚫 Ne jamais fournir d'informations personnelles ou financières");
          recommendations.push("📢 Signaler cette offre à Indeed");
          break;
        case 'A_FUIR':
          recommendations.push("⚠️ Éviter cette offre - trop de signaux d'alerte");
          recommendations.push("🔍 Faire des recherches approfondies si vraiment intéressé");
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
          recommendations.push("🔍 Vérifier l'entreprise sur Glassdoor et Indeed");
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

      // Recommandations Indeed spécifiques
      if (indeedSpecific.recommendations) {
        recommendations.push(...indeedSpecific.recommendations);
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
  // INTERFACE UTILISATEUR (identique à LinkedIn)
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
              ${classification.icon} Analyse Indeed
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
              ${AdvancedAnalyzer.getClassificationDescription(classification.code)}
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

          <!-- Indeed spécifique -->
          ${analysis.indeedAnalysis.indicators.length > 0 ? `
            <div style="background: #faf5ff; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
              <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #374151;">
                🔍 Analyse Indeed
              </h3>
              ${analysis.indeedAnalysis.indicators.map(ind => `
                <p style="margin: 4px 0; font-size: 13px; color: #6b46c1;">
                  • ${ind.message}
                </p>
              `).join('')}
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
      `;
      toast.innerHTML = `<span>${type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️'}</span><span>${message}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 4000);
    }
  };

  // ============================================================================
  // LOGIQUE PRINCIPALE
  // ============================================================================

  function init() {
    console.log('[Fake Job Detector] Indeed Advanced initialise v2.0');
    setTimeout(analyzeCurrentPage, 1500);
    setupObserver();
    setupUrlWatcher();
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
    // Analyser les cartes dans la liste
    document.querySelectorAll(SELECTORS.jobCards).forEach(card => {
      if (!card.hasAttribute('data-fjd-analyzed') && !card.querySelector('.fjd-badge')) {
        analyzeJobCard(card);
        card.setAttribute('data-fjd-analyzed', 'true');
      }
    });

    // Analyser le détail de l'offre
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

    // Style visuel selon le niveau de risque
    if (analysis.score >= 70) {
      card.style.borderLeft = '4px solid #dc2626';
      card.style.backgroundColor = 'rgba(220, 38, 38, 0.03)';
    } else if (analysis.score >= 50) {
      card.style.borderLeft = '4px solid #ea580c';
      card.style.backgroundColor = 'rgba(234, 88, 12, 0.02)';
    }
  }

  function extractJobDataFromCard(card) {
    const getText = (sel) => card.querySelector(sel)?.textContent?.trim() || '';
    return {
      title: getText(SELECTORS.jobTitle),
      company: getText(SELECTORS.company),
      location: getText(SELECTORS.location),
      salary: getText(SELECTORS.salary),
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

      // Notification selon le niveau de risque
      if (analysis.score >= 70) {
        UI.showToast(`🚨 Arnaque probable! ${analysis.redFlags.length} alertes détectées`, 'error');
      } else if (analysis.score >= 50) {
        UI.showToast(`⚠️ ${analysis.redFlags.length} signal(s) d'alerte - Vérifiez cette offre`, 'warning');
      }
    }
  }

  function extractJobDetailData() {
    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || '';

    let description = '';
    document.querySelectorAll(SELECTORS.detailContainer).forEach(c => description += ' ' + c.textContent);

    return {
      title: getText(SELECTORS.detailTitle),
      company: getText(SELECTORS.detailCompany),
      location: getText(SELECTORS.detailLocation),
      salary: getText(SELECTORS.detailSalary),
      description: description.trim(),
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
