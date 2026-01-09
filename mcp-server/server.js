#!/usr/bin/env node
/**
 * MCP Server - Fake Job Detector
 * Serveur Model Context Protocol pour l'analyse avancée d'offres d'emploi
 * avec support pour agents IA
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// DONNÉES DE RÉFÉRENCE MARCHÉ INTÉGRÉES
// ============================================================================

const MARKET_DATA = {
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
    'default': {
      junior: { min: 26000, max: 35000, median: 30000 },
      confirme: { min: 35000, max: 48000, median: 41000 },
      senior: { min: 46000, max: 65000, median: 55000 },
      lead: { min: 58000, max: 80000, median: 68000 },
      manager: { min: 68000, max: 95000, median: 80000 }
    }
  },
  remoteRates: {
    'tech': 75,
    'marketing': 60,
    'commercial': 35,
    'finance': 50,
    'rh': 45,
    'default': 40
  }
};

const JOB_CLASSIFICATIONS = {
  LEGITIME: { code: 'LEGITIME', label: 'Légitime', icon: '✅', color: '#16a34a' },
  PROFESSIONNELLE: { code: 'PROFESSIONNELLE', label: 'Professionnelle', icon: '💼', color: '#059669' },
  ADAPTEE_MARCHE: { code: 'ADAPTEE_MARCHE', label: 'Adaptée au marché', icon: '📊', color: '#0d9488' },
  PASSABLE: { code: 'PASSABLE', label: 'Passable', icon: '⚡', color: '#ca8a04' },
  SOUS_EVALUEE: { code: 'SOUS_EVALUEE', label: 'Sous-évaluée', icon: '📉', color: '#d97706' },
  INCOHERENTE: { code: 'INCOHERENTE', label: 'Incohérente', icon: '🔀', color: '#ea580c' },
  A_VERIFIER: { code: 'A_VERIFIER', label: 'À vérifier', icon: '🔍', color: '#dc2626' },
  GHOST_JOB: { code: 'GHOST_JOB', label: 'Ghost Job', icon: '👻', color: '#7c3aed' },
  FAUSSE_OFFRE: { code: 'FAUSSE_OFFRE', label: 'Fausse offre', icon: '🎭', color: '#be185d' },
  A_FUIR: { code: 'A_FUIR', label: 'À fuir', icon: '🚫', color: '#dc2626' },
  ARNAQUE: { code: 'ARNAQUE', label: 'Arnaque', icon: '🚨', color: '#991b1b' }
};

// ============================================================================
// PATTERNS DE DÉTECTION
// ============================================================================

const RED_FLAG_PATTERNS = {
  financial_scam: [
    { pattern: /paiement\s*(requis|nécessaire|obligatoire)/i, weight: 55, severity: 'critical', message: "Paiement requis" },
    { pattern: /frais\s*(de\s*)?(inscription|formation|dossier)/i, weight: 55, severity: 'critical', message: "Frais demandés" },
    { pattern: /investissement\s*(initial|de\s*départ)/i, weight: 55, severity: 'critical', message: "Investissement demandé" },
    { pattern: /crypto|bitcoin|ethereum|nft/i, weight: 40, severity: 'high', message: "Mention crypto suspecte" }
  ],
  unrealistic: [
    { pattern: /gagn(er|ez)\s*\d{4,}\s*€?\s*(par|\/)\s*(jour|semaine)/i, weight: 45, severity: 'critical', message: "Gains irréalistes" },
    { pattern: /revenu\s*(passif|illimité|garanti)/i, weight: 45, severity: 'critical', message: "Revenu passif promis" },
    { pattern: /sans\s*(effort|travail|compétence)/i, weight: 40, severity: 'critical', message: "Sans effort promis" }
  ],
  process: [
    { pattern: /embauche\s*(immédiate|garantie|sans\s*entretien)/i, weight: 40, severity: 'high', message: "Embauche anormale" },
    { pattern: /pas\s*(d'?|de\s*)entretien/i, weight: 45, severity: 'critical', message: "Pas d'entretien" },
    { pattern: /urgent|places?\s*limitées?/i, weight: 25, severity: 'medium', message: "Urgence suspecte" }
  ],
  mlm: [
    { pattern: /parrain(age|er)|filleul/i, weight: 45, severity: 'critical', message: "Structure MLM" },
    { pattern: /marketing\s*(de\s*)?réseau|network\s*marketing/i, weight: 45, severity: 'critical', message: "MLM détecté" },
    { pattern: /recrut(er|ez)\s*(votre|des)\s*(équipe|réseau)/i, weight: 40, severity: 'critical', message: "Recrutement pyramidal" }
  ],
  contact: [
    { pattern: /@(gmail|yahoo|hotmail|outlook)\.(com|fr)/i, weight: 25, severity: 'medium', message: "Email non pro" },
    { pattern: /whatsapp|telegram\s*(pour\s*postuler|uniquement)/i, weight: 35, severity: 'high', message: "Contact via messagerie" }
  ],
  ghost_job: [
    { pattern: /\+\s*de\s*500\s*candidatures?/i, weight: 30, severity: 'high', message: "Trop de candidatures" },
    { pattern: /vivier\s*(de\s*)?(candidats?|talents?)/i, weight: 35, severity: 'high', message: "Constitution de vivier" },
    { pattern: /publié(e)?\s*(il\s*y\s*a|depuis)\s*(plus\s*de\s*)?(3|4|5|6)\s*mois/i, weight: 35, severity: 'high', message: "Offre ancienne" }
  ],
  data_harvesting: [
    { pattern: /numéro\s*(de\s*)?(sécurité\s*sociale|sécu)/i, weight: 45, severity: 'critical', message: "N° sécu demandé" },
    { pattern: /copie\s*(de\s*)?(pièce\s*d'?identité|passeport)/i, weight: 40, severity: 'critical', message: "ID demandée" },
    { pattern: /rib|relevé\s*(d'?)?identité\s*bancaire/i, weight: 40, severity: 'critical', message: "RIB demandé" }
  ]
};

const GREEN_FLAG_PATTERNS = [
  { pattern: /cdi\s*(temps\s*plein)?/i, weight: -12, message: "CDI précisé" },
  { pattern: /convention\s*collective/i, weight: -15, message: "Convention collective" },
  { pattern: /mutuelle|tickets?\s*restaurant/i, weight: -8, message: "Avantages sociaux" },
  { pattern: /processus\s*(de\s*)?recrutement/i, weight: -12, message: "Processus détaillé" },
  { pattern: /entretien(s)?\s*(avec|rh|technique)/i, weight: -10, message: "Entretiens structurés" },
  { pattern: /\d{2}[\s,.]?\d{3}\s*[-àa]\s*\d{2}[\s,.]?\d{3}\s*€/i, weight: -12, message: "Salaire précis" },
  { pattern: /n°\s*siret|siret\s*:\s*\d/i, weight: -10, message: "SIRET mentionné" },
  { pattern: /13(ème|e)\s*mois|rtt|participation/i, weight: -10, message: "Avantages détaillés" }
];

// ============================================================================
// FONCTIONS D'ANALYSE
// ============================================================================

function detectDomain(text) {
  const patterns = {
    'tech': /développ|developer|devops|data|software|engineer|fullstack|backend|frontend|cloud|ia|machine/i,
    'marketing': /marketing|communication|community|seo|sea|growth|content|brand|digital/i,
    'commercial': /commercial|vente|sales|account|business\s*develop|négociateur/i,
    'finance': /financ|comptab|audit|contrôle\s*de\s*gestion|trésor|risk|analyst/i,
    'rh': /ressources\s*humaines|rh|recrutement|talent|paie|formation|people/i
  };

  for (const [domain, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) return domain;
  }
  return 'default';
}

function detectLevel(text) {
  if (/stage|stagiaire|intern|alternance/i.test(text)) return 'junior';
  if (/junior|débutant|0-2\s*ans?/i.test(text)) return 'junior';
  if (/confirmé|intermédiaire|3-5\s*ans?/i.test(text)) return 'confirme';
  if (/senior|expérimenté|5\+?\s*ans?|expert/i.test(text)) return 'senior';
  if (/lead|principal|staff/i.test(text)) return 'lead';
  if (/manager|directeur|head\s*of|responsable/i.test(text)) return 'manager';
  return 'confirme';
}

function extractSalary(text) {
  if (!text) return null;

  const patterns = [
    /(\d{2})[.,\s]?(\d{3})\s*[-àa]\s*(\d{2})[.,\s]?(\d{3})\s*(€|euros?|k€?)/i,
    /(\d{2,3})\s*k\s*[-àa]\s*(\d{2,3})\s*k/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numbers = match[0].match(/\d+/g);
      if (numbers && numbers.length >= 1) {
        let value = parseInt(numbers[0]);
        if (/k/i.test(match[0]) && value < 200) value *= 1000;
        if (value < 200) value *= 1000;
        return { annual: value, raw: match[0] };
      }
    }
  }
  return null;
}

function analyzeJob(jobData, platform = 'generic') {
  const { title = '', company = '', location = '', salary = '', description = '' } = jobData;
  const fullText = `${title} ${company} ${location} ${salary} ${description}`.toLowerCase();

  const domain = detectDomain(fullText);
  const level = detectLevel(fullText);

  // Analyse des red flags
  const redFlags = [];
  let redFlagWeight = 0;

  for (const [category, patterns] of Object.entries(RED_FLAG_PATTERNS)) {
    for (const flag of patterns) {
      if (flag.pattern.test(fullText)) {
        redFlags.push({ category, ...flag });
        redFlagWeight += flag.weight;
      }
    }
  }

  // Analyse des green flags
  const greenFlags = [];
  let greenFlagWeight = 0;

  for (const flag of GREEN_FLAG_PATTERNS) {
    if (flag.pattern.test(fullText)) {
      greenFlags.push(flag);
      greenFlagWeight += flag.weight;
    }
  }

  // Comparaison marché
  const salaryInfo = extractSalary(salary || description);
  let marketAdjustment = 0;
  let marketPosition = 'unknown';

  if (salaryInfo) {
    const marketRange = MARKET_DATA.salaryRanges[domain]?.[level] ||
                        MARKET_DATA.salaryRanges['default'][level];

    if (salaryInfo.annual < marketRange.min * 0.7) {
      marketPosition = 'tres_sous_evalue';
      marketAdjustment = 20;
    } else if (salaryInfo.annual < marketRange.min) {
      marketPosition = 'sous_evalue';
      marketAdjustment = 10;
    } else if (salaryInfo.annual > marketRange.max * 1.5) {
      marketPosition = 'suspect_trop_eleve';
      marketAdjustment = 25;
    } else if (salaryInfo.annual > marketRange.max * 1.2) {
      marketPosition = 'au_dessus_marche';
      marketAdjustment = -5;
    } else {
      marketPosition = 'conforme';
      marketAdjustment = -10;
    }
  }

  // Vérifications structurelles
  let structureAdjustment = 0;
  if (!company || company.length < 2) structureAdjustment += 30;
  if (description && description.length < 100) structureAdjustment += 20;

  // Score final
  const totalScore = Math.min(100, Math.max(0,
    redFlagWeight + greenFlagWeight + marketAdjustment + structureAdjustment
  ));

  // Classification
  let classification;
  if (totalScore >= 70) classification = JOB_CLASSIFICATIONS.ARNAQUE;
  else if (totalScore >= 60) classification = JOB_CLASSIFICATIONS.A_FUIR;
  else if (totalScore >= 50) {
    if (redFlags.some(f => f.category === 'data_harvesting')) {
      classification = JOB_CLASSIFICATIONS.FAUSSE_OFFRE;
    } else if (redFlags.some(f => f.category === 'ghost_job')) {
      classification = JOB_CLASSIFICATIONS.GHOST_JOB;
    } else {
      classification = JOB_CLASSIFICATIONS.A_VERIFIER;
    }
  }
  else if (totalScore >= 35) classification = JOB_CLASSIFICATIONS.INCOHERENTE;
  else if (totalScore >= 20) {
    if (marketPosition.includes('sous')) {
      classification = JOB_CLASSIFICATIONS.SOUS_EVALUEE;
    } else {
      classification = JOB_CLASSIFICATIONS.PASSABLE;
    }
  }
  else if (totalScore >= 10) {
    classification = greenFlags.length >= 5 ?
      JOB_CLASSIFICATIONS.PROFESSIONNELLE : JOB_CLASSIFICATIONS.ADAPTEE_MARCHE;
  }
  else classification = JOB_CLASSIFICATIONS.LEGITIME;

  return {
    score: totalScore,
    classification,
    domain,
    level,
    marketPosition,
    redFlags,
    greenFlags,
    salaryAnalysis: salaryInfo ? {
      extracted: salaryInfo,
      marketRange: MARKET_DATA.salaryRanges[domain]?.[level] || MARKET_DATA.salaryRanges['default'][level]
    } : null,
    recommendations: generateRecommendations(classification, redFlags, marketPosition)
  };
}

function generateRecommendations(classification, redFlags, marketPosition) {
  const recommendations = [];

  switch (classification.code) {
    case 'ARNAQUE':
      recommendations.push("❌ Ne pas postuler - caractéristiques d'arnaque");
      recommendations.push("🚫 Ne jamais fournir d'informations personnelles");
      recommendations.push("📢 Signaler cette offre");
      break;
    case 'A_FUIR':
      recommendations.push("⚠️ Éviter cette offre");
      recommendations.push("🔍 Faire des recherches approfondies si intéressé");
      break;
    case 'GHOST_JOB':
      recommendations.push("👻 Offre probablement inactive");
      recommendations.push("📧 Contacter directement l'entreprise");
      break;
    case 'SOUS_EVALUEE':
      recommendations.push("📉 Salaire en dessous du marché");
      recommendations.push("💬 Négocier la rémunération");
      break;
    case 'LEGITIME':
    case 'PROFESSIONNELLE':
      recommendations.push("✅ Offre correcte - vous pouvez postuler");
      break;
  }

  return recommendations;
}

function compareToMarket(domain, level, salary) {
  const marketRange = MARKET_DATA.salaryRanges[domain]?.[level] ||
                      MARKET_DATA.salaryRanges['default'][level];

  const salaryInfo = typeof salary === 'string' ? extractSalary(salary) : salary;

  return {
    domain,
    level,
    marketRange,
    providedSalary: salaryInfo,
    analysis: salaryInfo ? {
      isBelow: salaryInfo.annual < marketRange.min,
      isAbove: salaryInfo.annual > marketRange.max,
      percentileEstimate: Math.round(
        ((salaryInfo.annual - marketRange.min) / (marketRange.max - marketRange.min)) * 100
      ),
      recommendation: salaryInfo.annual < marketRange.min ?
        'Salaire sous le marché - négociation recommandée' :
        salaryInfo.annual > marketRange.max * 1.3 ?
        'Salaire anormalement élevé - vérifier la légitimité' :
        'Salaire dans la norme du marché'
    } : null
  };
}

// ============================================================================
// CONFIGURATION DU SERVEUR MCP
// ============================================================================

const server = new Server(
  {
    name: 'fake-job-detector',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
  }
);

// ============================================================================
// OUTILS MCP
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_job',
        description: 'Analyse complète d\'une offre d\'emploi pour détecter les arnaques, évaluer la légitimité et comparer au marché',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titre du poste' },
            company: { type: 'string', description: 'Nom de l\'entreprise' },
            location: { type: 'string', description: 'Localisation du poste' },
            salary: { type: 'string', description: 'Salaire proposé' },
            description: { type: 'string', description: 'Description complète de l\'offre' },
            platform: { type: 'string', enum: ['linkedin', 'indeed', 'hellowork', 'generic'], description: 'Plateforme source' },
            applicants: { type: 'number', description: 'Nombre de candidatures (LinkedIn)' }
          },
          required: ['description']
        }
      },
      {
        name: 'compare_salary',
        description: 'Compare un salaire aux données du marché pour un domaine et niveau donnés',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              enum: ['tech', 'marketing', 'commercial', 'finance', 'rh', 'default'],
              description: 'Domaine métier'
            },
            level: {
              type: 'string',
              enum: ['junior', 'confirme', 'senior', 'lead', 'manager'],
              description: 'Niveau d\'expérience'
            },
            salary: { type: 'string', description: 'Salaire à comparer (ex: "45000€", "45k-55k")' }
          },
          required: ['domain', 'level', 'salary']
        }
      },
      {
        name: 'get_market_data',
        description: 'Obtient les données de référence du marché pour un domaine',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              enum: ['tech', 'marketing', 'commercial', 'finance', 'rh', 'default'],
              description: 'Domaine métier'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'check_red_flags',
        description: 'Vérifie la présence de signaux d\'alerte dans un texte',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Texte à analyser' },
            categories: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['financial_scam', 'unrealistic', 'process', 'mlm', 'contact', 'ghost_job', 'data_harvesting']
              },
              description: 'Catégories à vérifier (toutes si non spécifié)'
            }
          },
          required: ['text']
        }
      },
      {
        name: 'classify_job',
        description: 'Classifie une offre selon les catégories prédéfinies',
        inputSchema: {
          type: 'object',
          properties: {
            score: { type: 'number', description: 'Score de risque (0-100)' },
            has_ghost_indicators: { type: 'boolean', description: 'Présence d\'indicateurs ghost job' },
            has_data_harvesting: { type: 'boolean', description: 'Présence de collecte de données suspecte' },
            market_position: { type: 'string', description: 'Position par rapport au marché' }
          },
          required: ['score']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze_job': {
      const result = analyzeJob(args, args.platform || 'generic');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    case 'compare_salary': {
      const result = compareToMarket(args.domain, args.level, args.salary);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    case 'get_market_data': {
      const data = {
        salaryRanges: MARKET_DATA.salaryRanges[args.domain] || MARKET_DATA.salaryRanges['default'],
        remoteRate: MARKET_DATA.remoteRates[args.domain] || MARKET_DATA.remoteRates['default']
      };
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    }

    case 'check_red_flags': {
      const text = args.text.toLowerCase();
      const categories = args.categories || Object.keys(RED_FLAG_PATTERNS);
      const detected = [];

      for (const category of categories) {
        const patterns = RED_FLAG_PATTERNS[category] || [];
        for (const flag of patterns) {
          if (flag.pattern.test(text)) {
            detected.push({ category, ...flag, pattern: flag.pattern.toString() });
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ detected, count: detected.length }, null, 2)
        }]
      };
    }

    case 'classify_job': {
      const { score, has_ghost_indicators, has_data_harvesting, market_position } = args;
      let classification;

      if (score >= 70) classification = JOB_CLASSIFICATIONS.ARNAQUE;
      else if (score >= 60) classification = JOB_CLASSIFICATIONS.A_FUIR;
      else if (score >= 50) {
        if (has_data_harvesting) classification = JOB_CLASSIFICATIONS.FAUSSE_OFFRE;
        else if (has_ghost_indicators) classification = JOB_CLASSIFICATIONS.GHOST_JOB;
        else classification = JOB_CLASSIFICATIONS.A_VERIFIER;
      }
      else if (score >= 35) classification = JOB_CLASSIFICATIONS.INCOHERENTE;
      else if (score >= 20) {
        if (market_position?.includes('sous')) classification = JOB_CLASSIFICATIONS.SOUS_EVALUEE;
        else classification = JOB_CLASSIFICATIONS.PASSABLE;
      }
      else if (score >= 10) classification = JOB_CLASSIFICATIONS.ADAPTEE_MARCHE;
      else classification = JOB_CLASSIFICATIONS.LEGITIME;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(classification, null, 2)
        }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ============================================================================
// RESSOURCES MCP
// ============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'job-detector://market-data',
        mimeType: 'application/json',
        name: 'Données de référence marché',
        description: 'Salaires médians et taux de télétravail par domaine'
      },
      {
        uri: 'job-detector://classifications',
        mimeType: 'application/json',
        name: 'Classifications des offres',
        description: 'Liste des catégories de classification possibles'
      },
      {
        uri: 'job-detector://red-flags',
        mimeType: 'application/json',
        name: 'Signaux d\'alerte',
        description: 'Patterns de détection des arnaques'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case 'job-detector://market-data':
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(MARKET_DATA, null, 2)
        }]
      };

    case 'job-detector://classifications':
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(JOB_CLASSIFICATIONS, null, 2)
        }]
      };

    case 'job-detector://red-flags':
      const flagsForExport = {};
      for (const [category, patterns] of Object.entries(RED_FLAG_PATTERNS)) {
        flagsForExport[category] = patterns.map(p => ({
          ...p,
          pattern: p.pattern.toString()
        }));
      }
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(flagsForExport, null, 2)
        }]
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// ============================================================================
// PROMPTS MCP POUR AGENTS IA
// ============================================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'analyze_job_posting',
        description: 'Prompt pour analyser une offre d\'emploi avec contexte marché',
        arguments: [
          { name: 'job_text', description: 'Texte complet de l\'offre', required: true },
          { name: 'platform', description: 'Plateforme source (linkedin, indeed)', required: false }
        ]
      },
      {
        name: 'evaluate_legitimacy',
        description: 'Prompt pour évaluer la légitimité d\'une offre',
        arguments: [
          { name: 'job_data', description: 'Données de l\'offre en JSON', required: true }
        ]
      },
      {
        name: 'market_comparison',
        description: 'Prompt pour comparer une offre au marché',
        arguments: [
          { name: 'domain', description: 'Domaine métier', required: true },
          { name: 'level', description: 'Niveau d\'expérience', required: true },
          { name: 'salary', description: 'Salaire proposé', required: true }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'analyze_job_posting':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Analyse cette offre d'emploi de manière approfondie.

OFFRE:
${args?.job_text || ''}

PLATEFORME: ${args?.platform || 'non spécifiée'}

Tu dois:
1. Identifier le domaine métier et le niveau d'expérience
2. Détecter tous les signaux d'alerte (arnaques, MLM, ghost jobs, collecte de données)
3. Identifier les points positifs (transparence salariale, avantages, processus professionnel)
4. Comparer le salaire aux données du marché si disponible
5. Classifier l'offre: Légitime, Professionnelle, Passable, Sous-évaluée, Incohérente, Ghost Job, Fausse offre, À fuir, ou Arnaque
6. Donner un score de risque de 0 à 100
7. Fournir des recommandations claires

Utilise les outils analyze_job et compare_salary pour obtenir des données précises.`
            }
          }
        ]
      };

    case 'evaluate_legitimacy':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Évalue la légitimité de cette offre d'emploi.

DONNÉES:
${args?.job_data || '{}'}

Critères d'évaluation:
- Entreprise identifiable et vérifiable
- Processus de recrutement professionnel
- Conditions de travail réalistes
- Salaire cohérent avec le marché
- Absence de demandes financières
- Contact professionnel (pas de WhatsApp/Telegram)
- Description détaillée du poste

Utilise l'outil check_red_flags pour détecter les signaux d'alerte.
Fournis une évaluation de 1 à 10 avec justification.`
            }
          }
        ]
      };

    case 'market_comparison':
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Compare cette offre aux standards du marché.

DOMAINE: ${args?.domain || 'non spécifié'}
NIVEAU: ${args?.level || 'non spécifié'}
SALAIRE PROPOSÉ: ${args?.salary || 'non spécifié'}

Utilise les outils get_market_data et compare_salary pour:
1. Obtenir les fourchettes de salaire du marché
2. Positionner cette offre par rapport aux standards
3. Identifier si l'offre est sous-évaluée, conforme, ou surévaluée
4. Donner des conseils de négociation si pertinent`
            }
          }
        ]
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ============================================================================
// DÉMARRAGE DU SERVEUR
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fake Job Detector MCP Server running on stdio');
}

main().catch(console.error);