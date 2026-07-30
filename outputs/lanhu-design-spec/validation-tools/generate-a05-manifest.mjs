// AI-code-start lines:327 tool:Codex
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const evidenceRoot = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix');
const outputManifestPath = path.join(evidenceRoot, 'manifest.json');
const referenceManifestPath = path.join(specRoot, 'validation-evidence', 'reference-manifest.md');
const libraryManifestPath = path.join(specRoot, 'validation-element-plus', 'src', 'manifest.json');
const componentFolders = ['components', 'forms', 'pickers'];
const stateKeywords = [
  ['Default', 'Default'],
  ['默认', 'Default'],
  ['Hover', 'Hover'],
  ['悬停', 'Hover'],
  ['Focus', 'Focus'],
  ['聚焦', 'Focus'],
  ['Active', 'Active'],
  ['按下', 'Active'],
  ['Selected', 'Selected'],
  ['选中', 'Selected'],
  ['Indeterminate', 'Indeterminate'],
  ['半选', 'Indeterminate'],
  ['Disabled', 'Disabled'],
  ['禁用', 'Disabled'],
  ['Loading', 'Loading'],
  ['加载', 'Loading'],
  ['Empty', 'Empty'],
  ['空态', 'Empty'],
  ['无数据', 'Empty'],
  ['Error', 'Error'],
  ['错误', 'Error'],
  ['失败', 'Error'],
  ['展开', 'Expanded'],
  ['收起', 'Collapsed'],
  ['回填', 'ValueFilled'],
];
// 场景标题中的“默认”等词可能只是按钮文案，首批人工视觉复核用显式映射消除误判。
const scenarioStateOverrides = new Map([
  ['SCN-BUTTON-01', ['Default', 'Hover', 'Active']],
  ['SCN-BUTTON-02', ['Default']],
  ['SCN-BUTTON-03', ['Default']],
  ['SCN-BUTTON-05', ['Disabled']],
  ['SCN-BUTTON-06', ['Disabled']],
  ['SCN-BUTTON-07', ['Disabled']],
  ['SCN-CHECKBOX-01', ['Default', 'Hover', 'Selected', 'Indeterminate']],
  ['SCN-CHECKBOX-02', ['Disabled']],
  ['SCN-CHECKBOX-03', ['Selected']],
  ['SCN-CHECKBOX-04', ['Default', 'Selected', 'Disabled']],
  ['SCN-COLLAPSE-01', ['Expanded']],
  ['SCN-INPUT-09', []],
  ['SCN-RADIO-04', ['Selected', 'Disabled']],
  ['SCN-SWITCH-03', ['Disabled']],
  ['SCN-TABLE-01', ['Hover']],
  ['SCN-TABLE-02', ['Hover']],
  ['SCN-TABLE-04', []],
  ['SCN-TABLE-05', ['Scrolled']],
  ['SCN-TABLE-06', ['Scrolled']],
  ['SCN-TABLE-07', ['Scrolled']],
  ['SCN-TABLE-10', ['Selected']],
  ['SCN-TABLE-11', ['Indeterminate', 'Selected', 'Disabled']],
  ['SCN-TABLE-12', ['Ascending', 'Descending']],
  ['SCN-TABLE-13', ['Open', 'Active']],
  ['SCN-TABLE-16', ['Expanded', 'Collapsed']],
  ['SCN-TABLE-17', ['Expanded', 'Loading', 'Error']],
]);

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function markdownFiles() {
  return componentFolders.flatMap((folderName) => {
    const folderPath = path.join(specRoot, folderName);
    return fs
      .readdirSync(folderPath)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => path.join(folderPath, name));
  });
}

function parseReferenceBoards() {
  const boardsBySource = new Map();
  for (const line of read(referenceManifestPath).split(/\r?\n/u)) {
    const match = line.match(
      /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*`(\d+)\s*×\s*(\d+)px`\s*\|\s*`([^`]+)`\s*\|$/u,
    );
    if (!match) continue;
    const [, order, artboard, file, width, height, source] = match;
    const boards = boardsBySource.get(source) || [];
    boards.push({
      order: Number(order),
      artboard: artboard.trim(),
      file,
      width: Number(width),
      height: Number(height),
    });
    boardsBySource.set(source, boards);
  }
  return boardsBySource;
}

function parseScenarioRows(filePath) {
  const content = read(filePath);
  const source = path.relative(specRoot, filePath).split(path.sep).join('/');
  return content
    .split(/\r?\n/u)
    .filter((line) => /\|\s*`SCN-[A-Z0-9-]+-\d{2}`\s*\|/u.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        id: cells[0].replaceAll('`', ''),
        title: cells[1],
        visible: cells[2],
        rule: cells[3],
        source,
      };
    });
}

