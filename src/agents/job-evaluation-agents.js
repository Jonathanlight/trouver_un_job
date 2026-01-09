/**
 * Agents IA d'évaluation d'offres d'emploi
 *
 * Ce module fournit des agents spécialisés pour différents aspects
 * de l'analyse d'offres d'emploi sur LinkedIn et Indeed.
 */

// ============================================================================
// CONFIGURATION DES AGENTS
// ============================================================================

const AGENT_CONFIG = {
  // Agent de détection d'arnaques
  SCAM_DETECTOR: {
    id: 'scam-detector',
    name: 'Détecteur d\'arnaques',
    description: 'Spécialisé dans la détection des offres frauduleuses',
    priority: 1,
    weight: 1.5 // Poids plus important pour le score final
  },

  // Agent d'analyse de cohérence
  COHERENCE_ANALYZER: {
    id: 'coherence-analyzer',
    name: 'Analyseur de cohérence',
    description: 'Vérifie la cohérence interne de l\'offre',
    priority: 2,
    weight: 1.2
  },

  // Agent de comparaison marché
  MARKET_COMPARATOR: {
    id: 'market-comparator',
    name: 'Comparateur de marché',
    description: 'Compare l\'offre aux standards du marché',
    priority: 3,
    weight: 1.0
  },

  // Agent d'évaluation du professionnalisme
  PROFESSIONALISM_EVALUATOR: {
    id: 'professionalism-evaluator',
    name: 'Évaluateur de professionnalisme',
    description: 'Évalue le niveau de professionnalisme de l\'offre',
    priority: 4,
    weight: 0.8
  },

  // Agent de détection de Ghost Jobs
  GHOST_JOB_DETECTOR: {
    id: 'ghost-job-detector',
    name: 'Détecteur de Ghost Jobs',
    description: 'Identifie les offres inactives ou fictives',
    priority: 5,
    weight: 1.1
  },

  // Agent LinkedIn spécifique
  LINKEDIN_SPECIALIST: {
    id: 'linkedin-specialist',
    name: 'Spécialiste LinkedIn',
    description: 'Analyse spécifique aux offres LinkedIn',
    priority: 6,
    weight: 1.0,
    platforms: ['linkedin']
  },

  // Agent Indeed spécifique
  INDEED_SPECIALIST: {
    id: 'indeed-specialist',
    name: 'Spécialiste Indeed',
    description: 'Analyse spécifique aux offres Indeed',
    priority: 6,
    weight: 1.0,
    platforms: ['indeed']
  }
};

// ============================================================================
// AGENT DE DÉTECTION D'ARNAQUES
// ============================================================================

class ScamDetectorAgent {
  constructor() {
    this.config = AGENT_CONFIG.SCAM_DETECTOR;
    this.criticalPatterns = [
      // Demandes financières
      { pattern: /paiement|frais|investissement|avance/i, score: 50, type: 'financial' },
      { pattern: /acheter?\s*(le\s*)?(kit|stock|matériel)/i, score: 45, type: 'financial' },
      { pattern: /virement|carte\s*bancaire/i, score: 50, type: 'financial' },

      // Promesses irréalistes
      { pattern: /gagn(er|ez)\s*\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, score: 45, type: 'unrealistic' },
      { pattern: /revenu\s*(passif|illimité|garanti)/i, score: 45, type: 'unrealistic' },
      { pattern: /argent\s*facile|devenez?\s*riche/i, score: 50, type: 'unrealistic' },

      // MLM/Pyramide
      { pattern: /parrain|filleul|réseau\s*(de\s*)?vente/i, score: 45, type: 'mlm' },
      { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, score: 45, type: 'mlm' },
      { pattern: /downline|upline|plan\s*de\s*compensation/i, score: 50, type: 'mlm' },

      // Collecte de données
      { pattern: /numéro\s*de\s*sécurité\s*sociale|n°\s*sécu/i, score: 50, type: 'data_harvesting' },
      { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|passeport)/i, score: 45, type: 'data_harvesting' },
      { pattern: /rib\s*(avant|pour\s*inscription)/i, score: 45, type: 'data_harvesting' }
    ];
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const detectedScams = [];
    let totalScore = 0;

    for (const pattern of this.criticalPatterns) {
      if (pattern.pattern.test(text)) {
        detectedScams.push({
          type: pattern.type,
          score: pattern.score,
          pattern: pattern.pattern.toString()
        });
        totalScore += pattern.score;
      }
    }

    // Analyse contextuelle
    const contextualFlags = this.analyzeContext(jobData, text);
    totalScore += contextualFlags.score;

    const riskLevel = this.calculateRiskLevel(totalScore);

    return {
      agent: this.config.id,
      scamIndicators: detectedScams,
      contextualFlags: contextualFlags.flags,
      rawScore: totalScore,
      weightedScore: totalScore * this.config.weight,
      riskLevel,
      verdict: this.getVerdict(riskLevel),
      confidence: this.calculateConfidence(detectedScams.length, totalScore)
    };
  }

  analyzeContext(jobData, text) {
    const flags = [];
    let score = 0;

    // Entreprise non identifiée
    if (!jobData.company || jobData.company.length < 3) {
      flags.push({ message: 'Entreprise non identifiée', score: 25 });
      score += 25;
    }

    // Description trop courte
    if (jobData.description && jobData.description.length < 100) {
      flags.push({ message: 'Description suspecte (trop courte)', score: 15 });
      score += 15;
    }

    // Contact non professionnel
    if (/@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i.test(text)) {
      flags.push({ message: 'Email non professionnel', score: 20 });
      score += 20;
    }

    // WhatsApp/Telegram
    if (/whatsapp|telegram\s*(pour|uniquement)/i.test(text)) {
      flags.push({ message: 'Contact via messagerie personnelle', score: 30 });
      score += 30;
    }

    return { flags, score };
  }

  calculateRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    if (score >= 15) return 'LOW';
    return 'SAFE';
  }

  getVerdict(riskLevel) {
    const verdicts = {
      'CRITICAL': { label: 'ARNAQUE PROBABLE', action: 'NE PAS POSTULER', icon: '🚨' },
      'HIGH': { label: 'TRÈS SUSPECT', action: 'ÉVITER', icon: '⚠️' },
      'MEDIUM': { label: 'SUSPECT', action: 'VÉRIFIER AVANT', icon: '🔍' },
      'LOW': { label: 'PRUDENCE', action: 'PROCÉDER AVEC PRÉCAUTION', icon: '👁️' },
      'SAFE': { label: 'OK', action: 'POSTULER', icon: '✅' }
    };
    return verdicts[riskLevel];
  }

  calculateConfidence(flagCount, score) {
    if (flagCount >= 3 && score >= 60) return 95;
    if (flagCount >= 2 && score >= 40) return 85;
    if (flagCount >= 1 && score >= 20) return 70;
    return 60;
  }
}

