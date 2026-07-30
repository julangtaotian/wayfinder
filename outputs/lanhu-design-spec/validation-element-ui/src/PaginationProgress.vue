<!-- AI-code-start lines:621 tool:Codex -->
<template>
  <div class="pagination-progress-spec">
    <div
      v-if="componentId === 'pagination'"
      class="pagination-matrix"
      :class="{ 'is-full-matrix': index >= 8, 'is-small-matrix': index === 10 }"
    >
      <div
        v-for="(row, rowIndex) in paginationRows"
        :key="`${rowIndex}-${row.background}-${row.small}`"
        class="pagination-row"
        :class="{
          'is-small': row.small,
          'is-background': row.background,
          'is-background-start': row.backgroundStart,
        }"
      >
        <span v-if="row.total" class="pagination-total">共 6532 条</span>
        <el-select
          v-if="row.sizes"
          v-model="pageSize"
          class="pagination-size-select"
          aria-label="每页条数"
        >
          <el-option label="100/page" :value="100" />
        </el-select>
        <!-- 页码交互始终由真实 ElPagination 提供，外围信息区按蓝湖组合顺序拼装。 -->
        <el-pagination
          class="spec-pagination"
          :class="{ 'is-small-pagination': row.small }"
          :current-page="row.current"
          :page-size="row.pageSize"
          :total="row.pages * row.pageSize"
          :pager-count="7"
          :small="row.small"
          :background="row.background"
          layout="prev, pager, next"
        />
        <div v-if="row.jumper" class="pagination-jumper">
          <span>前往</span>
          <el-input :value="'2'" aria-label="跳转页码" />
          <span>页</span>
        </div>
      </div>
    </div>

    <div v-else class="progress-spec" :class="`is-scene-${index}`">
      <div v-if="index === 1" class="progress-stack">
        <el-progress
          v-for="(item, itemIndex) in lineProgressItems"
          :key="itemIndex"
          class="progress-linear"
          :percentage="item.percentage"
          :status="item.status"
          :color="item.color"
          :stroke-width="6"
          :format="item.label ? () => item.label : undefined"
        />
      </div>

      <div v-else-if="index === 2" class="progress-stack">
        <el-progress
          v-for="(item, itemIndex) in insideProgressItems"
          :key="itemIndex"
          class="progress-inside"
          :percentage="item.percentage"
          :color="item.color"
          :text-inside="true"
          :stroke-width="24"
        />
      </div>

      <div v-else-if="index === 3" class="custom-color-layout">
        <div class="progress-stack">
          <el-progress
            v-for="(item, itemIndex) in customColorItems"
            :key="itemIndex"
            class="progress-linear"
            :percentage="20"
            :color="item"
            :stroke-width="6"
          />
        </div>
        <el-button-group class="progress-action-group" aria-label="自定义进度条操作">
          <el-button aria-label="默认搜索"><i class="el-icon-search" /></el-button>
          <el-button class="is-brand-action" aria-label="品牌搜索"><i class="el-icon-search" /></el-button>
        </el-button-group>
      </div>

      <div v-else-if="index === 4" class="progress-circle-row">
        <el-progress
          v-for="(item, itemIndex) in circleProgressItems"
          :key="itemIndex"
          type="circle"
          :width="120"
          :stroke-width="6"
          :percentage="item.percentage"
          :status="item.status"
          :color="item.color"
          :show-text="itemIndex !== 0"
        />
      </div>

      <div v-else class="custom-content-layout">
        <el-progress
          class="progress-linear custom-tail-progress"
          :percentage="10"
          color="#FF6014"
          :stroke-width="6"
          :format="() => 'content'"
        />
        <el-progress
          class="progress-inside"
          :percentage="50"
          color="#F53F3F"
          :text-inside="true"
          :stroke-width="24"
        />
        <div class="custom-circle-row">
          <div class="custom-circle">
            <el-progress
              type="circle"
              :width="120"
              :stroke-width="6"
              :percentage="100"
              status="success"
              :show-text="false"
            />
            <i class="el-icon-check custom-success-icon" />
          </div>
          <div class="custom-circle">
            <el-progress
              type="circle"
              :width="120"
              :stroke-width="6"
              :percentage="80"
              color="#FF6014"
              :show-text="false"
            />
            <span class="progressing-copy"><strong>80%</strong><small>Progressing</small></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const paginationLayouts = [
  { total: true },
  { sizes: true },
  { total: true, sizes: true },
  { jumper: true },
  { total: true, jumper: true },
  { sizes: true, jumper: true },
  { total: true, sizes: true, jumper: true },
];

