#!/usr/bin/env node

/**
 * Build script for TrouverUnJob Chrome Extension
 * Copies all necessary files to dist folder for production
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Files and directories to include in the build
const INCLUDE = [
  'manifest.json',
  'background',
  'content-scripts',
  'popup',
  'icons'
];

// Files to exclude
const EXCLUDE = [
  '.DS_Store',
  'Thumbs.db',
  '*.map',
  '*-advanced.js' // Exclude advanced/dev files
];

function shouldExclude(filename) {
  return EXCLUDE.some(pattern => {
    if (pattern.startsWith('*')) {
      return filename.endsWith(pattern.slice(1));
    }
    return filename === pattern;
  });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const files = fs.readdirSync(src);
    for (const file of files) {
      if (!shouldExclude(file)) {
        copyRecursive(path.join(src, file), path.join(dest, file));
      }
    }
  } else {
    if (!shouldExclude(path.basename(src))) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied: ${path.relative(ROOT_DIR, src)}`);
    }
  }
}

function build() {
  console.log('🔨 Building TrouverUnJob extension...\n');

  // Clean dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Copy files
  for (const item of INCLUDE) {
    const src = path.join(ROOT_DIR, item);
    const dest = path.join(DIST_DIR, item);

    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
    } else {
      console.warn(`  Warning: ${item} not found`);
    }
  }

  // Read manifest to get version
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'manifest.json'), 'utf8'));

  console.log('\n✅ Build complete!');
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Output: ${DIST_DIR}`);
  console.log('\n📦 To create a ZIP for publishing, run: npm run package');
}

build();
