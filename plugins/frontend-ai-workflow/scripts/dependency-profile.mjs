export const DEPENDENCY_PROFILE_VERSION = '1.0.0';
export const DEPENDENCY_SUMMARY_LIMIT = 20;

const DEPENDENCY_GROUPS = Object.freeze([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]);

function stableCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// 包名校验只保护结构化输出，不承担框架识别或 npm registry 规则判断。
function isSafePackageName(name) {
  if (typeof name !== 'string' || !name || /[\s`\\]/u.test(name)) return false;
  const token = '[A-Za-z0-9][A-Za-z0-9._~-]*';
  const pattern = name.startsWith('@')
    ? new RegExp(`^@${token}/${token}$`, 'u')
    : new RegExp(`^${token}$`, 'u');
  return pattern.test(name);
}

function isValidSpecifier(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function diagnostic(code, target) {
  return { code, status: 'ignored', target };
}

export function formatDependencyPackage(item) {
  const declarations = item.declarations
    .map(({ group, specifier }) => `${group}=${JSON.stringify(specifier)}`)
    .join('；');
  return `${item.name} [${declarations}]`;
}

function buildSummary(packages) {
  const displayed = packages.slice(0, DEPENDENCY_SUMMARY_LIMIT);
  const totalPackages = packages.length;
  const displayedPackages = displayed.length;
  const omittedPackages = totalPackages - displayedPackages;
  if (!totalPackages) {
    return {
      status: 'empty',
      totalPackages,
      displayedPackages,
      omittedPackages,
      text: '根 package 未声明合法直接依赖（完整事实：dependencyProfile.packages）。',
    };
  }

  const status = omittedPackages ? 'truncated' : 'complete';
  const items = displayed.map(formatDependencyPackage).join('、');
  return {
    status,
    totalPackages,
    displayedPackages,
    omittedPackages,
    text: `根 package 共 ${totalPackages} 项直接依赖，展示 ${displayedPackages} 项，遗漏 ${omittedPackages} 项：${items}（完整事实：dependencyProfile.packages 或根 package.json）。`,
  };
}

export function collectDependencyProfile(packageJson = {}) {
  const groupCounts = Object.fromEntries(DEPENDENCY_GROUPS.map((group) => [group, 0]));
  const packagesByName = new Map();
  const diagnostics = [];

  for (const group of DEPENDENCY_GROUPS) {
    if (!Object.prototype.hasOwnProperty.call(packageJson, group)) continue;
    const declarations = packageJson[group];
    if (!isPlainObject(declarations)) {
      diagnostics.push(diagnostic('invalid-dependency-group', group));
      continue;
    }

    for (const name of Object.keys(declarations).sort(stableCompare)) {
      const target = `${group}.${name}`;
      if (!isSafePackageName(name)) {
        diagnostics.push(diagnostic('invalid-dependency-name', target));
        continue;
      }
      const specifier = declarations[name];
      if (!isValidSpecifier(specifier)) {
        diagnostics.push(diagnostic('invalid-dependency-specifier', target));
        continue;
      }

      groupCounts[group] += 1;
      const item = packagesByName.get(name) || { name, declarations: [] };
      item.declarations.push({ group, specifier });
      packagesByName.set(name, item);
    }
  }

  const packages = [...packagesByName.values()].sort((left, right) => stableCompare(left.name, right.name));
  return {
    schemaVersion: DEPENDENCY_PROFILE_VERSION,
    source: 'root-package-json',
    totalPackages: packages.length,
    groupCounts,
    packages,
    diagnostics,
    summary: buildSummary(packages),
  };
}