export default {
  name: 'PaginationProgress',
  props: {
    componentId: { type: String, required: true },
    index: { type: Number, required: true },
  },
  data() {
    return {
      pageSize: 100,
    };
  },
  computed: {
    paginationRows() {
      if (this.index <= 7) return [this.createPaginationRow(paginationLayouts[this.index - 1])];
      if (this.index === 8) return paginationLayouts.map((layout) => this.createPaginationRow(layout));
      if (this.index === 9) {
        return paginationLayouts.map((layout) => this.createPaginationRow(layout, { background: true }));
      }
      const normalRows = paginationLayouts.map((layout) => this.createPaginationRow(layout, { small: true }));
      const backgroundRows = paginationLayouts.map((layout, rowIndex) => this.createPaginationRow(layout, {
        small: true,
        background: true,
        backgroundStart: rowIndex === 0,
      }));
      return [...normalRows, ...backgroundRows];
    },
    lineProgressItems() {
      return [
        { percentage: 50, color: '#FF6014' },
        { percentage: 100, color: '#FF6014', label: 'Full' },
        { percentage: 100, status: 'success' },
        { percentage: 100, status: 'warning' },
        { percentage: 50, status: 'exception' },
      ];
    },
    insideProgressItems() {
      return [
        { percentage: 50, color: '#FF6014' },
        { percentage: 100, color: '#00B42A' },
        { percentage: 50, color: '#E6A23C' },
        { percentage: 50, color: '#F53F3F' },
      ];
    },
    customColorItems() {
      return ['#FF6014', '#999999', '#E6A23C'];
    },
    circleProgressItems() {
      return [
        { percentage: 0 },
        { percentage: 25, color: '#FF6014' },
        { percentage: 100, status: 'success' },
        { percentage: 100, status: 'warning' },
        { percentage: 100, status: 'exception' },
      ];
    },
  },
  methods: {
    createPaginationRow(layout, options = {}) {
      const small = Boolean(options.small);
      const background = Boolean(options.background);
      return {
        ...layout,
        ...options,
        small,
        background,
        current: background ? 1 : small ? 6 : 5,
        pages: background ? (small ? 5 : 100) : 10,
        pageSize: small ? 10 : 100,
      };
    },
  },
};
</script>

<style scoped>
.pagination-progress-spec {
  color: #666666;
  font-size: 14px;
}

.pagination-matrix,
.progress-stack {
  display: grid;
}

.pagination-matrix {
  gap: 25px;
}

.pagination-matrix.is-full-matrix {
  margin-top: 20px;
  margin-left: 20px;
}

.pagination-matrix.is-small-matrix {
  gap: 32px;
}

