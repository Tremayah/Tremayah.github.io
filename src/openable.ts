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
  'topography-table', // Topography Table (personal projects)
  'cv', // CV page
] as const;

export type OpenableId = (typeof OPENABLE_IDS)[number];
