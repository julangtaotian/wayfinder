// AI-code-start lines:221 tool:Codex
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specRoot = path.join(repositoryRoot, 'outputs', 'lanhu-design-spec');
const validationUiRoot = path.join(specRoot, 'validation-ui');
const reportPath = path.join(specRoot, 'validation-report.md');
const detailFolders = ['foundations', 'components', 'forms', 'pickers'];
const componentFolders = ['components', 'forms', 'pickers'];

function markdownFiles(folderNames) {
  return folderNames.flatMap((folderName) => {
    const folderPath = path.join(specRoot, folderName);
    return fs
      .readdirSync(folderPath)
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(folderPath, name));
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function relative(filePath) {
  return path.relative(specRoot, filePath).split(path.sep).join('/');
}

function section(content, heading) {
  const lines = content.split(/\r?\n/u);
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) return '';
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /u.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join('\n');
}

// 一个“画板场景”章节可能包含多张表；每张表前两行都是表头和分隔线。
function scenarioRows(content) {
  const lines = section(content, '画板场景').split(/\r?\n/u);
  const rows = [];
  let table = [];
  const flush = () => {
    if (table.length >= 2) rows.push(...table.slice(2));
    table = [];
  };
  for (const line of lines) {
    if (line.startsWith('|')) {
      table.push(line);
    } else {
      flush();
    }
  }
  flush();
  return rows;
}

function localMarkdownLinks(filePath) {
  const content = read(filePath);
  return [...content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
    .map((match) => match[1])
    .filter((target) => !/^(?:https?:|mailto:|#)/u.test(target))
    .map((target) => target.split('#')[0])
    .filter(Boolean);
}

test('设计规范保持 31/30/26 的文档结构', () => {
  const detailFiles = markdownFiles(detailFolders);
  const componentFiles = markdownFiles(componentFolders);
  assert.equal(detailFiles.length + 1, 31, '应包含 README 和 30 份详细规范');
  assert.equal(detailFiles.length, 30, '详细规范数量必须为 30');
  assert.equal(componentFiles.length, 26, '组件、表单和选择器规范数量必须为 26');
  assert.ok(fs.existsSync(path.join(specRoot, 'README.md')));
});

test('30 份详细规范具有稳定元数据和来源边界', () => {
  for (const filePath of markdownFiles(detailFolders)) {
    const content = read(filePath);
    const metadata = section(content, '规范元数据');
    assert.ok(metadata, `${relative(filePath)} 缺少规范元数据`);
    for (const field of ['文档类型', '蓝湖画板', '画板数量', '画板场景', '还原状态', '来源判定', '测量基准']) {
      assert.match(metadata, new RegExp(`\\| ${field} \\|`, 'u'), `${relative(filePath)} 缺少元数据字段 ${field}`);
    }
    assert.match(metadata, /蓝湖标注/u, `${relative(filePath)} 缺少蓝湖标注来源规则`);
    assert.match(metadata, /画板实测/u, `${relative(filePath)} 缺少画板实测来源规则`);
    assert.match(metadata, /研发补充/u, `${relative(filePath)} 缺少研发补充来源规则`);
    assert.match(metadata, /Web `@1x`/u, `${relative(filePath)} 缺少 @1x 测量基准`);
  }
});

// AI-code-start lines:52 tool:Codex
test('响应式表单布局完整映射 12 张画板并提供连续的 3/4/6 列规则', () => {
  const filePath = path.join(specRoot, 'foundations', 'responsive-form-layout.md');
  assert.ok(fs.existsSync(filePath), '缺少响应式表单布局规范');
  const content = read(filePath);
  const metadata = section(content, '规范元数据');
  assert.match(metadata, /\| 文档类型 \| 基础布局规范 \|/u);
  assert.match(metadata, /\| 画板数量 \| `12` \|/u);

  const boardRows = tableRows(content, '12 张画板映射');
  assert.equal(boardRows.length, 12, '响应式布局必须完整映射 12 张蓝湖画板');
  const boardIds = boardRows.flatMap((row) => (
    row.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gu) || []
  ));
  assert.equal(boardIds.length, 12, '每张适配画板都必须保留稳定画板 ID');
  assert.equal(new Set(boardIds).size, 12, '适配画板 ID 必须唯一');
  // AI-code-start lines:33 tool:Codex
  const boardNames = boardRows.map((row) => row.split('|')[1].trim().replaceAll('`', ''));
  assert.equal(new Set(boardNames).size, 12, '规范化画板名称必须唯一');
  for (const name of boardNames) {
    assert.match(
      name,
      /^\d+ × \d+｜(?:\d+ 列｜(?:基础|空数据|数据|宽屏)|规则总览｜断点与间距)$/u,
      `画板名称必须直接包含尺寸、列数和状态/用途：${name}`,
    );
  }
  assert.doesNotMatch(
    section(content, '12 张画板映射'),
    /copy(?: 2)?/iu,
    '画板映射不得继续暴露 copy 类源名称',
  );
  assert.deepEqual(
    [...boardIds].sort(),
    [
      '10436508-e5fd-478b-adae-b2fd01e4ec45',
      'c1536ab9-e041-4c34-90b4-4639a43f0194',
      'd6856c9e-dced-4c3b-997f-b6ab126271ea',
      '401ca327-5421-42a0-92ad-b8a1ab331598',
      '2cf6429a-d06f-401b-9f73-fd753b53e6a6',
      'd429b8d2-944a-4139-b986-73cb17e1a51e',
      'f7be6a3e-6ddd-4eae-9ec0-e19a83d24594',
      '63267d3b-3e33-44d0-b97c-a7b921f6f794',
      '8a01e8fd-0f54-4606-a8ed-ead33c138f96',
      'd2c81f73-427f-458a-b8b8-16503832277b',
      '4b1cc8d7-f99e-4db4-b893-c5ff16cbad4c',
      'd1880935-8424-4802-a62b-d154ee873ea8',
    ].sort(),
    '可读名称调整不得改变稳定画板 ID',
  );
  assert.doesNotMatch(content, /Element Plus|Element UI|iframe|library-project-screenshots/u, '正式规范不得混入验证专用实现细节');

  const breakpointSection = section(content, '可执行断点');
  const finiteRanges = [...breakpointSection.matchAll(
    /\| `(\d+)px ≤ W < (\d+)px` \| `(\d+)` 列 \|/gu,
  )].map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
  const openRange = breakpointSection.match(/\| `W ≥ (\d+)px` \| `(\d+)` 列 \|/u);
  const ranges = [...finiteRanges, [Number(openRange?.[1]), Infinity, Number(openRange?.[2])]];
  assert.deepEqual(ranges, [
    [1024, 1440, 3],
    [1440, 1920, 4],
    [1920, Infinity, 6],
  ]);
  for (let index = 1; index < ranges.length; index += 1) {
    assert.equal(ranges[index - 1][1], ranges[index][0], '响应式断点存在空档或重叠');
  }

  for (const expected of [
    '`x=124px, y=48px`',
    '`884px × 704px`',
    '`#FAFBFC`',
    '`#EEF1F5`',
    '`16px`',
    '`8px`',
    '`1200px` 和 `2560px` 是拉伸检查点',
    '`columnWidth = (A - (N - 1) × G) / N`',
    '操作组不计入 3/4/6 个字段组的列数',
    '蓝湖没有提供 `<1024px`',
    '统一按 `1440px` 断点处理',
    // AI-code-start lines:4 tool:Codex
    '字段控件宽度占满所属等分列',
    '主操作文字、边框或填充按按钮规范使用品牌色 `#FF6014`',
    '直接保留组件库默认主色',
    '不得超出当前视口与工作区右边界',
    // AI-code-start lines:5 tool:Codex
    '标签必须位于控件左侧',
    '按当前标签文案的固有宽度占位',
    '约 `12px`',
    '与 `32px` 控件垂直居中',
    '禁止把所有字段统一改成顶部标签',
  ]) {
    assert.ok(content.includes(expected), `响应式布局缺少可执行规则：${expected}`);
  }

  const readme = read(path.join(specRoot, 'README.md'));
  assert.equal((readme.match(/^\| \d+ \|/gmu) || []).length, 45, 'README 必须映射 45 张画板');
  assert.match(readme, /30.*详细 Markdown.*31.*Markdown 文件/u);
  // AI-code-start lines:7 tool:Codex
  const responsiveIndexRows = [...readme.matchAll(
    /^\| (3[4-9]|4[0-5]) \| 后台适配规范 \/ `([^`]+)` \| \[响应式表单布局\]\(\.\/foundations\/responsive-form-layout\.md\) \|$/gmu,
  )];
  const responsiveIndexNames = responsiveIndexRows.map((match) => match[2]);
  assert.equal(responsiveIndexNames.length, 12, 'README 必须保留 12 条响应式画板索引');
  assert.deepEqual(responsiveIndexNames, boardNames, 'README 响应式画板名称和顺序必须与正文一致');
  assert.doesNotMatch(responsiveIndexRows.map((match) => match[0]).join('\n'), /copy(?: 2)?/iu, 'README 响应式索引不得出现 copy 类名称');
  assert.doesNotMatch(breakpointSection, /1400px ≤ W|W ≥ 1400px/u);
});

// AI-code-start lines:45 tool:Codex
test('双组件库工程真实实现响应式表单专用入口', () => {
  const projects = [
    {
      folder: 'validation-element-plus',
      library: 'Element Plus',
      packageName: 'element-plus',
    },
    {
      folder: 'validation-element-ui',
      library: 'Element UI',
      packageName: 'element-ui',
    },
  ];
  for (const project of projects) {
    const projectRoot = path.join(specRoot, project.folder);
    const app = read(path.join(projectRoot, 'src', 'App.vue'));
    const layout = read(path.join(projectRoot, 'src', 'ResponsiveFormLayout.vue'));
    // AI-code-start lines:1 tool:Codex
    const harness = read(path.join(projectRoot, 'src', 'ResponsiveViewportHarness.vue'));
    const packageJson = JSON.parse(read(path.join(projectRoot, 'package.json')));
    assert.match(app, /search\.get\('layout'\) === 'responsive-form'/u);
    assert.match(app, /<ResponsiveFormLayout v-(?:else-)?if="layoutMode"/u);
    assert.match(app, new RegExp(`library-name="${project.library}"`, 'u'));
    // AI-code-start lines:3 tool:Codex
    assert.match(app, /search\.get\('harness'\) === '2560'/u);
    assert.match(harness, /<iframe[\s\S]+src="\/\?layout=responsive-form&framed=1"/u);
    assert.match(harness, /width: 2560px;[\s\S]+height: 900px;/u);
    assert.ok(packageJson.dependencies[project.packageName], `${project.library} 未声明真实组件库`);

    for (const tag of ['el-form', 'el-form-item', 'el-input', 'el-select', 'el-date-picker', 'el-button']) {
      assert.match(layout, new RegExp(`<${tag}(?:\\s|>)`, 'u'), `${project.library} 缺少 ${tag}`);
    }
    // AI-code-start lines:8 tool:Codex
    assert.match(layout, /label-position="left"/u, `${project.library} 未显式使用左侧标签`);
    assert.doesNotMatch(layout, /label-position="top"/u, `${project.library} 仍在使用顶部标签`);
    assert.match(layout, /padding:\s*0 12px 0 0;/u, `${project.library} 标签间距不是 12px`);
    assert.match(layout, /height:\s*32px;[\s\S]*?align-items:\s*center;/u, `${project.library} 字段未按 32px 垂直居中`);
    assert.ok(layout.includes('labelLeftOfControl'), `${project.library} 快照缺少标签方向`);
    assert.ok(layout.includes('labelGap'), `${project.library} 快照缺少标签间距`);
    assert.ok(layout.includes('verticalCenterDelta'), `${project.library} 快照缺少垂直中心差`);
    assert.ok(layout.includes('singleLine'), `${project.library} 快照缺少单行判断`);
    for (const expected of [
      'left: 124px;',
      'top: 48px;',
      'right: 16px;',
      'bottom: 16px;',
      'column-gap: 8px;',
      'grid-template-columns: repeat(3, minmax(0, 1fr));',
      '@media (min-width: 1440px)',
      '@media (min-width: 1920px)',
      'data-operation-group="true"',
      'window.__RESPONSIVE_FORM_VALIDATION__',
    ]) {
      assert.ok(layout.includes(expected), `${project.library} 缺少响应式实现：${expected}`);
    }
    const distFiles = fs.readdirSync(path.join(projectRoot, 'dist', 'assets'));
    assert.ok(distFiles.some((name) => /^index-.+\.js$/u.test(name)), `${project.library} 缺少生产构建 JS`);
    assert.ok(distFiles.some((name) => /^index-.+\.css$/u.test(name)), `${project.library} 缺少生产构建 CSS`);
  }
});

// AI-code-start lines:45 tool:Codex
test('双组件库五档真实视口测量和截图全部通过', () => {
  const evidenceRoot = path.join(specRoot, 'validation-evidence', 'responsive-form-layout');
  const measurementPath = path.join(evidenceRoot, 'library-project-measurements.json');
  assert.ok(fs.existsSync(measurementPath), '缺少双组件库响应式测量 JSON');
  const evidence = JSON.parse(read(measurementPath));
  // AI-code-start lines:3 tool:Codex
  const validationReport = read(path.join(evidenceRoot, 'library-project-validation.md'));
  assert.match(validationReport, /3 \/ 3 \/ 4 \/ 6 \/ 6/u);
  assert.match(validationReport, /横向溢出均为 `0px`/u);
  const expectedColumns = new Map([
    [1024, 3],
    [1200, 3],
    [1440, 4],
    [1920, 6],
    [2560, 6],
  ]);
  assert.deepEqual(Object.keys(evidence.libraries).sort(), ['element-plus', 'element-ui']);
  for (const [library, result] of Object.entries(evidence.libraries)) {
    assert.equal(result.samples.length, 5, `${library} 必须包含五档实际视口`);
    assert.match(result.runtime, library === 'element-plus' ? /Element Plus/u : /Element UI/u);
    for (const sample of result.samples) {
      const expected = expectedColumns.get(sample.target.width);
      assert.equal(sample.viewport.width, sample.target.width);
      assert.equal(sample.viewport.height, sample.target.height);
      assert.equal(sample.expanded.columns, expected);
      assert.equal(sample.expanded.expectedColumns, expected);
      assert.equal(sample.expanded.columnGap, 8);
      assert.equal(sample.expanded.fieldCount, 8);
      assert.equal(sample.collapsed.fieldCount, 5);
      assert.equal(sample.collapsed.columns, expected);
      assert.equal(sample.expanded.workspace.x, 124);
      assert.equal(sample.expanded.workspace.y, 48);
      assert.equal(sample.expanded.workspace.rightGap, 16);
      assert.equal(sample.expanded.workspace.bottomGap, 16);
      assert.equal(sample.expanded.workspace.background, 'rgb(250, 251, 252)');
      assert.equal(sample.expanded.workspace.borderRadius, '4px');
      assert.equal(sample.expanded.horizontalOverflow, 0);
      assert.ok(Object.values(sample.expanded.components).every(Boolean));
      // AI-code-start lines:14 tool:Codex
      for (const field of sample.expanded.fieldRects) {
        assert.ok(field.labelRect.width > 0, `${library} ${sample.target.width} ${field.key} 标签宽度无效`);
        assert.ok(field.controlRect.width > 0, `${library} ${sample.target.width} ${field.key} 控件宽度无效`);
        assert.ok(field.labelLeftOfControl, `${library} ${sample.target.width} ${field.key} 标签不在控件左侧`);
        assert.ok(field.singleLine, `${library} ${sample.target.width} ${field.key} 标签与控件不在同一行`);
        assert.ok(
          Math.abs(field.labelGap - 12) <= 2,
          `${library} ${sample.target.width} ${field.key} 标签间距超出 12±2px`,
        );
        assert.ok(
          Math.abs(field.verticalCenterDelta) <= 2,
          `${library} ${sample.target.width} ${field.key} 标签与控件未垂直居中`,
        );
      }
      // AI-code-start lines:4 tool:Codex
      const labelWidths = new Set(sample.expanded.fieldRects.map((field) => field.labelRect.width));
      const controlWidths = new Set(sample.expanded.fieldRects.map((field) => field.controlRect.width));
      assert.ok(labelWidths.size > 1, `${library} ${sample.target.width} 未验证不同文案的固有标签宽度`);
      assert.ok(controlWidths.size > 1, `${library} ${sample.target.width} 控件未按标签宽度分配剩余空间`);
      assert.ok(sample.interactions.expandCollapse);
      assert.ok(sample.interactions.query);
      assert.ok(sample.interactions.reset);
      assert.ok(sample.reloadVerified);
      assert.ok(fs.existsSync(path.join(repositoryRoot, sample.screenshot)));
    }
    const baseline = result.samples.find((sample) => sample.target.width === 1024);
    assert.equal(baseline.expanded.workspace.width, 884);
    assert.equal(baseline.expanded.workspace.height, 704);
  }
});

test('26 份组件类规范精确包含 183 个唯一场景 ID', () => {
  const componentFiles = markdownFiles(componentFolders);
  const ids = [];
  let rowCount = 0;
  for (const filePath of componentFiles) {
    const rows = scenarioRows(read(filePath));
    assert.ok(rows.length > 0, `${relative(filePath)} 缺少画板场景数据行`);
    rowCount += rows.length;
    for (const row of rows) {
      const match = row.match(/`(SCN-[A-Z0-9-]+-\d{2})`/u);
      assert.ok(match, `${relative(filePath)} 场景缺少稳定 ID：${row}`);
      ids.push(match[1]);
      const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
      assert.ok(cells.length >= 3, `${relative(filePath)} 场景信息不完整：${row}`);
      assert.ok(cells.slice(1).every(Boolean), `${relative(filePath)} 场景存在空白描述：${row}`);
    }
  }
  assert.equal(rowCount, 183, '画板场景数据行必须为 183');
  assert.equal(ids.length, 183, '场景 ID 数量必须为 183');
  assert.equal(new Set(ids).size, 183, '场景 ID 必须全局唯一');
});

test('源规范不保留裸占位符或矛盾说明', () => {
  const sourceFiles = [path.join(specRoot, 'README.md'), ...markdownFiles(detailFolders)];
  for (const filePath of sourceFiles) {
    const content = read(filePath);
    assert.doesNotMatch(content, /\|\s*[—-]\s*\|/u, `${relative(filePath)} 仍包含裸占位符`);
    assert.doesNotMatch(content, /（待定）|保持“未标注”/u, `${relative(filePath)} 仍包含待定或矛盾说明`);
  }
  const input = read(path.join(specRoot, 'components', 'input.md'));
  assert.match(
    input,
    /\| 示例宽度 \| 画板实测约 `240px` \| 画板实测约 `240px` \| 画板实测约 `240px` \|/u,
  );
});

test('Select 明确区分蓝湖未定义和研发补充', () => {
  const select = read(path.join(specRoot, 'components', 'select.md'));
  assert.equal((select.match(/蓝湖状态：未定义/gu) || []).length, 3);
  assert.match(select, /^## 研发补充$/mu);
  for (const expected of [
    '自定义模板',
    '本地筛选',
    '远程搜索',
    '无匹配数据',
    '加载失败，请重试',
    '加载中',
    '请求频率',
    '不属于本视觉规范',
  ]) {
    assert.ok(select.includes(expected), `Select 研发补充缺少：${expected}`);
  }
});

test('所有 Markdown 本地链接均可解析', () => {
  const files = [path.join(specRoot, 'README.md'), ...markdownFiles(detailFolders)];
  for (const filePath of files) {
    for (const target of localMarkdownLinks(filePath)) {
      const resolved = path.resolve(path.dirname(filePath), target);
      assert.ok(fs.existsSync(resolved), `${relative(filePath)} 的本地链接不存在：${target}`);
    }
  }
});

test('颜色值使用完整六位 HEX，尺寸值包含单位', () => {
  for (const filePath of markdownFiles(detailFolders)) {
    const content = read(filePath);
    const malformedHex = [...content.matchAll(/#[0-9A-Za-z]+/gu)]
      .map((match) => match[0])
      .filter((value) => !/^#[0-9A-Fa-f]{6}$/u.test(value));
    assert.deepEqual(malformedHex, [], `${relative(filePath)} 存在非法 HEX`);
    assert.doesNotMatch(content, /`\d+(?:\.\d+)?`\s*(?:宽|高|尺寸)/u, `${relative(filePath)} 存在缺少单位的尺寸`);
  }
});

test('参考画板清单完整保存 33 张原尺寸图片', () => {
  const referenceRoot = path.join(specRoot, 'validation-evidence', 'reference');
  const files = fs.readdirSync(referenceRoot).filter((name) => /\.(?:png|webp)$/u.test(name)).sort();
  assert.equal(files.length, 33);
  assert.equal(files[0], '01-color-primary.webp');
  assert.equal(files.at(-1), '33-table-page-small.webp');
  const manifest = read(path.join(specRoot, 'validation-evidence', 'reference-manifest.md'));
  assert.equal((manifest.match(/^\| \d+ \|/gmu) || []).length, 33);
});

test('历史隔离 AI 还原产物覆盖 Table 扩展前的 29 个画板和 159 条场景', () => {
  for (const required of ['index.html', 'styles.css', 'app.js', 'manifest.json', 'isolation-run.md']) {
    assert.ok(fs.existsSync(path.join(validationUiRoot, required)), `隔离还原产物缺少 ${required}`);
  }
  const manifest = JSON.parse(read(path.join(validationUiRoot, 'manifest.json')));
  assert.equal(manifest.artboards.length, 29, '还原视图必须覆盖 29 张画板');
  assert.equal(manifest.componentViews.length, 25, '还原视图必须覆盖 25 份组件类规范');
  assert.equal(manifest.scenarios.length, 159, '还原清单必须覆盖 159 条场景');
  assert.equal(new Set(manifest.scenarios.map((item) => item.id)).size, 159, '还原场景 ID 必须唯一');
  assert.equal(manifest.inputPolicy, 'markdown-and-local-assets');
});

test('隔离 UI 不依赖外部资源并实现必要可见状态', () => {
  const files = ['index.html', 'styles.css', 'app.js'];
  const combined = files.map((name) => read(path.join(validationUiRoot, name))).join('\n');
  assert.doesNotMatch(combined, /https?:\/\//u, '隔离 UI 不得读取外部资源');
  for (const expected of [
    'dataset.componentView',
    'data-scenario-id',
    'assets/icons/',
    '加载中',
    '无匹配数据',
    '加载失败，请重试',
    'disabled',
    'data-filter',
  ]) {
    assert.ok(combined.includes(expected), `隔离 UI 缺少交互证据：${expected}`);
  }
});

test('验证报告包含 A-01 至 A-06 和失败优先结论', () => {
  const report = read(reportPath);
  for (let index = 1; index <= 6; index += 1) {
    assert.ok(report.includes(`A-${String(index).padStart(2, '0')}`), `验证报告缺少 A-${index}`);
  }
  assert.match(report, /可完全还原|尚不能完全还原|尚不足以用于稳定还原/u);
  assert.match(report, /33 张画板/u);
  assert.match(report, /183 条场景/u);
  assert.match(report, /最小补充清单/u);
});

// AI-code-start lines:16 tool:Codex
test('实际截图完整保存 29 张原尺寸 PNG', () => {
  const actualRoot = path.join(specRoot, 'validation-evidence', 'actual');
  const files = fs.readdirSync(actualRoot).filter((name) => name.endsWith('.png')).sort();
  assert.equal(files.length, 29);
  const manifest = read(path.join(specRoot, 'validation-evidence', 'actual-manifest.md'));
  assert.equal((manifest.match(/^\| \d+ \|/gmu) || []).length, 29);
  for (let index = 0; index < files.length; index += 1) {
    const bytes = fs.readFileSync(path.join(actualRoot, files[index]));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${files[index]} 不是 PNG`);
    const row = manifest.split('\n').find((line) => line.includes(`actual/${files[index]}`));
    const dimensions = row?.match(/`(\d+) × (\d+)px`/u);
    assert.ok(dimensions, `${files[index]} 缺少尺寸清单`);
    assert.equal(bytes.readUInt32BE(16), Number(dimensions[1]), `${files[index]} 宽度错误`);
    assert.equal(bytes.readUInt32BE(20), Number(dimensions[2]), `${files[index]} 高度错误`);
  }
});

// AI-code-start lines:86 tool:Codex
function tableRows(content, heading) {
  return section(content, heading)
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('|'))
    .slice(2);
}

