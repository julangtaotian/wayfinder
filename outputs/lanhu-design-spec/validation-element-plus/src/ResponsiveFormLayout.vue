<template>
  <div
    class="responsive-project-shell"
    data-layout-project="responsive-form"
    :data-library="libraryName"
    :data-columns="currentColumns"
    :data-expanded="expanded"
  >
    <header class="responsive-project-topbar">
      <div class="responsive-project-logo">UI</div>
      <strong>运营管理后台</strong>
      <span>响应式表单真实项目验收</span>
      <div class="responsive-project-account">管理员</div>
    </header>

    <aside class="responsive-project-sidebar">
      <div class="responsive-project-nav-item is-active">筛选列表</div>
      <div class="responsive-project-nav-item">数据统计</div>
      <div class="responsive-project-nav-item">系统设置</div>
    </aside>

    <main ref="workspace" class="responsive-project-workspace">
      <section class="responsive-project-heading">
        <div>
          <p>表单布局规范 / {{ libraryName }}</p>
          <h1>体检订单查询</h1>
        </div>
        <span class="responsive-project-breakpoint">{{ currentColumns }} 列布局</span>
      </section>

      <section class="responsive-project-filter-panel">
        <el-form
          class="responsive-project-form"
          :model="form"
          label-position="left"
          @submit.prevent
        >
          <div ref="grid" class="responsive-form-grid">
            <el-form-item
              v-for="field in visibleFields"
              :key="field.key"
              class="responsive-form-field"
              :data-field-key="field.key"
              :label="field.label"
            >
              <el-input
                v-if="field.type === 'input'"
                v-model="form[field.key]"
                clearable
                :placeholder="field.placeholder"
              />
              <el-select
                v-else-if="field.type === 'select'"
                v-model="form[field.key]"
                clearable
                :placeholder="field.placeholder"
              >
                <el-option
                  v-for="option in field.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-date-picker
                v-else
                v-model="form[field.key]"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
              />
            </el-form-item>

            <div ref="actions" class="responsive-form-actions" data-operation-group="true">
              <el-button type="primary" @click="handleQuery">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
              <el-button type="text" class="responsive-form-toggle" @click="toggleExpanded">
                {{ expanded ? '收起' : '展开' }}
                <img
                  src="/assets/icons/chevron-down-24-neutral.png"
                  alt=""
                  :class="{ 'is-expanded': expanded }"
                >
              </el-button>
            </div>
          </div>
        </el-form>
        <p class="responsive-project-message" aria-live="polite">{{ actionMessage }}</p>
      </section>

      <section class="responsive-project-result">
        <header>
          <strong>查询结果</strong>
          <span>当前页面仅使用本地示例数据，不请求业务接口</span>
        </header>
        <div class="responsive-project-table-head">
          <span>客户姓名</span>
          <span>证件号码</span>
          <span>订单号码</span>
          <span>订单状态</span>
        </div>
        <div class="responsive-project-empty">请设置筛选条件后查询</div>
      </section>
    </main>
  </div>
</template>

<script>
const createInitialForm = () => ({
  dateRange: [],
  customerName: '',
  status: '',
  certificateNumber: '',
  orderNumber: '',
  paymentNumber: '',
  organization: '',
  doctorName: '',
});

