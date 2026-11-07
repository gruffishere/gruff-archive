import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { FORMATS, TECHNIQUES, TOOLS } from './tags';
import type { CollectionConfig } from './types';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase());

const collectionSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{3}$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  contract: address,
  standard: z.enum(['erc721', 'erc1155']),
  platform: z.enum(['manifold', 'foundation', 'transient', '6529', 'opensea', 'onchain', 'custom']),
  platformUrl: z.string().url().optional(),
  section: z.enum(['index', 'experiments']),
  tokenIds: z.array(z.coerce.string()).optional(),
  techniques: z.array(z.enum(TECHNIQUES)).min(1),
  tools: z.array(z.enum(TOOLS)).default([]),
  format: z.enum(FORMATS).optional(),
  tokenTechniques: z.record(z.string(), z.array(z.string())).optional(),
  wallText: z.string().optional(),
  metadata: z.enum(['blockscout', 'chain']).default('blockscout'),
  accessionWidth: z.number().int().positive().optional(),
  collaborators: z.record(z.string(), z.array(z.string())).optional(),
  supplyCap: z.number().int().positive().optional(),
  mintClosed: z.boolean().optional(),
  links: z.array(z.object({ label: z.string().min(1), url: z.string().url().startsWith('https://') }).strict()).optional(),
}).strict();

const fileSchema = z.object({
  artist: address,
  excludeHolders: z.array(address).default([]),
  collections: z.array(collectionSchema).min(1),
}).strict();

export interface ArchiveConfig {
  artist: string;
  /** Extra addresses that never count as keepers/holders (added to EXCLUDED_HOLDERS semantics). */
  excludeHolders: string[];
  collections: CollectionConfig[];
}

export function parseConfig(text: string): ArchiveConfig {
  const data = fileSchema.parse(parse(text));
  const seen = new Set<string>();
  for (const c of data.collections) {
    for (const key of [`code:${c.code}`, `slug:${c.slug}`]) {
      if (seen.has(key)) throw new Error(`duplicate ${key}`);
      seen.add(key);
    }
  }
  return data;
}

export function loadConfig(path = 'config/collections.yaml'): ArchiveConfig {
  return parseConfig(readFileSync(path, 'utf8'));
}
