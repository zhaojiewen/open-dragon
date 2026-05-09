import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SKILLS_DIR = path.join(os.homedir(), '.dragon', 'skills');

// Helper to create skill files
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
  const testSkills = ['test-skill', 'test-no-body', 'test-dir-skill', 'test-reload', 'test-escaped', 'xlsx', 'test-save', 'test-delete', 'test-colon', 'test-quotes', 'hidden-test'];

  afterEach(() => {
    testSkills.forEach(cleanupSkillFile);
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
      createSkillFile('test-quotes', 'name: "test-quotes"\ndescription: "A quoted description"', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-quotes');
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
      createSkillFile('test-colon', 'name: test-colon\ndescription: Do X: then Y: and Z', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-colon');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Do X: then Y: and Z');
    });

    it('should skip hidden files starting with dot', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, '.hidden-skill.md');
      fs.writeFileSync(filePath, '---\nname: hidden-skill\ndescription: Should be ignored\n---\n\nbody');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'hidden-skill');
      expect(found).toBeUndefined();

      fs.unlinkSync(filePath);
    });

    it('should skip hidden directories starting with dot', async () => {
      const dirPath = path.join(SKILLS_DIR, '.hidden-dir');
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dirPath, 'SKILL.md'), '---\nname: hidden-dir-skill\ndescription: Should be ignored\n---\n\nbody');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'hidden-dir-skill');
      expect(found).toBeUndefined();

      fs.rmSync(dirPath, { recursive: true, force: true });
    });

    it('should skip files without .md extension', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'test-file.txt');
      fs.writeFileSync(filePath, '---\nname: test-file\ndescription: Should be ignored\n---\n\nbody');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-file');
      expect(found).toBeUndefined();

      fs.unlinkSync(filePath);
    });

    it('should skip files missing description in frontmatter', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'no-desc.md');
      fs.writeFileSync(filePath, '---\nname: no-desc\n---\n\nbody');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'no-desc');
      expect(found).toBeUndefined();

      fs.unlinkSync(filePath);
    });

    it('should handle skills directory read errors gracefully', async () => {
      // Mock fs.readdirSync to throw an error
      const readdirMock = vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      // Should still return built-in skills
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some(s => s.name === 'xlsx')).toBe(true);

      readdirMock.mockRestore();
    });

    it('should handle stat errors gracefully', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'error-skill.md');
      fs.writeFileSync(filePath, '---\nname: error-skill\ndescription: test\n---\n\nbody');

      // Mock fs.statSync to throw for this specific file
      const statMock = vi.spyOn(fs, 'statSync').mockImplementation((p: string) => {
        if (p.toString().includes('error-skill')) {
          throw new Error('Stat error');
        }
        return fs.statSync(p);
      });

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      // Should not include the error-skill but still load others
      const found = skills.find(s => s.name === 'error-skill');
      expect(found).toBeUndefined();

      statMock.mockRestore();
      fs.unlinkSync(filePath);
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

    it('should return existing skills directory if already exists', async () => {
      const { ensureSkillsDir } = await import('../../../src/skills/loader.js');
      // Ensure it exists
      if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true, mode: 0o700 });
      }
      const dir = ensureSkillsDir();
      expect(dir).toBe(SKILLS_DIR);
    });

    it('should create skills directory when it does not exist', async () => {
      const existsMock = vi.spyOn(fs, 'existsSync').mockImplementation((p: string) => {
        if (p.toString().includes('.dragon/skills')) {
          return false;
        }
        return true;
      });
      const mkdirMock = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);

      // Re-import to get fresh module
      vi.resetModules();
      const { ensureSkillsDir } = await import('../../../src/skills/loader.js');
      const dir = ensureSkillsDir();

      expect(mkdirMock).toHaveBeenCalledWith(SKILLS_DIR, { recursive: true, mode: 0o700 });
      expect(dir).toBe(SKILLS_DIR);

      existsMock.mockRestore();
      mkdirMock.mockRestore();
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

  describe('saveSkill', () => {
    it('should save a new skill file', async () => {
      const { saveSkill, loadAllSkills } = await import('../../../src/skills/loader.js');

      const filePath = saveSkill('test-save', 'A saved skill', '## Saved content\n\nDo something.');
      expect(filePath).toContain('test-save.md');
      expect(fs.existsSync(filePath)).toBe(true);

      // Verify the content was saved correctly
      const savedContent = fs.readFileSync(filePath, 'utf-8');
      expect(savedContent).toContain('name: test-save');
      expect(savedContent).toContain('A saved skill');
      expect(savedContent).toContain('## Saved content');

      // Verify it can be loaded
      const skills = loadAllSkills();
      const found = skills.find(s => s.name === 'test-save');
      expect(found).toBeDefined();
      expect(found!.description).toBe('A saved skill');
    });

    it('should sanitize skill name with special characters', async () => {
      const { saveSkill } = await import('../../../src/skills/loader.js');

      // 'Test Skill@#$' - space, @, #, $ all get replaced with dashes
      const filePath = saveSkill('Test Skill@#$', 'Description', 'content');
      expect(filePath).toContain('test-skill---.md'); // 4 chars replaced: space, @, #, $

      fs.unlinkSync(filePath);
    });

    it('should handle description with quotes', async () => {
      const { saveSkill } = await import('../../../src/skills/loader.js');

      const filePath = saveSkill('test-quotes', 'A "quoted" description', 'content');
      const savedContent = fs.readFileSync(filePath, 'utf-8');
      expect(savedContent).toContain('A \\"quoted\\" description');

      fs.unlinkSync(filePath);
    });

    it('should overwrite existing skill file', async () => {
      const { saveSkill, loadAllSkills } = await import('../../../src/skills/loader.js');

      saveSkill('test-overwrite', 'Original description', 'Original content');
      saveSkill('test-overwrite', 'Updated description', 'Updated content');

      const skills = loadAllSkills();
      const found = skills.find(s => s.name === 'test-overwrite');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Updated description');
      expect(found!.content).toBe('Updated content');

      cleanupSkillFile('test-overwrite');
    });
  });

  describe('deleteSkill', () => {
    it('should delete a skill file', async () => {
      const { saveSkill, deleteSkill, loadAllSkills } = await import('../../../src/skills/loader.js');

      saveSkill('test-delete', 'To be deleted', 'content');
      expect(fs.existsSync(path.join(SKILLS_DIR, 'test-delete.md'))).toBe(true);

      const result = deleteSkill('test-delete');
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(SKILLS_DIR, 'test-delete.md'))).toBe(false);

      // Verify it's gone from loaded skills
      const skills = loadAllSkills();
      expect(skills.find(s => s.name === 'test-delete')).toBeUndefined();
    });

    it('should return false if skill does not exist', async () => {
      const { deleteSkill } = await import('../../../src/skills/loader.js');

      const result = deleteSkill('nonexistent-skill-xyz');
      expect(result).toBe(false);
    });

    it('should delete skill directory with SKILL.md', async () => {
      const dirPath = path.join(SKILLS_DIR, 'test-delete-dir');
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dirPath, 'SKILL.md'), '---\nname: test-delete-dir\ndescription: test\n---\n\ncontent');

      const { deleteSkill } = await import('../../../src/skills/loader.js');
      const result = deleteSkill('test-delete-dir');

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(dirPath, 'SKILL.md'))).toBe(false);

      // Cleanup if directory still exists
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    });
  });

  describe('parseFrontmatter (internal)', () => {
    it('should return null for content without frontmatter delimiters', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'no-frontmatter.md');
      fs.writeFileSync(filePath, 'No frontmatter here');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      expect(skills.find(s => s.name === 'no-frontmatter')).toBeUndefined();
      fs.unlinkSync(filePath);
    });

    it('should return null for unclosed frontmatter', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'unclosed.md');
      fs.writeFileSync(filePath, '---\nname: unclosed\ndescription: Missing closing');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      expect(skills.find(s => s.name === 'unclosed')).toBeUndefined();
      fs.unlinkSync(filePath);
    });

    it('should return null for frontmatter without closing newline', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'no-newline.md');
      fs.writeFileSync(filePath, '---\nname: test\ndescription: test---body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      // This should not be parsed correctly
      expect(skills.find(s => s.name === 'no-newline')).toBeUndefined();
      fs.unlinkSync(filePath);
    });

    it('should return null for frontmatter starting with --- but no newline after', async () => {
      const dir = path.join(SKILLS_DIR);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const filePath = path.join(dir, 'no-newline-after-delim.md');
      // --- followed by text without any newline in the entire file
      fs.writeFileSync(filePath, '---name: test description: test---body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      expect(skills.find(s => s.name === 'no-newline-after-delim')).toBeUndefined();
      fs.unlinkSync(filePath);
    });

    it('should handle frontmatter with empty lines', async () => {
      createSkillFile('test-empty-lines', 'name: test-empty-lines\n\ndescription: Has empty line', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      // Empty lines in frontmatter should be skipped
      const found = skills.find(s => s.name === 'test-empty-lines');
      expect(found).toBeDefined();
    });

    it('should handle frontmatter with extra whitespace', async () => {
      createSkillFile('test-whitespace', '  name  :   test-whitespace  \n  description  :  Has whitespace  ', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-whitespace');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Has whitespace');
    });

    it('should skip lines without colon in frontmatter', async () => {
      createSkillFile('test-no-colon', 'name: test-no-colon\ninvalid line without colon\ndescription: Valid desc', 'body');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'test-no-colon');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Valid desc');
    });

    it('should derive name from SKILL.md inside directory', async () => {
      const dirPath = path.join(SKILLS_DIR, 'derive-name-dir');
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(dirPath, 'SKILL.md'), '---\ndescription: Name from directory\n---\n\nbody');

      const { loadAllSkills } = await import('../../../src/skills/loader.js');
      const skills = loadAllSkills();

      const found = skills.find(s => s.name === 'derive-name-dir');
      expect(found).toBeDefined();
      expect(found!.description).toBe('Name from directory');

      fs.rmSync(dirPath, { recursive: true, force: true });
    });
  });
});