// ============================================================================
// AGENT D'ANALYSE DE COHÉRENCE
// ============================================================================

class CoherenceAnalyzerAgent {
  constructor() {
    this.config = AGENT_CONFIG.COHERENCE_ANALYZER;
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const inconsistencies = [];
    let totalScore = 0;

    // Vérifier niveau vs expérience
    const levelCheck = this.checkLevelExperienceCoherence(text);
    if (levelCheck.inconsistent) {
      inconsistencies.push(levelCheck);
      totalScore += levelCheck.score;
    }

    // Vérifier type de contrat
    const contractCheck = this.checkContractCoherence(text);
    if (contractCheck.inconsistent) {
      inconsistencies.push(contractCheck);
      totalScore += contractCheck.score;
    }

    // Vérifier salaire vs responsabilités
    const salaryCheck = this.checkSalaryCoherence(jobData, text);
    if (salaryCheck.inconsistent) {
      inconsistencies.push(salaryCheck);
      totalScore += salaryCheck.score;
    }

    // Vérifier compétences contradictoires
    const skillsCheck = this.checkSkillsCoherence(text);
    if (skillsCheck.inconsistent) {
      inconsistencies.push(skillsCheck);
      totalScore += skillsCheck.score;
    }

    // Vérifier le remote
    const remoteCheck = this.checkRemoteCoherence(jobData, text);
    if (remoteCheck.inconsistent) {
      inconsistencies.push(remoteCheck);
      totalScore += remoteCheck.score;
    }

    return {
      agent: this.config.id,
      inconsistencies,
      rawScore: totalScore,
      weightedScore: totalScore * this.config.weight,
      coherenceLevel: this.getCoherenceLevel(totalScore),
      overallAssessment: inconsistencies.length === 0 ?
        'Offre cohérente' :
        `${inconsistencies.length} incohérence(s) détectée(s)`
    };
  }

