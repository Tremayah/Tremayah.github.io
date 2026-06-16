#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * One-way export of src/content/projects/*.md into a readable "Plain Text"
 * mirror, plus a flag when those .txt files have been edited.
 *
 * ── WHAT THE .txt LOOKS LIKE ────────────────────────────────────────────────
 *
 *   <one-line tagline>            ← the project's frontmatter description
 *
 *   <body paragraph>              ← plain prose, edit freely
 *
 *   ## Section heading            ← a heading; reword it like any other text
 *
 *   [ carousel — alt / alt ]      ← a READ-ONLY note saying a photo/carousel
 *   <paragraph beside it>            sits here. You don't keep it tidy; editing
 *                                    it does nothing on its own.
 *
 * No strict syntax: there is nothing to "get right". Lines in [ brackets ] and
 * ## headings are just context so a long page stays navigable.
 *
 * ── HOW EDITS REACH THE SITE (manual, on push) ──────────────────────────────
 *
 * The site is built from the .md files, NOT the .txt. Editing a .txt does not
 * change the site by itself. Instead:
 *   • This script regenerates the .txt mirror from the .md (md → txt only).
 *   • If a .txt was edited since its last export, it is LEFT ALONE (never
 *     clobbered) and listed in `_PENDING-EDITS.txt`.
 *   • On the next push, Claude reads each edited .txt and folds the word
 *     changes into the matching .md by hand (handles rewording, adds, cuts,
 *     reorders), then runs this script with --force to refresh the mirror.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 *   node scripts/export-plain-text.js            # export; protect + flag edits
 *   node scripts/export-plain-text.js --force    # regenerate every .txt from md
 *                                                # (use AFTER folding edits in)
 */

import { readdir, readFile, writeFile, mkdir, stat, rm } from 'fs/promises';
import { existsSync }                                    from 'fs';
import { join, basename }                                from 'path';
import { fileURLToPath }                                 from 'url';

const __dirname  = fileURLToPath(new URL('.', import.meta.url));
const ROOT       = join(__dirname, '..');
const SRC        = join(ROOT, 'src/content/projects');
// Override with PLAIN_TEXT_DIR (e.g. to test into a temp folder without touching
// the real Plain Text repo).
const DEST       = process.env.PLAIN_TEXT_DIR
  || '/Users/raphael/Documents/Personal Projects/Portfolio Website (git)/Plain Text';
const CACHE_FILE = join(DEST, '.export-times.json');
const FLAG_FILE  = join(DEST, '_PENDING-EDITS.txt');
const README     = join(DEST, '_read-me-first.txt');

// ── Timestamp cache ───────────────────────────────────────────────────────────

async function loadCache() {
  try { return JSON.parse(await readFile(CACHE_FILE, 'utf8')); }
  catch { return {}; }
}
async function saveCache(cache) {
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Extract a quoted string field from YAML frontmatter. */
function extractFrontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^---[\\s\\S]*?\\n${field}:\\s*"([^"]*)"[\\s\\S]*?---`, 'm'));
  return m ? m[1] : null;
}

/** Strip inline formatting (bold, italic, links, entities) — not structure. */
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

/** HTML inner content → clean single-paragraph plain text. */
function htmlToText(html) {
  return stripProseFormatting(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Collect image alts from a chunk of HTML/markdown; filenames as fallback. */
function collectAlts(raw) {
  const alts = [];
  for (const m of raw.matchAll(/<img[^>]*>/gi)) {
    const alt = m[0].match(/alt="([^"]*)"/i)?.[1]?.trim();
    const src = m[0].match(/src="([^"]*)"/i)?.[1] ?? '';
    alts.push(alt || src.split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  }
  for (const m of raw.matchAll(/!\[([^\]]*)\]\(([^)]*)\)/g)) {
    alts.push(m[1]?.trim() || m[2].split('/').pop().replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  }
  return [...new Set(alts.filter(Boolean))];
}

// ── md body → typed chunks ────────────────────────────────────────────────────
// Each chunk is either plain `prose`, a prose-bearing structure (row/split/aside
// carry editable text beside an image), or a picture-only structure.

const PROSE_KINDS = new Set(['clear', 'aside-l', 'aside-r', 'row', 'row-rev', 'split']);
const ROW_KINDS   = new Set(['row', 'row-rev', 'split']);   // image + text together

/** Class tokens of the chunk's opening tag. */
function classTokens(line) {
  return (line.match(/class="([^"]*)"/i)?.[1] ?? '').split(/\s+/).filter(Boolean);
}

function kindOfContainer(openLine, raw) {
  const t = new Set(classTokens(openLine));
  if (t.has('proj-row'))     return t.has('proj-row--rev') ? 'row-rev' : 'row';
  if (t.has('proj-split'))   return 'split';
  if (t.has('proj-posters')) return 'posters';
  if (t.has('proj-full'))    return 'full';
  if (t.has('carousel'))     return 'carousel';
  if (t.has('img-grid'))     return 'grid';
  if (t.has('hero-pair'))    return 'hero pair';
  if (t.has('hero-trio'))    return 'hero trio';
  return /<img/i.test(raw) ? 'images' : 'block';
}

