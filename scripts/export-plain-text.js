#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * Bidirectional sync between src/content/projects/*.md and the
 * "Plain Text" folder in the Personal Projects directory.
 *
 * ── txt FORMAT ───────────────────────────────────────────────────────────────
 *
 *   [BLACK] <text>        — project description (black text, top of page)
 *   [DROPCAP] HEADING     — section heading in a feature project (drop-cap)
 *   [SECTION] HEADING     — section heading in a standard project
 *   (plain text)          — body prose (red text on the page)
 *
 *   #carousel: alt1 | alt2 | ...   — existing carousel (keep as-is)
 *   #grid: alt1 | alt2 | ...        — existing image grid
 *   #hero pair: alt1 | alt2         — existing hero pair
 *   #hero trio: alt1 | alt2 | alt3  — existing hero trio
 *   #image: alt                     — existing standalone image
 *
 *   +carousel: ...   — add / replace with a carousel  ← flagged for Claude to implement
 *   +grid: ...       — add / replace with a grid
 *   +image: ...      — add / replace an image
 *   (etc.)
 *
 * The # lines serve as positional anchors: prose before the first #,
 * between two #s, and after the last # maps directly to the corresponding
 * prose zones in the markdown — no fuzzy matching needed.
 *
 * Removing a # line = delete that structure from the md.
 * Replacing # with + = flag that change for Claude to implement.
 *
 * ── DIRECTIONS ───────────────────────────────────────────────────────────────
 *
 *   md → txt  (export):  strip formatting, describe structures as # lines
 *   txt → md  (import):  sync prose edits back, flag + lines for review
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/export-plain-text.js          # export only
 *   node scripts/export-plain-text.js --sync   # import changed, then export
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync }                                  from 'fs';
import { join, basename }                              from 'path';
import { fileURLToPath }                               from 'url';
import { execSync }                                    from 'child_process';

const __dirname   = fileURLToPath(new URL('.', import.meta.url));
const ROOT        = join(__dirname, '..');
const SRC         = join(ROOT, 'src/content/projects');
const DEST        = '/Users/raphael/Documents/Personal Projects/Portfolio Website (git)/Plain Text';
const CACHE_FILE  = join(DEST, '.export-times.json');
const REVIEW_FILE = join(DEST, '.pending-review');

// Projects using the enlarged-body + drop-cap "feature" layout.
// Keep in sync with the FEATURE array in src/pages/[slug].astro.
const FEATURE = new Set(['keycaps', 'exploration']);

// ── Timestamp cache ───────────────────────────────────────────────────────────

async function loadCache() {
  try { return JSON.parse(await readFile(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}
async function saveCache(cache) {
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ── md → txt helpers ──────────────────────────────────────────────────────────

/** Extract a quoted string field from YAML frontmatter. */
function extractFrontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^---[\\s\\S]*?\\n${field}:\\s*"([^"]*)"[\\s\\S]*?---`, 'm'));
  return m ? m[1] : null;
}

/** Strip only inline formatting (bold, italic, links, entities) — not structure. */
function stripProseFormatting(text) {
  return text
    .replace(/\*{3}(.+?)\*{3}/g, '$1')
    .replace(/\*{2}(.+?)\*{2}/g, '$1')
    .replace(/\*(.+?)\*/g,        '$1')
    .replace(/_(.+?)_/g,          '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // md images (shouldn't be loose prose)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // md links → visible text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'");
}

/**
 * Given a structure chunk, produce a human-readable # description line.
 * Returns null for unknown/unrecognised structures.
 */
function describeStructure(chunk) {
  const html = chunk.raw;

  // Collect alt texts from img tags; fall back to filename if alt is empty
  const imgMatches = [...html.matchAll(/<img[^>]*>/gi)];
  const alts = imgMatches.map(m => {
    const altM = m[0].match(/alt="([^"]*)"/i);
    const srcM = m[0].match(/src="([^"]*)"/i);
    const alt  = altM?.[1]?.trim();
    if (alt) return alt;
    // Fall back to filename
    const src = srcM?.[1] ?? '';
    return src.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }).filter(Boolean);

  // Also handle standalone markdown images  ![alt](src)
  const mdImgs = [...html.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)];
  for (const m of mdImgs) {
    const alt = m[1]?.trim() || m[2].split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    alts.push(alt);
  }

  if (alts.length === 0) return null;
  const desc = alts.join(' | ');

  if (html.includes('class="carousel"'))   return `#carousel: ${desc}`;
  if (html.includes('class="img-grid"'))   return `#grid: ${desc}`;
  if (html.includes('class="hero-trio"'))  return `#hero trio: ${desc}`;
  if (html.includes('class="hero-pair"'))  return `#hero pair: ${desc}`;
  // Generic div with images
  return `#images: ${desc}`;
}

