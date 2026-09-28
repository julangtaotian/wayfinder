import fs from 'node:fs';
import path from 'node:path';

const TARGET_PACKAGE_GROUPS = Object.freeze({
  desktop: Object.freeze(['@mui/material', 'antd', 'element-plus', 'element-ui']),
  mobile: Object.freeze(['@nutui/nutui', '@vant/weapp', 'antd-mobile', 'vant']),
});

const WECHAT_NATIVE_PROFILE = Object.freeze({
  name: 'wechat-native',
  kind: 'native-mini-program',
  fileGroups: [['app.json', 'project.config.json']],
});

function matchedPackages(dependencies, packages) {
  return packages.filter((packageName) => Object.prototype.hasOwnProperty.call(dependencies, packageName));
}

function matchedProjectFiles(root, fileGroups) {
  const matchedGroup = fileGroups.find((files) => files.every((file) => fs.existsSync(path.join(root, file))));
  return matchedGroup ? matchedGroup.map((file) => `file:${file}`) : [];
}

// 只检查固定源配置组合，不递归搜索构建产物或读取可能含敏感信息的配置内容。
export function collectPlatformProjectEvidence(root) {
  return {
    [WECHAT_NATIVE_PROFILE.name]: matchedProjectFiles(root, WECHAT_NATIVE_PROFILE.fileGroups),
  };
}

export function detectPlatformProfile(_dependencies = {}, projectEvidence = {}) {
  const evidence = Array.isArray(projectEvidence[WECHAT_NATIVE_PROFILE.name])
    ? [...new Set(projectEvidence[WECHAT_NATIVE_PROFILE.name])].sort()
    : [];
  if (!evidence.length) {
    return { kind: 'unknown', frameworks: [], source: 'unknown', evidence: [] };
  }
  return {
    kind: WECHAT_NATIVE_PROFILE.kind,
    frameworks: [WECHAT_NATIVE_PROFILE.name],
    source: 'project-files',
    evidence,
  };
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