  checkLevelExperienceCoherence(text) {
    // Junior avec beaucoup d'expérience requise
    if (/junior|débutant/i.test(text) && /\b(8|10|15|20)\+?\s*ans?\s*(d')?exp/i.test(text)) {
      return {
        inconsistent: true,
        type: 'level_experience',
        message: 'Poste junior demandant trop d\'expérience',
        score: 30
      };
    }

    // Senior sans expérience
    if (/senior|lead|expert/i.test(text) && /sans\s*expérience|débutant\s*accepté/i.test(text)) {
      return {
        inconsistent: true,
        type: 'level_experience',
        message: 'Poste senior acceptant les débutants',
        score: 25
      };
    }

    return { inconsistent: false };
  }

  checkContractCoherence(text) {
    // Stage et CDI sans transition
    if (/stage/i.test(text) && /cdi/i.test(text) && !/puis\s*cdi|suivi\s*(d'un\s*)?cdi|embauche\s*après/i.test(text)) {
      return {
        inconsistent: true,
        type: 'contract',
        message: 'Stage et CDI mentionnés sans transition claire',
        score: 20
      };
    }

    // Temps plein et temps partiel
    if (/temps\s*plein/i.test(text) && /temps\s*partiel/i.test(text) && !/ou\s*temps/i.test(text)) {
      return {
        inconsistent: true,
        type: 'contract',
        message: 'Temps plein et temps partiel contradictoires',
        score: 15
      };
    }

    return { inconsistent: false };
  }

  checkSalaryCoherence(jobData, text) {
    const salaryMatch = text.match(/(\d{2})[.,\s]?(\d{3})\s*(€|euros?)/i);
    if (salaryMatch) {
      const salary = parseInt(salaryMatch[1] + salaryMatch[2]);

      // Manager avec salaire très bas
      if (/manager|directeur|head\s*of/i.test(text) && salary < 40000) {
        return {
          inconsistent: true,
          type: 'salary',
          message: 'Salaire très bas pour un poste de management',
          extractedSalary: salary,
          score: 25
        };
      }

      // Salaire très élevé pour junior
      if (/junior|débutant|stage/i.test(text) && salary > 60000) {
        return {
          inconsistent: true,
          type: 'salary',
          message: 'Salaire inhabituellement élevé pour un poste junior',
          extractedSalary: salary,
          score: 20
        };
      }
    }

    return { inconsistent: false };
  }

  checkSkillsCoherence(text) {
    // Débutant avec compétences experts
    if (/débutant|sans\s*expérience|junior/i.test(text) &&
        /expert|maîtrise\s*parfaite|10\+?\s*ans/i.test(text)) {
      return {
        inconsistent: true,
        type: 'skills',
        message: 'Niveau débutant avec compétences experts demandées',
        score: 25
      };
    }

    return { inconsistent: false };
  }

  checkRemoteCoherence(jobData, text) {
    // 100% remote pour des postes nécessitant présence
    const physicalRoles = /logistique|manutention|accueil|réception|magasinier|cariste|production/i;
    if (/100\s*%\s*(remote|télétravail)/i.test(text) && physicalRoles.test(text)) {
      return {
        inconsistent: true,
        type: 'remote',
        message: 'Télétravail 100% pour un poste nécessitant présence physique',
        score: 30
      };
    }

    return { inconsistent: false };
  }

  getCoherenceLevel(score) {
    if (score >= 50) return 'TRÈS_INCOHÉRENTE';
    if (score >= 30) return 'INCOHÉRENTE';
    if (score >= 15) return 'QUELQUES_INCOHÉRENCES';
    return 'COHÉRENTE';
  }
}

// ============================================================================
// AGENT DE COMPARAISON MARCHÉ
// ============================================================================

class MarketComparatorAgent {
  constructor() {
    this.config = AGENT_CONFIG.MARKET_COMPARATOR;
    this.marketData = {
      salaryRanges: {
        'tech': { junior: [32000, 42000], confirme: [42000, 55000], senior: [55000, 75000], manager: [75000, 110000] },
        'marketing': { junior: [28000, 35000], confirme: [35000, 48000], senior: [48000, 65000], manager: [65000, 90000] },
        'commercial': { junior: [26000, 35000], confirme: [35000, 50000], senior: [48000, 70000], manager: [70000, 100000] },
        'finance': { junior: [32000, 42000], confirme: [42000, 58000], senior: [55000, 80000], manager: [85000, 130000] },
        'rh': { junior: [28000, 35000], confirme: [35000, 48000], senior: [45000, 62000], manager: [65000, 90000] },
        'default': { junior: [26000, 35000], confirme: [35000, 48000], senior: [46000, 65000], manager: [68000, 95000] }
      }
    };
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();

    const domain = this.detectDomain(text);
    const level = this.detectLevel(text);
    const extractedSalary = this.extractSalary(jobData.salary || text);

    const marketRange = this.marketData.salaryRanges[domain]?.[level] ||
                        this.marketData.salaryRanges['default'][level];

    let marketPosition = 'UNKNOWN';
    let scoreAdjustment = 0;
    let analysis = null;

    if (extractedSalary) {
      analysis = this.compareToMarket(extractedSalary, marketRange);
      marketPosition = analysis.position;
      scoreAdjustment = analysis.scoreAdjustment;
    }

    return {
      agent: this.config.id,
      domain,
      level,
      extractedSalary,
      marketRange: { min: marketRange[0], max: marketRange[1] },
      marketPosition,
      rawScore: scoreAdjustment,
      weightedScore: scoreAdjustment * this.config.weight,
      analysis,
      recommendation: this.getRecommendation(marketPosition, extractedSalary, marketRange)
    };
  }

  detectDomain(text) {
    const patterns = {
      'tech': /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia/i,
      'marketing': /marketing|communication|community|seo|sea|growth|content|brand|digital/i,
      'commercial': /commercial|vente|sales|account|business\s*develop/i,
      'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk/i,
      'rh': /ressources\s*humaines|rh|recrutement|talent|paie/i
    };

    for (const [domain, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) return domain;
    }
    return 'default';
  }

  detectLevel(text) {
    if (/stage|stagiaire|intern|alternance/i.test(text)) return 'junior';
    if (/junior|débutant|0-2\s*ans?/i.test(text)) return 'junior';
    if (/confirmé|intermédiaire|3-5\s*ans?/i.test(text)) return 'confirme';
    if (/senior|expérimenté|5\+?\s*ans?|expert/i.test(text)) return 'senior';
    if (/manager|directeur|head\s*of|responsable|lead/i.test(text)) return 'manager';
    return 'confirme';
  }

  extractSalary(text) {
    if (!text) return null;

    // Fourchette annuelle
    const rangeMatch = text.match(/(\d{2})[.,\s]?(\d{3})\s*[-àa]\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?|k)/i);
    if (rangeMatch) {
      let min = parseInt(rangeMatch[1] + rangeMatch[2]);
      let max = parseInt(rangeMatch[3] + rangeMatch[4]);
      if (/k/i.test(rangeMatch[0]) || min < 200) {
        min *= 1000;
        max *= 1000;
      }
      return { min, max, type: 'range' };
    }

    // Valeur unique
    const singleMatch = text.match(/(\d{2})[.,\s]?(\d{3})\s*(€|euros?)/i);
    if (singleMatch) {
      let value = parseInt(singleMatch[1] + singleMatch[2]);
      if (value < 200) value *= 1000;
      return { min: value, max: value, type: 'single' };
    }

    // K€
    const kMatch = text.match(/(\d{2,3})\s*k\s*(€|euros?)?/i);
    if (kMatch) {
      const value = parseInt(kMatch[1]) * 1000;
      return { min: value, max: value, type: 'single' };
    }

    return null;
  }

  compareToMarket(salary, marketRange) {
    const avgSalary = (salary.min + salary.max) / 2;
    const marketMin = marketRange[0];
    const marketMax = marketRange[1];
    const marketMedian = (marketMin + marketMax) / 2;

    let position, scoreAdjustment;

    if (avgSalary < marketMin * 0.7) {
      position = 'TRÈS_SOUS_ÉVALUÉ';
      scoreAdjustment = 25;
    } else if (avgSalary < marketMin * 0.9) {
      position = 'SOUS_ÉVALUÉ';
      scoreAdjustment = 15;
    } else if (avgSalary < marketMin) {
      position = 'LÉGÈREMENT_SOUS_MARCHÉ';
      scoreAdjustment = 8;
    } else if (avgSalary > marketMax * 1.5) {
      position = 'SUSPECT_TROP_ÉLEVÉ';
      scoreAdjustment = 30;
    } else if (avgSalary > marketMax * 1.2) {
      position = 'AU_DESSUS_MARCHÉ';
      scoreAdjustment = -5;
    } else if (avgSalary > marketMax) {
      position = 'ATTRACTIF';
      scoreAdjustment = -8;
    } else {
      position = 'CONFORME';
      scoreAdjustment = -10;
    }

    const percentile = Math.round(((avgSalary - marketMin) / (marketMax - marketMin)) * 100);

    return {
      position,
      scoreAdjustment,
      percentile: Math.max(0, Math.min(100, percentile)),
      deviation: Math.round(((avgSalary - marketMedian) / marketMedian) * 100)
    };
  }

  getRecommendation(position, salary, marketRange) {
    switch (position) {
      case 'TRÈS_SOUS_ÉVALUÉ':
        return `⚠️ Salaire très en dessous du marché (${marketRange[0]}-${marketRange[1]}€). Négociation fortement recommandée ou reconsidérer.`;
      case 'SOUS_ÉVALUÉ':
        return `📉 Salaire sous le marché. Prévoir une négociation.`;
      case 'LÉGÈREMENT_SOUS_MARCHÉ':
        return `📊 Légèrement sous le marché. Négociable selon avantages.`;
      case 'CONFORME':
        return `✅ Salaire conforme au marché.`;
      case 'ATTRACTIF':
        return `💰 Conditions attractives.`;
      case 'AU_DESSUS_MARCHÉ':
        return `💎 Salaire au-dessus du marché. Excellente opportunité si légitime.`;
      case 'SUSPECT_TROP_ÉLEVÉ':
        return `🚨 Salaire anormalement élevé. Vérifier la légitimité de l'offre.`;
      default:
        return `❓ Salaire non précisé. Demander lors de l'entretien.`;
    }
  }
}

// ============================================================================
// AGENT DE PROFESSIONNALISME
// ============================================================================

class ProfessionalismEvaluatorAgent {
  constructor() {
    this.config = AGENT_CONFIG.PROFESSIONALISM_EVALUATOR;
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const evaluation = {
      companyIdentification: this.evaluateCompanyId(jobData),
      descriptionQuality: this.evaluateDescription(jobData.description),
      contactProfessionalism: this.evaluateContact(text),
      processClarity: this.evaluateProcess(text),
      languageQuality: this.evaluateLanguage(text),
      benefitsTransparency: this.evaluateBenefits(text)
    };

    const totalScore = Object.values(evaluation).reduce((sum, item) => sum + item.score, 0);
    const avgScore = totalScore / Object.keys(evaluation).length;

    return {
      agent: this.config.id,
      evaluation,
      rawScore: -avgScore, // Négatif car c'est un bonus
      weightedScore: -avgScore * this.config.weight,
      professionalismLevel: this.getProfessionalismLevel(avgScore),
      overallRating: Math.round(avgScore * 10) / 10
    };
  }

