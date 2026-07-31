import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const specRoot = path.resolve(toolRoot, '..');
const evidenceRoot = path.join(specRoot, 'validation-evidence', 'a05-visual-matrix');
const manifestPath = path.join(evidenceRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function crop(x, y, width, height, anchor, relation = 'exact-scene') {
  return { x, y, width, height, anchor, relation };
}

function verticalRegions(starts, end, x = 80, width = 950) {
  return starts.map((start, index) => {
    const next = starts[index + 1] ?? end;
    return crop(x, start, width, next - start, `人工确认纵向区段 ${index + 1}`);
  });
}

// 每一项都来自蓝湖原图人工复核；同一规范区展示多个场景时显式标记 shared-group。
const mappings = {
  'components/badge.md': [
    crop(100, 300, 520, 70, '基础用法 / 数字徽章', 'shared-group'),
    crop(100, 300, 520, 70, '基础用法 / 语义色', 'shared-group'),
    crop(100, 480, 340, 80, '最大值'),
    crop(100, 670, 340, 80, '自定义显示内容'),
    crop(100, 870, 340, 100, '小红点'),
  ],
  'components/button.md': [
    crop(100, 285, 480, 55, '基础填充按钮'),
    crop(100, 330, 480, 55, '朴素按钮'),
    crop(100, 375, 480, 55, '圆角按钮'),
    crop(100, 420, 300, 55, '圆形图标按钮'),
    crop(100, 590, 480, 55, '禁用填充按钮'),
    crop(100, 635, 480, 55, '禁用朴素按钮'),
    crop(100, 810, 220, 55, '文字按钮'),
    crop(100, 985, 210, 60, '仅图标矩形按钮'),
    crop(280, 985, 260, 60, '图标加文字按钮'),
  ],
  'components/checkbox.md': verticalRegions([195, 320, 450, 615], 930),
  'components/collapse.md': verticalRegions([200, 540, 930], 1325),
  'components/color-picker.md': verticalRegions([195, 600, 990, 1480], 1880),
  'components/dialog-usage.md': [
    crop(90, 270, 1740, 290, '结构 / 简单模式'),
    crop(90, 550, 1740, 480, '结构 / 复杂内容'),
    crop(90, 1160, 1740, 540, '尺寸 / small: 480px'),
    crop(90, 1700, 1740, 480, '尺寸 / Medium: 720px'),
    crop(90, 2180, 1740, 500, '尺寸 / Large: 960px'),
    crop(90, 2670, 1740, 480, '尺寸 / MAX: 1232px'),
    crop(90, 3140, 1740, 670, '尺寸 / 动态宽度: 80%'),
  ],
  'components/dialog.md': [
    crop(80, 200, 950, 330, '默认左对齐 / 默认样式'),
    crop(80, 530, 950, 300, '默认左对齐 / 表单'),
    crop(80, 830, 950, 380, '默认左对齐 / 表格'),
    crop(80, 1210, 950, 350, '居中对齐 / 默认样式'),
    crop(80, 1560, 950, 360, '居中对齐 / 表单'),
    crop(80, 1920, 950, 480, '居中对齐 / 表格'),
  ],
  'components/frequent-components-32.md': [
    crop(50, 215, 340, 80, '表单组件 / Button'),
    crop(50, 285, 280, 45, '表单组件 / Radio'),
    crop(50, 325, 300, 60, '表单组件 / 分段选择'),
    crop(50, 375, 260, 60, '表单组件 / Checkbox'),
    crop(50, 425, 530, 65, '表单组件 / Input'),
    crop(50, 475, 530, 65, '表单组件 / Select'),
    crop(50, 525, 530, 65, '表单组件 / DatePicker'),
    crop(50, 570, 260, 65, '表单组件 / InputNumber'),
    crop(50, 620, 260, 65, '表单组件 / Switch'),
    crop(50, 665, 550, 170, '表单组件 / Upload'),
    crop(50, 905, 800, 100, '表格组件 / Table'),
    crop(200, 985, 650, 80, '表格组件 / Pagination'),
    crop(50, 1135, 500, 60, '其他组件 / Tag'),
    crop(50, 1180, 500, 80, '其他组件 / Tabs'),
    crop(50, 1250, 500, 100, '其他组件 / Alert'),
    crop(50, 1340, 520, 230, '其他组件 / Dialog'),
    crop(50, 1550, 280, 90, '其他组件 / Tooltip'),
    crop(50, 1620, 320, 150, '其他组件 / Popconfirm'),
  ],
  'components/input-number.md': verticalRegions([195, 335, 475, 610], 750),
  'components/input.md': verticalRegions([195, 320, 510, 640, 780, 965, 1120, 1300, 1440, 1750], 1960),
  'components/menu.md': [
    crop(100, 260, 560, 80, '顶栏－基础用法'),
    crop(100, 410, 620, 260, '顶栏－Dropdown'),
    crop(100, 760, 260, 520, '侧栏－基础用法'),
  ],
  'components/pagination.md': [
    ...[285, 345, 405, 465, 525, 585, 645].map((y, index) =>
      crop(80, y, 850, 75, `默认样式 / 组合行 ${index + 1}`),
    ),
    crop(80, 275, 850, 460, '默认样式'),
    crop(80, 825, 850, 435, '带背景'),
    crop(80, 1365, 850, 965, 'small 模式'),
  ],
  'components/progress.md': verticalRegions([195, 450, 705, 965, 1190], 1510),
  'components/radio.md': [
    crop(80, 195, 950, 135, '基础用法'),
    crop(80, 325, 950, 135, '禁用状态'),
    crop(80, 455, 950, 205, '单选框组'),
    crop(80, 660, 950, 765, '按钮样式'),
    crop(80, 1425, 950, 360, '带有边框'),
  ],
  'components/select.md': verticalRegions([195, 495, 800, 925, 1045, 1340, 1640, 2075, 2380], 2530),
  'components/switch.md': verticalRegions([195, 305, 415], 560),
  'components/transfer.md': verticalRegions([195, 715, 1230, 1780, 2340, 2840, 3350, 3910], 4590),
  'components/upload.md': verticalRegions([195, 365, 620, 875, 1220], 1530),
  'forms/form-default-cn.md': [
    crop(80, 195, 900, 585, '典型表单'),
    crop(80, 780, 900, 190, '行内表单'),
    crop(80, 960, 900, 640, '对齐方式 / 标签左对齐'),
    crop(80, 1590, 900, 600, '对齐方式 / 标签右对齐'),
    crop(80, 2180, 900, 760, '对齐方式 / 标签顶部对齐'),
  ],
  'forms/form-default-en.md': [
    crop(80, 195, 900, 595, 'Typical form'),
    crop(80, 790, 900, 190, 'Inline form'),
    crop(80, 970, 900, 620, 'Alignment / Left-aligned labels'),
    crop(80, 1580, 900, 620, 'Alignment / Right-aligned labels'),
    crop(80, 2190, 900, 750, 'Alignment / Top-aligned labels'),
  ],
  'forms/form-large-cn.md': [
    crop(80, 195, 900, 630, '典型表单'),
    crop(80, 825, 900, 185, '行内表单'),
    crop(80, 1000, 900, 720, '对齐方式 / 标签左对齐'),
    crop(80, 1710, 900, 720, '对齐方式 / 标签右对齐'),
    crop(80, 2420, 900, 970, '对齐方式 / 标签顶部对齐'),
  ],
  'forms/form-small-cn.md': [
    crop(80, 195, 900, 585, '典型表单'),
    crop(80, 780, 900, 180, '行内表单'),
    crop(80, 950, 900, 650, '对齐方式 / 标签左对齐'),
    crop(80, 1590, 900, 590, '对齐方式 / 标签右对齐'),
    crop(80, 2170, 900, 770, '对齐方式 / 标签顶部对齐'),
  ],
  'pickers/cascader.md': verticalRegions([195, 735, 1275, 1815], 2350),
  'pickers/time-picker.md': [
    crop(110, 255, 260, 225, '固定时间点 / 输入框与下拉选项'),
    crop(110, 570, 240, 275, '任意时间点 / 输入框与时间面板'),
    crop(110, 945, 375, 345, '任意时间范围 / 输入框与双列时间面板'),
  ],
};

const componentContentInsets = {
  'components/checkbox.md': 50,
  'components/collapse.md': 95,
  'components/color-picker.md': 100,
  'components/dialog-usage.md': 60,
  'components/dialog.md': 90,
  'components/input-number.md': 50,
  'components/input.md': 50,
  'components/progress.md': 50,
  'components/radio.md': 50,
  'components/select.md': 50,
  'components/switch.md': 50,
  'components/transfer.md': 70,
  'components/upload.md': 70,
  'forms/form-default-cn.md': 90,
  'forms/form-default-en.md': 90,
  'forms/form-large-cn.md': 90,
  'forms/form-small-cn.md': 90,
  'pickers/cascader.md': 50,
};

const dateTimeMappings = {
  'SCN-DATE-TIME-01': crop(100, 285, 360, 405, '选择日 / 默认'),
  'SCN-DATE-TIME-02': crop(470, 285, 400, 405, '选择日 / 带快捷选项'),
  'SCN-DATE-TIME-03': crop(100, 790, 360, 410, '其他日期单位 / 周'),
  'SCN-DATE-TIME-04': crop(470, 790, 390, 410, '其他日期单位 / 年'),
  'SCN-DATE-TIME-05': crop(100, 1230, 390, 420, '其他日期单位 / 月'),
  'SCN-DATE-TIME-06': crop(470, 1230, 390, 420, '其他日期单位 / 多个日期'),
  'SCN-DATE-TIME-07': crop(100, 1715, 760, 515, '选择日期范围 / 默认'),
  'SCN-DATE-TIME-08': crop(100, 2225, 780, 575, '选择日期范围 / 带快捷选项'),
  'SCN-DATE-TIME-09': crop(100, 2845, 740, 305, '选择月份范围 / 默认'),
  'SCN-DATE-TIME-10': crop(100, 3095, 780, 315, '选择月份范围 / 带快捷选项'),
  'SCN-DATE-TIME-11': crop(100, 270, 360, 535, '日期和时间点 / 默认'),
  'SCN-DATE-TIME-12': crop(470, 270, 400, 535, '日期和时间点 / 带快捷选项'),
  'SCN-DATE-TIME-13': crop(100, 875, 800, 515, '日期和时间范围 / 默认'),
  'SCN-DATE-TIME-14': crop(100, 1445, 800, 485, '日期和时间范围 / 带快捷选项'),
};

const tableMappings = {
  'SCN-TABLE-01': crop(40, 120, 847, 570, '基础表格'),
  'SCN-TABLE-02': crop(40, 700, 847, 510, '带斑马纹表格'),
  'SCN-TABLE-03': crop(40, 1100, 847, 560, '带边框表格'),
  'SCN-TABLE-04': crop(40, 1600, 847, 560, '带状态表格'),
  'SCN-TABLE-05': crop(40, 2140, 847, 540, '固定表头'),
  'SCN-TABLE-06': crop(40, 2690, 847, 560, '固定列'),
  'SCN-TABLE-07': crop(40, 3250, 847, 640, '固定列和表头'),
  'SCN-TABLE-08': crop(40, 3890, 847, 660, '流体高度'),
  'SCN-TABLE-09': crop(40, 4550, 847, 510, '多级表头'),
  'SCN-TABLE-10': crop(40, 5060, 847, 570, '单选'),
  'SCN-TABLE-11': crop(40, 5630, 847, 520, '多选'),
  'SCN-TABLE-12': crop(40, 6150, 847, 550, '排序'),
  'SCN-TABLE-13': crop(40, 6700, 847, 540, '筛选'),
  'SCN-TABLE-14': crop(40, 7100, 847, 580, '自定义列模板'),
  'SCN-TABLE-15': crop(40, 7680, 847, 560, '自定义表头'),
  'SCN-TABLE-16': crop(40, 8100, 847, 780, '展开行'),
  'SCN-TABLE-17': crop(40, 8800, 847, 610, '树形数据与懒加载'),
  'SCN-TABLE-18': crop(40, 9400, 847, 920, '表尾合计行'),
  'SCN-TABLE-19': crop(40, 10320, 847, 930, '合并行或列'),
  'SCN-TABLE-20': crop(40, 11250, 847, 500, '自定义索引'),
  'SCN-TABLE-21': crop(40, 12250, 847, 650, '表格布局'),
  'SCN-TABLE-22': crop(0, 0, 1280, 800, '经典表格页案例 / Small'),
  'SCN-TABLE-23': crop(0, 0, 1440, 900, '经典表格页案例 / Medium'),
  'SCN-TABLE-24': crop(0, 0, 1920, 1080, '经典表格页案例 / Large'),
};

function sourcePathFor(scenario) {
  return path.resolve(evidenceRoot, scenario.reference.sourceFile);
}

function cropReference(sourcePath, outputPath, region, useExactRasterCrop = false, matteColor = '') {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (useExactRasterCrop) {
    // 经典页面源图含透明工作区，必须按蓝湖详情页的实际承载色合成。
    const exactArguments = matteColor
      ? [
          '-f',
          'lavfi',
          '-i',
          `color=c=${matteColor}:s=${region.width}x${region.height}`,
          '-i',
          sourcePath,
          '-filter_complex',
          `[1:v]crop=${region.width}:${region.height}:${region.x}:${region.y}[fg];[0:v][fg]overlay=0:0:format=auto,format=rgb24[out]`,
          '-map',
          '[out]',
        ]
      : [
          '-i',
          sourcePath,
          '-vf',
          `crop=${region.width}:${region.height}:${region.x}:${region.y}`,
        ];
    const exactResult = spawnSync(
      '/opt/homebrew/bin/ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...exactArguments,
        '-frames:v',
        '1',
        outputPath,
      ],
      { encoding: 'utf8' },
    );
    if (exactResult.status !== 0) {
      throw new Error(`参考裁图失败：${path.basename(outputPath)}\n${exactResult.stderr || exactResult.stdout}`);
    }
    return;
  }
  const result = spawnSync(
    '/usr/bin/sips',
    [
      '-s',
      'format',
      'png',
      '--cropOffset',
      String(region.y),
      String(region.x),
      '--cropToHeightWidth',
      String(region.height),
      String(region.width),
      sourcePath,
      '--out',
      outputPath,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(`参考裁图失败：${path.basename(outputPath)}\n${result.stderr || result.stdout}`);
  }
}

const sourceOrdinals = new Map();
for (const scenario of manifest.scenarios) {
  const ordinal = (sourceOrdinals.get(scenario.source) || 0) + 1;
  sourceOrdinals.set(scenario.source, ordinal);
  const mappedRegion =
    scenario.source === 'components/table.md'
      ? tableMappings[scenario.id]
      : scenario.source === 'pickers/date-time-picker.md'
      ? dateTimeMappings[scenario.id]
      : mappings[scenario.source]?.[ordinal - 1];
  if (!mappedRegion) throw new Error(`缺少参考裁图映射：${scenario.id}（${scenario.source} #${ordinal}）`);
  const inset = componentContentInsets[scenario.source] || 0;
  const region = inset
    ? { ...mappedRegion, y: mappedRegion.y + inset, height: mappedRegion.height - inset }
    : mappedRegion;
  const outputPath = path.join(evidenceRoot, scenario.reference.file);
  const classicTableMatte = /^SCN-TABLE-2[2-4]$/u.test(scenario.id) ? '0xF0F2F5' : '';
  cropReference(
    sourcePathFor(scenario),
    outputPath,
    region,
    scenario.source === 'components/table.md',
    classicTableMatte,
  );
  scenario.reference.crop = {
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    status: 'confirmed',
    anchor: region.anchor,
    relation: region.relation,
    verification: '蓝湖原图标题、组件边界与场景表人工复核',
  };
}

const referenceFiles = manifest.scenarios.filter((scenario) =>
  fs.existsSync(path.join(evidenceRoot, scenario.reference.file)),
);
if (referenceFiles.length !== 183) throw new Error(`参考裁图数量异常：${referenceFiles.length}`);

manifest.summary.referenceConfirmed = referenceFiles.length;
manifest.referenceMapping = {
  method: 'manual-artboard-anchor',
  ocrAssist: 'reference-ocr.json',
  note: '坐标按蓝湖原图标题和组件边界人工确认；shared-group 表示原图在同一规范区共同展示多个场景。',
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已确认并生成 ${referenceFiles.length} 张 A-05 蓝湖参考裁图。`);