/**
 * Given a single-line inline image (markdown ![]()), produce a # line.
 */
function describeInlineImage(line) {
  const mdM = line.match(/!\[([^\]]*)\]\(([^)]*)\)/);
  if (mdM) {
    const alt = mdM[1]?.trim() ||
      mdM[2].split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    return `#image: ${alt}`;
  }
  const htmlM = line.match(/src="([^"]*)"[^>]*alt="([^"]*)"/i);
  if (htmlM) {
    const alt = htmlM[2]?.trim() ||
      htmlM[1].split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    return `#image: ${alt}`;
  }
  return null;
}

// ── md body → chunks ──────────────────────────────────────────────────────────

/** Parse a section body into alternating prose / structure blocks. */
function parseMdChunks(body) {
  const lines  = body.split('\n');
  const chunks = [];
  let cur      = { isStructure: false, lines: [] };
  let depth    = 0;

  const push = () => {
    if (cur.lines.length > 0) {
      chunks.push({ isStructure: cur.isStructure, lines: cur.lines, raw: cur.lines.join('\n') });
    }
    cur = { isStructure: false, lines: [] };
  };

  for (const line of lines) {
    const openMatch = line.match(/^\s*<(div|aside|figure|section)(\s[^>]*)?>$/);
    if (openMatch && depth === 0) {
      push(); cur = { isStructure: true, lines: [line] }; depth = 1; continue;
    }
    if (depth > 0) {
      cur.lines.push(line);
      depth += (line.match(/<(div|aside|figure|section)(\s[^>]*)?>/g) || []).length;
      depth -= (line.match(/<\/(div|aside|figure|section)>/g)          || []).length;
      if (depth <= 0) { depth = 0; push(); }
      continue;
    }
    // Single-line structure: inline markdown image or bare <img>
    if (/^!\[[^\]]*\]\([^)]*\)/.test(line) || /^<img[^>]*\/?>/.test(line)) {
      push(); chunks.push({ isStructure: true, lines: [line], raw: line, inline: true }); continue;
    }
    if (cur.isStructure) push();
    cur.lines.push(line);
  }
  push();
  return chunks;
}

/** Split md body into sections by ## headings. First entry = preamble. */
function splitMdSections(body) {
  const lines    = body.split('\n');
  const sections = [];
  let current    = { heading: '', headingLine: '', body: '', raw: '' };
  let bodyLines  = [];
  const flush = () => {
    current.body = bodyLines.join('\n');
    current.raw  = current.headingLine ? current.headingLine + '\n' + current.body : current.body;
    sections.push(current);
  };
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) { flush(); bodyLines = []; current = { heading: m[2], headingLine: line, body: '', raw: '' }; }
    else bodyLines.push(line);
  }
  flush();
  return sections;
}

// ── md → txt (export) ─────────────────────────────────────────────────────────