  evaluateCompanyId(jobData) {
    let score = 0;
    const details = [];

    if (jobData.company && jobData.company.length > 2) {
      score += 3;
      details.push('Entreprise identifiée');
    }

    if (/siret|siren/i.test(jobData.description)) {
      score += 2;
      details.push('SIRET/SIREN mentionné');
    }

    if (/créée?\s*en\s*\d{4}|depuis\s*\d{4}/i.test(jobData.description)) {
      score += 1;
      details.push('Ancienneté mentionnée');
    }

    if (/\d+\s*(collaborateurs?|salariés?|employés?)/i.test(jobData.description)) {
      score += 1;
      details.push('Taille entreprise précisée');
    }

    return { score, maxScore: 7, details };
  }

  evaluateDescription(description) {
    let score = 0;
    const details = [];

    if (!description) return { score: 0, maxScore: 7, details: ['Pas de description'] };

    if (description.length > 500) {
      score += 2;
      details.push('Description détaillée');
    } else if (description.length > 200) {
      score += 1;
      details.push('Description correcte');
    }

    if (/missions?\s*:/i.test(description)) {
      score += 2;
      details.push('Missions listées');
    }

    if (/profil\s*(recherché|souhaité)\s*:/i.test(description)) {
      score += 1;
      details.push('Profil décrit');
    }

    if (/compétences?\s*(requises?|techniques?)\s*:/i.test(description)) {
      score += 1;
      details.push('Compétences listées');
    }

    if (/formation\s*(requise|souhaitée|bac\s*\+)/i.test(description)) {
      score += 1;
      details.push('Formation précisée');
    }

    return { score, maxScore: 7, details };
  }

  evaluateContact(text) {
    let score = 5; // On part du max et on enlève
    const details = [];

    if (/@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i.test(text)) {
      score -= 2;
      details.push('Email non professionnel');
    } else {
      details.push('Email professionnel ou non spécifié');
    }

    if (/whatsapp|telegram\s*(pour\s*postuler)?/i.test(text)) {
      score -= 2;
      details.push('Contact via messagerie personnelle');
    }

    if (/contact(er|ez)?\s*:?\s*[a-z]+@[a-z]+\.[a-z]+/i.test(text)) {
      score += 1;
      details.push('Contact email fourni');
    }

    return { score: Math.max(0, score), maxScore: 6, details };
  }

  evaluateProcess(text) {
    let score = 0;
    const details = [];

    if (/processus\s*(de\s*)?recrutement/i.test(text)) {
      score += 2;
      details.push('Processus décrit');
    }

    if (/entretien(s)?\s*(avec|rh|technique|manager)/i.test(text)) {
      score += 2;
      details.push('Entretiens précisés');
    }

    if (/test\s*technique|cas\s*pratique/i.test(text)) {
      score += 1;
      details.push('Évaluation technique');
    }

    if (/délai|retour\s*(sous|dans)\s*\d+/i.test(text)) {
      score += 1;
      details.push('Délais communiqués');
    }

    return { score, maxScore: 6, details };
  }

