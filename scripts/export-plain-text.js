#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * Bidirectional sync between src/content/projects/*.md and the
 * "Plain Text" folder in the Personal Projects directory.
 *
 * txt FORMAT (what you edit):
 *   [BLACK]   <text>   — the project description (shown in black at the top of the page)
 *   [DROPCAP] HEADING  — section heading in a feature project (large floating drop-cap letter)
 *   [SECTION] HEADING  — section heading in a standard project
 *   (plain text)       — body prose (shown in red on the page)
 *
 * Directions:
 *   md  →  txt  (export):  strip formatting, tag styled text, write txt files
 *   txt →  md   (import):  sync user edits back into the md, preserving
 *                          all structure (images, carousels, grids, etc.)
 *
 * Called from the pre-commit hook, which:
 *   1. Detects any txt files the user edited (mtime > last export timestamp)
 *   2. Imports those back into the md and `git add`s the md
 *   3. Exports all md → txt and refreshes timestamps
 *   4. If any files were synced, writes .pending-review and warns to review formatting
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
const REVIEW_FILE = join(DEST, '.pending-review');

// Projects that use the enlarged-body + drop-cap "feature" layout.
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

// ── md → txt (export) ─────────────────────────────────────────────────────────

function extractFrontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^---[\\s\\S]*?\\n${field}:\\s*"([^"]*)"[\\s\\S]*?---`, 'm'));
  return m ? m[1] : null;
}

function stripMarkdownToPlainText(raw, slug) {
  const isFeature = FEATURE.has(slug);

  // ── Extract description from frontmatter for [BLACK] line ─────────────────
  const description = extractFrontmatterField(raw, 'description');

  let text = raw;

  // Remove YAML frontmatter
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // Remove HTML self-closing / void tags
  text = text.replace(/<img[^>]*\/?>/gi, '');
  text = text.replace(/<br\s*\/?>/gi,    '\n');
  text = text.replace(/<hr\s*\/?>/gi,    '');

  // Remove block-level HTML containers (keep inner content)
  text = text.replace(/<(div|aside|figure|section)[^>]*>/gi, '');
  text = text.replace(/<\/(div|aside|figure|section)>/gi,    '');

  // Remove any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"').replace(/&#039;/g, "'");

  // Remove markdown images BEFORE links (link regex eats [alt](url), leaving stray !)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Convert markdown headings → tagged labels
  const headingTag = isFeature ? '[DROPCAP]' : '[SECTION]';
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_, title) =>
    `${headingTag} ${title.toUpperCase()}`
  );

  // Remove bold / italic markers
  text = text.replace(/\*{3}(.+?)\*{3}/g, '$1').replace(/\*{2}(.+?)\*{2}/g, '$1')
             .replace(/\*(.+?)\*/g, '$1').replace(/_(.+?)_/g, '$1');

  // Remove markdown links, keep visible text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Collapse consecutive blank lines to one
  const lines = text.split('\n').map(l => l.trimEnd());
  const collapsed = [];
  let lastBlank = false;
  for (const line of lines) {
    const blank = line === '';
    if (blank && lastBlank) continue;
    collapsed.push(line);
    lastBlank = blank;
  }
  text = collapsed.join('\n').trim();

  // Prepend the [BLACK] description at the very top
  if (description) {
    text = `[BLACK] ${description}\n\n${text}`;
  }

  return text;
}

// ── txt → md (import) ─────────────────────────────────────────────────────────

/**
 * Given the original md content and the user's edited txt content,
 * return an updated md that incorporates the prose changes while
 * preserving all structure (images, carousels, grids, frontmatter).
 */
