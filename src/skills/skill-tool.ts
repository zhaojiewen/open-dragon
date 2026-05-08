/**
 * SkillTool — allows the AI to invoke user-defined skills during a conversation.
 * When invoked with a name, the skill's content (instructions) is expanded and returned.
 * When invoked without a name, lists all available skills with descriptions.
 */

import { BaseTool } from '../tools/base.js';
import type { ToolExecuteResult, ToolContext } from '../tools/base.js';
import { z } from 'zod';
import { findSkill, loadAllSkills, listSkillDescriptions } from './loader.js';
import type { SkillDefinition } from './types.js';
import { SkillNotFoundError } from '../utils/errors.js';

const SkillParamsSchema = z.object({
  name: z.string().optional().describe('Name of the skill to load. Omit to list all available skills.'),
});

export class SkillTool extends BaseTool {
  readonly name = 'skill';
  readonly description =
    'Load user-defined skill instructions for specialized tasks. ' +
    'Call without a name to list all available skills and their descriptions. ' +
    'Call with a skill name to load that skill\'s instructions so you can follow them.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the skill to load. Omit to list all available skills.' },
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

  async execute(params: Record<string, unknown>, _context?: ToolContext): Promise<ToolExecuteResult> {
    this.validateParams(params, SkillParamsSchema);

    const { name } = params as z.infer<typeof SkillParamsSchema>;

    // Auto-load skills from disk once if never explicitly set
    if (!this.skillsExplicitlySet) {
      this.skills = loadAllSkills();
      this.skillsExplicitlySet = true;
    }

    // List mode: no name provided
    if (!name) {
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

    // Return the skill content so the AI can follow its instructions
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
