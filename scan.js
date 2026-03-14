#!/usr/bin/env node
/**
 * HARGOBIND MARBLE — CATALOG SCANNER  v4
 *
 * Handles TWO folder structures automatically — no config needed:
 *
 * STANDARD (2-level):             images/onyx/green/green.jpg
 *   images/<range>/<colour>/      images/onyx/yellow/yellow1.jpg
 *     <name>.jpg        → Slab                     yellow1.1.jpg
 *     <name>.1.jpg      → Backlit
 *     <name>.2.jpg …    → Installed
 *
 * VARIETY (3-level):              images/satwario/white/Satwario/
 *   images/<range>/<colour>/      images/satwario/white/Angelo White/
 *     <variety-name>/             images/satwario/white/Calcutta Gold/
 *       any-image.jpg   → Slab (first)
 *       any-image.1.jpg → Backlit
 *       any-image.2.jpg → Installed
 *
 * The scanner auto-detects which structure each colour folder uses.
 * Run: node scan.js
 */

const fs   = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'images');

function findHtmlFile() {
  const files = fs.readdirSync(__dirname).filter(f => f.toLowerCase().endsWith('.html'));
  if (!files.length) return null;
  const preferred = files.find(f => /marble|website|index/i.test(f));
  return path.join(__dirname, preferred || files[0]);
}
const HTML_FILE = findHtmlFile();

