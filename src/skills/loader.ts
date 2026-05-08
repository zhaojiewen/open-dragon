/**
 * Skills loader — reads and parses skill definitions from ~/.dragon/skills/
 *
 * Skills are defined as files named <skill-name>.md or a directory named <skill-name>
 * containing a SKILL.md file. Each skill file must start with YAML frontmatter
 * containing at minimum a "description" field.
 *
 * Example skill file:
 * ```
 * ---
 * name: my-skill
 * description: Does something useful
 * ---
 *
 * # My Skill
 * Instructions for the AI on how to use this skill...
 * ```
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getLogger } from '../utils/logger.js';
import { SkillFrontmatterSchema } from './types.js';
import { getBuiltInSkills } from './builtin.js';
import type { SkillDefinition } from './types.js';

const logger = getLogger();

/** Directory where skill files are stored */
export const SKILLS_DIR = path.join(os.homedir(), '.dragon', 'skills');

/** Result of parsing a skill file's frontmatter */
interface ParseResult {
  frontmatter: { name?: string; description: string };
  body: string;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Expects the file to start with `---` on its own line, followed by YAML properties,
 * then `---` on its own line to close.
 *
 * Returns null if the file has no valid frontmatter delimiters or no description.
 */
function parseFrontmatter(content: string): ParseResult | null {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith('---')) {
    return null;
  }

  const endOfFirstDelim = trimmed.indexOf('\n', 3);
  if (endOfFirstDelim === -1) return null;

  const closingDelimIdx = trimmed.indexOf('\n---', endOfFirstDelim);
  if (closingDelimIdx === -1) return null;

  const frontmatterBlock = trimmed.substring(endOfFirstDelim + 1, closingDelimIdx).trim();
  const body = trimmed.substring(closingDelimIdx + 4).trim();

  // Parse YAML key:value pairs — split on first colon only so values can contain colons
  const raw: Record<string, string> = {};
  const lines = frontmatterBlock.split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();

    // Remove optional surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    raw[key] = value;
  }

  const parsed = SkillFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    logger.debug(`Skill frontmatter validation failed: ${parsed.error.message}`);
    return null;
  }

  return { frontmatter: parsed.data, body };
}

/**
 * Derive the skill name from a filename.
 * "my-skill.md" → "my-skill"
 * "my-skill/SKILL.md" → "my-skill"
 */
function deriveSkillName(filePath: string): string {
  const parsed = path.parse(filePath);
  if (parsed.name.toLowerCase() === 'skill') {
    // It's a SKILL.md inside a directory — use directory name
    return path.basename(parsed.dir);
  }
  return parsed.name;
}

/**
 * Load a single skill from a file path.
 * Returns null if the file is not a valid skill definition.
 */
function loadSkillFile(filePath: string): SkillDefinition | null {
  try {
    const stat = fs.statSync(filePath);

    // If it's a directory, look for SKILL.md inside
    let actualPath = filePath;
    if (stat.isDirectory()) {
      const skillMdPath = path.join(filePath, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        return null;
      }
      actualPath = skillMdPath;
    }

    const content = fs.readFileSync(actualPath, 'utf-8');
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      logger.debug(`Skill file has no valid frontmatter: ${actualPath}`);
      return null;
    }

    const name = parsed.frontmatter.name || deriveSkillName(actualPath);

    return {
      name,
      description: parsed.frontmatter.description,
      content: parsed.body || '',
      sourcePath: actualPath,
      loadedAt: new Date(),
    };
  } catch (err: any) {
    logger.warn(`Failed to load skill from ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Ensure the skills directory exists and create it if needed.
 */
export function ensureSkillsDir(): string {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true, mode: 0o700 });
    logger.debug(`Created skills directory: ${SKILLS_DIR}`);
  }
  return SKILLS_DIR;
}

/**
 * Load all skills — built-in skills plus user-defined skills from the skills directory.
 * User-defined skills with the same name as a built-in skill take precedence.
 */
export function loadAllSkills(): SkillDefinition[] {
  ensureSkillsDir();

  const skillsByName = new Map<string, SkillDefinition>();

  // Load built-in skills first
  for (const skill of getBuiltInSkills()) {
    skillsByName.set(skill.name, skill);
  }

  // Load user-defined skills (override built-in with same name)
  let userCount = 0;
  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch (err: any) {
    logger.warn(`Cannot read skills directory: ${err.message}`);
    return Array.from(skillsByName.values());
  }

  for (const entry of entries) {
    // Skip hidden files/directories
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(SKILLS_DIR, entry.name);

    if (entry.isFile() && entry.name.endsWith('.md')) {
      const skill = loadSkillFile(fullPath);
      if (skill) { skillsByName.set(skill.name, skill); userCount++; }
    } else if (entry.isDirectory()) {
      const skill = loadSkillFile(fullPath);
      if (skill) { skillsByName.set(skill.name, skill); userCount++; }
    }
  }

  const skills = Array.from(skillsByName.values());
  logger.debug(`Loaded ${skills.length} skills (${getBuiltInSkills().length} builtin + ${userCount} user)`);
  return skills;
}

/**
 * Build the skills section for the system prompt.
 * Uses progressive disclosure: lists skill names only, AI loads full content on demand via the skill tool.
 */
export function buildSkillsPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return '';

  const skillNames = skills.map(s => s.name).join(', ');

  return [
    '',
    '## Skills',
    '',
    `Available skills: ${skillNames}.`,
    'To load a skill\'s full instructions, use the `skill` tool with the skill name.',
    'To list available skills with descriptions, call the `skill` tool with no arguments.',
    '',
  ].join('\n');
}

/**
 * Format skill descriptions for listing (used by SkillTool).
 */
export function listSkillDescriptions(skills: SkillDefinition[]): string {
  return skills.map(s => `- **${s.name}**: ${s.description}`).join('\n');
}

/**
 * Find a skill by name. Returns the skill or undefined.
 */
export function findSkill(skills: SkillDefinition[], name: string): SkillDefinition | undefined {
  return skills.find(s => s.name === name);
}

/**
 * Reload skills (for hot-reload via REPL command).
 */
export function reloadSkills(): SkillDefinition[] {
  return loadAllSkills();
}
