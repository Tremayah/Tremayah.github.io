#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * Bidirectional sync between src/content/projects/*.md and the
 * "Plain Text" folder in the Personal Projects directory.
 *
 * ── txt FORMAT (v2 — bespoke-layout aware) ──────────────────────────────────
 *
 * Page-level lines:
 *   [BLACK] <text>            — project description (black text, top of page)
 *   [DROPCAP] HEADING         — section heading in a feature project
 *   [SECTION] HEADING         — section heading in a standard project
 *   (plain paragraphs)        — body prose (red text on the page)
 *
 * Layout blocks with EDITABLE TEXT — the tag line describes where the text
 * sits on the page; the text itself follows on the next line(s) and ends at
 * the first blank line. Edit the text freely; leave the tag line alone:
 *   [CLEAR]                   — paragraph that starts fully below the hero
 *   [ASIDE LEFT]              — narrow paragraph hugging the left edge
 *   [ASIDE RIGHT]             — narrow paragraph hugging the right edge
 *   [ROW: <images>]           — image+text row (image left, text right)
 *   [ROW REVERSED: <images>]  — image+text row (image right, text left)
 *   [SPLIT: <images>]         — text centred between the split image halves
 *
 * Picture-only anchors — position markers, nothing editable:
 *   #full: <alt>              — full-bleed image
 *   #posters: <alts>          — the poster row
 *   #image / #images / #carousel / #grid / #hero pair / #hero trio / #block
 *
 *   +anything: ...            — a request for Claude to implement
 *
 * The tag/anchor SEQUENCE is the contract: on import, the markers in the txt
 * must match the structures in the md one-for-one, in order. If they don't
 * (a tag was deleted, added, or reordered), that section is left UNTOUCHED
 * and flagged in .pending-review — structural changes go through Claude, so
 * a stray edit can never delete or corrupt part of a page.
 *
 * ── DIRECTIONS ───────────────────────────────────────────────────────────────
 *   md → txt  (export):  strip formatting/HTML, describe layout as tag lines
 *   txt → md  (import):  write prose edits back into the right structures
 *
 * ── USAGE ────────────────────────────────────────────────────────────────────
 *   node scripts/export-plain-text.js          # export only
 *   node scripts/export-plain-text.js --sync   # import changed, then export
 */

import { readdir, readFile, writeFile, mkdir, stat, rm } from 'fs/promises';
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

// Projects using the enlarged-body + drop-cap "feature" layout (affects only
// which heading tag the export uses).
const FEATURE = new Set(['keycaps', 'exploration']);

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