/** Editable inner text of a prose-bearing structure (md side). */
function innerTextOf(chunk) {
  const m = PROSE_KINDS.has(chunk.kind) && (
    chunk.kind.startsWith('aside') || chunk.kind === 'clear'
      ? chunk.raw.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      : chunk.raw.match(/<div class="proj-text">([\s\S]*?)<\/div>/i)
  );
  return m ? htmlToText(m[1]) : '';
}

function parseMdChunks(body) {
  const lines  = body.split('\n');
  const chunks = [];
  let cur      = { kind: 'prose', lines: [] };
  let depth    = 0;
  let openLine = '';

  const push = () => {
    const raw = cur.lines.join('\n');
    if (raw.trim()) chunks.push({ ...cur, raw });
    cur = { kind: 'prose', lines: [] };
  };

  for (const line of lines) {
    const openMatch = line.match(/^\s*<(div|aside|figure|section)(\s[^>]*)?>$/);
    if (openMatch && depth === 0) {
      push(); cur = { kind: 'pending', lines: [line] }; depth = 1; openLine = line; continue;
    }
    if (depth > 0) {
      cur.lines.push(line);
      depth += (line.match(/<(div|aside|figure|section)(\s[^>]*)?>/g) || []).length;
      depth -= (line.match(/<\/(div|aside|figure|section)>/g)          || []).length;
      if (depth <= 0) {
        depth = 0;
        cur.kind = kindOfContainer(openLine, cur.lines.join('\n'));
        push();
      }
      continue;
    }
    // Single-line classed paragraph (bespoke layout prose)
    const pMatch = line.match(/^\s*<p\s[^>]*class="([^"]*)"[^>]*>[\s\S]*<\/p>\s*$/);
    if (pMatch) {
      const t = new Set(pMatch[1].split(/\s+/));
      const kind = t.has('proj-aside--l') ? 'aside-l'
                 : t.has('proj-aside--r') ? 'aside-r'
                 : t.has('proj-clear')    ? 'clear' : null;
      if (kind) { push(); chunks.push({ kind, lines: [line], raw: line }); continue; }
    }
    // Single-line image: inline markdown image or bare <img>
    if (/^!\[[^\]]*\]\([^)]*\)/.test(line) || /^<img[^>]*\/?>/.test(line)) {
      push(); chunks.push({ kind: 'image', lines: [line], raw: line }); continue;
    }
    if (cur.kind !== 'prose') push();
    cur.lines.push(line);
  }
  push();
  return chunks;
}

/** Split md body into sections by ## headings. First entry = preamble. */
function splitMdSections(body) {
  const lines    = body.split('\n');
  const sections = [];
  let current    = { heading: '', body: '' };
  let bodyLines  = [];
  const flush = () => { current.body = bodyLines.join('\n'); sections.push(current); };
  for (const line of lines) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) { flush(); bodyLines = []; current = { heading: m[1].trim(), body: '' }; }
    else bodyLines.push(line);
  }
  flush();
  return sections;
}

// ── md → txt (plain mirror) ────────────────────────────────────────────────────

/** Friendly word for the picture(s) in a chunk — used only in the [ note ]. */
function noteLabel(raw) {
  if (/class="[^"]*\bqa\b/i.test(raw))           return 'question highlight';
  if (/class="[^"]*\bcarousel\b/i.test(raw))     return 'carousel';
  if (/class="[^"]*\bimg-grid\b/i.test(raw))     return 'image grid';
  if (/class="[^"]*\bhero-pair\b/i.test(raw))    return 'photos';
  if (/class="[^"]*\bhero-trio\b/i.test(raw))    return 'photos';
  if (/class="[^"]*\bproj-posters\b/i.test(raw)) return 'posters';
  if (/class="[^"]*\bproj-split\b/i.test(raw))   return 'split image';
  const imgCount = (raw.match(/<img/gi) || []).length
                 + (raw.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length;
  return imgCount > 1 ? 'photos' : 'photo';
}

/** One chunk → its plain-text block (prose, or a [ note ] ± its paragraph). */
function chunkToText(chunk) {
  if (chunk.kind === 'prose') {
    return stripProseFormatting(chunk.raw).replace(/\n{3,}/g, '\n\n').trim();
  }
  // positioned prose (aside / clear) — just the paragraph; position lives in md
  if (chunk.kind === 'aside-l' || chunk.kind === 'aside-r' || chunk.kind === 'clear') {
    return innerTextOf(chunk);
  }
  const alts = collectAlts(chunk.raw);
  const note = alts.length ? `[ ${noteLabel(chunk.raw)} — ${alts.join(' / ')} ]`
                           : `[ ${noteLabel(chunk.raw)} ]`;
  if (ROW_KINDS.has(chunk.kind)) {           // image + text row → note then prose
    const text = innerTextOf(chunk);
    return text ? `${note}\n${text}` : note;
  }
  return note;                               // picture-only structure → note only
}

