#!/usr/bin/env node
/**
 * HARGOBIND MARBLE — CATALOG SCANNER  v5
 *
 * THREE folder structures handled automatically:
 *
 * STANDARD (2-level):
 *   images/<range>/<colour>/
 *     green.jpg          → Slab
 *     green.1.jpg        → Backlit
 *     green.2.jpg        → Installed
 *
 * VARIETY (3-level):
 *   images/<range>/<colour>/<variety>/
 *     any-image.jpg      → Slab (first)
 *     any-image.1.jpg    → Backlit / additional
 *
 * CARVINGS (special — numbered sub-folders, slab/design naming):
 *   images/marble-carvings/
 *     1/
 *       slab.jpg         → Slab
 *       slab1.jpg        → Slab (additional)
 *       design.jpg       → Design
 *       design1.jpg      → Design (additional)
 *     2/ ...
 *   → Tiles labelled in Roman numerals: I, II, III …
 *
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

// Folders to skip in the regular stone loop (handled separately)
const SKIP_RANGES = new Set(['marble-carvings']);

const COLOUR_MAP = [
  ['honey light','Honey'],['light honey','Honey'],['golden','Gold'],
  ['green','Green'],['white','White'],['honey','Honey'],['gold','Gold'],
  ['blue','Blue'],['grey','Grey'],['gray','Grey'],['pink','Pink'],
  ['yellow','Yellow'],['red','Red'],['brown','Brown'],['black','Black'],
  ['purple','Purple'],['orange','Orange'],['beige','Beige'],['cream','Cream'],
  ['multi','Multi'],['ornamental','Multi'],
];

const IMG_EXTS = new Set(['.jpg','.jpeg','.png','.webp','.JPG','.JPEG','.PNG','.WEBP']);

// Roman numeral converter (handles 1–99)
function toRoman(n) {
  const vals = [50,40,10,9,5,4,1];
  const syms = ['L','XL','X','IX','V','IV','I'];
  let result = '';
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
}

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

// ══════════════════════════════════════════════════════
// CARVINGS SCANNER
// images/marble-carvings/<number>/ → one tile each
// Files named slab*, slab1*, slab2* → tag "Slab"
// Files named design*, design1* … → tag "Design"
// Tile label = Roman numeral (I, II, III …)
// Sorted by numeric folder name
// ══════════════════════════════════════════════════════
function scanCarvings(rangeFolder) {
  const dir = path.join(IMAGES_DIR, rangeFolder);
  if (!fs.existsSync(dir)) return [];

  const subFolders = fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory())
    .sort((a, b) => {
      // Sort numerically if folder names are numbers
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

  const stones = [];

  subFolders.forEach((subFolder, index) => {
    const subPath = path.join(dir, subFolder);
    const files   = fs.readdirSync(subPath).filter(isImage).sort();
    if (!files.length) return;

    const images  = [];
    let slabPath  = null;

    for (const file of files) {
      const baseLower = file.toLowerCase().replace(/\.[^.]+$/, ''); // strip extension
      const relPath   = `images/${rangeFolder}/${subFolder}/${file}`;

      // Classify by filename prefix
      if (baseLower.startsWith('slab')) {
        if (!slabPath) slabPath = relPath;          // first slab = thumbnail
        images.push({ src: relPath, tag: 'Slab' });
      } else if (baseLower.startsWith('design')) {
        images.push({ src: relPath, tag: 'Design' });
      } else {
        // Unknown name — treat as slab if no slab yet, otherwise Design
        if (!slabPath) {
          slabPath = relPath;
          images.unshift({ src: relPath, tag: 'Slab' });
        } else {
          images.push({ src: relPath, tag: 'Design' });
        }
      }
    }

    // Fallback if no slab-named file found
    if (!slabPath && images.length) {
      slabPath = images[0].src;
      images[0].tag = 'Slab';
    }
    if (!slabPath) return;

    // Roman numeral label
    const folderNum = parseInt(subFolder, 10);
    const roman     = !isNaN(folderNum) ? toRoman(folderNum) : toRoman(index + 1);
    const name      = 'Stone Carving ' + roman;

    stones.push({
      id:         `${rangeFolder}__${subFolder}`.replace(/[\s]+/g, '-'),
      name:       name,
      range:      rangeFolder,
      rangeLabel: 'Stone Carving',
      colour:     'Multi',
      slab:       slabPath,
      images:     images,
      isCarving:  true,          // flag for website JS
    });
  });

  return stones;
}

// ══════════════════════════════════════════════════════
// STANDARD SCANNER (2-level)
// ══════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════
// VARIETY SCANNER (3-level)
// ══════════════════════════════════════════════════════
function scanColourFolder_variety(rangeFolder, colourFolder, dirPath, subFolders) {
  const rangeLabel = RANGE_LABELS[rangeFolder] || toTitle(rangeFolder);
  const colour     = detectColour(colourFolder);
  const stones     = [];

  for (const varietyFolder of subFolders) {
    const varietyPath = path.join(dirPath, varietyFolder);
    const files = fs.readdirSync(varietyPath).filter(isImage).sort();
    if (!files.length) continue;

    const images  = [];
    let slabPath  = null;

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
        slabPath = relPath;
        images.unshift({ src: relPath, tag: 'Slab' });
      } else {
        images.push({ src: relPath, tag: 'Installed' });
      }
    }

    if (!slabPath && images.length) { slabPath = images[0].src; images[0].tag = 'Slab'; }
    if (!slabPath) continue;

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

// ── Auto-detect structure per colour folder ──
function scanColourFolder(rangeFolder, colourFolder) {
  const dirPath    = path.join(IMAGES_DIR, rangeFolder, colourFolder);
  const entries    = fs.readdirSync(dirPath);
  const subDirs    = entries.filter(f => fs.statSync(path.join(dirPath, f)).isDirectory());
  const imageFiles = entries.filter(isImage);

  if (subDirs.length > 0 && imageFiles.length === 0) {
    return scanColourFolder_variety(rangeFolder, colourFolder, dirPath, subDirs.sort());
  } else {
    return scanColourFolder_standard(rangeFolder, colourFolder, dirPath);
  }
}

// ══════════════════════════════════════════════════════
// MAIN BUILD
// ══════════════════════════════════════════════════════
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

    // ── Special: marble-carvings ──
    if (rangeFolder === 'marble-carvings') {
      const carvings = scanCarvings(rangeFolder);
      for (const s of carvings) {
        allStones.push(s);
        console.log(`  ✓  [carvings]  ${s.name.padEnd(24)} [${s.images.map(i=>i.tag).join(' + ')}]`);
      }
      continue;
    }

    // Skip any other special folders added to SKIP_RANGES
    if (SKIP_RANGES.has(rangeFolder)) continue;

    // ── Regular stone ranges ──
    const colourFolders = fs.readdirSync(path.join(IMAGES_DIR, rangeFolder))
      .filter(f => fs.statSync(path.join(IMAGES_DIR, rangeFolder, f)).isDirectory()).sort();

    for (const colourFolder of colourFolders) {
      try {
        const stones = scanColourFolder(rangeFolder, colourFolder);
        for (const s of stones) {
          allStones.push(s);
          const struct = s.id.split('__').length > 2 ? '3-level' : '2-level';
          console.log(`  ✓  [${struct}]   ${s.rangeLabel.padEnd(14)} ${s.name.padEnd(32)} [${s.images.map(i=>i.tag).join(' + ')}]`);
        }
      } catch(e) {
        console.warn(`  ⚠  Skipped ${rangeFolder}/${colourFolder}: ${e.message}`);
      }
    }
  }

  if (!allStones.length) {
    console.warn('\n⚠️  No stones found.');
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
  const colours = [...new Set(allStones.filter(s=>!s.isCarving).map(s => s.colour))].sort().join(', ');
  console.log(`\n✅  ${allStones.length} item${allStones.length!==1?'s':''} embedded into ${path.basename(HTML_FILE)}`);
  console.log(`    Ranges:   ${ranges || '(none)'}`);
  console.log(`    Colours:  ${colours || '(none)'}`);
  console.log('\n    → Refresh your browser.\n');
}

buildCatalog();
