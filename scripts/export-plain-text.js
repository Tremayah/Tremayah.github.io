#!/usr/bin/env node
/**
 * export-plain-text.js
 *
 * Converts every project markdown file in src/content/projects/ into a
 * clean plain-text file and writes it to the "Plain Text" folder in the
 * personal projects directory. Run manually or automatically via the
 * pre-commit hook in .git/hooks/pre-commit.
 *
 * Usage:  node scripts/export-plain-text.js
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');
const SRC       = join(ROOT, 'src/content/projects');
const DEST      = '/Users/raphael/Documents/Personal Projects/Portfolio Website (git)/Plain Text';

// ── Conversion ────────────────────────────────────────────────────────────────

function stripMarkdownToPlainText(raw) {
  let text = raw;

  // Remove YAML frontmatter
  text = text.replace(/^---[\s\S]*?---\n?/, '');

  // Remove HTML self-closing tags (img, br, hr) and their wrappers
  text = text.replace(/<img[^>]*\/>/gi, '');
  text = text.replace(/<img[^>]*>/gi,   '');
  text = text.replace(/<br\s*\/?>/gi,   '\n');
  text = text.replace(/<hr\s*\/?>/gi,   '');

  // Collapse opening div/aside/figure tags (keep inner content)
  text = text.replace(/<(div|aside|figure|section)[^>]*>/gi, '');
  text = text.replace(/<\/(div|aside|figure|section)>/gi,    '');

  // Remove any remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text.replace(/&amp;/g,  '&');
  text = text.replace(/&lt;/g,   '<');
  text = text.replace(/&gt;/g,   '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");

  // Convert markdown headings to plain section labels (no #)
  // e.g.  ## The sketch model  →  THE SKETCH MODEL
  text = text.replace(/^#{1,6}\s+(.+)$/gm, (_, title) => title.toUpperCase());

  // Remove bold / italic markers
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  text = text.replace(/\*\*(.+?)\*\*/g,    '$1');
  text = text.replace(/\*(.+?)\*/g,         '$1');
  text = text.replace(/_(.+?)_/g,           '$1');

  // Remove markdown images BEFORE links (otherwise the link regex eats
  // the [alt](url) part and leaves an orphaned "!" character).
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');

  // Remove markdown links, keep the link text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // Clean up: collapse 2+ consecutive blank lines to a single blank line
  text = text.replace(/\n{2,}/g, '\n\n');

  // Remove trailing whitespace and collapse consecutive blank lines to one
  const lines = text.split('\n').map(l => l.trimEnd());
  const collapsed = [];
  let lastWasBlank = false;
  for (const line of lines) {
    const isBlank = line === '';
    if (isBlank && lastWasBlank) continue; // skip duplicate blanks
    collapsed.push(line);
    lastWasBlank = isBlank;
  }
  text = collapsed.join('\n');

  return text.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(DEST, { recursive: true });

  const files = (await readdir(SRC)).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const raw       = await readFile(join(SRC, file), 'utf8');
    const plainText = stripMarkdownToPlainText(raw);
    const outName   = basename(file, '.md') + '.txt';
    const outPath   = join(DEST, outName);

    await writeFile(outPath, plainText, 'utf8');
    count++;
    console.log(`  ✓ ${file}  →  ${outName}`);
  }

  console.log(`\nExported ${count} project(s) to:\n  ${DEST}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
