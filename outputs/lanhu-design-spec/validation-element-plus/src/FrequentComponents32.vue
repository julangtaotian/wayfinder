<!-- AI-code-start lines:437 tool:Codex -->
<template>
  <div class="frequent-preview" :class="`frequent-scene-${index}`">
    <div v-if="index === 1" class="frequent-row frequent-buttons">
      <el-button type="primary">按钮</el-button>
      <el-button type="primary" plain>按钮</el-button>
      <el-button>按钮</el-button>
      <el-button disabled>按钮</el-button>
    </div>

    <el-radio-group v-else-if="index === 2" v-model="radioValue" class="frequent-row frequent-options">
      <el-radio value="first">备选项</el-radio>
      <el-radio value="second">备选项</el-radio>
    </el-radio-group>

    <el-radio-group v-else-if="index === 3" v-model="segmentValue" class="frequent-segments">
      <el-radio-button v-for="item in fourOptions" :key="item" :value="item">选项</el-radio-button>
    </el-radio-group>

    <div v-else-if="index === 4" class="frequent-row frequent-options">
      <el-checkbox v-model="unchecked">备选项</el-checkbox>
      <el-checkbox v-model="checked">备选项</el-checkbox>
    </div>

    <div v-else-if="index === 5" class="frequent-row frequent-wide-pair">
      <el-input v-model="emptyText" placeholder="请输入" />
      <el-input v-model="filledText" />
    </div>

    <div v-else-if="index === 6" class="frequent-row frequent-wide-pair">
      <el-select v-model="emptySelect" placeholder="请选择"><el-option label="已选择" value="selected" /></el-select>
      <el-select v-model="selectedValue"><el-option label="已选择" value="selected" /></el-select>
    </div>

    <div v-else-if="index === 7" class="frequent-row frequent-wide-pair">
      <el-date-picker v-model="emptyDate" type="date" placeholder="选择日期" format="YYYY-MM-DD" />
      <el-date-picker v-model="filledDate" type="date" format="YYYY-MM-DD" />
    </div>

    <el-input-number v-else-if="index === 8" v-model="numberValue" :precision="2" :step="1" />

    <div v-else-if="index === 9" class="frequent-row frequent-switches">
      <el-switch v-model="switchOn" />
      <el-switch v-model="switchOff" />
    </div>

    <el-upload v-else-if="index === 10" class="frequent-upload" action="#" :auto-upload="false" :file-list="uploadFiles">
      <el-button type="primary">点击上传</el-button>
      <template #tip><div class="el-upload__tip">只能上传jpg/png文件，且不超过500kb</div></template>
    </el-upload>

    <div v-else-if="index === 11" class="frequent-table-scene">
      <el-table :data="tableData">
        <el-table-column prop="date" label="表头" width="200" sortable />
        <el-table-column prop="name" label="表头" width="150" />
        <el-table-column prop="address" label="表头" />
      </el-table>
    </div>

    <div v-else-if="index === 12" class="frequent-pagination">
      <span>共6532条</span>
      <el-select v-model="pageSize" class="frequent-page-size"><el-option label="10条/页" :value="10" /></el-select>
      <el-pagination v-model:current-page="currentPage" layout="prev, pager, next" :page-size="10" :total="50" />
      <span>前往</span>
      <el-input v-model="jumpPage" class="frequent-jump-input" />
      <span>页</span>
    </div>

    <div v-else-if="index === 13" class="frequent-row frequent-tags">
      <el-tag>默认</el-tag>
      <el-tag type="success">成功</el-tag>
      <el-tag type="info">信息</el-tag>
      <el-tag type="warning">警告</el-tag>
      <el-tag type="danger">错误</el-tag>
    </div>

    <el-tabs v-else-if="index === 14" v-model="tabValue" type="border-card" class="frequent-tabs">
      <el-tab-pane v-for="item in fiveTabs" :key="item" label="标签页" :name="item" />
    </el-tabs>

    <el-alert
      v-else-if="index === 15"
      class="frequent-alert"
      :title="evidenceState === 'Error' ? '错误提示的文案' : '中性提示的文案'"
      :type="evidenceState === 'Error' ? 'error' : 'warning'"
      show-icon
    />

    <div v-else-if="index === 16" class="frequent-dialog-host">
      <el-dialog
        v-model="dialogVisible"
        class="frequent-dialog"
        title="标题名称"
        width="480px"
        top="0"
        :modal="false"
        :teleported="false"
        :lock-scroll="false"
        :close-on-click-modal="false"
      >
        <p>描述文字</p>
        <template #footer><el-button>取消</el-button><el-button type="primary">确定</el-button></template>
      </el-dialog>
    </div>

    <div v-else-if="index === 17" class="frequent-tooltip-host">
      <el-tooltip content="Top Center 提示文字" placement="top" :visible="evidenceMode" :teleported="false">
        <span class="frequent-overlay-anchor" aria-label="提示触发目标" />
      </el-tooltip>
    </div>

    <div v-else class="frequent-popconfirm-host">
      <el-popconfirm
        title="这是一段内容，确定要删除吗？"
        confirm-button-text="确定"
        cancel-button-text="取消"
        :visible="evidenceMode"
        :teleported="false"
        :width="220"
        popper-class="frequent-popconfirm-popper"
      >
        <template #reference><span class="frequent-overlay-anchor" aria-label="删除触发目标" /></template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FrequentComponents32',
  props: {
    index: { type: Number, required: true },
    evidenceMode: { type: Boolean, default: false },
    evidenceState: { type: String, default: 'Default' },
  },
  data() {
    return {
      radioValue: 'second',
      segmentValue: 'one',
      fourOptions: ['one', 'two', 'three', 'four'],
      fiveTabs: ['one', 'two', 'three', 'four', 'five'],
      unchecked: false,
      checked: true,
      emptyText: '',
      filledText: '已输入',
      emptySelect: '',
      selectedValue: 'selected',
      emptyDate: null,
      filledDate: new Date(2021, 4, 6),
      numberValue: 1,
      switchOn: true,
      switchOff: false,
      currentPage: 2,
      pageSize: 10,
      jumpPage: '2',
      tabValue: 'three',
      dialogVisible: true,
      uploadFiles: [
        { name: '这是附件的文件名.jpg', url: '#', status: 'success' },
        { name: '这是附件的文件名.jpg', url: '#', status: 'success' },
      ],
      tableData: [{ date: '2016-05-03', name: '张晨峰', address: '广东省深圳市南山区粤海大道 1 号' }],
    };
  },
};
</script>