  evaluateLanguage(text) {
    let score = 5;
    const details = [];

    // Vérifier exclamations excessives
    const exclamationCount = (text.match(/!/g) || []).length;
    if (exclamationCount > 5) {
      score -= 1;
      details.push('Ponctuation excessive');
    }

    // Vérifier majuscules excessives
    const upperRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (upperRatio > 0.2) {
      score -= 1;
      details.push('Majuscules excessives');
    }

    // Vérifier emojis excessifs
    const emojiCount = (text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/gu) || []).length;
    if (emojiCount > 3) {
      score -= 1;
      details.push('Emojis excessifs');
    }

    // Langage marketing agressif
    if (/unique|incroyable|extraordinaire|exceptionnel(le)?/i.test(text)) {
      score -= 1;
      details.push('Langage marketing');
    }

    if (score === 5) {
      details.push('Ton professionnel');
    }

    return { score: Math.max(0, score), maxScore: 5, details };
  }

  evaluateBenefits(text) {
    let score = 0;
    const details = [];

    if (/\d{2}[\s,.]?\d{3}\s*(€|euros?|k)/i.test(text)) {
      score += 2;
      details.push('Salaire précisé');
    }

    if (/mutuelle|tickets?\s*restaurant/i.test(text)) {
      score += 1;
      details.push('Avantages sociaux');
    }

    if (/rtt|13(ème|e)\s*mois|participation/i.test(text)) {
      score += 1;
      details.push('Avantages détaillés');
    }

    if (/télétravail\s*\d+|hybride|remote\s*\d+/i.test(text)) {
      score += 1;
      details.push('Télétravail précisé');
    }

    return { score, maxScore: 5, details };
  }

  getProfessionalismLevel(avgScore) {
    if (avgScore >= 5) return 'TRÈS_PROFESSIONNEL';
    if (avgScore >= 4) return 'PROFESSIONNEL';
    if (avgScore >= 3) return 'CORRECT';
    if (avgScore >= 2) return 'AMATEUR';
    return 'NON_PROFESSIONNEL';
  }
}

// ============================================================================
// AGENT GHOST JOB
// ============================================================================

class GhostJobDetectorAgent {
  constructor() {
    this.config = AGENT_CONFIG.GHOST_JOB_DETECTOR;
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const indicators = [];
    let totalScore = 0;

    // Vérifier le nombre de candidats (LinkedIn)
    if (jobData.applicants) {
      const applicantAnalysis = this.analyzeApplicantCount(jobData.applicants);
      if (applicantAnalysis.isGhostIndicator) {
        indicators.push(applicantAnalysis);
        totalScore += applicantAnalysis.score;
      }
    }

    // Vérifier la date de publication
    const dateAnalysis = this.analyzePostingDate(text, jobData.postedDate);
    if (dateAnalysis.isGhostIndicator) {
      indicators.push(dateAnalysis);
      totalScore += dateAnalysis.score;
    }

    // Vérifier les indicateurs textuels
    const textIndicators = this.analyzeTextIndicators(text);
    indicators.push(...textIndicators);
    totalScore += textIndicators.reduce((sum, i) => sum + i.score, 0);

    const ghostProbability = this.calculateGhostProbability(indicators, totalScore);

    return {
      agent: this.config.id,
      indicators,
      rawScore: totalScore,
      weightedScore: totalScore * this.config.weight,
      ghostProbability,
      verdict: this.getVerdict(ghostProbability),
      explanation: this.getExplanation(indicators)
    };
  }

  analyzeApplicantCount(count) {
    if (count >= 500) {
      return {
        type: 'high_applicants',
        message: `${count}+ candidatures - offre probablement inactive`,
        score: 35,
        isGhostIndicator: true
      };
    } else if (count >= 300) {
      return {
        type: 'high_applicants',
        message: `${count} candidatures - concurrence très élevée`,
        score: 20,
        isGhostIndicator: true
      };
    } else if (count >= 150) {
      return {
        type: 'medium_applicants',
        message: `${count} candidatures - concurrence élevée`,
        score: 10,
        isGhostIndicator: true
      };
    }
    return { isGhostIndicator: false };
  }

  analyzePostingDate(text, postedDate) {
    // Vérifier si publié depuis longtemps
    const longAgoPatterns = [
      { pattern: /publié(e)?\s*(il\s*y\s*a|depuis)\s*(plus\s*de\s*)?(4|5|6)\s*mois/i, score: 35 },
      { pattern: /publié(e)?\s*(il\s*y\s*a|depuis)\s*(plus\s*de\s*)?3\s*mois/i, score: 25 },
      { pattern: /republication|re-?publication/i, score: 20 }
    ];

    for (const { pattern, score } of longAgoPatterns) {
      if (pattern.test(text)) {
        return {
          type: 'old_posting',
          message: 'Offre publiée depuis longtemps',
          score,
          isGhostIndicator: true
        };
      }
    }

    return { isGhostIndicator: false };
  }

  analyzeTextIndicators(text) {
    const indicators = [];
    const patterns = [
      { pattern: /vivier\s*(de\s*)?(candidats?|talents?)/i, score: 30, message: 'Constitution de vivier' },
      { pattern: /pour\s*(nos\s*)?futurs?\s*(besoins?|projets?)/i, score: 25, message: 'Pas de besoin immédiat' },
      { pattern: /candidatures?\s*spontanées?/i, score: 20, message: 'Candidature spontanée déguisée' },
      { pattern: /toujours\s*(à\s*la\s*)?recherche/i, score: 15, message: 'Recherche prolongée' },
      { pattern: /poste\s*(non\s*)?pourvu/i, score: 20, message: 'Statut incertain' }
    ];

    for (const { pattern, score, message } of patterns) {
      if (pattern.test(text)) {
        indicators.push({
          type: 'text_indicator',
          message,
          score,
          isGhostIndicator: true
        });
      }
    }

    return indicators;
  }

