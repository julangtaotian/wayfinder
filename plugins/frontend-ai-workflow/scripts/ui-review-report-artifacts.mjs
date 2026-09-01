import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  atomicWriteProjectFile,
  ensureSafeProjectDirectory,
  publishProjectDirectory,
  removeProjectDirectory,
  removeProjectFile,
  resolveSafeProjectPath,
} from './project-path-safety.mjs';
import { fail } from './ui-review-report-contract.mjs';
import { normalizeReviewInput, parsePngDimensions } from './ui-review-report-input.mjs';
import { renderReviewMarkdown } from './ui-review-report-markdown.mjs';

// 产物模块集中管理外部进程、受控目录和失败恢复，避免输出职责散落在输入或渲染模块。
const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const defaultOutputRoot = path.join(specRoot, 'ai-ui-review');
const deliverableNames = new Set(['ui-review.png', 'ui-review.md']);

function resolveExecutable(preferred, preferredArgs, candidates) {
  const normalizedArgs = preferredArgs === undefined ? [] : preferredArgs;
  if (!Array.isArray(normalizedArgs) || normalizedArgs.some((item) => typeof item !== 'string')) {
    fail('FFmpeg 前置参数必须是字符串数组。');
  }
  const executables = [
    ...(preferred ? [{ command: preferred, args: normalizedArgs }] : []),
    ...candidates.filter(Boolean).map((command) => ({ command, args: [] })),
  ];
  for (const executable of executables) {
    const result = spawnSync(executable.command, [...executable.args, '-version'], { encoding: 'utf8' });
    if (result.status === 0) return executable;
  }
  fail('找不到可用的 FFmpeg，无法生成标注截图。');
}

function resolveFont(preferred) {
  const candidates = [
    preferred,
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ].filter(Boolean);
  const font = candidates.find((candidate) => fs.existsSync(candidate));
  if (!font) fail('找不到可用的中文字体，无法生成标注截图。');
  return font;
}

function escapeFilterPath(filePath) {
  return filePath.replaceAll('\\', '\\\\').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

function buildDrawFilters(review, stageRoot, fontPath, projectRoot = null) {
  const dpr = review.viewport.dpr;
  const filters = [];
  const texts = [];
  const addText = (text, name, options) => {
    const textPath = path.join(stageRoot, `.${name}.txt`);
    if (projectRoot) {
      atomicWriteProjectFile(projectRoot, textPath, text, {
        label: '标注截图文本',
        mustNotExist: true,
      });
    } else {
      fs.writeFileSync(textPath, text, 'utf8');
    }
    texts.push(textPath);
    filters.push(
      `drawtext=fontfile='${escapeFilterPath(fontPath)}':textfile='${escapeFilterPath(textPath)}':expansion=none:fontcolor=${options.color}:fontsize=${options.size}:x=${options.x}:y=${options.y}`,
    );
  };

  const passed = review.findings.length === 0;
  const bannerWidth = passed ? 260 : 330;
  const bannerX = Math.round(review.viewport.width * dpr) - bannerWidth - 20;
  filters.push(`drawbox=x=${bannerX}:y=20:w=${bannerWidth}:h=48:color=${passed ? '0x13A56B' : '0xD92D20'}@0.94:t=fill`);
  addText(
    passed ? 'AI 验收通过' : `AI 验收发现 ${review.findings.length} 个问题`,
    'banner',
    { color: 'white', size: 22, x: bannerX + 16, y: 31 },
  );

  review.findings.forEach((finding, index) => {
    const rect = {
      x: Math.round(finding.rect.x * dpr),
      y: Math.round(finding.rect.y * dpr),
      width: Math.round(finding.rect.width * dpr),
      height: Math.round(finding.rect.height * dpr),
    };
    const labelY = rect.y >= 58 ? rect.y - 34 : rect.y + 6;
    const labelWidth = Math.min(260, Math.max(112, 78 + [...finding.label].length * 18));
    filters.push(`drawbox=x=${rect.x}:y=${rect.y}:w=${rect.width}:h=${rect.height}:color=0xFF3B30@0.98:t=4`);
    filters.push(`drawbox=x=${rect.x}:y=${labelY}:w=${labelWidth}:h=30:color=0xFF3B30@0.96:t=fill`);
    addText(`${finding.id} ${finding.label}`, `finding-${index}`, {
      color: 'white',
      size: 17,
      x: rect.x + 8,
      y: labelY + 5,
    });
  });
  return { filter: filters.join(','), texts };
}

function assertSafeOutputDirectory(outputDir, allowedRoot) {
  const requestedRoot = path.resolve(allowedRoot);
  let existingAncestor = requestedRoot;
  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) fail('无法定位 AI UI 验收输出根目录。');
    existingAncestor = parent;
  }
  const ancestorRoot = fs.realpathSync(existingAncestor);
  const rootSuffix = path.relative(path.resolve(existingAncestor), requestedRoot);
  const canonicalRequestedRoot = path.resolve(ancestorRoot, rootSuffix);
  ensureSafeProjectDirectory(ancestorRoot, canonicalRequestedRoot, 'AI UI 验收输出根目录');
  const resolvedRoot = fs.realpathSync(canonicalRequestedRoot);
  const outputRelative = path.relative(requestedRoot, path.resolve(outputDir));
  const safeOutput = resolveSafeProjectPath(resolvedRoot, outputRelative, 'AI UI 验收输出目录');
  if (safeOutput.exists) {
    if (safeOutput.kind !== 'directory') fail('输出目录必须是普通目录。');
    const unexpected = fs.readdirSync(safeOutput.absolutePath).filter((name) => !deliverableNames.has(name));
    if (unexpected.length > 0) fail(`输出目录包含未知文件，已停止以避免覆盖：${unexpected.join('、')}`);
  }
  return { root: resolvedRoot, outputDir: safeOutput.absolutePath };
}