function chooseBoard(boards, scenario) {
  if (boards.length === 1) return { board: boards[0], boardIndex: scenario.ordinal - 1, boardCount: scenario.total };
  if (scenario.source === 'pickers/date-time-picker.md') {
    const onFirstBoard = scenario.ordinal <= 10;
    return {
      board: boards[onFirstBoard ? 0 : 1],
      boardIndex: onFirstBoard ? scenario.ordinal - 1 : scenario.ordinal - 11,
      boardCount: onFirstBoard ? 10 : 4,
    };
  }
  if (scenario.source === 'components/table.md') {
    if (scenario.ordinal <= 21) {
      return { board: boards[0], boardIndex: scenario.ordinal - 1, boardCount: 21 };
    }
    const boardByOrdinal = { 22: 3, 23: 1, 24: 2 };
    return {
      board: boards[boardByOrdinal[scenario.ordinal]],
      boardIndex: 0,
      boardCount: 1,
    };
  }
  return { board: boards[0], boardIndex: scenario.ordinal - 1, boardCount: scenario.total };
}

// 首轮坐标按画板纵向场景顺序生成，后续由逐图核对修正并提升为 confirmed。
function estimateCrop(board, boardIndex, boardCount) {
  const top = Math.round(Math.min(260, board.height * 0.12));
  const bottom = Math.round(Math.min(80, board.height * 0.04));
  const segment = (board.height - top - bottom) / boardCount;
  const y = Math.max(0, Math.round(top + boardIndex * segment - 16));
  return {
    x: Math.round(board.width * 0.035),
    y,
    width: Math.round(board.width * 0.93),
    height: Math.min(board.height - y, Math.round(segment + 32)),
    status: 'estimated',
  };
}

function uniqueMatches(value, pattern) {
  return [...new Set([...value.matchAll(pattern)].map((match) => match[0]))];
}

function requiredStates(value) {
  return [...new Set(stateKeywords.filter(([keyword]) => value.includes(keyword)).map(([, state]) => state))];
}

function initialImplementationEvidence(folder, componentId, id) {
  return {
    route: `/?evidence=1#${componentId}/${id}`,
    screenshot: `actual/${folder}/${id}.png`,
    measurements: {
      geometry: null,
      colors: [],
      texts: [],
      icons: [],
      initialState: null,
    },
    stateEvidence: [],
    result: 'fail',
    reasons: ['待生成实际裁图和浏览器实测'],
  };
}

const libraryManifest = JSON.parse(read(libraryManifestPath));
const manifestScenarioById = new Map(libraryManifest.scenarios.map((scenario) => [scenario.id, scenario]));
const boardsBySource = parseReferenceBoards();
const sourceRows = markdownFiles().flatMap(parseScenarioRows);
const totalsBySource = new Map();
for (const row of sourceRows) totalsBySource.set(row.source, (totalsBySource.get(row.source) || 0) + 1);
const ordinalsBySource = new Map();

