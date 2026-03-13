#!/usr/bin/env node
/**
 * HARGOBIND MARBLE — CATALOG SCANNER  v3
 *
 * Folder structure:
 *   images/
 *     onyx/
 *       yellow/
 *         yellow1.jpg       ← slab for stone "Yellow 1"
 *         yellow1.1.jpg     ← backlit for Yellow 1
 *         yellow1.2.jpg     ← installed for Yellow 1
 *         yellow2.jpg       ← slab for stone "Yellow 2" (separate card)
 *         yellow2.1.jpg     ← backlit for Yellow 2
 *       green/
 *         green.jpg         ← slab (single stone, no number needed)
 *         green.1.jpg       ← backlit
 *
 * Run: node scan.js
 */

const fs   = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'images');

function findHtmlFile() {
  const files = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.html'));
  if (!files.length) return null;
  const preferred = files.find(f => /marble|website/i.test(f));
  return path.join(__dirname, preferred || files[0]);
}
const HTML_FILE = findHtmlFile();

const RANGE_LABELS = {
  'onyx':'Onyx','granite':'Granite','italian-marble':'Italian Marble',
  'indian-marble':'Indian Marble','satwario':'Satwario','vietnam':'Vietnam',
  'travertin':'Travertin','travertine':'Travertin','limestone':'Limestone','brazilian':'Brazilian',
};

const COLOUR_MAP = [
  ['honey light','Honey'],['light honey','Honey'],['golden','Gold'],
  ['green','Green'],['white','White'],['honey','Honey'],['gold','Gold'],
  ['blue','Blue'],['grey','Grey'],['gray','Grey'],['pink','Pink'],
  ['yellow','Yellow'],['red','Red'],['brown','Brown'],['black','Black'],
  ['purple','Purple'],['orange','Orange'],['beige','Beige'],['cream','Cream'],
  ['multi','Multi'],['ornamental','Multi'],
];

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.JPG','.JPEG','.PNG','.WEBP']);

function detectColour(name) {
  const lower = name.toLowerCase();
  for (const [prefix, colour] of COLOUR_MAP) {
    if (lower.startsWith(prefix)) return colour;
  }
  return 'Multi';
}

