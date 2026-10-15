/*  /sitemap.xml — every public page, for search engines (robots.txt points here).

    Generated at build time from the same lists the pages are built from —
    OPENABLE_IDS for /p/<slug>/ and getEssays() for /p/essays/<slug>/ — so a new
    project or essay is listed the moment it's live, with nothing to keep in step
    by hand. /lab is deliberately absent: it's unlisted (and noindex). */
import type { APIRoute } from 'astro';
import { OPENABLE_IDS } from '../openable';
import { getEssays } from '../essays';

export const GET: APIRoute = async ({ site }) => {
  const essays = await getEssays();
  const paths = [
    '/',
    ...OPENABLE_IDS.map((id) => `/p/${id}/`),
    ...essays.map((e) => `/p/essays/${e.slug}/`),
  ];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