function mdToTxt(raw, slug) {
  const isFeature  = FEATURE.has(slug);
  const description = extractFrontmatterField(raw, 'description');

  // Remove frontmatter
  const body = raw.replace(/^---[\s\S]*?---\n?/, '');
  const sections = splitMdSections(body);

  const parts = [];
  if (description) parts.push(`[BLACK] ${description}`);

  for (const section of sections) {
    // Section heading
    if (section.heading) {
      const tag = isFeature ? '[DROPCAP]' : '[SECTION]';
      parts.push(`\n${tag} ${section.heading.toUpperCase()}`);
    }

    // Section body: alternate prose and # lines
    const chunks = parseMdChunks(section.body);
    for (const chunk of chunks) {
      if (chunk.isStructure) {
        const desc = chunk.inline ? describeInlineImage(chunk.raw) : describeStructure(chunk);
        if (desc) parts.push(`\n${desc}`);
      } else {
        let prose = stripProseFormatting(chunk.lines.join('\n'));
        // Collapse consecutive blank lines
        prose = prose.replace(/\n{3,}/g, '\n\n').trim();
        if (prose) parts.push(`\n${prose}`);
      }
    }
  }

  // Final clean-up: collapse 3+ blank lines, trim
  let txt = parts.join('\n');
  const lines = txt.split('\n').map(l => l.trimEnd());
  const collapsed = [];
  let lastBlank = false;
  for (const line of lines) {
    const blank = line === '';
    if (blank && lastBlank) continue;
    collapsed.push(line);
    lastBlank = blank;
  }
  return collapsed.join('\n').trim();
}

// ── txt → md (import) ─────────────────────────────────────────────────────────

/**
 * Parse a txt section body into segments:
 *   { type: 'prose', text }
 *   { type: '#',     text }   — existing structure marker
 *   { type: '+',     text }   — pending directive for Claude
 */
function parseTxtSegments(body) {
  const lines    = body.split('\n');
  const segments = [];
  let proseLines = [];

  const flushProse = () => {
    const text = proseLines.join('\n').trim();
    if (text) segments.push({ type: 'prose', text });
    proseLines = [];
  };

  for (const line of lines) {
    if (/^#[^#]/.test(line)) {          // # line (but not ## headings — those are stripped earlier)
      flushProse();
      segments.push({ type: '#', text: line });
    } else if (/^\+/.test(line)) {
      flushProse();
      segments.push({ type: '+', text: line });
    } else {
      proseLines.push(line);
    }
  }
  flushProse();
  return segments;
}

/**
 * Rebuild a section body: update prose zones (positionally aligned with # anchors),
 * keep structure blocks whose # markers are still present, remove those that are gone,
 * and collect any + directives.
 */
function updateSectionBody(mdBody, txtBody, pendingPlus) {
  const mdChunks   = parseMdChunks(mdBody);
  const txtSegs    = parseTxtSegments(txtBody);

  // Collect + directives
  for (const seg of txtSegs) {
    if (seg.type === '+') pendingPlus.push(seg.text);
  }

  // Has the txt format got any # markers at all?
  const hasTxtMarkers = txtSegs.some(s => s.type === '#');
  const mdStructures  = mdChunks.filter(c => c.isStructure);
  const txtMarkers    = txtSegs.filter(s => s.type === '#');
  const txtProseZones = txtSegs.filter(s => s.type === 'prose');
  const mdProseChunks = mdChunks.filter(c => !c.isStructure);

  // ── Case A: no # markers in txt → old format, positional prose only ────────
  // Keep all md structures, update prose using old-style distribution.
  if (!hasTxtMarkers) {
    const flatTxtProse = txtProseZones.map(z => z.text).join('\n\n');
    return updateProseOnly(mdBody, flatTxtProse);
  }

  // ── Case B: # markers present → use them as structure anchors ───────────────
  // prose zone N (between marker N-1 and N) → md prose zone N
  // # marker N present → keep md structure N
  // # marker N absent  → remove md structure N
  // + marker → pending (structure stays for now)

  // Check if prose changed
  const proseChanged = txtProseZones.some((zone, i) => {
    const mdProse = mdProseChunks[i]?.lines.join('\n').trim() ?? '';
    return normaliseForCompare(zone.text) !== normaliseForCompare(mdProse);
  });

  const structureChanged = mdStructures.length !== txtMarkers.length;

  if (!proseChanged && !structureChanged && pendingPlus.length === 0) {
    return mdBody; // nothing to do
  }

  // Build the new section body chunk by chunk
  const rebuiltParts = [];
  let proseZoneIdx   = 0;
  let structureIdx   = 0;

  // Walk md chunks; for each structure decide keep/remove; for each prose update
  for (const chunk of mdChunks) {
    if (!chunk.isStructure) {
      // Update this prose zone from txt
      const newProse   = txtProseZones[proseZoneIdx]?.text ?? '';
      const lead       = chunk.raw.match(/^\n*/)?.[0] ?? '';
      const trail      = chunk.raw.match(/\n*$/)?.[0] ?? '';
      rebuiltParts.push(lead + newProse.trim() + trail);
      proseZoneIdx++;
    } else {
      // Is there a matching # marker at this position in the txt?
      if (structureIdx < txtMarkers.length) {
        // Keep this structure
        rebuiltParts.push(chunk.raw);
      }
      // If no marker at this position, the structure is omitted (deleted)
      structureIdx++;
    }
  }

  return rebuiltParts.join('');
}