/** HTML inner content → clean single-paragraph plain text. */
function htmlToText(html) {
  return stripProseFormatting(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normaliseHeading(h) {
  return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function normaliseForCompare(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

// ── Structure model ───────────────────────────────────────────────────────────
// Every md chunk gets a `kind`. Prose-bearing kinds carry editable text that
// round-trips through the txt; anchor kinds are picture-only position markers.

const TAG_OF_KIND = {
  'clear':   'CLEAR',
  'aside-l': 'ASIDE LEFT',
  'aside-r': 'ASIDE RIGHT',
  'row':     'ROW',
  'row-rev': 'ROW REVERSED',
  'split':   'SPLIT',
};
const KIND_OF_TAG = Object.fromEntries(Object.entries(TAG_OF_KIND).map(([k, t]) => [t, k]));
const PROSE_KINDS = new Set(Object.keys(TAG_OF_KIND));

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

/** Write new text into a prose-bearing structure, leaving everything else as-is. */
function replaceInnerText(chunk, text) {
  const re = chunk.kind.startsWith('aside') || chunk.kind === 'clear'
    ? /(<p[^>]*>)[\s\S]*?(<\/p>)/i
    : /(<div class="proj-text">)[\s\S]*?(<\/div>)/i;
  return chunk.raw.replace(re, (_, open, close) => `${open}${text}${close}`);
}

// ── md body → typed chunks ────────────────────────────────────────────────────

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

function describeChunk(chunk) {
  if (PROSE_KINDS.has(chunk.kind)) {
    const alts = collectAlts(chunk.raw);
    const head = alts.length > 0 ? `[${TAG_OF_KIND[chunk.kind]}: ${alts.join(' | ')}]`
                                 : `[${TAG_OF_KIND[chunk.kind]}]`;
    return `${head}\n${innerTextOf(chunk)}`;
  }
  const alts = collectAlts(chunk.raw);
  return alts.length > 0 ? `#${chunk.kind}: ${alts.join(' | ')}` : `#${chunk.kind}`;
}

function mdToTxt(raw, slug) {
  const isFeature   = FEATURE.has(slug);
  const description = extractFrontmatterField(raw, 'description');
  const body        = raw.replace(/^---[\s\S]*?---\n?/, '');
  const sections    = splitMdSections(body);

  const parts = [];
  if (description) parts.push(`[BLACK] ${description}`);

  for (const section of sections) {
    if (section.heading) {
      parts.push(`\n${isFeature ? '[DROPCAP]' : '[SECTION]'} ${section.heading.toUpperCase()}`);
    }
    for (const chunk of parseMdChunks(section.body)) {
      if (chunk.kind === 'prose') {
        const prose = stripProseFormatting(chunk.raw).replace(/\n{3,}/g, '\n\n').trim();
        if (prose) parts.push(`\n${prose}`);
      } else {
        parts.push(`\n${describeChunk(chunk)}`);
      }
    }
  }

  // Collapse runs of blank lines, trim
  const collapsed = [];
  let lastBlank = false;
  for (const line of parts.join('\n').split('\n').map((l) => l.trimEnd())) {
    const blank = line === '';
    if (blank && lastBlank) continue;
    collapsed.push(line);
    lastBlank = blank;
  }
  return collapsed.join('\n').trim();
}

// ── txt section body → zones + markers ────────────────────────────────────────

const isTagLine    = (l) => /^\[([A-Z][A-Z ]*?)(?::[^\]]*)?\]\s*$/.test(l) && !/^\[(BLACK|DROPCAP|SECTION)\]/.test(l);
const isAnchorLine = (l) => /^#[^#]/.test(l);
const isPlusLine   = (l) => /^\+/.test(l);

/**
 * Parse a txt section body into { zones, markers, plus }:
 *   zones[i]   — editable plain prose between marker i-1 and marker i
 *   markers[i] — { kind, text? } in page order (text only for tag blocks,
 *                consumed from the lines after the tag up to a blank line)
 */
function parseTxtSection(body) {
  const lines   = body.split('\n');
  const zones   = [];
  const markers = [];
  const plus    = [];
  let zone      = [];
  let i         = 0;

  const flushZone = () => { zones.push(zone.join('\n').trim()); zone = []; };

  while (i < lines.length) {
    const line = lines[i];
    if (isPlusLine(line)) { plus.push(line); i++; continue; }
    if (isTagLine(line)) {
      flushZone();
      const m    = line.match(/^\[([A-Z][A-Z ]*?)(?::\s*[^\]]*)?\]\s*$/);
      const kind = KIND_OF_TAG[m[1].trim()];
      i++;
      const text = [];
      while (i < lines.length && lines[i].trim() !== '' &&
             !isTagLine(lines[i]) && !isAnchorLine(lines[i]) && !isPlusLine(lines[i])) {
        text.push(lines[i].trim());
        i++;
      }
      markers.push({ kind: kind ?? `?${m[1].trim()}`, text: text.join(' ').trim() });
      continue;
    }
    if (isAnchorLine(line)) {
      flushZone();
      markers.push({ kind: line.slice(1).split(':')[0].trim().toLowerCase() });
      i++;
      continue;
    }
    zone.push(line);
    i++;
  }
  flushZone();
  return { zones, markers, plus };
}

/** Split a txt string into sections by [DROPCAP]/[SECTION] heading lines. */
function splitTxtSections(txt) {
  const lines    = txt.split('\n');
  const sections = [];
  let current    = { heading: '', body: '' };
  let bodyLines  = [];
  const flush = () => { current.body = bodyLines.join('\n').trim(); sections.push(current); };
  for (const line of lines) {
    const taggedM = line.match(/^\[(DROPCAP|SECTION)\]\s+(.+)$/);
    if (taggedM) { flush(); bodyLines = []; current = { heading: taggedM[2].trim(), body: '' }; continue; }
    bodyLines.push(line);
  }
  flush();
  return sections;
}

// ── txt → md (import) ─────────────────────────────────────────────────────────

/**
 * Sync one section. The txt's marker sequence must match the md's structure
 * sequence exactly (same kinds, same order) — otherwise the section is left
 * untouched and reported as a mismatch. Prose zones and tag-block texts are
 * written back positionally; picture anchors and all HTML survive verbatim.
 */
function syncSection(mdBody, txtBody, pendingPlus) {
  const chunks = parseMdChunks(mdBody);
  const txt    = parseTxtSection(txtBody);
  pendingPlus.push(...txt.plus);

  const mdMarkers = chunks.filter((c) => c.kind !== 'prose');
  if (mdMarkers.length !== txt.markers.length ||
      mdMarkers.some((c, i) => c.kind !== txt.markers[i].kind)) {
    return { mismatch: true };
  }

  // md prose zones between structures (may be empty where structures touch)
  const mdZones = [];
  let zoneRaw = '';
  for (const c of chunks) {
    if (c.kind === 'prose') zoneRaw = c.raw.trim();
    else { mdZones.push(zoneRaw); zoneRaw = ''; }
  }
  mdZones.push(zoneRaw);

  let changed = false;
  const out = [];
  for (let i = 0; i <= mdMarkers.length; i++) {
    const mdZone  = mdZones[i] ?? '';
    const txtZone = txt.zones[i] ?? '';
    if (normaliseForCompare(stripProseFormatting(mdZone)) !== normaliseForCompare(txtZone)) {
      changed = true;
      if (txtZone) out.push(txtZone);
    } else if (mdZone) {
      out.push(mdZone); // untouched zone keeps its original markdown formatting
    }
    if (i === mdMarkers.length) break;
    const chunk  = mdMarkers[i];
    const marker = txt.markers[i];
    if (PROSE_KINDS.has(chunk.kind) && marker.text != null &&
        normaliseForCompare(innerTextOf(chunk)) !== normaliseForCompare(marker.text)) {
      changed = true;
      out.push(replaceInnerText(chunk, marker.text).trim());
    } else {
      out.push(chunk.raw.trim());
    }
  }

  return { mismatch: false, changed, body: out.join('\n\n') };
}

function rebuildMdFromTxt(originalMd, newTxt) {
  let updatedMd = originalMd;
  let txtBody   = newTxt;

  // [BLACK] description (replacer fn so `$` in the text can't act as a pattern)
  const blackMatch = newTxt.match(/^\[BLACK\]\s+(.+?)(?:\n|$)/m);
  if (blackMatch) {
    const newDesc = blackMatch[1].trim();
    updatedMd = updatedMd.replace(
      /(^---[\s\S]*?\ndescription:\s*)"[^"]*"([\s\S]*?---)/m,
      (_, pre, post) => `${pre}"${newDesc}"${post}`
    );
    txtBody = newTxt.replace(/^\[BLACK\]\s+.+\n?/, '').replace(/^\n+/, '');
  }

  const fmMatch     = updatedMd.match(/^(---[\s\S]*?---\n)/);
  const frontmatter = fmMatch ? fmMatch[1] : '';
  const mdSections  = splitMdSections(updatedMd.slice(frontmatter.length));
  const txtSections = splitTxtSections(txtBody);
  const txtByKey    = new Map(txtSections.map((s) => [normaliseHeading(s.heading), s.body]));

  const pendingPlus = [];
  const mismatches  = [];
  const rebuilt = mdSections.map((section) => {
    const txtProse = section.heading
      ? txtByKey.get(normaliseHeading(section.heading))
      : (txtSections[0]?.heading === '' ? txtSections[0].body : undefined);
    if (txtProse === undefined) return section.raw;
    const res = syncSection(section.body, txtProse, pendingPlus);
    if (res.mismatch) { mismatches.push(section.heading || '(top section)'); return section.raw; }
    if (!res.changed) return section.raw;
    return section.heading
      ? '\n' + section.headingLine + '\n\n' + res.body + '\n'
      : res.body + '\n';
  });

  const md = (frontmatter + rebuilt.join('')).replace(/\n{3,}/g, '\n\n');
  return { md, pendingPlus, mismatches };
}

// ── Orchestration ──────────────────────────────────────────────────────────────

async function exportAll(cache, { doSync, syncedSet }) {
  await mkdir(DEST, { recursive: true });
  const files = (await readdir(SRC)).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const slug    = basename(file, '.md');
    const dir     = join(DEST, slug);            // one folder per project …
    await mkdir(dir, { recursive: true });
    const outPath = join(dir, slug + '.txt');    // … with the .txt inside it
    // Don't clobber txt edits that haven't been imported (export-only runs).
    if (!doSync && !syncedSet.has(slug) && existsSync(outPath)) {
      const mtime = (await stat(outPath)).mtimeMs;
      if (cache[slug] && mtime > cache[slug]) {
        console.log(`  !  ${slug}/${slug}.txt has un-synced edits — skipped (run with --sync)`);
        continue;
      }
    }
    const raw = await readFile(join(SRC, file), 'utf8');
    await writeFile(outPath, mdToTxt(raw, slug), 'utf8');
    cache[slug] = (await stat(outPath)).mtimeMs;
    console.log(`  ✓  ${file}  →  ${slug}/${slug}.txt`);
  }
  await cleanupFlatTxt();
}

