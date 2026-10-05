/* The essays collection, shaped for the Essays page tiles and the per-essay
   pages. Shared by Landing.astro (tiles + embedded write-ups) and the
   /p/essays/[essay] route (one pre-rendered page per essay).

   Each essay's view id is `essays/<slug>` — the same string site.ts puts in
   the URL (/p/essays/<slug>/) and in the write-up's data-for. */
import { getCollection, type CollectionEntry } from 'astro:content';

export const ESSAY_PARENT = 'essays';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "2025-01" → "Jan 2025". */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* The essay's own prose, as plain text: everything before its AI-use note /
   reference list, minus headings and whole-line italic notes (the byline and
   AI disclosure at the top), with markdown syntax stripped. */
function proseOf(body: string): string {
  const lines = body.split('\n');
  const end = lines.findIndex((l) => /^#{1,6}\s*(references?|reference list|ai use)\b/i.test(l.trim()));
  return lines
    .slice(0, end === -1 ? undefined : end)
    .filter((l) => !/^#{1,6}\s/.test(l.trim()))           // headings
    .filter((l) => !/^\*[^*].*\*$/.test(l.trim()))          // whole-line italic notes
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<https?:[^>]+>/g, ' ')
    .replace(/[*_>`#\\]/g, ' ');
}

function wordCount(body: string): number {
  return proseOf(body).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

/* First paragraph of prose, trimmed for a <meta name="description">. */
function leadOf(body: string): string {
  const para = proseOf(body).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  return para.length > 155 ? `${para.slice(0, 152).replace(/\s+\S*$/, '')}…` : para;
}

export interface Essay {
  slug: string;
  id: string; // `essays/<slug>`
  title: string;
  date: string; // "Jan 2025"
  words: number;
  lead: string;
  entry: CollectionEntry<'essays'>;
}

/* Newest first by the month written; same-month ties go by `order`, then slug. */
export async function getEssays(): Promise<Essay[]> {
  const all = await getCollection('essays');
  return all
    .map((entry) => ({
      slug: entry.id,
      id: `${ESSAY_PARENT}/${entry.id}`,
      title: entry.data.title,
      date: monthLabel(entry.data.written),
      words: wordCount(entry.body ?? ''),
      lead: leadOf(entry.body ?? ''),
      entry,
    }))
    .sort((a, b) =>
      b.entry.data.written.localeCompare(a.entry.data.written)
      || a.entry.data.order - b.entry.data.order
      || a.slug.localeCompare(b.slug));
}