/** Fallback for txt files without # markers: use fuzzy paragraph distribution. */
function updateProseOnly(mdBody, newProseFlat) {
  const chunks      = parseMdChunks(mdBody);
  const proseChunks = chunks.filter(c => !c.isStructure);
  const origProse   = proseChunks.map(c => c.lines.join('\n').trim());
  const origFlat    = origProse.join('\n\n');

  if (normaliseForCompare(origFlat) === normaliseForCompare(newProseFlat)) return mdBody;

  const newParas    = splitParagraphs(newProseFlat);
  const distributed = distributeParagraphs(origProse, newParas);

  let proseIdx = 0;
  const rebuiltParts = [];
  for (const chunk of chunks) {
    if (chunk.isStructure) {
      rebuiltParts.push(chunk.raw);
    } else {
      const updated = distributed[proseIdx++] ?? '';
      const lead    = chunk.raw.match(/^\n*/)?.[0] ?? '';
      const trail   = chunk.raw.match(/\n*$/)?.[0] ?? '';
      rebuiltParts.push(lead + updated.trim() + trail);
    }
  }
  return rebuiltParts.join('');
}

/** Normalise heading text for matching: "INITIAL IDEAS" ↔ "Initial ideas" */
function normaliseHeading(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normaliseForCompare(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function splitParagraphs(text) {
  return (text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
}

// ── Fuzzy distribution (fallback for old txt files without # markers) ─────────

function distributeParagraphs(origZones, newParas) {
  if (origZones.length === 0) return [];
  if (origZones.length === 1) return [newParas.join('\n\n')];
  const origParas   = origZones.flatMap(z => splitParagraphs(z));
  const sim         = origParas.map(op => newParas.map(np => jaccardSimilarity(op, np)));
  const assignments = assignParas(origParas, newParas, sim);
  const cumul       = cumulative(origZones.map(z => splitParagraphs(z).length));
  const zones       = origZones.map(() => []);
  newParas.forEach((para, ni) => {
    const oi = assignments[ni];
    const zi = cumul.findIndex(c => oi < c);
    zones[zi >= 0 ? zi : zones.length - 1].push(para);
  });
  return zones.map(z => z.join('\n\n'));
}
function assignParas(orig, next, sim) {
  const a = new Array(next.length).fill(0);
  let ptr = 0;
  for (let ni = 0; ni < next.length; ni++) {
    let best = -1, bi = ptr;
    for (let oi = ptr; oi < orig.length; oi++) if (sim[oi][ni] > best) { best = sim[oi][ni]; bi = oi; }
    a[ni] = bi;
    if (best > 0.4 && bi === ptr && ptr < orig.length - 1) ptr++;
  }
  return a;
}
function jaccardSimilarity(a, b) {
  const wa = new Set((a || '').toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set((b || '').toLowerCase().split(/\W+/).filter(Boolean));
  let inter = 0; for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}
function cumulative(arr) { let s = 0; return arr.map(n => { s += n; return s; }); }

// ── Split txt into sections ────────────────────────────────────────────────────

/**
 * Split a txt string into sections.
 * Headings are [DROPCAP] / [SECTION] tagged lines, or legacy bare-uppercase lines.
 */
function splitTxtSections(txt) {
  const lines    = txt.split('\n');
  const sections = [];
  let current    = { heading: '', body: '' };
  let bodyLines  = [];
  const flush = () => { current.body = bodyLines.join('\n').trim(); sections.push(current); };
  for (const line of lines) {
    // Skip [BLACK] line — handled separately
    if (/^\[BLACK\]/.test(line)) { bodyLines.push(line); continue; }
    const taggedM = line.match(/^\[(DROPCAP|SECTION)\]\s+(.+)$/);
    if (taggedM) { flush(); bodyLines = []; current = { heading: taggedM[2].trim(), body: '' }; continue; }
    // Legacy bare uppercase
    if (/^[A-Z][A-Z0-9\s&,'\/\-]+$/.test(line.trim()) && line.trim().length > 2 && !/^#/.test(line)) {
      flush(); bodyLines = []; current = { heading: line.trim(), body: '' }; continue;
    }
    bodyLines.push(line);
  }
  flush();
  return sections;
}

// ── Main rebuild ───────────────────────────────────────────────────────────────

function rebuildMdFromTxt(originalMd, newTxt, slug) {
  let updatedMd = originalMd;
  let txtBody   = newTxt;

  // ── Handle [BLACK] description ──────────────────────────────────────────────
  const blackMatch = newTxt.match(/^\[BLACK\]\s+(.+?)(?:\n|$)/m);
  if (blackMatch) {
    const newDesc = blackMatch[1].trim();
    updatedMd = updatedMd.replace(
      /(^---[\s\S]*?\ndescription:\s*)"[^"]*"([\s\S]*?---)/m,
      `$1"${newDesc}"$2`
    );
    txtBody = newTxt.replace(/^\[BLACK\]\s+.+\n?/, '').replace(/^\n+/, '');
  }

  // ── Split md body ────────────────────────────────────────────────────────────
  const fmMatch     = updatedMd.match(/^(---[\s\S]*?---\n)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const mdBody      = updatedMd.slice(frontmatter.length);
  const mdSections  = splitMdSections(mdBody);

  // ── Split txt body ───────────────────────────────────────────────────────────
  const txtSections = splitTxtSections(txtBody);
  const txtByKey    = new Map(txtSections.map(s => [normaliseHeading(s.heading), s.body]));

  // ── Rebuild each section ─────────────────────────────────────────────────────
  const pendingPlus = [];
  const rebuilt = mdSections.map(section => {
    if (!section.heading) {
      const txtProse = txtSections[0]?.heading === '' ? txtSections[0].body : null;
      if (!txtProse) return section.raw;
      return updateSectionBody(section.body, txtProse, pendingPlus);
    }
    const key      = normaliseHeading(section.heading);
    const txtProse = txtByKey.get(key);
    if (txtProse === undefined) return section.raw;
    const updatedBody = updateSectionBody(section.body, txtProse, pendingPlus);
    return '\n' + section.headingLine + '\n' + updatedBody;
  });

  return { md: frontmatter + rebuilt.join(''), pendingPlus };
}

// ── Orchestration ──────────────────────────────────────────────────────────────

async function exportAll(cache) {
  await mkdir(DEST, { recursive: true });
  const files = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const slug    = basename(file, '.md');
    const outPath = join(DEST, slug + '.txt');
    const raw     = await readFile(join(SRC, file), 'utf8');
    const txt     = mdToTxt(raw, slug);
    await writeFile(outPath, txt, 'utf8');
    cache[slug] = (await stat(outPath)).mtimeMs;
    console.log(`  ✓  ${file}  →  ${slug}.txt`);
  }
}

async function importChanged(cache) {
  await mkdir(DEST, { recursive: true });
  const files       = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  const synced      = [];
  const allPlus     = {};

  for (const file of files) {
    const slug    = basename(file, '.md');
    const txtPath = join(DEST, slug + '.txt');
    const mdPath  = join(SRC, file);

    if (!existsSync(txtPath)) continue;

    const lastExport = cache[slug] ?? 0;
    const txtMtime   = (await stat(txtPath)).mtimeMs;
    if (txtMtime <= lastExport) continue;

    const originalMd = await readFile(mdPath, 'utf8');
    const newTxt     = await readFile(txtPath, 'utf8');
    const { md: updatedMd, pendingPlus } = rebuildMdFromTxt(originalMd, newTxt, slug);

    if (pendingPlus.length > 0) {
      allPlus[slug] = pendingPlus;
    }

    if (updatedMd === originalMd && pendingPlus.length === 0) {
      console.log(`  ○  ${slug}.txt  unchanged, skipping`);
      continue;
    }

    if (updatedMd !== originalMd) {
      await writeFile(mdPath, updatedMd, 'utf8');
      try { execSync(`git -C "${ROOT}" add "${mdPath}"`, { stdio: 'inherit' }); }
      catch { console.warn(`  !  Could not git-add ${file}`); }
    }

    const plusNote = pendingPlus.length > 0 ? `  [${pendingPlus.length} pending +]` : '';
    console.log(`  ↑  ${slug}.txt  →  ${file}  (synced + staged)${plusNote}`);
    synced.push(slug);
  }

  return { synced, allPlus };
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const doSync = process.argv.includes('--sync');
  await mkdir(DEST, { recursive: true });
  const cache = await loadCache();

  let synced = [], allPlus = {};

  if (doSync) {
    ({ synced, allPlus } = await importChanged(cache));
    if (synced.length > 0) console.log(`\nImported ${synced.length} edited file(s) into md.\n`);
  }

  console.log('Exporting md → txt...');
  await exportAll(cache);
  await saveCache(cache);

  // Write .pending-review if there's anything to action
  if (synced.length > 0 || Object.keys(allPlus).length > 0) {
    const lines = [
      `Synced at: ${new Date().toISOString()}`,
      synced.length > 0 ? `Files synced:   ${synced.join(', ')}` : null,
      Object.keys(allPlus).length > 0
        ? `Pending + directives:\n${Object.entries(allPlus)
            .map(([slug, lines]) => `  ${slug}:\n${lines.map(l => `    ${l}`).join('\n')}`)
            .join('\n')}`
        : null,
      '',
      'Ask Claude to check formatting and implement any + directives.',
    ].filter(l => l !== null).join('\n');
    await writeFile(REVIEW_FILE, lines, 'utf8');
  }

  console.log(`\nDone. Plain Text folder:\n  ${DEST}\n`);
  return { synced, allPlus };
}

main().then(({ synced, allPlus }) => {
  const hasPending = Object.keys(allPlus ?? {}).length > 0;
  if (synced?.length > 0 || hasPending) {
    console.log('─'.repeat(60));
    console.log('⚠  FORMATTING REVIEW NEEDED');
    if (synced?.length > 0) console.log(`   Prose synced: ${synced.join(', ')}`);
    if (hasPending) {
      console.log('   Pending + directives:');
      for (const [slug, lines] of Object.entries(allPlus)) {
        console.log(`     ${slug}: ${lines.join(' | ')}`);
      }
    }
    console.log('   Ask Claude to check formatting and act on any + directives.');
    console.log('─'.repeat(60));
  }
}).catch(err => { console.error(err); process.exit(1); });
