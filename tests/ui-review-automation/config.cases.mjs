import test from 'node:test';
import {
  assert,
  fs,
  os,
  path,
  loadUiReviewConfig,
  normalizeUiReviewConfig,
  resolveSafeProjectPath,
  configInput,
  configV2Input,
  createProject,
} from './fixtures.mjs';

test('配置默认建议模式，并根据设计内容生成稳定场景指纹', (context) => {
  const projectRoot = createProject(context);
  const first = loadUiReviewConfig(projectRoot);
  const second = loadUiReviewConfig(projectRoot);
  assert.equal(first.autoFix, 'suggest');
  assert.equal(first.scenarios[0].fingerprint, second.scenarios[0].fingerprint);

  fs.writeFileSync(path.join(projectRoot, 'design', 'home.png'), 'design-v2');
  const changed = loadUiReviewConfig(projectRoot);
  assert.notEqual(first.scenarios[0].fingerprint, changed.scenarios[0].fingerprint);
});

test('版本 2 配置规范化结构化交互、比较规则并生成稳定指纹', (context) => {
  const projectRoot = createProject(context);
  const first = normalizeUiReviewConfig(configV2Input(), projectRoot);
  const reordered = configV2Input();
  reordered.scenarios[0].interactions[0] = {
    timeout: 5000,
    selector: '[data-open-dialog]',
    action: 'click',
  };
  const second = normalizeUiReviewConfig(reordered, projectRoot);
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.scenarios[0].interactionMode, 'structured');
  assert.equal(first.scenarios[0].fingerprint, second.scenarios[0].fingerprint);
  assert.equal(first.scenarios[0].comparison.mode, 'hybrid');
  assert.equal(first.scenarios[0].comparison.scope, 'visual');
  assert.equal(first.scenarios[0].comparison.visualEvidenceDeclared, true);

  const changed = configV2Input();
  changed.scenarios[0].interactions[1].value = '另一个用户';
  assert.notEqual(
    first.scenarios[0].fingerprint,
    normalizeUiReviewConfig(changed, projectRoot).scenarios[0].fingerprint,
  );
});

test('视觉范围规范化几何断言并保持旧配置为结构范围', (context) => {
  const projectRoot = createProject(context);
  const input = configV2Input();
  input.scenarios[0].comparison = {
    scope: 'visual',
    mode: 'dom',
    dom: [
      { selector: '.row', property: 'rect.height', expected: 57, tolerance: 0.5 },
      {
        selector: '.remove',
        property: 'rect.center-y',
        relativeTo: { selector: '.field-input', property: 'rect.center-y' },
        tolerance: 1,
      },
    ],
  };
  const normalized = normalizeUiReviewConfig(input, projectRoot).scenarios[0].comparison;
  assert.equal(normalized.scope, 'visual');
  assert.equal(normalized.visualEvidenceDeclared, true);
  assert.equal(normalized.dom[0].expected, 57);
  assert.equal(normalized.dom[1].relativeTo.selector, '.field-input');

  const legacy = configV2Input();
  delete legacy.scenarios[0].comparison.scope;
  assert.equal(normalizeUiReviewConfig(legacy, projectRoot).scenarios[0].comparison.scope, 'structure');

  const invalid = structuredClone(input);
  invalid.scenarios[0].comparison.dom[0] = {
    selector: '.row',
    property: 'rect.height',
    expected: 57,
    relativeTo: { selector: '.other', property: 'rect.height' },
  };
  assert.throws(() => normalizeUiReviewConfig(invalid, projectRoot), /必须且只能声明 expected 或 relativeTo/u);

  const repeatedProperty = structuredClone(input);
  repeatedProperty.scenarios[0].comparison.dom.push({ selector: '.row', property: 'rect.height', expected: 58 });
  assert.equal(normalizeUiReviewConfig(repeatedProperty, projectRoot).scenarios[0].comparison.dom.length, 3);

  const styleInput = configV2Input();
  styleInput.scenarios[0].comparison = {
    scope: 'visual',
    mode: 'dom',
    dom: [{ selector: '.row', property: 'style.height', expected: '57px' }],
  };
  assert.equal(normalizeUiReviewConfig(styleInput, projectRoot).scenarios[0].comparison.dom[0].exact, true);
  const emptyStyle = structuredClone(styleInput);
  emptyStyle.scenarios[0].comparison.dom[0].expected = '';
  assert.throws(() => normalizeUiReviewConfig(emptyStyle, projectRoot), /计算样式期望值不能为空/u);
});

test('版本 2 配置拒绝未知交互字段、危险凭据目标、非法超时和不安全截图名称', (context) => {
  const projectRoot = createProject(context);
  const invalidCases = [
    [{ action: 'click', selector: 'button', script: 'alert(1)' }, /不支持字段/u],
    [{ action: 'fill', selector: 'input[type="password"]', value: 'secret' }, /敏感凭据/u],
    [{ action: 'click', selector: 'button', timeout: 50 }, /100 到 30000/u],
    [{ action: 'capture', name: '../outside' }, /截图名称/u],
    [{ action: 'evaluate', value: 'document.body' }, /不支持的交互动作/u],
  ];
  for (const [interaction, expected] of invalidCases) {
    const input = configV2Input();
    input.scenarios[0].interactions = [interaction];
    assert.throws(() => normalizeUiReviewConfig(input, projectRoot), expected);
  }
});

test('版本 1 字符串交互保持说明语义和原指纹来源', (context) => {
  const projectRoot = createProject(context);
  const legacy = normalizeUiReviewConfig(configInput(), projectRoot);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.scenarios[0].interactionMode, 'instructions');
  assert.deepEqual(legacy.scenarios[0].interactions, ['等待页面稳定']);
  const invalid = configInput();
  invalid.scenarios[0].interactions = [{ action: 'click', selector: 'main' }];
  assert.throws(() => normalizeUiReviewConfig(invalid, projectRoot), /字符串数组/u);
});

test('配置拒绝危险路径、重复场景、无效视口和空目标节点', (context) => {
  const projectRoot = createProject(context);
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ artifactsRoot: '../runs' }), projectRoot),
    /不能包含空路径段、\. 或 \.\./u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [configInput().scenarios[0], configInput().scenarios[0]] }), projectRoot),
    /场景 ID 重复/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], viewport: { width: 100, height: 900 } }] }), projectRoot),
    /width/u,
  );
  assert.throws(
    () => normalizeUiReviewConfig(configInput({ scenarios: [{ ...configInput().scenarios[0], targets: [] }] }), projectRoot),
    /至少要包含一个目标节点/u,
  );

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-ui-review-outside-'));
  context.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(projectRoot, 'escaped'));
  assert.throws(() => resolveSafeProjectPath(projectRoot, 'escaped/run', '测试路径'), /符号链接越出/u);
});
