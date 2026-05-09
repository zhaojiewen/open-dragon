/**
 * REPL command handlers
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { getLogger } from '../utils/logger.js';
import { costTracker } from '../utils/cost-tracker.js';
import { perfMonitor } from '../performance/index.js';
import { createProvider } from '../providers/index.js';
import type { Message } from '../providers/base.js';
import type { DragonConfig } from '../config/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { SessionState, TokenSaveLevel, TokenSaveConfig } from './config.js';
import { TOKEN_SAVE_CONFIGS } from './config.js';
import { handleWorkspaceCommand, handleSkillsCommand } from './handlers.js';

const logger = getLogger();

/**
 * Handle REPL commands (starting with /)
 * Returns true to continue REPL, false to exit
 */
export async function handleCommand(
  input: string,
  config: DragonConfig,
  messages: Message[],
  toolRegistry: ToolRegistry,
  session: SessionState
): Promise<boolean> {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
      showHelp();
      return true;

    case 'clear':
      clearSession(messages, session);
      return true;

    case 'history':
      showHistory(messages);
      return true;

    case 'provider':
      await handleProviderCommand(args, config, session);
      return true;

    case 'model':
      await handleModelCommand(args, session);
      return true;

    case 'tools':
      handleToolsCommand(args, config, toolRegistry);
      return true;

    case 'skills':
      await handleSkillsCommand(args, toolRegistry, messages);
      return true;

    case 'perf':
    case 'performance':
      handlePerfCommand();
      return true;

    case 'debug':
      handleDebugCommand(args);
      return true;

    case 'cost':
      handleCostCommand();
      return true;

    case 'cache':
      handleCacheCommand(session);
      return true;

    case 'save':
      handleSaveCommand(args, messages);
      return true;

    case 'load':
      handleLoadCommand(args, messages);
      return true;

    case 'encrypt':
      console.log(chalk.yellow('To enable encryption, run: dragon init --encrypt'));
      return true;

    case 'exit':
    case 'quit':
      return false;

    case 'auto':
      handleAutoCommand(args, session);
      return true;

    case 'ask':
      handleAskCommand(args, session);
      return true;

    case 'workspace':
    case 'ws':
      return await handleWorkspaceCommand(args, config, toolRegistry);

    case 'save-tokens':
    case 'eco':
      handleSaveTokensCommand(args, config, session);
      return true;

    case 'autoskill':
      handleAutoskillCommand(args, config);
      return true;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      return true;
  }
}

function showHelp(): void {
  console.log(chalk.yellow('\n  Commands:'));
  console.log(chalk.dim('  ── Session ──'));
  console.log('  /clear       Clear conversation history');
  console.log('  /history     Show conversation history');
  console.log('  /save, /load Save/load conversation');
  console.log(chalk.dim('  ── Provider & Model ──'));
  console.log('  /provider    Show or change provider (e.g. /provider openai)');
  console.log('  /model       Show or change model (e.g. /model claude-sonnet-4-6)');
  console.log('  /tools       List available tools');
  console.log('  /skills      Manage skills (list, create, edit, delete, autogen)');
  console.log('  /auto        Toggle auto-approve all dangerous tools');
  console.log('  /ask         Require confirmation for dangerous tools');
  console.log('  /workspace   Manage workspace paths (add/on/off)');
  console.log('  /save-tokens Toggle token-saving eco mode (/eco)');
  console.log('  /autoskill   Configure auto skill generation interval');
  console.log(chalk.dim('  ── Diagnostics ──'));
  console.log('  /cost        Show token usage & cost estimate');
  console.log('  /cache       Show cache statistics & hit rate');
  console.log('  /perf        Show performance report (--monitor flag required)');
  console.log('  /debug       Toggle debug mode (on/off)');
  console.log(chalk.dim('  ── Other ──'));
  console.log('  /encrypt     Show encryption info');
  console.log('  /exit, /quit Exit REPL');
  console.log();
}

function clearSession(messages: Message[], session: SessionState): void {
  messages.length = 0;
  costTracker.reset();
  session.tokenSavePrompted = false;
  console.log(chalk.dim('Conversation and token counter cleared.'));
}

