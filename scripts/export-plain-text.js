#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * Bidirectional sync between src/content/projects/*.md and the
 * "Plain Text" folder in the Personal Projects directory.
 *
 * Directions:
 *   md  →  txt  (export):  strip formatting, write clean prose files
 *   txt →  md   (import):  sync user edits back into the md, preserving
 *                          all structure (images, carousels, grids, etc.)
 *
 * Called from the pre-commit hook, which:
 *   1. Detects any txt files the user edited (mtime > last export timestamp)
 *   2. Imports those back into the md and `git add`s the md
 *   3. Exports all md → txt and refreshes timestamps
 *
 * Usage (manual):
 *   node scripts/export-plain-text.js          # export only
 *   node scripts/export-plain-text.js --sync   # check + import changed, then export
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync }                                  from 'fs';
import { join, basename }                              from 'path';
import { fileURLToPath }                               from 'url';
import { execSync }                                    from 'child_process';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const ROOT       = join(__dirname, '..');
const SRC        = join(ROOT, 'src/content/projects');
const DEST       = '/Users/raphael/Documents/Personal Projects/Portfolio Website (git)/Plain Text';
const CACHE_FILE = join(DEST, '.export-times.json');

// ── Timestamp cache ───────────────────────────────────────────────────────────

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ── md → txt (export) ─────────────────────────────────────────────────────────

function stripMarkdownToPlainText(raw) {
  let text = raw;

  // Remove YAML frontmatter
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // Remove HTML self-closing / void tags
  text = text.replace(/<img[^>]*\/?>/gi, '');
  text = text.replace(/<br\s*\/?>/gi,    '\n');
  text = text.replace(/<hr\s*\/?>/gi,    '');

  // Remove block-level HTML containers (keep inner content — handled next)
  text = text.replace(/<(div|aside|figure|section)[^>]*>/gi,  '');
  text = text.replace(/<\/(div|aside|figure|section)>/gi,     '');

  // Remove any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g,  '&')
             .replace(/&lt;/g,   '<')
             .replace(/&gt;/g,   '>')
             .replace(/&quot;/g, '"')
             .replace(/&#039;/g, "'");

  // Remove markdown images BEFORE processing links (otherwise the link regex
  // eats the [alt](url) part and leaves a stray "!" character)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Convert markdown headings → UPPERCASE plain labels
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_, title) => title.toUpperCase());

  // Remove bold / italic markers
  text = text.replace(/\*{3}(.+?)\*{3}/g, '$1')
             .replace(/\*{2}(.+?)\*{2}/g, '$1')
             .replace(/\*(.+?)\*/g,        '$1')
             .replace(/_(.+?)_/g,          '$1');

  // Remove markdown links, keep visible text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Collapse consecutive blank lines to a single blank line
  const lines = text.split('\n').map(l => l.trimEnd());
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
 * Given the original md content and the user's edited txt content,
 * return an updated md that incorporates the prose changes while
 * preserving all structure (images, carousels, grids, frontmatter).
 */