const RANGE_LABELS = {
  'onyx':'Onyx','granite':'Granite','italian-marble':'Italian Marble',
  'indian-marble':'Indian Marble','satwario':'Satwario','vietnam':'Vietnam',
  'travertin':'Travertin','travertine':'Travertin','limestone':'Limestone',
  'brazilian':'Brazilian',
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
  return str.replace(/[-_]+/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function isImage(f) { return IMG_EXTS.has(path.extname(f)); }

// Parse "yellow1.1.jpg" → { base:"yellow1", suffix:1 }
function parseFilename(filename) {
  const ext   = path.extname(filename);
  const noExt = filename.slice(0, filename.length - ext.length);
  const parts = noExt.split('.');
  if (parts.length === 1) return { base: parts[0], suffix: null };
  const lastPart  = parts[parts.length - 1];
  const suffixNum = parseInt(lastPart, 10);
  if (!isNaN(suffixNum)) return { base: parts.slice(0, -1).join('.'), suffix: suffixNum };
  return { base: noExt, suffix: null };
}

// ── STANDARD scan: images files directly in the colour folder ──
function scanColourFolder_standard(rangeFolder, colourFolder, dirPath) {
  const files = fs.readdirSync(dirPath).filter(isImage).sort();
  if (!files.length) return [];

  const groups = new Map();
  for (const file of files) {
    const { base, suffix } = parseFilename(file);
    const relPath = `images/${rangeFolder}/${colourFolder}/${file}`;
    if (!groups.has(base)) groups.set(base, { slab: null, images: [] });
    const g = groups.get(base);
    if (suffix === null) {
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
    if (!g.slab && g.images.length) { g.slab = g.images[0].src; g.images[0].tag = 'Slab'; }
    if (!g.slab) continue;

    const colourLower = colourFolder.toLowerCase();
    const baseLower   = base.toLowerCase();
    const numPart     = baseLower.startsWith(colourLower)
      ? baseLower.slice(colourLower.length).trim() : base;
    const displayName = numPart
      ? toTitle(colourFolder) + ' ' + numPart + ' ' + rangeLabel
      : toTitle(colourFolder) + ' ' + rangeLabel;

    stones.push({
      id:         `${rangeFolder}__${colourFolder}__${base}`.replace(/[\s]+/g, '-'),
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

// ── VARIETY scan: sub-folders inside the colour folder ──
// Each sub-folder = one named stone variety
function scanColourFolder_variety(rangeFolder, colourFolder, dirPath, subFolders) {
  const rangeLabel = RANGE_LABELS[rangeFolder] || toTitle(rangeFolder);
  const colour     = detectColour(colourFolder);
  const stones     = [];

  for (const varietyFolder of subFolders) {
    const varietyPath = path.join(dirPath, varietyFolder);
    const files = fs.readdirSync(varietyPath).filter(isImage).sort();
    if (!files.length) continue;

    // Build images: first file without numeric suffix = slab,
    // .1 = backlit, .2+ = installed
    const images = [];
    let slabPath = null;

    for (const file of files) {
      const { suffix } = parseFilename(file);
      const relPath = `images/${rangeFolder}/${colourFolder}/${varietyFolder}/${file}`;
      if (suffix === null && !slabPath) {
        slabPath = relPath;
        images.unshift({ src: relPath, tag: 'Slab' });
      } else if (suffix === 1) {
        images.push({ src: relPath, tag: 'Backlit' });
      } else if (suffix !== null && suffix >= 2) {
        images.push({ src: relPath, tag: 'Installed' });
      } else if (!slabPath) {
        // fallback: any file becomes slab
        slabPath = relPath;
        images.unshift({ src: relPath, tag: 'Slab' });
      } else {
        images.push({ src: relPath, tag: 'Installed' });
      }
    }

    if (!slabPath && images.length) {
      slabPath = images[0].src;
      images[0].tag = 'Slab';
    }
    if (!slabPath) continue;

    // Display name = variety folder name + range label
    // e.g. "Angelo White Satwario", "Satwario Premium Satwario"
    // Avoid "Satwario Satwario" — if variety name already contains range, use it alone
    const varietyTitle = toTitle(varietyFolder);
    const displayName  = varietyTitle.toLowerCase().includes(rangeLabel.toLowerCase())
      ? varietyTitle
      : varietyTitle + ' ' + rangeLabel;

    stones.push({
      id:         `${rangeFolder}__${colourFolder}__${varietyFolder}`.replace(/[\s]+/g, '-'),
      name:       displayName,
      range:      rangeFolder,
      rangeLabel: rangeLabel,
      colour:     colour,
      slab:       slabPath,
      images:     images,
    });
  }
  return stones;
}

// ── Main: auto-detect which structure each colour folder uses ──
function scanColourFolder(rangeFolder, colourFolder) {
  const dirPath = path.join(IMAGES_DIR, rangeFolder, colourFolder);
  const entries = fs.readdirSync(dirPath);

  const subDirs   = entries.filter(f => fs.statSync(path.join(dirPath, f)).isDirectory());
  const imageFiles = entries.filter(isImage);

  if (subDirs.length > 0 && imageFiles.length === 0) {
    // All sub-folders, no direct images → VARIETY structure
    return scanColourFolder_variety(rangeFolder, colourFolder, dirPath, subDirs.sort());
  } else {
    // Image files directly present → STANDARD structure
    return scanColourFolder_standard(rangeFolder, colourFolder, dirPath);
  }
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
          const struct = s.id.split('__').length > 2 ? '3-level' : '2-level';
          console.log(`  ✓  [${struct}]  ${s.rangeLabel.padEnd(12)} ${s.name.padEnd(36)} [${s.images.map(i=>i.tag).join(' + ')}]`);
        }
      } catch(e) {
        console.warn(`  ⚠  Skipped ${rangeFolder}/${colourFolder}: ${e.message}`);
      }
    }
  }

  if (!allStones.length) {
    console.warn('\n⚠️  No stones found.');
    console.warn('    Standard:  images/onyx/green/green.jpg');
    console.warn('    Variety:   images/satwario/white/Angelo White/angelo.jpg\n');
  }

  const catalog = { generated: new Date().toISOString(), stones: allStones };

  let html = fs.readFileSync(HTML_FILE, 'utf8');
  const S = '/* CATALOG_START */';
  const E = '/* CATALOG_END */';
  const si = html.indexOf(S), ei = html.indexOf(E);

  if (si === -1 || ei === -1) {
    console.error('\n❌  CATALOG markers not found in HTML.\n');
    process.exit(1);
  }

  html = html.slice(0, si + S.length) +
         `\nwindow.__CATALOG = ${JSON.stringify(catalog, null, 2)};\n` +
         html.slice(ei);
  fs.writeFileSync(HTML_FILE, html, 'utf8');

  const ranges  = [...new Set(allStones.map(s => s.rangeLabel))].join(', ');
  const colours = [...new Set(allStones.map(s => s.colour))].sort().join(', ');
  console.log(`\n✅  ${allStones.length} stone${allStones.length!==1?'s':''} embedded into ${path.basename(HTML_FILE)}`);
  console.log(`    Ranges:  ${ranges || '(none)'}`);
  console.log(`    Colours: ${colours || '(none)'}`);
  console.log('\n    → Refresh your browser.\n');
}

buildCatalog();