function showHistory(messages: Message[]): void {
  if (messages.length === 0) {
    console.log(chalk.dim('No conversation history.'));
    return;
  }

  const userMsgs = messages.filter(m => m.role === 'user');
  const toolMsgs = messages.filter(m => {
    if (typeof m.content !== 'string' && Array.isArray(m.content)) {
      return m.content.some((b: any) => b.type === 'tool_result');
    }
    return false;
  });

  console.log(chalk.dim(`\n  ${messages.length} messages (${userMsgs.length} user turns, ${toolMsgs.length} tool results)\n`));

  messages.forEach((msg) => {
    let role: string;
    let icon: string;
    switch (msg.role) {
      case 'user':
        role = chalk.green('You');
        icon = chalk.green('▸');
        break;
      case 'assistant':
        role = chalk.cyan('Assistant');
        icon = chalk.cyan('◂');
        break;
      default:
        role = chalk.dim(msg.role);
        icon = chalk.dim('·');
    }

    if (typeof msg.content === 'string') {
      const preview = msg.content.substring(0, 120).replace(/\n/g, ' ');
      console.log(`  ${icon} ${role}: ${preview}${msg.content.length > 120 ? '...' : ''}`);
    } else if (Array.isArray(msg.content)) {
      const types = msg.content.map((b: any) => b.type).filter(Boolean);
      const toolUseCount = types.filter((t: string) => t === 'tool_use').length;
      const toolResultCount = types.filter((t: string) => t === 'tool_result').length;
      const parts: string[] = [];
      if (toolUseCount) parts.push(`${toolUseCount} tool_use`);
      if (toolResultCount) parts.push(`${toolResultCount} tool_result`);
      const textBlocks = msg.content.filter((b: any) => b.type === 'text');
      if (textBlocks.length) parts.push(`${textBlocks.length} text`);
      console.log(`  ${icon} ${role}: [${parts.join(', ')}]`);
    }
  });
  console.log();
}

async function handleProviderCommand(args: string[], config: DragonConfig, session: SessionState): Promise<void> {
  if (args[0]) {
    const newProvider = args[0];
    if (!config.providers[newProvider]) {
      console.log(chalk.red(`Provider not configured: ${newProvider}`));
      return;
    }
    try {
      session.provider = createProvider(newProvider, config);
      session.providerName = newProvider;
      session.model = session.provider.getDefaultModel();
      console.log(chalk.green(`Switched to provider: ${newProvider}`));
      console.log(chalk.dim(`Model: ${session.model}`));
    } catch (error: any) {
      console.log(chalk.red(`Failed to switch provider: ${error.message || error}`));
    }
  } else {
    console.log(chalk.dim(`Current provider: ${session.providerName}`));
  }
}

async function handleModelCommand(args: string[], session: SessionState): Promise<void> {
  if (args[0]) {
    session.model = args[0];
    console.log(chalk.dim(`Model set to: ${session.model}`));
  } else {
    console.log(chalk.dim(`Current model: ${session.model}`));
    console.log(chalk.dim(`Available models: ${(await session.provider.listModels()).join(', ')}`));
  }
}

function handleToolsCommand(args: string[], config: DragonConfig, toolRegistry: ToolRegistry): void {
  if (args[0] === 'enable' && args[1]) {
    console.log(chalk.green(`Tool '${args[1]}' enabled for this session`));
  } else if (args[0] === 'disable' && args[1]) {
    console.log(chalk.yellow(`Tool '${args[1]}' disabled for this session`));
  } else {
    const allTools = toolRegistry.getToolDefinitions(config.tools?.enabled);
    const enabledSet = new Set(config.tools?.enabled || allTools.map(t => t.name));

    // Categorize tools
    const fileTools = allTools.filter(t => ['read', 'write', 'edit', 'glob', 'grep'].includes(t.name));
    const execTools = allTools.filter(t => ['bash', 'agent'].includes(t.name));
    const webTools = allTools.filter(t => ['webfetch', 'websearch'].includes(t.name));
    const customTools = allTools.filter(t => !['read', 'write', 'edit', 'glob', 'grep', 'bash', 'agent', 'webfetch', 'websearch'].includes(t.name));

    const formatTool = (t: { name: string; description: string }) => {
      const enabled = enabledSet.has(t.name) ? chalk.green('✓') : chalk.dim('✗');
      return `  ${enabled} ${chalk.blue(t.name.padEnd(10))} ${chalk.dim(t.description)}`;
    };

    console.log(chalk.yellow('\n  Tools:'));
    if (fileTools.length) {
      console.log(chalk.dim('  Files:'));
      fileTools.forEach(t => console.log(formatTool(t)));
    }
    if (execTools.length) {
      console.log(chalk.dim('  Execution:'));
      execTools.forEach(t => console.log(formatTool(t)));
    }
    if (webTools.length) {
      console.log(chalk.dim('  Web:'));
      webTools.forEach(t => console.log(formatTool(t)));
    }
    if (customTools.length) {
      console.log(chalk.dim('  Skills:'));
      customTools.forEach(t => console.log(formatTool(t)));
    }
    console.log();
  }
}