export default {
  name: 'ResponsiveFormLayout',
  props: {
    libraryName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      form: createInitialForm(),
      expanded: true,
      currentColumns: 3,
      queryCount: 0,
      actionMessage: '当前为展开状态，可验证字段自动换行和操作组完整性。',
      fields: [
        { key: 'dateRange', label: '时间', type: 'date' },
        { key: 'customerName', label: '客户姓名', type: 'input', placeholder: '请输入客户姓名' },
        {
          key: 'status',
          label: '订单状态',
          type: 'select',
          placeholder: '请选择订单状态',
          options: [
            { label: '待支付', value: 'pending' },
            { label: '已完成', value: 'completed' },
          ],
        },
        { key: 'certificateNumber', label: '证件号码', type: 'input', placeholder: '请输入证件号码' },
        { key: 'orderNumber', label: '订单号码', type: 'input', placeholder: '请输入订单号码' },
        { key: 'paymentNumber', label: '支付单号', type: 'input', placeholder: '请输入支付单号' },
        {
          key: 'organization',
          label: '体检机构',
          type: 'select',
          placeholder: '请选择体检机构',
          options: [
            { label: '北京体检中心', value: 'beijing' },
            { label: '上海体检中心', value: 'shanghai' },
          ],
        },
        { key: 'doctorName', label: '开单医生', type: 'input', placeholder: '请输入医生姓名' },
      ],
    };
  },
  computed: {
    visibleFields() {
      return this.expanded ? this.fields : this.fields.slice(0, 5);
    },
  },
  mounted() {
    document.documentElement.classList.add('responsive-project-mode');
    document.body.classList.add('responsive-project-mode');
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
    // 暴露只读测量入口，浏览器验收可读取真实布局而不依赖组件内部实现。
    window.__RESPONSIVE_FORM_VALIDATION__ = Object.freeze({
      snapshot: () => this.collectSnapshot(),
      expand: () => {
        this.expanded = true;
      },
      collapse: () => {
        this.expanded = false;
      },
    });
  },
  beforeUnmount() {
    this.teardown();
  },
  beforeDestroy() {
    this.teardown();
  },
  methods: {
    handleResize() {
      const width = window.innerWidth;
      this.currentColumns = width >= 1920 ? 6 : (width >= 1440 ? 4 : 3);
    },
    toggleExpanded() {
      this.expanded = !this.expanded;
      this.actionMessage = this.expanded
        ? '已展开全部筛选字段，当前断点列数保持不变。'
        : '已收起扩展字段，操作组保持为完整单元。';
    },
    handleQuery() {
      this.queryCount += 1;
      this.actionMessage = `已执行查询 ${this.queryCount} 次，响应式布局未改变。`;
    },
    handleReset() {
      this.form = createInitialForm();
      this.expanded = false;
      this.actionMessage = '筛选条件已重置，并恢复收起状态。';
    },
    teardown() {
      window.removeEventListener('resize', this.handleResize);
      document.documentElement.classList.remove('responsive-project-mode');
      document.body.classList.remove('responsive-project-mode');
      delete window.__RESPONSIVE_FORM_VALIDATION__;
    },
    collectSnapshot() {
      const workspace = this.$refs.workspace;
      const grid = this.$refs.grid;
      const actions = this.$refs.actions;
      const workspaceRect = workspace.getBoundingClientRect();
      const gridStyle = window.getComputedStyle(grid);
      const fieldRects = [...grid.querySelectorAll('.responsive-form-field')]
        .map((field) => {
          const rect = field.getBoundingClientRect();
          const labelElement = field.querySelector('.el-form-item__label');
          const controlElement = field.querySelector('.el-form-item__content');
          const labelBox = labelElement.getBoundingClientRect();
          const controlBox = controlElement.getBoundingClientRect();
          const labelPaddingRight = Number.parseFloat(window.getComputedStyle(labelElement).paddingRight);
          const visibleLabelRight = labelBox.right - labelPaddingRight;
          return {
            key: field.dataset.fieldKey,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            labelRect: { x: labelBox.x, y: labelBox.y, width: labelBox.width - labelPaddingRight, height: labelBox.height },
            controlRect: { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height },
            labelLeftOfControl: visibleLabelRight < controlBox.left,
            labelGap: controlBox.left - visibleLabelRight,
            verticalCenterDelta: (labelBox.top + labelBox.height / 2) - (controlBox.top + controlBox.height / 2),
            singleLine: Math.abs((labelBox.top + labelBox.height / 2) - (controlBox.top + controlBox.height / 2)) <= 2,
          };
        });
      const actionRect = actions.getBoundingClientRect();
      return {
        library: this.libraryName,
        runtime: document.documentElement.dataset.validationLibrary || '',
        viewport: { width: window.innerWidth, height: window.innerHeight },
        columns: gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
        expectedColumns: this.currentColumns,
        columnGap: Number.parseFloat(gridStyle.columnGap),
        expanded: this.expanded,
        fieldCount: fieldRects.length,
        fieldRects,
        actionRect: {
          x: actionRect.x,
          y: actionRect.y,
          width: actionRect.width,
          height: actionRect.height,
        },
        workspace: {
          x: workspaceRect.x,
          y: workspaceRect.y,
          width: workspaceRect.width,
          height: workspaceRect.height,
          rightGap: window.innerWidth - workspaceRect.right,
          bottomGap: window.innerHeight - workspaceRect.bottom,
          background: window.getComputedStyle(workspace).backgroundColor,
          borderRadius: window.getComputedStyle(workspace).borderRadius,
        },
        components: {
          form: Boolean(this.$el.querySelector('.el-form')),
          input: Boolean(this.$el.querySelector('.el-input')),
          select: Boolean(this.$el.querySelector('.el-select')),
          datePicker: Boolean(this.$el.querySelector('.el-date-editor')),
          button: Boolean(this.$el.querySelector('.el-button')),
        },
        horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      };
    },
  },
};
</script>

<style>
html.responsive-project-mode,
html.responsive-project-mode body,
html.responsive-project-mode #app {
  width: 100%;
  min-width: 1024px;
  min-height: 100%;
}

