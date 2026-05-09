/**
 * Command Registry for tab-completion and hints
 *
 * Provides autocomplete suggestions and contextual hints for REPL commands.
 */

export interface CommandMeta {
  name: string;
  aliases: string[];
  description: string;
  usage?: string;
  subCommands?: string[];
  category: 'session' | 'provider' | 'workspace' | 'diagnostics' | 'other';
}

/**
 * Registry of all REPL commands with metadata
 */
export const COMMAND_REGISTRY: CommandMeta[] = [
  // Session commands
  {
    name: 'help',
    aliases: [],
    description: 'Show all commands and usage',
    category: 'session',
  },
  {
    name: 'clear',
    aliases: [],
    description: 'Clear conversation history',
    category: 'session',
  },
  {
    name: 'history',
    aliases: [],
    description: 'Show conversation history',
    category: 'session',
  },
  {
    name: 'save',
    aliases: [],
    description: 'Save conversation to file',
    usage: '<filename>',
    category: 'session',
  },
  {
    name: 'load',
    aliases: [],
    description: 'Load conversation from file',
    usage: '<filename>',
    category: 'session',
  },

  // Provider & Model commands
  {
    name: 'provider',
    aliases: [],
    description: 'Show or switch provider',
    usage: '[name]',
    subCommands: ['anthropic', 'openai', 'deepseek', 'gemini', 'qwen', 'zhipu'],
    category: 'provider',
  },
  {
    name: 'model',
    aliases: [],
    description: 'Show or change model',
    usage: '[model-name]',
    category: 'provider',
  },
  {
    name: 'tools',
    aliases: [],
    description: 'List or manage tools',
    usage: '[enable|disable <name>]',
    category: 'provider',
  },
  {
    name: 'skills',
    aliases: [],
    description: 'Manage skills',
    usage: '[list|create|edit|delete|reload|autogen]',
    subCommands: ['list', 'create', 'edit', 'delete', 'reload', 'autogen'],
    category: 'provider',
  },
  {
    name: 'auto',
    aliases: [],
    description: 'Toggle auto-approve tools',
    usage: '[out]',
    subCommands: ['out', 'outside'],
    category: 'provider',
  },
  {
    name: 'ask',
    aliases: [],
    description: 'Require confirmation for dangerous tools',
    usage: '[on|off]',
    subCommands: ['on', 'off'],
    category: 'provider',
  },

  // Workspace commands
  {
    name: 'workspace',
    aliases: ['ws'],
    description: 'Manage workspace paths',
    usage: '[add|on|off] [path]',
    subCommands: ['add', 'on', 'off'],
    category: 'workspace',
  },

  // Diagnostics commands
  {
    name: 'cost',
    aliases: [],
    description: 'Show token usage and cost estimate',
    category: 'diagnostics',
  },
  {
    name: 'cache',
    aliases: [],
    description: 'Show cache statistics and hit rate',
    category: 'diagnostics',
  },
  {
    name: 'perf',
    aliases: ['performance'],
    description: 'Show performance report',
    category: 'diagnostics',
  },
  {
    name: 'debug',
    aliases: [],
    description: 'Toggle debug mode',
    usage: '[on|off]',
    subCommands: ['on', 'off'],
    category: 'diagnostics',
  },

  // Token-saving commands
  {
    name: 'save-tokens',
    aliases: ['eco'],
    description: 'Toggle token-saving mode',
    usage: '[off|mild|moderate|aggressive]',
    subCommands: ['off', 'mild', 'moderate', 'aggressive'],
    category: 'other',
  },

  // Auto-skill commands
  {
    name: 'autoskill',
    aliases: [],
    description: 'Configure auto skill generation',
    usage: '[on|off|interval] [minutes]',
    subCommands: ['on', 'off', 'interval', 'set'],
    category: 'other',
  },

  // Other commands
  {
    name: 'encrypt',
    aliases: [],
    description: 'Show encryption info',
    category: 'other',
  },
  {
    name: 'exit',
    aliases: ['quit'],
    description: 'Exit REPL',
    category: 'other',
  },
];

/**
 * Get command completions for partial input
 * Returns matching command names (with / prefix)
 */
export function getCompletions(input: string): string[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const partial = input.slice(1).toLowerCase();
  const completions: string[] = [];

  // Handle empty "/" - show all commands
  if (partial === '') {
    return COMMAND_REGISTRY.map(cmd => '/' + cmd.name);
  }

  for (const cmd of COMMAND_REGISTRY) {
    // Check main name
    if (cmd.name.startsWith(partial)) {
      completions.push('/' + cmd.name);
    }
    // Check aliases
    for (const alias of cmd.aliases) {
      if (alias.startsWith(partial)) {
        completions.push('/' + alias);
      }
    }
  }

  return completions;
}

/**
 * Get sub-command completions (e.g., /workspace add)
 */
export function getSubCompletions(input: string): string[] {
  const parts = input.trim().split(/\s+/);
  if (parts.length < 2 || !parts[0].startsWith('/')) {
    return [];
  }

  const cmdName = parts[0].slice(1).toLowerCase();
  const partialSub = (parts[1] || '').toLowerCase();

  const cmd = COMMAND_REGISTRY.find(
    c => c.name === cmdName || c.aliases.includes(cmdName)
  );

  if (!cmd?.subCommands) {
    return [];
  }

  return cmd.subCommands
    .filter(sub => sub.startsWith(partialSub))
    .map(sub => parts[0] + ' ' + sub);
}

/**
 * Get hint text for current input state
 */
export function getHints(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const partial = trimmed.slice(1).toLowerCase();

  // Empty "/" - show general tip
  if (partial === '') {
    return 'Commands: /help for full list, /exit to quit';
  }

  // Find matching commands
  const matches = COMMAND_REGISTRY.filter(
    c => c.name.startsWith(partial) || c.aliases.some(a => a.startsWith(partial))
  );

  if (matches.length === 0) {
    return 'Unknown command. Type /help for available commands.';
  }

  if (matches.length === 1) {
    const cmd = matches[0];
    let hint = cmd.description;
    if (cmd.usage) {
      hint += ` | Usage: ${cmd.usage}`;
    }
    if (cmd.subCommands && cmd.subCommands.length > 0) {
      hint += ` | Options: ${cmd.subCommands.join(', ')}`;
    }
    return hint;
  }

  // Multiple matches - show list
  const matchNames = matches.map(c => '/' + c.name);
  return `Matches: ${matchNames.join(', ')}`;
}

/**
 * Get all commands by category
 */
export function getCommandsByCategory(): Record<string, CommandMeta[]> {
  const grouped: Record<string, CommandMeta[]> = {};

  for (const cmd of COMMAND_REGISTRY) {
    if (!grouped[cmd.category]) {
      grouped[cmd.category] = [];
    }
    grouped[cmd.category].push(cmd);
  }

  return grouped;
}

/**
 * Check if input is a valid command
 */
export function isValidCommand(input: string): boolean {
  if (!input.startsWith('/')) {
    return false;
  }

  const cmdName = input.slice(1).split(' ')[0].toLowerCase();
  return COMMAND_REGISTRY.some(
    c => c.name === cmdName || c.aliases.includes(cmdName)
  );
}

/**
 * Get command metadata by name or alias
 */
export function getCommand(name: string): CommandMeta | undefined {
  const lowerName = name.toLowerCase();
  return COMMAND_REGISTRY.find(
    c => c.name === lowerName || c.aliases.includes(lowerName)
  );
}