  calculateGhostProbability(indicators, totalScore) {
    if (totalScore >= 50) return 'TRÈS_PROBABLE';
    if (totalScore >= 35) return 'PROBABLE';
    if (totalScore >= 20) return 'POSSIBLE';
    if (totalScore >= 10) return 'PEU_PROBABLE';
    return 'IMPROBABLE';
  }

  getVerdict(probability) {
    const verdicts = {
      'TRÈS_PROBABLE': { icon: '👻', action: 'Éviter ou contacter directement l\'entreprise' },
      'PROBABLE': { icon: '👻', action: 'Vérifier si le poste est toujours ouvert' },
      'POSSIBLE': { icon: '🔍', action: 'Candidater mais sans trop d\'attentes' },
      'PEU_PROBABLE': { icon: '✅', action: 'Offre probablement active' },
      'IMPROBABLE': { icon: '✅', action: 'Offre a priori légitime' }
    };
    return verdicts[probability];
  }

  getExplanation(indicators) {
    if (indicators.length === 0) {
      return 'Aucun indicateur de ghost job détecté.';
    }
    return `Indicateurs détectés: ${indicators.map(i => i.message).join(', ')}`;
  }
}

// ============================================================================
// AGENT LINKEDIN SPÉCIFIQUE
// ============================================================================

class LinkedInSpecialistAgent {
  constructor() {
    this.config = AGENT_CONFIG.LINKEDIN_SPECIALIST;
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const linkedInSpecific = {
      applicantAnalysis: this.analyzeApplicants(jobData.applicants),
      easyApplyAnalysis: this.analyzeEasyApply(text),
      companyVerification: this.verifyCompanyProfile(jobData),
      recruiterActivity: this.analyzeRecruiterActivity(text),
      jobLevelConsistency: this.checkJobLevelConsistency(text)
    };

    const totalScore = Object.values(linkedInSpecific)
      .filter(v => v && typeof v.score === 'number')
      .reduce((sum, item) => sum + item.score, 0);

    return {
      agent: this.config.id,
      platform: 'linkedin',
      analysis: linkedInSpecific,
      rawScore: totalScore,
      weightedScore: totalScore * this.config.weight,
      linkedInRiskLevel: this.calculateLinkedInRisk(linkedInSpecific),
      recommendations: this.generateLinkedInRecommendations(linkedInSpecific)
    };
  }

  analyzeApplicants(count) {
    if (!count) return { score: 0, message: 'Nombre de candidats non disponible' };

    if (count >= 500) {
      return { score: 30, level: 'ghost_likely', message: `${count}+ candidatures - Ghost job probable` };
    } else if (count >= 200) {
      return { score: 15, level: 'high_competition', message: `${count} candidatures - Forte concurrence` };
    } else if (count < 10) {
      return { score: -5, level: 'low_competition', message: `${count} candidatures - Peu de concurrence` };
    }
    return { score: 0, level: 'normal', message: `${count} candidatures - Normal` };
  }

  analyzeEasyApply(text) {
    if (/easy\s*apply|candidature\s*simplifiée/i.test(text)) {
      return { score: 0, hasEasyApply: true, message: 'Easy Apply disponible' };
    }
    return { score: 5, hasEasyApply: false, message: 'Candidature externe - plus de friction' };
  }

  verifyCompanyProfile(jobData) {
    let score = 0;
    const checks = [];

    if (!jobData.company || jobData.company.length < 3) {
      score += 25;
      checks.push('Entreprise non identifiée');
    } else {
      checks.push('Entreprise identifiée');
    }

    // Vérifier si la page entreprise semble légitime (heuristique basique)
    if (/hiring|recrutement|careers/i.test(jobData.description)) {
      score -= 5;
      checks.push('Mention de page carrières');
    }

    return { score, checks };
  }

  analyzeRecruiterActivity(text) {
    if (/recruiter|talent\s*acquisition|chargé(e)?\s*de\s*recrutement/i.test(text)) {
      return { score: -5, hasRecruiter: true, message: 'Recruteur identifié' };
    }
    return { score: 0, hasRecruiter: false, message: 'Recruteur non identifié' };
  }

  checkJobLevelConsistency(text) {
    const issues = [];
    let score = 0;

    // Entry Level avec expérience requise
    if (/entry\s*level|niveau\s*débutant/i.test(text) && /\d+\s*ans?\s*(d')?exp/i.test(text)) {
      const yearsMatch = text.match(/(\d+)\s*ans?/);
      if (yearsMatch && parseInt(yearsMatch[1]) >= 3) {
        issues.push('Entry level demandant de l\'expérience');
        score += 20;
      }
    }

    // Associate avec trop d'expérience
    if (/associate/i.test(text) && /5\+?\s*ans?|senior|expert/i.test(text)) {
      issues.push('Niveau Associate avec exigences Senior');
      score += 15;
    }

    return { score, issues, hasIssues: issues.length > 0 };
  }

  calculateLinkedInRisk(analysis) {
    const totalScore = Object.values(analysis)
      .filter(v => v && typeof v.score === 'number')
      .reduce((sum, item) => sum + item.score, 0);

    if (totalScore >= 40) return 'HIGH';
    if (totalScore >= 20) return 'MEDIUM';
    if (totalScore >= 10) return 'LOW';
    return 'MINIMAL';
  }

  generateLinkedInRecommendations(analysis) {
    const recommendations = [];

    if (analysis.applicantAnalysis?.level === 'ghost_likely') {
      recommendations.push('👻 Contacter directement l\'entreprise avant de postuler');
    }

    if (analysis.applicantAnalysis?.level === 'high_competition') {
      recommendations.push('📊 Personnaliser fortement votre candidature');
    }

    if (analysis.companyVerification?.checks?.includes('Entreprise non identifiée')) {
      recommendations.push('🔍 Rechercher l\'entreprise avant de postuler');
    }

    if (analysis.jobLevelConsistency?.hasIssues) {
      recommendations.push('⚠️ Clarifier les attentes en termes d\'expérience');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Offre LinkedIn standard - vous pouvez postuler');
    }

    return recommendations;
  }
}

// ============================================================================
// AGENT INDEED SPÉCIFIQUE
// ============================================================================

class IndeedSpecialistAgent {
  constructor() {
    this.config = AGENT_CONFIG.INDEED_SPECIALIST;
  }