html.responsive-project-mode body {
  overflow: hidden;
}

.responsive-project-shell {
  position: relative;
  width: 100vw;
  min-width: 1024px;
  height: 100vh;
  min-height: 768px;
  overflow: hidden;
  color: #222222;
  background: #EEF1F5;
}

.responsive-project-topbar {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: 32px;
  padding: 0 16px;
  align-items: center;
  gap: 12px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8E8E8;
}

.responsive-project-logo {
  display: grid;
  width: 24px;
  height: 24px;
  color: #FFFFFF;
  background: #FF6014;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  place-items: center;
}

.responsive-project-topbar strong {
  font-size: 14px;
}

.responsive-project-topbar > span,
.responsive-project-account {
  color: #666666;
  font-size: 12px;
}

.responsive-project-account {
  margin-left: auto;
}

.responsive-project-sidebar {
  position: absolute;
  top: 32px;
  bottom: 0;
  left: 0;
  width: 108px;
  padding: 16px 8px;
  background: #FFFFFF;
  border-right: 1px solid #E8E8E8;
}

.responsive-project-nav-item {
  height: 36px;
  margin-bottom: 4px;
  padding: 0 10px;
  color: #666666;
  border-radius: 4px;
  font-size: 13px;
  line-height: 36px;
}

.responsive-project-nav-item.is-active {
  color: #FF6014;
  background: #FDF4EE;
}

.responsive-project-workspace {
  position: absolute;
  top: 48px;
  right: 16px;
  bottom: 16px;
  left: 124px;
  min-width: 0;
  padding: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  background: #FAFBFC;
  border-radius: 4px;
}

.responsive-project-heading {
  display: flex;
  min-height: 48px;
  margin-bottom: 16px;
  align-items: flex-start;
  justify-content: space-between;
}

.responsive-project-heading p {
  margin: 0 0 2px;
  color: #999999;
  font-size: 12px;
}

.responsive-project-heading h1 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
}

.responsive-project-breakpoint {
  padding: 4px 10px;
  color: #FF6014;
  background: #FDF4EE;
  border-radius: 12px;
  font-size: 12px;
  line-height: 16px;
}

.responsive-project-filter-panel,
.responsive-project-result {
  padding: 16px;
  background: #FFFFFF;
  border: 1px solid #E8E8E8;
  border-radius: 4px;
}

.responsive-form-grid {
  display: grid;
  min-width: 0;
  align-items: end;
  column-gap: 8px;
  row-gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.responsive-project-form .responsive-form-field {
  display: flex;
  height: 32px;
  min-width: 0;
  align-items: center;
  margin-bottom: 0;
}

.responsive-project-form .responsive-form-field .el-form-item__label {
  height: 32px;
  padding: 0 12px 0 0;
  color: #666666;
  flex: 0 0 auto;
  line-height: 32px;
  white-space: nowrap;
}

.responsive-project-form .responsive-form-field .el-form-item__content {
  display: flex;
  height: 32px;
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 0 !important;
  line-height: 32px;
}

.responsive-project-form .responsive-form-field .el-input,
.responsive-project-form .responsive-form-field .el-select,
.responsive-project-form .responsive-form-field .el-date-editor {
  width: 100%;
  max-width: none;
}

.responsive-form-actions {
  display: flex;
  min-width: 236px;
  height: 32px;
  align-items: center;
  white-space: nowrap;
}

.responsive-form-actions .el-button + .el-button {
  margin-left: 8px;
}

.responsive-project-form .responsive-form-actions .el-button--primary {
  color: #FFFFFF;
  background: #FF6014;
  border-color: #FF6014;
}

.responsive-form-toggle img {
  width: 16px;
  height: 16px;
  margin-left: 4px;
  transition: transform 160ms ease;
}

.responsive-form-toggle img.is-expanded {
  transform: rotate(180deg);
}

.responsive-project-message {
  min-height: 20px;
  margin: 12px 0 0;
  color: #999999;
  font-size: 12px;
  line-height: 20px;
}

.responsive-project-result {
  margin-top: 16px;
}

.responsive-project-result > header {
  display: flex;
  height: 32px;
  align-items: flex-start;
  justify-content: space-between;
}

.responsive-project-result > header span {
  color: #999999;
  font-size: 12px;
}

.responsive-project-table-head {
  display: grid;
  height: 40px;
  padding: 0 16px;
  align-items: center;
  color: #666666;
  background: #F5F6F8;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.responsive-project-empty {
  display: grid;
  height: 96px;
  color: #999999;
  place-items: center;
}

@media (min-width: 1440px) {
  .responsive-form-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1920px) {
  .responsive-form-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
</style>
