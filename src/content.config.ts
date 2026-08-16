import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    year: z.number(),
    category: z.string(),
    tags: z.array(z.string()).optional().default([]),
    // University work vs personal project — drives the caption-band tag chip
    // on the landing/more-works tiles. Omit for university work.
    scope: z.enum(['university', 'personal']).optional().default('university'),
    // How far the project got: a concept (design/render only), a working
    // prototype, or a resolved product. Drives a SECOND caption-band chip,
    // shown to the left of the scope one. Optional — omit it (e.g. the Essays
    // text tile) and no stage chip is rendered.
    stage: z.enum(['concept', 'prototype', 'product']).optional(),
    order: z.number().optional().default(99),
    // Landing-page tile image. Projects without a cover are hidden from the
    // landing grid and the nav (e.g. placeholder stubs).
    cover: z.string().optional(),
  }),
});

export const collections = { projects };