  analyze(jobData) {
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();
    const indeedSpecific = {
      urgentHiring: this.checkUrgentHiring(text),
      salaryEstimate: this.analyzeSalaryDisplay(text, jobData.salary),
      applicationMethod: this.analyzeApplicationMethod(text),
      reviewsAnalysis: this.analyzeCompanyReviews(text),
      jobTypeConsistency: this.checkJobType(text)
    };

    const totalScore = Object.values(indeedSpecific)
      .filter(v => v && typeof v.score === 'number')
      .reduce((sum, item) => sum + item.score, 0);

    return {
      agent: this.config.id,
      platform: 'indeed',
      analysis: indeedSpecific,
      rawScore: totalScore,
      weightedScore: totalScore * this.config.weight,
      indeedRiskLevel: this.calculateIndeedRisk(totalScore),
      recommendations: this.generateIndeedRecommendations(indeedSpecific)
    };
  }

  checkUrgentHiring(text) {
    if (/urgent(ly)?\s*hiring|recrutement\s*urgent/i.test(text)) {
      return { score: 15, isUrgent: true, message: 'Recrutement urgent' };
    }
    if (/hiring\s*immediately|embauche\s*immédiate/i.test(text)) {
      return { score: 20, isUrgent: true, message: 'Embauche immédiate' };
    }
    return { score: 0, isUrgent: false, message: 'Pas d\'urgence mentionnée' };
  }

  analyzeSalaryDisplay(text, salary) {
    if (!salary || salary.length < 3) {
      if (/estimated\s*salary|salaire\s*estimé/i.test(text)) {
        return { score: 5, type: 'estimated', message: 'Salaire estimé par Indeed' };
      }
      return { score: 10, type: 'missing', message: 'Salaire non précisé' };
    }
    return { score: -5, type: 'provided', message: 'Salaire fourni par l\'employeur' };
  }

  analyzeApplicationMethod(text) {
    if (/apply\s*on\s*company\s*site|postuler\s*sur\s*le\s*site/i.test(text)) {
      return { score: 0, method: 'company_site', message: 'Candidature sur site entreprise' };
    }
    if (/apply\s*now|postuler\s*maintenant/i.test(text)) {
      return { score: -3, method: 'indeed_apply', message: 'Indeed Apply disponible' };
    }
    return { score: 5, method: 'unknown', message: 'Méthode de candidature non claire' };
  }

  analyzeCompanyReviews(text) {
    const reviewMatch = text.match(/(\d+(?:\.\d)?)\s*(?:out\s*of\s*5|\/5|étoiles?|stars?)/i);
    if (reviewMatch) {
      const rating = parseFloat(reviewMatch[1]);
      if (rating >= 4.0) {
        return { score: -8, rating, message: `Note entreprise: ${rating}/5` };
      } else if (rating >= 3.0) {
        return { score: -3, rating, message: `Note entreprise correcte: ${rating}/5` };
      } else {
        return { score: 10, rating, message: `Note entreprise faible: ${rating}/5` };
      }
    }
    return { score: 0, rating: null, message: 'Pas d\'avis visible' };
  }

  checkJobType(text) {
    const issues = [];
    let score = 0;

    // CDI mais heures flexibles non définies
    if (/cdi|permanent/i.test(text) && /heures?\s*flexibles?|flexible\s*hours/i.test(text)) {
      if (!/\d+\s*h(eures)?/i.test(text)) {
        issues.push('CDI avec heures flexibles non définies');
        score += 10;
      }
    }

    // Freelance déguisé
    if (/cdi|cdd|permanent/i.test(text) && /auto-?entrepreneur|freelance|indépendant/i.test(text)) {
      issues.push('Possible freelance déguisé');
      score += 20;
    }

    return { score, issues, hasIssues: issues.length > 0 };
  }

  calculateIndeedRisk(score) {
    if (score >= 30) return 'HIGH';
    if (score >= 15) return 'MEDIUM';
    if (score >= 5) return 'LOW';
    return 'MINIMAL';
  }

  generateIndeedRecommendations(analysis) {
    const recommendations = [];

    if (analysis.urgentHiring?.isUrgent) {
      recommendations.push('⏰ Urgence mentionnée - vérifier la légitimité');
    }

    if (analysis.salaryEstimate?.type === 'estimated') {
      recommendations.push('💰 Salaire estimé - demander confirmation');
    }

    if (analysis.salaryEstimate?.type === 'missing') {
      recommendations.push('💰 Demander le salaire dès le premier contact');
    }

    if (analysis.reviewsAnalysis?.rating && analysis.reviewsAnalysis.rating < 3) {
      recommendations.push('⭐ Avis entreprise mitigés - lire les commentaires');
    }

    if (analysis.jobTypeConsistency?.hasIssues) {
      recommendations.push('📋 Clarifier le type de contrat réel');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Offre Indeed standard - vous pouvez postuler');
    }

    return recommendations;
  }
}

// ============================================================================
// ORCHESTRATEUR D'AGENTS
// ============================================================================

class AgentOrchestrator {
  constructor(platform = 'generic') {
    this.platform = platform;
    this.agents = this.initializeAgents();
  }

