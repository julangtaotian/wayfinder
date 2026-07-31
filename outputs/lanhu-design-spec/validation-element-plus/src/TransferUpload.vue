<template>
  <div class="transfer-upload-spec">
    <div
      v-if="componentId === 'transfer'"
      class="transfer-spec"
      :class="{ 'has-button-copy': hasButtonCopy, 'has-footer': hasFooter }"
    >
      <!-- 蓝湖要求两侧同时展示完整列表，因此用组件库输入框、复选框和按钮组合可交互面板。 -->
      <section class="transfer-panel" aria-label="列表1">
        <header class="transfer-panel__header">
          <el-checkbox
            :model-value="leftSelection.length === 13"
            aria-label="全选列表1"
            @change="toggleAll('left', $event)"
          />
          <strong>列表1</strong>
          <span>{{ leftSelection.length }}/13</span>
        </header>
        <div v-if="hasSearch" class="transfer-panel__search">
          <el-input v-model="leftFilter" :prefix-icon="Search" placeholder="请输入" clearable />
        </div>
        <el-checkbox-group v-model="leftSelection" class="transfer-panel__list">
          <el-checkbox v-for="item in visibleLeftItems" :key="item" :value="item">
            备选项 {{ item }}
          </el-checkbox>
        </el-checkbox-group>
        <footer v-if="hasFooter" class="transfer-panel__footer">
          <el-button size="small">按钮</el-button>
        </footer>
      </section>

      <div class="transfer-actions" aria-label="穿梭操作">
        <el-button type="primary" aria-label="移动到左侧" @click="clearSelection('right')">
          <template v-if="hasButtonCopy">
            <el-icon><Search /></el-icon>
            <span>按钮</span>
          </template>
          <el-icon v-else><ArrowLeft /></el-icon>
        </el-button>
        <el-button type="primary" aria-label="移动到右侧" @click="clearSelection('left')">
          <template v-if="hasButtonCopy">
            <span>按钮</span>
            <el-icon><Search /></el-icon>
          </template>
          <el-icon v-else><ArrowRight /></el-icon>
        </el-button>
      </div>

      <section class="transfer-panel" aria-label="列表2">
        <header class="transfer-panel__header">
          <el-checkbox
            :model-value="rightSelection.length === 13"
            aria-label="全选列表2"
            @change="toggleAll('right', $event)"
          />
          <strong>列表2</strong>
          <span>{{ rightSelection.length }}/13</span>
        </header>
        <div v-if="hasSearch" class="transfer-panel__search">
          <el-input v-model="rightFilter" :prefix-icon="Search" placeholder="请输入" clearable />
        </div>
        <el-checkbox-group v-model="rightSelection" class="transfer-panel__list">
          <el-checkbox v-for="item in visibleRightItems" :key="item" :value="item">
            备选项 {{ item }}
          </el-checkbox>
        </el-checkbox-group>
        <footer v-if="hasFooter" class="transfer-panel__footer">
          <el-button size="small">按钮</el-button>
        </footer>
      </section>
    </div>

    <div v-else class="upload-spec" :class="`is-scene-${index}`">
      <template v-if="index === 1">
        <el-upload action="#" :auto-upload="false" :show-file-list="false">
          <el-button type="primary">点击上传</el-button>
        </el-upload>
        <div class="upload-file-row">
          <el-icon><Document /></el-icon>
          <span>这是附件的文件名.jpg</span>
          <el-icon class="is-success"><CircleCheck /></el-icon>
        </div>
      </template>

      <template v-else-if="index === 2">
        <el-upload
          class="avatar-upload"
          action="#"
          list-type="picture-card"
          :auto-upload="false"
          :show-file-list="false"
        >
          <el-icon><Plus /></el-icon>
        </el-upload>
      </template>

      <template v-else-if="index === 3">
        <el-upload action="#" :auto-upload="false" :show-file-list="false">
          <el-button type="primary">点击上传</el-button>
        </el-upload>
        <p class="upload-limit">只能上传jpg/png文件，且不超过500kb</p>
        <div class="upload-picture-row">
          <div class="upload-picture-placeholder"><el-icon><Picture /></el-icon></div>
          <span>这是一张图片.jpeg</span>
          <span class="upload-success-corner">
            <img src="/assets/icons/check-24-white.png" alt="上传成功" />
          </span>
        </div>
      </template>

      <template v-else-if="index === 4">
        <el-upload
          class="drag-upload"
          action="#"
          drag
          :auto-upload="false"
          :show-file-list="false"
        >
          <el-icon class="upload-cloud"><UploadFilled /></el-icon>
          <p>将文件拖到此处，或<em>点击上传</em></p>
        </el-upload>
        <p class="upload-limit">只能上传jpg/png文件，且不超过500kb</p>
        <div class="upload-file-row is-wide">
          <el-icon><Document /></el-icon>
          <span>这是附件的文件名.jpg</span>
          <el-icon class="is-success"><CircleCheck /></el-icon>
        </div>
      </template>

      <template v-else>
        <el-upload action="#" :auto-upload="false" :show-file-list="false">
          <el-button type="primary">点击上传</el-button>
        </el-upload>
        <p class="upload-limit">只能上传jpg/png文件，且不超过500kb</p>
        <div class="upload-file-row">
          <el-icon><Document /></el-icon>
          <span>这是附件的文件名.jpg</span>
          <el-icon class="is-success"><CircleCheck /></el-icon>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Document,
  Picture,
  Plus,
  Search,
  UploadFilled,
} from '@element-plus/icons-vue';