test('README 明确 PC 端且技术栈无关的规范边界', () => {
  const readme = read(path.join(specRoot, 'README.md'));
  for (const expected of [
    '面向 PC 端、技术栈无关',
    '组件库只是可选复用方式',
    '组件本体和必要状态区域',
    'assets/icons/',
  ]) {
    assert.ok(readme.includes(expected), `README 缺少规范边界：${expected}`);
  }
  assert.doesNotMatch(readme, /必须使用 (?:Element|Element Plus)/u);
});

test('26 份组件类规范包含稳定的结构、必要状态和图标章节', () => {
  for (const filePath of markdownFiles(componentFolders)) {
    const content = read(filePath);
    const structure = section(content, '组件结构');
    const states = section(content, '必要交互 UI 状态');
    const icons = section(content, '图标资产');
    assert.match(
      structure,
      /^\| 区域 \| 组成与顺序 \| 视觉与状态 \| 来源 \|$/mu,
      `${relative(filePath)} 的组件结构表头不稳定`,
    );
    assert.match(
      states,
      /^\| 状态 \| 触发条件 \| 可见变化 \| 恢复方式 \| 来源 \|$/mu,
      `${relative(filePath)} 的必要状态表头不稳定`,
    );
    assert.match(
      icons,
      /^\| 图标语义 \| 本地资产 \| 显示尺寸 \| 颜色 \| 适用状态 \| 替换边界 \| 来源 \|$/mu,
      `${relative(filePath)} 的图标资产表头不稳定`,
    );
    assert.ok(tableRows(content, '组件结构').length > 0, `${relative(filePath)} 缺少组件结构数据`);
    assert.ok(tableRows(content, '必要交互 UI 状态').length > 0, `${relative(filePath)} 缺少必要状态数据`);
    assert.ok(tableRows(content, '图标资产').length > 0, `${relative(filePath)} 缺少图标资产数据`);
  }
});

