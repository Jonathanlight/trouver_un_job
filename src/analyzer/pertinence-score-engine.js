/**
 * Fake Job Detector - Moteur de Score de Pertinence
 *
 * Formule mathématique complète pour l'évaluation des offres d'emploi
 *
 * SCORE FINAL DE PERTINENCE (P) = Σ(wi × Si)
 *
 * Où:
 * - L (Légitimité)      : Score de légitimité de l'offre [0-100]
 * - M (Marché)          : Score d'alignement au marché [0-100]
 * - Q (Qualité)         : Score de qualité de l'offre [0-100]
 * - O (Opportunité)     : Score d'opportunité [0-100]
 * - C (Cohérence)       : Score de cohérence [0-100]
 *
 * P = 0.30×L + 0.20×M + 0.20×Q + 0.15×O + 0.15×C
 */

const PertinenceScoreEngine = {

  // ============================================================================
  // CONFIGURATION DES POIDS
  // ============================================================================

  WEIGHTS: {
    legitimacy: 0.30,      // Légitimité (le plus important)
    market: 0.20,          // Alignement marché
    quality: 0.20,         // Qualité de l'offre
    opportunity: 0.15,     // Opportunité
    coherence: 0.15        // Cohérence
  },

  // ============================================================================
  // DONNÉES DE RÉFÉRENCE MARCHÉ
  // ============================================================================

  MARKET_DATA: {
    salaryRanges: {
      'tech': {
        junior: { min: 32000, max: 42000, median: 37000 },
        confirme: { min: 42000, max: 55000, median: 48000 },
        senior: { min: 55000, max: 75000, median: 65000 },
        lead: { min: 65000, max: 85000, median: 75000 },
        manager: { min: 75000, max: 110000, median: 90000 }
      },
      'marketing': {
        junior: { min: 28000, max: 36000, median: 32000 },
        confirme: { min: 36000, max: 48000, median: 42000 },
        senior: { min: 48000, max: 65000, median: 55000 },
        lead: { min: 55000, max: 75000, median: 65000 },
        manager: { min: 65000, max: 95000, median: 80000 }
      },
      'commercial': {
        junior: { min: 26000, max: 35000, median: 30000 },
        confirme: { min: 35000, max: 50000, median: 42000 },
        senior: { min: 48000, max: 70000, median: 58000 },
        lead: { min: 60000, max: 85000, median: 72000 },
        manager: { min: 70000, max: 120000, median: 90000 }
      },
      'finance': {
        junior: { min: 32000, max: 42000, median: 37000 },
        confirme: { min: 42000, max: 58000, median: 50000 },
        senior: { min: 55000, max: 80000, median: 67000 },
        lead: { min: 70000, max: 100000, median: 85000 },
        manager: { min: 85000, max: 150000, median: 110000 }
      },
      'rh': {
        junior: { min: 28000, max: 36000, median: 32000 },
        confirme: { min: 36000, max: 48000, median: 42000 },
        senior: { min: 45000, max: 62000, median: 53000 },
        lead: { min: 55000, max: 75000, median: 65000 },
        manager: { min: 65000, max: 95000, median: 80000 }
      },
      'design': {
        junior: { min: 28000, max: 38000, median: 33000 },
        confirme: { min: 38000, max: 50000, median: 44000 },
        senior: { min: 48000, max: 65000, median: 56000 },
        lead: { min: 58000, max: 80000, median: 68000 },
        manager: { min: 70000, max: 100000, median: 85000 }
      },
      'default': {
        junior: { min: 26000, max: 35000, median: 30000 },
        confirme: { min: 35000, max: 48000, median: 41000 },
        senior: { min: 46000, max: 65000, median: 55000 },
        lead: { min: 55000, max: 80000, median: 67000 },
        manager: { min: 68000, max: 100000, median: 82000 }
      }
    },

    locationMultipliers: {
      'paris': 1.15,
      'lyon': 1.05,
      'marseille': 1.02,
      'toulouse': 1.02,
      'bordeaux': 1.03,
      'nantes': 1.02,
      'lille': 1.00,
      'nice': 1.03,
      'strasbourg': 1.00,
      'default': 0.95
    },

    // Avantages standards et leur valeur équivalente annuelle
    benefitsValue: {
      'mutuelle': 1200,
      'tickets_restaurant': 1800,
      'rtt': 2000,
      '13eme_mois': 0.08,  // 8% du salaire
      'interessement': 0.05,
      'participation': 0.05,
      'teletravail': 1500,
      'transport': 800,
      'ce': 500,
      'formation': 1000
    }
  },

  // ============================================================================
  // PATTERNS DE DÉTECTION
  // ============================================================================

  PATTERNS: {
    // RED FLAGS - Indicateurs négatifs (poids: impact sur le score)
    redFlags: {
      critical: [
        { pattern: /paiement\s*(requis|nécessaire|obligatoire)/i, impact: -40, label: "Paiement requis" },
        { pattern: /frais\s*(de\s*)?(inscription|formation|dossier)/i, impact: -40, label: "Frais demandés" },
        { pattern: /investissement\s*(initial|de\s*départ)/i, impact: -40, label: "Investissement initial" },
        { pattern: /acheter?\s*(le\s*)?(kit|stock|matériel)/i, impact: -35, label: "Achat matériel obligatoire" },
        { pattern: /numéro\s*(de\s*)?(sécurité\s*sociale|sécu)/i, impact: -35, label: "N° sécu demandé" },
        { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|passeport)/i, impact: -35, label: "Pièce d'identité demandée" },
        { pattern: /rib\s*(avant|pour)/i, impact: -35, label: "RIB demandé" },
        { pattern: /gagn(er|ez)\s*(jusqu'?à\s*)?\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, impact: -35, label: "Gains irréalistes" },
        { pattern: /devenez?\s*(riche|millionnaire)/i, impact: -40, label: "Promesse enrichissement" },
        { pattern: /pas\s*(d'?|de\s*)entretien/i, impact: -30, label: "Pas d'entretien" },
        { pattern: /parrain(age|er)|filleul/i, impact: -35, label: "Structure MLM" },
        { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, impact: -35, label: "MLM détecté" },
        { pattern: /downline|upline|plan\s*de\s*compensation/i, impact: -40, label: "Terminologie MLM" }
      ],
      high: [
        { pattern: /revenu\s*(passif|illimité|garanti)/i, impact: -25, label: "Revenu passif/garanti" },
        { pattern: /sans\s*(effort|travail|compétence)/i, impact: -25, label: "Sans effort promis" },
        { pattern: /embauche\s*(immédiate|garantie|sans\s*entretien)/i, impact: -20, label: "Embauche immédiate" },
        { pattern: /commenc(er|ez)\s*(immédiatement|aujourd'?hui|demain)/i, impact: -18, label: "Démarrage immédiat" },
        { pattern: /whatsapp|telegram\s*(pour\s*postuler|uniquement)/i, impact: -20, label: "Contact messagerie" },
        { pattern: /envoy(er|ez)\s*(cv|candidature)\s*(par|via)\s*(whatsapp|telegram)/i, impact: -22, label: "CV via messagerie" },
        { pattern: /vivier\s*(de\s*)?(candidats?|talents?)/i, impact: -18, label: "Constitution vivier" },
        { pattern: /pour\s*(nos\s*)?futurs?\s*(besoins?|projets?)/i, impact: -15, label: "Pas de besoin immédiat" },
        { pattern: /résultats?\s*garantis?/i, impact: -18, label: "Résultats garantis" },
        { pattern: /places?\s*limitées?|dernière\s*chance/i, impact: -15, label: "Fausse rareté" },
        { pattern: /crypto|bitcoin|ethereum|nft/i, impact: -20, label: "Crypto suspect" }
      ],
      medium: [
        { pattern: /@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i, impact: -10, label: "Email non professionnel" },
        { pattern: /urgent\s*!|!!!|recrutement\s*urgent/i, impact: -8, label: "Urgence excessive" },
        { pattern: /travail\s*à\s*(domicile|la\s*maison)/i, impact: -5, label: "Travail domicile vague" }
      ]
    },

    // GREEN FLAGS - Indicateurs positifs
    greenFlags: {
      high: [
        { pattern: /convention\s*collective/i, impact: 12, label: "Convention collective" },
        { pattern: /n°\s*siret|siret\s*:\s*\d/i, impact: 10, label: "SIRET mentionné" },
        { pattern: /processus\s*(de\s*)?recrutement\s*:/i, impact: 10, label: "Processus détaillé" },
        { pattern: /\d{2}[\s,.]?\d{3}\s*[-àa]\s*\d{2}[\s,.]?\d{3}\s*(€|euros?)/i, impact: 12, label: "Fourchette salariale" },
        { pattern: /entretien(s)?\s*(avec|rh|technique|manager|équipe)/i, impact: 8, label: "Entretiens structurés" }
      ],
      medium: [
        { pattern: /cdi\s*(temps\s*plein)?/i, impact: 8, label: "CDI précisé" },
        { pattern: /mutuelle|complémentaire\s*santé/i, impact: 6, label: "Mutuelle" },
        { pattern: /tickets?\s*restaurant/i, impact: 5, label: "Tickets restaurant" },
        { pattern: /13(ème|e)\s*mois/i, impact: 7, label: "13ème mois" },
        { pattern: /rtt\s*\d+/i, impact: 6, label: "RTT" },
        { pattern: /participation|intéressement/i, impact: 7, label: "Participation" },
        { pattern: /télétravail\s*\d+\s*(jours?|j)/i, impact: 6, label: "Télétravail" },
        { pattern: /\d+\s*(collaborateurs?|salariés?|employés?)/i, impact: 5, label: "Taille entreprise" },
        { pattern: /créée?\s*en\s*\d{4}/i, impact: 5, label: "Ancienneté entreprise" },
        { pattern: /missions?\s*:\s*.{50,}/i, impact: 6, label: "Missions détaillées" }
      ],
      low: [
        { pattern: /formation\s*(interne|continue)/i, impact: 3, label: "Formation" },
        { pattern: /équipe\s*(dynamique|soudée|bienveillante)/i, impact: 2, label: "Équipe positive" },
        { pattern: /locaux?\s*(modernes?|neufs?)/i, impact: 2, label: "Locaux modernes" },
        { pattern: /parking|vélo/i, impact: 2, label: "Facilités transport" }
      ]
    },

    // Détection du domaine
    domains: {
      'tech': /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia|machine\s*learning|python|java|php|javascript|react|angular|node/i,
      'marketing': /marketing|communication|community|seo|sea|growth|content|brand|digital|acquisition|crm|emailing/i,
      'commercial': /commercial|vente|sales|account|business\s*develop|key\s*account|ingénieur\s*commercial/i,
      'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk|analyst|consolidation/i,
      'rh': /ressources\s*humaines|rh\b|recrutement|talent|paie|sirh|formation|gpec/i,
      'design': /design|ux|ui|graphi|directeur\s*artistique|webdesign|motion/i,
      'juridique': /juridi|avocat|droit|legal|compliance|rgpd/i,
      'logistique': /logisti|supply\s*chain|approvision|transport|warehouse|stock/i
    },

    // Détection du niveau
    levels: {
      'junior': /stage|stagiaire|intern|alternance|junior|débutant|0-2\s*ans?|sortie\s*d'?école/i,
      'confirme': /confirmé|intermédiaire|3-5\s*ans?|2-4\s*ans?|expérimenté/i,
      'senior': /senior|expérimenté|5\+?\s*ans?|expert|référent|7\+?\s*ans?/i,
      'lead': /lead|tech\s*lead|team\s*lead|chef\s*d'?équipe|principal/i,
      'manager': /manager|directeur|head\s*of|responsable|vp|vice\s*president|cto|cfo|cmo/i
    }
  },

  // ============================================================================
  // MÉTHODE PRINCIPALE D'ÉVALUATION
  // ============================================================================

  /**
   * Calcule le score de pertinence global
   * @param {Object} jobData - Données de l'offre
   * @param {Object} siteContext - Contexte spécifique au site (candidats, date, etc.)
   * @returns {Object} Résultat complet de l'évaluation
   */
  evaluate(jobData, siteContext = {}) {
    const text = this.normalizeText(jobData);
    const domain = this.detectDomain(text);
    const level = this.detectLevel(text);
    const location = this.detectLocation(jobData.location || '');

    // Calcul des 5 scores composants
    const legitimacyResult = this.calculateLegitimacyScore(text);
    const marketResult = this.calculateMarketScore(jobData, domain, level, location);
    const qualityResult = this.calculateQualityScore(jobData, text);
    const opportunityResult = this.calculateOpportunityScore(siteContext);
    const coherenceResult = this.calculateCoherenceScore(jobData, text, domain, level);

    // Calcul du score de pertinence final (formule pondérée)
    const pertinenceScore = Math.round(
      this.WEIGHTS.legitimacy * legitimacyResult.score +
      this.WEIGHTS.market * marketResult.score +
      this.WEIGHTS.quality * qualityResult.score +
      this.WEIGHTS.opportunity * opportunityResult.score +
      this.WEIGHTS.coherence * coherenceResult.score
    );

    // Score de risque inversé (pour compatibilité)
    const riskScore = Math.max(0, 100 - pertinenceScore);

    // Détermination de la classification
    const classification = this.determineClassification(
      pertinenceScore,
      legitimacyResult,
      marketResult,
      qualityResult,
      opportunityResult,
      coherenceResult
    );

    return {
      // Score principal
      pertinenceScore,
      riskScore,

      // Classification
      classification,

      // Métadonnées
      domain,
      level,
      location,

      // Scores détaillés
      scores: {
        legitimacy: legitimacyResult,
        market: marketResult,
        quality: qualityResult,
        opportunity: opportunityResult,
        coherence: coherenceResult
      },

      // Formule utilisée
      formula: `P = ${this.WEIGHTS.legitimacy}×L + ${this.WEIGHTS.market}×M + ${this.WEIGHTS.quality}×Q + ${this.WEIGHTS.opportunity}×O + ${this.WEIGHTS.coherence}×C`,
      formulaValues: `P = ${this.WEIGHTS.legitimacy}×${legitimacyResult.score} + ${this.WEIGHTS.market}×${marketResult.score} + ${this.WEIGHTS.quality}×${qualityResult.score} + ${this.WEIGHTS.opportunity}×${opportunityResult.score} + ${this.WEIGHTS.coherence}×${coherenceResult.score}`,

      // Signaux détectés
      signals: {
        redFlags: legitimacyResult.redFlags,
        greenFlags: legitimacyResult.greenFlags,
        warnings: [...marketResult.warnings, ...qualityResult.warnings, ...coherenceResult.warnings]
      },

      // Recommandations
      recommendations: this.generateRecommendations(classification, legitimacyResult, marketResult, opportunityResult)
    };
  },

  // ============================================================================
  // CALCUL DU SCORE DE LÉGITIMITÉ (L)
  // ============================================================================

  /**
   * Score de Légitimité: L = 100 - Σ(redFlagImpacts) + Σ(greenFlagImpacts)
   * Borné entre 0 et 100
   */
  calculateLegitimacyScore(text) {
    let score = 75; // Score de base (neutre-positif)
    const redFlags = [];
    const greenFlags = [];

    // Analyse des red flags
    for (const severity of ['critical', 'high', 'medium']) {
      for (const flag of this.PATTERNS.redFlags[severity]) {
        if (flag.pattern.test(text)) {
          score += flag.impact; // impact négatif
          redFlags.push({
            label: flag.label,
            impact: flag.impact,
            severity
          });
        }
      }
    }

    // Analyse des green flags
    for (const level of ['high', 'medium', 'low']) {
      for (const flag of this.PATTERNS.greenFlags[level]) {
        if (flag.pattern.test(text)) {
          score += flag.impact; // impact positif
          greenFlags.push({
            label: flag.label,
            impact: flag.impact,
            level
          });
        }
      }
    }

    // Normalisation entre 0 et 100
    score = Math.max(0, Math.min(100, score));

    return {
      score: Math.round(score),
      redFlags,
      greenFlags,
      hasCriticalFlags: redFlags.some(f => f.severity === 'critical'),
      formula: 'L = 75 + Σ(impacts)',
      details: `Base: 75, RedFlags: ${redFlags.reduce((s, f) => s + f.impact, 0)}, GreenFlags: +${greenFlags.reduce((s, f) => s + f.impact, 0)}`
    };
  },

  // ============================================================================
  // CALCUL DU SCORE D'ALIGNEMENT MARCHÉ (M)
  // ============================================================================

  /**
   * Score Marché: M = f(salaire, bénéfices, localisation)
   * Comparaison avec les références du marché
   */
  calculateMarketScore(jobData, domain, level, location) {
    let score = 50; // Score de base (pas d'info = neutre)
    const warnings = [];
    const details = [];
    let salaryAnalysis = null;

    // Récupération des données de référence
    const marketRef = this.MARKET_DATA.salaryRanges[domain] || this.MARKET_DATA.salaryRanges['default'];
    const levelRef = marketRef[level] || marketRef['confirme'];
    const locationMultiplier = this.MARKET_DATA.locationMultipliers[location] || this.MARKET_DATA.locationMultipliers['default'];

    // Ajustement des références avec le multiplicateur de localisation
    const adjustedMin = levelRef.min * locationMultiplier;
    const adjustedMax = levelRef.max * locationMultiplier;
    const adjustedMedian = levelRef.median * locationMultiplier;

    // Extraction du salaire
    const salaryText = `${jobData.salary || ''} ${jobData.description || ''}`;
    const extractedSalary = this.extractSalary(salaryText);

    if (extractedSalary) {
      salaryAnalysis = {
        offered: extractedSalary,
        market: { min: adjustedMin, max: adjustedMax, median: adjustedMedian }
      };

      const avgOffered = (extractedSalary.min + extractedSalary.max) / 2;

      // Formule: score basé sur la position par rapport à la fourchette marché
      // Score = 50 + 50 * (salaire - médiane) / (max - médiane) pour salaire > médiane
      // Score = 50 - 50 * (médiane - salaire) / (médiane - min) pour salaire < médiane

      if (avgOffered >= adjustedMedian) {
        // Au-dessus ou égal à la médiane
        const ratio = Math.min(1, (avgOffered - adjustedMedian) / (adjustedMax - adjustedMedian));
        score = 50 + 40 * ratio; // Max 90 pour un super salaire

        if (avgOffered > adjustedMax * 1.3) {
          warnings.push("Salaire anormalement élevé - vérifier");
          score -= 20;
        } else if (avgOffered > adjustedMax) {
          details.push(`Salaire attractif (+${Math.round((avgOffered / adjustedMedian - 1) * 100)}%)`);
        }
      } else {
        // En dessous de la médiane
        const ratio = Math.min(1, (adjustedMedian - avgOffered) / (adjustedMedian - adjustedMin));
        score = 50 - 35 * ratio; // Min 15 pour un salaire très bas

        if (avgOffered < adjustedMin * 0.8) {
          warnings.push(`Salaire très en dessous du marché (-${Math.round((1 - avgOffered / adjustedMedian) * 100)}%)`);
        } else if (avgOffered < adjustedMin) {
          warnings.push("Salaire en dessous du marché");
        }
      }

      details.push(`Offre: ${Math.round(extractedSalary.min/1000)}k-${Math.round(extractedSalary.max/1000)}k€ | Marché: ${Math.round(adjustedMin/1000)}k-${Math.round(adjustedMax/1000)}k€`);
    } else {
      details.push("Salaire non précisé");
      score = 40; // Pénalité légère
    }

    // Bonus pour avantages mentionnés
    let benefitsScore = 0;
    if (/mutuelle|complémentaire/i.test(salaryText)) benefitsScore += 5;
    if (/tickets?\s*restaurant/i.test(salaryText)) benefitsScore += 4;
    if (/13(ème|e)\s*mois/i.test(salaryText)) benefitsScore += 6;
    if (/rtt/i.test(salaryText)) benefitsScore += 4;
    if (/participation|intéressement/i.test(salaryText)) benefitsScore += 5;
    if (/télétravail/i.test(salaryText)) benefitsScore += 4;

    score = Math.min(100, score + benefitsScore);

    return {
      score: Math.round(score),
      salaryAnalysis,
      warnings,
      details,
      benefitsScore,
      formula: 'M = f(salaire/médiane) + bonus_avantages'
    };
  },

  // ============================================================================
  // CALCUL DU SCORE DE QUALITÉ (Q)
  // ============================================================================

  /**
   * Score Qualité: Q = Σ(critères de qualité)
   * Évalue la qualité rédactionnelle et informationnelle de l'offre
   */
  calculateQualityScore(jobData, text) {
    let score = 0;
    const warnings = [];
    const details = [];
    const criteria = [];

    // 1. Longueur de la description (max 25 points)
    const descLength = (jobData.description || '').length;
    let descScore = 0;
    if (descLength > 2000) {
      descScore = 25;
      criteria.push({ name: 'Description complète', points: 25 });
    } else if (descLength > 1000) {
      descScore = 20;
      criteria.push({ name: 'Description détaillée', points: 20 });
    } else if (descLength > 500) {
      descScore = 15;
      criteria.push({ name: 'Description correcte', points: 15 });
    } else if (descLength > 200) {
      descScore = 8;
      criteria.push({ name: 'Description courte', points: 8 });
    } else {
      warnings.push("Description très courte");
    }
    score += descScore;

    // 2. Présence du titre et de l'entreprise (max 15 points)
    if (jobData.title && jobData.title.length > 5) {
      score += 8;
      criteria.push({ name: 'Titre précisé', points: 8 });
    }
    if (jobData.company && jobData.company.length > 2) {
      score += 7;
      criteria.push({ name: 'Entreprise identifiée', points: 7 });
    } else {
      warnings.push("Entreprise non identifiée");
    }

    // 3. Présence de sections structurées (max 20 points)
    const sections = {
      'missions': /missions?\s*:/i,
      'profil': /profil\s*(recherché|souhaité)?\s*:/i,
      'compétences': /compétences?\s*(requises?)?\s*:/i,
      'expérience': /expérience\s*(requise|souhaitée)?\s*:/i,
      'formation': /formation\s*(requise|souhaitée)?\s*:/i,
      'avantages': /avantages?\s*:|ce\s*que\s*nous\s*offrons/i,
      'processus': /processus\s*(de\s*)?recrutement/i,
      'entreprise': /à\s*propos\s*(de\s*nous|de\s*l'?entreprise)|qui\s*sommes[\s-]nous/i
    };

    let sectionCount = 0;
    for (const [name, pattern] of Object.entries(sections)) {
      if (pattern.test(text)) {
        sectionCount++;
      }
    }
    const sectionScore = Math.min(20, sectionCount * 4);
    score += sectionScore;
    if (sectionCount > 0) {
      criteria.push({ name: `${sectionCount} sections structurées`, points: sectionScore });
    }

    // 4. Présence d'informations pratiques (max 15 points)
    let practicalScore = 0;
    if (/\d+\s*(€|euros?|k€?)/i.test(text)) {
      practicalScore += 5;
      criteria.push({ name: 'Salaire mentionné', points: 5 });
    }
    if (jobData.location && jobData.location.length > 3) {
      practicalScore += 4;
      criteria.push({ name: 'Localisation précisée', points: 4 });
    }
    if (/cdi|cdd|intérim|freelance|stage|alternance/i.test(text)) {
      practicalScore += 3;
      criteria.push({ name: 'Type de contrat', points: 3 });
    }
    if (/temps\s*(plein|partiel)|full[\s-]?time|part[\s-]?time/i.test(text)) {
      practicalScore += 3;
      criteria.push({ name: 'Temps de travail', points: 3 });
    }
    score += practicalScore;

    // 5. Qualité rédactionnelle (max 15 points)
    let redactScore = 0;

    // Pas d'abus de majuscules
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio < 0.15) {
      redactScore += 5;
    } else if (capsRatio > 0.3) {
      warnings.push("Abus de majuscules");
    }

    // Pas d'abus de ponctuation
    if (!/!!!|\?\?\?|\.\.\.\.+/g.test(text)) {
      redactScore += 5;
    }

    // Présence de listes à puces (structure)
    if (/[-•●○◦]\s*\w+/g.test(text)) {
      redactScore += 5;
      criteria.push({ name: 'Mise en forme structurée', points: 5 });
    }

    score += redactScore;

    // 6. Présence d'éléments de confiance (max 10 points)
    let trustScore = 0;
    if (/linkedin\.com|site\s*(internet|web)|www\./i.test(text)) {
      trustScore += 3;
    }
    if (/siret|siren/i.test(text)) {
      trustScore += 4;
    }
    if (/\d+\s*(collaborateurs?|employés?|salariés?)/i.test(text)) {
      trustScore += 3;
    }
    score += trustScore;
    if (trustScore > 0) {
      criteria.push({ name: 'Éléments de confiance', points: trustScore });
    }

    // Normalisation
    score = Math.min(100, score);

    return {
      score: Math.round(score),
      criteria,
      warnings,
      details: [`Score qualité: ${score}/100`],
      formula: 'Q = desc + structure + infos + rédaction + confiance'
    };
  },

  // ============================================================================
  // CALCUL DU SCORE D'OPPORTUNITÉ (O)
  // ============================================================================

  /**
   * Score Opportunité: O = f(candidats, ancienneté, republication)
   * Évalue les chances de succès de la candidature
   */
  calculateOpportunityScore(siteContext) {
    let score = 70; // Score de base bon
    const details = [];
    const warnings = [];

    // 1. Nombre de candidats (si disponible)
    if (siteContext.applicantCount !== undefined && siteContext.applicantCount !== null) {
      const count = siteContext.applicantCount;

      // Formule: score = 100 - log10(candidats + 1) * 30
      // Donne: 0 candidats = 100, 10 = 70, 100 = 40, 500 = 19
      const applicantScore = Math.max(0, 100 - Math.log10(count + 1) * 35);

      if (count === 0 || count < 5) {
        details.push(`Très peu de candidats (${count}) - Excellente opportunité`);
      } else if (count < 20) {
        details.push(`${count} candidats - Bonne opportunité`);
      } else if (count < 50) {
        details.push(`${count} candidats - Concurrence modérée`);
      } else if (count < 100) {
        details.push(`${count} candidats - Concurrence élevée`);
        warnings.push("Personnalisez votre candidature");
      } else if (count < 300) {
        details.push(`${count}+ candidats - Concurrence très élevée`);
        warnings.push("Chances réduites - personnalisation essentielle");
      } else {
        details.push(`${count}+ candidats - Possible Ghost Job`);
        warnings.push("Trop de candidats - offre peut-être inactive");
      }

      // Pondération: candidats = 50% du score opportunité
      score = score * 0.5 + applicantScore * 0.5;
    }

    // 2. Ancienneté de l'offre
    if (siteContext.postingAgeInDays !== undefined) {
      const days = siteContext.postingAgeInDays;

      // Formule: pénalité progressive
      // 0-7 jours: pas de pénalité
      // 7-21 jours: -1 point par jour
      // 21-42 jours: -2 points par jour
      // >42 jours: -3 points par jour

      let agePenalty = 0;
      if (days <= 7) {
        details.push("Offre récente");
      } else if (days <= 21) {
        agePenalty = (days - 7) * 1;
        details.push(`Offre publiée il y a ${days} jours`);
      } else if (days <= 42) {
        agePenalty = 14 + (days - 21) * 2;
        details.push(`Offre ancienne (${days} jours)`);
        warnings.push("Vérifiez si l'offre est toujours active");
      } else {
        agePenalty = 14 + 42 + (days - 42) * 3;
        details.push(`Offre très ancienne (${days} jours)`);
        warnings.push("Offre probablement pourvue ou inactive");
      }

      score = Math.max(0, score - agePenalty);
    }

    // 3. Offre republiée
    if (siteContext.isReposted) {
      score -= 15;
      details.push("Offre republiée");
      warnings.push("Le poste n'a pas été pourvu précédemment");
    }

    // 4. Réponses gérées en externe
    if (siteContext.externalResponses) {
      score -= 5;
      details.push("Candidatures gérées hors plateforme");
    }

    return {
      score: Math.round(Math.max(0, Math.min(100, score))),
      details,
      warnings,
      formula: 'O = 70 - f(candidats) - f(âge) - bonus_republication'
    };
  },

  // ============================================================================
  // CALCUL DU SCORE DE COHÉRENCE (C)
  // ============================================================================

  /**
   * Score Cohérence: C = 100 - Σ(incohérences)
   * Détecte les contradictions et incohérences dans l'offre
   */
  calculateCoherenceScore(jobData, text, domain, level) {
    let score = 100;
    const warnings = [];
    const details = [];
    const issues = [];

    // 1. Cohérence niveau/expérience requise
    if (level === 'junior' || /junior|débutant|stage/i.test(text)) {
      const expMatch = text.match(/(\d+)\s*(?:ans?|années?)\s*(?:d')?(?:expérience|exp\.?)/i);
      if (expMatch && parseInt(expMatch[1]) >= 5) {
        score -= 25;
        issues.push({
          type: 'level_experience',
          message: `Junior/Débutant demandant ${expMatch[1]} ans d'expérience`,
          impact: -25
        });
      }
    }

    if (level === 'senior' || /senior|expert/i.test(text)) {
      if (/débutant\s*accepté|sans\s*expérience/i.test(text)) {
        score -= 20;
        issues.push({
          type: 'level_experience',
          message: 'Poste senior acceptant les débutants',
          impact: -20
        });
      }
    }

    // 2. Cohérence salaire/niveau
    const salary = this.extractSalary(text);
    if (salary) {
      const avgSalary = (salary.min + salary.max) / 2;
      const marketRef = this.MARKET_DATA.salaryRanges[domain] || this.MARKET_DATA.salaryRanges['default'];
      const levelRef = marketRef[level];

      if (levelRef) {
        if (level === 'senior' && avgSalary < levelRef.min * 0.7) {
          score -= 15;
          issues.push({
            type: 'salary_level',
            message: 'Salaire très bas pour un poste Senior',
            impact: -15
          });
        }
        if (level === 'junior' && avgSalary > levelRef.max * 1.5) {
          score -= 10;
          issues.push({
            type: 'salary_level',
            message: 'Salaire anormalement élevé pour un Junior',
            impact: -10
          });
        }
      }
    }

    // 3. Cohérence télétravail/type de poste
    if (/100\s*%\s*(remote|télétravail|distanciel)/i.test(text)) {
      const physicalRoles = /logistique|manutention|accueil|magasinier|production|chauffeur|livreur|caissier/i;
      if (physicalRoles.test(text)) {
        score -= 25;
        issues.push({
          type: 'remote_physical',
          message: 'Télétravail 100% pour un poste physique',
          impact: -25
        });
      }
    }

    // 4. Cohérence type de contrat
    if (/stage/i.test(text) && /cdi/i.test(text) && !/après\s*(le\s*)?stage|à\s*l'?issue/i.test(text)) {
      score -= 10;
      issues.push({
        type: 'contract',
        message: 'Mélange stage/CDI incohérent',
        impact: -10
      });
    }

    // 5. Cohérence compétences demandées
    const techStack = [];
    const incompatibleStacks = [
      [/react/i, /angular/i, /vue/i],
      [/\.net/i, /java(?!script)/i, /php/i],
      [/oracle/i, /sql\s*server/i, /postgresql/i]
    ];

    for (const stack of incompatibleStacks) {
      const matches = stack.filter(p => p.test(text));
      if (matches.length > 2) {
        score -= 5;
        issues.push({
          type: 'tech_stack',
          message: 'Stack technique trop large/incohérente',
          impact: -5
        });
        break;
      }
    }

    // 6. Nombre de langues exigées
    const languages = text.match(/anglais|espagnol|allemand|italien|chinois|japonais|arabe|portugais|russe/gi);
    if (languages && languages.length > 3) {
      score -= 10;
      issues.push({
        type: 'languages',
        message: `Trop de langues exigées (${languages.length})`,
        impact: -10
      });
    }

    // Résumé
    if (issues.length === 0) {
      details.push("Offre cohérente");
    } else {
      warnings.push(...issues.map(i => i.message));
    }

    return {
      score: Math.round(Math.max(0, score)),
      issues,
      warnings,
      details,
      formula: 'C = 100 - Σ(incohérences)'
    };
  },

  // ============================================================================
  // CLASSIFICATION FINALE
  // ============================================================================

  CLASSIFICATIONS: {
    EXCELLENT: { code: 'EXCELLENT', label: 'Excellente', icon: '🌟', color: '#059669', bgColor: '#d1fae5', minScore: 85 },
    TRES_BONNE: { code: 'TRES_BONNE', label: 'Très bonne', icon: '✅', color: '#16a34a', bgColor: '#dcfce7', minScore: 75 },
    BONNE: { code: 'BONNE', label: 'Bonne', icon: '👍', color: '#65a30d', bgColor: '#ecfccb', minScore: 65 },
    CORRECTE: { code: 'CORRECTE', label: 'Correcte', icon: '📊', color: '#0d9488', bgColor: '#ccfbf1', minScore: 55 },
    PASSABLE: { code: 'PASSABLE', label: 'Passable', icon: '⚡', color: '#ca8a04', bgColor: '#fef9c3', minScore: 45 },
    MEDIOCRE: { code: 'MEDIOCRE', label: 'Médiocre', icon: '⚠️', color: '#d97706', bgColor: '#fef3c7', minScore: 35 },
    MAUVAISE: { code: 'MAUVAISE', label: 'Mauvaise', icon: '👎', color: '#ea580c', bgColor: '#ffedd5', minScore: 25 },
    A_EVITER: { code: 'A_EVITER', label: 'À éviter', icon: '🚫', color: '#dc2626', bgColor: '#fee2e2', minScore: 15 },
    DANGEREUSE: { code: 'DANGEREUSE', label: 'Dangereuse', icon: '🚨', color: '#991b1b', bgColor: '#fecaca', minScore: 0 }
  },

  determineClassification(pertinenceScore, legitimacy, market, quality, opportunity, coherence) {
    // Classification spéciale si drapeaux critiques
    if (legitimacy.hasCriticalFlags) {
      return {
        ...this.CLASSIFICATIONS.DANGEREUSE,
        reason: 'Signaux d\'arnaque détectés'
      };
    }

    // Classification basée sur le score
    for (const [code, classification] of Object.entries(this.CLASSIFICATIONS)) {
      if (pertinenceScore >= classification.minScore) {
        let reason = '';

        // Déterminer la raison principale
        const scores = [
          { name: 'Légitimité', score: legitimacy.score },
          { name: 'Marché', score: market.score },
          { name: 'Qualité', score: quality.score },
          { name: 'Opportunité', score: opportunity.score },
          { name: 'Cohérence', score: coherence.score }
        ];

        const weakest = scores.reduce((a, b) => a.score < b.score ? a : b);
        const strongest = scores.reduce((a, b) => a.score > b.score ? a : b);

        if (pertinenceScore >= 65) {
          reason = `Point fort: ${strongest.name} (${strongest.score}%)`;
        } else {
          reason = `Point faible: ${weakest.name} (${weakest.score}%)`;
        }

        return { ...classification, reason };
      }
    }

    return { ...this.CLASSIFICATIONS.DANGEREUSE, reason: 'Score très bas' };
  },

  // ============================================================================
  // UTILITAIRES
  // ============================================================================

  normalizeText(jobData) {
    return `${jobData.title || ''} ${jobData.company || ''} ${jobData.location || ''} ${jobData.salary || ''} ${jobData.description || ''}`.toLowerCase();
  },

  detectDomain(text) {
    for (const [domain, pattern] of Object.entries(this.PATTERNS.domains)) {
      if (pattern.test(text)) return domain;
    }
    return 'default';
  },

  detectLevel(text) {
    // Ordre de priorité: manager > lead > senior > confirme > junior
    if (this.PATTERNS.levels.manager.test(text)) return 'manager';
    if (this.PATTERNS.levels.lead.test(text)) return 'lead';
    if (this.PATTERNS.levels.senior.test(text)) return 'senior';
    if (this.PATTERNS.levels.junior.test(text)) return 'junior';
    return 'confirme';
  },

  detectLocation(locationText) {
    const text = locationText.toLowerCase();
    for (const [city, multiplier] of Object.entries(this.MARKET_DATA.locationMultipliers)) {
      if (text.includes(city)) return city;
    }
    return 'default';
  },

  extractSalary(text) {
    // Formats supportés:
    // - 45000€ - 55000€
    // - 45K - 55K
    // - 45 000 € - 55 000 €
    // - 45k€ à 55k€

    const patterns = [
      /(\d{2})[.,\s]?(\d{3})\s*[-àa]\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?)/i,
      /(\d{2,3})\s*k\s*€?\s*[-àa]\s*(\d{2,3})\s*k/i,
      /(\d{2,3})\s*000\s*[-àa]\s*(\d{2,3})\s*000/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const numbers = match[0].match(/\d+/g);
        if (numbers && numbers.length >= 2) {
          let min = parseInt(numbers[0]);
          let max = parseInt(numbers[1]);

          // Conversion si en K
          if (min < 200) min *= 1000;
          if (max < 200) max *= 1000;

          return { min, max, average: (min + max) / 2 };
        }
      }
    }

    // Salaire unique
    const singleMatch = text.match(/(\d{2,3})\s*k\s*€?/i);
    if (singleMatch) {
      const salary = parseInt(singleMatch[1]) * 1000;
      return { min: salary * 0.9, max: salary * 1.1, average: salary };
    }

    return null;
  },

  generateRecommendations(classification, legitimacy, market, opportunity) {
    const recommendations = [];

    switch (classification.code) {
      case 'EXCELLENT':
      case 'TRES_BONNE':
        recommendations.push("✅ Excellente opportunité - postulez rapidement");
        if (market.salaryAnalysis && market.score > 70) {
          recommendations.push("💰 Conditions salariales attractives");
        }
        break;

      case 'BONNE':
      case 'CORRECTE':
        recommendations.push("👍 Offre correcte - à considérer");
        if (market.score < 50) {
          recommendations.push("💬 Pensez à négocier le salaire");
        }
        if (opportunity.score < 50) {
          recommendations.push("📝 Personnalisez votre candidature (forte concurrence)");
        }
        break;

      case 'PASSABLE':
      case 'MEDIOCRE':
        recommendations.push("⚠️ Offre à vérifier avant de postuler");
        recommendations.push("🔍 Recherchez des avis sur l'entreprise");
        if (legitimacy.redFlags.length > 0) {
          recommendations.push("🚩 Attention aux points d'alerte détectés");
        }
        break;

      case 'MAUVAISE':
      case 'A_EVITER':
        recommendations.push("⚠️ Offre déconseillée");
        recommendations.push("🔍 Méfiez-vous des conditions proposées");
        if (legitimacy.hasCriticalFlags) {
          recommendations.push("🚫 Signaux d'alerte critiques détectés");
        }
        break;

      case 'DANGEREUSE':
        recommendations.push("🚨 Ne pas postuler - caractéristiques d'arnaque");
        recommendations.push("🚫 Ne jamais fournir d'informations personnelles");
        recommendations.push("📢 Signalez cette offre à la plateforme");
        break;
    }

    return recommendations.slice(0, 4);
  }
};

// Export pour utilisation dans les content scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PertinenceScoreEngine };
}
