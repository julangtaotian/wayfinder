import fs from 'node:fs';
import path from 'node:path';

const TARGET_PACKAGE_GROUPS = Object.freeze({
  desktop: Object.freeze(['@mui/material', 'antd', 'element-plus', 'element-ui']),
  mobile: Object.freeze(['@nutui/nutui', 'antd-mobile', 'vant']),
});

const PLATFORM_FRAMEWORKS = Object.freeze([
  {
    name: 'wechat-native',
    kind: 'native-mini-program',
    packages: [],
    fileGroups: [['app.json', 'project.config.json']],
  },
  {
    name: 'uni-app',
    kind: 'cross-platform',
    packages: ['@dcloudio/uni-app', '@dcloudio/vite-plugin-uni'],
    fileGroups: [
      ['src/manifest.json', 'src/pages.json'],
      ['manifest.json', 'pages.json'],
    ],
  },
  {
    name: 'taro',
    kind: 'cross-platform',
    packages: ['@tarojs/taro', '@tarojs/cli', '@tarojs/vite-runner', '@tarojs/webpack5-runner'],
    fileGroups: [],
  },
  {
    name: 'remax',
    kind: 'cross-platform',
    packages: ['remax'],
    fileGroups: [],
  },
]);

function matchedPackages(dependencies, packages) {
  return packages.filter((packageName) => Object.prototype.hasOwnProperty.call(dependencies, packageName));
}

function matchedProjectFiles(root, fileGroups) {
  const matchedGroup = fileGroups.find((files) => files.every((file) => fs.existsSync(path.join(root, file))));
  return matchedGroup ? matchedGroup.map((file) => `file:${file}`) : [];
}

// 只检查固定源配置组合，不递归搜索构建产物或读取可能含敏感信息的配置内容。
export function collectPlatformProjectEvidence(root) {
  return Object.fromEntries(PLATFORM_FRAMEWORKS.map((framework) => [
    framework.name,
    matchedProjectFiles(root, framework.fileGroups),
  ]));
}

export function detectPlatformProfile(dependencies = {}, projectEvidence = {}) {
  const matches = PLATFORM_FRAMEWORKS.map((framework) => {
    const packageEvidence = matchedPackages(dependencies, framework.packages)
      .map((packageName) => `package:${packageName}`);
    const fileEvidence = Array.isArray(projectEvidence[framework.name])
      ? projectEvidence[framework.name]
      : [];
    return {
      ...framework,
      evidence: [...new Set([...packageEvidence, ...fileEvidence])],
    };
  }).filter((framework) => framework.evidence.length);
  const frameworks = matches.map((framework) => framework.name);
  const evidence = [...new Set(matches.flatMap((framework) => framework.evidence))].sort();
  const hasPackages = evidence.some((item) => item.startsWith('package:'));
  const hasFiles = evidence.some((item) => item.startsWith('file:'));
  let kind = 'unknown';
  if (matches.length > 1) kind = 'conflict';
  else if (matches.length === 1) kind = matches[0].kind;

  let source = 'unknown';
  if (hasPackages && hasFiles) source = 'package-and-project-files';
  else if (hasPackages) source = 'package-dependencies';
  else if (hasFiles) source = 'project-files';

  return { kind, frameworks, source, evidence };
}

// 终端画像只记录可追溯的依赖证据，不把混合依赖推断成响应式结论。
export function detectTargetProfile(dependencies = {}, projectEvidence = {}) {
  const desktopEvidence = matchedPackages(dependencies, TARGET_PACKAGE_GROUPS.desktop);
  const mobileEvidence = matchedPackages(dependencies, TARGET_PACKAGE_GROUPS.mobile);
  const evidence = [...new Set([...desktopEvidence, ...mobileEvidence])].sort();
  let formFactor = 'unknown';
  if (desktopEvidence.length && mobileEvidence.length) formFactor = 'mixed';
  else if (desktopEvidence.length) formFactor = 'desktop';
  else if (mobileEvidence.length) formFactor = 'mobile';

  return {
    formFactor,
    source: evidence.length ? 'package-dependencies' : 'unknown',
    evidence,
    platform: detectPlatformProfile(dependencies, projectEvidence),
  };
}
