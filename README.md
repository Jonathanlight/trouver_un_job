# 💼 TrouverUnJob

Extension Chrome pour analyser les offres d'emploi, détecter les arnaques et évaluer les salaires du marché.

## 🚀 Installation

### Depuis le Chrome Web Store
*(Bientôt disponible)*

### Mode développeur (Chrome)

1. Ouvrez Chrome et accédez à `chrome://extensions/`
2. Activez le **Mode développeur** (en haut à droite)
3. Cliquez sur **Charger l'extension non empaquetée**
4. Sélectionnez le dossier du projet

### Mode développeur (Edge)

1. Ouvrez Edge et accédez à `edge://extensions/`
2. Activez le **Mode développeur**
3. Cliquez sur **Charger l'extension décompressée**
4. Sélectionnez le dossier du projet

## ✨ Fonctionnalités

### 🔍 Analyse des offres
- Détection automatique des signaux d'alerte (red flags)
- Score de pertinence multi-critères
- Badges visuels sur chaque offre

### 💰 Analyse salariale
- Évaluation par rapport au marché
- Calcul brut → net → net après impôts
- Projections salariales sur 1, 3, 5 et 10 ans
- Marge de négociation à l'embauche
- Barèmes France 2024-2025

### 📊 Score de pertinence
Formule : **P = 0.30×L + 0.20×M + 0.20×Q + 0.15×O + 0.15×C**
- L : Légitimité de l'offre
- M : Adéquation au marché
- Q : Qualité de la description
- O : Opportunité de carrière
- C : Clarté des informations

## 🌐 Sites supportés

| Site | Status |
|------|--------|
| Indeed (indeed.com, indeed.fr) | ✅ |
| LinkedIn Jobs | ✅ |
| HelloWork | ✅ |
| Welcome to the Jungle | ✅ |

## 🛠️ Développement

### Prérequis
- Node.js 18+
- npm 9+

### Installation des dépendances
```bash
npm install
```

### Scripts disponibles
```bash
npm run build      # Build de production
npm run package    # Créer le ZIP pour publication
npm run clean      # Nettoyer les builds
npm run dev        # Mode développement (watch)
```

### Structure du projet
```
trouver-un-job/
├── manifest.json              # Configuration extension
├── package.json               # Config npm et scripts
├── background/
│   └── service-worker.js      # Service worker
├── content-scripts/
│   ├── shared/
│   │   └── pertinence-analyzer.js
│   ├── indeed.js
│   ├── linkedin.js
│   ├── hellowork.js
│   ├── welcometothejungle.js
│   └── styles.css
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── dist/                      # Build output
```

## 🔒 Confidentialité

Cette extension :
- ✅ Ne collecte aucune donnée personnelle
- ✅ Fonctionne entièrement en local
- ✅ Ne communique avec aucun serveur externe
- ✅ Les statistiques sont stockées localement

## 📝 Publication

### Chrome Web Store
1. `npm run package`
2. Uploader `dist/trouver-un-job-v*.zip` sur le [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)

### Firefox Add-ons
1. `npm run package`
2. Uploader sur [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)

## 📄 Licence

MIT License - Libre d'utilisation et de modification.

---

**⚠️ Avertissement** : Cette extension est un outil d'aide à la détection. Elle ne garantit pas l'identification de toutes les fausses offres. Restez vigilant et effectuez toujours vos propres vérifications.
