import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseCliArgs } from './cli-arguments.mjs';
import {
  complexFailure,
  createComplexChange,
  statusComplexChange,
  validateComplexChange,
} from './complex-change.mjs';
import { finalizeChange } from './finalize-change.mjs';
import { recoverLifecycleV2 } from './lifecycle-finalize.mjs';

const COMMANDS = new Set(['create', 'status', 'validate', 'complete']);
const HELP = `frontend-ai-workflow 复杂变更入口

用法：
  workflow-cli.mjs <create|status|validate|complete> [参数]
  workflow-cli.mjs <command> --help

所有执行命令输出 JSON。create 与 complete 默认只预览，只有显式 --write 才写入。`;

const COMMAND_HELP = {
  create: '用法：workflow-cli.mjs create --target <project-root> --change <kebab-id> --title <title> [--goal <goal>] [--design <architecture-decision>] [--write]\n默认只预览；写入时只创建一个 OpenSpec 活动变更。design 仅用于确有架构决策的变更。',
  status: '用法：workflow-cli.mjs status --target <project-root> --change <kebab-id>\n只返回产物完整性、任务进度与阻塞项，不返回正文。',
  validate: '用法：workflow-cli.mjs validate --target <project-root> --change <kebab-id>\n执行必要结构检查与插件内置 OpenSpec strict 校验。',
  complete: '用法：workflow-cli.mjs complete --target <project-root> --change <kebab-id> [--write]\n默认预览；写入时同步正式规格、追加紧凑事件并删除活动变更。恢复中断事务：complete --target <project-root> --recover <transaction-id> --write。',
};

function requireValues(args, names) {
  const missing = names.filter((name) => !String(args[name] || '').trim());
  if (missing.length) {
    const error = new Error(`缺少必需参数：${missing.join('、')}`);
    error.code = 'complex_invalid_arguments';
    error.status = 'blocked';
    error.target = missing.join(',');
    throw error;
  }
}

function parseCommandArgs(command, argv) {
  if (command === 'create') {
    const args = parseCliArgs(argv, {
      valueOptions: {
        '--target': 'target', '--change': 'change', '--title': 'title', '--goal': 'goal', '--design': 'design',
      },
      booleanOptions: { '--write': 'write', '--json': 'json' },
    });
    requireValues(args, ['target', 'change', 'title']);
    return args;
  }
  if (command === 'complete') {
    const args = parseCliArgs(argv, {
      valueOptions: { '--target': 'target', '--change': 'change', '--recover': 'recover' },
      booleanOptions: { '--write': 'write', '--json': 'json' },
    });
    requireValues(args, ['target']);
    if (args.recover && args.change) {
      const error = new Error('change 与 recover 不能同时提供');
      error.code = 'complex_invalid_arguments';
      error.status = 'blocked';
      error.target = 'change,recover';
      throw error;
    }
    requireValues(args, [args.recover ? 'recover' : 'change']);
    if (args.recover && !args.write) {
      const error = new Error('恢复事务必须显式提供 --write');
      error.code = 'complex_invalid_arguments';
      error.status = 'blocked';
      error.target = 'write';
      throw error;
    }
    return args;
  }
  const args = parseCliArgs(argv, {
    valueOptions: { '--target': 'target', '--change': 'change' },
    booleanOptions: { '--json': 'json' },
  });
  requireValues(args, ['target', 'change']);
  return args;
}

export function runWorkflowCli(argv = [], injected = {}) {
  const services = {
    createComplexChange,
    statusComplexChange,
    validateComplexChange,
    finalizeChange,
    recoverLifecycleV2,
    ...injected,
  };
  if (argv.length === 0 || argv[0] === '--help') return { exitCode: 0, text: HELP, json: false };
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    return {
      exitCode: 1,
      value: complexFailure(Object.assign(new Error(`未知工作流命令：${command}`), {
        code: 'complex_invalid_arguments', status: 'blocked', target: command,
      })),
      json: true,
    };
  }
  if (argv[1] === '--help' && argv.length === 2) return { exitCode: 0, text: COMMAND_HELP[command], json: false };

  try {
    const args = parseCommandArgs(command, argv.slice(1));
    let value;
    if (command === 'create') value = services.createComplexChange(args);
    else if (command === 'status') value = services.statusComplexChange(args);
    else if (command === 'validate') value = services.validateComplexChange(args);
    else if (args.recover) value = services.recoverLifecycleV2({ root: args.target, transactionId: args.recover });
    else value = services.finalizeChange(args);
    return { exitCode: value.ok === false ? 1 : 0, value, json: true };
  } catch (error) {
    return { exitCode: 1, value: complexFailure(error), json: true };
  }
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  const result = runWorkflowCli(process.argv.slice(2));
  if (result.json) console.log(JSON.stringify(result.value, null, 2));
  else console.log(result.text);
  process.exitCode = result.exitCode;
}