function rebuildMdFromTxt(originalMd, newTxt, slug) {
  // ── 1. Handle [BLACK] description ─────────────────────────────────────────
  const blackMatch = newTxt.match(/^\[BLACK\]\s+(.+?)(?:\n|$)/);
  let updatedMd = originalMd;
  let txtBody   = newTxt;

  if (blackMatch) {
    const newDesc = blackMatch[1].trim();
    // Update description in frontmatter
    updatedMd = updatedMd.replace(
      /(^---[\s\S]*?\ndescription:\s*)"[^"]*"([\s\S]*?---)/m,
      `$1"${newDesc}"$2`
    );
    // Remove [BLACK] line from the txt so the rest parses as body prose
    txtBody = newTxt.slice(blackMatch[0].length).replace(/^\n+/, '');
  }

  // ── 2. Preserve frontmatter verbatim ──────────────────────────────────────
  const fmMatch = updatedMd.match(/^(---[\s\S]*?---\n)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const mdBody      = updatedMd.slice(frontmatter.length);

  // ── 3. Split md body into sections separated by ## headings ───────────────
  const mdSections  = splitMdSections(mdBody);

  // ── 4. Split txt body into sections by [DROPCAP]/[SECTION] tags ───────────
  const txtSections = splitTxtSections(txtBody);

  // Build lookup: normalised heading → txt prose
  const txtByKey = new Map(
    txtSections.map(s => [normaliseHeading(s.heading), s.body])
  );

  // ── 5. Rebuild each md section ────────────────────────────────────────────
  const rebuilt = mdSections.map((section) => {
    if (!section.heading) {
      const txtProse = txtSections[0]?.heading === '' ? txtSections[0].body : null;
      if (!txtProse) return section.raw;
      return updateSectionProse(section.body, txtProse);
    }
    const key      = normaliseHeading(section.heading);
    const txtProse = txtByKey.get(key);
    if (txtProse === undefined) return section.raw;
    const updatedBody = updateSectionProse(section.body, txtProse);
    return '\n' + section.headingLine + '\n' + updatedBody;
  });

  return frontmatter + rebuilt.join('');
}

/** Split md body into sections. First entry is the preamble (heading = ''). */
function splitMdSections(body) {
  const lines    = body.split('\n');
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
      flush(); bodyLines = [];
      current = { heading: m[2], headingLine: line, body: '', raw: '' };
    } else {
      bodyLines.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Split txt body into sections.
 * Headings are lines like: [DROPCAP] STARTING POINT  or  [SECTION] INTRO
 * Old-style bare-uppercase lines are also accepted for backwards compat.
 */
function splitTxtSections(txt) {
  const lines    = txt.split('\n');
  const sections = [];
  let current    = { heading: '', headingTag: '', body: '' };
  let bodyLines  = [];

  const flush = () => {
    current.body = bodyLines.join('\n').trim();
    sections.push(current);
  };

  for (const line of lines) {
    // Tagged heading: [DROPCAP] HEADING  or  [SECTION] HEADING
    const taggedMatch = line.match(/^\[(DROPCAP|SECTION)\]\s+(.+)$/);
    if (taggedMatch) {
      flush(); bodyLines = [];
      current = { heading: taggedMatch[2].trim(), headingTag: taggedMatch[1], body: '' };
      continue;
    }
    // Legacy bare-uppercase heading (backwards compat)
    if (/^[A-Z][A-Z0-9\s&,'\/\-]+$/.test(line.trim()) && line.trim().length > 2) {
      flush(); bodyLines = [];
      current = { heading: line.trim(), headingTag: '', body: '' };
      continue;
    }
    bodyLines.push(line);
  }
  flush();
  return sections;
}

/** Normalise heading text for section matching: "INITIAL IDEAS" ↔ "Initial ideas" */
function normaliseHeading(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Given the body of one md section (may contain structure blocks) and the
 * new flat prose from the txt, rebuild the section body with updated prose
 * but unchanged structure (img grids, carousels, hero divs, etc.).
 */
function updateSectionProse(mdBody, newProseFlat) {
  const chunks      = parseMdChunks(mdBody);
  const proseChunks = chunks.filter(c => !c.isStructure);
  const origProse   = proseChunks.map(c => c.lines.join('\n').trim());
  const origFlat    = origProse.join('\n\n');

  if (normaliseForCompare(origFlat) === normaliseForCompare(newProseFlat)) {
    return mdBody; // unchanged
  }

  const newParas    = splitParagraphs(newProseFlat);
  const distributed = distributeParagraphs(origProse, newParas);

  let proseIdx = 0;
  const rebuiltParts = [];
  for (const chunk of chunks) {
    if (chunk.isStructure) {
      rebuiltParts.push(chunk.raw);
    } else {
      const updated     = distributed[proseIdx++] ?? '';
      const leadBlanks  = chunk.raw.match(/^\n*/)?.[0]  ?? '';
      const trailBlanks = chunk.raw.match(/\n*$/)?.[0]  ?? '';
      rebuiltParts.push(leadBlanks + updated + trailBlanks);
    }
  }
  return rebuiltParts.join('');
}

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
    if (/^!\[[^\]]*\]\([^)]*\)/.test(line) || /^<img[^>]*\/?>/.test(line)) {
      push(); chunks.push({ isStructure: true, lines: [line], raw: line }); continue;
    }
    if (cur.isStructure) push();
    cur.lines.push(line);
  }
  push();
  return chunks;
}

