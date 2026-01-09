/**
 * Career Pathways Analyzer
 * Analyse des débouchés et reconversions basée sur le titre du poste
 */

(function() {
  'use strict';

  // Patterns de mots-clés pour détecter la famille de métier
  const CAREER_PATTERNS = [
    // Tech - Développement
    {
      keywords: ['develop', 'dev ', 'developer', 'engineer', 'ingénieur', 'programmeur', 'software', 'fullstack', 'frontend', 'backend', 'mobile', 'web dev', 'php', 'java', 'python', 'javascript', 'react', 'angular', 'vue'],
      family: 'tech_dev'
    },
    // Tech - DevOps/Infra
    {
      keywords: ['devops', 'sre', 'sysadmin', 'infrastructure', 'cloud', 'aws', 'azure', 'platform', 'admin système', 'réseau'],
      family: 'tech_ops'
    },
    // Data
    {
      keywords: ['data', 'analyst', 'analytics', 'bi ', 'business intelligence', 'scientist', 'machine learning', 'ml ', 'ai ', 'statisticien'],
      family: 'data'
    },
    // Product
    {
      keywords: ['product', 'produit', 'po ', 'product owner', 'product manager', 'pm '],
      family: 'product'
    },
    // Design
    {
      keywords: ['design', 'ux', 'ui', 'graphi', 'créatif', 'creative', 'webdesign', 'ergonome', 'directeur artistique'],
      family: 'design'
    },
    // Marketing
    {
      keywords: ['market', 'growth', 'seo', 'sea', 'sem', 'acquisition', 'traffic', 'digital market', 'brand', 'content', 'community', 'social media', 'crm'],
      family: 'marketing'
    },
    // Sales / Commercial
    {
      keywords: ['commercial', 'sales', 'vente', 'business develop', 'account', 'customer success', 'key account', 'kam', 'bdm', 'bdr', 'sdr', 'inside sales'],
      family: 'sales'
    },
    // RH
    {
      keywords: ['rh', 'ressources humaines', 'recruteur', 'recruiter', 'talent', 'human', 'people', 'sirh', 'paie', 'formation', 'campus'],
      family: 'hr'
    },
    // Finance
    {
      keywords: ['finance', 'comptab', 'control', 'audit', 'trésor', 'daf', 'cfo', 'fiscal', 'consolidation', 'reporting financ'],
      family: 'finance'
    },
    // Gestion de projet
    {
      keywords: ['chef de projet', 'project manager', 'coordinator', 'pmo', 'scrum', 'agile', 'delivery'],
      family: 'project'
    },
    // Support
    {
      keywords: ['support', 'helpdesk', 'service client', 'customer care', 'hotline', 'technicien support'],
      family: 'support'
    },
    // Operations
    {
      keywords: ['opération', 'operation', 'logisti', 'supply', 'achat', 'procurement', 'approvisionnement', 'stock'],
      family: 'operations'
    },
    // Juridique
    {
      keywords: ['juridi', 'legal', 'juriste', 'avocat', 'compliance', 'conformité', 'rgpd', 'dpo', 'contrat'],
      family: 'legal'
    },
    // Communication
    {
      keywords: ['communication', 'communic', 'relation presse', 'pr ', 'rédacteur', 'copywriter', 'journaliste', 'éditorial'],
      family: 'communication'
    },
    // Management / Direction
    {
      keywords: ['directeur', 'director', 'head of', 'responsable', 'manager', 'ceo', 'coo', 'vp ', 'vice president', 'country manager'],
      family: 'management'
    }
  ];

  // Données de carrière par famille
  const CAREER_DATA = {
    tech_dev: {
      label: 'Développement',
      debouches: [
        { title: 'Lead Developer', years: '+2-3 ans', desc: 'Encadrement technique, code review, mentoring' },
        { title: 'Tech Lead', years: '+3-4 ans', desc: 'Architecture technique, décisions technologiques' },
        { title: 'Architecte Logiciel', years: '+5-6 ans', desc: 'Conception systèmes, patterns, scalabilité' },
        { title: 'Engineering Manager', years: '+5-7 ans', desc: 'Management d\'équipe technique' },
        { title: 'CTO', years: '+8-12 ans', desc: 'Direction technique, stratégie tech' }
      ],
      reconversion: [
        { title: 'Product Manager', desc: 'Vision produit avec expertise technique' },
        { title: 'Tech Recruiter', desc: 'Recrutement IT avec compréhension métier' },
        { title: 'Formateur/Enseignant', desc: 'Bootcamps, écoles, formation pro' },
        { title: 'Consultant IT', desc: 'Conseil technique et audit' },
        { title: 'Technical Writer', desc: 'Documentation, contenus techniques' }
      ]
    },

    tech_ops: {
      label: 'DevOps & Infrastructure',
      debouches: [
        { title: 'DevOps Senior', years: '+2-3 ans', desc: 'CI/CD avancé, automatisation' },
        { title: 'SRE Lead', years: '+3-4 ans', desc: 'Fiabilité, observabilité, incidents' },
        { title: 'Cloud Architect', years: '+4-5 ans', desc: 'Architecture cloud, multi-cloud' },
        { title: 'Platform Manager', years: '+5-7 ans', desc: 'Stratégie plateforme, équipes' },
        { title: 'VP Infrastructure', years: '+8-10 ans', desc: 'Direction infra et sécurité' }
      ],
      reconversion: [
        { title: 'Consultant Cloud', desc: 'Migration, optimisation cloud' },
        { title: 'Security Engineer', desc: 'Cybersécurité, audits' },
        { title: 'Formateur DevOps', desc: 'Formations certifiantes AWS/Azure' },
        { title: 'Pre-Sales Engineer', desc: 'Avant-vente solutions techniques' }
      ]
    },

    data: {
      label: 'Data & Analytics',
      debouches: [
        { title: 'Data Analyst Senior', years: '+2-3 ans', desc: 'Analyses complexes, dashboards avancés' },
        { title: 'Lead Data Analyst', years: '+3-4 ans', desc: 'Coordination équipe data' },
        { title: 'Data Scientist', years: '+3-5 ans', desc: 'ML, modèles prédictifs' },
        { title: 'Head of Data', years: '+5-7 ans', desc: 'Stratégie data, gouvernance' },
        { title: 'Chief Data Officer', years: '+8-10 ans', desc: 'Direction data entreprise' }
      ],
      reconversion: [
        { title: 'Product Analyst', desc: 'Analytics produit, A/B testing' },
        { title: 'Consultant BI', desc: 'Déploiement solutions BI' },
        { title: 'Data Engineer', desc: 'Infrastructure data, pipelines' },
        { title: 'Growth Manager', desc: 'Croissance data-driven' }
      ]
    },

    product: {
      label: 'Product Management',
      debouches: [
        { title: 'Senior PM', years: '+2-3 ans', desc: 'Produits complexes, stakeholders' },
        { title: 'Lead PM', years: '+3-4 ans', desc: 'Coordination PMs, vision produit' },
        { title: 'Group PM', years: '+4-5 ans', desc: 'Portefeuille produits' },
        { title: 'VP Product', years: '+6-8 ans', desc: 'Direction produit' },
        { title: 'CPO', years: '+8-10 ans', desc: 'Chief Product Officer' }
      ],
      reconversion: [
        { title: 'Entrepreneur', desc: 'Création startup, vision produit' },
        { title: 'Product Coach', desc: 'Conseil, transformation produit' },
        { title: 'UX Researcher', desc: 'Recherche utilisateur approfondie' },
        { title: 'Growth PM', desc: 'Spécialisation acquisition/rétention' }
      ]
    },

    design: {
      label: 'Design & Créatif',
      debouches: [
        { title: 'Senior Designer', years: '+2-3 ans', desc: 'Projets complexes, design system' },
        { title: 'Lead Designer', years: '+3-4 ans', desc: 'Direction créative équipe' },
        { title: 'Design Manager', years: '+4-5 ans', desc: 'Management équipe design' },
        { title: 'Head of Design', years: '+5-7 ans', desc: 'Stratégie design, marque' },
        { title: 'VP Design / CDO', years: '+8-10 ans', desc: 'Direction design entreprise' }
      ],
      reconversion: [
        { title: 'Product Designer', desc: 'Design orienté produit digital' },
        { title: 'Brand Strategist', desc: 'Stratégie de marque' },
        { title: 'Design Ops', desc: 'Process et outils design' },
        { title: 'Freelance / Studio', desc: 'Indépendant ou agence' }
      ]
    },

    marketing: {
      label: 'Marketing Digital',
      debouches: [
        { title: 'Senior Marketing', years: '+2-3 ans', desc: 'Campagnes multi-canaux' },
        { title: 'Marketing Manager', years: '+3-4 ans', desc: 'Stratégie marketing, budget' },
        { title: 'Head of Growth', years: '+4-5 ans', desc: 'Croissance, acquisition' },
        { title: 'CMO', years: '+7-10 ans', desc: 'Direction marketing' }
      ],
      reconversion: [
        { title: 'Growth Hacker', desc: 'Croissance agressive, expérimentation' },
        { title: 'Consultant SEO/SEA', desc: 'Expertise acquisition payante/organique' },
        { title: 'Product Marketing', desc: 'Positionnement, go-to-market' },
        { title: 'Entrepreneur', desc: 'E-commerce, agence digitale' }
      ]
    },

    sales: {
      label: 'Commercial & Vente',
      debouches: [
        { title: 'Account Executive', years: '+1-2 ans', desc: 'Closing, négociation' },
        { title: 'Senior AE', years: '+2-3 ans', desc: 'Grands comptes, deals complexes' },
        { title: 'Team Lead Sales', years: '+3-4 ans', desc: 'Management équipe commerciale' },
        { title: 'Sales Director', years: '+5-7 ans', desc: 'Direction commerciale' },
        { title: 'VP Sales / CSO', years: '+8-10 ans', desc: 'Direction générale ventes' }
      ],
      reconversion: [
        { title: 'Customer Success', desc: 'Fidélisation, upsell clients' },
        { title: 'Business Developer', desc: 'Développement partenariats' },
        { title: 'Sales Enablement', desc: 'Formation, outils commerciaux' },
        { title: 'Entrepreneur', desc: 'Création entreprise, réseau' }
      ]
    },

    hr: {
      label: 'Ressources Humaines',
      debouches: [
        { title: 'HR Business Partner', years: '+2-3 ans', desc: 'Accompagnement managers' },
        { title: 'Talent Manager', years: '+3-4 ans', desc: 'Stratégie recrutement, marque employeur' },
        { title: 'HR Manager', years: '+4-5 ans', desc: 'Gestion RH globale' },
        { title: 'Head of People', years: '+5-7 ans', desc: 'Direction RH' },
        { title: 'DRH / CHRO', years: '+8-10 ans', desc: 'Direction générale RH' }
      ],
      reconversion: [
        { title: 'Coach professionnel', desc: 'Accompagnement individuel' },
        { title: 'Consultant RH', desc: 'Transformation, organisation' },
        { title: 'Formateur', desc: 'Formation professionnelle' },
        { title: 'Chasseur de têtes', desc: 'Cabinet de recrutement' }
      ]
    },

    finance: {
      label: 'Finance & Comptabilité',
      debouches: [
        { title: 'Contrôleur de gestion', years: '+2-3 ans', desc: 'Budget, reporting, analyse' },
        { title: 'Responsable comptable', years: '+3-4 ans', desc: 'Clôtures, équipe comptable' },
        { title: 'Directeur financier adjoint', years: '+5-6 ans', desc: 'Stratégie financière' },
        { title: 'DAF / CFO', years: '+8-10 ans', desc: 'Direction administrative et financière' }
      ],
      reconversion: [
        { title: 'Consultant finance', desc: 'Audit, conseil financier' },
        { title: 'FP&A Manager', desc: 'Planification financière' },
        { title: 'Trésorier', desc: 'Gestion cash, investissements' },
        { title: 'Expert-comptable', desc: 'Cabinet, indépendant' }
      ]
    },

    project: {
      label: 'Gestion de Projet',
      debouches: [
        { title: 'Chef de projet senior', years: '+2-3 ans', desc: 'Projets complexes, multi-équipes' },
        { title: 'Program Manager', years: '+4-5 ans', desc: 'Portefeuille de projets' },
        { title: 'PMO', years: '+4-5 ans', desc: 'Méthodologies, gouvernance projets' },
        { title: 'Directeur de projets', years: '+6-8 ans', desc: 'Direction transformation' }
      ],
      reconversion: [
        { title: 'Scrum Master', desc: 'Agilité, facilitation' },
        { title: 'Product Owner', desc: 'Vision produit, priorisation' },
        { title: 'Delivery Manager', desc: 'Livraison, coordination équipes' },
        { title: 'Consultant transformation', desc: 'Conduite du changement' }
      ]
    },

    support: {
      label: 'Support & Relation Client',
      debouches: [
        { title: 'Support Senior', years: '+1-2 ans', desc: 'Cas complexes, expertise' },
        { title: 'Team Lead Support', years: '+2-3 ans', desc: 'Management équipe support' },
        { title: 'Support Manager', years: '+3-4 ans', desc: 'Organisation, KPIs, process' },
        { title: 'Head of Support', years: '+5-6 ans', desc: 'Stratégie support client' },
        { title: 'VP Customer Experience', years: '+7-9 ans', desc: 'Expérience client globale' }
      ],
      reconversion: [
        { title: 'Customer Success', desc: 'Accompagnement proactif clients' },
        { title: 'Technical Account Manager', desc: 'Support clients stratégiques' },
        { title: 'Quality Analyst', desc: 'Qualité, amélioration continue' },
        { title: 'Formateur support', desc: 'Formation équipes' }
      ]
    },

    operations: {
      label: 'Opérations & Supply Chain',
      debouches: [
        { title: 'Operations Manager', years: '+3-4 ans', desc: 'Optimisation processus' },
        { title: 'Supply Chain Manager', years: '+4-5 ans', desc: 'Chaîne logistique complète' },
        { title: 'Director of Operations', years: '+6-8 ans', desc: 'Direction opérationnelle' },
        { title: 'COO', years: '+10-12 ans', desc: 'Direction générale opérations' }
      ],
      reconversion: [
        { title: 'Consultant supply chain', desc: 'Optimisation logistique' },
        { title: 'Project Manager Ops', desc: 'Transformation opérationnelle' },
        { title: 'Procurement Manager', desc: 'Achats, négociation fournisseurs' },
        { title: 'Quality Manager', desc: 'Qualité, certification' }
      ]
    },

    legal: {
      label: 'Juridique & Compliance',
      debouches: [
        { title: 'Juriste senior', years: '+3-4 ans', desc: 'Dossiers complexes, expertise' },
        { title: 'Responsable juridique', years: '+5-6 ans', desc: 'Management équipe juridique' },
        { title: 'DPO', years: '+4-5 ans', desc: 'Protection données, RGPD' },
        { title: 'Directeur juridique', years: '+8-10 ans', desc: 'Direction juridique entreprise' }
      ],
      reconversion: [
        { title: 'Compliance Officer', desc: 'Conformité réglementaire' },
        { title: 'Consultant RGPD', desc: 'Mise en conformité données' },
        { title: 'Legal Ops', desc: 'Processus et outils juridiques' },
        { title: 'Médiateur', desc: 'Résolution de conflits' }
      ]
    },

    communication: {
      label: 'Communication',
      debouches: [
        { title: 'Chargé de com senior', years: '+2-3 ans', desc: 'Stratégie, événements' },
        { title: 'Responsable communication', years: '+4-5 ans', desc: 'Com interne/externe' },
        { title: 'Directeur communication', years: '+6-8 ans', desc: 'Direction communication' }
      ],
      reconversion: [
        { title: 'Content Manager', desc: 'Stratégie éditoriale digitale' },
        { title: 'Brand Manager', desc: 'Gestion de marque' },
        { title: 'Relations presse', desc: 'Agence RP, freelance' },
        { title: 'Social Media Manager', desc: 'Réseaux sociaux, influence' }
      ]
    },

    management: {
      label: 'Management & Direction',
      debouches: [
        { title: 'Directeur de département', years: '+2-3 ans', desc: 'Direction d\'un pôle' },
        { title: 'Directeur général adjoint', years: '+4-6 ans', desc: 'Bras droit du DG' },
        { title: 'Directeur général', years: '+6-10 ans', desc: 'Direction générale' },
        { title: 'CEO', years: '+10-15 ans', desc: 'Direction entreprise' }
      ],
      reconversion: [
        { title: 'Consultant stratégie', desc: 'Conseil en management' },
        { title: 'Coach de dirigeants', desc: 'Accompagnement exécutif' },
        { title: 'Board Member', desc: 'Administrateur, conseils' },
        { title: 'Entrepreneur', desc: 'Création ou reprise' }
      ]
    }
  };

  // Fallback pour les métiers non reconnus
  const GENERIC_CAREER = {
    label: 'Général',
    debouches: [
      { title: 'Senior / Expert', years: '+2-3 ans', desc: 'Montée en expertise' },
      { title: 'Team Lead', years: '+3-4 ans', desc: 'Encadrement d\'équipe' },
      { title: 'Manager', years: '+4-6 ans', desc: 'Management et stratégie' },
      { title: 'Directeur', years: '+7-10 ans', desc: 'Direction de département' }
    ],
    reconversion: [
      { title: 'Consultant', desc: 'Expertise et conseil' },
      { title: 'Formateur', desc: 'Transmission de savoirs' },
      { title: 'Chef de projet', desc: 'Coordination et gestion' },
      { title: 'Entrepreneur', desc: 'Création d\'activité' }
    ]
  };

  /**
   * Analyse le titre du poste pour déterminer la famille et retourner les évolutions
   * @param {string} jobTitle - Le titre du poste
   * @returns {Object} { family, label, debouches, reconversion }
   */
  function analyze(jobTitle) {
    if (!jobTitle || typeof jobTitle !== 'string') {
      return { ...GENERIC_CAREER, family: 'unknown' };
    }

    const title = jobTitle.toLowerCase();

    // Chercher la famille correspondante
    for (const pattern of CAREER_PATTERNS) {
      for (const keyword of pattern.keywords) {
        if (title.includes(keyword.toLowerCase())) {
          const careerData = CAREER_DATA[pattern.family];
          if (careerData) {
            return {
              family: pattern.family,
              label: careerData.label,
              debouches: careerData.debouches,
              reconversion: careerData.reconversion
            };
          }
        }
      }
    }

    // Aucune correspondance trouvée
    return { ...GENERIC_CAREER, family: 'unknown' };
  }

  // Exposer globalement
  window.FJD_CareerPathways = {
    analyze,
    CAREER_DATA,
    CAREER_PATTERNS
  };

  console.log('[FJD] Career Pathways module chargé');
})();
