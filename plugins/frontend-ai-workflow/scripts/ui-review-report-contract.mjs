import path from 'node:path';

// 报告链共用的基础校验与 Markdown 转义，避免职责模块反向依赖兼容入口。
export function fail(message) {
  throw new Error(message);
}

export function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}不能为空。`);
  return value.trim();
}

export function requireFiniteNumber(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label}必须是不小于 ${minimum} 的有限数字。`);
  return value;
}

export function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label}必须是非空字符串数组。`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

export function requireRepoRelativePath(value, label) {
  const raw = requireString(value, label);
  if (raw.includes('\\') || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    fail(`${label}必须是使用正斜杠的仓库相对路径。`);
  }
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label}不能包含空路径段、. 或 ..。`);
  }
  return segments.join('/');
}

export function escapeInlineCode(value) {
  const text = String(value).replaceAll('\r', ' ').replaceAll('\n', ' ');
  return text.includes('`') ? `\`\`${text}\`\`` : `\`${text}\``;
}

export function escapeMarkdown(value) {
  return String(value).replaceAll('\r', ' ').replaceAll('\n', ' ').replaceAll('|', '\\|');
}