function mdToTxt(raw) {
  const description = extractFrontmatterField(raw, 'description');
  const body        = raw.replace(/^---[\s\S]*?---\n?/, '');
  const parts       = [];
  if (description) parts.push(description.trim());

  for (const section of splitMdSections(body)) {
    if (section.heading) parts.push(`## ${section.heading}`);
    for (const chunk of parseMdChunks(section.body)) {
      const text = chunkToText(chunk);
      if (text) parts.push(text);
    }
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── Orchestration ──────────────────────────────────────────────────────────────

const READProse = `HOW TO EDIT THESE FILES
═══════════════════════

Each project has a folder with a <name>.txt inside — that's the words from that
project's page on the site. Just edit the text:

  • Plain paragraphs are the body copy. Reword them however you like.
  • A line starting with ## is a section heading. You can edit these too.
  • A line in [ square brackets ] is a NOTE about a photo or carousel on the
    page (e.g. "[ carousel — the finished hinge / the snapped tap ]"). It's only
    there so you know where you are — you don't have to keep it tidy, and
    changing it does nothing on its own. (Want to swap an image? Ask Claude.)
  • The very first line is the project's one-line tagline.

Your edits do NOT go live on their own. The site is built from separate files;
next time we push, ask Claude to "apply the plain-text edits" and Claude will
fold your changes into the pages by hand. A file called _PENDING-EDITS.txt will
appear listing whatever is waiting to be applied.
`;

/** Remove legacy flat root-level <slug>.txt files (the .txt now lives in a
 *  per-project folder). Skips dot/underscore helper files. */
async function cleanupFlatTxt() {
  const entries = await readdir(DEST, { withFileTypes: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.txt') && !/^[._]/.test(e.name)) {
      await rm(join(DEST, e.name));
      console.log(`  ✗  moved legacy ${e.name} into ${basename(e.name, '.txt')}/`);
    }
  }
}

/** Source .md deleted → remove only the derived <slug>/<slug>.txt, never the
 *  folder itself (it may hold images the user dropped in). */
async function pruneOrphans(cache) {
  const slugs = new Set(
    (await readdir(SRC)).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'))
  );
  const entries = await readdir(DEST, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const slug = e.name;
    if (slugs.has(slug)) continue;
    const txt = join(DEST, slug, slug + '.txt');
    if (existsSync(txt)) {
      await rm(txt);
      console.log(`  ✗  removed orphan ${slug}/${slug}.txt (source .md deleted; folder kept)`);
    }
    delete cache[slug];
  }
}

/** Export every .md → its .txt mirror. A .txt edited since its last export is
 *  LEFT ALONE (returned as "pending") unless --force regenerates everything. */
async function exportAll(cache, { force }) {
  await mkdir(DEST, { recursive: true });
  const files   = (await readdir(SRC)).filter((f) => f.endsWith('.md'));
  const pending = [];
  for (const file of files) {
    const slug = basename(file, '.md');
    const dir  = join(DEST, slug);
    await mkdir(dir, { recursive: true });
    const outPath = join(dir, slug + '.txt');
    if (!force && existsSync(outPath)) {
      const mtime = (await stat(outPath)).mtimeMs;
      if (cache[slug] && mtime > cache[slug]) {
        pending.push(slug);
        console.log(`  !  ${slug}/${slug}.txt edited since last export — left as-is`);
        continue;
      }
    }
    const raw = await readFile(join(SRC, file), 'utf8');
    await writeFile(outPath, mdToTxt(raw), 'utf8');
    cache[slug] = (await stat(outPath)).mtimeMs;
    console.log(`  ✓  ${file}  →  ${slug}/${slug}.txt`);
  }
  await writeFile(README, READProse, 'utf8');
  await cleanupFlatTxt();
  return pending;
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes('--force');
  await mkdir(DEST, { recursive: true });
  const cache = await loadCache();

  console.log(force ? 'Regenerating every .txt from md...' : 'Exporting md → txt...');
  const pending = await exportAll(cache, { force });
  await pruneOrphans(cache);
  await saveCache(cache);

  if (pending.length > 0) {
    await writeFile(FLAG_FILE, [
      `Plain-text edits waiting to go onto the site: ${pending.join(', ')}`,
      `Last detected: ${new Date().toISOString()}`,
      '',
      'These .txt files were edited since their last export, so their words are',
      'NOT on the site yet. On the next push, ask Claude to "apply the plain-text',
      'edits" — Claude reads each edited .txt and updates the matching project',
      'page by hand, then refreshes this mirror.',
      '',
    ].join('\n'), 'utf8');
    console.log('─'.repeat(60));
    console.log('⚠  PLAIN-TEXT EDITS PENDING — ask Claude to apply on next push:');
    console.log(`     ${pending.join(', ')}`);
    console.log('─'.repeat(60));
  } else if (existsSync(FLAG_FILE)) {
    await rm(FLAG_FILE);
  }

  console.log(`\nDone. Plain Text folder:\n  ${DEST}\n`);
  return pending;
}

main().catch((err) => { console.error(err); process.exit(1); });
