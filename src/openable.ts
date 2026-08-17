/* The projects (+ the CV) that have an embedded write-up and are openable — and
   therefore deep-linkable at /p/<id>/. Single source of truth shared by the
   Landing component (which embeds each write-up) and the /p/[slug] route (which
   pre-renders a real page per id). Keep this list in step with the content in
   src/content/projects/. */
export const OPENABLE_IDS = [
  'exploration', // Acrylic Sandwich Lamps (landing)
  'keycaps', // Porcelain Keycaps (landing)
  'table-tennis-bat', // Table Tennis Bat (landing)
  'living-lamp', // Living Lamp (more works)
  'progression', // Smart Jewellery (more works)
  'essays', // Design Culture essays (more works)
  'topography-table', // Topography Table (personal project, in more works)
  // 'trebuchet' — the page exists (src/content/projects/trebuchet.md, images in
  // public/images/trebuchet/) but is deliberately NOT listed while its
  // paragraphs are still one-line briefs written in the third person. Leaving it
  // out here keeps it off the site entirely: no embedded write-up, no /p/trebuchet/.
  // Re-add this line and the moreWorks entry in Landing.astro once the prose is written.
  'cv', // CV page
] as const;

export type OpenableId = (typeof OPENABLE_IDS)[number];