function swapOutputDirectory(projectRoot, stageRoot, outputDir) {
  const backup = `${outputDir}.backup-${process.pid}-${Date.now()}`;
  let movedExisting = false;
  try {
    if (fs.existsSync(outputDir)) {
      publishProjectDirectory(projectRoot, outputDir, backup, { label: '既有 UI 验收输出备份' });
      movedExisting = true;
    }
    publishProjectDirectory(projectRoot, stageRoot, outputDir, { label: 'UI 验收输出目录' });
    if (movedExisting) removeProjectDirectory(projectRoot, backup, { label: '既有 UI 验收输出备份' });
  } catch (error) {
    try {
      if (fs.existsSync(outputDir)) removeProjectDirectory(projectRoot, outputDir, { label: '失败的 UI 验收输出' });
      if (movedExisting && fs.existsSync(backup)) {
        publishProjectDirectory(projectRoot, backup, outputDir, { label: 'UI 验收输出恢复' });
      }
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}

export function generateUiReview({
  screenshotPath,
  input,
  outputDir,
  allowedOutputRoot = defaultOutputRoot,
  ffmpegPath,
  ffmpegArgs,
  fontPath,
}) {
  const dimensions = parsePngDimensions(screenshotPath);
  const review = normalizeReviewInput(input, dimensions);
  const safeOutput = assertSafeOutputDirectory(outputDir, allowedOutputRoot);
  const safeOutputDir = safeOutput.outputDir;
  const outputParent = path.dirname(safeOutputDir);
  ensureSafeProjectDirectory(safeOutput.root, outputParent, 'UI 验收输出父目录');
  const stageRoot = fs.mkdtempSync(path.join(outputParent, `.${path.basename(safeOutputDir)}-staging-`));
  resolveSafeProjectPath(safeOutput.root, stageRoot, 'UI 验收暂存目录', {
    mustExist: true,
    allowAbsolute: true,
  });
  try {
    const executable = resolveExecutable(ffmpegPath, ffmpegArgs, ['/opt/homebrew/bin/ffmpeg', 'ffmpeg']);
    const font = resolveFont(fontPath);
    const pngPath = path.join(stageRoot, 'ui-review.png');
    const markdownPath = path.join(stageRoot, 'ui-review.md');
    const drawing = buildDrawFilters(review, stageRoot, font, safeOutput.root);
    const result = spawnSync(
      executable.command,
      [...executable.args, '-hide_banner', '-loglevel', 'error', '-y', '-i', screenshotPath, '-vf', drawing.filter, '-frames:v', '1', pngPath],
      { encoding: 'utf8' },
    );
    for (const textPath of drawing.texts) removeProjectFile(safeOutput.root, textPath, { label: '标注截图文本' });
    if (result.status !== 0 || !fs.existsSync(pngPath)) {
      fail(`标注截图生成失败：${(result.stderr || result.stdout || '未知错误').trim()}`);
    }
    resolveSafeProjectPath(safeOutput.root, pngPath, '标注截图', {
      mustExist: true,
      allowDirectory: false,
      allowAbsolute: true,
    });
    atomicWriteProjectFile(safeOutput.root, markdownPath, renderReviewMarkdown(review), {
      label: 'UI 验收 Markdown',
      mustNotExist: true,
    });
    swapOutputDirectory(safeOutput.root, stageRoot, safeOutputDir);
    return {
      outputDir: safeOutputDir,
      pngPath: path.join(safeOutputDir, 'ui-review.png'),
      markdownPath: path.join(safeOutputDir, 'ui-review.md'),
      findingCount: review.findings.length,
      filteredCount: review.filteredCount,
      mergedCount: review.mergedCount,
    };
  } catch (error) {
    try {
      if (fs.existsSync(stageRoot)) removeProjectDirectory(safeOutput.root, stageRoot, { label: 'UI 验收暂存目录' });
    } catch (cleanupError) {
      error.cleanupError = cleanupError;
    }
    throw error;
  }
}
