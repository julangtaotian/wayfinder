import fs from 'node:fs';
import path from 'node:path';
import { resolveSafeProjectPath } from './project-path-safety.mjs';

export const PLUGIN_REPOSITORY_KIND = 'plugin-repository';
export const PLUGIN_MARKETPLACE_PATH = '.agents/plugins/marketplace.json';

function normalizedTarget(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//u, '');
}

function diagnostic(code, target, message) {
  return { code, status: 'error', target: normalizedTarget(target), message };
}

function hasDirectoryEntry(candidate) {
  try {
    fs.lstatSync(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

// marketplace 与 manifest 允许惯用的 ./ 前缀和单个末尾 /，其余路径语义仍交给统一安全解析器拒绝。
export function normalizePluginRepositoryPath(value, label = '插件路径') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}不能为空`);
  }
  let normalized = value.trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  if (!normalized || normalized.includes('\\') || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(normalized)) {
    throw new Error(`${label}必须是使用正斜杠的项目相对路径`);
  }
  return normalized;
}

function resolveRepositoryPath(root, candidate, label, code, diagnostics, target = candidate) {
  try {
    return resolveSafeProjectPath(root, candidate, label, { mustExist: false });
  } catch (error) {
    diagnostics.push(diagnostic(code, target, `${label}不安全：${error.message}`));
    return null;
  }
}

function readJson(filePath, code, target, diagnostics, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    diagnostics.push(diagnostic(code, target, `${label}不是有效 JSON：${error.message}`));
    return null;
  }
}

function pluginTarget(sourcePath, file) {
  return path.posix.join(sourcePath, file);
}

function inspectPlugin(root, entry, index, diagnostics) {
  const diagnosticStart = diagnostics.length;
  const entryName = typeof entry?.name === 'string' ? entry.name.trim() : '';
  const source = entry?.source;
  const sourcePathValue = source?.path;
  const entryTarget = `${PLUGIN_MARKETPLACE_PATH}#plugins[${index}]`;
  const plugin = {
    name: entryName || null,
    path: entryTarget,
    manifestVersion: null,
    status: 'invalid',
  };

  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    diagnostics.push(diagnostic('plugin_entry_invalid', entryTarget, `marketplace 的第 ${index + 1} 个本地插件条目无效`));
    return plugin;
  }
  if (!entryName) {
    diagnostics.push(diagnostic('plugin_entry_name_missing', entryTarget, `marketplace 的第 ${index + 1} 个本地插件条目缺少 name`));
  }

  let sourcePath;
  try {
    sourcePath = normalizePluginRepositoryPath(sourcePathValue, '插件 source.path');
    plugin.path = sourcePath;
  } catch (error) {
    diagnostics.push(diagnostic('plugin_source_path_invalid', entryTarget, error.message));
    return plugin;
  }
  const sourceDirectory = resolveRepositoryPath(
    root,
    sourcePath,
    '插件 source.path',
    'plugin_source_path_invalid',
    diagnostics,
    entryTarget,
  );
  if (!sourceDirectory) return plugin;
  if (!sourceDirectory.exists) {
    diagnostics.push(diagnostic('plugin_source_missing', sourcePath, `插件 source.path 不存在：${sourcePath}`));
    return plugin;
  }
  if (sourceDirectory.kind !== 'directory') {
    diagnostics.push(diagnostic('plugin_source_not_directory', sourcePath, `插件 source.path 必须是目录：${sourcePath}`));
    return plugin;
  }

  const manifestTarget = pluginTarget(sourcePath, '.codex-plugin/plugin.json');
  const manifestPath = resolveRepositoryPath(root, manifestTarget, '插件 manifest', 'plugin_manifest_path_invalid', diagnostics);
  if (!manifestPath) return plugin;
  if (!manifestPath.exists || manifestPath.kind !== 'file') {
    diagnostics.push(diagnostic('plugin_manifest_missing', manifestTarget, `插件缺少 manifest：${manifestTarget}`));
    return plugin;
  }
  const manifest = readJson(manifestPath.absolutePath, 'plugin_manifest_invalid_json', manifestTarget, diagnostics, '插件 manifest');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    if (manifest) diagnostics.push(diagnostic('plugin_manifest_invalid', manifestTarget, '插件 manifest 必须是对象'));
    return plugin;
  }
  const manifestName = typeof manifest.name === 'string' ? manifest.name.trim() : '';
  const manifestVersion = typeof manifest.version === 'string' ? manifest.version.trim() : '';
  if (!manifestName) {
    diagnostics.push(diagnostic('plugin_manifest_name_missing', manifestTarget, '插件 manifest 缺少 name'));
  } else if (entryName && manifestName !== entryName) {
    diagnostics.push(diagnostic('plugin_manifest_name_mismatch', manifestTarget, `marketplace 名称与 manifest 名称不一致：${entryName} / ${manifestName}`));
  }
  if (!manifestVersion) diagnostics.push(diagnostic('plugin_manifest_version_missing', manifestTarget, '插件 manifest 缺少 version'));
  plugin.manifestVersion = manifestVersion || null;

  let skillsPath;
  try {
    skillsPath = normalizePluginRepositoryPath(manifest.skills, '插件 manifest.skills');
  } catch (error) {
    diagnostics.push(diagnostic('plugin_manifest_skills_invalid', manifestTarget, error.message));
    return plugin;
  }
  const skillsTarget = pluginTarget(sourcePath, skillsPath);
  const skillsDirectory = resolveRepositoryPath(root, skillsTarget, '插件技能目录', 'plugin_manifest_skills_invalid', diagnostics);
  if (!skillsDirectory) return plugin;
  if (!skillsDirectory.exists || skillsDirectory.kind !== 'directory') {
    diagnostics.push(diagnostic('plugin_manifest_skills_missing', skillsTarget, `插件技能目录不存在：${skillsTarget}`));
    return plugin;
  }

  plugin.status = diagnostics.length > diagnosticStart ? 'invalid' : 'healthy';
  return plugin;
}