function handlePerfCommand(): void {
  if (perfMonitor.isEnabled()) {
    perfMonitor.printReport();
  } else {
    console.log(chalk.dim('Performance monitoring is disabled. Start with --monitor flag.'));
  }
}

function handleDebugCommand(args: string[]): void {
  const isDebugEnabled = logger['_level'] === 0;
  if (args[0] === 'on') {
    logger.setLevel(0);
    console.log(chalk.green('Debug mode enabled'));
  } else if (args[0] === 'off') {
    logger.setLevel(1);
    console.log(chalk.dim('Debug mode disabled'));
  } else {
    console.log(chalk.dim(`Debug mode: ${isDebugEnabled ? 'ON' : 'OFF'}`));
  }
}

function handleCostCommand(): void {
  const summary = costTracker.getSummary(true);
  if (costTracker.getSessionCost() === 0 && costTracker.getRecords().length === 0) {
    console.log(chalk.dim('No cost data recorded yet. Costs are estimated from provider-reported token usage.'));
  } else {
    console.log(chalk.yellow('Session cost summary:'));
    console.log(summary);
    console.log(chalk.dim('\nNote: Costs are estimates based on published pricing.'));
  }
}

function handleCacheCommand(session: SessionState): void {
  const cache = costTracker.getCacheStats();
  const totalTokens = costTracker.getTotalTokens();

  console.log(chalk.yellow('\n  Cache Statistics:'));

  if (cache.cacheReadTokens === 0 && cache.cacheCreationTokens === 0) {
    console.log(chalk.dim('  No cache data recorded yet.'));
    console.log(chalk.dim('  Cache is enabled when token-saving level is off or mild.'));
  } else {
    console.log(`  Cache writes:  ${chalk.dim(cache.cacheCreationTokens.toLocaleString())} tokens`);
    console.log(`  Cache reads:   ${chalk.green(cache.cacheReadTokens.toLocaleString())} tokens`);

    const hitRate = totalTokens > 0
      ? ((cache.cacheReadTokens / costTracker.getSessionTokens().input) * 100).toFixed(1)
      : '0.0';
    console.log(`  Cache hit rate: ${chalk.cyan(hitRate + '%')} of input tokens`);

    const totalCost = costTracker.getSessionCost();
    const effectiveCost = costTracker.getEffectiveCost();
    console.log(`  Cache savings:  ${chalk.green('$' + cache.cacheCostSavings.toFixed(4))}`);
    console.log(`  Effective cost: $${effectiveCost.toFixed(4)} (was $${totalCost.toFixed(4)})`);

    if (cache.cacheCostSavings > 0) {
      const savingsPct = (cache.cacheCostSavings / totalCost * 100).toFixed(1);
      console.log(`  Savings:       ${chalk.green(savingsPct + '%')}`);
    }
  }

  const level = session.tokenSaveLevel;
  const levelColors: Record<string, (s: string) => string> = {
    off: chalk.green, mild: chalk.blue, moderate: chalk.yellow, aggressive: chalk.red,
  };
  const color = levelColors[level] || chalk.dim;
  console.log(`\n  Token-saving:     ${color(level)}`);
  console.log(chalk.dim('  Use /save-tokens to change level'));
  console.log();
}