test('本地图标资产、清单和组件引用完整可解析', () => {
  const iconRoot = path.join(specRoot, 'assets', 'icons');
  const iconFiles = fs.readdirSync(iconRoot).filter((name) => name.endsWith('.png')).sort();
  assert.equal(iconFiles.length, 6, '应包含蓝湖可直接下载的 6 个透明 PNG');
  const manifestPath = path.join(iconRoot, 'manifest.md');
  assert.ok(fs.existsSync(manifestPath), '缺少图标资产清单');
  for (const target of localMarkdownLinks(manifestPath)) {
    assert.ok(fs.existsSync(path.resolve(iconRoot, target)), `图标清单链接不存在：${target}`);
  }
  const referenced = new Set();
  for (const filePath of markdownFiles(componentFolders)) {
    const icons = section(read(filePath), '图标资产');
    for (const match of icons.matchAll(/\]\(\.\.\/assets\/icons\/([^)]+\.png)\)/gu)) {
      referenced.add(match[1]);
    }
    assert.match(
      icons,
      /assets\/icons\/|蓝湖未提供独立资产|无\/不适用/u,
      `${relative(filePath)} 未引用本地资产，也未说明蓝湖未提供`,
    );
  }
  assert.deepEqual([...referenced].sort(), iconFiles, '6 个下载图标都应被至少一个组件规范引用');
});

test('Select 研发补充只约束必要可见状态', () => {
  const select = read(path.join(specRoot, 'components', 'select.md'));
  assert.doesNotMatch(select, /300ms|递增请求序号|AbortController|卸载组件时/u);
  for (const expected of ['加载中', '无匹配数据', '加载失败，请重试', '已选值', '不属于本视觉规范']) {
    assert.ok(select.includes(expected), `Select 缺少必要可见状态：${expected}`);
  }
});

test('修订后报告使用组件区域口径并保留旧基线说明', () => {
  const report = read(reportPath);
  assert.match(report, /组件本体|组件区域/u);
  assert.match(report, /验证页外壳/u);
  assert.match(report, /旧.*0\s*\/\s*29|0\s*\/\s*29.*历史/u);
  assert.match(report, /可用于 AI 还原本套 UI 规范|尚不足以用于稳定还原/u);
});

// AI-code-start lines:95 tool:Codex
const libraryValidationSuites = [
  {
    folder: 'validation-element-plus',
    framework: 'vue',
    library: 'element-plus',
    registration: 'app.use(ElementPlus',
    label: 'Vue 3 + Element Plus',
  },
  {
    folder: 'validation-element-ui',
    framework: 'vue',
    library: 'element-ui',
    registration: 'Vue.use(ElementUI)',
    label: 'Vue 2 + Element UI',
  },
];

test('双组件库验收工程真实声明并注册对应组件库', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder);
    const packageJson = JSON.parse(read(path.join(root, 'package.json')));
    const mainSource = read(path.join(root, 'src', 'main.js'));
    const appSource = ['App.vue', 'ScenarioDemo.vue', 'TableScenario.vue']
      .map((name) => read(path.join(root, 'src', name)))
      .join('\n');
    assert.ok(packageJson.dependencies?.[suite.framework], `${suite.label} 缺少 Vue 依赖`);
    assert.ok(packageJson.dependencies?.[suite.library], `${suite.label} 缺少组件库依赖`);
    assert.ok(packageJson.scripts?.build, `${suite.label} 缺少独立构建命令`);
    assert.ok(mainSource.includes(suite.registration), `${suite.label} 未真实注册组件库`);
    assert.match(appSource, /<el-[a-z-]+/u, `${suite.label} 未使用真实 el-* 组件`);
    assert.doesNotMatch(
      appSource,
      /<(?:input|button|select|textarea)(?:\s|>)/u,
      `${suite.label} 不得用原生表单控件替代组件库`,
    );
  }
});

test('两套组件库清单分别覆盖 26 个组件视图和 183 条场景', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder);
    const manifest = JSON.parse(read(path.join(root, 'src', 'manifest.json')));
    assert.equal(manifest.library, suite.library, `${suite.label} 清单组件库错误`);
    assert.equal(manifest.inputPolicy, 'markdown-and-local-assets');
    assert.equal(manifest.componentViews.length, 26, `${suite.label} 应覆盖 26 个组件视图`);
    assert.equal(manifest.scenarios.length, 183, `${suite.label} 应覆盖 183 条场景`);
    assert.equal(
      new Set(manifest.scenarios.map((item) => item.id)).size,
      183,
      `${suite.label} 场景 ID 必须唯一`,
    );
    const viewIds = new Set(manifest.componentViews.map((item) => item.id));
    assert.ok(
      manifest.scenarios.every((item) => viewIds.has(item.componentId)),
      `${suite.label} 存在无法映射到组件视图的场景`,
    );
  }
});

test('两套组件库工程均复制本地图标并覆盖显式主题值', () => {
  const expectedIcons = fs
    .readdirSync(path.join(specRoot, 'assets', 'icons'))
    .filter((name) => name.endsWith('.png'))
    .sort();
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder);
    const actualIcons = fs
      .readdirSync(path.join(root, 'public', 'assets', 'icons'))
      .filter((name) => name.endsWith('.png'))
      .sort();
    const theme = read(path.join(root, 'src', 'theme.css'));
    const appSource = ['App.vue', 'ScenarioDemo.vue'].map((name) => read(path.join(root, 'src', name))).join('\n');
    assert.deepEqual(actualIcons, expectedIcons, `${suite.label} 本地图标不完整`);
    assert.ok(appSource.includes('/assets/icons/'), `${suite.label} 未在组件中使用本地图标`);
    for (const expected of ['#FF6014', '#222222', '#666666', '#CCCCCC', '32px']) {
      assert.ok(theme.includes(expected), `${suite.label} 主题覆盖缺少 ${expected}`);
    }
  }
});

test('两套组件库工程均生成可独立部署的构建产物', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder, 'dist');
    assert.ok(fs.existsSync(path.join(root, 'index.html')), `${suite.label} 缺少 dist/index.html`);
    assert.ok(fs.existsSync(path.join(root, 'assets')), `${suite.label} 缺少构建资源`);
  }
});

test('当前验证报告只以两套组件库作为 A-04 和 A-05 证据', () => {
  const report = read(reportPath);
  assert.match(report, /Vue 3 \+ Element Plus/u);
  assert.match(report, /Vue 2 \+ Element UI/u);
  assert.match(report, /原生.*历史基线/u);
  assert.match(report, /原生.*不得作为.*A-04.*A-05|A-04.*A-05.*不得.*原生/u);
});

// AI-code-start lines:112 tool:Codex
const a05EvidenceRoot = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix');
const a05ManifestPath = path.join(a05EvidenceRoot, 'manifest.json');
const a05MatrixPath = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix.md');

test('A-05 机器清单覆盖扩展后的 183 条三方视觉证据', () => {
  assert.ok(fs.existsSync(a05ManifestPath), '缺少 A-05 机器可读证据清单');
  const manifest = JSON.parse(read(a05ManifestPath));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.capture?.referenceScale, '@1x');
  assert.equal(manifest.capture?.pageZoom, 1);
  assert.equal(manifest.capture?.deviceScaleFactor, 2);
  assert.equal(manifest.scenarios?.length, 183, 'A-05 清单必须覆盖 183 条场景');
  assert.equal(new Set(manifest.scenarios.map((item) => item.id)).size, 183, 'A-05 场景 ID 必须唯一');
  assert.equal(manifest.summary?.automaticPassed, 183, 'A-05 双库自动证据门禁必须覆盖全部场景');
  assert.equal(manifest.summary?.failed, 0, 'A-05 不得保留无明确依据的自动失败');
  assert.equal(manifest.summary?.requiredStateScreenshots, manifest.summary?.requiredStateTargets);
  assert.ok(manifest.summary?.stateScreenshots >= manifest.summary?.requiredStateScreenshots);
  assert.equal(
    manifest.summary?.passed + manifest.summary?.pendingReview + manifest.summary?.failed,
    183,
    'A-05 通过、待复核和失败场景总数必须保持 183',
  );
  const expectedVerdict = manifest.summary?.passed === 183 ? 'pass' : 'pending-review';
  assert.equal(manifest.verdict?.a05, expectedVerdict, 'A-05 结论必须与逐行人工视觉结果一致');
});

test('历史 A-05 场景均属于扩展后的源规范并包含双实现证据', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const sourceScenarioIds = new Set();
  for (const filePath of markdownFiles(componentFolders)) {
    for (const row of scenarioRows(read(filePath))) {
      sourceScenarioIds.add(row.match(/`(SCN-[A-Z0-9-]+-\d{2})`/u)?.[1]);
    }
  }
  for (const scenario of manifest.scenarios) {
    assert.ok(sourceScenarioIds.has(scenario.id), `A-05 清单存在未知场景：${scenario.id}`);
    assert.match(scenario.source, /^(?:components|forms|pickers)\/.+\.md$/u);
    assert.ok(scenario.componentId, `${scenario.id} 缺少组件视图 ID`);
    assert.ok(scenario.title, `${scenario.id} 缺少场景标题`);
    assert.ok(scenario.reference?.artboard, `${scenario.id} 缺少蓝湖画板`);
    assert.ok(scenario.reference?.crop, `${scenario.id} 缺少参考裁剪坐标`);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)), `${scenario.id} 缺少参考裁图`);
    for (const key of ['elementPlus', 'elementUi']) {
      const evidence = scenario.implementations?.[key];
      assert.ok(evidence?.route, `${scenario.id} ${key} 缺少稳定直达地址`);
      assert.ok(fs.existsSync(path.join(a05EvidenceRoot, evidence.screenshot)), `${scenario.id} ${key} 缺少实际裁图`);
      assert.ok(evidence.measurements?.geometry, `${scenario.id} ${key} 缺少几何实测`);
      assert.ok(Array.isArray(evidence.measurements?.colors), `${scenario.id} ${key} 缺少颜色实测`);
      assert.ok(Array.isArray(evidence.measurements?.texts), `${scenario.id} ${key} 缺少文案实测`);
      assert.ok(Array.isArray(evidence.measurements?.icons), `${scenario.id} ${key} 缺少图标实测`);
      assert.ok(evidence.measurements?.initialState, `${scenario.id} ${key} 缺少初始状态`);
      assert.ok(['pass', 'fail', 'pending-review'].includes(evidence.result), `${scenario.id} ${key} 子结论无效`);
    }
    assert.ok(Array.isArray(scenario.expected?.geometry), `${scenario.id} 缺少预期几何`);
    assert.ok(Array.isArray(scenario.expected?.colors), `${scenario.id} 缺少预期颜色`);
    assert.ok(Array.isArray(scenario.expected?.texts), `${scenario.id} 缺少预期文案`);
    assert.ok(Array.isArray(scenario.expected?.icons), `${scenario.id} 缺少预期图标`);
    assert.ok(Array.isArray(scenario.expected?.requiredStates), `${scenario.id} 缺少必要状态清单`);
    assert.ok(['pass', 'fail', 'pending-review'].includes(scenario.result), `${scenario.id} 总结论无效`);
  }
  assert.equal(sourceScenarioIds.size, 183);
});

test('A-05 人工验收矩阵逐行列出两套子结论且不夸大', () => {
  assert.ok(fs.existsSync(a05MatrixPath), '缺少 A-05 Markdown 验收矩阵');
  const matrix = read(a05MatrixPath);
  assert.equal((matrix.match(/^\| `SCN-[A-Z0-9-]+-\d{2}` \|/gmu) || []).length, 183);
  assert.match(matrix, /Element Plus/u);
  assert.match(matrix, /Element UI/u);
  assert.match(matrix, /参考裁图/u);
  assert.match(matrix, /通过|未通过/u);
  assert.match(matrix, /待视觉复核/u);
});

