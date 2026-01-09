/**
 * Advanced Job Analyzer - Système d'évaluation amélioré pour LinkedIn et Indeed
 * Avec classification multi-critères et comparaison marché
 */

// ============================================================================
// DONNÉES DE RÉFÉRENCE MARCHÉ (France - 2024/2025)
// ============================================================================

const MARKET_DATA = {
  // Salaires médians par domaine et niveau d'expérience (annuel brut en EUR)
  salaryRanges: {
    'tech': {
      junior: { min: 32000, max: 42000, median: 37000 },
      confirme: { min: 42000, max: 55000, median: 48000 },
      senior: { min: 55000, max: 75000, median: 65000 },
      lead: { min: 70000, max: 95000, median: 82000 },
      manager: { min: 75000, max: 110000, median: 90000 }
    },
    'marketing': {
      junior: { min: 28000, max: 35000, median: 31000 },
      confirme: { min: 35000, max: 48000, median: 42000 },
      senior: { min: 48000, max: 65000, median: 55000 },
      lead: { min: 60000, max: 80000, median: 70000 },
      manager: { min: 65000, max: 90000, median: 78000 }
    },
    'commercial': {
      junior: { min: 26000, max: 35000, median: 30000 },
      confirme: { min: 35000, max: 50000, median: 42000 },
      senior: { min: 48000, max: 70000, median: 58000 },
      lead: { min: 60000, max: 85000, median: 72000 },
      manager: { min: 70000, max: 100000, median: 85000 }
    },
    'finance': {
      junior: { min: 32000, max: 42000, median: 37000 },
      confirme: { min: 42000, max: 58000, median: 50000 },
      senior: { min: 55000, max: 80000, median: 67000 },
      lead: { min: 75000, max: 100000, median: 87000 },
      manager: { min: 85000, max: 130000, median: 105000 }
    },
    'rh': {
      junior: { min: 28000, max: 35000, median: 31000 },
      confirme: { min: 35000, max: 48000, median: 41000 },
      senior: { min: 45000, max: 62000, median: 53000 },
      lead: { min: 55000, max: 75000, median: 65000 },
      manager: { min: 65000, max: 90000, median: 77000 }
    },
    'logistique': {
      junior: { min: 24000, max: 32000, median: 28000 },
      confirme: { min: 32000, max: 42000, median: 37000 },
      senior: { min: 40000, max: 55000, median: 47000 },
      lead: { min: 50000, max: 70000, median: 60000 },
      manager: { min: 60000, max: 85000, median: 72000 }
    },
    'administratif': {
      junior: { min: 22000, max: 28000, median: 25000 },
      confirme: { min: 28000, max: 38000, median: 33000 },
      senior: { min: 36000, max: 48000, median: 42000 },
      lead: { min: 45000, max: 60000, median: 52000 },
      manager: { min: 52000, max: 72000, median: 62000 }
    },
    'sante': {
      junior: { min: 28000, max: 38000, median: 33000 },
      confirme: { min: 38000, max: 52000, median: 45000 },
      senior: { min: 50000, max: 70000, median: 60000 },
      lead: { min: 65000, max: 90000, median: 77000 },
      manager: { min: 75000, max: 110000, median: 92000 }
    },
    'default': {
      junior: { min: 26000, max: 35000, median: 30000 },
      confirme: { min: 35000, max: 48000, median: 41000 },
      senior: { min: 46000, max: 65000, median: 55000 },
      lead: { min: 58000, max: 80000, median: 68000 },
      manager: { min: 68000, max: 95000, median: 80000 }
    }
  },

  // Durée moyenne de recrutement par secteur (en jours)
  recruitmentDuration: {
    'tech': { min: 14, avg: 35, max: 60 },
    'marketing': { min: 14, avg: 30, max: 50 },
    'commercial': { min: 7, avg: 25, max: 45 },
    'finance': { min: 21, avg: 40, max: 70 },
    'default': { min: 14, avg: 30, max: 55 }
  },

  // Nombre moyen de candidats par offre
  avgApplicants: {
    'tech': { low: 20, normal: 80, high: 200 },
    'marketing': { low: 30, normal: 120, high: 350 },
    'commercial': { low: 25, normal: 100, high: 300 },
    'default': { low: 25, normal: 100, high: 280 }
  },

  // Taux de remote par secteur (%)
  remoteRates: {
    'tech': 75,
    'marketing': 60,
    'commercial': 35,
    'finance': 50,
    'rh': 45,
    'administratif': 30,
    'logistique': 10,
    'default': 40
  }
};

// ============================================================================
// CLASSIFICATION DES OFFRES
// ============================================================================

