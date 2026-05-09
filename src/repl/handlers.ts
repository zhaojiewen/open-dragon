/**
 * REPL command handlers (workspace, skills)
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import type { Message } from '../providers/base.js';
import type { DragonConfig } from '../config/index.js';
import type { ToolRegistry } from '../tools/index.js';
import { AUTOGEN_PROMPT } from './config.js';

// Auto-skill generation state (shared with main REPL)
let pendingAutoGen = false;
let lastAutoGenMessageIndex = 0;

export function setAutoGenState(pending: boolean, lastIndex: number): void {
  pendingAutoGen = pending;
  lastAutoGenMessageIndex = lastIndex;
}

export function getAutoGenState(): { pending: boolean; lastIndex: number } {
  return { pending: pendingAutoGen, lastIndex: lastAutoGenMessageIndex };
}

/**
 * Handle workspace management commands
 */
export async function handleWorkspaceCommand(
  args: string[],
  config: DragonConfig,
  toolRegistry: ToolRegistry,
): Promise<boolean> {
  const action = args[0]?.toLowerCase();

  switch (action) {
    case 'add': {
      const newPath = args[1];
      if (!newPath) {
        console.log(chalk.red('  Usage: /workspace add <path>'));
        return true;
      }
      const resolved = path.resolve(newPath);
      if (!fs.existsSync(resolved)) {
        console.log(chalk.red(`  Path does not exist: ${resolved}`));
        return true;
      }
      const currentPaths = config.workspace?.paths || [];
      if (currentPaths.includes(resolved)) {
        console.log(chalk.dim(`  Path already in workspace: ${resolved}`));
        return true;
      }
      // Update config
      if (!config.workspace) {
        config.workspace = { paths: [], writeEnabled: true, enforceBounds: true, allowHomeDir: true };
      }
      config.workspace.paths = [...currentPaths, resolved];
      config.workspace.enforceBounds = true;
      toolRegistry.setWorkspaceScope(
        config.workspace.paths,
        config.workspace.allowHomeDir
          ? [...config.workspace.paths, process.env.HOME || os.homedir()].filter(Boolean)
          : config.workspace.paths
      );
      // Persist to disk
      try {
        const { saveConfig } = await import('../config/index.js');
        saveConfig(config);
        console.log(chalk.green(`  ✓ Added to workspace: ${resolved}`));
      } catch (e: any) {
        console.log(chalk.red(`  Failed to save config: ${e.message}`));
      }
      return true;
    }
    case 'off':
      if (config.workspace) {
        config.workspace.enforceBounds = false;
        toolRegistry.setWorkspaceScope([]);
        try {
          const { saveConfig } = await import('../config/index.js');
          saveConfig(config);
        } catch {}
      }
      console.log(chalk.yellow('  Workspace enforcement disabled. All paths are now accessible.'));
      console.log(chalk.dim('  /workspace on to re-enable.'));
      return true;
    case 'on':
      if (config.workspace && config.workspace.paths.length > 0) {
        config.workspace.enforceBounds = true;
        toolRegistry.setWorkspaceScope(
          config.workspace.paths,
          config.workspace.allowHomeDir
            ? [...config.workspace.paths, process.env.HOME || os.homedir()].filter(Boolean)
            : config.workspace.paths
        );
        try {
          const { saveConfig } = await import('../config/index.js');
          saveConfig(config);
        } catch {}
        console.log(chalk.green('  ✓ Workspace enforcement enabled.'));
        console.log(chalk.dim(`  Paths: ${config.workspace.paths.join(', ')}`));
      } else {
        console.log(chalk.yellow('  No workspace paths configured. Use /workspace add <path> first.'));
      }
      return true;
    default:
      // Show current workspace status
      const paths = config.workspace?.paths || [];
      const enforced = config.workspace?.enforceBounds ?? false;
      console.log(chalk.yellow('\n  Workspace:'));
      console.log(chalk.dim(`  Status: ${enforced ? chalk.green('enforced') : chalk.yellow('disabled')}`));
      if (paths.length > 0) {
        paths.forEach((p: string) => console.log(chalk.dim(`  • ${p}`)));
      } else {
        console.log(chalk.dim('  No paths configured.'));
      }
      console.log(chalk.dim('\n  /workspace add <path>') + '  Add directory to workspace');
      console.log(chalk.dim('  /workspace on|off     ') + '  Enable/disable enforcement');
      console.log();
      return true;
  }
}

/**
 * Handle skills management commands
 */