test('A-05 人工通过结论绑定当前三方证据指纹', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const manualReviewPath = path.join(a05EvidenceRoot, 'manual-review.json');
  assert.ok(fs.existsSync(manualReviewPath), '缺少 A-05 人工复核记录');
  const manualReview = JSON.parse(read(manualReviewPath));
  const approvedIds = Object.keys(manualReview.approvals || {});
  assert.ok(approvedIds.length > 0, '人工复核记录不得为空');
  assert.equal(manifest.summary?.passed, approvedIds.length, '通过数量必须与有效证据指纹数量一致');
  assert.equal(manifest.manualReview?.approvedScenarios, approvedIds.length);
  for (const scenarioId of approvedIds) {
    const scenario = manifest.scenarios.find((item) => item.id === scenarioId);
    assert.ok(scenario, `人工复核记录存在未知场景：${scenarioId}`);
    assert.equal(scenario.result, 'pass', `${scenarioId} 的当前证据指纹应当通过`);
    assert.equal(scenario.review?.evidenceFingerprint, manualReview.approvals[scenarioId]);
    for (const key of ['elementPlus', 'elementUi']) {
      assert.equal(scenario.implementations[key].evidenceChecks?.manualApproval, true);
      assert.equal(
        scenario.implementations[key].evidenceChecks?.evidenceFingerprint,
        manualReview.approvals[scenarioId],
      );
    }
  }
});

test('Cascader 多选证据同时包含弹层、半选和禁用项', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const scenario = manifest.scenarios.find((item) => item.id === 'SCN-CASCADER-03');
  assert.deepEqual(scenario.expected.requiredStates, ['Indeterminate', 'Disabled']);
  for (const key of ['elementPlus', 'elementUi']) {
    for (const state of ['Indeterminate', 'Disabled']) {
      const evidence = scenario.implementations[key].stateEvidence.find((item) => item.state === state);
      assert.ok(evidence, `${key} 缺少 ${state} 证据`);
      assert.ok(evidence.measurements?.initialState?.overlayCount > 0, `${key} ${state} 未记录真实弹层`);
      assert.ok(evidence.measurements?.initialState?.indeterminateCount > 0, `${key} ${state} 未记录父级半选`);
      assert.ok(evidence.measurements?.initialState?.disabledCount > 0, `${key} ${state} 未记录禁用子项`);
    }
  }
});

// AI-code-start lines:215 tool:Codex
test('两套证据模式移除侧栏列并按组件内容确定验收区域', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder, 'src');
    const app = read(path.join(root, 'App.vue'));
    const demo = read(path.join(root, 'ScenarioDemo.vue'));
    const theme = read(path.join(root, 'theme.css'));
    assert.match(theme, /\.validation-shell\.evidence-mode\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/su);
    assert.match(app, /:data-component-id="scenario\.componentId"/u);
    assert.match(app, /:evidence-mode="evidenceMode(?:\s*&&[^"]*)?"/u);
    assert.match(app, /:evidence-state="evidenceState"/u);
    assert.match(demo, /evidenceMode:\s*\{\s*type:\s*Boolean/u);
    assert.match(demo, /evidenceState:\s*\{\s*type:\s*String/u);
  }
});

test('双组件库核心场景使用蓝湖文案与完整变体数据', () => {
  for (const suite of libraryValidationSuites) {
    const demo = read(path.join(specRoot, suite.folder, 'src', 'ScenarioDemo.vue'));
    // AI-code-start lines:1 tool:Codex
    const scenarioSources = `${demo}\n${read(path.join(specRoot, suite.folder, 'src', 'PaginationProgress.vue'))}\n${read(path.join(specRoot, suite.folder, 'src', 'TransferUpload.vue'))}`;
    const theme = read(path.join(specRoot, suite.folder, 'src', 'theme.css'));
    const manifest = JSON.parse(read(path.join(specRoot, suite.folder, 'src', 'manifest.json')));
    for (const expected of ['comments', 'replies', '99+', 'New', 'Hot', '正确', 'Processing Center', 'Workspace', '6532', '100/page', '列表1', '列表2']) {
      assert.ok(scenarioSources.includes(expected), `${suite.label} 缺少蓝湖核心文案：${expected}`);
    }
    assert.match(demo, /Array\.from\(\{\s*length:\s*13\s*\}/u);
    assert.match(demo, /hostType:\s*'button'[\s\S]*hostType:\s*'text'[\s\S]*hostType:\s*'icon'/u);
    assert.match(demo, /switchBrand:\s*true[\s\S]*switchSuccess:\s*true/u);
    assert.match(demo, /'':\s*this\.index === 2 \? '朴素' : this\.index === 6 \? '按钮' : '默认'/u);
    assert.match(demo, /evidenceStateClass/u);
    assert.match(theme, /\.demo-button\.evidence-state-hover/u);
    assert.match(theme, /\.demo-button\.evidence-state-active/u);
    assert.match(theme, /\.el-checkbox\.is-bordered[\s\S]*\.el-checkbox__inner\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/u);
    const switchPreviews = manifest.scenarios
      .filter((item) => item.componentId === 'switch')
      .map((item) => item.preview);
    assert.deepEqual(switchPreviews, [
      '品牌橙开启态、成功绿开启态',
      '中性关闭态、成功绿开启态；轨道左右均有“左边文字 / 右边文字”',
      '禁用品牌橙开启态、禁用成功绿开启态',
    ]);
  }
});

test('第二批视觉确认完整覆盖 Radio、Input 与 InputNumber 的蓝湖场景', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const reviewedComponents = new Set(['radio', 'input', 'input-number']);
  const scenarios = manifest.scenarios.filter((item) => reviewedComponents.has(item.componentId));
  assert.equal(scenarios.length, 19);
  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 尚未绑定当前三方视觉证据`);
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.evidenceChecks?.automaticResult, 'pass');
      assert.equal(implementation.evidenceChecks?.manualApproval, true);
      assert.equal(implementation.evidenceChecks?.missingStates.length, 0);
    }
  }

  const getScenario = (id) => manifest.scenarios.find((item) => item.id === id);
  for (const key of ['elementPlus', 'elementUi']) {
    const radioMatrix = getScenario('SCN-RADIO-04').implementations[key].measurements;
    assert.equal(
      radioMatrix.geometry.controls.filter((item) => String(item.className).includes('el-radio-button__inner')).length,
      108,
      `${key} 的 Radio 按钮状态矩阵不完整`,
    );

    const password = getScenario('SCN-INPUT-04').implementations[key].measurements;
    assert.equal(
      password.geometry.controls.filter((item) => String(item.className).split(' ').includes('el-input')).length,
      2,
      `${key} 未同时展示密码密文和明文`,
    );
    const inputIcons = getScenario('SCN-INPUT-05').implementations[key].measurements;
    assert.equal(
      inputIcons.geometry.controls.filter((item) => String(item.className).split(' ').includes('el-input')).length,
      4,
      `${key} 未覆盖搜索、日历及两种聚焦态`,
    );
    const compound = getScenario('SCN-INPUT-07').implementations[key].measurements;
    assert.equal(
      compound.geometry.controls.filter((item) => String(item.className).split(' ').includes('el-input')).length,
      2,
      `${key} 未分别展示前置和后置文案`,
    );
    const autocomplete = getScenario('SCN-INPUT-09').implementations[key].measurements;
    assert.ok(autocomplete.initialState.overlayCount > 0, `${key} 的输入建议面板未展开`);
    assert.ok(autocomplete.texts.includes('选项 5'), `${key} 的五项输入建议不完整`);
    assert.ok(autocomplete.colors.includes('rgb(255, 96, 20)'), `${key} 的建议选中项缺少品牌色`);
    const limits = getScenario('SCN-INPUT-10').implementations[key].measurements;
    assert.ok(limits.texts.includes('0/10'));
    assert.ok(limits.texts.includes('0/200'));

    const numberSizes = getScenario('SCN-INPUT-NUMBER-04').implementations[key].measurements;
    const numberRoots = numberSizes.geometry.controls
      .filter((item) => String(item.className).split(' ').includes('el-input-number'))
      .map((item) => `${item.width}x${item.height}`);
    assert.deepEqual(numberRoots, ['180x40', '150x32', '120x24']);
    for (const width of [48, 34, 24]) {
      assert.ok(
        numberSizes.geometry.controls.some((item) => (
          String(item.className).includes('el-input-number__decrease') && item.width === width
        )),
        `${key} 的计数器缺少 ${width}px 控制区`,
      );
    }
  }
});

test('第二批组件源码保留清空、密码、建议弹层与精度契约', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder, 'src');
    const demo = read(path.join(root, 'ScenarioDemo.vue'));
    const theme = read(path.join(root, 'theme.css'));
    assert.match(demo, /visibility-off-28-neutral\.png/u);
    assert.match(demo, /input-clear-example/u);
    assert.match(demo, /'选项 1', '选项 2', '选项 3', '选项 4', '选项 5'/u);
    assert.match(demo, /:precision="2"/u);
    assert.match(theme, /\.input-suggestion-panel\s*\{[^}]*width:\s*240px\s*!important;/su);
    for (const width of [180, 150, 120]) {
      assert.match(theme, new RegExp(`\\.demo-input-number[\\s\\S]*width:\\s*${width}px;`, 'u'));
    }
  }
});

test('第三批视觉确认完整覆盖 Select、Cascader、ColorPicker 与 Menu', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const reviewedComponents = new Set(['select', 'cascader', 'color-picker', 'menu']);
  const scenarios = manifest.scenarios.filter((item) => reviewedComponents.has(item.componentId));
  assert.equal(scenarios.length, 20);
  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 尚未绑定当前三方视觉证据`);
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.evidenceChecks?.automaticResult, 'pass');
      assert.equal(implementation.evidenceChecks?.manualApproval, true);
      assert.equal(implementation.evidenceChecks?.missingStates.length, 0);
    }
  }
});

test('第三批证据保留双 Select、完整级联矩阵、14 色面板和双层菜单', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const getScenario = (id) => manifest.scenarios.find((item) => item.id === id);
  for (const key of ['elementPlus', 'elementUi']) {
    const selectMultiple = getScenario('SCN-SELECT-05').implementations[key].measurements;
    assert.equal(selectMultiple.initialState.overlayCount, 2);
    assert.equal(selectMultiple.initialState.optionCount, 10);
    assert.equal(
      selectMultiple.geometry.controls.filter((item) => String(item.className).split(' ').includes('el-select')).length,
      2,
    );

    const selectGrouped = getScenario('SCN-SELECT-07').implementations[key].measurements;
    assert.equal(selectGrouped.initialState.overlayCount, 2);
    assert.equal(selectGrouped.initialState.optionCount, 14);
    assert.ok(selectGrouped.texts.includes('热门城市'));
    assert.ok(selectGrouped.texts.includes('大连'));

    const selectFiltered = getScenario('SCN-SELECT-08').implementations[key].measurements;
    assert.equal(selectFiltered.initialState.overlayCount, 2);
    assert.equal(selectFiltered.initialState.optionCount, 6);
    const remote = getScenario('SCN-SELECT-09').implementations[key];
    for (const [state, expectedText] of [['Loading', '加载中'], ['Error', '加载失败，请重试']]) {
      const evidence = remote.stateEvidence.find((item) => item.state === state);
      assert.ok(evidence.measurements.initialState.overlayCount > 0);
      assert.ok(evidence.measurements.texts.includes(expectedText));
    }

    for (const id of ['SCN-CASCADER-01', 'SCN-CASCADER-02', 'SCN-CASCADER-03', 'SCN-CASCADER-04']) {
      const cascader = getScenario(id).implementations[key].measurements;
      assert.equal(cascader.initialState.overlayCount, 1);
      assert.equal(cascader.initialState.cascaderNodeCount, 22);
    }
    const cascaderMultiple = getScenario('SCN-CASCADER-03').implementations[key].measurements;
    assert.ok(cascaderMultiple.initialState.indeterminateCount > 0);
    assert.ok(cascaderMultiple.initialState.disabledCount > 0);

    const colorPanel = getScenario('SCN-COLOR-PICKER-03').implementations[key].measurements;
    assert.equal(colorPanel.initialState.colorSwatchCount, 14);
    const panelRoot = colorPanel.geometry.controls.find((item) => String(item.className).includes('el-color-picker__panel'));
    assert.equal(panelRoot?.width, 317);
    const colorSizes = getScenario('SCN-COLOR-PICKER-04').implementations[key].measurements.geometry.controls
      .filter((item) => String(item.className).split(' ').includes('el-color-picker'))
      .map((item) => `${item.width}x${item.height}`);
    assert.deepEqual(colorSizes, ['40x40', '32x32', '24x24']);

    const topMenu = getScenario('SCN-MENU-01').implementations[key].measurements.geometry.controls
      .find((item) => String(item.className).includes('el-menu--horizontal'));
    assert.equal(`${topMenu?.width}x${topMenu?.height}`, '690x64');
    const dropdownMenus = getScenario('SCN-MENU-02').implementations[key].measurements.geometry.controls
      .filter((item) => String(item.className).includes('el-menu--popup'));
    assert.equal(dropdownMenus.length, 2);
    assert.ok(dropdownMenus.every((item) => item.width === 200));
    const sideMenu = getScenario('SCN-MENU-03').implementations[key].measurements;
    assert.ok(sideMenu.initialState.disabledCount > 0);
    assert.ok(sideMenu.initialState.selectedCount > 0);
  }
});