function toTitle(str) {
  return str.replace(/[-_]+/g,' ').split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function isImage(f) { return IMG_EXTS.has(path.extname(f)); }

// Parse filename like "yellow1.1.jpg" → { base:"yellow1", suffix:1 }
// "yellow2.jpg" → { base:"yellow2", suffix:null }
// "green.jpg"   → { base:"green",   suffix:null }
// "green.1.jpg" → { base:"green",   suffix:1 }
function parseFilename(filename) {
  const ext   = path.extname(filename);
  const noExt = filename.slice(0, filename.length - ext.length); // "yellow1.1"
  const parts = noExt.split('.');

  if (parts.length === 1) {
    // e.g. "yellow1" or "green" → slab, no suffix
    return { base: parts[0], suffix: null };
  }

  const lastPart  = parts[parts.length - 1];
  const suffixNum = parseInt(lastPart, 10);

  if (!isNaN(suffixNum)) {
    // e.g. "yellow1.1" → base="yellow1", suffix=1
    // e.g. "green.1"   → base="green",   suffix=1
    return { base: parts.slice(0, -1).join('.'), suffix: suffixNum };
  }

  // No numeric suffix
  return { base: noExt, suffix: null };
}

function scanColourFolder(rangeFolder, colourFolder) {
  const dir = path.join(IMAGES_DIR, rangeFolder, colourFolder);
  if (!fs.statSync(dir).isDirectory()) return [];

  const files = fs.readdirSync(dir).filter(isImage).sort();
  if (!files.length) return [];

  // Group files by their base name (the slab identifier)
  // e.g. "yellow1" → [yellow1.jpg, yellow1.1.jpg, yellow1.2.jpg]
  //      "yellow2" → [yellow2.jpg, yellow2.1.jpg]
  const groups = new Map(); // base → { slab, images[] }

  for (const file of files) {
    const { base, suffix } = parseFilename(file);
    const relPath = `images/${rangeFolder}/${colourFolder}/${file}`;

    if (!groups.has(base)) groups.set(base, { slab: null, images: [] });
    const g = groups.get(base);

    if (suffix === null) {
      // This is the slab image
      g.slab = relPath;
      g.images.unshift({ src: relPath, tag: 'Slab' });
    } else if (suffix === 1) {
      g.images.push({ src: relPath, tag: 'Backlit' });
    } else {
      g.images.push({ src: relPath, tag: 'Installed' });
    }
  }

  const rangeLabel = RANGE_LABELS[rangeFolder] || toTitle(rangeFolder);
  const colour     = detectColour(colourFolder);
  const stones     = [];

  for (const [base, g] of groups) {
    // If no explicit slab, use first image as slab
    if (!g.slab && g.images.length) {
      g.slab = g.images[0].src;
      g.images[0].tag = 'Slab';
    }
    if (!g.slab) continue;

    // Build display name: "Yellow 1 Onyx" or "Green Onyx"
    // Strip the colour prefix from base to get number suffix if any
    const colourLower = colourFolder.toLowerCase();
    const baseLower   = base.toLowerCase();
    const numPart     = baseLower.startsWith(colourLower)
      ? baseLower.slice(colourLower.length).trim()   // e.g. "1", "2", ""
      : base;
    const displayName = numPart
      ? toTitle(colourFolder) + ' ' + numPart + ' ' + rangeLabel
      : toTitle(colourFolder) + ' ' + rangeLabel;

    stones.push({
      id:         `${rangeFolder}__${colourFolder}__${base}`.replace(/\s+/g, '-'),
      name:       displayName,
      range:      rangeFolder,
      rangeLabel: rangeLabel,
      colour:     colour,
      slab:       g.slab,
      images:     g.images,
    });
  }

  return stones;
}

function buildCatalog() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error('\n❌  images/ folder not found at: ' + IMAGES_DIR);
    process.exit(1);
  }
  if (!HTML_FILE) {
    console.error('\n❌  No .html file found in: ' + __dirname);
    process.exit(1);
  }

  console.log('\n🔍  Scanning: ' + IMAGES_DIR);
  console.log('📄  HTML:     ' + path.basename(HTML_FILE) + '\n');

  const allStones = [];

  const rangeFolders = fs.readdirSync(IMAGES_DIR)
    .filter(f => fs.statSync(path.join(IMAGES_DIR, f)).isDirectory()).sort();

  for (const rangeFolder of rangeFolders) {
    const colourFolders = fs.readdirSync(path.join(IMAGES_DIR, rangeFolder))
      .filter(f => fs.statSync(path.join(IMAGES_DIR, rangeFolder, f)).isDirectory()).sort();

    for (const colourFolder of colourFolders) {
      try {
        const stones = scanColourFolder(rangeFolder, colourFolder);
        for (const s of stones) {
          allStones.push(s);
          console.log(`  ✓  ${s.rangeLabel.padEnd(16)} ${s.name.padEnd(32)} [${s.images.map(i=>i.tag).join(' + ')}]`);
        }
      } catch(e) {
        console.warn(`  ⚠  Skipped ${rangeFolder}/${colourFolder}: ${e.message}`);
      }
    }
  }

  if (!allStones.length) {
    console.warn('\n⚠️  No stones found. Expected structure:');
    console.warn('    images/onyx/yellow/yellow1.jpg');
    console.warn('    images/onyx/yellow/yellow1.1.jpg\n');
  }

  const catalog = { generated: new Date().toISOString(), stones: allStones };

  let html = fs.readFileSync(HTML_FILE, 'utf8');
  const S = '/* CATALOG_START */';
  const E = '/* CATALOG_END */';
  const si = html.indexOf(S), ei = html.indexOf(E);

  if (si === -1 || ei === -1) {
    console.error('\n❌  CATALOG markers not found in HTML. Use the latest HTML version.\n');
    process.exit(1);
  }

  html = html.slice(0, si + S.length) +
         `\nwindow.__CATALOG = ${JSON.stringify(catalog, null, 2)};\n` +
         html.slice(ei);

  fs.writeFileSync(HTML_FILE, html, 'utf8');

  console.log(`\n✅  ${allStones.length} stone${allStones.length!==1?'s':''} embedded into ${path.basename(HTML_FILE)}`);
  if (allStones.length) {
    console.log(`    Ranges:  ${[...new Set(allStones.map(s=>s.rangeLabel))].join(', ')}`);
    console.log(`    Colours: ${[...new Set(allStones.map(s=>s.colour))].sort().join(', ')}`);
  }
  console.log('\n    → Refresh your browser.\n');
}

buildCatalog();
