import { describe, it, expect } from 'vitest';
import { SkillTool } from '../../../src/skills/skill-tool.js';
import type { SkillDefinition } from '../../../src/skills/types.js';

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
  });

  describe('execute', () => {
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
  });

  describe('setSkills', () => {
    it('should update skills list and clear invocation tracking', async () => {
      const tool = new SkillTool();
      tool.setSkills([createSkill({ name: 'v1' })]);

      // Invoke v1
      let result = await tool.execute({ name: 'v1' });
      expect(result.success).toBe(true);

      // Update skills — should clear tracking
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
});
