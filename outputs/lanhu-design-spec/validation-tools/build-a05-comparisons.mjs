// AI-code-start lines:96 tool:Codex
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const evidenceRoot = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix');
const manifestPath = path.join(evidenceRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const diffRoot = path.join(evidenceRoot, 'diff');
fs.mkdirSync(diffRoot, { recursive: true });

function runFfmpeg(args, label) {
  const result = spawnSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`${label}生成失败：${result.stderr || result.stdout}`);
}

for (const scenario of manifest.scenarios) {
  const reference = path.join(evidenceRoot, scenario.reference.file);
  const elementPlus = path.join(evidenceRoot, scenario.implementations.elementPlus.screenshot);
  const elementUi = path.join(evidenceRoot, scenario.implementations.elementUi.screenshot);
  const comparisonRelative = `diff/${scenario.id}-comparison.png`;
  const librariesDiffRelative = `diff/${scenario.id}-libraries-diff.png`;
  const comparison = path.join(evidenceRoot, comparisonRelative);
  const librariesDiff = path.join(evidenceRoot, librariesDiffRelative);
  for (const required of [reference, elementPlus, elementUi]) {
    if (!fs.existsSync(required)) throw new Error(`缺少对照输入：${required}`);
  }

  // 三栏固定为“蓝湖参考、Element Plus、Element UI”，只用于快速定位差异。
  runFfmpeg(
    [
      '-i',
      reference,
      '-i',
      elementPlus,
      '-i',
      elementUi,
      '-filter_complex',
      [
        '[0:v]scale=580:620:force_original_aspect_ratio=decrease,pad=600:660:(ow-iw)/2:(oh-ih)/2:white[r]',
        '[1:v]scale=580:620:force_original_aspect_ratio=decrease,pad=600:660:(ow-iw)/2:(oh-ih)/2:white[p]',
        '[2:v]scale=580:620:force_original_aspect_ratio=decrease,pad=600:660:(ow-iw)/2:(oh-ih)/2:white[u]',
        '[r][p][u]hstack=inputs=3[out]',
      ].join(';'),
      '-map',
      '[out]',
      '-frames:v',
      '1',
      comparison,
    ],
    `${scenario.id} 三方对照图`,
  );

  // 两套组件库先等比装入同一画布，再生成像素差异辅助图；它不替代显式值门禁。
  runFfmpeg(
    [
      '-i',
      elementPlus,
      '-i',
      elementUi,
      '-filter_complex',
      [
        '[0:v]scale=760:600:force_original_aspect_ratio=decrease,pad=800:640:(ow-iw)/2:(oh-ih)/2:white[p]',
        '[1:v]scale=760:600:force_original_aspect_ratio=decrease,pad=800:640:(ow-iw)/2:(oh-ih)/2:white[u]',
        '[p][u]blend=all_mode=difference[out]',
      ].join(';'),
      '-map',
      '[out]',
      '-frames:v',
      '1',
      librariesDiff,
    ],
    `${scenario.id} 双组件库差异图`,
  );

  scenario.comparison = {
    file: comparisonRelative,
    order: ['lanhu-reference', 'element-plus', 'element-ui'],
    librariesDiff: librariesDiffRelative,
    role: 'assist-only',
    note: '对照图和归一化差异图只用于定位；最终结论由几何、HEX、文案、图标和状态门禁决定。',
  };
}

manifest.comparisonEvidence = {
  total: manifest.scenarios.length,
  layout: 'lanhu-reference | element-plus | element-ui',
  normalizedLibrariesDiff: true,
  role: 'assist-only',
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已生成 ${manifest.scenarios.length} 组三方对照图和双组件库差异图。`);
