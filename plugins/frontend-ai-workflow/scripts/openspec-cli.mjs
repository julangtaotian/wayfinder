import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLED_OPENSPEC_VERSION = '1.8.0';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(scriptDir, '..', 'runtime', 'openspec');
const manifestPath = path.join(runtimeRoot, 'package.json');
const executablePath = path.join(runtimeRoot, 'bin', 'openspec.js');

export function inspectBundledOpenSpec() {
  if (!fs.existsSync(manifestPath) || !fs.existsSync(executablePath)) {
    return {
      available: false,
      version: BUNDLED_OPENSPEC_VERSION,
      error: new Error('运行时文件不完整，请重新安装 frontend-ai-workflow 插件'),
    };
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== BUNDLED_OPENSPEC_VERSION) {
      return {
        available: false,
        version: manifest.version,
        error: new Error(`运行时版本异常：期望 ${BUNDLED_OPENSPEC_VERSION}，实际 ${manifest.version}`),
      };
    }
    return { available: true, version: manifest.version, executablePath };
  } catch (error) {
    return { available: false, version: null, error };
  }
}

export function runOpenSpecSync(args = [], {
  cwd = process.cwd(),
  encoding = 'utf8',
  stdio,
  env = process.env,
} = {}) {
  const runtime = inspectBundledOpenSpec();
  if (!runtime.available) {
    return {
      available: false,
      source: 'bundled',
      runtimeVersion: runtime.version,
      status: null,
      stdout: '',
      stderr: '',
      error: runtime.error,
    };
  }

  const runtimeEnv = {
    ...env,
    OPENSPEC_NO_UPDATE_CHECK: '1',
    OPENSPEC_TELEMETRY: '0',
  };
  const result = spawnSync(process.execPath, [runtime.executablePath, ...args], {
    cwd,
    encoding,
    stdio,
    env: runtimeEnv,
  });
  return {
    ...result,
    available: !result.error,
    source: 'bundled',
    runtimeVersion: runtime.version,
  };
}

function isEntryPoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isEntryPoint()) {
  const result = runOpenSpecSync(process.argv.slice(2), { stdio: 'inherit' });
  if (!result.available) {
    console.error(result.error?.message || '插件内置 OpenSpec 运行时不可用');
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}