const JOB_CLASSIFICATIONS = {
  LEGITIME: {
    code: 'LEGITIME',
    label: 'Légitime',
    description: 'Offre professionnelle et cohérente avec le marché',
    color: '#16a34a',
    bgColor: '#dcfce7',
    icon: '✅',
    scoreRange: [0, 15]
  },
  PROFESSIONNELLE: {
    code: 'PROFESSIONNELLE',
    label: 'Professionnelle',
    description: 'Offre bien structurée, entreprise identifiable',
    color: '#059669',
    bgColor: '#d1fae5',
    icon: '💼',
    scoreRange: [0, 20]
  },
  ADAPTEE_MARCHE: {
    code: 'ADAPTEE_MARCHE',
    label: 'Adaptée au marché',
    description: 'Conditions alignées avec les standards du secteur',
    color: '#0d9488',
    bgColor: '#ccfbf1',
    icon: '📊',
    scoreRange: [0, 25]
  },
  PASSABLE: {
    code: 'PASSABLE',
    label: 'Passable',
    description: 'Quelques éléments manquants mais acceptable',
    color: '#ca8a04',
    bgColor: '#fef9c3',
    icon: '⚡',
    scoreRange: [20, 40]
  },
  SOUS_EVALUEE: {
    code: 'SOUS_EVALUEE',
    label: 'Sous-évaluée',
    description: 'Salaire ou conditions en dessous du marché',
    color: '#d97706',
    bgColor: '#fef3c7',
    icon: '📉',
    scoreRange: [15, 35]
  },
  INCOHERENTE: {
    code: 'INCOHERENTE',
    label: 'Incohérente',
    description: 'Contradictions ou informations incohérentes détectées',
    color: '#ea580c',
    bgColor: '#ffedd5',
    icon: '🔀',
    scoreRange: [35, 55]
  },
  A_VERIFIER: {
    code: 'A_VERIFIER',
    label: 'À vérifier',
    description: 'Éléments suspects nécessitant une vérification',
    color: '#dc2626',
    bgColor: '#fee2e2',
    icon: '🔍',
    scoreRange: [40, 60]
  },
  GHOST_JOB: {
    code: 'GHOST_JOB',
    label: 'Ghost Job probable',
    description: 'Offre probablement inactive ou pour affichage',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    icon: '👻',
    scoreRange: [45, 70]
  },
  FAUSSE_OFFRE: {
    code: 'FAUSSE_OFFRE',
    label: 'Fausse offre',
    description: 'Offre fictive pour collecte de données ou autre',
    color: '#be185d',
    bgColor: '#fce7f3',
    icon: '🎭',
    scoreRange: [55, 80]
  },
  A_FUIR: {
    code: 'A_FUIR',
    label: 'À fuir',
    description: 'Multiples signaux d\'alerte graves détectés',
    color: '#dc2626',
    bgColor: '#fee2e2',
    icon: '🚫',
    scoreRange: [60, 85]
  },
  ARNAQUE: {
    code: 'ARNAQUE',
    label: 'Arnaque',
    description: 'Caractéristiques typiques d\'une escroquerie',
    color: '#991b1b',
    bgColor: '#fecaca',
    icon: '🚨',
    scoreRange: [70, 100]
  }
};

// ============================================================================
// CRITÈRES D'ÉVALUATION ÉTENDUS
// ============================================================================