export default {
  name: 'TransferUpload',
  components: {
    ArrowLeft,
    ArrowRight,
    CircleCheck,
    Document,
    Picture,
    Plus,
    Search,
    UploadFilled,
  },
  props: {
    componentId: { type: String, required: true },
    index: { type: Number, required: true },
    evidenceState: { type: String, default: 'Default' },
  },
  data() {
    return {
      leftFilter: '',
      rightFilter: '',
      leftSelection: this.evidenceState === 'Selected' ? [1] : [],
      rightSelection: [],
    };
  },
  computed: {
    hasSearch() {
      return [2, 4, 6, 8].includes(this.index);
    },
    hasFooter() {
      return [3, 4, 7, 8].includes(this.index);
    },
    hasButtonCopy() {
      return this.index >= 5;
    },
    itemCount() {
      return this.index === 1 || this.index === 5 ? 10 : 8;
    },
    transferItems() {
      return Array.from({ length: this.itemCount }, (_, itemIndex) => itemIndex + 1);
    },
    visibleLeftItems() {
      return this.filterItems(this.leftFilter);
    },
    visibleRightItems() {
      return this.filterItems(this.rightFilter);
    },
  },
  watch: {
    evidenceState(value) {
      this.leftSelection = value === 'Selected' ? [1] : [];
    },
  },
  methods: {
    filterItems(keyword) {
      const normalized = keyword.trim();
      if (!normalized) return this.transferItems;
      return this.transferItems.filter((item) => `备选项 ${item}`.includes(normalized));
    },
    toggleAll(side, checked) {
      this[`${side}Selection`] = checked ? Array.from({ length: 13 }, (_, itemIndex) => itemIndex + 1) : [];
    },
    clearSelection(side) {
      this[`${side}Selection`] = [];
    },
  },
};
</script>

<style scoped>
.transfer-upload-spec {
  margin: -20px 0 0 20px;
  color: #666666;
}

.transfer-spec {
  display: grid;
  width: max-content;
  align-items: center;
  column-gap: 24px;
  grid-template-columns: 200px 40px 200px;
}

.transfer-spec.has-button-copy {
  grid-template-columns: 200px 82px 200px;
}

.transfer-panel {
  display: flex;
  width: 200px;
  height: 410px;
  flex-direction: column;
  overflow: hidden;
  background: #FFFFFF;
  border: 1px solid #DCDCDC;
  border-radius: 2px;
}

.transfer-spec.has-footer .transfer-panel {
  height: 450px;
}

.transfer-panel__header {
  display: flex;
  height: 40px;
  flex: 0 0 40px;
  align-items: center;
  padding: 0 14px;
  border-bottom: 1px solid #DCDCDC;
}