function splitParagraphs(text) {
  return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
}

function distributeParagraphs(origZones, newParas) {
  if (origZones.length === 0) return [];
  if (origZones.length === 1) return [newParas.join('\n\n')];

  const origParas      = origZones.flatMap(z => splitParagraphs(z));
  const sim            = origParas.map(op => newParas.map(np => jaccardSimilarity(op, np)));
  const assignments    = assignParas(origParas, newParas, sim);
  const origCumulative = cumulative(origZones.map(z => splitParagraphs(z).length));
  const zones          = origZones.map(() => []);

  newParas.forEach((para, ni) => {
    const oi      = assignments[ni];
    const zoneIdx = origCumulative.findIndex(cum => oi < cum);
    zones[zoneIdx >= 0 ? zoneIdx : zones.length - 1].push(para);
  });
  return zones.map(z => z.join('\n\n'));
}

function assignParas(orig, next, sim) {
  const assignments = new Array(next.length).fill(0);
  let origPtr = 0;
  for (let ni = 0; ni < next.length; ni++) {
    let bestScore = -1, bestOi = origPtr;
    for (let oi = origPtr; oi < orig.length; oi++) {
      if (sim[oi][ni] > bestScore) { bestScore = sim[oi][ni]; bestOi = oi; }
    }
    assignments[ni] = bestOi;
    if (bestScore > 0.4 && bestOi === origPtr && origPtr < orig.length - 1) origPtr++;
  }
  return assignments;
}

function jaccardSimilarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}

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

  for (const file of files) {
    const slug    = basename(file, '.md');
    const outPath = join(DEST, slug + '.txt');
    const raw     = await readFile(join(SRC, file), 'utf8');
    const txt     = stripMarkdownToPlainText(raw, slug);
    await writeFile(outPath, txt, 'utf8');
    cache[slug] = (await stat(outPath)).mtimeMs;
    console.log(`  ✓  ${file}  →  ${slug}.txt`);
  }
}

async function importChanged(cache) {
  await mkdir(DEST, { recursive: true });
  const files   = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  const synced  = [];

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
    const updatedMd  = rebuildMdFromTxt(originalMd, newTxt, slug);

    if (updatedMd === originalMd) {
      console.log(`  ○  ${slug}.txt  unchanged prose, skipping`);
      continue;
    }

    await writeFile(mdPath, updatedMd, 'utf8');
    try {
      execSync(`git -C "${ROOT}" add "${mdPath}"`, { stdio: 'inherit' });
    } catch {
      console.warn(`  !  Could not git-add ${file} — stage it manually`);
    }
    console.log(`  ↑  ${slug}.txt  →  ${file}  (synced + staged)`);
    synced.push(slug);
  }

  return synced;
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const doSync = process.argv.includes('--sync');
  await mkdir(DEST, { recursive: true });

  const cache = await loadCache();

  let synced = [];
  if (doSync) {
    synced = await importChanged(cache);
    if (synced.length > 0) {
      console.log(`\nImported ${synced.length} edited file(s) into md.\n`);
    }
  }

  console.log('Exporting md → txt...');
  await exportAll(cache);
  await saveCache(cache);

  // Write .pending-review if any files were synced
  if (synced.length > 0) {
    const timestamp = new Date().toISOString();
    const reviewContent = [
      `Synced at: ${timestamp}`,
      `Files: ${synced.join(', ')}`,
      '',
      'Ask Claude to check formatting and correct any issues.',
    ].join('\n');
    await writeFile(REVIEW_FILE, reviewContent, 'utf8');
  } else {
    // Clear any previous review request once nothing needs reviewing
    if (existsSync(REVIEW_FILE)) {
      // Leave it in place — only Claude should clear it after reviewing
    }
  }

  console.log(`\nDone. Plain Text folder:\n  ${DEST}\n`);
  return synced;
}

main().then(synced => {
  if (synced?.length > 0) {
    console.log('─'.repeat(60));
    console.log('⚠  FORMATTING REVIEW NEEDED');
    console.log(`   ${synced.join(', ')} was synced from txt → md.`);
    console.log('   Ask Claude to check formatting before the next deploy.');
    console.log('─'.repeat(60));
  }
}).catch(err => { console.error(err); process.exit(1); });
