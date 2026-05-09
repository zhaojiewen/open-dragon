import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillTool } from '../../../src/skills/skill-tool.js';
import type { SkillDefinition } from '../../../src/skills/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILLS_DIR = path.join(os.homedir(), '.dragon', 'skills');

function cleanupSkillFile(name: string) {
  const filePath = path.join(SKILLS_DIR, `${name}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

describe('SkillTool', () => {
  const createSkill = (overrides: Partial<SkillDefinition> = {}): SkillDefinition => ({
    name: 'test-skill',
    description: 'A test skill',
    content: '## Instructions\n\nFollow these steps.\n',
    sourcePath: '/fake/test.md',
    loadedAt: new Date(),
    ...overrides,
  });

  describe('getDefinition', () => {
    it('should return skill tool definition', () => {
      const tool = new SkillTool();
      const def = tool.getDefinition();

      expect(def.name).toBe('skill');
      expect(def.description).toContain('skill');
      expect(def.parameters).toHaveProperty('properties');
    });

    it('should have correct parameter properties', () => {
      const tool = new SkillTool();
      const def = tool.getDefinition();

      expect(def.parameters.properties).toHaveProperty('action');
      expect(def.parameters.properties).toHaveProperty('name');
      expect(def.parameters.properties).toHaveProperty('description');
      expect(def.parameters.properties).toHaveProperty('content');
      expect(def.parameters.type).toBe('object');
    });
  });

  describe('listing mode', () => {
    it('should list available skills when called with no name', async () => {
      const tool = new SkillTool();
      tool.setSkills([
        createSkill({ name: 'skill-a', description: 'First skill' }),
        createSkill({ name: 'skill-b', description: 'Second skill' }),
      ]);

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('skill-a');
      expect(result.output).toContain('First skill');
      expect(result.output).toContain('skill-b');
      expect(result.output).toContain('Second skill');
    });

    it('should return no-skills message when listing with empty skills', async () => {
      const tool = new SkillTool();
      tool.setSkills([]);

      const result = await tool.execute({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('No user-defined skills');
    });

    it('should list skills with action: list', async () => {
      const tool = new SkillTool();
      tool.setSkills([
        createSkill({ name: 'skill-a', description: 'First skill' }),
      ]);

      const result = await tool.execute({ action: 'list' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('skill-a');
      expect(result.output).toContain('Available skills');
    });

    it('should return no-skills message for list action with empty skills', async () => {
      const tool = new SkillTool();
      tool.setSkills([]);

      const result = await tool.execute({ action: 'list' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No user-defined skills');
      expect(result.output).toContain('Create skill files');
    });
  });

  describe('execute - load mode', () => {
    it('should return skill content for a known skill', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill()]);

      const result = await tool.execute({ name: 'test-skill' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('test-skill');
      expect(result.output).toContain('Follow these steps');
      expect(result.output).toContain('--- Skill Instructions ---');
    });

    it('should throw SkillNotFoundError for unknown skill', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill()]);

      await expect(tool.execute({ name: 'nonexistent' })).rejects.toThrow('Skill "nonexistent" not found');
    });

    it('should throw SkillNotFoundError when no skills registered', async () => {
      const tool = new SkillTool();

      await expect(tool.execute({ name: 'anything' })).rejects.toThrow('Skill "anything" not found');
    });

    it('should include available skills in error message', async () => {
      const tool = new SkillTool();
      tool.setSkills([
        createSkill({ name: 'skill-a' }),
        createSkill({ name: 'skill-b' }),
      ]);

      await expect(tool.execute({ name: 'unknown' })).rejects.toThrow('skill-a, skill-b');
    });

    it('should handle empty skill content', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'empty-skill', content: '' })]);

      const result = await tool.execute({ name: 'empty-skill' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('no content body');
      expect(result.output).toContain('empty-skill');
    });

    it('should handle whitespace-only skill content', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'whitespace-skill', content: '   \n  \n  ' })]);

      const result = await tool.execute({ name: 'whitespace-skill' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('no content body');
    });

    it('should track invoked skills and avoid re-injecting content', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill()]);

      // First invocation - loads content
      const result1 = await tool.execute({ name: 'test-skill' });
      expect(result1.success).toBe(true);
      expect(result1.output).toContain('Follow these steps');

      // Second invocation - should skip
      const result2 = await tool.execute({ name: 'test-skill' });
      expect(result2.success).toBe(true);
      expect(result2.output).toContain('already loaded');
      expect(result2.output).not.toContain('Follow these steps');
    });

    it('should throw on non-string name params', async () => {
      const tool = new SkillTool();

      await expect(tool.execute({ name: 123 })).rejects.toThrow('Invalid parameters');
    });

    it('should include skill description in output', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'my-skill', description: 'Does magic things' })]);

      const result = await tool.execute({ name: 'my-skill' });

      expect(result.output).toContain('Does magic things');
    });

    it('should load with action: load', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill()]);

      const result = await tool.execute({ action: 'load', name: 'test-skill' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Follow these steps');
    });

    it('should fall back to list when load has no name', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'skill-a' })]);

      const result = await tool.execute({ action: 'load' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Available skills');
      expect(result.output).toContain('skill-a');
    });

    it('should fall back to no-skills message when load has no name and empty skills', async () => {
      const tool = new SkillTool();
      tool.setSkills([]);

      const result = await tool.execute({ action: 'load' });

      expect(result.success).toBe(true);
      expect(result.output).toContain('No user-defined skills');
    });
  });

  describe('execute - create mode', () => {
    afterEach(() => {
      cleanupSkillFile('test-create');
      cleanupSkillFile('test-create-new');
    });

    it('should create a new skill file', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'create',
        name: 'test-create',
        description: 'A newly created skill',
        content: '## New Skill\n\nDo something new.',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Created skill');
      expect(result.output).toContain('test-create');
      expect(result.output).toContain('Skills reloaded');

      // Verify file was created
      const filePath = path.join(SKILLS_DIR, 'test-create.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should require name for create', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'create',
        description: 'Missing name',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('name is required for create/update');
    });

    it('should require description for create', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'create',
        name: 'test-create',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('description is required for create/update');
    });

    it('should require content for create', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'create',
        name: 'test-create',
        description: 'Missing content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('content is required for create/update');
    });

    it('should reload skills after create', async () => {
      const tool = new SkillTool();
      tool.setSkills([]);

      await tool.execute({
        action: 'create',
        name: 'test-create-new',
        description: 'Created skill',
        content: 'Content',
      });

      // Now the skill should be available
      const result = await tool.execute({ name: 'test-create-new' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Created skill');
    });
  });

  describe('execute - update mode', () => {
    afterEach(() => {
      cleanupSkillFile('test-update');
    });

    it('should update an existing skill file', async () => {
      const tool = new SkillTool();

      // Create first
      await tool.execute({
        action: 'create',
        name: 'test-update',
        description: 'Original description',
        content: 'Original content',
      });

      // Update
      const result = await tool.execute({
        action: 'update',
        name: 'test-update',
        description: 'Updated description',
        content: 'Updated content',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Updated skill');
      expect(result.output).toContain('test-update');
    });

    it('should require name for update', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'update',
        description: 'Missing name',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('name is required for create/update');
    });

    it('should require description for update', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'update',
        name: 'test-update',
        content: 'content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('description is required for create/update');
    });

    it('should require content for update', async () => {
      const tool = new SkillTool();

      const result = await tool.execute({
        action: 'update',
        name: 'test-update',
        description: 'Missing content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('content is required for create/update');
    });
  });

  describe('setSkills', () => {
    it('should update skills list and clear invocation tracking', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'v1' })]);

      // Invoke v1
      let result = await tool.execute({ name: 'v1' });
      expect(result.success).toBe(true);

      // Update skills - should clear tracking
      tool.setSkills([createSkill({ name: 'v2' })]);

      result = await tool.execute({ name: 'v2' });
      expect(result.success).toBe(true);

      await expect(tool.execute({ name: 'v1' })).rejects.toThrow('v1');
    });

    it('should allow re-invocation after reload', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill()]);

      // First invocation
      const result1 = await tool.execute({ name: 'test-skill' });
      expect(result1.output).toContain('Follow these steps');

      // Second invocation - blocked because already loaded
      const result2 = await tool.execute({ name: 'test-skill' });
      expect(result2.output).toContain('already loaded');

      // Reload skills clears tracking
      tool.setSkills([createSkill()]);

      // Now can invoke again
      const result3 = await tool.execute({ name: 'test-skill' });
      expect(result3.output).toContain('Follow these steps');
    });
  });

  describe('auto-load from disk', () => {
    afterEach(() => {
      cleanupSkillFile('auto-load-test');
    });

    it('should auto-load skills from disk when never explicitly set', async () => {
      // Create a skill file
      const filePath = path.join(SKILLS_DIR, 'auto-load-test.md');
      const content = '---\nname: auto-load-test\ndescription: Auto loaded skill\n---\n\n## Auto loaded';
      fs.writeFileSync(filePath, content);

      const tool = new SkillTool();
      // Don't call setSkills - should auto-load

      const result = await tool.execute({ name: 'auto-load-test' });
      expect(result.success).toBe(true);
      expect(result.output).toContain('Auto loaded skill');
    });

    it('should list built-in skills when auto-loading', async () => {
      const tool = new SkillTool();
      // Don't call setSkills

      const result = await tool.execute({ action: 'list' });
      expect(result.success).toBe(true);
      // Built-in skills should be present
      expect(result.output).toContain('xlsx');
    });
  });

  describe('validateParams', () => {
    it('should throw on invalid action value', async () => {
      const tool = new SkillTool();

      await expect(tool.execute({ action: 'invalid-action' })).rejects.toThrow('Invalid parameters');
    });

    it('should throw on non-string description', async () => {
      const tool = new SkillTool();

      await expect(tool.execute({
        action: 'create',
        name: 'test',
        description: 123,
        content: 'test',
      })).rejects.toThrow('Invalid parameters');
    });

    it('should throw on non-string content', async () => {
      const tool = new SkillTool();

      await expect(tool.execute({
        action: 'create',
        name: 'test',
        description: 'test',
        content: 123,
      })).rejects.toThrow('Invalid parameters');
    });
  });
});