<style scoped>
.frequent-preview {
  display: flex;
  width: max-content;
  color: #4D4D4D;
  font-size: 14px;
  line-height: 22px;
  align-items: center;
}

.frequent-row {
  display: flex;
  gap: 16px;
  align-items: center;
}

.frequent-buttons :deep(.el-button) {
  min-width: 60px;
  padding: 0 15px;
}

.frequent-buttons :deep(.el-button--primary.is-plain) {
  color: #FF6014;
  background: #FFFFFF;
  border-color: #FF6014;
}

.frequent-buttons :deep(.el-button.is-disabled) {
  color: #C5C5C5;
  background: #FFFFFF;
  border-color: #DCDCDC;
}

.frequent-options {
  gap: 20px;
}

.frequent-options :deep(.el-radio),
.frequent-options :deep(.el-checkbox) {
  margin-right: 0;
}

.frequent-segments :deep(.el-radio-button__inner) {
  min-width: 59px;
  height: 32px;
  padding: 8px 16px;
  line-height: 14px;
  border-radius: 0;
}

.frequent-wide-pair {
  gap: 16px;
}

.frequent-wide-pair :deep(.el-input),
.frequent-wide-pair :deep(.el-select),
.frequent-wide-pair :deep(.el-date-editor) {
  width: 240px;
}

.frequent-scene-8 :deep(.el-input-number),
.frequent-scene-8 :deep(.el-input) {
  width: 150px;
}

.frequent-switches {
  gap: 16px;
}

.frequent-switches :deep(.el-switch) {
  --el-switch-on-color: #FF6014;
  --el-switch-off-color: #DCDCDC;
}

.frequent-upload {
  width: 360px;
}

