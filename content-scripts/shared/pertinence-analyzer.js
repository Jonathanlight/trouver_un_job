/**
 * Fake Job Detector - Analyseur de Pertinence Universel v2.0
 * Croisement linéaire: Diplôme × Salaire × Profil × Rédaction
 */

const FJD_PertinenceAnalyzer = (function() {
  'use strict';

  const CONFIG = {
    weights: {
      legitimacy: 0.25,
      market: 0.25,
      quality: 0.20,
      profile: 0.15,
      coherence: 0.15
    }
  };

  // ============================================================================
  // MODIFICATEURS PAR PLATEFORME
  // ============================================================================

  const PLATFORM_MODIFIERS = {
    linkedin: {
      basePenalty: 0,
      redFlagMultiplier: 1.0,
      trustBonus: 5,  // LinkedIn vérifie les entreprises
      applicantWeight: 1.0
    },
    indeed: {
      basePenalty: 0,
      redFlagMultiplier: 1.0,
      trustBonus: 0,
      applicantWeight: 1.1
    },
    hellowork: {
      basePenalty: 5,  // Pénalité de base - beaucoup de fausses offres bien formatées
      redFlagMultiplier: 1.3,  // +30% sur les red flags
      trustBonus: -3,  // HelloWork moins fiable par défaut
      applicantWeight: 0.9
    },
    wttj: {
      basePenalty: 0,
      redFlagMultiplier: 1.0,
      trustBonus: 3,  // WTTJ vérifie les entreprises
      applicantWeight: 1.0
    },
    default: {
      basePenalty: 0,
      redFlagMultiplier: 1.0,
      trustBonus: 0,
      applicantWeight: 1.0
    }
  };

  // ============================================================================
  // PÉNALITÉS NOMBRE DE CANDIDATS (CRITÈRES STRICTS)
  // ============================================================================

  const APPLICANT_PENALTIES = [
    { threshold: 500, penalty: 55, label: "Ghost job quasi-certain", level: "critical", status: "danger" },
    { threshold: 300, penalty: 45, label: "Ghost job très probable", level: "critical", status: "danger" },
    { threshold: 200, penalty: 38, label: "Offre probablement saturée", level: "high", status: "danger" },
    { threshold: 150, penalty: 32, label: "Trop de candidats - mauvaise offre", level: "high", status: "danger" },
    { threshold: 100, penalty: 28, label: "Concurrence excessive", level: "high", status: "warning" },
    { threshold: 80,  penalty: 25, label: "Offre saturée (+80 candidats)", level: "high", status: "warning" },
    { threshold: 60,  penalty: 18, label: "Forte concurrence", level: "medium", status: "warning" },
    { threshold: 40,  penalty: 12, label: "Concurrence modérée", level: "medium", status: null },
    { threshold: 25,  penalty: 5,  label: "Concurrence normale", level: "low", status: null }
  ];

  function calculateApplicantPenalty(applicantCount, platform = 'default') {
    if (applicantCount === null || applicantCount === undefined || applicantCount < 0) {
      return { penalty: 0, label: null, level: null, status: null };
    }

    const platformMod = PLATFORM_MODIFIERS[platform] || PLATFORM_MODIFIERS.default;

    for (const tier of APPLICANT_PENALTIES) {
      if (applicantCount >= tier.threshold) {
        const adjustedPenalty = Math.round(tier.penalty * platformMod.applicantWeight);
        return {
          penalty: adjustedPenalty,
          label: `${applicantCount}+ candidats - ${tier.label}`,
          level: tier.level,
          status: tier.status,
          isGhostJob: tier.level === "critical",
          isBadOffer: tier.threshold >= 80  // Marquer comme mauvaise offre si >= 80 candidats
        };
      }
    }

    // Moins de 25 candidats = positif
    if (applicantCount < 5) {
      return { penalty: -8, label: `${applicantCount} candidats - Excellente opportunité`, level: "excellent", status: null };
    }
    if (applicantCount < 10) {
      return { penalty: -5, label: `${applicantCount} candidats - Très bonne opportunité`, level: "positive", status: null };
    }
    if (applicantCount < 20) {
      return { penalty: -3, label: `${applicantCount} candidats - Bonne opportunité`, level: "positive", status: null };
    }

    return { penalty: 0, label: null, level: null, status: null };
  }

  // ============================================================================
  // VÉRIFICATION ENTREPRISE (HEURISTIQUES LOCALES)
  // ============================================================================

  const COMPANY_VERIFICATION = {
    legitimate: [
      { pattern: /\b(SA|SAS|SARL|EURL|SNC|GIE|SASU)\b/i, score: 10, label: "Forme juridique identifiée" },
      { pattern: /RCS\s+[A-Za-z]+\s*\d+/i, score: 12, label: "RCS mentionné" },
      { pattern: /siret\s*:\s*\d{14}/i, score: 15, label: "SIRET complet" },
      { pattern: /siège\s+(social\s+)?(à|situé|basé)/i, score: 6, label: "Siège social mentionné" },
      { pattern: /(\d{2,})\s*(ans?\s+d'?existence|années?\s+d'?activité)/i, score: 5, label: "Ancienneté mentionnée" },
      { pattern: /filiale\s+(de|du\s+groupe)/i, score: 8, label: "Filiale identifiée" },
      { pattern: /coté(e)?\s+(en\s+)?bourse|CAC\s*40|SBF|euronext/i, score: 15, label: "Société cotée" },
      { pattern: /certifi(é|cation)\s+(ISO|AFNOR|B\s*Corp|Qualiopi)/i, score: 8, label: "Certification qualité" },
      { pattern: /convention\s+collective|ccn\s*\d+/i, score: 10, label: "Convention collective" },
      { pattern: /\d{3,}\s*(collaborateurs?|salariés?|employés?)/i, score: 6, label: "Effectif mentionné" }
    ],
    suspicious: [
      { pattern: /entreprise\s+confidentielle/i, score: -20, label: "Entreprise cachée" },
      { pattern: /nom\s+(de\s+l'?)?entreprise\s*:\s*(confidentiel|NC|non\s+communiqué)/i, score: -25, label: "Nom entreprise non communiqué" },
      { pattern: /pour\s+(le\s+)?compte\s+d'?un\s+client/i, score: -10, label: "Client non identifié" },
      { pattern: /nous\s+recherchons\s+pour\s+(nos\s+)?clients?/i, score: -12, label: "Cabinet multi-clients vague" },
      { pattern: /leader\s+(du\s+marché|mondial|européen|français)\s*[.!]?\s*$/i, score: -8, label: "Auto-proclamation vague" },
      { pattern: /entreprise\s+(dynamique|innovante|en\s+pleine\s+croissance)\s*[.!]?\s*$/i, score: -5, label: "Description générique" },
      { pattern: /acteur\s+(majeur|incontournable|de\s+référence)/i, score: -5, label: "Formule creuse" },
      { pattern: /\ben\s+phase\s+de\s+(création|lancement)\b/i, score: -8, label: "Entreprise non établie" },
      { pattern: /startup\s+early\s*stage/i, score: -5, label: "Startup très jeune" }
    ],
    nameQuality: [
      { check: (name) => !name || name.length < 3, score: -15, label: "Nom entreprise absent/trop court" },
      { check: (name) => /^[A-Z\s]+$/.test(name) && name.length > 12, score: -3, label: "Nom tout en majuscules" },
      { check: (name) => /recrutement|interim|rh\s*solution|staffing/i.test(name), score: -8, label: "Intermédiaire de recrutement" },
      { check: (name) => /\d{4,}/.test(name), score: -10, label: "Numéros suspects dans le nom" },
      { check: (name) => /[!@#$%^&*()]+/.test(name), score: -15, label: "Caractères spéciaux dans le nom" }
    ]
  };

  function evaluateCompanyLegitimacy(text, companyName) {
    let score = 50; // Score de base neutre
    const signals = [];

    // Vérifier les indicateurs légitimes
    for (const indicator of COMPANY_VERIFICATION.legitimate) {
      if (indicator.pattern.test(text)) {
        score += indicator.score;
        signals.push({ type: 'positive', label: indicator.label, score: indicator.score });
      }
    }

    // Vérifier les indicateurs suspects
    for (const indicator of COMPANY_VERIFICATION.suspicious) {
      if (indicator.pattern.test(text)) {
        score += indicator.score;
        signals.push({ type: 'negative', label: indicator.label, score: indicator.score });
      }
    }

    // Vérifier la qualité du nom d'entreprise
    if (companyName) {
      for (const check of COMPANY_VERIFICATION.nameQuality) {
        if (check.check(companyName)) {
          score += check.score;
          signals.push({ type: 'negative', label: check.label, score: check.score });
        }
      }
    } else {
      score -= 15;
      signals.push({ type: 'negative', label: "Nom entreprise absent", score: -15 });
    }

    // Vérifier cohérence email/entreprise
    const emailMatch = text.match(/@([a-z0-9-]+)\.(com|fr|eu|io|co)/i);
    if (emailMatch && companyName && companyName.length > 4) {
      const domain = emailMatch[1].toLowerCase();
      const companyClean = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (domain.includes(companyClean.substring(0, Math.min(5, companyClean.length)))) {
        score += 8;
        signals.push({ type: 'positive', label: 'Email cohérent avec entreprise', score: 8 });
      }
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      signals,
      isVerified: score >= 60,
      isSuspicious: score < 35
    };
  }

  // ============================================================================
  // DÉTECTION OFFRE REPUBLIÉE
  // ============================================================================

  const REPOSTED_PATTERNS = [
    { pattern: /republiée/i, penalty: 15, label: "Offre republiée" },
    { pattern: /reposted/i, penalty: 15, label: "Offre republiée (reposted)" },
    { pattern: /actualiser?\s*(le|l')?\s*\d+/i, penalty: 10, label: "Offre actualisée" },
    { pattern: /mise\s*à\s*jour\s*(le|:)/i, penalty: 8, label: "Offre mise à jour" },
    { pattern: /prolongée?\s*jusqu/i, penalty: 12, label: "Offre prolongée" },
    { pattern: /toujours\s*(d'?)?actualité/i, penalty: 10, label: "Toujours d'actualité (suspect)" },
    { pattern: /poste\s*toujours\s*(ouvert|disponible)/i, penalty: 8, label: "Poste toujours ouvert" }
  ];

  function detectRepostedOffer(text, context = {}) {
    let totalPenalty = 0;
    const signals = [];
    let isReposted = false;

    // Vérifier les patterns textuels
    for (const item of REPOSTED_PATTERNS) {
      if (item.pattern.test(text)) {
        totalPenalty += item.penalty;
        signals.push({ label: item.label, penalty: item.penalty });
        if (item.label.includes('republiée') || item.label.includes('reposted')) {
          isReposted = true;
        }
      }
    }

    // Si le contexte contient explicitement isReposted (extrait par la plateforme)
    if (context.isReposted === true) {
      if (!isReposted) {
        totalPenalty += 15;
        signals.push({ label: "Offre republiée", penalty: 15 });
      }
      isReposted = true;
    }

    // Vérifier l'ancienneté si disponible (offre > 30 jours = suspect)
    if (context.postedDaysAgo !== null && context.postedDaysAgo !== undefined) {
      if (context.postedDaysAgo > 60) {
        totalPenalty += 20;
        signals.push({ label: `Offre ancienne (${context.postedDaysAgo}+ jours)`, penalty: 20 });
      } else if (context.postedDaysAgo > 30) {
        totalPenalty += 10;
        signals.push({ label: `Offre de ${context.postedDaysAgo} jours`, penalty: 10 });
      }
    }

    return {
      penalty: totalPenalty,
      signals,
      isReposted,
      shouldWarn: totalPenalty >= 10
    };
  }

  // ============================================================================
  // ANALYSE RIGOUREUSE DES ANNÉES D'EXPÉRIENCE
  // ============================================================================

  const EXPERIENCE_ANALYSIS_CONFIG = {
    // Seuils d'expérience excessive par type de poste
    excessiveExperience: {
      junior: { max: 2, warningAt: 1, penalty: 20, label: "Expérience excessive pour poste junior" },
      confirmé: { max: 5, warningAt: 4, penalty: 15, label: "Expérience trop élevée pour confirmé" },
      senior: { max: 10, warningAt: 8, penalty: 10, label: "Expérience senior exagérée" },
      expert: { max: 15, warningAt: 12, penalty: 8, label: "Expérience expert extrême" }
    },

    // Titres de postes et expérience cohérente
    positionExpectations: [
      { pattern: /\b(stagiaire|stage|intern)\b/i, expectedExp: { min: 0, max: 0 }, penaltyPerYear: 25 },
      { pattern: /\b(alternant|alternance|apprenti)\b/i, expectedExp: { min: 0, max: 1 }, penaltyPerYear: 20 },
      { pattern: /\b(junior|débutant|entry.level|graduate|jeune.diplômé)\b/i, expectedExp: { min: 0, max: 2 }, penaltyPerYear: 15 },
      { pattern: /\b(confirmé|intermédiaire|mid.level)\b/i, expectedExp: { min: 2, max: 5 }, penaltyPerYear: 8 },
      { pattern: /\b(senior|expérimenté|experienced)\b/i, expectedExp: { min: 5, max: 10 }, penaltyPerYear: 5 },
      { pattern: /\b(expert|staff|principal)\b/i, expectedExp: { min: 8, max: 15 }, penaltyPerYear: 3 },
      { pattern: /\b(lead|manager|responsable|directeur|head)\b/i, expectedExp: { min: 7, max: 20 }, penaltyPerYear: 2 }
    ],

    // Expérience irréaliste par secteur (années max normales)
    sectorMaxExperience: {
      tech: 15,      // Tech évolue vite, +15 ans rare
      finance: 25,
      industrie: 30,
      commerce: 20,
      sante: 30,
      default: 25
    }
  };

  function analyzeExperienceRequirements(text, jobTitle, sector = 'default') {
    const issues = [];
    let totalPenalty = 0;
    let detectedExperience = null;

    // Extraire l'expérience demandée
    const expPatterns = [
      { pattern: /(\d{1,2})\s*[-àa]\s*(\d{1,2})\s*ans?\s*(?:d'?)?(?:expérience|exp\.?)/i, extract: (m) => ({ min: parseInt(m[1]), max: parseInt(m[2]) }) },
      { pattern: /minimum\s*(\d{1,2})\s*ans?\s*(?:d'?)?(?:expérience|exp\.?)/i, extract: (m) => ({ min: parseInt(m[1]), max: parseInt(m[1]) + 3 }) },
      { pattern: /(\d{1,2})\s*\+?\s*ans?\s*(?:d'?)?(?:expérience|exp\.?)\s*(?:minimum|requis|exigé)/i, extract: (m) => ({ min: parseInt(m[1]), max: parseInt(m[1]) + 3 }) },
      { pattern: /au\s*moins\s*(\d{1,2})\s*ans?/i, extract: (m) => ({ min: parseInt(m[1]), max: parseInt(m[1]) + 3 }) },
      { pattern: /(\d{1,2})\s*ans?\s*(?:d'?)?(?:expérience|exp\.?)/i, extract: (m) => ({ min: parseInt(m[1]), max: parseInt(m[1]) }) }
    ];

    for (const expPattern of expPatterns) {
      const match = text.match(expPattern.pattern);
      if (match) {
        detectedExperience = expPattern.extract(match);
        break;
      }
    }

    if (!detectedExperience) {
      return { penalty: 0, issues: [], detectedExperience: null, isProblematic: false };
    }

    const expYears = detectedExperience.max;
    const fullText = `${jobTitle || ''} ${text}`.toLowerCase();

    // 1. Vérifier si l'expérience est cohérente avec le titre du poste
    for (const posConfig of EXPERIENCE_ANALYSIS_CONFIG.positionExpectations) {
      if (posConfig.pattern.test(fullText)) {
        if (expYears > posConfig.expectedExp.max) {
          const excess = expYears - posConfig.expectedExp.max;
          const penalty = Math.min(40, excess * posConfig.penaltyPerYear);
          totalPenalty += penalty;
          issues.push({
            type: 'position_mismatch',
            label: `${expYears} ans demandés pour un poste "${fullText.match(posConfig.pattern)?.[0]}" (max attendu: ${posConfig.expectedExp.max} ans)`,
            penalty,
            severity: penalty >= 25 ? 'critical' : (penalty >= 15 ? 'high' : 'medium')
          });
        }
        break;
      }
    }

    // 2. Vérifier si l'expérience est irréaliste pour le secteur
    const maxSectorExp = EXPERIENCE_ANALYSIS_CONFIG.sectorMaxExperience[sector] || EXPERIENCE_ANALYSIS_CONFIG.sectorMaxExperience.default;
    if (expYears > maxSectorExp) {
      const penalty = 20;
      totalPenalty += penalty;
      issues.push({
        type: 'unrealistic',
        label: `${expYears} ans d'expérience demandés (irréaliste pour le secteur)`,
        penalty,
        severity: 'high'
      });
    }

    // 3. Vérifier les demandes d'expérience excessive en général
    if (expYears >= 10 && !/senior|expert|lead|manager|directeur|head|principal|staff/i.test(fullText)) {
      const penalty = 15;
      totalPenalty += penalty;
      issues.push({
        type: 'excessive',
        label: `${expYears}+ ans demandés sans titre senior correspondant`,
        penalty,
        severity: 'medium'
      });
    }

    // 4. Vérifier l'incohérence salaire/expérience (sera vérifié ailleurs mais flag ici)
    if (expYears >= 7) {
      // Ces postes devraient avoir un salaire élevé - ajout d'un flag
      issues.push({
        type: 'salary_check_needed',
        label: `Vérifier que le salaire correspond à ${expYears} ans d'expérience`,
        penalty: 0,
        severity: 'info'
      });
    }

    // 5. Demandes de compétences contradictoires avec l'expérience
    if (expYears >= 5 && /formation\s*(interne|complète|assurée)|pas\s*de\s*prérequis|aucune\s*expérience/i.test(text)) {
      const penalty = 18;
      totalPenalty += penalty;
      issues.push({
        type: 'contradiction',
        label: `Demande ${expYears} ans d'exp mais propose formation complète - incohérent`,
        penalty,
        severity: 'high'
      });
    }

    return {
      penalty: totalPenalty,
      issues,
      detectedExperience,
      isProblematic: totalPenalty >= 15,
      shouldMarkAsBad: totalPenalty >= 25  // Marquer l'offre comme mauvaise si trop de problèmes d'expérience
    };
  }

  // ============================================================================
  // DÉTECTION INCOHÉRENCES JUNIOR / STAGE / ALTERNANCE
  // ============================================================================

  const ENTRY_LEVEL_CONFIG = {
    // Types de contrats d'entrée de carrière
    entryContracts: {
      stage: {
        pattern: /\bstage\b|internship/i,
        maxExperience: 1,
        maxSalary: 15000,  // Gratification max ~7k€/an pour 6 mois
        label: "Stage"
      },
      alternance: {
        pattern: /\balternance\b|\bapprentissage\b|\bcontrat\s*(d'?)?apprentissage\b|\bcontrat\s*pro\b/i,
        maxExperience: 1,
        maxSalary: 28000,  // Salaire max alternant
        label: "Alternance"
      },
      junior: {
        pattern: /\bjunior\b|\bdébutant\b|\bentrée\s*(de\s*)?carrière\b|\bentry\s*level\b|\bjeune\s*diplômé\b|\bgraduate\b/i,
        maxExperience: 2,
        maxSalary: 42000,  // Salaire junior max raisonnable
        label: "Junior/Débutant"
      }
    },

    // Patterns de responsabilités senior incompatibles avec profil junior
    seniorResponsibilities: [
      { pattern: /manager?\s*(une?\s*)?(équipe|team)/i, label: "Management d'équipe" },
      { pattern: /encadrer?\s*(une?\s*)?\d+\s*(personnes?|collaborateurs?)/i, label: "Encadrement" },
      { pattern: /budget\s*(de\s*)?\d+\s*(k€?|m€?|millions?)/i, label: "Responsabilité budget" },
      { pattern: /pilotage\s*(stratégique|global)/i, label: "Pilotage stratégique" },
      { pattern: /définir?\s*(la\s*)?(stratégie|vision)/i, label: "Définition stratégie" },
      { pattern: /p&l|profit\s*(and|&)\s*loss/i, label: "Responsabilité P&L" },
      { pattern: /directeur|director|head\s*of|responsable\s*(de\s*)?(département|service)/i, label: "Poste de direction" },
      { pattern: /expérience\s*(confirmée|significative|solide)/i, label: "Expérience confirmée requise" }
    ],

    // Patterns d'expérience excessive pour profil junior
    excessiveExperience: [
      { pattern: /(\d+)\s*[-àa]\s*(\d+)\s*ans?\s*(d'?)?exp/i, extract: (m) => Math.max(parseInt(m[1]), parseInt(m[2])) },
      { pattern: /(\d+)\s*ans?\s*(d'?)?exp\s*(min|minimum|requis)/i, extract: (m) => parseInt(m[1]) },
      { pattern: /minimum\s*(\d+)\s*ans?/i, extract: (m) => parseInt(m[1]) },
      { pattern: /au\s*moins\s*(\d+)\s*ans?/i, extract: (m) => parseInt(m[1]) }
    ]
  };

  function detectEntryLevelIncoherence(text, jobData, context = {}) {
    const issues = [];
    let totalPenalty = 0;
    let detectedLevel = null;
    let isIncoherent = false;

    // Détecter le type de contrat d'entrée
    for (const [type, config] of Object.entries(ENTRY_LEVEL_CONFIG.entryContracts)) {
      if (config.pattern.test(text)) {
        detectedLevel = { type, ...config };
        break;
      }
    }

    // Si ce n'est pas un poste d'entrée, pas d'analyse
    if (!detectedLevel) {
      return { penalty: 0, issues: [], isIncoherent: false, detectedLevel: null };
    }

    // 1. Vérifier l'expérience demandée
    let maxExperienceFound = 0;
    for (const expPattern of ENTRY_LEVEL_CONFIG.excessiveExperience) {
      const match = text.match(expPattern.pattern);
      if (match) {
        const years = expPattern.extract(match);
        maxExperienceFound = Math.max(maxExperienceFound, years);
      }
    }

    if (maxExperienceFound > detectedLevel.maxExperience) {
      const penalty = Math.min(30, (maxExperienceFound - detectedLevel.maxExperience) * 10);
      totalPenalty += penalty;
      issues.push({
        type: 'experience',
        label: `${detectedLevel.label} demandant ${maxExperienceFound} ans d'expérience`,
        penalty,
        severity: 'high'
      });
      isIncoherent = true;
    }

    // 2. Vérifier les responsabilités senior
    const seniorResponsibilitiesFound = [];
    for (const resp of ENTRY_LEVEL_CONFIG.seniorResponsibilities) {
      if (resp.pattern.test(text)) {
        seniorResponsibilitiesFound.push(resp.label);
      }
    }

    if (seniorResponsibilitiesFound.length > 0) {
      const penalty = Math.min(25, seniorResponsibilitiesFound.length * 8);
      totalPenalty += penalty;
      issues.push({
        type: 'responsibilities',
        label: `${detectedLevel.label} avec responsabilités senior: ${seniorResponsibilitiesFound.slice(0, 2).join(', ')}`,
        penalty,
        severity: 'high'
      });
      isIncoherent = true;
    }

    // 3. Vérifier le salaire (si disponible et trop élevé pour le niveau)
    const salary = context.salary || jobData?.salary;
    if (salary && typeof salary === 'object' && salary.max) {
      if (salary.max > detectedLevel.maxSalary * 1.3) {
        const penalty = 12;
        totalPenalty += penalty;
        issues.push({
          type: 'salary',
          label: `Salaire élevé pour ${detectedLevel.label.toLowerCase()} (${Math.round(salary.max/1000)}k€)`,
          penalty,
          severity: 'medium'
        });
      }
    }

    // 4. Vérifier les titres contradictoires
    const contradictoryTitles = [
      { pattern: /senior\s*(et|\/)\s*junior/i, label: "Titre contradictoire senior/junior" },
      { pattern: /\bsenior\b.*\bjunior\b|\bjunior\b.*\bsenior\b/i, label: "Mélange senior et junior" },
      { pattern: /confirmé.*débutant|débutant.*confirmé/i, label: "Mélange confirmé et débutant" },
      { pattern: /expert.*junior|junior.*expert/i, label: "Mélange expert et junior" }
    ];

    for (const title of contradictoryTitles) {
      if (title.pattern.test(text)) {
        totalPenalty += 15;
        issues.push({
          type: 'title',
          label: title.label,
          penalty: 15,
          severity: 'high'
        });
        isIncoherent = true;
        break;
      }
    }

    // 5. Vérifications spécifiques par type
    if (detectedLevel.type === 'stage') {
      // Stage de plus de 6 mois = suspect
      if (/stage\s*(de\s*)?(8|9|10|11|12)\s*mois/i.test(text)) {
        totalPenalty += 10;
        issues.push({
          type: 'duration',
          label: "Stage de durée excessive",
          penalty: 10,
          severity: 'medium'
        });
      }

      // Stage demandant CDI/CDD après = OK, mais stage sans possibilité = attention
      if (/sans\s*(embauche|possibilité)/i.test(text)) {
        totalPenalty += 5;
        issues.push({
          type: 'outcome',
          label: "Stage sans perspective d'embauche",
          penalty: 5,
          severity: 'low'
        });
      }
    }

    if (detectedLevel.type === 'alternance') {
      // Alternance demandant disponibilité immédiate (contradictoire avec rythme école)
      if (/disponible?\s*imm[ée]diat/i.test(text) && !/rentrée|septembre|janvier/i.test(text)) {
        totalPenalty += 8;
        issues.push({
          type: 'availability',
          label: "Alternance avec disponibilité immédiate (suspect)",
          penalty: 8,
          severity: 'medium'
        });
      }
    }

    return {
      penalty: totalPenalty,
      issues,
      isIncoherent,
      detectedLevel: detectedLevel.label,
      shouldWarn: totalPenalty >= 10
    };
  }

  // ============================================================================
  // DONNÉES DE RÉFÉRENCE MARCHÉ FRANCE 2024-2025
  // ============================================================================

  const MARKET_DATA = {
    // Salaires par niveau de diplôme (brut annuel)
    salaryByDiploma: {
      'cap_bep': { min: 21000, median: 24000, max: 30000 },
      'bac': { min: 23000, median: 27000, max: 34000 },
      'bac2': { min: 26000, median: 32000, max: 40000 },
      'bac3': { min: 28000, median: 35000, max: 45000 },
      'bac5': { min: 34000, median: 42000, max: 55000 },
      'bac8': { min: 40000, median: 52000, max: 70000 }
    },

    // Bonus par années d'expérience (coefficient multiplicateur)
    experienceBonus: {
      0: 0.85, 1: 0.92, 2: 1.00, 3: 1.08, 4: 1.15,
      5: 1.22, 7: 1.35, 10: 1.50, 15: 1.70, 20: 1.85
    },

    // Secteurs avec coefficients
    sectors: {
      'tech': { coef: 1.25, keywords: /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia|machine\s*learning|python|java|php|javascript|react|node|sre|cyber/i },
      'finance': { coef: 1.20, keywords: /financ|comptab|audit|contrôle|gestion|trésor|risk|analyst|banque/i },
      'energie': { coef: 1.15, keywords: /électric|énerg|nucléaire|edf|engie|maintenance|haute\s*tension|basse\s*tension/i },
      'sante': { coef: 1.10, keywords: /médic|infirm|aide.soign|pharma|santé|hôpital|clinique/i },
      'industrie': { coef: 1.05, keywords: /industriel|production|usine|manufactur|qualité|méthode|maintenance/i },
      'social': { coef: 0.90, keywords: /social|éducat|association|aide|accompagn|insertion|travailleur\s*social/i },
      'commerce': { coef: 0.95, keywords: /commercial|vente|retail|magasin|vendeur/i },
      'services': { coef: 0.95, keywords: /service|domicile|auxiliaire|aide.personne|ménage/i },
      'default': { coef: 1.00, keywords: null }
    },

    // Localisation (IDF = +15%, grandes villes = +5%, province = -5%)
    locations: {
      'paris': 1.15, '75': 1.15, 'ile-de-france': 1.10, 'idf': 1.10,
      '92': 1.10, '93': 1.05, '94': 1.08, '78': 1.05, '91': 1.05, '95': 1.05, '77': 1.03,
      'lyon': 1.05, 'marseille': 1.02, 'toulouse': 1.02, 'bordeaux': 1.03,
      'nantes': 1.02, 'lille': 1.00, 'nice': 1.03, 'strasbourg': 1.00,
      'default': 0.95
    }
  };

  // ============================================================================
  // PATTERNS DE DÉTECTION
  // ============================================================================

  const PATTERNS = {
    redFlags: {
      critical: [
        { pattern: /paiement\s*(requis|nécessaire|obligatoire)/i, impact: -45, label: "Paiement requis - ARNAQUE" },
        { pattern: /frais\s*(de\s*)?(inscription|formation|dossier)/i, impact: -45, label: "Frais demandés - ARNAQUE" },
        { pattern: /investissement\s*(initial|de\s*départ)/i, impact: -45, label: "Investissement demandé - ARNAQUE" },
        { pattern: /acheter?\s*(le\s*)?(kit|stock|matériel)/i, impact: -40, label: "Achat obligatoire - MLM/Arnaque" },
        { pattern: /gagn(er|ez)\s*(jusqu'?à\s*)?\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, impact: -40, label: "Gains irréalistes - Scam" },
        { pattern: /devenez?\s*(riche|millionnaire)/i, impact: -45, label: "Promesse enrichissement - Arnaque" },
        { pattern: /pas\s*(d'?|de\s*)entretien/i, impact: -35, label: "Sans entretien - Très suspect" },
        { pattern: /parrain(age|er)|filleul|mlm|marketing\s*(de\s*)?réseau/i, impact: -40, label: "Structure MLM détectée" },
        { pattern: /travail\s*(à\s*)?domicile.*\d{3,}\s*€\s*(par|\/)\s*jour/i, impact: -40, label: "Télétravail + gains élevés - Arnaque" }
      ],
      high: [
        { pattern: /revenu\s*(passif|illimité|garanti)/i, impact: -30, label: "Revenu garanti - Suspect" },
        { pattern: /sans\s*(effort|travail|compétence)/i, impact: -30, label: "Sans effort - Irréaliste" },
        { pattern: /embauche\s*(immédiate|garantie)/i, impact: -25, label: "Embauche garantie - Méfiance" },
        { pattern: /whatsapp|telegram\s*(pour|uniquement)/i, impact: -25, label: "Contact messagerie uniquement" },
        { pattern: /crypto|bitcoin|nft|forex\s*(trad|invest)/i, impact: -28, label: "Crypto/Trading suspect" },
        { pattern: /commission\s*(attractive|illimitée|sans\s*plafond)/i, impact: -22, label: "Commission sans plafond - MLM?" },
        { pattern: /recrutez?\s*(des?\s*)?(membres?|personnes?|candidats?)/i, impact: -25, label: "Recrutement de membres - Pyramidal" },
        { pattern: /formation\s*(payante|à\s*vos?\s*frais)/i, impact: -30, label: "Formation payante par le candidat" },
        { pattern: /opportunité\s*(exceptionnelle|unique|à\s*ne\s*pas\s*manquer)/i, impact: -18, label: "Formule marketing agressive" },
        { pattern: /indépendant.*commission|commission.*indépendant/i, impact: -20, label: "Indépendant à commission - Méfiance" }
      ],
      medium: [
        { pattern: /@(gmail|yahoo|hotmail|outlook|live)\.(com|fr)/i, impact: -12, label: "Email personnel non pro" },
        { pattern: /urgent\s*!+|!!!+|\?\?\?+/i, impact: -10, label: "Ponctuation excessive" },
        { pattern: /vivier|constitution\s*(de\s*)?base/i, impact: -15, label: "Constitution de vivier" },
        { pattern: /entreprise\s*confidentielle|client\s*confidentiel/i, impact: -15, label: "Entreprise cachée" },
        { pattern: /salaire\s*(motivant|attractif|intéressant)\s*$/i, impact: -12, label: "Salaire non précisé (vague)" },
        { pattern: /selon\s*(profil|expérience)\s*$/i, impact: -8, label: "Salaire non communiqué" },
        { pattern: /nombreuses?\s*missions?|plusieurs\s*postes?/i, impact: -10, label: "Offre groupée - Vivier" },
        { pattern: /flexibilité\s*horaire\s*totale/i, impact: -8, label: "Horaires très flexibles - Vérifier" },
        { pattern: /disponibilité\s*(immédiate|dès\s*maintenant)\s*impérative/i, impact: -8, label: "Urgence suspecte" },
        { pattern: /revenus?\s*(complémentaires?|supplémentaires?)/i, impact: -10, label: "Revenus complémentaires - Vérifier" }
      ],
      low: [
        { pattern: /poste\s*à\s*pourvoir\s*rapidement/i, impact: -5, label: "Poste urgent" },
        { pattern: /profil\s*atypique\s*accepté/i, impact: -5, label: "Profil atypique accepté" },
        { pattern: /formation\s*assurée/i, impact: -3, label: "Formation assurée - Vérifier contrat" }
      ]
    },

    greenFlags: {
      high: [
        { pattern: /convention\s*collective|ccn\s*\d+/i, impact: 15, label: "Convention collective mentionnée" },
        { pattern: /n°?\s*siret\s*:?\s*\d{9,14}|siret\s*:?\s*\d{9,14}/i, impact: 15, label: "SIRET complet fourni" },
        { pattern: /processus\s*(de\s*)?recrutement.*\d+\s*(étapes?|entretiens?)/i, impact: 12, label: "Processus recrutement détaillé" },
        { pattern: /rcs\s+[a-z]+\s*\d+/i, impact: 14, label: "RCS mentionné" },
        { pattern: /coté(e)?\s+(en\s+)?bourse|cac\s*40|sbf|euronext/i, impact: 15, label: "Société cotée en bourse" },
        { pattern: /\d{3,}\s*(collaborateurs?|salariés?|employés?)/i, impact: 10, label: "Effectif > 100 personnes" },
        { pattern: /créée?\s*(en\s*)?(19|20)\d{2}/i, impact: 8, label: "Ancienneté de l'entreprise" },
        { pattern: /grille\s*salariale|salaire\s*:\s*\d+\s*k?€?\s*[-àa]\s*\d+/i, impact: 12, label: "Salaire transparent" }
      ],
      medium: [
        { pattern: /cdi\s*(temps\s*plein)?/i, impact: 10, label: "CDI temps plein" },
        { pattern: /mutuelle\s*(100%|prise\s*en\s*charge|familiale)/i, impact: 8, label: "Mutuelle avantageuse" },
        { pattern: /mutuelle|complémentaire\s*santé/i, impact: 5, label: "Mutuelle" },
        { pattern: /tickets?\s*restaurant|carte\s*(déjeuner|resto)/i, impact: 5, label: "Tickets restaurant" },
        { pattern: /13(ème|e)\s*mois/i, impact: 8, label: "13ème mois" },
        { pattern: /14(ème|e)\s*mois/i, impact: 10, label: "14ème mois" },
        { pattern: /rtt/i, impact: 6, label: "RTT" },
        { pattern: /participation|intéressement/i, impact: 7, label: "Participation/Intéressement" },
        { pattern: /prime\s*(annuelle|objectifs?|performance)/i, impact: 6, label: "Primes sur objectifs" },
        { pattern: /comité\s*(d'?)?entreprise|ce\b|cse\b/i, impact: 5, label: "CE/CSE" },
        { pattern: /compte\s*épargne\s*temps|cet\b/i, impact: 5, label: "Compte épargne temps" },
        { pattern: /formation\s*(continue|certifiante|diplômante)/i, impact: 7, label: "Formation qualifiante" },
        { pattern: /plan\s*(de\s*)?(carrière|évolution)/i, impact: 6, label: "Plan de carrière" },
        { pattern: /certifi(é|cation)\s*(iso|afnor|b\s*corp|qualiopi)/i, impact: 8, label: "Entreprise certifiée" },
        { pattern: /label\s*(diversité|égalité|responsable)/i, impact: 6, label: "Label responsabilité" }
      ],
      low: [
        { pattern: /télétravail\s*(hybride|partiel|\d+\s*jours?)/i, impact: 5, label: "Télétravail encadré" },
        { pattern: /télétravail/i, impact: 3, label: "Télétravail possible" },
        { pattern: /équipe\s*(de\s*)?\d+\s*personnes?/i, impact: 3, label: "Taille équipe précisée" },
        { pattern: /locaux\s*(neufs|modernes|spacieux)/i, impact: 2, label: "Locaux de qualité" },
        { pattern: /parking|place\s*de\s*stationnement/i, impact: 2, label: "Parking" },
        { pattern: /transport\s*(en\s*commun|pris\s*en\s*charge)/i, impact: 3, label: "Transport pris en charge" }
      ]
    },

    // Patterns diplômes
    diplomas: {
      'cap_bep': /cap\/?bep|certificat\s*d'?aptitude|brevet\s*d'?étude/i,
      'bac': /\bbac\b(?!\+)|niveau\s*bac\b|baccalauréat/i,
      'bac2': /bac\s*\+?\s*2|bts|dut|deug/i,
      'bac3': /bac\s*\+?\s*3|licence|bachelor|deust/i,
      'bac5': /bac\s*\+?\s*5|master|ingénieur|école\s*de\s*commerce|diplôme\s*d'?état/i,
      'bac8': /bac\s*\+?\s*8|doctorat|phd|thèse/i
    },

    // Patterns expérience
    experience: {
      'debutant': /débutant|sans\s*expérience|première\s*expérience|junior/i,
      'exp_1_2': /1\s*[-àa]\s*2\s*ans?|1\s*an\s*d'?exp|2\s*ans?\s*d'?exp/i,
      'exp_3_5': /3\s*[-àa]\s*5\s*ans?|[345]\s*ans?\s*d'?exp/i,
      'exp_5_10': /5\s*[-àa]\s*10\s*ans?|[56789]\s*ans?\s*d'?exp|environ\s*5\s*ans/i,
      'exp_10_plus': /10\s*ans?\s*(et\s*plus|minimum|\+)|1[0-9]\s*ans?\s*d'?exp|\+\s*10\s*ans/i
    }
  };

  // ============================================================================
  // CLASSIFICATIONS
  // ============================================================================

  const CLASSIFICATIONS = {
    // Bonnes offres (>= 50%) - Couleurs vertes
    EXCELLENT: { code: 'EXCELLENT', label: 'Excellente', color: '#059669', bgColor: '#d1fae5', minScore: 85 },
    TRES_BONNE: { code: 'TRES_BONNE', label: 'Très bonne', color: '#16a34a', bgColor: '#dcfce7', minScore: 75 },
    BONNE: { code: 'BONNE', label: 'Bonne', color: '#65a30d', bgColor: '#ecfccb', minScore: 65 },
    CORRECTE: { code: 'CORRECTE', label: 'Correcte', color: '#0d9488', bgColor: '#ccfbf1', minScore: 50 },

    // Offres moyennes/mauvaises (< 50%) - Couleurs ROUGES
    PASSABLE: { code: 'PASSABLE', label: 'Moyenne', color: '#dc2626', bgColor: '#fee2e2', minScore: 40 },
    MEDIOCRE: { code: 'MEDIOCRE', label: 'Médiocre', color: '#b91c1c', bgColor: '#fecaca', minScore: 30 },
    MAUVAISE: { code: 'MAUVAISE', label: 'Mauvaise', color: '#991b1b', bgColor: '#fca5a5', minScore: 20 },
    A_EVITER: { code: 'A_EVITER', label: 'À éviter', color: '#7f1d1d', bgColor: '#f87171', minScore: 10 },
    DANGEREUSE: { code: 'DANGEREUSE', label: 'Dangereuse', color: '#450a0a', bgColor: '#ef4444', minScore: 0 }
  };

  // ============================================================================
  // ANALYSE DIPLÔME ET PROFIL
  // ============================================================================

  function detectDiploma(text) {
    for (const [level, pattern] of Object.entries(PATTERNS.diplomas)) {
      if (pattern.test(text)) return level;
    }
    return null;
  }

  function detectExperience(text) {
    if (PATTERNS.experience.exp_10_plus.test(text)) return 12;
    if (PATTERNS.experience.exp_5_10.test(text)) return 7;
    if (PATTERNS.experience.exp_3_5.test(text)) return 4;
    if (PATTERNS.experience.exp_1_2.test(text)) return 1.5;
    if (PATTERNS.experience.debutant.test(text)) return 0;

    const match = text.match(/(\d+)\s*(?:ans?|années?)\s*(?:d'?)?(?:exp|minimum)/i);
    if (match) return parseInt(match[1]);

    return null;
  }

  function detectSector(text) {
    for (const [sector, data] of Object.entries(MARKET_DATA.sectors)) {
      if (data.keywords && data.keywords.test(text)) return sector;
    }
    return 'default';
  }

  function detectLocation(text) {
    const lowerText = text.toLowerCase();
    for (const [loc, multiplier] of Object.entries(MARKET_DATA.locations)) {
      if (lowerText.includes(loc)) return { name: loc, multiplier };
    }
    // Chercher les codes postaux
    const cp = text.match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
    if (cp) {
      const dept = cp[1];
      return { name: dept, multiplier: MARKET_DATA.locations[dept] || 1.0 };
    }
    return { name: 'province', multiplier: MARKET_DATA.locations.default };
  }

  function extractSalary(text) {
    // Format: XX XXX à XX XXX €
    let match = text.match(/(\d{1,2})\s*(\d{3})\s*(?:€|euros?)?\s*[-àa]\s*(\d{1,2})\s*(\d{3})\s*(?:€|euros?)/i);
    if (match) {
      const min = parseInt(match[1] + match[2]);
      const max = parseInt(match[3] + match[4]);
      return { min, max, avg: (min + max) / 2, type: 'annual' };
    }

    // Format: XX k à XX k
    match = text.match(/(\d{2,3})\s*k\s*€?\s*[-àa]\s*(\d{2,3})\s*k/i);
    if (match) {
      const min = parseInt(match[1]) * 1000;
      const max = parseInt(match[2]) * 1000;
      return { min, max, avg: (min + max) / 2, type: 'annual' };
    }

    // Format: X XXX € par mois
    match = text.match(/(\d{1,2})\s*(\d{3})\s*(?:€|euros?)\s*(?:par|\/)\s*mois/i);
    if (match) {
      const monthly = parseInt(match[1] + match[2]);
      const annual = monthly * 12;
      return { min: annual * 0.95, max: annual * 1.05, avg: annual, type: 'monthly' };
    }

    // Format: à partir de X XXX €
    match = text.match(/(?:à\s*partir\s*de|minimum)\s*(\d{1,2})\s*(\d{3})\s*(?:€|euros?)/i);
    if (match) {
      const base = parseInt(match[1] + match[2]);
      return { min: base, max: base * 1.2, avg: base * 1.1, type: 'minimum' };
    }

    // Format horaire: XX,XX € de l'heure
    match = text.match(/(\d{1,2})[,.](\d{2})\s*(?:€|euros?)\s*(?:de\s*l'?heure|\/h)/i);
    if (match) {
      const hourly = parseFloat(match[1] + '.' + match[2]);
      const annual = hourly * 35 * 52; // 35h/semaine, 52 semaines
      return { min: annual * 0.9, max: annual * 1.1, avg: annual, type: 'hourly', hourlyRate: hourly };
    }

    return null;
  }

  // ============================================================================
  // CALCULS DE SCORES
  // ============================================================================

  /**
   * Score de Légitimité (L) - Base 75, modifié par red/green flags
   */
  function calculateLegitimacyScore(text) {
    let score = 75;
    const redFlags = [];
    const greenFlags = [];

    for (const severity of ['critical', 'high', 'medium']) {
      for (const flag of PATTERNS.redFlags[severity]) {
        if (flag.pattern.test(text)) {
          score += flag.impact;
          redFlags.push({ ...flag, severity });
        }
      }
    }

    for (const level of ['high', 'medium', 'low']) {
      for (const flag of PATTERNS.greenFlags[level]) {
        if (flag.pattern.test(text)) {
          score += flag.impact;
          greenFlags.push({ ...flag, level });
        }
      }
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      redFlags,
      greenFlags,
      hasCriticalFlags: redFlags.some(f => f.severity === 'critical')
    };
  }

  /**
   * Score Marché (M) - Croisement linéaire Diplôme × Expérience × Secteur × Localisation
   * Formule: SalaireAttendu = BaseDiplôme × CoefExp × CoefSecteur × CoefLoc
   * Score = f(SalaireOffert / SalaireAttendu)
   */
  function calculateMarketScore(text, salary, diploma, experience, sector, location) {
    const details = [];
    const warnings = [];
    let score = 50;

    // Salaire attendu selon le diplôme
    const diplomaData = diploma ? MARKET_DATA.salaryByDiploma[diploma] : MARKET_DATA.salaryByDiploma['bac'];
    let expectedSalary = diplomaData.median;

    // Application du coefficient d'expérience (interpolation linéaire)
    if (experience !== null) {
      const expYears = Math.min(20, Math.max(0, experience));
      const expKeys = Object.keys(MARKET_DATA.experienceBonus).map(Number).sort((a, b) => a - b);

      let lowerKey = 0, upperKey = 20;
      for (let i = 0; i < expKeys.length; i++) {
        if (expKeys[i] <= expYears) lowerKey = expKeys[i];
        if (expKeys[i] >= expYears && upperKey === 20) upperKey = expKeys[i];
      }

      const lowerBonus = MARKET_DATA.experienceBonus[lowerKey];
      const upperBonus = MARKET_DATA.experienceBonus[upperKey];
      const ratio = upperKey === lowerKey ? 0 : (expYears - lowerKey) / (upperKey - lowerKey);
      const expCoef = lowerBonus + ratio * (upperBonus - lowerBonus);

      expectedSalary *= expCoef;
      details.push(`Exp: ${expYears} ans (×${expCoef.toFixed(2)})`);
    }

    // Coefficient secteur
    const sectorData = MARKET_DATA.sectors[sector];
    expectedSalary *= sectorData.coef;
    if (sectorData.coef !== 1.0) {
      details.push(`Secteur ${sector}: ×${sectorData.coef}`);
    }

    // Coefficient localisation
    expectedSalary *= location.multiplier;
    if (location.multiplier !== 1.0) {
      details.push(`Loc: ×${location.multiplier}`);
    }

    const expectedMin = expectedSalary * 0.85;
    const expectedMax = expectedSalary * 1.15;

    if (salary) {
      const offeredAvg = salary.avg;

      // Score linéaire basé sur l'écart
      // Si salaire = attendu: 70 points
      // Si salaire > max attendu +20%: 90 points
      // Si salaire < min attendu -20%: 30 points
      if (offeredAvg >= expectedSalary) {
        const bonus = Math.min(30, ((offeredAvg - expectedSalary) / expectedSalary) * 100);
        score = 70 + bonus;

        if (offeredAvg > expectedMax * 1.3) {
          warnings.push("Salaire anormalement élevé");
          score -= 15;
        } else if (offeredAvg > expectedMax) {
          details.push(`+${Math.round((offeredAvg / expectedSalary - 1) * 100)}% vs marché`);
        }
      } else {
        const penalty = Math.min(40, ((expectedSalary - offeredAvg) / expectedSalary) * 100);
        score = 70 - penalty;

        if (offeredAvg < expectedMin * 0.75) {
          warnings.push(`Salaire très bas (-${Math.round((1 - offeredAvg / expectedSalary) * 100)}%)`);
        }
      }

      details.push(`Offert: ${Math.round(salary.min / 1000)}k-${Math.round(salary.max / 1000)}k€`);
      details.push(`Attendu: ${Math.round(expectedMin / 1000)}k-${Math.round(expectedMax / 1000)}k€`);
    } else {
      score = 45;
      warnings.push("Salaire non précisé");
    }

    // Bonus avantages (max +15)
    let benefitsScore = 0;
    if (/mutuelle/i.test(text)) benefitsScore += 3;
    if (/tickets?\s*restaurant/i.test(text)) benefitsScore += 2;
    if (/13(ème|e)\s*mois/i.test(text)) benefitsScore += 4;
    if (/rtt/i.test(text)) benefitsScore += 3;
    if (/participation|intéressement/i.test(text)) benefitsScore += 3;
    score += Math.min(15, benefitsScore);

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      salary,
      expectedSalary: { min: expectedMin, max: expectedMax, median: expectedSalary },
      details,
      warnings
    };
  }

  /**
   * Score Qualité Rédactionnelle (Q)
   */
  function calculateQualityScore(jobData, text) {
    let score = 0;
    const criteria = [];
    const warnings = [];

    // 1. Longueur description (max 30)
    const descLen = (jobData.description || '').length;
    if (descLen > 3000) { score += 30; criteria.push("Description très complète"); }
    else if (descLen > 1500) { score += 25; criteria.push("Description détaillée"); }
    else if (descLen > 800) { score += 18; criteria.push("Description correcte"); }
    else if (descLen > 300) { score += 10; }
    else { score += 5; warnings.push("Description trop courte"); }

    // 2. Structure (max 25)
    const sections = [
      { pattern: /missions?\s*:/i, label: "Missions" },
      { pattern: /profil\s*(recherché)?\s*:/i, label: "Profil" },
      { pattern: /compétences?\s*(requises?)?\s*:/i, label: "Compétences" },
      { pattern: /formation\s*:/i, label: "Formation" },
      { pattern: /expérience\s*:/i, label: "Expérience" },
      { pattern: /avantages?\s*:/i, label: "Avantages" },
      { pattern: /rémunération\s*:/i, label: "Rémunération" },
      { pattern: /environnement|lieu\s*de\s*travail/i, label: "Environnement" }
    ];
    const foundSections = sections.filter(s => s.pattern.test(text));
    score += Math.min(25, foundSections.length * 4);
    if (foundSections.length >= 4) {
      criteria.push(`${foundSections.length} sections structurées`);
    }

    // 3. Informations entreprise (max 15)
    if (jobData.company && jobData.company.length > 2) {
      score += 5;
      criteria.push("Entreprise identifiée");
    } else {
      warnings.push("Entreprise non identifiée");
    }
    if (/\d+\s*(collaborateurs?|salariés?|employés?)/i.test(text)) score += 4;
    if (/créée?\s*en\s*\d{4}/i.test(text)) score += 3;
    if (/siret|siren/i.test(text)) score += 3;

    // 4. Mise en forme (max 15)
    if (/[-•●◦]\s*\w+/g.test(text)) { score += 5; criteria.push("Listes à puces"); }
    const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);
    if (capsRatio < 0.15 && capsRatio > 0.02) score += 5; // Pas trop de majuscules
    if (!/!!!|\?\?\?|€€€/g.test(text)) score += 5; // Pas de ponctuation excessive

    // 5. Clarté et précision (max 15)
    if (/horaires?\s*:/i.test(text)) score += 3;
    if (/lieu\s*(du\s*)?poste|localisation/i.test(text)) score += 3;
    if (/type\s*d'?emploi|contrat/i.test(text)) score += 3;
    if (/processus|étapes?\s*(de\s*)?recrutement/i.test(text)) score += 4;
    if (/contact|postuler/i.test(text)) score += 2;

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      criteria,
      warnings,
      sections: foundSections.map(s => s.label)
    };
  }

  /**
   * Score Profil (P) - Cohérence diplôme/expérience demandés
   */
  function calculateProfileScore(text, diploma, experience) {
    let score = 70;
    const details = [];
    const warnings = [];

    // Évaluation de la clarté des exigences
    if (diploma) {
      score += 10;
      const diplomaLabels = {
        'cap_bep': 'CAP/BEP',
        'bac': 'Bac',
        'bac2': 'Bac+2',
        'bac3': 'Bac+3',
        'bac5': 'Bac+5',
        'bac8': 'Doctorat'
      };
      details.push(`Diplôme: ${diplomaLabels[diploma] || diploma}`);
    } else {
      details.push("Diplôme non précisé");
    }

    if (experience !== null) {
      score += 10;
      details.push(`Expérience: ${experience} an${experience > 1 ? 's' : ''}`);
    } else {
      details.push("Expérience non précisée");
    }

    // Vérification cohérence diplôme/expérience
    if (diploma && experience !== null) {
      // Senior avec diplôme de base: OK si expérience compense
      if (diploma === 'cap_bep' && experience < 3) {
        // Cohérent
      } else if (diploma === 'bac5' && experience > 10) {
        score += 5;
        details.push("Profil expérimenté cohérent");
      }

      // Incohérence: Bac+5 demandé pour débutant avec salaire bas
      if (diploma === 'bac5' && experience === 0) {
        // Vérifier si c'est un stage ou un premier emploi
        if (!/stage|graduate|jeune\s*diplômé/i.test(text)) {
          warnings.push("Bac+5 pour débutant - vérifier");
        }
      }
    }

    // Compétences mentionnées
    const skills = text.match(/compétences?\s*(?:requises?|demandées?)?\s*:([^.]+)/i);
    if (skills) {
      score += 5;
      details.push("Compétences détaillées");
    }

    // Permis/certifications
    if (/permis\s*[ABCDEabcde]/i.test(text)) {
      details.push("Permis requis");
    }
    if (/habilitation|certification|caces|sst|siapp/i.test(text)) {
      score += 3;
      details.push("Certifications mentionnées");
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      details,
      warnings,
      diploma,
      experience
    };
  }

  /**
   * Score Cohérence (C) - Croisements multiples
   */
  function calculateCoherenceScore(text, salary, diploma, experience, sector) {
    let score = 100;
    const issues = [];

    // 1. Cohérence salaire/diplôme
    if (salary && diploma) {
      const expectedRange = MARKET_DATA.salaryByDiploma[diploma];
      if (salary.avg < expectedRange.min * 0.7) {
        score -= 20;
        issues.push(`Salaire bas pour ${diploma.toUpperCase()}`);
      }
      if (salary.avg > expectedRange.max * 2) {
        score -= 15;
        issues.push("Salaire anormalement élevé");
      }
    }

    // 2. Cohérence expérience/titre
    if (/senior|expert|confirmé/i.test(text)) {
      if (experience !== null && experience < 3) {
        score -= 20;
        issues.push("Senior avec peu d'expérience");
      }
    }
    if (/junior|débutant/i.test(text)) {
      if (experience !== null && experience > 5) {
        score -= 15;
        issues.push("Junior avec expérience senior");
      }
    }

    // 3. Cohérence télétravail/poste
    if (/100\s*%\s*(remote|télétravail)/i.test(text)) {
      if (/terrain|chantier|maintenance|électricien|technicien|aide.domicile|magasinier/i.test(text)) {
        score -= 25;
        issues.push("Télétravail impossible pour ce poste");
      }
    }

    // 4. Cohérence type contrat/durée
    if (/cdi/i.test(text) && /durée\s*déterminée|temporaire/i.test(text)) {
      score -= 15;
      issues.push("Confusion CDI/CDD");
    }

    // 5. Cohérence secteur/compétences
    if (sector === 'tech' && !/\b(java|python|php|javascript|react|node|sql|git|agile|scrum)\b/i.test(text)) {
      if (/développeur|engineer|devops/i.test(text)) {
        score -= 10;
        issues.push("Stack technique non précisée");
      }
    }

    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      issues,
      warnings: issues
    };
  }

  // ============================================================================
  // CLASSIFICATION ET RECOMMANDATIONS
  // ============================================================================

  function determineClassification(score, hasCriticalFlags) {
    if (hasCriticalFlags) {
      return { ...CLASSIFICATIONS.DANGEREUSE, reason: "Arnaque probable" };
    }
    for (const classification of Object.values(CLASSIFICATIONS)) {
      if (score >= classification.minScore) {
        return { ...classification };
      }
    }
    return CLASSIFICATIONS.DANGEREUSE;
  }

  function generateRecommendations(classification, scores) {
    const recs = [];

    switch (classification.code) {
      case 'EXCELLENT':
      case 'TRES_BONNE':
        recs.push("Postulez rapidement");
        if (scores.market.score > 75) recs.push("Conditions attractives");
        break;
      case 'BONNE':
      case 'CORRECTE':
        recs.push("Offre intéressante");
        if (scores.market.score < 50) recs.push("Négociez le salaire");
        break;
      case 'PASSABLE':
      case 'MEDIOCRE':
        recs.push("Vérifiez l'entreprise");
        recs.push("Recherchez des avis");
        break;
      case 'MAUVAISE':
      case 'A_EVITER':
        recs.push("Offre déconseillée");
        if (scores.legitimacy.redFlags.length > 0) recs.push("Alertes détectées");
        break;
      case 'DANGEREUSE':
        recs.push("Ne pas postuler");
        recs.push("Signalez cette offre");
        break;
    }

    return recs.slice(0, 3);
  }

  // ============================================================================
  // API PUBLIQUE
  // ============================================================================

  return {
    evaluate(jobData, context = {}) {
      const text = `${jobData.title || ''} ${jobData.company || ''} ${jobData.location || ''} ${jobData.salary || ''} ${jobData.description || ''}`;

      // Récupérer le contexte plateforme
      const platform = context.platform || 'default';
      const platformMod = PLATFORM_MODIFIERS[platform] || PLATFORM_MODIFIERS.default;
      const applicantCount = context.applicantCount || null;

      // Détections
      const diploma = detectDiploma(text);
      const experience = detectExperience(text);
      const sector = detectSector(text);
      const location = detectLocation(jobData.location || text);
      const salary = extractSalary(text);

      // Calcul des 5 scores
      const legitimacy = calculateLegitimacyScore(text.toLowerCase());
      const market = calculateMarketScore(text.toLowerCase(), salary, diploma, experience, sector, location);
      const quality = calculateQualityScore(jobData, text);
      const profile = calculateProfileScore(text, diploma, experience);
      const coherence = calculateCoherenceScore(text, salary, diploma, experience, sector);

      // Vérification de l'entreprise
      const companyVerification = evaluateCompanyLegitimacy(text, jobData.company);

      // Pénalité nombre de candidats
      const applicantPenalty = calculateApplicantPenalty(applicantCount, platform);

      // Détection offre republiée
      const repostedCheck = detectRepostedOffer(text, {
        isReposted: context.isReposted,
        postedDaysAgo: context.postedDaysAgo
      });

      // Détection incohérences junior/stage/alternance
      const entryLevelCheck = detectEntryLevelIncoherence(text, jobData, {
        salary: context.salary || null
      });

      // Analyse rigoureuse des années d'expérience
      const experienceAnalysis = analyzeExperienceRequirements(text, jobData.title, sector);

      // Appliquer le multiplicateur de red flags pour la plateforme
      const adjustedLegitimacyScore = Math.max(0, Math.min(100,
        legitimacy.score - (legitimacy.redFlags.length * (platformMod.redFlagMultiplier - 1) * 5)
      ));

      // Ajuster le score de qualité avec la vérification entreprise
      const companyAdjustment = Math.round((companyVerification.score - 50) * 0.3);
      const adjustedQualityScore = Math.max(0, Math.min(100, quality.score + companyAdjustment));

      // Score final pondéré avec modificateurs plateforme
      let pertinenceScore = Math.round(
        CONFIG.weights.legitimacy * adjustedLegitimacyScore +
        CONFIG.weights.market * market.score +
        CONFIG.weights.quality * adjustedQualityScore +
        CONFIG.weights.profile * profile.score +
        CONFIG.weights.coherence * coherence.score
      );

      // Appliquer les modificateurs de plateforme
      pertinenceScore = pertinenceScore - platformMod.basePenalty + platformMod.trustBonus;

      // Appliquer la pénalité nombre de candidats
      pertinenceScore = pertinenceScore - applicantPenalty.penalty;

      // Appliquer la pénalité offre republiée
      pertinenceScore = pertinenceScore - repostedCheck.penalty;

      // Appliquer la pénalité incohérences junior/stage/alternance
      pertinenceScore = pertinenceScore - entryLevelCheck.penalty;

      // Appliquer la pénalité d'analyse d'expérience
      pertinenceScore = pertinenceScore - experienceAnalysis.penalty;

      // Borner le score final
      pertinenceScore = Math.max(0, Math.min(100, pertinenceScore));

      // Déterminer si l'offre doit être affichée en orange (warning) ou rouge (danger)
      const shouldShowWarning = repostedCheck.shouldWarn || entryLevelCheck.shouldWarn || applicantPenalty.level === 'medium' || experienceAnalysis.isProblematic;

      // Marquer comme mauvaise offre si critères stricts déclenchés
      const isBadOffer = applicantPenalty.isBadOffer || experienceAnalysis.shouldMarkAsBad || applicantPenalty.status === 'danger';

      // Déterminer le statut forcé si offre est saturée (+80 candidats)
      const forceStatus = applicantPenalty.status || (experienceAnalysis.shouldMarkAsBad ? 'warning' : null);

      const classification = determineClassification(pertinenceScore, legitimacy.hasCriticalFlags || applicantPenalty.isGhostJob);
      const recommendations = generateRecommendations(classification, { legitimacy, market, quality, profile, coherence });

      // Collecte de tous les warnings
      const allWarnings = [
        ...market.warnings,
        ...quality.warnings,
        ...profile.warnings,
        ...coherence.warnings
      ];

      // Ajouter les signaux de vérification entreprise aux warnings
      for (const signal of companyVerification.signals) {
        if (signal.type === 'negative') {
          allWarnings.push(signal.label);
        }
      }

      // Ajouter l'avertissement candidats si applicable
      if (applicantPenalty.label) {
        allWarnings.push(applicantPenalty.label);
      }

      // Ajouter les signaux d'offre republiée
      for (const signal of repostedCheck.signals) {
        allWarnings.push(signal.label);
      }

      // Ajouter les signaux positifs entreprise aux greenFlags
      const enhancedGreenFlags = [...legitimacy.greenFlags];

      // Ajouter les incohérences junior/stage/alternance aux red flags
      const enhancedRedFlags = [...legitimacy.redFlags];
      for (const issue of entryLevelCheck.issues) {
        if (issue.severity === 'high') {
          enhancedRedFlags.push({ label: issue.label, impact: -Math.abs(issue.penalty), severity: issue.severity });
        } else {
          enhancedRedFlags.push({ label: issue.label, impact: -Math.abs(issue.penalty), severity: 'medium' });
        }
      }

      // Ajouter offre republiée aux red flags si applicable
      if (repostedCheck.isReposted) {
        enhancedRedFlags.push({ label: "Offre republiée", impact: -15, severity: 'medium' });
      }

      // Ajouter les signaux d'offre ancienne aux red flags
      for (const signal of repostedCheck.signals) {
        if (signal.penalty > 0) {
          enhancedRedFlags.push({ label: signal.label, impact: -signal.penalty, severity: signal.penalty >= 15 ? 'high' : 'medium' });
        }
      }

      // Ajouter la pénalité candidats aux red flags si applicable
      if (applicantPenalty.label && applicantPenalty.penalty > 0) {
        enhancedRedFlags.push({
          label: applicantPenalty.label,
          impact: -applicantPenalty.penalty,
          severity: applicantPenalty.level === 'critical' ? 'critical' : (applicantPenalty.level === 'high' ? 'high' : 'medium')
        });
      }

      // Ajouter les signaux négatifs de vérification entreprise aux red flags
      for (const signal of companyVerification.signals) {
        if (signal.type === 'negative') {
          enhancedRedFlags.push({ label: signal.label, impact: signal.score, severity: 'medium' });
        } else if (signal.type === 'positive') {
          enhancedGreenFlags.push({ label: signal.label, impact: signal.score, level: 'medium' });
        }
      }

      // Ajouter les problèmes d'expérience aux red flags
      for (const issue of experienceAnalysis.issues) {
        if (issue.severity !== 'info' && issue.penalty > 0) {
          enhancedRedFlags.push({
            label: issue.label,
            impact: -issue.penalty,
            severity: issue.severity
          });
        }
      }

      return {
        pertinenceScore,
        classification,
        shouldShowWarning,  // Pour affichage orange
        isBadOffer,         // Offre marquée comme mauvaise (critères stricts)
        forceStatus,        // Statut forcé ('danger' ou 'warning') si offre saturée

        // Détections
        detected: { diploma, experience, sector, location: location.name, salary },

        // Contexte plateforme
        platform: {
          name: platform,
          modifier: platformMod,
          applicantCount,
          applicantPenalty
        },

        // Vérification entreprise
        companyVerification,

        // Vérifications spéciales
        repostedCheck,        // Offre republiée
        entryLevelCheck,      // Incohérences junior/stage/alternance
        experienceAnalysis,   // Analyse rigoureuse expérience

        // Scores détaillés
        scores: {
          legitimacy: { score: adjustedLegitimacyScore, redFlags: enhancedRedFlags, greenFlags: legitimacy.greenFlags },
          market: { score: market.score, details: market.details, warnings: market.warnings, expected: market.expectedSalary },
          quality: { score: adjustedQualityScore, criteria: quality.criteria, sections: quality.sections, warnings: quality.warnings },
          profile: { score: profile.score, details: profile.details, warnings: profile.warnings },
          coherence: { score: coherence.score, issues: coherence.issues }
        },

        // Signaux
        signals: {
          redFlags: enhancedRedFlags,
          greenFlags: enhancedGreenFlags,
          warnings: allWarnings
        },

        recommendations
      };
    },

    CLASSIFICATIONS,
    MARKET_DATA
  };
})();

// ============================================================================
// MODULE ANALYSEUR DE MARCHÉ SALARIAL v1.0
// Projections, négociations, évolutions sur 1-3-5-10 ans
// ============================================================================

const FJD_SalaryMarketAnalyzer = (function() {
  'use strict';

  // Données marché France 2024-2025
  const MARKET_DATA = {
    // Salaires médians par niveau d'expérience et secteur (brut annuel)
    salaryGrid: {
      tech: {
        junior: { min: 35000, median: 40000, max: 48000 },
        confirmed: { min: 42000, median: 50000, max: 60000 },
        senior: { min: 52000, median: 62000, max: 75000 },
        expert: { min: 65000, median: 78000, max: 95000 },
        lead: { min: 75000, median: 90000, max: 120000 }
      },
      finance: {
        junior: { min: 32000, median: 38000, max: 45000 },
        confirmed: { min: 40000, median: 48000, max: 58000 },
        senior: { min: 50000, median: 60000, max: 75000 },
        expert: { min: 62000, median: 75000, max: 95000 },
        lead: { min: 70000, median: 85000, max: 110000 }
      },
      industrie: {
        junior: { min: 28000, median: 33000, max: 40000 },
        confirmed: { min: 35000, median: 42000, max: 50000 },
        senior: { min: 44000, median: 52000, max: 62000 },
        expert: { min: 52000, median: 62000, max: 75000 },
        lead: { min: 60000, median: 72000, max: 90000 }
      },
      commerce: {
        junior: { min: 25000, median: 30000, max: 36000 },
        confirmed: { min: 32000, median: 38000, max: 46000 },
        senior: { min: 40000, median: 48000, max: 58000 },
        expert: { min: 48000, median: 58000, max: 72000 },
        lead: { min: 55000, median: 68000, max: 85000 }
      },
      sante: {
        junior: { min: 26000, median: 32000, max: 38000 },
        confirmed: { min: 34000, median: 40000, max: 48000 },
        senior: { min: 42000, median: 50000, max: 60000 },
        expert: { min: 50000, median: 60000, max: 75000 },
        lead: { min: 58000, median: 70000, max: 90000 }
      },
      default: {
        junior: { min: 26000, median: 32000, max: 38000 },
        confirmed: { min: 34000, median: 42000, max: 50000 },
        senior: { min: 44000, median: 52000, max: 62000 },
        expert: { min: 52000, median: 62000, max: 75000 },
        lead: { min: 60000, median: 72000, max: 90000 }
      }
    },

    // Évolution salariale annuelle moyenne par statut (%)
    annualGrowth: {
      junior: { min: 5, typical: 8, max: 12, withObjectives: 15 },
      confirmed: { min: 4, typical: 6, max: 10, withObjectives: 12 },
      senior: { min: 3, typical: 5, max: 8, withObjectives: 10 },
      expert: { min: 2, typical: 4, max: 6, withObjectives: 8 },
      lead: { min: 2, typical: 3, max: 5, withObjectives: 7 }
    },

    // Marge de négociation à l'embauche (%)
    negotiationMargin: {
      junior: { min: 0, typical: 5, max: 10 },
      confirmed: { min: 5, typical: 10, max: 15 },
      senior: { min: 8, typical: 12, max: 18 },
      expert: { min: 10, typical: 15, max: 22 },
      lead: { min: 12, typical: 18, max: 25 }
    },

    // Coefficients localisation
    locationMultiplier: {
      paris: 1.20,
      idf: 1.12,
      lyon: 1.08,
      marseille: 1.03,
      bordeaux: 1.05,
      toulouse: 1.04,
      nantes: 1.04,
      lille: 1.02,
      nice: 1.05,
      strasbourg: 1.02,
      province: 0.92
    },

    // Charges sociales salariales France 2024 (approximatif)
    socialCharges: {
      cadre: 0.25,      // ~25% du brut
      nonCadre: 0.22,   // ~22% du brut
      apprenti: 0.12    // ~12% du brut
    },

    // Tranches impôt sur le revenu 2024 (par part fiscale)
    taxBrackets: [
      { limit: 11294, rate: 0 },
      { limit: 28797, rate: 0.11 },
      { limit: 82341, rate: 0.30 },
      { limit: 177106, rate: 0.41 },
      { limit: Infinity, rate: 0.45 }
    ]
  };

  // Déterminer le statut selon l'expérience
  function determineStatus(experienceYears) {
    if (experienceYears === null || experienceYears === undefined) return 'confirmed';
    if (experienceYears <= 2) return 'junior';
    if (experienceYears <= 5) return 'confirmed';
    if (experienceYears <= 10) return 'senior';
    if (experienceYears <= 15) return 'expert';
    return 'lead';
  }

  // Calculer l'impôt annuel (simplifiée, 1 part fiscale)
  function calculateAnnualTax(netAnnual, parts = 1) {
    const taxableIncome = netAnnual / parts;
    let tax = 0;
    let previousLimit = 0;

    for (const bracket of MARKET_DATA.taxBrackets) {
      if (taxableIncome > previousLimit) {
        const taxableInBracket = Math.min(taxableIncome, bracket.limit) - previousLimit;
        tax += taxableInBracket * bracket.rate;
      }
      previousLimit = bracket.limit;
      if (taxableIncome <= bracket.limit) break;
    }

    return Math.round(tax * parts);
  }

  // Calculer les conversions brut → net → net après impôt
  function calculateSalaryBreakdown(brutAnnual, isCadre = true, taxParts = 1) {
    const chargeRate = isCadre ? MARKET_DATA.socialCharges.cadre : MARKET_DATA.socialCharges.nonCadre;

    const netAnnual = Math.round(brutAnnual * (1 - chargeRate));
    const netMonthly = Math.round(netAnnual / 12);
    const brutMonthly = Math.round(brutAnnual / 12);

    const annualTax = calculateAnnualTax(netAnnual, taxParts);
    const monthlyTax = Math.round(annualTax / 12);

    const netAfterTaxAnnual = netAnnual - annualTax;
    const netAfterTaxMonthly = Math.round(netAfterTaxAnnual / 12);

    return {
      brut: {
        annual: brutAnnual,
        monthly: brutMonthly
      },
      net: {
        annual: netAnnual,
        monthly: netMonthly
      },
      tax: {
        annual: annualTax,
        monthly: monthlyTax,
        effectiveRate: netAnnual > 0 ? Math.round((annualTax / netAnnual) * 100) : 0
      },
      netAfterTax: {
        annual: netAfterTaxAnnual,
        monthly: netAfterTaxMonthly
      },
      charges: {
        annual: brutAnnual - netAnnual,
        monthly: brutMonthly - netMonthly,
        rate: Math.round(chargeRate * 100)
      }
    };
  }

  // Calculer les projections sur 1, 3, 5, 10 ans
  function calculateProjections(baseSalary, status, withObjectives = false) {
    const growth = MARKET_DATA.annualGrowth[status];
    const growthRate = withObjectives ? growth.withObjectives : growth.typical;

    const projections = {};
    const years = [1, 3, 5, 10];

    for (const year of years) {
      // Formule: Salaire × (1 + taux)^années
      // Avec progression de statut après certains jalons
      let currentStatus = status;
      let accumulatedGrowth = 1;

      for (let y = 1; y <= year; y++) {
        // Évolution du statut
        if (status === 'junior' && y >= 3) currentStatus = 'confirmed';
        else if (status === 'confirmed' && y >= 3) currentStatus = 'senior';
        else if (status === 'senior' && y >= 5) currentStatus = 'expert';

        const currentGrowth = MARKET_DATA.annualGrowth[currentStatus];
        const rate = withObjectives ? currentGrowth.withObjectives : currentGrowth.typical;
        accumulatedGrowth *= (1 + rate / 100);
      }

      const projectedSalary = Math.round(baseSalary * accumulatedGrowth);
      const statusAtYear = currentStatus;

      projections[`year${year}`] = {
        year,
        status: statusAtYear,
        salary: calculateSalaryBreakdown(projectedSalary),
        growthFromStart: Math.round((accumulatedGrowth - 1) * 100),
        growthAbsolute: projectedSalary - baseSalary
      };
    }

    return projections;
  }

  // Calculer la marge de négociation
  function calculateNegotiationRange(offeredSalary, status, sector, location) {
    const margin = MARKET_DATA.negotiationMargin[status];
    const sectorData = MARKET_DATA.salaryGrid[sector] || MARKET_DATA.salaryGrid.default;
    const statusData = sectorData[status];
    const locMultiplier = MARKET_DATA.locationMultiplier[location] || MARKET_DATA.locationMultiplier.province;

    // Ajuster le marché avec la localisation
    const marketMin = Math.round(statusData.min * locMultiplier);
    const marketMedian = Math.round(statusData.median * locMultiplier);
    const marketMax = Math.round(statusData.max * locMultiplier);

    // Position de l'offre par rapport au marché
    let positionVsMarket = 'below';
    let positionPercent = 0;

    if (offeredSalary < marketMin) {
      positionVsMarket = 'below';
      positionPercent = Math.round((1 - offeredSalary / marketMin) * 100);
    } else if (offeredSalary < marketMedian) {
      positionVsMarket = 'low';
      positionPercent = Math.round(((offeredSalary - marketMin) / (marketMedian - marketMin)) * 50);
    } else if (offeredSalary < marketMax) {
      positionVsMarket = 'good';
      positionPercent = 50 + Math.round(((offeredSalary - marketMedian) / (marketMax - marketMedian)) * 50);
    } else {
      positionVsMarket = 'excellent';
      positionPercent = 100;
    }

    // Calcul des salaires négociables
    const minNegotiated = Math.round(offeredSalary * (1 + margin.min / 100));
    const typicalNegotiated = Math.round(offeredSalary * (1 + margin.typical / 100));
    const maxNegotiated = Math.round(offeredSalary * (1 + margin.max / 100));

    // Plafond réaliste basé sur le marché
    const realisticMax = Math.min(maxNegotiated, Math.round(marketMax * 1.05));

    return {
      offered: offeredSalary,
      negotiable: {
        conservative: minNegotiated,
        realistic: typicalNegotiated,
        ambitious: Math.min(maxNegotiated, realisticMax),
        ceiling: realisticMax
      },
      market: {
        min: marketMin,
        median: marketMedian,
        max: marketMax,
        position: positionVsMarket,
        positionPercent
      },
      recommendation: positionVsMarket === 'below' ? 'Négociez fortement, offre sous le marché' :
                      positionVsMarket === 'low' ? 'Marge de négociation possible' :
                      positionVsMarket === 'good' ? 'Offre correcte, négociation modérée' :
                      'Excellente offre, négociez les avantages'
    };
  }

  // Analyse complète du marché salarial
  function analyzeMarketSalary(params) {
    const {
      offeredSalary,      // Salaire brut annuel proposé
      experienceYears,    // Années d'expérience
      sector = 'default', // Secteur d'activité
      location = 'province', // Localisation
      diploma = null,     // Niveau de diplôme
      isCadre = true,     // Statut cadre
      taxParts = 1        // Parts fiscales
    } = params;

    const status = determineStatus(experienceYears);
    const statusLabels = {
      junior: 'Junior (0-2 ans)',
      confirmed: 'Confirmé (3-5 ans)',
      senior: 'Senior (6-10 ans)',
      expert: 'Expert (11-15 ans)',
      lead: 'Lead/Manager (15+ ans)'
    };

    // Calculs de base
    const currentSalary = calculateSalaryBreakdown(offeredSalary, isCadre, taxParts);
    const negotiation = calculateNegotiationRange(offeredSalary, status, sector, location);

    // Projections standard et avec objectifs atteints
    const projectionsStandard = calculateProjections(offeredSalary, status, false);
    const projectionsWithObjectives = calculateProjections(offeredSalary, status, true);

    // Résumé des évolutions
    const evolutionSummary = {
      year1: {
        standard: projectionsStandard.year1.salary.brut.annual,
        withObjectives: projectionsWithObjectives.year1.salary.brut.annual,
        bonus: projectionsWithObjectives.year1.salary.brut.annual - projectionsStandard.year1.salary.brut.annual
      },
      year3: {
        standard: projectionsStandard.year3.salary.brut.annual,
        withObjectives: projectionsWithObjectives.year3.salary.brut.annual,
        bonus: projectionsWithObjectives.year3.salary.brut.annual - projectionsStandard.year3.salary.brut.annual
      },
      year5: {
        standard: projectionsStandard.year5.salary.brut.annual,
        withObjectives: projectionsWithObjectives.year5.salary.brut.annual,
        bonus: projectionsWithObjectives.year5.salary.brut.annual - projectionsStandard.year5.salary.brut.annual
      },
      year10: {
        standard: projectionsStandard.year10.salary.brut.annual,
        withObjectives: projectionsWithObjectives.year10.salary.brut.annual,
        bonus: projectionsWithObjectives.year10.salary.brut.annual - projectionsStandard.year10.salary.brut.annual
      }
    };

    return {
      // Informations de base
      input: {
        offeredSalary,
        experienceYears,
        sector,
        location,
        status,
        statusLabel: statusLabels[status],
        isCadre,
        taxParts
      },

      // Salaire actuel détaillé
      current: currentSalary,

      // Négociation à l'embauche
      negotiation,

      // Projections détaillées
      projections: {
        standard: projectionsStandard,
        withObjectives: projectionsWithObjectives
      },

      // Résumé des évolutions
      evolution: evolutionSummary,

      // Comparaison marché
      marketComparison: {
        sector,
        location,
        statusRange: negotiation.market,
        isCompetitive: negotiation.market.positionPercent >= 50
      }
    };
  }

  // Formater un montant en euros
  function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }

  // Générer le HTML du tableau d'analyse
  function generateAnalysisHTML(analysis) {
    const { current, negotiation, evolution, input } = analysis;

    return `
      <div class="fjd-salary-analysis">
        <div class="fjd-salary-header">
          <h4>📊 Analyse Salariale Marché</h4>
          <span class="fjd-status-badge">${input.statusLabel}</span>
        </div>

        <div class="fjd-salary-section">
          <h5>💰 Salaire Proposé</h5>
          <table class="fjd-salary-table">
            <tr>
              <td></td>
              <td><strong>Mensuel</strong></td>
              <td><strong>Annuel</strong></td>
            </tr>
            <tr>
              <td>Brut</td>
              <td>${formatCurrency(current.brut.monthly)}</td>
              <td>${formatCurrency(current.brut.annual)}</td>
            </tr>
            <tr>
              <td>Net (−${current.charges.rate}%)</td>
              <td>${formatCurrency(current.net.monthly)}</td>
              <td>${formatCurrency(current.net.annual)}</td>
            </tr>
            <tr>
              <td>Impôt (${current.tax.effectiveRate}%)</td>
              <td>−${formatCurrency(current.tax.monthly)}</td>
              <td>−${formatCurrency(current.tax.annual)}</td>
            </tr>
            <tr class="fjd-highlight">
              <td><strong>Net après impôt</strong></td>
              <td><strong>${formatCurrency(current.netAfterTax.monthly)}</strong></td>
              <td><strong>${formatCurrency(current.netAfterTax.annual)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="fjd-salary-section">
          <h5>🤝 Négociation à l'Embauche</h5>
          <div class="fjd-market-position">
            <div class="fjd-position-bar">
              <div class="fjd-position-fill" style="width: ${negotiation.market.positionPercent}%"></div>
              <span class="fjd-position-marker" style="left: ${negotiation.market.positionPercent}%"></span>
            </div>
            <div class="fjd-position-labels">
              <span>${formatCurrency(negotiation.market.min)}</span>
              <span>${formatCurrency(negotiation.market.median)}</span>
              <span>${formatCurrency(negotiation.market.max)}</span>
            </div>
          </div>
          <p class="fjd-recommendation">${negotiation.recommendation}</p>
          <div class="fjd-negotiation-range">
            <span>Cible réaliste: <strong>${formatCurrency(negotiation.negotiable.realistic)}</strong></span>
            <span>Maximum: <strong>${formatCurrency(negotiation.negotiable.ambitious)}</strong></span>
          </div>
        </div>

        <div class="fjd-salary-section">
          <h5>📈 Évolution Salariale (Brut Annuel)</h5>
          <table class="fjd-salary-table fjd-evolution-table">
            <tr>
              <td></td>
              <td><strong>1 an</strong></td>
              <td><strong>3 ans</strong></td>
              <td><strong>5 ans</strong></td>
              <td><strong>10 ans</strong></td>
            </tr>
            <tr>
              <td>Standard</td>
              <td>${formatCurrency(evolution.year1.standard)}</td>
              <td>${formatCurrency(evolution.year3.standard)}</td>
              <td>${formatCurrency(evolution.year5.standard)}</td>
              <td>${formatCurrency(evolution.year10.standard)}</td>
            </tr>
            <tr class="fjd-highlight">
              <td>Objectifs atteints</td>
              <td>${formatCurrency(evolution.year1.withObjectives)}</td>
              <td>${formatCurrency(evolution.year3.withObjectives)}</td>
              <td>${formatCurrency(evolution.year5.withObjectives)}</td>
              <td>${formatCurrency(evolution.year10.withObjectives)}</td>
            </tr>
            <tr class="fjd-bonus-row">
              <td>Bonus perf.</td>
              <td>+${formatCurrency(evolution.year1.bonus)}</td>
              <td>+${formatCurrency(evolution.year3.bonus)}</td>
              <td>+${formatCurrency(evolution.year5.bonus)}</td>
              <td>+${formatCurrency(evolution.year10.bonus)}</td>
            </tr>
          </table>
        </div>

        <div class="fjd-salary-section fjd-projections-detail">
          <h5>📋 Détail Net Après Impôt (Mensuel)</h5>
          <table class="fjd-salary-table">
            <tr>
              <td></td>
              <td><strong>Aujourd'hui</strong></td>
              <td><strong>+3 ans</strong></td>
              <td><strong>+5 ans</strong></td>
              <td><strong>+10 ans</strong></td>
            </tr>
            <tr>
              <td>Standard</td>
              <td>${formatCurrency(current.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.standard.year3.salary.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.standard.year5.salary.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.standard.year10.salary.netAfterTax.monthly)}/mois</td>
            </tr>
            <tr class="fjd-highlight">
              <td>Performance</td>
              <td>${formatCurrency(current.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.withObjectives.year3.salary.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.withObjectives.year5.salary.netAfterTax.monthly)}/mois</td>
              <td>${formatCurrency(analysis.projections.withObjectives.year10.salary.netAfterTax.monthly)}/mois</td>
            </tr>
          </table>
        </div>
      </div>
    `;
  }

  // API publique
  return {
    analyze: analyzeMarketSalary,
    calculateBreakdown: calculateSalaryBreakdown,
    calculateTax: calculateAnnualTax,
    determineStatus,
    formatCurrency,
    generateHTML: generateAnalysisHTML,
    MARKET_DATA
  };
})();

if (typeof window !== 'undefined') {
  window.FJD_PertinenceAnalyzer = FJD_PertinenceAnalyzer;
  window.FJD_SalaryMarketAnalyzer = FJD_SalaryMarketAnalyzer;
}