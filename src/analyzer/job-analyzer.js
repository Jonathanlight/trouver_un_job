/**
 * Job Analyzer Module
 * Analyse les offres d'emploi et détecte les signaux d'arnaque
 */

export class JobAnalyzer {
  constructor() {
    this.redFlags = {
      // Indicateurs de salaire suspects
      salaryFlags: [
        { pattern: /(\d{4,})\s*[€$£]\s*(par|\/)\s*(jour|day)/i, weight: 30, message: "Salaire journalier anormalement élevé" },
        { pattern: /(\d{5,})\s*[€$£]\s*(par|\/)\s*(semaine|week)/i, weight: 25, message: "Salaire hebdomadaire suspect" },
        { pattern: /gagn(er|ez)\s*facilement/i, weight: 35, message: "Promesse de gains faciles" },
        { pattern: /revenu\s*(passif|illimité)/i, weight: 40, message: "Promesse de revenus passifs/illimités" },
        { pattern: /jusqu'?à\s*\d{4,}\s*[€$£]/i, weight: 15, message: "Fourchette salariale très large" }
      ],

      // Indicateurs de travail à domicile suspects
      remoteFlags: [
        { pattern: /travail(ler)?\s*depuis\s*(chez\s*vous|la\s*maison)/i, weight: 10, message: "Travail à domicile (vérifier légitimité)" },
        { pattern: /100%\s*remote.*imm[ée]diat/i, weight: 20, message: "Remote immédiat sans processus" },
        { pattern: /aucune\s*exp[ée]rience\s*(requise|n[ée]cessaire)/i, weight: 25, message: "Aucune expérience requise pour poste bien payé" }
      ],

      // Indicateurs de processus de recrutement suspect
      processFlags: [
        { pattern: /embauche\s*(imm[ée]diate|garantie)/i, weight: 35, message: "Embauche immédiate/garantie" },
        { pattern: /pas\s*(de|d')\s*(entretien|interview)/i, weight: 40, message: "Pas d'entretien requis" },
        { pattern: /commenc(er|ez)\s*(aujourd'hui|maintenant|demain)/i, weight: 30, message: "Début immédiat sans processus" },
        { pattern: /urgent|urgemment/i, weight: 15, message: "Urgence suspecte" }
      ],

      // Indicateurs de paiement suspect
      paymentFlags: [
        { pattern: /pay(er|ez)\s*(pour|avant)/i, weight: 50, message: "⚠️ ALERTE: Demande de paiement" },
        { pattern: /frais\s*(d'inscription|de\s*formation|administratif)/i, weight: 50, message: "⚠️ ALERTE: Frais demandés" },
        { pattern: /investissement\s*(initial|de\s*d[ée]part)/i, weight: 50, message: "⚠️ ALERTE: Investissement demandé" },
        { pattern: /achet(er|ez)\s*(un\s*kit|du\s*mat[ée]riel)/i, weight: 45, message: "Achat de matériel requis" },
        { pattern: /crypto|bitcoin|nft/i, weight: 35, message: "Mention de crypto/NFT" }
      ],

      // Indicateurs de contact suspect
      contactFlags: [
        { pattern: /@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i, weight: 20, message: "Email non professionnel" },
        { pattern: /whatsapp|telegram|signal/i, weight: 25, message: "Communication via messagerie personnelle" },
        { pattern: /contact(er|ez)?\s*directement/i, weight: 15, message: "Contact direct demandé" }
      ],

      // Indicateurs de contenu vague
      vagueFlags: [
        { pattern: /opportunit[ée]\s*(unique|exceptionnelle|incroyable)/i, weight: 20, message: "Langage marketing excessif" },
        { pattern: /chang(er|ez)\s*(votre|de)\s*vie/i, weight: 25, message: "Promesse de changement de vie" },
        { pattern: /libert[ée]\s*financi[èe]re/i, weight: 30, message: "Promesse de liberté financière" },
        { pattern: /soyez\s*votre\s*(propre\s*)?patron/i, weight: 20, message: "Langage MLM typique" },
        { pattern: /r[ée]seau|parrain(age|er)/i, weight: 35, message: "Structure de parrainage (MLM)" },
        { pattern: /commission|bonus\s*de\s*recrutement/i, weight: 30, message: "Bonus de recrutement (MLM)" }
      ],

      // Indicateurs techniques
      technicalFlags: [
        { pattern: /entreprise\s*confidentielle/i, weight: 25, message: "Entreprise non identifiée" },
        { pattern: /nom\s*de\s*l'entreprise\s*:\s*$/i, weight: 30, message: "Nom d'entreprise manquant" }
      ]
    };

    // Mots-clés positifs (réduisent le score de risque)
    this.greenFlags = [
      { pattern: /cdi|cdd|stage|alternance/i, weight: -5, message: "Type de contrat spécifié" },
      { pattern: /convention\s*collective/i, weight: -10, message: "Convention collective mentionnée" },
      { pattern: /mutuelle|tickets?\s*restaurant/i, weight: -5, message: "Avantages classiques mentionnés" },
      { pattern: /entretien(s)?\s*(t[ée]l[ée]phonique|visio|pr[ée]sentiel)/i, weight: -10, message: "Processus d'entretien décrit" }
    ];
  }

  /**
   * Analyse une offre d'emploi et retourne un score de risque
   * @param {Object} jobData - Les données de l'offre
   * @returns {Object} - Résultat de l'analyse
   */
  analyze(jobData) {
    const { title = '', company = '', description = '', salary = '', location = '' } = jobData;
    const fullText = `${title} ${company} ${description} ${salary} ${location}`.toLowerCase();
    
    let totalScore = 0;
    const detectedFlags = [];
    const positiveFlags = [];

    // Vérifier les red flags
    for (const category of Object.values(this.redFlags)) {
      for (const flag of category) {
        if (flag.pattern.test(fullText)) {
          totalScore += flag.weight;
          detectedFlags.push({
            message: flag.message,
            weight: flag.weight,
            severity: this.getSeverity(flag.weight)
          });
        }
      }
    }

    // Vérifier les green flags
    for (const flag of this.greenFlags) {
      if (flag.pattern.test(fullText)) {
        totalScore += flag.weight;
        positiveFlags.push({
          message: flag.message,
          weight: Math.abs(flag.weight)
        });
      }
    }

    // Vérifications supplémentaires
    const additionalChecks = this.performAdditionalChecks(jobData);
    totalScore += additionalChecks.score;
    detectedFlags.push(...additionalChecks.flags);

    // Normaliser le score (0-100)
    const normalizedScore = Math.min(100, Math.max(0, totalScore));

    return {
      score: normalizedScore,
      riskLevel: this.getRiskLevel(normalizedScore),
      detectedFlags,
      positiveFlags,
      summary: this.generateSummary(normalizedScore, detectedFlags),
      recommendations: this.getRecommendations(normalizedScore, detectedFlags)
    };
  }

  /**
   * Effectue des vérifications supplémentaires
   */
  performAdditionalChecks(jobData) {
    const flags = [];
    let score = 0;

    // Vérifier si le nom de l'entreprise est présent
    if (!jobData.company || jobData.company.trim().length < 2) {
      score += 25;
      flags.push({
        message: "Nom de l'entreprise manquant ou incomplet",
        weight: 25,
        severity: 'medium'
      });
    }

    // Vérifier si la description est trop courte
    if (jobData.description && jobData.description.length < 100) {
      score += 15;
      flags.push({
        message: "Description trop courte ou vague",
        weight: 15,
        severity: 'low'
      });
    }

    // Vérifier le ratio majuscules (spam typique)
    const upperCaseRatio = (jobData.description.match(/[A-Z]/g) || []).length / jobData.description.length;
    if (upperCaseRatio > 0.3) {
      score += 20;
      flags.push({
        message: "Utilisation excessive de majuscules",
        weight: 20,
        severity: 'low'
      });
    }

    // Vérifier les caractères spéciaux excessifs
    const specialCharRatio = (jobData.description.match(/[!$€£💰🔥✨]/g) || []).length / jobData.description.length;
    if (specialCharRatio > 0.05) {
      score += 15;
      flags.push({
        message: "Utilisation excessive d'émojis/symboles",
        weight: 15,
        severity: 'low'
      });
    }

    return { score, flags };
  }

  /**
   * Détermine la sévérité d'un flag
   */
  getSeverity(weight) {
    if (weight >= 40) return 'critical';
    if (weight >= 25) return 'high';
    if (weight >= 15) return 'medium';
    return 'low';
  }

  /**
   * Détermine le niveau de risque global
   */
  getRiskLevel(score) {
    if (score >= 70) return { level: 'critical', label: 'Très suspect', color: '#dc2626' };
    if (score >= 50) return { level: 'high', label: 'Suspect', color: '#ea580c' };
    if (score >= 30) return { level: 'medium', label: 'À vérifier', color: '#ca8a04' };
    if (score >= 15) return { level: 'low', label: 'Prudence', color: '#65a30d' };
    return { level: 'safe', label: 'Semble légitime', color: '#16a34a' };
  }

  /**
   * Génère un résumé de l'analyse
   */
  generateSummary(score, flags) {
    if (score >= 70) {
      return "Cette offre présente de nombreux signaux d'alerte. Il est fortement recommandé de ne pas postuler.";
    }
    if (score >= 50) {
      return "Cette offre présente plusieurs éléments suspects. Effectuez des vérifications approfondies avant de postuler.";
    }
    if (score >= 30) {
      return "Quelques éléments méritent votre attention. Vérifiez la légitimité de l'entreprise.";
    }
    if (score >= 15) {
      return "Offre globalement correcte mais restez vigilant lors du processus de candidature.";
    }
    return "Cette offre semble légitime. Les indicateurs standards sont présents.";
  }

  /**
   * Génère des recommandations
   */
  getRecommendations(score, flags) {
    const recommendations = [];

    if (score >= 30) {
      recommendations.push("Recherchez l'entreprise sur Google et vérifiez son site officiel");
      recommendations.push("Consultez les avis sur Glassdoor ou Indeed");
    }

    if (flags.some(f => f.message.includes('paiement') || f.message.includes('frais'))) {
      recommendations.push("⚠️ Ne versez JAMAIS d'argent pour obtenir un emploi");
    }

    if (flags.some(f => f.message.includes('Email non professionnel'))) {
      recommendations.push("Méfiez-vous des communications via emails personnels");
    }

    if (flags.some(f => f.message.includes('WhatsApp') || f.message.includes('Telegram'))) {
      recommendations.push("Privilégiez les échanges via les canaux officiels de l'entreprise");
    }

    if (score >= 50) {
      recommendations.push("Signalez cette offre à la plateforme si vous la jugez frauduleuse");
    }

    return recommendations;
  }
}

export default JobAnalyzer;
