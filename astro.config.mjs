// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://raphael.murraybrowne.com',
  output: 'static',

  // Emit every route with a trailing slash (e.g. /keycaps/). Matches the URLs
  // GitHub Pages serves from directory-style output, so links resolve without
  // an extra redirect.
  trailingSlash: 'always',

  // Prefetch every internal link as soon as it scrolls into view. The nav is
  // always on screen, so all project pages are fetched up-front — clicking one
  // is then instant because its HTML is already in memory.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