const EXTENDED_RED_FLAGS = {
  // Signaux financiers critiques
  financial_scam: [
    { pattern: /paiement\s*(requis|nécessaire|obligatoire|avant)/i, weight: 55, message: "Paiement requis avant embauche", severity: 'critical' },
    { pattern: /frais\s*(de\s*)?(inscription|formation|dossier|administratif)/i, weight: 55, message: "Frais demandés", severity: 'critical' },
    { pattern: /investissement\s*(initial|de\s*départ|personnel)/i, weight: 55, message: "Investissement initial demandé", severity: 'critical' },
    { pattern: /acheter?\s*(le\s*)?(kit|matériel|stock|produits?)/i, weight: 50, message: "Achat de matériel obligatoire", severity: 'critical' },
    { pattern: /avancer?\s*(de\s*l'?)?argent/i, weight: 55, message: "Avance d'argent demandée", severity: 'critical' },
    { pattern: /virement\s*(bancaire)?\s*(pour|avant)/i, weight: 50, message: "Virement demandé avant emploi", severity: 'critical' },
    { pattern: /carte\s*(bancaire|de\s*crédit)\s*(nécessaire|requise)/i, weight: 50, message: "Carte bancaire demandée", severity: 'critical' },
    { pattern: /crypto|bitcoin|ethereum|nft|web3\s*job/i, weight: 40, message: "Mention crypto/NFT suspecte", severity: 'high' },
    { pattern: /minage|mining\s*(de\s*)?(crypto|bitcoin)/i, weight: 45, message: "Activité de minage suspecte", severity: 'critical' }
  ],

  // Promesses irréalistes
  unrealistic_promises: [
    { pattern: /gagn(er|ez)\s*(jusqu'?à\s*)?\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, weight: 45, message: "Promesse de gains irréalistes", severity: 'critical' },
    { pattern: /revenu\s*(passif|illimité|garanti)/i, weight: 45, message: "Revenu passif/illimité promis", severity: 'critical' },
    { pattern: /indépendance\s*financière/i, weight: 35, message: "Promesse d'indépendance financière", severity: 'high' },
    { pattern: /devenez?\s*(riche|millionnaire)/i, weight: 50, message: "Promesse d'enrichissement rapide", severity: 'critical' },
    { pattern: /liberté\s*financière/i, weight: 35, message: "Promesse de liberté financière", severity: 'high' },
    { pattern: /sans\s*(effort|travail|compétence)/i, weight: 40, message: "Promesse sans effort", severity: 'critical' },
    { pattern: /argent\s*facile/i, weight: 50, message: "Argent facile promis", severity: 'critical' },
    { pattern: /résultats?\s*garantis?/i, weight: 35, message: "Résultats garantis", severity: 'high' },
    { pattern: /\d{3,}\s*€?\s*(par|\/)\s*heure/i, weight: 40, message: "Taux horaire irréaliste", severity: 'critical' }
  ],

  // Processus de recrutement anormal
  abnormal_process: [
    { pattern: /embauche\s*(immédiate|garantie|sans\s*entretien)/i, weight: 40, message: "Embauche sans processus normal", severity: 'high' },
    { pattern: /pas\s*(d'?|de\s*)entretien/i, weight: 45, message: "Pas d'entretien requis", severity: 'critical' },
    { pattern: /commenc(er|ez)\s*(immédiatement|aujourd'?hui|demain|maintenant)/i, weight: 35, message: "Démarrage immédiat suspect", severity: 'high' },
    { pattern: /urgent\s*!|!!!|recrutement\s*urgent/i, weight: 25, message: "Urgence excessive", severity: 'medium' },
    { pattern: /places?\s*limitées?/i, weight: 30, message: "Fausse rareté", severity: 'high' },
    { pattern: /dernière\s*chance/i, weight: 30, message: "Pression temporelle", severity: 'high' },
    { pattern: /ne\s*ratez\s*pas/i, weight: 20, message: "Langage marketing agressif", severity: 'medium' },
    { pattern: /offre\s*exceptionnelle/i, weight: 25, message: "Offre trop belle", severity: 'medium' },
    { pattern: /sélection\s*(en\s*cours|rapide)/i, weight: 15, message: "Processus trop rapide", severity: 'low' }
  ],

  // MLM et réseaux pyramidaux
  mlm_network: [
    { pattern: /parrain(age|er)|filleul/i, weight: 45, message: "Structure de parrainage MLM", severity: 'critical' },
    { pattern: /réseau\s*(de\s*)?(vente|distribution|partenaires)/i, weight: 40, message: "Structure réseau MLM", severity: 'high' },
    { pattern: /commission\s*(sur|de)\s*recrutement/i, weight: 45, message: "Commission de recrutement", severity: 'critical' },
    { pattern: /recrut(er|ez)\s*(votre|des)\s*(équipe|réseau)/i, weight: 40, message: "Recrutement d'équipe requis", severity: 'critical' },
    { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, weight: 45, message: "Marketing de réseau/MLM", severity: 'critical' },
    { pattern: /vente\s*(directe|à\s*domicile)\s*indépendant/i, weight: 30, message: "Vente directe MLM potentiel", severity: 'high' },
    { pattern: /développ(er|ez)\s*votre\s*(réseau|équipe|organisation)/i, weight: 35, message: "Développement de réseau", severity: 'high' },
    { pattern: /downline|upline/i, weight: 50, message: "Terminologie MLM détectée", severity: 'critical' },
    { pattern: /plan\s*de\s*compensation/i, weight: 40, message: "Plan de compensation MLM", severity: 'critical' }
  ],

  // Contact non professionnel
  unprofessional_contact: [
    { pattern: /@(gmail|yahoo|hotmail|outlook|live|aol)\.(com|fr)/i, weight: 25, message: "Email non professionnel", severity: 'medium' },
    { pattern: /whatsapp|telegram|signal\s*(uniquement|seulement|pour\s*postuler)/i, weight: 35, message: "Contact via messagerie uniquement", severity: 'high' },
    { pattern: /envoy(er|ez)\s*(votre\s*)?(cv|candidature)\s*(par|via|sur)\s*(whatsapp|telegram)/i, weight: 40, message: "CV via messagerie non professionnelle", severity: 'high' },
    { pattern: /contact(er|ez)?\s*:?\s*\+?\d{10,}/i, weight: 20, message: "Numéro de téléphone direct sans entreprise", severity: 'medium' },
    { pattern: /ajoute[zr]?\s*(moi|nous)\s*(sur|via)/i, weight: 25, message: "Demande d'ajout sur réseau social", severity: 'medium' }
  ],

  // Manque de professionnalisme
  lack_professionalism: [
    { pattern: /entreprise\s*(confidentielle|anonyme|non\s*divulguée)/i, weight: 30, message: "Entreprise non identifiée", severity: 'high' },
    { pattern: /nom\s*(de\s*l'?)?entreprise\s*:\s*(confidentiel|à\s*définir|\?)/i, weight: 35, message: "Nom d'entreprise caché", severity: 'high' },
    { pattern: /!!+|€€+|\$\$+/i, weight: 20, message: "Ponctuation excessive", severity: 'medium' },
    { pattern: /[A-Z]{10,}/i, weight: 15, message: "Usage excessif de majuscules", severity: 'low' },
    { pattern: /🔥{2,}|💰{2,}|🤑{2,}|💸{2,}/i, weight: 25, message: "Emojis excessifs (argent)", severity: 'medium' },
    { pattern: /travail\s*(facile|simple|tranquille)/i, weight: 25, message: "Travail décrit comme trop facile", severity: 'medium' }
  ],

  // Incohérences LinkedIn/Indeed spécifiques
  platform_specific: [
    { pattern: /\+\s*de\s*500\s*candidatures?/i, weight: 30, message: "Nombre excessif de candidatures (Ghost Job?)", severity: 'high', platform: 'linkedin' },
    { pattern: /junior.{0,30}(10|15|20)\+?\s*ans?\s*(d'?)?exp/i, weight: 35, message: "Incohérence niveau/expérience", severity: 'high' },
    { pattern: /senior.{0,30}(0|1|2)\s*ans?\s*(d'?)?exp/i, weight: 30, message: "Senior avec peu d'expérience requise", severity: 'medium' },
    { pattern: /débutant.{0,30}(expert|confirmé|senior)/i, weight: 35, message: "Contradiction niveau d'expérience", severity: 'high' },
    { pattern: /stage.{0,50}(cdi|cdd)|cdi.{0,50}stage/i, weight: 30, message: "Type de contrat contradictoire", severity: 'high' },
    { pattern: /temps\s*partiel.{0,30}temps\s*plein/i, weight: 25, message: "Durée de travail contradictoire", severity: 'medium' }
  ],

  // Indicateurs de Ghost Job
  ghost_job_indicators: [
    { pattern: /publié(e)?\s*(il\s*y\s*a|depuis)\s*(plus\s*de\s*)?(3|4|5|6)\s*mois/i, weight: 35, message: "Offre publiée depuis longtemps", severity: 'high' },
    { pattern: /republication|re-?publication/i, weight: 25, message: "Offre republiée", severity: 'medium' },
    { pattern: /toujours\s*(à\s*la\s*)?recherche/i, weight: 20, message: "Recherche prolongée suspecte", severity: 'medium' },
    { pattern: /vivier\s*(de\s*)?(candidats?|talents?)/i, weight: 35, message: "Constitution de vivier (pas de poste réel)", severity: 'high' },
    { pattern: /pour\s*(nos\s*)?futurs?\s*(besoins?|projets?)/i, weight: 30, message: "Pas de besoin immédiat", severity: 'high' },
    { pattern: /candidatures?\s*spontanées?/i, weight: 20, message: "Candidature spontanée déguisée", severity: 'medium' }
  ],

  // Fausse offre / collecte de données
  data_harvesting: [
    { pattern: /formulaire\s*(complet|détaillé)\s*(obligatoire|requis)/i, weight: 30, message: "Formulaire excessif requis", severity: 'high' },
    { pattern: /numéro\s*(de\s*)?(sécurité\s*sociale|sécu)/i, weight: 45, message: "Numéro de sécu demandé", severity: 'critical' },
    { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|carte\s*d'?identité|passeport)/i, weight: 40, message: "Pièce d'identité demandée", severity: 'critical' },
    { pattern: /rib|relevé\s*(d'?)?identité\s*bancaire/i, weight: 40, message: "RIB demandé avant embauche", severity: 'critical' },
    { pattern: /photo\s*(obligatoire|requise|nécessaire)/i, weight: 20, message: "Photo obligatoire", severity: 'medium' },
    { pattern: /test\s*(de\s*)?personnalité\s*(payant|obligatoire)/i, weight: 35, message: "Test payant ou excessif", severity: 'high' }
  ],

  // Télétravail suspect
  suspicious_remote: [
    { pattern: /100\s*%\s*remote.{0,30}(sans\s*expérience|débutant)/i, weight: 30, message: "Remote 100% pour débutant suspect", severity: 'high' },
    { pattern: /travail(ler)?\s*(à\s*)?domicile.{0,30}(sans|aucune)\s*compétence/i, weight: 35, message: "Télétravail sans compétence requise", severity: 'high' },
    { pattern: /home\s*office.{0,30}gagn(er|ez)/i, weight: 30, message: "Promesse de gains en télétravail", severity: 'high' },
    { pattern: /depuis\s*(chez\s*)?vous.{0,30}(€|euros?|dollars?)/i, weight: 25, message: "Gains promis depuis domicile", severity: 'medium' }
  ]
};

// ============================================================================
// SIGNAUX POSITIFS ÉTENDUS
// ============================================================================

const EXTENDED_GREEN_FLAGS = {
  // Éléments contractuels solides
  contract_quality: [
    { pattern: /cdi\s*(temps\s*plein|35h|39h)/i, weight: -12, message: "CDI temps plein précisé" },
    { pattern: /convention\s*collective\s*(syntec|métallurgie|banque|commerce)/i, weight: -15, message: "Convention collective précisée" },
    { pattern: /coefficient\s*\d+|position\s*(cadre|non[\s-]?cadre)/i, weight: -10, message: "Coefficient/statut précisé" },
    { pattern: /période\s*d'?essai\s*(\d+\s*mois|renouvelable)/i, weight: -8, message: "Période d'essai détaillée" },
    { pattern: /préavis\s*(\d+\s*(mois|semaines))/i, weight: -5, message: "Préavis mentionné" }
  ],

  // Avantages sociaux réels
  real_benefits: [
    { pattern: /mutuelle\s*(entreprise|famille|100\s*%)/i, weight: -10, message: "Mutuelle précisée" },
    { pattern: /tickets?\s*restaurant|carte\s*resto/i, weight: -8, message: "Tickets restaurant" },
    { pattern: /participation|intéressement/i, weight: -10, message: "Participation/intéressement" },
    { pattern: /plan\s*d'?épargne\s*(entreprise|retraite)|pee|perco/i, weight: -10, message: "Épargne entreprise" },
    { pattern: /rtt\s*\d+\s*jours|jours?\s*de\s*rtt/i, weight: -8, message: "RTT précisés" },
    { pattern: /13(ème|e)\s*mois/i, weight: -10, message: "13ème mois" },
    { pattern: /prime\s*(de\s*)?(vacances|ancienneté|performance)/i, weight: -8, message: "Primes détaillées" },
    { pattern: /chèques?\s*(vacances|cadeaux|cesu)/i, weight: -6, message: "Chèques entreprise" },
    { pattern: /transport\s*(pris\s*en\s*charge|remboursé)/i, weight: -5, message: "Transport remboursé" },
    { pattern: /télétravail\s*(\d+\s*jours?|partiel|hybride)/i, weight: -8, message: "Télétravail cadré" }
  ],

  // Processus de recrutement professionnel
  professional_process: [
    { pattern: /processus\s*(de\s*)?recrutement\s*:\s*.{20,}/i, weight: -12, message: "Processus détaillé" },
    { pattern: /entretien(s)?\s*(avec|rh|technique|manager)/i, weight: -10, message: "Entretiens structurés" },
    { pattern: /test\s*technique|cas\s*pratique/i, weight: -8, message: "Évaluation technique" },
    { pattern: /prise\s*de\s*référence/i, weight: -8, message: "Références vérifiées" },
    { pattern: /délai\s*de\s*réponse|retour\s*(sous|dans)\s*\d+/i, weight: -6, message: "Délais communiqués" }
  ],

  // Entreprise identifiable
  company_legitimacy: [
    { pattern: /créée?\s*en\s*\d{4}|depuis\s*\d{4}/i, weight: -8, message: "Ancienneté entreprise" },
    { pattern: /\d+\s*(collaborateurs?|salariés?|employés?)/i, weight: -8, message: "Taille entreprise précisée" },
    { pattern: /siège\s*(social)?\s*(à|:)/i, weight: -6, message: "Siège social mentionné" },
    { pattern: /filiale\s*(de|du\s*groupe)|groupe\s+[A-Z]/i, weight: -8, message: "Groupe identifié" },
    { pattern: /coté(e)?\s*(en\s*)?bourse|cac\s*40|sbf/i, weight: -10, message: "Entreprise cotée" },
    { pattern: /certifié(e)?\s*(iso|bcorp|great\s*place)/i, weight: -8, message: "Certification qualité" },
    { pattern: /n°\s*siret|siret\s*:\s*\d/i, weight: -10, message: "SIRET mentionné" }
  ],

  // Description de poste détaillée
  detailed_job_description: [
    { pattern: /missions?\s*(principales?)?\s*:\s*[\s\S]{100,}/i, weight: -10, message: "Missions détaillées" },
    { pattern: /profil\s*recherché\s*:\s*[\s\S]{50,}/i, weight: -8, message: "Profil précisé" },
    { pattern: /compétences?\s*(requises?|techniques?)\s*:\s*[\s\S]{50,}/i, weight: -8, message: "Compétences listées" },
    { pattern: /environnement\s*(technique|technologique)\s*:/i, weight: -8, message: "Stack technique détaillée" },
    { pattern: /formation\s*(souhaitée|requise|bac\s*\+)/i, weight: -6, message: "Formation précisée" },
    { pattern: /rattaché(e)?\s*(au|à\s*la)\s*(directeur|responsable|manager)/i, weight: -6, message: "Hiérarchie claire" },
    { pattern: /équipe\s*(de\s*)?\d+\s*(personnes|développeurs|collaborateurs)/i, weight: -6, message: "Taille équipe précisée" }
  ],

  // Salaire transparent
  salary_transparency: [
    { pattern: /\d{2}[\s,.]?\d{3}\s*[-àa]\s*\d{2}[\s,.]?\d{3}\s*(€|euros?)/i, weight: -12, message: "Fourchette salariale précise" },
    { pattern: /salaire\s*(brut\s*)?annuel\s*:\s*\d/i, weight: -10, message: "Salaire annuel précisé" },
    { pattern: /selon\s*(profil|expérience)\s*:\s*\d/i, weight: -8, message: "Salaire selon profil avec indication" },
    { pattern: /package\s*(global|de\s*rémunération)\s*:/i, weight: -8, message: "Package global détaillé" }
  ]
};

// ============================================================================
// ANALYSEUR AVANCÉ
// ============================================================================

class AdvancedJobAnalyzer {
  constructor(platform = 'generic') {
    this.platform = platform;
    this.marketData = MARKET_DATA;
    this.classifications = JOB_CLASSIFICATIONS;
  }

  /**
   * Analyse complète d'une offre d'emploi
   */
  analyze(jobData) {
    const {
      title = '',
      company = '',
      location = '',
      salary = '',
      description = '',
      applicants = null,
      postedDate = '',
      contractType = '',
      experienceLevel = ''
    } = jobData;

    const fullText = `${title} ${company} ${location} ${salary} ${description}`.toLowerCase();

    // Détection du domaine
    const domain = this.detectDomain(title, description);
    const level = this.detectLevel(title, description, experienceLevel);

    // Analyse des signaux
    const redFlagAnalysis = this.analyzeRedFlags(fullText, jobData);
    const greenFlagAnalysis = this.analyzeGreenFlags(fullText, jobData);
    const marketComparison = this.compareToMarket(jobData, domain, level);
    const coherenceAnalysis = this.analyzeCoherence(jobData, domain, level);

    // Calcul du score
    let baseScore = redFlagAnalysis.totalWeight + greenFlagAnalysis.totalWeight;
    baseScore += marketComparison.scoreAdjustment;
    baseScore += coherenceAnalysis.scoreAdjustment;

    // Ajustements spécifiques à la plateforme
    if (this.platform === 'linkedin' && applicants) {
      baseScore += this.analyzeLinkedInApplicants(applicants);
    }

    // Normalisation
    const normalizedScore = Math.min(100, Math.max(0, baseScore));

    // Détermination des classifications
    const classifications = this.determineClassifications(
      normalizedScore,
      redFlagAnalysis,
      greenFlagAnalysis,
      marketComparison,
      coherenceAnalysis
    );

    // Génération du rapport
    return {
      score: normalizedScore,
      classifications,
      primaryClassification: classifications[0],
      domain,
      level,
      redFlags: redFlagAnalysis.flags,
      greenFlags: greenFlagAnalysis.flags,
      marketComparison,
      coherenceIssues: coherenceAnalysis.issues,
      summary: this.generateSummary(normalizedScore, classifications, redFlagAnalysis, marketComparison),
      recommendations: this.generateRecommendations(classifications, redFlagAnalysis, marketComparison),
      detailedReport: this.generateDetailedReport(jobData, {
        score: normalizedScore,
        classifications,
        domain,
        level,
        redFlagAnalysis,
        greenFlagAnalysis,
        marketComparison,
        coherenceAnalysis
      })
    };
  }

  /**
   * Détection du domaine métier
   */
  detectDomain(title, description) {
    const text = `${title} ${description}`.toLowerCase();

    const domainPatterns = {
      'tech': /développ|developer|devops|data\s*scientist|software|engineer|fullstack|backend|frontend|cloud|sre|sécurité\s*informatique|cybersécurité|ia|machine\s*learning|architect/i,
      'marketing': /marketing|communication|community\s*manager|seo|sea|growth|content|brand|digital|acquisition|crm/i,
      'commercial': /commercial|vente|sales|account\s*manager|business\s*develop|key\s*account|technico-commercial|négociateur/i,
      'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk|analyst|trading|banque/i,
      'rh': /ressources\s*humaines|rh|recrutement|talent|paie|formation|sirh|people|drh/i,
      'logistique': /logistique|supply\s*chain|approvisionnement|transport|magasinier|préparateur|cariste/i,
      'administratif': /assistant|secrétaire|administratif|accueil|office\s*manager|gestionnaire/i,
      'sante': /santé|médecin|infirmier|pharmacien|aide-soignant|kiné|médical|hospitalier/i
    };

    for (const [domain, pattern] of Object.entries(domainPatterns)) {
      if (pattern.test(text)) return domain;
    }
    return 'default';
  }

  /**
   * Détection du niveau d'expérience
   */
  detectLevel(title, description, explicitLevel) {
    const text = `${title} ${description} ${explicitLevel}`.toLowerCase();

    if (/stage|stagiaire|intern/i.test(text)) return 'junior';
    if (/alternance|apprenti/i.test(text)) return 'junior';
    if (/junior|débutant|0-2\s*ans?/i.test(text)) return 'junior';
    if (/confirmé|intermédiaire|3-5\s*ans?/i.test(text)) return 'confirme';
    if (/senior|expérimenté|5\+?\s*ans?|expert/i.test(text)) return 'senior';
    if (/lead|principal|staff/i.test(text)) return 'lead';
    if (/manager|directeur|head\s*of|responsable/i.test(text)) return 'manager';

    return 'confirme'; // Par défaut
  }

  /**
   * Analyse des signaux d'alerte
   */
  analyzeRedFlags(fullText, jobData) {
    const flags = [];
    let totalWeight = 0;

    for (const [category, patterns] of Object.entries(EXTENDED_RED_FLAGS)) {
      for (const flag of patterns) {
        // Vérifier si c'est spécifique à une plateforme
        if (flag.platform && flag.platform !== this.platform) continue;

        if (flag.pattern.test(fullText)) {
          flags.push({
            category,
            message: flag.message,
            weight: flag.weight,
            severity: flag.severity
          });
          totalWeight += flag.weight;
        }
      }
    }

    // Vérifications structurelles additionnelles
    if (!jobData.company || jobData.company.length < 2) {
      flags.push({ category: 'structure', message: "Nom d'entreprise manquant", weight: 30, severity: 'high' });
      totalWeight += 30;
    }

    if (jobData.description && jobData.description.length < 100) {
      flags.push({ category: 'structure', message: "Description très courte", weight: 20, severity: 'medium' });
      totalWeight += 20;
    }

    // Vérifier ratio majuscules
    const upperRatio = (fullText.match(/[A-Z]/g) || []).length / fullText.length;
    if (upperRatio > 0.3) {
      flags.push({ category: 'style', message: "Usage excessif de majuscules", weight: 15, severity: 'low' });
      totalWeight += 15;
    }

    return { flags, totalWeight };
  }

  /**
   * Analyse des signaux positifs
   */
  analyzeGreenFlags(fullText, jobData) {
    const flags = [];
    let totalWeight = 0;

    for (const [category, patterns] of Object.entries(EXTENDED_GREEN_FLAGS)) {
      for (const flag of patterns) {
        if (flag.pattern.test(fullText)) {
          flags.push({
            category,
            message: flag.message,
            weight: Math.abs(flag.weight)
          });
          totalWeight += flag.weight; // Négatif pour réduire le score
        }
      }
    }

    return { flags, totalWeight };
  }

  /**
   * Comparaison avec les données marché
   */
  compareToMarket(jobData, domain, level) {
    const result = {
      salaryAnalysis: null,
      marketPosition: 'unknown',
      scoreAdjustment: 0,
      details: []
    };

    // Extraire le salaire
    const salaryInfo = this.extractSalary(jobData.salary || jobData.description);
    if (!salaryInfo) {
      result.details.push("Salaire non précisé - impossible de comparer");
      return result;
    }

    const marketRange = this.marketData.salaryRanges[domain]?.[level] ||
                        this.marketData.salaryRanges['default'][level];

    result.salaryAnalysis = {
      extracted: salaryInfo,
      marketRange,
      domain,
      level
    };

    // Analyse de la position
    if (salaryInfo.annual) {
      const annualSalary = salaryInfo.annual;

      if (annualSalary < marketRange.min * 0.7) {
        result.marketPosition = 'tres_sous_evalue';
        result.scoreAdjustment = 20;
        result.details.push(`Salaire très en dessous du marché (${annualSalary}€ vs ${marketRange.min}-${marketRange.max}€)`);
      } else if (annualSalary < marketRange.min) {
        result.marketPosition = 'sous_evalue';
        result.scoreAdjustment = 10;
        result.details.push(`Salaire légèrement sous le marché`);
      } else if (annualSalary > marketRange.max * 1.5) {
        result.marketPosition = 'suspect_trop_eleve';
        result.scoreAdjustment = 25;
        result.details.push(`Salaire anormalement élevé - vérifier la légitimité`);
      } else if (annualSalary > marketRange.max * 1.2) {
        result.marketPosition = 'au_dessus_marche';
        result.scoreAdjustment = -5;
        result.details.push(`Salaire attractif, au-dessus du marché`);
      } else {
        result.marketPosition = 'conforme';
        result.scoreAdjustment = -10;
        result.details.push(`Salaire conforme au marché`);
      }
    }

    return result;
  }

  /**
   * Extraction du salaire depuis le texte
   */
  extractSalary(text) {
    if (!text) return null;

    // Patterns pour salaire annuel
    const annualPatterns = [
      /(\d{2})[.,\s]?(\d{3})\s*[-àa]\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?|k€?)/i,
      /(\d{2,3})\s*k\s*[-àa]\s*(\d{2,3})\s*k/i,
      /salaire\s*:?\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?)/i,
      /(\d{2})[.,\s]?(\d{3})\s*(€|euros?)\s*(brut|annuel)/i
    ];

    for (const pattern of annualPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Extraire les valeurs numériques
        const numbers = match[0].match(/\d+/g);
        if (numbers && numbers.length >= 1) {
          let value = parseInt(numbers[0]);
          // Si c'est en k€
          if (/k/i.test(match[0]) && value < 200) {
            value *= 1000;
          }
          // Si c'est un montant < 200, c'est probablement en k€
          if (value < 200) {
            value *= 1000;
          }
          return { annual: value, raw: match[0] };
        }
      }
    }

    // Pattern mensuel
    const monthlyMatch = text.match(/(\d{1,2})[.,\s]?(\d{3})\s*(€|euros?)\s*(\/\s*mois|mensuel|par\s*mois)/i);
    if (monthlyMatch) {
      const monthly = parseInt(monthlyMatch[1] + monthlyMatch[2]);
      return { annual: monthly * 12, monthly, raw: monthlyMatch[0] };
    }

    return null;
  }

  /**
   * Analyse de la cohérence de l'offre
   */
  analyzeCoherence(jobData, domain, level) {
    const issues = [];
    let scoreAdjustment = 0;
    const text = `${jobData.title} ${jobData.description}`.toLowerCase();

    // Vérifier cohérence niveau/expérience
    if (/junior|débutant/i.test(text) && /\b(10|15|20)\+?\s*ans?\s*(d')?exp/i.test(text)) {
      issues.push("Incohérence: poste junior demandant beaucoup d'expérience");
      scoreAdjustment += 25;
    }

    if (/senior|lead|principal/i.test(text) && /sans\s*expérience|débutant\s*accepté/i.test(text)) {
      issues.push("Incohérence: poste senior acceptant les débutants");
      scoreAdjustment += 20;
    }

    // Vérifier cohérence contrat
    if (/stage/i.test(text) && /cdi/i.test(text) && !/puis\s*cdi|suivi\s*(d'un\s*)?cdi/i.test(text)) {
      issues.push("Incohérence: stage et CDI mentionnés sans transition");
      scoreAdjustment += 15;
    }

    // Vérifier cohérence télétravail/domaine
    if (/100\s*%\s*(remote|télétravail)/i.test(text)) {
      const remoteRate = this.marketData.remoteRates[domain] || this.marketData.remoteRates['default'];
      if (remoteRate < 20) {
        issues.push(`100% télétravail inhabituel pour le domaine ${domain}`);
        scoreAdjustment += 15;
      }
    }

    // Vérifier cohérence salaire/responsabilités
    const salaryInfo = this.extractSalary(jobData.salary || jobData.description);
    if (salaryInfo && level === 'manager' && salaryInfo.annual < 40000) {
      issues.push("Salaire très bas pour un poste de management");
      scoreAdjustment += 20;
    }

    // Vérifier les compétences contradictoires
    if (/débutant|sans\s*expérience/i.test(text) && /expert|maîtrise\s*parfaite|confirmé\s*en/i.test(text)) {
      issues.push("Contradiction entre niveau débutant et compétences experts demandées");
      scoreAdjustment += 20;
    }

    return { issues, scoreAdjustment };
  }

  /**
   * Analyse spécifique LinkedIn (nombre de candidats)
   */
  analyzeLinkedInApplicants(applicants) {
    if (applicants > 500) {
      return 30; // Ghost job très probable
    } else if (applicants > 300) {
      return 20;
    } else if (applicants > 150) {
      return 10;
    } else if (applicants < 10) {
      return -5; // Peu de concurrence, bon signe
    }
    return 0;
  }

  /**
   * Détermination des classifications
   */
  determineClassifications(score, redFlagAnalysis, greenFlagAnalysis, marketComparison, coherenceAnalysis) {
    const classifications = [];

    // Classification principale basée sur le score
    if (score >= 70) {
      classifications.push(JOB_CLASSIFICATIONS.ARNAQUE);
    } else if (score >= 60) {
      classifications.push(JOB_CLASSIFICATIONS.A_FUIR);
    } else if (score >= 50) {
      // Déterminer si c'est une fausse offre ou ghost job
      const hasDataHarvesting = redFlagAnalysis.flags.some(f => f.category === 'data_harvesting');
      const hasGhostIndicators = redFlagAnalysis.flags.some(f => f.category === 'ghost_job_indicators');

      if (hasDataHarvesting) {
        classifications.push(JOB_CLASSIFICATIONS.FAUSSE_OFFRE);
      } else if (hasGhostIndicators) {
        classifications.push(JOB_CLASSIFICATIONS.GHOST_JOB);
      } else {
        classifications.push(JOB_CLASSIFICATIONS.A_VERIFIER);
      }
    } else if (score >= 35) {
      if (coherenceAnalysis.issues.length > 0) {
        classifications.push(JOB_CLASSIFICATIONS.INCOHERENTE);
      } else {
        classifications.push(JOB_CLASSIFICATIONS.A_VERIFIER);
      }
    } else if (score >= 20) {
      if (marketComparison.marketPosition === 'sous_evalue' || marketComparison.marketPosition === 'tres_sous_evalue') {
        classifications.push(JOB_CLASSIFICATIONS.SOUS_EVALUEE);
      } else {
        classifications.push(JOB_CLASSIFICATIONS.PASSABLE);
      }
    } else if (score >= 10) {
      if (greenFlagAnalysis.flags.length >= 5) {
        classifications.push(JOB_CLASSIFICATIONS.PROFESSIONNELLE);
      } else {
        classifications.push(JOB_CLASSIFICATIONS.ADAPTEE_MARCHE);
      }
    } else {
      classifications.push(JOB_CLASSIFICATIONS.LEGITIME);
    }

    // Ajouter des classifications secondaires
    if (marketComparison.marketPosition === 'conforme' && !classifications.some(c => c.code === 'ADAPTEE_MARCHE')) {
      classifications.push(JOB_CLASSIFICATIONS.ADAPTEE_MARCHE);
    }

    if (greenFlagAnalysis.flags.length >= 8 && score < 30) {
      classifications.push(JOB_CLASSIFICATIONS.PROFESSIONNELLE);
    }

    // Enlever les doublons
    const seen = new Set();
    return classifications.filter(c => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    });
  }

  /**
   * Génération du résumé
   */
  generateSummary(score, classifications, redFlagAnalysis, marketComparison) {
    const primary = classifications[0];
    let summary = `${primary.icon} ${primary.label} (Score: ${score}/100)\n`;
    summary += `${primary.description}\n\n`;

    if (redFlagAnalysis.flags.length > 0) {
      const critical = redFlagAnalysis.flags.filter(f => f.severity === 'critical');
      const high = redFlagAnalysis.flags.filter(f => f.severity === 'high');

      if (critical.length > 0) {
        summary += `🚨 ${critical.length} alerte(s) critique(s)\n`;
      }
      if (high.length > 0) {
        summary += `⚠️ ${high.length} alerte(s) importante(s)\n`;
      }
    }

    if (marketComparison.marketPosition && marketComparison.marketPosition !== 'unknown') {
      summary += `\n📊 Position marché: ${marketComparison.marketPosition.replace(/_/g, ' ')}\n`;
    }

    return summary;
  }

  /**
   * Génération des recommandations
   */
  generateRecommendations(classifications, redFlagAnalysis, marketComparison) {
    const recommendations = [];
    const primary = classifications[0];

    switch (primary.code) {
      case 'ARNAQUE':
        recommendations.push("❌ Ne pas postuler - caractéristiques d'arnaque détectées");
        recommendations.push("🚫 Ne jamais fournir d'informations personnelles ou financières");
        recommendations.push("📢 Signaler cette offre à la plateforme");
        break;
      case 'A_FUIR':
        recommendations.push("⚠️ Éviter cette offre - trop de signaux d'alerte");
        recommendations.push("🔍 Si intéressé, faire des recherches approfondies sur l'entreprise");
        break;
      case 'FAUSSE_OFFRE':
        recommendations.push("🎭 Cette offre semble être pour la collecte de données");
        recommendations.push("🚫 Ne pas fournir d'informations sensibles");
        break;
      case 'GHOST_JOB':
        recommendations.push("👻 Offre probablement inactive ou pour affichage");
        recommendations.push("📧 Contacter directement l'entreprise pour vérifier");
        break;
      case 'INCOHERENTE':
        recommendations.push("🔀 Contradictions détectées - demander des clarifications");
        recommendations.push("📞 Contacter le recruteur pour éclaircir les incohérences");
        break;
      case 'SOUS_EVALUEE':
        recommendations.push("📉 Salaire en dessous du marché");
        recommendations.push("💬 Négocier ou demander une explication sur la rémunération");
        break;
      case 'PASSABLE':
        recommendations.push("⚡ Quelques éléments manquants mais acceptable");
        recommendations.push("🔍 Vérifier les informations manquantes avant de postuler");
        break;
      case 'ADAPTEE_MARCHE':
      case 'PROFESSIONNELLE':
      case 'LEGITIME':
        recommendations.push("✅ Offre correcte - vous pouvez postuler");
        if (marketComparison.marketPosition === 'au_dessus_marche') {
          recommendations.push("💰 Conditions attractives par rapport au marché");
        }
        break;
    }

    // Recommandations basées sur les flags
    const hasCritical = redFlagAnalysis.flags.some(f => f.severity === 'critical');
    if (hasCritical && primary.code !== 'ARNAQUE' && primary.code !== 'A_FUIR') {
      recommendations.push("⚠️ Présence d'éléments critiques - prudence recommandée");
    }

    return recommendations;
  }

  /**
   * Génération du rapport détaillé
   */
  generateDetailedReport(jobData, analysis) {
    return {
      metadata: {
        platform: this.platform,
        analyzedAt: new Date().toISOString(),
        version: '2.0.0'
      },
      jobInfo: {
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        detectedDomain: analysis.domain,
        detectedLevel: analysis.level
      },
      scoring: {
        finalScore: analysis.score,
        redFlagsWeight: analysis.redFlagAnalysis.totalWeight,
        greenFlagsWeight: analysis.greenFlagAnalysis.totalWeight,
        marketAdjustment: analysis.marketComparison.scoreAdjustment,
        coherenceAdjustment: analysis.coherenceAnalysis.scoreAdjustment
      },
      classifications: analysis.classifications.map(c => ({
        code: c.code,
        label: c.label,
        description: c.description
      })),
      redFlags: analysis.redFlagAnalysis.flags,
      greenFlags: analysis.greenFlagAnalysis.flags,
      marketComparison: {
        position: analysis.marketComparison.marketPosition,
        details: analysis.marketComparison.details,
        salaryAnalysis: analysis.marketComparison.salaryAnalysis
      },
      coherenceIssues: analysis.coherenceAnalysis.issues
    };
  }
}

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdvancedJobAnalyzer, MARKET_DATA, JOB_CLASSIFICATIONS };
}

// Export ES6
export { AdvancedJobAnalyzer, MARKET_DATA, JOB_CLASSIFICATIONS, EXTENDED_RED_FLAGS, EXTENDED_GREEN_FLAGS };