// 只把根 marketplace 作为插件仓库意图信号，避免单独的 manifest 或目录名放宽业务项目检查。
export function inspectPluginRepository(root) {
  const marketplaceCandidate = path.join(root, ...PLUGIN_MARKETPLACE_PATH.split('/'));
  if (!hasDirectoryEntry(marketplaceCandidate)) {
    return { kind: 'not-plugin-repository', status: 'not-applicable', plugins: [], diagnostics: [] };
  }

  const diagnostics = [];
  const marketplacePath = resolveRepositoryPath(root, PLUGIN_MARKETPLACE_PATH, '插件 marketplace', 'plugin_marketplace_path_invalid', diagnostics);
  if (!marketplacePath || !marketplacePath.exists || marketplacePath.kind !== 'file') {
    if (marketplacePath?.exists) {
      diagnostics.push(diagnostic('plugin_marketplace_not_file', PLUGIN_MARKETPLACE_PATH, '插件 marketplace 必须是普通文件'));
    } else if (marketplacePath) {
      diagnostics.push(diagnostic('plugin_marketplace_missing', PLUGIN_MARKETPLACE_PATH, '插件 marketplace 不存在'));
    }
    return {
      kind: PLUGIN_REPOSITORY_KIND,
      status: 'invalid',
      marketplace: PLUGIN_MARKETPLACE_PATH,
      plugins: [],
      diagnostics,
    };
  }
  const marketplace = readJson(
    marketplacePath.absolutePath,
    'plugin_marketplace_invalid_json',
    PLUGIN_MARKETPLACE_PATH,
    diagnostics,
    '插件 marketplace',
  );
  if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
    if (marketplace) diagnostics.push(diagnostic('plugin_marketplace_invalid', PLUGIN_MARKETPLACE_PATH, '插件 marketplace 必须是对象'));
    return {
      kind: PLUGIN_REPOSITORY_KIND,
      status: 'invalid',
      marketplace: PLUGIN_MARKETPLACE_PATH,
      plugins: [],
      diagnostics,
    };
  }
  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const localEntries = entries.filter((entry) => entry?.source?.source === 'local');
  if (!localEntries.length) {
    diagnostics.push(diagnostic('plugin_local_entries_missing', PLUGIN_MARKETPLACE_PATH, '插件 marketplace 缺少本地插件条目'));
  }
  const plugins = localEntries.map((entry, index) => inspectPlugin(root, entry, index, diagnostics));
  return {
    kind: PLUGIN_REPOSITORY_KIND,
    status: diagnostics.length === 0 ? 'healthy' : 'invalid',
    marketplace: PLUGIN_MARKETPLACE_PATH,
    plugins,
    diagnostics,
  };
}