test('第三批组件源码保留多状态结构和证据展开顺序', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder, 'src');
    const demo = read(path.join(root, 'ScenarioDemo.vue'));
    const theme = read(path.join(root, 'theme.css'));
    assert.match(demo, /select-variant-pair/u);
    assert.match(demo, /Array\.from\(\{\s*length:\s*10\s*\}/u);
    assert.match(demo, /Array\.from\(\{\s*length:\s*12\s*\}/u);
    assert.match(demo, /'rgba\(245, 49, 157, 0\.5\)'/u);
    assert.match(demo, /setTimeout\(\(\) => this\.\$refs\.evidenceMenu\?\.open\?\.\('2-3'\), 160\)/u);
    assert.match(theme, /\.select-variant-pair\s*\{[^}]*gap:\s*48px;/su);
    assert.match(theme, /\.el-cascader__dropdown \.el-cascader-menu\s*\{[^}]*width:\s*180px;[^}]*height:\s*400px;/su);
    assert.match(theme, /\.el-menu--popup \.el-menu-item[\s\S]*height:\s*40px\s*!important;/u);
  }
});

// AI-code-start lines:130 tool:Codex
test('第四批视觉确认完整覆盖 Collapse、Dialog 应用建议与 Dialog', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const reviewedComponents = new Set(['collapse', 'dialog-usage', 'dialog']);
  const scenarios = manifest.scenarios.filter((item) => reviewedComponents.has(item.componentId));
  assert.equal(scenarios.length, 16);
  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 尚未绑定当前三方视觉证据`);
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.evidenceChecks?.automaticResult, 'pass');
      assert.equal(implementation.evidenceChecks?.manualApproval, true);
      assert.equal(implementation.evidenceChecks?.missingStates.length, 0);
    }
  }
});

test('第四批折叠面板证据保留 870px 内容区、48px 行高与完整状态', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const getScenario = (id) => manifest.scenarios.find((item) => item.id === id);
  for (const key of ['elementPlus', 'elementUi']) {
    const collapsed = getScenario('SCN-COLLAPSE-01').implementations[key].measurements;
    assert.deepEqual(collapsed.geometry.region, { height: 245, width: 950 });
    assert.equal(collapsed.metrics.activeCollapseItems, 0);
    assert.equal(collapsed.metrics.headerRects.length, 4);
    assert.ok(collapsed.metrics.headerRects.every((item) => item.width === 870 && item.height === 48));

    for (const id of ['SCN-COLLAPSE-02', 'SCN-COLLAPSE-03']) {
      const expanded = getScenario(id).implementations[key].measurements;
      assert.deepEqual(expanded.geometry.region, { height: 310, width: 950 });
      assert.equal(expanded.metrics.activeCollapseItems, 1);
      assert.ok(expanded.texts.includes('一致性 Consistency'));
      assert.ok(expanded.texts.some((text) => text.startsWith('与现实生活一致：')));
      assert.ok(expanded.texts.some((text) => text.startsWith('在界面中一致：')));
    }
    assert.equal(getScenario('SCN-COLLAPSE-03').implementations[key].measurements.metrics.infoIconCount, 1);

    const secondScene = getScenario('SCN-COLLAPSE-02').implementations[key];
    assert.deepEqual(secondScene.stateEvidence.map((item) => item.state), ['Expanded', 'Collapsed']);
    assert.equal(secondScene.stateEvidence[0].measurements.metrics.activeCollapseItems, 1);
    assert.equal(secondScene.stateEvidence[1].measurements.metrics.activeCollapseItems, 0);
  }
});

test('第四批 Dialog 应用建议证据覆盖所有宽度档位、双弹窗和 80% 场景', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const getScenario = (id) => manifest.scenarios.find((item) => item.id === id);
  const expectedRegions = {
    'SCN-DIALOG-USAGE-01': { height: 204, width: 480 },
    'SCN-DIALOG-USAGE-02': { height: 360, width: 904 },
    'SCN-DIALOG-USAGE-03': { height: 360, width: 1008 },
    'SCN-DIALOG-USAGE-04': { height: 360, width: 720 },
    'SCN-DIALOG-USAGE-05': { height: 360, width: 960 },
    'SCN-DIALOG-USAGE-06': { height: 360, width: 1232 },
    'SCN-DIALOG-USAGE-07': { height: 540, width: 1536 },
  };
  for (const key of ['elementPlus', 'elementUi']) {
    for (const [id, region] of Object.entries(expectedRegions)) {
      assert.deepEqual(getScenario(id).implementations[key].measurements.geometry.region, region, `${key} ${id}`);
    }

    const fullForm = getScenario('SCN-DIALOG-USAGE-02').implementations[key].measurements;
    assert.equal(fullForm.metrics.formItems, 8);
    assert.ok(fullForm.texts.includes('请输入'));
    assert.ok(fullForm.texts.includes('请选择'));
    assert.ok(fullForm.texts.includes('选择日期'));

    const dual = getScenario('SCN-DIALOG-USAGE-03').implementations[key].measurements;
    assert.equal(dual.metrics.visibleRootCount, 2);
    assert.deepEqual(dual.metrics.dialogRects.map((item) => `${item.width}x${item.height}`), ['480x360', '480x204']);
    assert.ok(dual.texts.includes('详细描述文字'));

    const dynamic = getScenario('SCN-DIALOG-USAGE-07').implementations[key].measurements;
    assert.equal(dynamic.metrics.footerButtons, 0);
    for (const text of ['创建日期', '供应商名称', '查询', '重置', '选择日期', '选择时间', '请输入']) {
      assert.ok(dynamic.texts.includes(text), `${key} 的 80% 弹窗缺少 ${text}`);
    }
  }
});

test('第四批标准 Dialog 证据覆盖左对齐、居中、表单和表格结构', () => {
  const manifest = JSON.parse(read(a05ManifestPath));
  const getScenario = (id) => manifest.scenarios.find((item) => item.id === id);
  const expectedRegions = {
    'SCN-DIALOG-01': { height: 204, width: 480 },
    'SCN-DIALOG-02': { height: 277, width: 720 },
    'SCN-DIALOG-03': { height: 336, width: 720 },
    'SCN-DIALOG-04': { height: 198, width: 480 },
    'SCN-DIALOG-05': { height: 310, width: 720 },
    'SCN-DIALOG-06': { height: 352, width: 720 },
  };
  for (const key of ['elementPlus', 'elementUi']) {
    for (const [id, region] of Object.entries(expectedRegions)) {
      assert.deepEqual(getScenario(id).implementations[key].measurements.geometry.region, region, `${key} ${id}`);
    }
    for (const id of ['SCN-DIALOG-02', 'SCN-DIALOG-05']) {
      const formDialog = getScenario(id).implementations[key].measurements;
      assert.equal(formDialog.metrics.formItems, 4);
      for (const text of ['活动名称', '活动日期', '活动区域', '活动资源']) {
        assert.ok(formDialog.texts.includes(text));
      }
    }
    for (const id of ['SCN-DIALOG-03', 'SCN-DIALOG-06']) {
      const tableDialog = getScenario(id).implementations[key].measurements;
      assert.equal(tableDialog.metrics.tableRows, 4);
      assert.equal(tableDialog.metrics.tableColumns, 3);
      assert.equal(tableDialog.metrics.footerButtons, 0);
      assert.ok(tableDialog.texts.includes('Shipping address'));
      assert.ok(tableDialog.texts.includes('2016-05-01'));
    }
  }
});

test('第四批组件源码保留真实双库弹窗、双实例与尺寸契约', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder, 'src');
    const demo = read(path.join(root, 'ScenarioDemo.vue'));
    const theme = read(path.join(root, 'theme.css'));
    assert.match(demo, /secondaryDialogVisible/u);
    assert.match(demo, /v-model="dialogTimeValue"\s+placeholder="选择时间"/u);
    assert.match(demo, /dialogKind === 'dynamic'/u);
    assert.match(demo, /dialogKind === 'table'/u);
    assert.match(demo, /InfoFilled|el-icon-info/u);
    assert.match(theme, /\.demo-collapse\s*\{[^}]*width:\s*950px;[^}]*padding:\s*8px 40px 44px;/su);
    assert.match(theme, /\.demo-collapse \.el-collapse-item__header\s*\{[^}]*height:\s*48px;/su);
    assert.match(theme, /\.dialog-panel--simple\s*\{[^}]*height:\s*204px;/su);
    assert.match(theme, /\.dialog-panel--usage-form\s*\{[^}]*height:\s*360px;/su);
    assert.match(theme, /\.dialog-panel--dynamic\s*\{[^}]*height:\s*540px;/su);
    assert.match(theme, /\.dialog-panel\.is-centered-layout \.el-dialog__header,/u);
  }
});

// AI-code-start lines:228 tool:Codex
test('Table 规范完整覆盖四张画板和 24 条唯一场景', () => {
  const tablePath = path.join(specRoot, 'components', 'table.md');
  const content = read(tablePath);
  const metadata = section(content, '规范元数据');
  assert.match(metadata, /\| 画板数量 \| `4` \|/u);
  assert.match(metadata, /\| 画板场景 \| `24` 条；计入扩展后全库 `183` 条场景 \|/u);
  for (const artboard of [
    'Table 表格',
    '经典表格页案例/中',
    '经典表格页案例/大',
    '经典表格页案例/小',
  ]) {
    assert.ok(metadata.includes(artboard), `Table 元数据缺少画板：${artboard}`);
  }
  const rows = scenarioRows(content);
  const ids = rows.map((row) => row.match(/`(SCN-TABLE-\d{2})`/u)?.[1]);
  assert.equal(rows.length, 24);
  assert.deepEqual(ids, Array.from({ length: 24 }, (_, index) => `SCN-TABLE-${String(index + 1).padStart(2, '0')}`));
});

test('Table 规范记录显式尺寸、颜色和三档经典页面布局', () => {
  const content = read(path.join(specRoot, 'components', 'table.md'));
  for (const expected of [
    '`40px` 表头/行高',
    '单元格水平内边距',
    '`#F5F7FA`',
    '`#FAFAFA`',
    '`#FCF6EC`',
    '`#E8FFEA`',
    '`#FDF4EE`',
    '`#FF6014`',
    '`#FFECE8`',
    '`#F0F2F5`',
    '`1280px × 800px`',
    '`1440px × 900px`',
    '`1920px × 1080px`',
    '`24px / 32px / 40px`',
    '`32px / 40px / 48px`',
    '200px',
    '16px',
  ]) {
    assert.ok(content.includes(expected), `Table 规范缺少显式值：${expected}`);
  }
  assert.match(content, /Table 表头.*`#F5F7FA`.*相近 Token `#F5F7FB`/su);
});

test('Table 规范覆盖复杂能力、必要状态和图标替换边界', () => {
  const content = read(path.join(specRoot, 'components', 'table.md'));
  for (const expected of [
    '固定表头',
    '固定列和表头',
    '流体高度',
    '多级表头',
    '单选',
    '多选',
    '排序',
    '筛选',
    '自定义列模板',
    '自定义表头',
    '展开行',
    '树形数据与懒加载',
    '表尾合计行',
    '合并行或列',
    '表格布局',
    'Loading',
    'Empty',
    'Error',
    '蓝湖未提供独立资产',
    'chevron-down-24-neutral.png',
  ]) {
    assert.ok(content.includes(expected), `Table 规范缺少能力或状态：${expected}`);
  }
  assert.match(content, /“自定义索引”.*重复[\s\S]*只建立 `SCN-TABLE-20` 一条规范场景/u);
});

