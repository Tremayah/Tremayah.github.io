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
    image: z.string().optional(),
    featured: z.boolean().optional().default(false),
    order: z.number().optional().default(99),
  }),
});

export const collections = { projects };
