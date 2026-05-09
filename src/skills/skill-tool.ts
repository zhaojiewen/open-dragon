/**
 * SkillTool — allows the AI to invoke, list, create, and update user-defined skills.
 * When invoked with a name, the skill's content (instructions) is expanded and returned.
 * When invoked without a name, lists all available skills with descriptions.
 * When invoked with action "create" or "update", persists a new or updated skill file.
 */

import { BaseTool } from '../tools/base.js';
import type { ToolExecuteResult, ToolContext } from '../tools/base.js';
import { z } from 'zod';
import { findSkill, loadAllSkills, listSkillDescriptions, saveSkill } from './loader.js';
import type { SkillDefinition } from './types.js';
import { SkillNotFoundError } from '../utils/errors.js';

const SkillParamsSchema = z.object({
  action: z.enum(['load', 'list', 'create', 'update']).optional()
    .describe('Action to perform. "load" (default) loads a skill, "list" lists all, "create" saves a new skill, "update" overwrites an existing skill.'),
  name: z.string().optional()
    .describe('Name of the skill. Required for load, create, and update. Omit to list all.'),
  description: z.string().optional()
    .describe('Short description of what the skill does. Required for create and update.'),
  content: z.string().optional()
    .describe('Full instructions/content for the skill. Required for create and update.'),
});

export class SkillTool extends BaseTool {
  readonly name = 'skill';
  readonly description =
    'Load, list, create, or update user-defined skills. ' +
    'Call without arguments to list all skills. ' +
    'Call with a skill name to load its instructions. ' +
    'Use action "create" with name, description, and content to persist a reusable skill for future sessions. ' +
    'Use action "update" to overwrite an existing skill.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['load', 'list', 'create', 'update'],
        description: 'Action to perform. "load" (default) loads a skill, "list" lists all, "create" saves a new skill, "update" overwrites an existing skill.',
      },
      name: {
        type: 'string',
        description: 'Name of the skill. Required for load, create, and update. Omit to list all.',
      },
      description: {
        type: 'string',
        description: 'Short description of what the skill does. Required for create and update.',
      },
      content: {
        type: 'string',
        description: 'Full instructions/content for the skill. Required for create and update.',
      },
    },
  };

  private skills: SkillDefinition[] = [];
  private skillsExplicitlySet = false;
  private invokedSkills = new Set<string>();

  /** Update the skills list and clear invocation tracking (called on load/reload) */
  setSkills(skills: SkillDefinition[]) {
    this.skills = skills;
    this.skillsExplicitlySet = true;
    this.invokedSkills.clear();
  }

  /** Reload internal skills list from disk */
  private reloadSkills() {
    this.skills = loadAllSkills();
    this.invokedSkills.clear();
  }

  async execute(params: Record<string, unknown>, _context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, SkillParamsSchema);

    const { action, name, description, content } = params as z.infer<typeof SkillParamsSchema>;

    // Auto-load skills from disk once if never explicitly set
    if (!this.skillsExplicitlySet) {
      this.skills = loadAllSkills();
      this.skillsExplicitlySet = true;
    }

    // Determine effective action based on params (backward-compatible)
    const effectiveAction = action || (name ? 'load' : 'list');

    switch (effectiveAction) {
      case 'create':
      case 'update': {
        if (!name) {
          return { success: false, output: '', error: 'name is required for create/update' };
        }
        if (!description) {
          return { success: false, output: '', error: 'description is required for create/update' };
        }
        if (!content) {
          return { success: false, output: '', error: 'content is required for create/update' };
        }

        const filePath = saveSkill(name, description, content);
        this.reloadSkills();

        const verb = effectiveAction === 'create' ? 'Created' : 'Updated';
        return {
          success: true,
          output: `${verb} skill "${name}" at ${filePath}. Skills reloaded — available in future sessions.`,
        };
      }

      case 'list': {
        if (this.skills.length === 0) {
          return {
            success: true,
            output: 'No user-defined skills are currently available. Create skill files in ~/.dragon/skills/ or use action "create" to add one.',
          };
        }
        const listing = listSkillDescriptions(this.skills);
        return {
          success: true,
          output: `Available skills:\n\n${listing}\n\nTo load a skill, call this tool with the skill name.\nTo create a skill, use action "create" with name, description, and content.`,
        };
      }

      case 'load':
      default: {
        if (!name) {
          // No name provided — fall through to list
          if (this.skills.length === 0) {
            return {
              success: true,
              output: 'No user-defined skills are currently available. Create skill files in ~/.dragon/skills/ to add skills.',
            };
          }
          const listing = listSkillDescriptions(this.skills);
          return {
            success: true,
            output: `Available skills:\n\n${listing}\n\nTo load a skill, call this tool with the skill name.`,
          };
        }

        const skill = findSkill(this.skills, name);

        if (!skill) {
          const available = this.skills.map(s => s.name);
          throw new SkillNotFoundError(name, available);
        }

        if (this.invokedSkills.has(name)) {
          return {
            success: true,
            output: `Skill "${name}" was already loaded earlier in this conversation. Its instructions remain valid.`,
          };
        }

        this.invokedSkills.add(name);

        if (!skill.content || skill.content.trim().length === 0) {
          return {
            success: true,
            output: `Skill "${name}" has no content body. Description: ${skill.description}`,
          };
        }

        return {
          success: true,
          output: `[Skill: ${skill.name}]
${skill.description}

--- Skill Instructions ---
${skill.content}
--- End of Skill: ${skill.name} ---

Follow the above instructions to complete the task.`,
        };
      }
    }
  }
}