/** Remove legacy flat root-level <slug>.txt files — the .txt now lives inside a
 *  per-project folder. (Skips dot/underscore helper files like _read-me-first.txt.) */
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

async function importChanged(cache) {
  await mkdir(DEST, { recursive: true });
  const files         = (await readdir(SRC)).filter((f) => f.endsWith('.md'));
  const synced        = [];
  const allPlus       = {};
  const allMismatches = {};

  for (const file of files) {
    const slug    = basename(file, '.md');
    const txtPath = join(DEST, slug, slug + '.txt');
    const mdPath  = join(SRC, file);

    if (!existsSync(txtPath)) continue;

    const lastExport = cache[slug] ?? 0;
    const txtMtime   = (await stat(txtPath)).mtimeMs;
    if (txtMtime <= lastExport) continue;

    const originalMd = await readFile(mdPath, 'utf8');
    const newTxt     = await readFile(txtPath, 'utf8');
    const { md: updatedMd, pendingPlus, mismatches } = rebuildMdFromTxt(originalMd, newTxt);

    if (pendingPlus.length > 0) allPlus[slug] = pendingPlus;
    if (mismatches.length > 0) {
      allMismatches[slug] = mismatches;
      console.warn(`  ⚠  ${slug}.txt — layout markers don't match the page in: ${mismatches.join(', ')} — those parts left untouched`);
    }

    if (updatedMd === originalMd && pendingPlus.length === 0 && mismatches.length === 0) {
      console.log(`  ○  ${slug}.txt  unchanged, skipping`);
      continue;
    }

    if (updatedMd !== originalMd) {
      await writeFile(mdPath, updatedMd, 'utf8');
      try { execSync(`git -C "${ROOT}" add "${mdPath}"`, { stdio: 'inherit' }); }
      catch { console.warn(`  !  Could not git-add ${file}`); }
      synced.push(slug);
      const plusNote = pendingPlus.length > 0 ? `  [${pendingPlus.length} pending +]` : '';
      console.log(`  ↑  ${slug}.txt  →  ${file}  (synced + staged)${plusNote}`);
    }
  }

  return { synced, allPlus, allMismatches };
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main() {
  const doSync = process.argv.includes('--sync');
  await mkdir(DEST, { recursive: true });
  const cache = await loadCache();

  let synced = [], allPlus = {}, allMismatches = {};

  if (doSync) {
    ({ synced, allPlus, allMismatches } = await importChanged(cache));
    if (synced.length > 0) console.log(`\nImported ${synced.length} edited file(s) into md.\n`);
  }

  console.log('Exporting md → txt...');
  await exportAll(cache, { doSync, syncedSet: new Set(synced) });
  await pruneOrphans(cache);
  await saveCache(cache);

  const hasPlus     = Object.keys(allPlus).length > 0;
  const hasMismatch = Object.keys(allMismatches).length > 0;
  if (synced.length > 0 || hasPlus || hasMismatch) {
    const lines = [
      `Synced at: ${new Date().toISOString()}`,
      synced.length > 0 ? `Files synced:   ${synced.join(', ')}` : null,
      hasMismatch
        ? `Marker mismatches (sections left untouched — ask Claude):\n${Object.entries(allMismatches)
            .map(([slug, secs]) => `  ${slug}: ${secs.join(', ')}`)
            .join('\n')}`
        : null,
      hasPlus
        ? `Pending + directives:\n${Object.entries(allPlus)
            .map(([slug, ls]) => `  ${slug}:\n${ls.map((l) => `    ${l}`).join('\n')}`)
            .join('\n')}`
        : null,
      '',
      'Ask Claude to check formatting and implement any + directives.',
    ].filter((l) => l !== null).join('\n');
    await writeFile(REVIEW_FILE, lines, 'utf8');
  }

  console.log(`\nDone. Plain Text folder:\n  ${DEST}\n`);
  return { synced, allPlus, allMismatches };
}

main().then(({ synced, allPlus, allMismatches }) => {
  const hasPending  = Object.keys(allPlus ?? {}).length > 0;
  const hasMismatch = Object.keys(allMismatches ?? {}).length > 0;
  if (synced?.length > 0 || hasPending || hasMismatch) {
    console.log('─'.repeat(60));
    console.log('⚠  FORMATTING REVIEW NEEDED');
    if (synced?.length > 0) console.log(`   Prose synced: ${synced.join(', ')}`);
    if (hasMismatch) {
      console.log('   Marker mismatches (left untouched):');
      for (const [slug, secs] of Object.entries(allMismatches)) {
        console.log(`     ${slug}: ${secs.join(', ')}`);
      }
    }
    if (hasPending) {
      console.log('   Pending + directives:');
      for (const [slug, lines] of Object.entries(allPlus)) {
        console.log(`     ${slug}: ${lines.join(' | ')}`);
      }
    }
    console.log('   Ask Claude to check formatting and act on any + directives.');
    console.log('─'.repeat(60));
  }
}).catch((err) => { console.error(err); process.exit(1); });