test('Table 四张原始参考画板已本地保存并写入清单', () => {
  const referenceRoot = path.join(specRoot, 'validation-evidence', 'reference');
  const expectedFiles = [
    '30-table.png',
    '31-table-page-medium.webp',
    '32-table-page-large.webp',
    '33-table-page-small.webp',
  ];
  for (const name of expectedFiles) {
    const filePath = path.join(referenceRoot, name);
    assert.ok(fs.existsSync(filePath), `缺少 Table 参考画板：${name}`);
    assert.ok(fs.statSync(filePath).size > 0, `Table 参考画板为空：${name}`);
  }
  const base = fs.readFileSync(path.join(referenceRoot, '30-table.png'));
  assert.equal(base.readUInt32BE(16), 927);
  assert.equal(base.readUInt32BE(20), 21269);
  const manifest = read(path.join(specRoot, 'validation-evidence', 'reference-manifest.md'));
  for (const name of expectedFiles) assert.ok(manifest.includes(name), `参考清单缺少 ${name}`);
});

test('Table 24 条场景在双组件库中真实实现并通过逐场景视觉验收', () => {
  const evidence = JSON.parse(read(a05ManifestPath));
  const tableIds = Array.from(
    { length: 24 },
    (_, index) => `SCN-TABLE-${String(index + 1).padStart(2, '0')}`,
  );
  const tableScenarios = evidence.scenarios.filter((item) => item.id.startsWith('SCN-TABLE-'));
  assert.deepEqual(tableScenarios.map((item) => item.id), tableIds);

  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder);
    const source = read(path.join(root, 'src', 'TableScenario.vue'));
    const theme = read(path.join(root, 'src', 'theme.css'));
    const manifest = JSON.parse(read(path.join(root, 'src', 'manifest.json')));
    const manifestTableIds = manifest.scenarios
      .filter((item) => item.componentId === 'table')
      .map((item) => item.id);
    assert.match(source, /<el-table/u, `${suite.label} 未使用真实表格组件`);
    assert.match(source, /lazy/u, `${suite.label} 缺少懒加载树形表格`);
    assert.doesNotMatch(
      source,
      /<(?:input|button|select|textarea)(?:\s|>)/u,
      `${suite.label} Table 不得退回原生表单控件`,
    );
    assert.deepEqual(manifestTableIds, tableIds, `${suite.label} Table 场景清单不完整`);
    assert.match(
      theme,
      /\.scene-grid\[data-component-view="table"\]\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/su,
      `${suite.label} Table 普通验收页未退回单列`,
    );
    assert.match(
      theme,
      /\.validation-shell:not\(\.evidence-mode\)[^{]+\.scenario-demo\s*\{[^}]*overflow-x:\s*auto;/su,
      `${suite.label} Table 超宽组件未约束在场景卡片内`,
    );
    assert.match(
      source,
      /classicPreviewStyle\(\)[\s\S]+Math\.min\(1,\s*availableWidth\s*\/\s*width\)[\s\S]+new ResizeObserver\(syncPreviewWidth\)/u,
      `${suite.label} 经典页面未按卡片实际宽度计算预览比例`,
    );
    assert.match(
      theme,
      /\.validation-shell:not\(\.evidence-mode\)\s+\.classic-preview-shell\s*\{[^}]*height:\s*var\(--classic-preview-height\);[^}]*overflow:\s*hidden;/su,
      `${suite.label} 经典页面预览容器未收敛缩放高度或隐藏越界`,
    );
    assert.match(
      theme,
      /\.validation-shell:not\(\.evidence-mode\)[^{]+\.classic-table-page\s*\{[^}]*transform:\s*scale\(var\(--classic-preview-scale\)\);/su,
      `${suite.label} 经典页面普通预览未等比缩放`,
    );
    assert.match(
      theme,
      /\.evidence-mode\s+\.classic-preview-shell\s*\{[^}]*overflow:\s*visible;/su,
      `${suite.label} 经典页面证据模式未保持原尺寸边界`,
    );
    assert.match(
      theme,
      /\.classic-workspace\s*\{[^}]*background:\s*#CACCCF;/su,
      `${suite.label} 经典页面工作区背景错误`,
    );
  }

  for (const scenario of tableScenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 应通过三方视觉验收`);
    assert.ok(
      fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)),
      `${scenario.id} 缺少蓝湖参考裁图`,
    );
    assert.ok(
      fs.existsSync(path.join(a05EvidenceRoot, 'diff', `${scenario.id}-comparison.png`)),
      `${scenario.id} 缺少三方对照图`,
    );
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.result, 'pass', `${scenario.id} ${key} 自动证据未通过`);
      assert.equal(
        implementation.evidenceChecks.manualApproval,
        true,
        `${scenario.id} ${key} 缺少人工视觉批准`,
      );
      assert.ok(
        fs.existsSync(path.join(a05EvidenceRoot, implementation.screenshot)),
        `${scenario.id} ${key} 缺少实际裁图`,
      );
    }
  }

  const basic = tableScenarios[0];
  for (const key of ['elementPlus', 'elementUi']) {
    const metrics = basic.implementations[key].measurements.geometry.tableMetrics;
    assert.deepEqual(metrics.headerHeights, [40]);
    assert.ok(metrics.rowHeights.includes(40));
    assert.equal(metrics.cellCss.fontSize, '14px');
    assert.equal(metrics.cellCss.lineHeight, '20px');
    assert.equal(metrics.cellCss.paddingLeft, '12px');
    assert.equal(metrics.cellCss.paddingRight, '12px');
  }

  const densityExpectations = {
    'SCN-TABLE-22': { cards: [[216, 192, 1048, 112], [216, 320, 1048, 464]], row: 32 },
    'SCN-TABLE-23': { cards: [[216, 192, 1208, 139], [216, 347, 1208, 537]], row: 40 },
    'SCN-TABLE-24': { cards: [[216, 192, 1688, 152], [216, 360, 1688, 704]], row: 48 },
  };
  for (const [scenarioId, expected] of Object.entries(densityExpectations)) {
    const scenario = tableScenarios.find((item) => item.id === scenarioId);
    const referencePng = fs.readFileSync(path.join(a05EvidenceRoot, scenario.reference.file));
    assert.equal(referencePng.readUInt8(25), 2, `${scenarioId} 参考图仍保留未合成的透明通道`);
    for (const key of ['elementPlus', 'elementUi']) {
      const metrics = scenario.implementations[key].measurements.geometry.tableMetrics;
      assert.ok(
        scenario.implementations[key].measurements.colors.includes('rgb(202, 204, 207)'),
        `${scenarioId} ${key} 未实测到蓝湖工作区可见合成色`,
      );
      assert.deepEqual(
        metrics.cards.map(({ x, y, width, height }) => [x, y, width, height]),
        expected.cards,
        `${scenarioId} ${key} 卡片几何不符合蓝湖`,
      );
      assert.deepEqual(metrics.headerHeights, [expected.row]);
      assert.ok(
        metrics.rowHeights.some((height) => Math.abs(height - expected.row) <= 1),
        `${scenarioId} ${key} 行高超出 ±1px`,
      );
    }
  }

  const filterScene = tableScenarios.find((item) => item.id === 'SCN-TABLE-13');
  for (const key of ['elementPlus', 'elementUi']) {
    const openState = filterScene.implementations[key].stateEvidence.find((item) => item.state === 'Open');
    assert.ok(openState, `SCN-TABLE-13 ${key} 缺少筛选打开态`);
    assert.ok(openState.measurements.initialState.overlayCount > 0, `SCN-TABLE-13 ${key} 未打开真实弹层`);
  }
});

// AI-code-start lines:44 tool:Codex
test('经典 Table 页面忠实还原蓝湖结构、数据、操作列和分页', () => {
  for (const suite of libraryValidationSuites) {
    const root = path.join(specRoot, suite.folder);
    const source = read(path.join(root, 'src', 'TableScenario.vue'));
    const theme = read(path.join(root, 'src', 'theme.css'));
    const classicTableTag = source.match(/<el-table\s+class="classic-data-table"[\s\S]*?>/u)?.[0] || '';
    const classicRowsBlock = source.match(/classicRows:\s*\[([\s\S]*?)\n\s*\],\n\s*singleSelected/u)?.[1] || '';

    for (const text of [
      '基础表格页',
      '表格页用于展示多条结构类似的数据，可对数据进行排序、筛选、对比或其他自定义操作。',
      'label="姓名"',
      'label="完成进度"',
      'placeholder="选择日期"',
      'placeholder="请输入"',
      'No. 189, Grove St, Los Angeles',
    ]) {
      assert.ok(source.includes(text), `${suite.label} 经典页面缺少蓝湖内容：${text}`);
    }

    assert.ok(classicTableTag, `${suite.label} 缺少经典真实 el-table`);
    assert.doesNotMatch(classicTableTag, /\sborder(?:\s|>|=)/u, `${suite.label} 经典表格不应显示纵向边框`);
    assert.equal(
      [...classicRowsBlock.matchAll(/\{\s*id:\s*\d+/gu)].length,
      9,
      `${suite.label} 经典页面必须展示 9 行蓝湖示例数据`,
    );
    assert.match(source, /currentPage:\s*1/u, `${suite.label} 经典分页当前页必须为 1`);
    assert.doesNotMatch(source, /layout="[^"]*jumper/u, `${suite.label} 经典分页不得显示跳页输入`);
    assert.match(source, /class="classic-action-link"[^>]*>详情<\/el-button>/u);
    assert.match(source, /class="classic-action-link"[^>]*>编辑<\/el-button>/u);
    assert.match(source, /class="classic-action-link"[^>]*>删除<\/el-button>/u);
    assert.match(
      theme,
      /\.classic-action-link\.el-button[\s\S]*?color:\s*#FF6014;[\s\S]*?background:\s*transparent;[\s\S]*?border:\s*0;/u,
      `${suite.label} 操作列必须为无背景、无边框的品牌色文字`,
    );
    assert.match(
      theme,
      /\.classic-data-table[\s\S]*?border-right:\s*0[\s\S]*?border-left:\s*0/u,
      `${suite.label} 经典表格必须移除纵向列线`,
    );
  }
});

// AI-code-start lines:80 tool:Codex
test('高频 32px 集合的 18 个完整状态组通过双组件库视觉验收', () => {
  const content = read(path.join(specRoot, 'components', 'frequent-components-32.md'));
  for (const expected of [
    '共 4 个“按钮”',
    '左侧未选、右侧选中',
    '第 1 项选中',
    '两个输入框均为 `240px × 32px`',
    '两个触发器均为 `240px × 32px`',
    '`2021-05-06`',
    '数值 `1.00`',
    '两个轨道均为 `40px × 20px`',
    '只能上传jpg/png文件，且不超过500kb',
    '共6532条 / 10条/页 / 前往 2 页',
    '默认 / 成功 / 信息 / 警告 / 错误',
    'Top Center 提示文字',
    '这是一段内容，确定要删除吗？',
  ]) {
    assert.ok(content.includes(expected), `高频 32px 规范缺少可见组合：${expected}`);
  }
  assert.match(content, /表单组件 \/ 表格组件 \/ 其他组件.*不属于任何组件实例/u);

  const evidence = JSON.parse(read(a05ManifestPath));
  const scenarios = evidence.scenarios.filter((item) => item.componentId === 'frequent-components-32');
  assert.equal(scenarios.length, 18);

  for (const suite of libraryValidationSuites) {
    const source = read(path.join(specRoot, suite.folder, 'src', 'FrequentComponents32.vue'));
    for (const component of [
      'el-button',
      'el-radio',
      'el-checkbox',
      'el-input',
      'el-select',
      'el-date-picker',
      'el-input-number',
      'el-switch',
      'el-upload',
      'el-table',
      'el-pagination',
      'el-tag',
      'el-tabs',
      'el-alert',
      'el-dialog',
      'el-tooltip',
      'el-popconfirm',
    ]) {
      assert.ok(source.includes(`<${component}`), `${suite.label} 高频集合缺少真实 ${component}`);
    }
    assert.doesNotMatch(source, /<(?:input|button|select|textarea)(?:\s|>)/u);
    assert.match(source, /共6532条/u);
    assert.match(source, /pageSize:\s*10/u);
    assert.match(source, /popper-class="frequent-popconfirm-popper"/u);
  }

  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 应通过三方视觉验收`);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)));
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.comparison.file)));
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.result, 'pass', `${scenario.id} ${key} 自动证据未通过`);
      assert.equal(implementation.evidenceChecks.manualApproval, true);
      assert.ok(fs.existsSync(path.join(a05EvidenceRoot, implementation.screenshot)));
    }
  }

  const button = scenarios.find((item) => item.id === 'SCN-FREQUENT-32-01');
  const pagination = scenarios.find((item) => item.id === 'SCN-FREQUENT-32-12');
  const popconfirm = scenarios.find((item) => item.id === 'SCN-FREQUENT-32-18');
  for (const key of ['elementPlus', 'elementUi']) {
    const buttons = button.implementations[key].measurements.geometry.controls.filter(
      (item) => item.tag === 'button',
    );
    assert.deepEqual(buttons.map(({ width, height }) => [width, height]), Array(4).fill([60, 32]));
    assert.ok(pagination.implementations[key].measurements.texts.includes('共6532条'));
    assert.ok(pagination.implementations[key].measurements.texts.includes('5'));
    assert.equal(popconfirm.implementations[key].measurements.initialState.overlayCount, 1);
    assert.match(popconfirm.implementations[key].measurements.texts.join(''), /确定/u);
  }
});