function handleSaveCommand(args: string[], messages: Message[]): void {
  const savePath = args[0] || `dragon-session-${Date.now()}.json`;
  try {
    const saveData = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
    const homeDir = process.env.HOME || os.homedir();
    const fullPath = savePath.startsWith('/') ? savePath : `${homeDir}/.dragon/history/${savePath}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(fullPath, JSON.stringify(saveData, null, 2), { mode: 0o600 });
    console.log(chalk.green(`Session saved to ${fullPath}`));
  } catch (err: any) {
    console.log(chalk.red(`Failed to save: ${err.message}`));
  }
}

function handleLoadCommand(args: string[], messages: Message[]): void {
  const loadPath = args[0];
  if (!loadPath) {
    console.log(chalk.red('Usage: /load <filename>'));
    return;
  }
  try {
    const homeDir = process.env.HOME || os.homedir();
    const fullPath = loadPath.startsWith('/') ? loadPath : `${homeDir}/.dragon/history/${loadPath}`;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const loaded = JSON.parse(raw);
    if (!Array.isArray(loaded)) {
      console.log(chalk.red('Invalid session file format.'));
      return;
    }
    messages.length = 0;
    messages.push(...loaded.map((m: any) => ({
      role: m.role,
      content: m.content,
    })));
    console.log(chalk.green(`Loaded ${messages.length} messages from ${fullPath}`));
  } catch (err: any) {
    console.log(chalk.red(`Failed to load: ${err.message}`));
  }
}

function handleAutoCommand(args: string[], session: SessionState): void {
  if (args[0] === 'out' || args[0] === 'outside') {
    session.autoApproveOutsideWorkspace = !session.autoApproveOutsideWorkspace;
    if (session.autoApproveOutsideWorkspace) {
      console.log(chalk.yellow('  ⚠ Out-of-workspace access auto-approved.'));
      console.log(chalk.dim('  /auto out to require confirmation again.'));
    } else {
      console.log(chalk.green('  ✓ Out-of-workspace access requires confirmation.'));
    }
  } else {
    session.autoApproveTools = !session.autoApproveTools;
    if (session.autoApproveTools) {
      session.autoApproveOutsideWorkspace = true;
      console.log(chalk.yellow('  ⚠ Auto-approve ALL tools.'));
      console.log(chalk.dim('  /auto to disable. /ask to require confirmation for all.'));
    } else {
      session.autoApproveOutsideWorkspace = false;
      console.log(chalk.green('  ✓ Confirmation required for all dangerous tools.'));
      console.log(chalk.dim('  y=approve once  a=auto-approve  n=deny'));
    }
  }
}

export function handleAskCommand(args: string[], session: SessionState): void {
  const subCommand = args[0]?.toLowerCase();

  // No args: enable strict mode (require confirmation for all)
  if (!subCommand || subCommand === 'on') {
    session.autoApproveTools = false;
    session.autoApproveOutsideWorkspace = false;
    console.log(chalk.green('  ✓ Strict mode enabled.'));
    console.log(chalk.dim('  ALL dangerous tools require confirmation.'));
    console.log(chalk.dim('  y=approve once  a=auto-approve all  n=deny'));
    return;
  }

  // Disable: auto-approve all
  if (subCommand === 'off') {
    session.autoApproveTools = true;
    session.autoApproveOutsideWorkspace = true;
    console.log(chalk.yellow('  ⚠ Auto-approve enabled for ALL tools.'));
    console.log(chalk.dim('  /ask to require confirmation again.'));
    return;
  }

  // Unknown option
  console.log(chalk.red(`  Unknown option: ${subCommand}`));
  console.log(chalk.dim('  Usage: /ask [on|off]'));
}

function handleSaveTokensCommand(args: string[], config: DragonConfig, session: SessionState): void {
  const targetLevel = args[0]?.toLowerCase() as TokenSaveLevel | undefined;

  if (targetLevel && ['off', 'mild', 'moderate', 'aggressive'].includes(targetLevel)) {
    session.tokenSaveLevel = targetLevel;
    config.defaultTokenSaveLevel = targetLevel;
    // Persist asynchronously (non-blocking)
    import('../config/index.js').then(({ saveConfig }) => {
      saveConfig(config);
    }).catch(() => {});
    const cfg = TOKEN_SAVE_CONFIGS[targetLevel];
    if (targetLevel === 'off') {
      console.log(chalk.dim('  Token-saving OFF — full quality restored.'));
    } else {
      console.log(chalk.green(`  ✓ Token-saving: ${cfg.label}`));
      if (cfg.modelSuffix) console.log(chalk.dim(`  Model: ${cfg.modelSuffix}`));
      if (!cfg.cacheControl) console.log(chalk.dim('  Cache writes: off'));
      if (cfg.limitTools) console.log(chalk.dim('  Tools: file ops only (no web/agent)'));
    }
  } else if (targetLevel) {
    console.log(chalk.red(`  Unknown level: ${targetLevel}. Use: off, mild, moderate, aggressive`));
  } else {
    const current = session.tokenSaveLevel;
    const levels: TokenSaveLevel[] = ['off', 'mild', 'moderate', 'aggressive'];
    console.log(chalk.yellow('\n  Token saving levels:'));
    for (const lv of levels) {
      const cfg = TOKEN_SAVE_CONFIGS[lv];
      const marker = current === lv ? chalk.green(' ●') : '  ';
      const label = current === lv ? chalk.bold(cfg.label) : chalk.dim(cfg.label);
      console.log(`${marker} ${chalk.cyan(`/save-tokens ${lv}`.padEnd(21))} ${label}`);
    }
    console.log(chalk.dim('\n  Higher levels trade reasoning depth for token efficiency.'));
    console.log();
  }
  session.tokenSavePrompted = true;
}

export function handleAutoskillCommand(args: string[], config: DragonConfig): void {
  const subCommand = args[0]?.toLowerCase();

  if (subCommand === 'on') {
    const interval = parseInt(args[1] || '15', 10);
    if (interval < 5) {
      console.log(chalk.red('  Interval must be at least 5 minutes.'));
      console.log(chalk.dim('  Usage: /autoskill on <minutes>'));
      return;
    }
    config.autoSkill = { enabled: true, intervalMinutes: interval };
    // Persist config
    import('../config/index.js').then(({ saveConfig }) => {
      saveConfig(config);
    }).catch(() => {});
    console.log(chalk.green(`  ✓ Auto-skill generation enabled.`));
    console.log(chalk.dim(`  Interval: ${interval} minutes`));
    console.log(chalk.dim('  Skills will be auto-generated from conversation patterns.'));
    console.log(chalk.dim('  Restart REPL to apply the new timer.'));
    return;
  }

  if (subCommand === 'off') {
    if (config.autoSkill) {
      config.autoSkill.enabled = false;
    } else {
      config.autoSkill = { enabled: false, intervalMinutes: 15 };
    }
    import('../config/index.js').then(({ saveConfig }) => {
      saveConfig(config);
    }).catch(() => {});
    console.log(chalk.yellow('  ✓ Auto-skill generation disabled.'));
    console.log(chalk.dim('  Use /autoskill on <minutes> to re-enable.'));
    return;
  }

  if (subCommand === 'interval' || subCommand === 'set') {
    const interval = parseInt(args[1] || args[0] || '15', 10);
    if (isNaN(interval) || interval < 5) {
      console.log(chalk.red('  Invalid interval. Must be a number >= 5 minutes.'));
      console.log(chalk.dim('  Usage: /autoskill interval <minutes>'));
      return;
    }
    config.autoSkill = {
      enabled: config.autoSkill?.enabled ?? false,
      intervalMinutes: interval,
    };
    import('../config/index.js').then(({ saveConfig }) => {
      saveConfig(config);
    }).catch(() => {});
    console.log(chalk.green(`  ✓ Auto-skill interval set to ${interval} minutes.`));
    console.log(chalk.dim(`  Current status: ${config.autoSkill.enabled ? 'enabled' : 'disabled'}`));
    console.log(chalk.dim('  Restart REPL to apply the new timer.'));
    return;
  }

  // Show current status
  console.log(chalk.yellow('\n  Auto-Skill Generation:'));
  const current = config.autoSkill || { enabled: false, intervalMinutes: 15 };
  console.log(chalk.dim(`  Status: ${current.enabled ? chalk.green('enabled') : chalk.yellow('disabled')}`));
  console.log(chalk.dim(`  Interval: ${current.intervalMinutes} minutes`));
  console.log();
  console.log(chalk.dim('  Commands:'));
  console.log(chalk.dim('  /autoskill on <minutes>    Enable with interval (min 5)'));
  console.log(chalk.dim('  /autoskill off             Disable auto-generation'));
  console.log(chalk.dim('  /autoskill interval <min>  Change interval only'));
  console.log();
  console.log(chalk.dim('  Note: Restart REPL to apply timer changes.'));
  console.log();
}