.frequent-upload :deep(.el-upload__tip) {
  margin: 8px 0 4px;
  color: #777777;
}

.frequent-upload :deep(.el-upload-list__item) {
  width: 350px;
  margin-top: 6px;
}

.frequent-upload :deep(.el-upload-list__item-status-label),
.frequent-upload :deep(.el-icon--close) {
  color: #00B42A;
}

.frequent-table-scene {
  width: 776px;
}

.frequent-table-scene :deep(.el-table) {
  --el-table-header-bg-color: #F5F7FA;
  --el-table-row-hover-bg-color: #FFFFFF;
  color: #4D4D4D;
}

.frequent-table-scene :deep(.el-table__cell) {
  height: 40px;
  padding: 0 12px;
}

.frequent-pagination {
  display: flex;
  width: 650px;
  gap: 8px;
  align-items: center;
  white-space: nowrap;
}

.frequent-pagination :deep(.frequent-page-size) {
  width: 96px !important;
}

.frequent-pagination :deep(.frequent-jump-input) {
  width: 68px !important;
}

.frequent-pagination :deep(.el-pagination) {
  display: flex;
  gap: 8px;
}

.frequent-pagination :deep(.el-pager),
.frequent-pagination :deep(.el-pagination button) {
  display: flex;
  gap: 8px;
}

.frequent-pagination :deep(.el-pager li),
.frequent-pagination :deep(.el-pagination button) {
  min-width: 32px;
  height: 32px;
  margin: 0;
  background: #FFFFFF;
  border: 1px solid #DCDCDC;
}

.frequent-pagination :deep(.el-pager li.is-active) {
  color: #FFFFFF;
  background: #FF6014;
  border-color: #FF6014;
}

.frequent-tags {
  gap: 16px;
}

.frequent-tags :deep(.el-tag) {
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
}

.frequent-tags :deep(.el-tag:not([class*="el-tag--"])) {
  color: #FF6014;
  background: #FFF7F0;
}

.frequent-tags :deep(.el-tag:first-child) {
  color: #FF6014;
  background: #FFF7F0;
}

.frequent-tabs {
  width: 410px;
  border: 0;
  box-shadow: none;
}

.frequent-tabs :deep(.el-tabs__content) {
  display: none;
}

.frequent-tabs :deep(.el-tabs__item) {
  width: 82px;
  height: 40px;
  padding: 0;
  text-align: center;
}

.frequent-alert {
  width: 400px;
  height: 40px;
  color: #666666;
  background: #FFF7F0;
}

.frequent-alert :deep(.el-alert__icon) {
  color: #FF6014;
}

.frequent-dialog-host {
  width: 480px;
  height: 190px;
}

.frequent-dialog-host :deep(.el-overlay-dialog) {
  position: static;
  overflow: visible;
}

.frequent-dialog-host :deep(.el-dialog) {
  margin: 0;
  border-radius: 2px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.frequent-dialog-host :deep(.el-dialog__header) {
  height: 56px;
  margin: 0;
  padding: 18px 20px 14px;
}

.frequent-dialog-host :deep(.el-dialog__body) {
  min-height: 78px;
  padding: 16px 20px;
}

.frequent-dialog-host :deep(.el-dialog__body p) {
  margin: 0;
}

.frequent-dialog-host :deep(.el-dialog__footer) {
  padding: 0 20px 20px;
}

.frequent-tooltip-host,
.frequent-popconfirm-host {
  position: relative;
  width: 220px;
  min-height: 60px;
}

.frequent-overlay-anchor {
  display: block;
  width: 1px;
  height: 1px;
  margin: 52px auto 0;
}

.frequent-tooltip-host :deep(.el-popper) {
  color: #FFFFFF;
  background: #303133;
}
</style>

<style>
.frequent-popconfirm-popper .el-button--primary {
  color: #FFFFFF;
  background: #FF6014;
  border-color: #FF6014;
}

.frequent-popconfirm-popper .el-button:not(.el-button--primary) {
  color: #FF6014;
}

.frequent-popconfirm-popper {
  width: 220px !important;
  box-sizing: border-box;
  font-size: 12px;
}
</style>