// AI-code-start lines:86 tool:Codex
test('Pagination 与 Progress 的 15 个完整场景通过双组件库视觉验收', () => {
  const paginationDoc = read(path.join(specRoot, 'components', 'pagination.md'));
  const progressDoc = read(path.join(specRoot, 'components', 'progress.md'));
  for (const expected of [
    '必须一次展示上述 `7` 行完整组合',
    '必须一次展示 `14` 行',
    '`100/page`',
    '“前往 2 页”',
    '`#F5F6F8`',
  ]) {
    assert.ok(paginationDoc.includes(expected), `Pagination 规范缺少可见组合：${expected}`);
  }
  for (const expected of [
    '从上到下 `5` 条',
    '从上到下 `4` 条',
    '三条均为 `20%`',
    '从左到右 `5` 个 `120px × 120px` 圆环',
    '空轨道、品牌橙 `25%`、成功满环、警告满环、异常满环',
  ]) {
    assert.ok(progressDoc.includes(expected), `Progress 规范缺少可见组合：${expected}`);
  }

  const evidence = JSON.parse(read(a05ManifestPath));
  const scenarios = evidence.scenarios.filter(
    (item) => item.componentId === 'pagination' || item.componentId === 'progress',
  );
  assert.equal(scenarios.length, 15);

  for (const suite of libraryValidationSuites) {
    const source = read(path.join(specRoot, suite.folder, 'src', 'PaginationProgress.vue'));
    for (const component of [
      'el-pagination',
      'el-select',
      'el-input',
      'el-progress',
      'el-button-group',
    ]) {
      assert.ok(source.includes(`<${component}`), `${suite.label} 缺少真实 ${component}`);
    }
    assert.doesNotMatch(source, /<(?:input|button|select|progress)(?:\s|>)/u);
    assert.ok(source.includes("'#FF6014', '#999999', '#E6A23C'"));
    assert.match(source, /:show-text="itemIndex !== 0"/u);
  }

  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 应通过三方视觉验收`);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)));
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.comparison.file)));
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.result, 'pass', `${scenario.id} ${key} 自动证据未通过`);
      assert.equal(implementation.evidenceChecks.manualApproval, true);
      assert.ok(fs.existsSync(path.join(a05EvidenceRoot, implementation.screenshot)));
    }
  }

  const paginationCounts = {
    'SCN-PAGINATION-08': 7,
    'SCN-PAGINATION-09': 7,
    'SCN-PAGINATION-10': 14,
  };
  const progressCounts = {
    'SCN-PROGRESS-01': 5,
    'SCN-PROGRESS-02': 4,
    'SCN-PROGRESS-03': 3,
    'SCN-PROGRESS-04': 5,
    'SCN-PROGRESS-05': 4,
  };
  for (const key of ['elementPlus', 'elementUi']) {
    for (const [scenarioId, count] of Object.entries(paginationCounts)) {
      const measurements = scenarios.find((item) => item.id === scenarioId).implementations[key].measurements;
      assert.equal(measurements.metrics.paginationComponents, count, `${scenarioId} ${key} 分页行数错误`);
      const farthestControl = Math.max(
        ...measurements.geometry.controls.map((item) => item.x + item.width),
      );
      assert.ok(
        farthestControl <= measurements.geometry.rootRegion.width + 1,
        `${scenarioId} ${key} 存在横向越界`,
      );
    }
    for (const [scenarioId, count] of Object.entries(progressCounts)) {
      const measurements = scenarios.find((item) => item.id === scenarioId).implementations[key].measurements;
      assert.equal(measurements.metrics.progressComponents, count, `${scenarioId} ${key} 进度实例数错误`);
    }
  }
});

// AI-code-start lines:111 tool:Codex
test('Transfer 与 Upload 的 13 个场景通过双组件库视觉验收', () => {
  const transferDoc = read(path.join(specRoot, 'components', 'transfer.md'));
  const uploadDoc = read(path.join(specRoot, 'components', 'upload.md'));
  for (const expected of [
    '每个场景都必须同时渲染左右两个完整面板',
    '初始计数固定为 `0/13`',
    '`160px × 32px`',
    '`46px × 24px`',
    '左移按钮为“图标 → 按钮”',
    '右移按钮为“按钮 → 图标”',
  ]) {
    assert.ok(transferDoc.includes(expected), `Transfer 规范缺少可见规则：${expected}`);
  }
  for (const expected of [
    '`148px × 148px`',
    '`360px × 88px`',
    '`360px × 180px`',
    '只能上传jpg/png文件，且不超过500kb',
    '画板不展示额外“提交”或“上传到服务器”按钮',
    '这是附件的文件名.jpg',
  ]) {
    assert.ok(uploadDoc.includes(expected), `Upload 规范缺少可见规则：${expected}`);
  }

  const evidence = JSON.parse(read(a05ManifestPath));
  const scenarios = evidence.scenarios.filter(
    (item) => item.componentId === 'transfer' || item.componentId === 'upload',
  );
  assert.equal(scenarios.length, 13);

  for (const suite of libraryValidationSuites) {
    const source = read(path.join(specRoot, suite.folder, 'src', 'TransferUpload.vue'));
    for (const component of ['el-checkbox', 'el-checkbox-group', 'el-input', 'el-button', 'el-upload']) {
      assert.ok(source.includes(`<${component}`), `${suite.label} 缺少真实 ${component}`);
    }
    assert.doesNotMatch(source, /<(?:input|button|select|textarea)(?:\s|>)/u);
    assert.ok(source.includes('这是附件的文件名.jpg'));
    assert.ok(source.includes('这是一张图片.jpeg'));
    assert.ok(source.includes('只能上传jpg/png文件，且不超过500kb'));
    assert.doesNotMatch(source, /上传到服务器|不超过 2MB/u);
  }

  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 应通过三方视觉验收`);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)));
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.comparison.file)));
    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.result, 'pass', `${scenario.id} ${key} 自动证据未通过`);
      assert.equal(implementation.evidenceChecks.manualApproval, true);
      assert.ok(fs.existsSync(path.join(a05EvidenceRoot, implementation.screenshot)));
      assert.equal(implementation.measurements.geometry.overflow.horizontal, false);
    }
  }

  const transferItemCounts = {
    'SCN-TRANSFER-01': 20,
    'SCN-TRANSFER-02': 16,
    'SCN-TRANSFER-03': 16,
    'SCN-TRANSFER-04': 16,
    'SCN-TRANSFER-05': 20,
    'SCN-TRANSFER-06': 16,
    'SCN-TRANSFER-07': 16,
    'SCN-TRANSFER-08': 16,
  };
  const footerScenes = new Set([
    'SCN-TRANSFER-03',
    'SCN-TRANSFER-04',
    'SCN-TRANSFER-07',
    'SCN-TRANSFER-08',
  ]);
  for (const key of ['elementPlus', 'elementUi']) {
    for (const [scenarioId, itemCount] of Object.entries(transferItemCounts)) {
      const implementation = scenarios.find((item) => item.id === scenarioId).implementations[key];
      const geometry = implementation.measurements.geometry;
      assert.equal(geometry.panelCount, 2, `${scenarioId} ${key} 必须展示两个面板`);
      assert.equal(geometry.listItemCount, itemCount, `${scenarioId} ${key} 可见列表项数量错误`);
      assert.deepEqual(
        geometry.panelSizes,
        Array(2).fill({ width: 200, height: footerScenes.has(scenarioId) ? 450 : 410 }),
      );
      assert.equal(geometry.actionButtonCount, 2);
    }

    const avatar = scenarios.find((item) => item.id === 'SCN-UPLOAD-02').implementations[key];
    const picture = scenarios.find((item) => item.id === 'SCN-UPLOAD-03').implementations[key];
    const drag = scenarios.find((item) => item.id === 'SCN-UPLOAD-04').implementations[key];
    assert.equal(avatar.measurements.geometry.uploadComponentCount, 1);
    assert.deepEqual(
      picture.measurements.geometry.controls
        .filter((item) => item.className === 'upload-picture-row')
        .map(({ width, height }) => [width, height]),
      [[360, 88]],
    );
    assert.deepEqual(
      drag.measurements.geometry.controls
        .filter((item) => item.className.includes('el-upload-dragger'))
        .map(({ width, height }) => [width, height]),
      [[360, 180]],
    );

    const selected = scenarios
      .find((item) => item.id === 'SCN-TRANSFER-01')
      .implementations[key]
      .stateEvidence.find((item) => item.state === 'Selected');
    assert.ok(selected);
    assert.equal(selected.result, 'pass');
    assert.ok(selected.measurements.selectedCount > 0);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, selected.screenshot)));
  }
});

// AI-code-start lines:153 tool:Codex
test('Form 四组的 20 个完整场景通过双组件库视觉验收', () => {
  const formDocs = {
    defaultCn: read(path.join(specRoot, 'forms', 'form-default-cn.md')),
    defaultEn: read(path.join(specRoot, 'forms', 'form-default-en.md')),
    largeCn: read(path.join(specRoot, 'forms', 'form-large-cn.md')),
    smallCn: read(path.join(specRoot, 'forms', 'form-small-cn.md')),
  };
  for (const expected of [
    '标签区 `68px`；控件 `392px`',
    '审批人标签 / 输入 `54px / 146px`',
    '活动区域标签 / 输入 `68px / 132px`',
  ]) {
    assert.ok(formDocs.defaultCn.includes(expected), `中文默认表单缺少尺寸规则：${expected}`);
  }
  for (const expected of [
    'Approved by 标签 / 输入 `94px / 186px`',
    'Activity zone 标签 / 输入 `98px / 182px`',
    '保留中文“顶对齐标签”',
  ]) {
    assert.ok(formDocs.defaultEn.includes(expected), `英文默认表单缺少场景规则：${expected}`);
  }
  for (const content of [formDocs.largeCn, formDocs.smallCn]) {
    assert.ok(content.includes('标签顶部对齐'));
    assert.ok(content.includes('场景例外'));
    assert.match(content, /实际(?:为|使用) `32px`/u);
  }
  assert.ok(formDocs.largeCn.includes('Radio 组标签为“顶对齐标签”'));
  assert.ok(formDocs.smallCn.includes('Radio 标签为“四字标签”'));

  const evidence = JSON.parse(read(a05ManifestPath));
  const formComponentIds = new Set([
    'form-default-cn',
    'form-default-en',
    'form-large-cn',
    'form-small-cn',
  ]);
  const scenarios = evidence.scenarios.filter((item) => formComponentIds.has(item.componentId));
  assert.equal(scenarios.length, 20);

  for (const suite of libraryValidationSuites) {
    const source = read(path.join(specRoot, suite.folder, 'src', 'FormScenario.vue'));
    for (const component of [
      'el-form',
      'el-form-item',
      'el-input',
      'el-select',
      'el-date-picker',
      'el-time-picker',
      'el-switch',
      'el-checkbox',
      'el-radio',
      'el-button',
    ]) {
      assert.ok(source.includes(`<${component}`), `${suite.label} 缺少真实 ${component}`);
    }
    assert.doesNotMatch(source, /<(?:input|button|select|textarea)(?:\s|>)/u);
    assert.ok(source.includes('四字标签'));
    assert.ok(source.includes('顶对齐标签'));
    assert.ok(source.includes('isEnglish'));
  }

  const expectedControlHeight = (scenario) => {
    const ordinal = Number(scenario.id.split('-').at(-1));
    if (scenario.componentId === 'form-large-cn') return ordinal === 5 ? 32 : 40;
    if (scenario.componentId === 'form-small-cn') return ordinal === 5 ? 32 : 24;
    return 32;
  };

  // Chrome 证据可能使用 PNG 或 JPEG 编码，尺寸门禁需要同时识别两者。
  const imageDimensions = (bytes) => {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    }
    for (let offset = 2; offset < bytes.length - 9;) {
      if (bytes[offset] !== 0xFF) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if ([0xC0, 0xC1, 0xC2].includes(marker)) {
        return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    assert.fail('无法识别视觉证据图片尺寸');
  };

  for (const scenario of scenarios) {
    assert.equal(scenario.result, 'pass', `${scenario.id} 应通过三方视觉验收`);
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.reference.file)));
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, scenario.comparison.file)));
    const referencePng = fs.readFileSync(path.join(a05EvidenceRoot, scenario.reference.file));
    const referenceSize = imageDimensions(referencePng);

    for (const key of ['elementPlus', 'elementUi']) {
      const implementation = scenario.implementations[key];
      assert.equal(implementation.result, 'pass', `${scenario.id} ${key} 自动证据未通过`);
      assert.equal(implementation.evidenceChecks.manualApproval, true);
      const screenshotPath = path.join(a05EvidenceRoot, implementation.screenshot);
      assert.ok(fs.existsSync(screenshotPath));
      const screenshotPng = fs.readFileSync(screenshotPath);
      assert.deepEqual(
        imageDimensions(screenshotPng),
        referenceSize,
        `${scenario.id} ${key} 截图裁切尺寸错误`,
      );

      const geometry = implementation.measurements.geometry;
      assert.equal(geometry.form.overflow.documentScrollWidth, geometry.form.overflow.documentClientWidth);
      assert.ok(geometry.form.overflow.rootScrollWidth <= geometry.form.overflow.rootClientWidth);
      const inputRoot = geometry.controls.find(
        (item) => /^el-input(?:\s|$)/u.test(item.className)
          && !item.className.includes('date-editor'),
      );
      assert.ok(inputRoot, `${scenario.id} ${key} 缺少输入控件根节点`);
      assert.ok(
        Math.abs(inputRoot.height - expectedControlHeight(scenario)) <= 0.6,
        `${scenario.id} ${key} 输入高度错误`,
      );
      assert.ok(
        Math.abs(geometry.form.buttons[0].height - expectedControlHeight(scenario)) <= 0.6,
        `${scenario.id} ${key} 按钮高度错误`,
      );
    }
  }

  // 两个顶部对齐例外场景的日期与时间控件也必须统一为 32px。
  for (const scenarioId of ['SCN-FORM-LARGE-CN-05', 'SCN-FORM-SMALL-CN-05']) {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    for (const key of ['elementPlus', 'elementUi']) {
      const dateEditors = scenario.implementations[key].measurements.geometry.controls
        .filter((item) => item.className.includes('date-editor'));
      assert.equal(dateEditors.length, 2);
      assert.ok(dateEditors.every((item) => Math.abs(item.height - 32) <= 0.6));
    }
  }

  const smallAligned = scenarios.find((item) => item.id === 'SCN-FORM-SMALL-CN-03');
  const largeTop = scenarios.find((item) => item.id === 'SCN-FORM-LARGE-CN-05');
  for (const key of ['elementPlus', 'elementUi']) {
    assert.ok(smallAligned.implementations[key].measurements.texts.includes('四字标签'));
    assert.ok(largeTop.implementations[key].measurements.texts.includes('顶对齐标签'));
  }

  const englishInline = scenarios.find((item) => item.id === 'SCN-FORM-DEFAULT-EN-02');
  for (const key of ['elementPlus', 'elementUi']) {
    const defaultState = englishInline.implementations[key].stateEvidence
      .find((item) => item.state === 'Default');
    assert.ok(defaultState);
    assert.equal(defaultState.result, 'pass');
    assert.ok(fs.existsSync(path.join(a05EvidenceRoot, defaultState.screenshot)));
  }
});