  initializeAgents() {
    const agents = [
      new ScamDetectorAgent(),
      new CoherenceAnalyzerAgent(),
      new MarketComparatorAgent(),
      new ProfessionalismEvaluatorAgent(),
      new GhostJobDetectorAgent()
    ];

    // Ajouter l'agent spécifique à la plateforme
    if (this.platform === 'linkedin') {
      agents.push(new LinkedInSpecialistAgent());
    } else if (this.platform === 'indeed') {
      agents.push(new IndeedSpecialistAgent());
    }

    return agents;
  }

  async analyzeJob(jobData) {
    const results = {};
    let totalWeightedScore = 0;
    let totalWeight = 0;

    // Exécuter tous les agents
    for (const agent of this.agents) {
      const result = agent.analyze(jobData);
      results[agent.config.id] = result;
      totalWeightedScore += result.weightedScore || 0;
      totalWeight += agent.config.weight;
    }

    // Normaliser le score final
    const normalizedScore = Math.min(100, Math.max(0, totalWeightedScore));

    // Déterminer la classification finale
    const finalClassification = this.determineClassification(normalizedScore, results);

    // Consolider les recommandations
    const allRecommendations = this.consolidateRecommendations(results);

    return {
      platform: this.platform,
      finalScore: Math.round(normalizedScore),
      classification: finalClassification,
      agentResults: results,
      consolidatedRecommendations: allRecommendations,
      summary: this.generateSummary(normalizedScore, finalClassification, results),
      timestamp: new Date().toISOString()
    };
  }

  determineClassification(score, results) {
    const scamResult = results['scam-detector'];
    const ghostResult = results['ghost-job-detector'];
    const coherenceResult = results['coherence-analyzer'];
    const marketResult = results['market-comparator'];

    // Arnaques
    if (score >= 70 || scamResult?.riskLevel === 'CRITICAL') {
      return { code: 'ARNAQUE', label: 'Arnaque', icon: '🚨', color: '#991b1b' };
    }

    // À fuir
    if (score >= 60 || scamResult?.riskLevel === 'HIGH') {
      return { code: 'A_FUIR', label: 'À fuir', icon: '🚫', color: '#dc2626' };
    }

    // Ghost Job
    if (ghostResult?.ghostProbability === 'TRÈS_PROBABLE') {
      return { code: 'GHOST_JOB', label: 'Ghost Job', icon: '👻', color: '#7c3aed' };
    }

    // À vérifier
    if (score >= 50) {
      return { code: 'A_VERIFIER', label: 'À vérifier', icon: '🔍', color: '#dc2626' };
    }

    // Incohérente
    if (coherenceResult?.coherenceLevel === 'TRÈS_INCOHÉRENTE' ||
        coherenceResult?.coherenceLevel === 'INCOHÉRENTE') {
      return { code: 'INCOHERENTE', label: 'Incohérente', icon: '🔀', color: '#ea580c' };
    }

    // Sous-évaluée
    if (marketResult?.marketPosition?.includes('SOUS')) {
      return { code: 'SOUS_EVALUEE', label: 'Sous-évaluée', icon: '📉', color: '#d97706' };
    }

    // Passable
    if (score >= 20) {
      return { code: 'PASSABLE', label: 'Passable', icon: '⚡', color: '#ca8a04' };
    }

    // Professionnelle
    if (score < 10) {
      return { code: 'LEGITIME', label: 'Légitime', icon: '✅', color: '#16a34a' };
    }

    return { code: 'ADAPTEE_MARCHE', label: 'Adaptée au marché', icon: '📊', color: '#0d9488' };
  }

  consolidateRecommendations(results) {
    const recommendations = new Set();

    for (const result of Object.values(results)) {
      if (result.recommendations) {
        result.recommendations.forEach(r => recommendations.add(r));
      }
      if (result.verdict?.action) {
        recommendations.add(`${result.verdict.icon} ${result.verdict.action}`);
      }
    }

    return Array.from(recommendations);
  }

  generateSummary(score, classification, results) {
    let summary = `${classification.icon} **${classification.label}** (Score: ${Math.round(score)}/100)\n\n`;

    // Ajouter les alertes critiques
    const scamResult = results['scam-detector'];
    if (scamResult?.scamIndicators?.length > 0) {
      const critical = scamResult.scamIndicators.filter(i => i.score >= 40);
      if (critical.length > 0) {
        summary += `🚨 **Alertes critiques:**\n`;
        critical.forEach(i => {
          summary += `  - ${i.type}: ${i.pattern}\n`;
        });
        summary += '\n';
      }
    }

    // Ajouter l'analyse marché
    const marketResult = results['market-comparator'];
    if (marketResult?.marketPosition && marketResult.marketPosition !== 'UNKNOWN') {
      summary += `📊 **Position marché:** ${marketResult.marketPosition.replace(/_/g, ' ')}\n`;
      if (marketResult.recommendation) {
        summary += `   ${marketResult.recommendation}\n`;
      }
      summary += '\n';
    }

    // Ajouter les incohérences
    const coherenceResult = results['coherence-analyzer'];
    if (coherenceResult?.inconsistencies?.length > 0) {
      summary += `🔀 **Incohérences détectées:**\n`;
      coherenceResult.inconsistencies.forEach(i => {
        summary += `  - ${i.message}\n`;
      });
      summary += '\n';
    }

    return summary;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AgentOrchestrator,
  ScamDetectorAgent,
  CoherenceAnalyzerAgent,
  MarketComparatorAgent,
  ProfessionalismEvaluatorAgent,
  GhostJobDetectorAgent,
  LinkedInSpecialistAgent,
  IndeedSpecialistAgent,
  AGENT_CONFIG
};

// Export pour CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AgentOrchestrator,
    ScamDetectorAgent,
    CoherenceAnalyzerAgent,
    MarketComparatorAgent,
    ProfessionalismEvaluatorAgent,
    GhostJobDetectorAgent,
    LinkedInSpecialistAgent,
    IndeedSpecialistAgent,
    AGENT_CONFIG
  };
}