.pagination-row {
  display: flex;
  width: max-content;
  height: 32px;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.pagination-row.is-small {
  height: 24px;
  font-size: 12px;
}

.pagination-row.is-background-start {
  margin-top: 48px;
}

.pagination-total {
  line-height: 20px;
}

.pagination-size-select {
  width: 128px !important;
}

.pagination-row.is-small .pagination-size-select {
  width: 100px !important;
}

.pagination-size-select /deep/ .el-input,
.pagination-size-select /deep/ .el-input__inner {
  width: 128px;
}

.pagination-size-select /deep/ .el-input__inner {
  height: 32px;
  padding: 0 32px 0 12px;
  border-color: #DCDCDC;
  border-radius: 2px;
  line-height: 32px;
}

.pagination-row.is-small .pagination-size-select /deep/ .el-input,
.pagination-row.is-small .pagination-size-select /deep/ .el-input__inner {
  width: 100px;
}

.pagination-row.is-small .pagination-size-select /deep/ .el-input__inner {
  height: 24px;
  padding: 0 28px 0 10px;
  font-size: 12px;
  line-height: 24px;
}

.spec-pagination.el-pagination {
  display: flex;
  height: 32px;
  padding: 0;
  align-items: center;
  color: #666666;
  font-size: 14px;
}

.spec-pagination /deep/ .el-pager {
  display: flex;
  align-items: center;
}

.spec-pagination /deep/ .btn-prev,
.spec-pagination /deep/ .btn-next,
.spec-pagination /deep/ .el-pager li {
  width: 32px;
  min-width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  color: #666666;
  background: transparent;
  border-radius: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 32px;
}

.spec-pagination:not(.is-background) /deep/ .el-pager li.active {
  color: #666666;
  font-weight: 400;
}

.spec-pagination:not(.is-background) /deep/ .el-pager li:first-child {
  color: #FF6014;
}

.spec-pagination.is-background /deep/ .btn-prev,
.spec-pagination.is-background /deep/ .btn-next,
.spec-pagination.is-background /deep/ .el-pager li {
  margin: 0 4px;
  background: #F5F6F8;
  border-radius: 0;
}

.spec-pagination.is-background /deep/ .el-pager li.active {
  color: #FFFFFF;
  background: #FF6014;
}

.spec-pagination /deep/ button:disabled {
  color: #CCCCCC;
}

.spec-pagination.is-small-pagination {
  height: 24px;
  font-size: 12px;
}

.spec-pagination.is-small-pagination /deep/ .btn-prev,
.spec-pagination.is-small-pagination /deep/ .btn-next,
.spec-pagination.is-small-pagination /deep/ .el-pager li {
  width: 24px;
  min-width: 24px;
  height: 24px;
  font-size: 12px;
  line-height: 24px;
}

.spec-pagination.is-small-pagination.is-background /deep/ .btn-prev,
.spec-pagination.is-small-pagination.is-background /deep/ .btn-next,
.spec-pagination.is-small-pagination.is-background /deep/ .el-pager li {
  margin: 0 3px;
}

.pagination-jumper {
  display: flex;
  height: 32px;
  align-items: center;
  gap: 8px;
}

.pagination-jumper .el-input,
.pagination-jumper /deep/ .el-input__inner {
  width: 56px !important;
}

.pagination-jumper /deep/ .el-input__inner {
  height: 32px;
  padding: 0 8px;
  border-color: #DCDCDC;
  border-radius: 2px;
  line-height: 32px;
  text-align: center;
}

.pagination-row.is-small .pagination-jumper {
  height: 24px;
  gap: 6px;
}

.pagination-row.is-small .pagination-jumper .el-input,
.pagination-row.is-small .pagination-jumper /deep/ .el-input__inner {
  width: 40px !important;
}

.pagination-row.is-small .pagination-jumper /deep/ .el-input__inner {
  height: 24px;
  padding: 0 6px;
  font-size: 12px;
  line-height: 24px;
}

.progress-stack {
  gap: 14px;
}

.progress-spec {
  margin-left: 20px;
}

.progress-spec.is-scene-1 .progress-stack {
  gap: 20px;
}

.progress-spec.is-scene-3 .progress-stack {
  gap: 24px;
}

.progress-linear {
  width: 335px !important;
  max-width: none !important;
}

.progress-inside {
  width: 300px !important;
  max-width: none !important;
}

.progress-linear /deep/ .el-progress-bar {
  width: 300px;
  flex: 0 0 300px;
  margin-right: 0;
  padding-right: 0;
}

.progress-inside /deep/ .el-progress-bar {
  width: 100%;
  margin-right: 0;
  padding-right: 0;
}

.progress-linear /deep/ .el-progress-bar__outer,
.progress-inside /deep/ .el-progress-bar__outer {
  background: #F5F6F8 !important;
}

.progress-linear /deep/ .el-progress__text {
  min-width: 30px;
  margin-left: 4px;
  color: #666666;
  font-size: 14px !important;
}

.progress-linear.is-success /deep/ .el-progress-bar__inner,
.progress-circle-row /deep/ .el-progress.is-success .el-progress-circle__path {
  background-color: #00B42A !important;
  stroke: #00B42A !important;
}

.progress-linear.is-warning /deep/ .el-progress-bar__inner,
.progress-circle-row /deep/ .el-progress.is-warning .el-progress-circle__path {
  background-color: #E6A23C !important;
  stroke: #E6A23C !important;
}

.progress-linear.is-exception /deep/ .el-progress-bar__inner,
.progress-circle-row /deep/ .el-progress.is-exception .el-progress-circle__path {
  background-color: #F53F3F !important;
  stroke: #F53F3F !important;
}

.progress-linear.is-success /deep/ .el-progress__text,
.progress-circle-row /deep/ .el-progress.is-success .el-progress__text {
  color: #00B42A !important;
}

.progress-linear.is-warning /deep/ .el-progress__text,
.progress-circle-row /deep/ .el-progress.is-warning .el-progress__text {
  color: #E6A23C !important;
}

.progress-linear.is-exception /deep/ .el-progress__text,
.progress-circle-row /deep/ .el-progress.is-exception .el-progress__text {
  color: #F53F3F !important;
}

.progress-inside /deep/ .el-progress-bar__innerText {
  color: #FFFFFF !important;
  font-size: 12px;
}

.el-progress__text i {
  color: inherit !important;
}

.custom-color-layout {
  display: grid;
  gap: 20px;
}

.progress-action-group {
  width: max-content;
}

.progress-action-group /deep/ .el-button {
  width: 56px;
  height: 40px;
  padding: 0;
  background: #FFFFFF;
  border-color: #DCDCDC;
}

.progress-action-group /deep/ .el-button.is-brand-action {
  color: #FF6014;
  background: #FFF7F2;
  border-color: #FF6014;
}

.progress-circle-row,
.custom-circle-row {
  display: flex;
  width: max-content;
  align-items: center;
  gap: 16px;
}

.progress-circle-row /deep/ .el-progress,
.custom-circle /deep/ .el-progress {
  width: 120px !important;
  max-width: none !important;
}

.progress-circle-row /deep/ .el-progress-circle__track,
.custom-circle /deep/ .el-progress-circle__track {
  stroke: #F5F6F8;
}

.custom-circle /deep/ .el-progress.is-success .el-progress-circle__path {
  stroke: #00B42A !important;
}

.custom-content-layout {
  display: grid;
  gap: 14px;
}

.custom-tail-progress /deep/ .el-progress__text {
  width: 30px;
  min-width: 30px;
  overflow-wrap: anywhere;
  color: #FF6014;
  line-height: 20px;
}

.custom-circle {
  position: relative;
  width: 120px;
  height: 120px;
}

.custom-success-icon,
.progressing-copy {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.custom-success-icon {
  display: grid;
  width: 34px;
  height: 34px;
  color: #FFFFFF;
  background: #00B42A;
  border-radius: 50%;
  font-size: 22px;
  line-height: 34px;
  text-align: center;
}

.progressing-copy {
  display: grid;
  color: #666666;
  text-align: center;
}

.progressing-copy strong {
  font-size: 28px;
  font-weight: 400;
  line-height: 34px;
}

.progressing-copy small {
  font-size: 12px;
  line-height: 18px;
}
</style>