// AI-code-start lines:129 tool:Codex
const pureSpecRoot = path.join(repositoryRoot, 'outputs', 'lanhu-ai-ui-spec');
// AI-code-start lines:59 tool:Codex
test('响应式表单布局同步到纯 AI 输入目录且不携带验证过程', () => {
  const designPath = path.join(specRoot, 'foundations', 'responsive-form-layout.md');
  const purePath = path.join(pureSpecRoot, 'foundations', 'responsive-form-layout.md');
  const readmePath = path.join(pureSpecRoot, 'README.md');
  assert.ok(fs.existsSync(purePath), '纯 AI 输入目录缺少响应式表单布局规范');

  const designContent = read(designPath);
  const pureContent = read(purePath);
  const readme = read(readmePath);
  const pureDetailFiles = ['foundations', 'components', 'forms', 'pickers'].flatMap((folder) => (
    fs.readdirSync(path.join(pureSpecRoot, folder))
      .filter((name) => name.endsWith('.md'))
      .map((name) => path.join(pureSpecRoot, folder, name))
  ));
  assert.equal(pureDetailFiles.length, 30, '纯 AI 输入目录必须包含 30 份详细规范');
  assert.match(readme, /`4` 份基础规范/u);
  assert.match(readme, /`30` 份详细规范.*`31` 个 Markdown 文件/u);
  assert.match(readme, /\[PC 端响应式表单布局\]\(foundations\/responsive-form-layout\.md\)/u);
  assert.match(readme, /└── responsive-form-layout\.md/u);

  for (const expected of [
    '`1024px ≤ W < 1440px`',
    '`1440px ≤ W < 1920px`',
    '`W ≥ 1920px`',
    '`x=124px, y=48px`',
    '`884px × 704px`',
    '`#FAFBFC`',
    '`#EEF1F5`',
    '`16px`',
    '`8px`',
    '标签必须位于控件左侧',
    '按当前标签文案的固有宽度占位',
    '约 `12px`',
    '与 `32px` 控件垂直居中',
    '操作组不计入 3/4/6 个字段组的列数',
    '蓝湖没有提供 `<1024px`',
  ]) {
    assert.ok(designContent.includes(expected), `正式规范缺少可执行规则：${expected}`);
    assert.ok(pureContent.includes(expected), `纯 AI 规范缺少可执行规则：${expected}`);
  }

  const designBoards = tableRows(designContent, '12 张画板映射');
  const pureBoards = tableRows(pureContent, '12 张画板映射');
  assert.equal(pureBoards.length, 12, '纯 AI 规范必须保留 12 张画板映射');
  assert.deepEqual(pureBoards, designBoards, '纯 AI 规范的画板名称、ID 和用途不得漂移');
  assert.doesNotMatch(
    pureContent,
    /https:\/\/lanhuapp\.com|还原状态|测量基准|验收环境|截图|证据路径|Element Plus|Element UI|library-project|双组件库|两套真实组件库/u,
    '纯 AI 规范混入设计源外链或验证过程内容',
  );

  for (const filePath of [readmePath, purePath]) {
    for (const target of localMarkdownLinks(filePath)) {
      const resolved = path.resolve(path.dirname(filePath), target);
      assert.ok(resolved.startsWith(`${pureSpecRoot}${path.sep}`), `纯 AI 规范链接越出目录：${target}`);
      assert.ok(fs.existsSync(resolved), `纯 AI 规范本地链接不存在：${target}`);
    }
  }
});
const precisionSpecExpectations = {
  'components/frequent-components-32.md': [
    '两个输入框均为 `240px × 32px`',
    '两个轨道均为 `40px × 20px`',
    '共6532条 / 10条/页 / 前往 2 页',
  ],
  'components/pagination.md': [
    '必须一次展示 `14` 行',
    '`100/page`',
    'Default 输入框 `56px × 32px`，Small 输入框 `40px × 24px`',
  ],
  'components/progress.md': [
    '从左到右 `5` 个 `120px × 120px` 圆环',
    '三条均为 `20%`',
    '`#FF6014 / #999999 / #E6A23C`',
  ],
  'components/transfer.md': [
    '`200px` 宽；基础示例约 `410px` 高',
    '`160px × 32px`',
    '`46px × 24px`',
  ],
  'components/upload.md': [
    '`148px × 148px`',
    '`360px × 88px`',
    '`360px × 180px`',
    '只能上传jpg/png文件，且不超过500kb',
  ],
  'forms/form-default-cn.md': [
    '标签区 `68px`；控件 `392px`',
    '审批人标签 / 输入 `54px / 146px`',
    '活动区域标签 / 输入 `68px / 132px`',
  ],
  'forms/form-default-en.md': [
    '标签区 `124px`；控件 `336px`',
    'Approved by 标签 / 输入 `94px / 186px`',
    'Activity zone 标签 / 输入 `98px / 182px`',
  ],
  'forms/form-large-cn.md': [
    '查询、重置均为 `68px × 40px`',
    '实际使用 `32px` 高度',
    '单列控件宽 `460px`',
  ],
  'forms/form-small-cn.md': [
    '两个输入均 `152px`',
    '查询、重置均为 `48px × 24px`',
    '控件和按钮实际为 `32px`',
  ],
  'components/table.md': [
    '`x=200px, y=176px`',
    '约 `#CACCCF`',
    '三个 `#FF6014` 文字操作',
  ],
  'components/badge.md': [
    'Danger `#F53F3F`；Brand `#FF6014`；Warning `#E6A23C`',
    '高 `20px`；最小宽 `20px`',
    '同行宿主间距 | `12px`',
  ],
  'components/menu.md': [
    '`690px × 64px`',
    '依次为 `Processing Center`、`Workspace`、`Info`、`Orders`',
    '弹层展开箭头',
  ],
  'components/select.md': [
    '两个 `240px` 触发器/面板之间 `48px`',
    '高 `24px`；触发器内左右缩进 `4px`',
    'Selected：`#FF6014` 文字 + `#FDF4EE` 背景',
  ],
  'pickers/cascader.md': [
    '面板可见高度 | `400px`',
    '一级列展示 `第一行`～`第十行`',
    '末级列展示 `第一行`～`第十二行`',
  ],
  'components/color-picker.md': [
    '相隔 `104px`',
    '`272px` 宽；10 列',
    '`#F53F3F`、`#FF7D00`、`#FADC19`',
    '`rgba(0, 180, 42, 0.5)`',
  ],
  'pickers/date-time-picker.md': [
    '约 `435px × 415px`',
    '快捷栏 | `80px` 宽',
    '`2021 年 05 月`',
  ],
  'pickers/time-picker.md': [
    '约 `352px × 292px`',
    '实际显示 `16px × 16px`',
    '`08:30`、`08:45`、`09:00`、`09:15`、`选项 5`',
  ],
};
const strictlySyncedPrecisionSpecs = new Set([
  'components/badge.md',
  'components/menu.md',
  'components/select.md',
  'pickers/cascader.md',
  'components/color-picker.md',
  'pickers/date-time-picker.md',
  'pickers/time-picker.md',
]);

function normalizedPrecisionSpec(content) {
  return content
    .split(/\r?\n/u)
    .filter((line) => !/^\| (?:还原状态|测量基准|绘制基准) \|/u.test(line))
    .join('\n');
}

test('验收精确值同步进入两套纯 Markdown 且不携带验证实现细节', () => {
  for (const [relativePath, expectedValues] of Object.entries(precisionSpecExpectations)) {
    const designContent = read(path.join(specRoot, relativePath));
    const pureContent = read(path.join(pureSpecRoot, relativePath));
    for (const expected of expectedValues) {
      assert.ok(designContent.includes(expected), `${relativePath} 设计规范缺少精确值：${expected}`);
      assert.ok(pureContent.includes(expected), `${relativePath} AI 纯规范缺少精确值：${expected}`);
    }
    if (strictlySyncedPrecisionSpecs.has(relativePath)) {
      assert.equal(
        normalizedPrecisionSpec(designContent),
        normalizedPrecisionSpec(pureContent),
        `${relativePath} 两套规范存在精确内容漂移`,
      );
    }
    assert.doesNotMatch(
      pureContent,
      /\.el-|evidence-mode|is-evidence-popper|A-05|三方视觉|验收代码/u,
      `${relativePath} AI 纯规范混入验证实现细节`,
    );
  }
});

// AI-code-start lines:30 tool:Codex
function deliveryTextFiles(rootPath) {
  const textExtensions = new Set(['.md', '.html', '.vue', '.js', '.json', '.css']);
  const files = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...deliveryTextFiles(entryPath));
    } else if (textExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

test('规范交付文档、验证源码和静态产物不保留旧品牌前缀', () => {
  const removedBrandPrefix = '\u7231\u5EB7';
  const deliveryRoots = [specRoot, pureSpecRoot];
  for (const rootPath of deliveryRoots) {
    for (const filePath of deliveryTextFiles(rootPath)) {
      assert.doesNotMatch(
        read(filePath),
        new RegExp(removedBrandPrefix, 'u'),
        `${path.relative(repositoryRoot, filePath)} 仍包含旧品牌前缀`,
      );
    }
  }
  assert.match(read(path.join(specRoot, 'README.md')), /^# 后台设计规范$/mu);
  assert.match(read(path.join(pureSpecRoot, 'README.md')), /^# 后台 UI 还原规范（AI 输入版）$/mu);
  assert.match(read(path.join(validationUiRoot, 'index.html')), /<title>后台组件还原<\/title>/u);
});