const generatedScenarios = sourceRows.map((row) => {
  const ordinal = (ordinalsBySource.get(row.source) || 0) + 1;
  ordinalsBySource.set(row.source, ordinal);
  const runtimeScenario = manifestScenarioById.get(row.id);
  if (!runtimeScenario) throw new Error(`双组件库清单缺少场景：${row.id}`);
  const boards = boardsBySource.get(row.source);
  if (!boards?.length) throw new Error(`参考画板清单缺少来源：${row.source}`);
  const boardSelection = chooseBoard(boards, {
    source: row.source,
    ordinal,
    total: totalsBySource.get(row.source),
  });
  const combined = `${row.title} ${row.visible} ${row.rule}`;
  return {
    id: row.id,
    componentId: runtimeScenario.componentId,
    source: row.source,
    title: row.title,
    summary: row.rule,
    reference: {
      artboard: boardSelection.board.artboard,
      sourceFile: `../reference/${boardSelection.board.file}`,
      file: `reference/${row.id}.png`,
      crop: estimateCrop(boardSelection.board, boardSelection.boardIndex, boardSelection.boardCount),
    },
    expected: {
      geometry: uniqueMatches(combined, /\d+(?:\.\d+)?px(?:\s*[×x]\s*\d+(?:\.\d+)?px)?/gu),
      colors: uniqueMatches(combined, /#[0-9A-Fa-f]{6}/gu),
      texts: [row.title, row.visible].filter(Boolean),
      icons: /图标|icon/iu.test(combined) ? [row.visible] : [],
      initialState: row.visible || row.title,
      requiredStates: scenarioStateOverrides.get(row.id) || requiredStates(combined),
    },
    implementations: {
      elementPlus: initialImplementationEvidence('element-plus', runtimeScenario.componentId, row.id),
      elementUi: initialImplementationEvidence('element-ui', runtimeScenario.componentId, row.id),
    },
    result: 'fail',
    reasons: ['参考裁剪坐标待确认', '双组件库实测待生成'],
  };
});

// 重复执行时保留已经确认的裁图、浏览器实测、状态证据与人工结论。
const existingManifest = fs.existsSync(outputManifestPath)
  ? JSON.parse(read(outputManifestPath))
  : null;
const existingById = new Map((existingManifest?.scenarios || []).map((scenario) => [scenario.id, scenario]));
const scenarios = generatedScenarios.map((generated) => {
  const existing = existingById.get(generated.id);
  if (!existing) return generated;
  return {
    ...generated,
    // 文档修订后刷新场景文案与初始状态，同时保留已经补充的公共显式值和人工状态范围。
    expected: existing.expected
      ? {
          ...existing.expected,
          texts: generated.expected.texts,
          icons: generated.expected.icons,
          initialState: generated.expected.initialState,
          requiredStates: generated.expected.requiredStates,
        }
      : generated.expected,
    reference:
      existing.reference?.crop?.status === 'confirmed'
        ? existing.reference
        : generated.reference,
    implementations: existing.implementations || generated.implementations,
    comparison: existing.comparison,
    result: existing.result || generated.result,
    reasons: existing.reasons || generated.reasons,
    review: existing.review,
  };
});

if (scenarios.length !== 183 || new Set(scenarios.map((scenario) => scenario.id)).size !== 183) {
  throw new Error(`A-05 场景清单数量异常：${scenarios.length}`);
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  capture: {
    browser: 'Google Chrome',
    viewport: { width: 1920, height: 958 },
    pageZoom: 1,
    deviceScaleFactor: 2,
    referenceScale: '@1x',
    geometryTolerancePx: 2,
    colorRule: 'explicit-hex-exact',
  },
  summary: {
    total: scenarios.length,
    passed: 0,
    failed: scenarios.length,
    referenceConfirmed: 0,
  },
  scenarios,
};

fs.mkdirSync(path.join(evidenceRoot, 'reference'), { recursive: true });
fs.mkdirSync(path.join(evidenceRoot, 'actual', 'element-plus'), { recursive: true });
fs.mkdirSync(path.join(evidenceRoot, 'actual', 'element-ui'), { recursive: true });
fs.mkdirSync(path.join(evidenceRoot, 'states', 'element-plus'), { recursive: true });
fs.mkdirSync(path.join(evidenceRoot, 'states', 'element-ui'), { recursive: true });
fs.mkdirSync(path.join(evidenceRoot, 'diff'), { recursive: true });
fs.writeFileSync(outputManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const matrixRows = scenarios.map((scenario) => [
  `\`${scenario.id}\``,
  scenario.title.replaceAll('|', '\\|'),
  `[参考裁图](a05-visual-matrix/${scenario.reference.file})`,
  `[Element Plus](a05-visual-matrix/${scenario.implementations.elementPlus.screenshot})`,
  `[Element UI](a05-visual-matrix/${scenario.implementations.elementUi.screenshot})`,
  '未通过',
  scenario.reasons.join('；'),
].join(' | '));
const matrix = [
  '# A-05 双组件库逐场景视觉验收矩阵',
  '',
  '固定环境：Google Chrome、`1920 × 958` CSS 视口、100% 页面缩放、设备像素比 2、蓝湖 Web `@1x`；几何门禁使用 CSS 逻辑像素。',
  '',
  '判定规则：同一场景只有蓝湖参考、Element Plus、Element UI 三方证据完整，且两套实现均满足 `±2px`、显式 HEX、文案、图标、初始状态与适用操作后状态时才通过。',
  '',
  '| 场景 | 标题 | 参考裁图 | Element Plus | Element UI | 结论 | 说明 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...matrixRows.map((row) => `| ${row} |`),
  '',
  `当前统计：0 / ${scenarios.length} 通过；参考裁剪坐标均为首轮估算，必须逐图确认后才能进入 A-05 通过率。`,
  '',
].join('\n');
fs.writeFileSync(path.join(specRoot, 'validation-evidence', 'a05-visual-matrix.md'), matrix);

console.log(`已生成 ${scenarios.length} 条 A-05 场景清单。`);