export async function handleSkillsCommand(
  args: string[],
  toolRegistry: ToolRegistry,
  messages: Message[],
): Promise<void> {
  const { loadAllSkills, reloadSkills, ensureSkillsDir, SKILLS_DIR, deleteSkill } = await import('../skills/index.js');

  const subAction = args[0]?.toLowerCase();

  switch (subAction) {
    case 'reload': {
      const refreshed = reloadSkills();
      toolRegistry.setSkills(refreshed);
      console.log(chalk.green(`  ✓ Reloaded ${refreshed.length} skill(s) from ${SKILLS_DIR}`));
      refreshed.forEach(s => {
        console.log(chalk.dim(`    • ${s.name}: ${s.description.substring(0, 80)}${s.description.length > 80 ? '...' : ''}`));
      });
      return;
    }
    case 'create': {
      const name = args[1];
      if (!name) {
        console.log(chalk.red('  Usage: /skills create <name>'));
        console.log(chalk.dim('  Creates a new skill file in ' + SKILLS_DIR));
        return;
      }
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      ensureSkillsDir();
      const skillPath = path.join(SKILLS_DIR, `${safeName}.md`);
      if (fs.existsSync(skillPath)) {
        console.log(chalk.yellow(`  Skill "${safeName}" already exists at ${skillPath}`));
        return;
      }
      const template = `---
name: ${safeName}
description: Describe what this skill does
---

# ${name}

Write your skill instructions here. This content will be provided to the AI when it invokes the \`skill\` tool with \`name: ${safeName}\`.

## Guidelines

- Be specific about what the skill should accomplish
- Include examples if helpful
- Reference tools the AI should use: bash, read, write, edit, glob, grep, webfetch, websearch, agent
`;
      fs.writeFileSync(skillPath, template);
      console.log(chalk.green(`  ✓ Created skill: ${skillPath}`));
      console.log(chalk.dim('  Edit this file to define your skill, then /skills reload to activate it.'));
      return;
    }
    case 'edit': {
      const name = args[1];
      if (!name) {
        console.log(chalk.red('  Usage: /skills edit <name>'));
        return;
      }
      ensureSkillsDir();
      const skillPath = path.join(SKILLS_DIR, `${name}.md`);
      if (!fs.existsSync(skillPath)) {
        const dirPath = path.join(SKILLS_DIR, name);
        const innerPath = path.join(dirPath, 'SKILL.md');
        if (fs.existsSync(innerPath)) {
          const editor = process.env.EDITOR || 'vi';
          const { spawnSync } = await import('child_process');
          console.log(chalk.dim(`Opening skill in ${editor}: ${innerPath}`));
          spawnSync(editor, [innerPath], { stdio: 'inherit' });
          return;
        }
        console.log(chalk.red(`  Skill "${name}" not found in ${SKILLS_DIR}`));
        return;
      }
      const editor = process.env.EDITOR || 'vi';
      const { spawnSync } = await import('child_process');
      console.log(chalk.dim(`Opening skill in ${editor}: ${skillPath}`));
      spawnSync(editor, [skillPath], { stdio: 'inherit' });
      return;
    }
    case 'delete': {
      const name = args[1];
      if (!name) {
        console.log(chalk.red('  Usage: /skills delete <name>'));
        return;
      }
      const deleted = deleteSkill(name);
      if (deleted) {
        console.log(chalk.green(`  ✓ Deleted skill "${name}"`));
        const refreshed = reloadSkills();
        toolRegistry.setSkills(refreshed);
      } else {
        console.log(chalk.yellow(`  Skill "${name}" not found in ${SKILLS_DIR}`));
      }
      return;
    }
    case 'autogen': {
      // Push the autogen prompt immediately - this will trigger AI to analyze conversation
      messages.push({ role: 'user', content: AUTOGEN_PROMPT });
      // Mark that autogen is pending (used by REPL to track state)
      setAutoGenState(true, messages.length);
      console.log(chalk.dim('  Auto-generating skills from conversation history...'));
      console.log(chalk.dim('  The AI will analyze patterns and create reusable skill definitions.'));
      return;
    }
    default: {
      const skills = loadAllSkills();
      if (skills.length === 0) {
        console.log(chalk.yellow('\n  No skills found.'));
        console.log(chalk.dim(`  Skills directory: ${SKILLS_DIR}`));
        console.log(chalk.dim('  /skills create <name>   Create a new skill'));
        console.log(chalk.dim('  /skills autogen          Auto-generate skills from conversation'));
        console.log(chalk.dim('  /skills reload           Reload all skills'));
        console.log();
        return;
      }

      console.log(chalk.yellow(`\n  Skills (${skills.length}):`));
      console.log(chalk.dim(`  Directory: ${SKILLS_DIR}`));
      console.log();
      for (const skill of skills) {
        const contentPreview = skill.content
          ? skill.content.substring(0, 60).replace(/\n/g, ' ') + (skill.content.length > 60 ? '...' : '')
          : '(empty body)';
        console.log(`  ${chalk.cyan(skill.name)}`);
        console.log(chalk.dim(`    ${skill.description}`));
        console.log(chalk.dim(`    ${contentPreview}`));
        console.log();
      }
      console.log(chalk.dim('  /skills create <name>   Create a new skill'));
      console.log(chalk.dim('  /skills edit <name>     Edit a skill in $EDITOR'));
      console.log(chalk.dim('  /skills delete <name>   Delete a skill'));
      console.log(chalk.dim('  /skills autogen          Auto-generate skills from conversation'));
      console.log(chalk.dim('  /skills reload           Reload all skills'));
      console.log();
    }
  }
}