function rebuildMdFromTxt(originalMd, newTxt) {
  // ── 1. Preserve frontmatter verbatim ──────────────────────────────────────
  const fmMatch = originalMd.match(/^(---[\s\S]*?---\n)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const mdBody      = originalMd.slice(frontmatter.length);

  // ── 2. Split md body into sections separated by ## headings ───────────────
  const mdSections = splitMdSections(mdBody);

  // ── 3. Split txt into sections by UPPERCASE headings ──────────────────────
  const txtSections = splitTxtSections(newTxt);

  // Build lookup: normalised heading → txt prose
  const txtByKey = new Map(
    txtSections.map(s => [normaliseHeading(s.heading), s.body])
  );

  // ── 4. Rebuild each md section ────────────────────────────────────────────
  const rebuilt = mdSections.map((section, i) => {
    if (!section.heading) {
      // Preamble (before first ##)
      const txtProse = txtSections[0]?.heading === '' ? txtSections[0].body : null;
      if (!txtProse) return section.raw;
      // Preserve the trailing newlines that precede the next section heading
      const updatedBody = updateSectionProse(section.body, txtProse);
      return updatedBody;
    }
    const key = normaliseHeading(section.heading);
    const txtProse = txtByKey.get(key);
    if (txtProse === undefined) return section.raw;
    const updatedBody = updateSectionProse(section.body, txtProse);
    // md convention: blank line before ## heading
    return '\n' + section.headingLine + '\n' + updatedBody;
  });

  return frontmatter + rebuilt.join('');
}

/** Split md body into sections. First entry is the preamble (heading = ''). */
function splitMdSections(body) {
  const lines   = body.split('\n');
  const sections = [];
  let current    = { heading: '', headingLine: '', body: '', raw: '' };
  let bodyLines  = [];

  const flush = () => {
    current.body = bodyLines.join('\n');
    current.raw  = current.headingLine
      ? current.headingLine + '\n' + current.body
      : current.body;
    sections.push(current);
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      flush();
      bodyLines = [];
      current   = { heading: m[2], headingLine: line, body: '', raw: '' };
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

/** Split txt into sections. First entry covers any prose before the first heading. */
function splitTxtSections(txt) {
  const lines    = txt.split('\n');
  const sections = [];
  let current    = { heading: '', body: '' };
  let bodyLines  = [];

  const flush = () => {
    current.body = bodyLines.join('\n').trim();
    sections.push(current);
  };

  for (const line of lines) {
    // An uppercase-only line (letters, spaces, &, /, ,, -, ', digits) = heading
    if (/^[A-Z][A-Z0-9\s&,'\/\-]+$/.test(line.trim()) && line.trim().length > 2) {
      flush();
      bodyLines = [];
      current   = { heading: line.trim(), body: '' };
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

/** "INITIAL IDEAS" → "initial ideas" (for matching with md heading "Initial ideas") */
function normaliseHeading(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Given the body of one md section (may contain structure blocks) and the
 * new flat prose from the txt, rebuild the section body with updated prose
 * but unchanged structure (img grids, carousels, hero divs, etc.).
 */
function updateSectionProse(mdBody, newProseFlat) {
  // Parse body into alternating prose / structure chunks
  const chunks = parseMdChunks(mdBody);

  // Extract the original prose chunks (normalised for comparison)
  const proseChunks = chunks.filter(c => !c.isStructure);
  const origProse   = proseChunks.map(c => c.lines.join('\n').trim());
  const origFlat    = origProse.join('\n\n');

  // If unchanged, return as-is
  if (normaliseForCompare(origFlat) === normaliseForCompare(newProseFlat)) {
    return mdBody;
  }

  // Split the new flat prose into paragraphs
  const newParas = splitParagraphs(newProseFlat);

  // Distribute new paragraphs across the prose chunks using fuzzy matching
  const distributed = distributeParagraphs(origProse, newParas);

  // Reconstruct: replace prose chunk text while preserving the surrounding
  // blank-line separators exactly as they were in the original body.
  let proseIdx = 0;
  let result   = mdBody;

  // Work backwards through the chunks so offsets stay valid
  const rebuiltParts = [];
  for (const chunk of chunks) {
    if (chunk.isStructure) {
      rebuiltParts.push(chunk.raw);
    } else {
      const updated = distributed[proseIdx++] ?? '';
      // Preserve leading/trailing blank lines from the original prose chunk
      const origRaw    = chunk.raw;
      const leadBlanks = origRaw.match(/^\n*/)?.[0] ?? '';
      const trailBlanks = origRaw.match(/\n*$/)?.[0] ?? '';
      rebuiltParts.push(leadBlanks + updated + trailBlanks);
    }
  }

  result = rebuiltParts.join('');
  return result;
}

/**
 * Parse a section body into alternating prose and structure blocks.
 * Each chunk carries its original raw text so we can reconstruct
 * the document without losing blank-line separators.
 */
function parseMdChunks(body) {
  const lines  = body.split('\n');
  const chunks = [];
  let cur      = { isStructure: false, lines: [] };
  let depth    = 0;

  const push = () => {
    if (cur.lines.length > 0) {
      // Preserve the raw text for structure blocks; extract prose text for prose blocks
      chunks.push({
        isStructure: cur.isStructure,
        lines: cur.lines,
        // raw = what to emit unchanged if nothing changed
        raw: cur.lines.join('\n'),
      });
    }
    cur = { isStructure: false, lines: [] };
  };

  for (const line of lines) {
    const openMatch = line.match(/^\s*<(div|aside|figure|section)(\s[^>]*)?>$/);
    if (openMatch && depth === 0) {
      push();
      cur = { isStructure: true, lines: [line] };
      depth = 1;
      continue;
    }

    if (depth > 0) {
      cur.lines.push(line);
      const opens  = (line.match(/<(div|aside|figure|section)(\s[^>]*)?>/g) || []).length;
      const closes = (line.match(/<\/(div|aside|figure|section)>/g)          || []).length;
      depth += opens - closes;
      if (depth <= 0) { depth = 0; push(); }
      continue;
    }

    if (/^!\[[^\]]*\]\([^)]*\)/.test(line) || /^<img[^>]*\/?>/.test(line)) {
      push();
      chunks.push({ isStructure: true, lines: [line], raw: line });
      continue;
    }

    if (cur.isStructure) push();
    cur.lines.push(line);
  }
  push();
  return chunks;
}

/** Split flat prose text into paragraph strings. */
function splitParagraphs(text) {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);
}

/**
 * Distribute newParas across origProse zones.
 *
 * Strategy: for each original prose zone, find the paragraphs in newParas
 * that best correspond to it using fuzzy similarity.  The last zone absorbs
 * any additions or removals.
 */
function distributeParagraphs(origZones, newParas) {
  if (origZones.length === 0) return [];
  if (origZones.length === 1) return [newParas.join('\n\n')];

  // Build an N×M similarity matrix (orig paras vs new paras)
  const origParas = origZones.flatMap(z => splitParagraphs(z));
  const sim = buildSimilarityMatrix(origParas, newParas);

  // Greedy forward pass: assign each new para to the orig para it's most similar to
  const assignments = assignParas(origParas, newParas, sim);

  // Group by which orig zone each new para belongs to
  const origCumulative = cumulative(origZones.map(z => splitParagraphs(z).length));
  const zones = origZones.map(() => []);

  newParas.forEach((para, ni) => {
    const oi = assignments[ni]; // which orig para index
    // Find which zone this orig para belonged to
    const zoneIdx = origCumulative.findIndex(cum => oi < cum);
    zones[zoneIdx >= 0 ? zoneIdx : zones.length - 1].push(para);
  });

  return zones.map(z => z.join('\n\n'));
}

function buildSimilarityMatrix(orig, next) {
  return orig.map(op =>
    next.map(np => jaccardSimilarity(op, np))
  );
}

/** Assign each new paragraph to the closest original paragraph (greedy, forward). */
function assignParas(orig, next, sim) {
  const assignments = new Array(next.length).fill(0);
  let origPtr = 0;

  for (let ni = 0; ni < next.length; ni++) {
    // Find the best orig match from origPtr onwards
    let bestScore = -1;
    let bestOi    = origPtr;
    for (let oi = origPtr; oi < orig.length; oi++) {
      if (sim[oi][ni] > bestScore) { bestScore = sim[oi][ni]; bestOi = oi; }
    }
    assignments[ni] = bestOi;
    // If this new para closely matches an orig para, advance the pointer
    if (bestScore > 0.4 && bestOi === origPtr && origPtr < orig.length - 1) {
      origPtr++;
    }
  }
  return assignments;
}

/** Jaccard similarity on word sets. */
function jaccardSimilarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Cumulative sums, e.g. [2,3,1] → [2,5,6] */
function cumulative(arr) {
  let s = 0;
  return arr.map(n => { s += n; return s; });
}

function normaliseForCompare(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Orchestration ─────────────────────────────────────────────────────────────

async function exportAll(cache) {
  await mkdir(DEST, { recursive: true });
  const files = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  const now   = Date.now();

  for (const file of files) {
    const slug    = basename(file, '.md');
    const outPath = join(DEST, slug + '.txt');
    const raw     = await readFile(join(SRC, file), 'utf8');
    const txt     = stripMarkdownToPlainText(raw);
    await writeFile(outPath, txt, 'utf8');
    // Record the file's actual mtime AFTER the write so the comparison
    // `txtMtime <= lastExport` is exact rather than relying on Date.now().
    cache[slug] = (await stat(outPath)).mtimeMs;
    console.log(`  ✓  ${file}  →  ${slug}.txt`);
  }
}

async function importChanged(cache) {
  await mkdir(DEST, { recursive: true });
  const files = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  let changed  = 0;

  for (const file of files) {
    const slug    = basename(file, '.md');
    const txtPath = join(DEST, slug + '.txt');
    const mdPath  = join(SRC, file);

    if (!existsSync(txtPath)) continue; // no txt file yet

    const lastExport = cache[slug] ?? 0;
    const txtStat    = await stat(txtPath);
    const txtMtime   = txtStat.mtimeMs;

    // Only sync if the txt was modified after we last exported it
    if (txtMtime <= lastExport) continue;

    const originalMd = await readFile(mdPath, 'utf8');
    const newTxt     = await readFile(txtPath, 'utf8');

    const updatedMd  = rebuildMdFromTxt(originalMd, newTxt);
    if (updatedMd === originalMd) {
      console.log(`  ○  ${slug}.txt  unchanged prose, skipping`);
      continue;
    }

    await writeFile(mdPath, updatedMd, 'utf8');
    // Stage the md so it's included in the current commit
    try {
      execSync(`git -C "${ROOT}" add "${mdPath}"`, { stdio: 'inherit' });
    } catch {
      console.warn(`  !  Could not git-add ${file} — stage it manually`);
    }
    console.log(`  ↑  ${slug}.txt  →  ${file}  (synced + staged)`);
    changed++;
  }

  return changed;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const doSync = process.argv.includes('--sync');
  await mkdir(DEST, { recursive: true });

  const cache = await loadCache();

  if (doSync) {
    const n = await importChanged(cache);
    if (n > 0) console.log(`\nImported ${n} edited file(s) into md.\n`);
  }

  console.log('Exporting md → txt...');
  await exportAll(cache);
  await saveCache(cache);

  console.log(`\nDone. Plain Text folder:\n  ${DEST}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