.transfer-panel__header strong {
  margin-left: 8px;
  color: #4D4D4D;
  font-size: 14px;
  font-weight: 400;
}

.transfer-panel__header > span {
  margin-left: auto;
  color: #999999;
  font-size: 12px;
}

.transfer-panel__search {
  height: 64px;
  flex: 0 0 64px;
  padding: 16px 20px;
}

.transfer-panel__search :deep(.el-input) {
  width: 160px;
}

.transfer-panel__search :deep(.el-input__wrapper) {
  min-height: 32px;
  border-radius: 16px;
}

.transfer-panel__list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  padding: 8px 14px;
}

.transfer-panel__list :deep(.el-checkbox) {
  width: 100%;
  height: 32px;
  flex: 0 0 32px;
  margin-right: 0;
  color: #666666;
}

.transfer-panel__list :deep(.el-checkbox__label) {
  padding-left: 8px;
  font-size: 14px;
}

.transfer-panel__footer {
  display: flex;
  height: 40px;
  flex: 0 0 40px;
  align-items: center;
  justify-content: flex-end;
  padding: 0 8px;
  border-top: 1px solid #DCDCDC;
}

.transfer-panel__footer :deep(.el-button) {
  --el-button-bg-color: #FFFFFF;
  --el-button-border-color: #DCDCDC;
  --el-button-text-color: #606266;
  width: 46px;
  min-height: 24px;
  height: 24px;
  padding: 0;
  color: #606266 !important;
  background: #FFFFFF;
  border-color: #DCDCDC;
}

.transfer-panel__footer :deep(.el-button span) {
  color: #606266 !important;
}

.transfer-actions {
  display: grid;
  gap: 8px;
}

.transfer-actions :deep(.el-button) {
  width: 40px;
  min-height: 32px;
  height: 32px;
  padding: 0;
  color: #FFFFFF;
  background: #FF6014;
  border-color: #FF6014;
}

.has-button-copy .transfer-actions :deep(.el-button) {
  width: 82px;
}

.has-button-copy .transfer-actions :deep(.el-button > span) {
  display: flex;
  align-items: center;
  gap: 6px;
}

.upload-spec {
  display: grid;
  width: 360px;
  justify-items: start;
}

.upload-spec :deep(.el-button--primary) {
  height: 32px;
  padding: 0 16px;
  background: #FF6014;
  border-color: #FF6014;
}

.upload-file-row {
  display: flex;
  height: 24px;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  color: #666666;
  font-size: 14px;
}

.upload-file-row.is-wide {
  width: 360px;
}

.upload-file-row .is-success {
  margin-left: auto;
  color: #00B42A;
}

.upload-limit {
  margin: 8px 0 0;
  color: #999999;
  font-size: 12px;
  line-height: 20px;
}

.avatar-upload :deep(.el-upload--picture-card) {
  width: 148px;
  height: 148px;
  background: #FFFFFF;
  border-color: #DCDCDC;
  border-radius: 2px;
}

.avatar-upload :deep(.el-upload--picture-card .el-icon) {
  color: #4D4D4D;
  font-size: 28px;
}

.upload-picture-row {
  position: relative;
  display: flex;
  width: 360px;
  height: 88px;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  overflow: hidden;
  padding: 8px;
  background: #FFFFFF;
  border: 1px solid #DCDCDC;
  border-radius: 2px;
}

.upload-picture-placeholder {
  display: grid;
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  color: #FF9D75;
  background: #FFF4EE;
  font-size: 38px;
  place-items: center;
}

.upload-success-corner {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  background: #00B42A;
  clip-path: polygon(0 0, 100% 0, 100% 100%);
}

.upload-success-corner img {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
}

.drag-upload :deep(.el-upload-dragger) {
  display: flex;
  width: 360px;
  height: 180px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 0;
  background: #FFFFFF;
  border-color: #DCDCDC;
  border-radius: 2px;
}

.upload-cloud {
  margin-bottom: 10px;
  color: #C5C5C5;
  font-size: 56px;
}

.drag-upload p {
  margin: 0;
  color: #999999;
  font-size: 14px;
}

.drag-upload em {
  color: #FF6014;
  font-style: normal;
}
</style>
