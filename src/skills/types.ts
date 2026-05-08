/**
 * Skills system types.
 * Skills are reusable, user-defined capabilities stored as files in ~/.dragon/skills/.
 */

import { z } from 'zod';

export interface SkillDefinition {
  /** Unique name for the skill (derived from filename) */
  name: string;
  /** Human-readable description of what the skill does */
  description: string;
  /** The instructions/content that gets injected when the skill is invoked */
  content: string;
  /** Source file path */
  sourcePath: string;
  /** When the skill was loaded */
  loadedAt: Date;
}

/** Zod schema for SKILL.md YAML frontmatter */
export const SkillFrontmatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().min(1, 'description is required'),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
