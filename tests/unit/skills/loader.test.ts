import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILLS_DIR = path.join(os.homedir(), '.dragon', 'skills');

// Import the loader functions - they read from real ~/.dragon/skills/
// We test by creating temp skill files there

function createSkillFile(name: string, frontmatter: string, body: string) {
  const dir = path.join(SKILLS_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = path.join(dir, `${name}.md`);
  const content = `---\n${frontmatter}\n---\n\n${body}`;
  fs.writeFileSync(filePath, content);
  return filePath;
}

function cleanupSkillFile(name: string) {
  const filePath = path.join(SKILLS_DIR, `${name}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  // Also try directory form
  const dirPath = path.join(SKILLS_DIR, name);
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

describe('Skills Loader', () => {
  afterEach(() => {
    // Cleanup test skill files
    ['test-skill', 'test-no-body', 'test-dir-skill', 'test-reload', 'test-escaped', 'xlsx'].forEach(cleanupSkillFile);
  });

  describe('loadAllSkills', () => {
    it('should include built-in skills', async () => {
      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      expect(skills.some(s => s.name === 'xlsx')).toBe(true);
      expect(skills.some(s => s.name === 'docx')).toBe(true);
      expect(skills.some(s => s.name === 'pptx')).toBe(true);
      expect(skills.some(s => s.name === 'pdf')).toBe(true);
    });

    it('should let user skills override built-in skills with same name', async () => {
      createSkillFile('xlsx', 'name: xlsx\ndescription: Custom xlsx override', 'custom body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const xlsx = skills.find(s => s.name === 'xlsx');
      expect(xlsx).toBeDefined();
      expect(xlsx!.description).toBe('Custom xlsx override');
      expect(xlsx!.content).toBe('custom body');
    });
    it('should load a valid skill file', async () => {
      createSkillFile('test-skill', 'name: test-skill\ndescription: A test skill', '## Instructions\n\nDo something useful.');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
      expect(found!.description).toBe('A test skill');
      expect(found!.content).toBe('## Instructions\n\nDo something useful.');
      expect(found!.loadedAt).toBeInstanceOf(Date);
    });

    it('should handle quoted values in frontmatter', async () => {
      createSkillFile('test-skill', 'name: "test-skill"\ndescription: "A quoted description"', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
      expect(found!.description).toBe('A quoted description');
    });

    it('should handle single-quoted values in frontmatter', async () => {
      createSkillFile('test-skill', "name: 'test-skill'\ndescription: 'Single quoted desc'", 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Single quoted desc');
    });

    it('should derive name from filename when not in frontmatter', async () => {
      createSkillFile('test-skill', 'description: A skill without explicit name', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
    });

    it('should skip files without valid frontmatter', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'test-no-body.md');
      fs.writeFileSync(filePath, 'Just some text without frontmatter');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-no-body');
      expect(found).toBeUndefined();
    });

    it('should load skill from directory with SKILL.md inside', async () => {
      const dirPath = path.join(SKILLS_DIR, 'test-dir-skill');
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      const content = '---\nname: test-dir-skill\ndescription: A skill in a directory\n---\n\n## Dir Skill Body';
      fs.writeFileSync(path.join(dirPath, 'SKILL.md'), content);

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-dir-skill');
      expect(found).toBeDefined();
      expect(found!.description).toBe('A skill in a directory');
      expect(found!.content).toBe('## Dir Skill Body');
    });

    it('should skip directories without SKILL.md', async () => {
      const dirPath = path.join(SKILLS_DIR, 'empty-dir');
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'empty-dir');
      expect(found).toBeUndefined();

      fs.rmSync(dirPath, { recursive: true, force: true });
    });

    it('should handle empty body gracefully', async () => {
      createSkillFile('test-skill', 'name: test-skill\ndescription: Skill with no content', '');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
      expect(found!.content).toBe('');
    });

    it('should handle description values containing colons', async () => {
      createSkillFile('test-skill', 'name: test-skill\ndescription: Do X: then Y: and Z', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-skill');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Do X: then Y: and Z');
    });
  });

  describe('buildSkillsPrompt', () => {
    it('should return empty string for empty skills list', async () => {
      const { buildSkillsPrompt } = await import('../../../src/skills/loader.js');
      const result = buildSkillsPrompt([]);
      expect(result).toBe('');
    });

    it('should list skill names in compact prompt format', async () => {
      const { buildSkillsPrompt } = await import('../../../src/skills/loader.js');
      const result = buildSkillsPrompt([
        {
          name: 'test-skill',
          description: 'A test skill',
          content: 'body',
          sourcePath: '/fake/path.md',
          loadedAt: new Date(),
        },
      ]);

      expect(result).toContain('test-skill');
      expect(result).toContain('Skills');
      expect(result).toContain('skill');
    });

    it('should handle multiple skills', async () => {
      const { buildSkillsPrompt } = await import('../../../src/skills/loader.js');
      const result = buildSkillsPrompt([
        { name: 'skill-a', description: 'First skill', content: '', sourcePath: '/a.md', loadedAt: new Date() },
        { name: 'skill-b', description: 'Second skill', content: '', sourcePath: '/b.md', loadedAt: new Date() },
      ]);

      expect(result).toContain('skill-a');
      expect(result).toContain('skill-b');
    });
  });

  describe('listSkillDescriptions', () => {
    it('should format skills with descriptions', async () => {
      const { listSkillDescriptions } = await import('../../../src/skills/loader.js');
      const result = listSkillDescriptions([
        { name: 'skill-a', description: 'First skill', content: '', sourcePath: '/a.md', loadedAt: new Date() },
        { name: 'skill-b', description: 'Second skill', content: '', sourcePath: '/b.md', loadedAt: new Date() },
      ]);

      expect(result).toContain('skill-a');
      expect(result).toContain('First skill');
      expect(result).toContain('skill-b');
      expect(result).toContain('Second skill');
    });

    it('should return empty string for empty skills', async () => {
      const { listSkillDescriptions } = await import('../../../src/skills/loader.js');
      const result = listSkillDescriptions([]);
      expect(result).toBe('');
    });
  });

  describe('findSkill', () => {
    it('should find a skill by name', async () => {
      const { findSkill } = await import('../../../src/skills/loader.js');
      const skills = [
        { name: 'target', description: 'Target', content: 'c', sourcePath: '/t.md', loadedAt: new Date() },
      ];

      expect(findSkill(skills, 'target')).toBeDefined();
      expect(findSkill(skills, 'nonexistent')).toBeUndefined();
    });
  });

  describe('ensureSkillsDir', () => {
    it('should create skills directory', async () => {
      const { ensureSkillsDir } = await import('../../../src/skills/loader.js');
      const dir = ensureSkillsDir();
      expect(fs.existsSync(dir)).toBe(true);
      expect(dir).toBe(SKILLS_DIR);
    });
  });

  describe('reloadSkills', () => {
    it('should reload and return fresh skills', async () => {
      createSkillFile('test-reload', 'name: test-reload\ndescription: Reload test', 'body');

      const { reloadSkills } = await import('../../../src/skills/loader.js');
      const skills = reloadSkills();

      expect(skills.some(s => s.name === 'test-reload')).toBe(true);
    });
  });
});
