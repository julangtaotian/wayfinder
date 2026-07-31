<template>
  <div
    class="lanhu-form-scene"
    :class="[
      `lanhu-form-scene--${sizeKey}`,
      `lanhu-form-scene--scene-${index}`,
      { 'is-english': isEnglish, 'is-crop-top': isCropTop },
    ]"
    :data-form-size="sizeKey"
    :data-form-alignment="alignment"
  >
    <!-- 行内表单独立控制字段宽度，保证四个操作项在单行内保持蓝湖节奏。 -->
    <el-form
      v-if="index === 2"
      class="lanhu-form lanhu-form--inline"
      :model="model"
      :size="librarySize"
      inline
    >
      <el-form-item :label="labels.approver">
        <el-input v-model="model.approver" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item :label="labels.zone">
        <el-input v-model="model.zone" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item class="lanhu-form-actions">
        <el-button type="primary">{{ labels.query }}</el-button>
        <el-button>{{ labels.reset }}</el-button>
      </el-form-item>
    </el-form>

    <!-- 典型中文表单依原画保留三个纯输入框；英文版使用选择器和日期时间组合。 -->
    <el-form
      v-else-if="index === 1"
      class="lanhu-form lanhu-form--typical"
      :class="{ 'is-english': isEnglish }"
      :model="model"
      :size="librarySize"
      label-position="right"
      :label-width="typicalLabelWidth"
    >
      <el-form-item :label="labels.name">
        <el-input v-model="model.name" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item :label="labels.zone">
        <el-select v-if="isEnglish" v-model="model.zone" :placeholder="placeholder.zone">
          <el-option label="Zone one" value="zone-one" />
        </el-select>
        <el-input v-else v-model="model.zone" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item :label="labels.time">
        <div v-if="isEnglish" class="lanhu-time-range">
          <el-date-picker v-model="model.date" type="date" :placeholder="placeholder.date" :clearable="false" />
          <span class="lanhu-range-separator">-</span>
          <el-time-picker v-model="model.time" :placeholder="placeholder.time" :clearable="false" />
        </div>
        <el-input v-else v-model="model.timeText" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item :label="labels.delivery">
        <el-switch v-model="model.delivery" />
      </el-form-item>
      <el-form-item :label="labels.type" class="lanhu-group-item">
        <el-checkbox-group v-model="model.types" class="lanhu-checkbox-grid">
          <div v-for="(row, rowIndex) in checkboxRows" :key="rowIndex" class="lanhu-check-row">
            <el-checkbox v-for="(option, optionIndex) in row" :key="`${rowIndex}-${optionIndex}`" :value="`${rowIndex}-${optionIndex}`">
              {{ option }}
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item :label="labels.resources">
        <el-radio-group v-model="model.resource" class="lanhu-radio-row">
          <el-radio v-for="(option, optionIndex) in radioOptions" :key="option" :value="`${optionIndex}`">
            {{ option }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="labels.form">
        <el-input v-model="model.description" :type="isEnglish ? 'textarea' : 'text'" :placeholder="placeholder.input" />
      </el-form-item>
      <el-form-item class="lanhu-form-actions">
        <el-button type="primary">{{ labels.create }}</el-button>
        <el-button>{{ labels.cancel }}</el-button>
      </el-form-item>
    </el-form>

    <template v-else>
      <p v-if="sizeKey === 'small' && index === 3" class="lanhu-clipped-description">
        根据具体目标和制约因素，选择最佳的标签对齐方式。
      </p>
      <!-- 蓝湖仅在“标签左对齐”裁切区域中保留了分段选项。 -->
      <el-radio-group v-if="index === 3" v-model="tabValue" class="lanhu-segment" size="default">
        <el-radio-button v-for="optionIndex in 3" :key="optionIndex" :value="optionIndex">选项</el-radio-button>
      </el-radio-group>

      <el-form
        class="lanhu-form lanhu-form--aligned"
        :class="[`is-${alignment}`, { 'has-clipped-name': hasClippedTopName }]"
        :model="model"
        :size="librarySize"
        :label-position="alignment"
        :label-width="alignedLabelWidth"
      >
        <el-form-item v-if="!hasClippedTopName" :label="alignedLabels.name" required>
          <el-input v-model="model.name" :placeholder="placeholder.input" />
        </el-form-item>
        <!-- Default/Small/English 顶对齐画板从名称输入框中部开始裁切，因此只保留输入框。 -->
        <el-input
          v-else
          v-model="model.name"
          class="lanhu-clipped-name"
          :placeholder="placeholder.input"
        />

        <el-form-item :label="alignedLabels.zone" required>
          <el-input
            v-if="isEnglish && index === 5"
            v-model="model.zone"
            :placeholder="placeholder.zone"
          />
          <el-select v-else v-model="model.zone" :placeholder="placeholder.zone">
            <el-option :label="isEnglish ? 'Zone one' : '区域一'" value="zone-one" />
          </el-select>
        </el-form-item>

        <el-form-item :label="alignedLabels.time" required>
          <div class="lanhu-time-range">
            <el-date-picker v-model="model.date" type="date" :placeholder="placeholder.date" :clearable="false" />
            <span class="lanhu-range-separator">-</span>
            <el-time-picker v-model="model.time" :placeholder="placeholder.time" :clearable="false" />
          </div>
        </el-form-item>

        <el-form-item :label="labels.delivery" class="lanhu-switch-item">
          <el-switch v-model="model.delivery" />
        </el-form-item>

        <el-form-item :label="alignedLabels.type" class="lanhu-group-item" required>
          <el-checkbox-group v-model="model.types" class="lanhu-checkbox-grid">
            <div v-for="(row, rowIndex) in checkboxRows" :key="rowIndex" class="lanhu-check-row">
              <el-checkbox v-for="(option, optionIndex) in row" :key="`${rowIndex}-${optionIndex}`" :value="`${rowIndex}-${optionIndex}`">
                {{ option }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item :label="alignedLabels.resources" class="lanhu-radio-item" required>
          <el-radio-group v-model="model.resource" class="lanhu-radio-row" :class="{ 'is-four': radioOptions.length === 4 }">
            <el-radio v-for="(option, optionIndex) in radioOptions" :key="`${option}-${optionIndex}`" :value="`${optionIndex}`">
              {{ option }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="alignedLabels.form" class="lanhu-description-item" required>
          <el-input v-model="model.description" type="textarea" :placeholder="placeholder.input" />
        </el-form-item>

        <el-form-item class="lanhu-form-actions">
          <el-button type="primary">{{ labels.create }}</el-button>
          <el-button>{{ labels.cancel }}</el-button>
        </el-form-item>
      </el-form>
    </template>
  </div>
</template>

<script>
export default {
  name: 'FormScenario',
  props: {
    scenario: { type: Object, required: true },
  },
  data() {
    return {
      tabValue: 1,
      model: {
        name: '',
        zone: '',
        approver: '',
        date: null,
        time: null,
        timeText: '',
        delivery: false,
        types: [],
        resource: '',
        description: '',
      },
    };
  },
  computed: {
    index() {
      return this.scenario.ordinal;
    },
    isEnglish() {
      return this.scenario.componentId === 'form-default-en';
    },
    sizeKey() {
      if (this.scenario.componentId === 'form-large-cn') return 'large';
      if (this.scenario.componentId === 'form-small-cn') return 'small';
      return 'default';
    },
    librarySize() {
      return this.sizeKey;
    },
    alignment() {
      if (this.index === 3) return 'left';
      if (this.index === 5) return 'top';
      return 'right';
    },
    isCropTop() {
      return this.index >= 4 && !(this.isEnglish && this.index === 4);
    },
    typicalLabelWidth() {
      if (this.sizeKey === 'small') return '60px';
      return this.isEnglish ? '124px' : '68px';
    },
    alignedLabelWidth() {
      if (this.alignment === 'top') return 'auto';
      if (this.sizeKey === 'small' && this.index === 3) return '70px';
      return this.isEnglish ? '134px' : '78px';
    },
    hasClippedTopName() {
      return this.index === 5 && this.sizeKey !== 'large';
    },
    labels() {
      if (this.isEnglish) {
        return {
          approver: 'Approved by',
          zone: 'Activity zone',
          query: 'Query',
          reset: 'Reset',
          name: 'Activity name',
          time: 'Activity time',
          delivery: 'Instant delivery',
          type: 'Activity type',
          resources: 'Resources',
          form: 'Activity form',
          create: 'Create',
          cancel: 'Cancel',
        };
      }
      return {
        approver: '审批人',
        zone: '活动区域',
        query: '查询',
        reset: '重置',
        name: '活动名称',
        time: '活动时间',
        delivery: '即时配送',
        type: '活动性质',
        resources: '特殊资源',
        form: '活动形式',
        create: '立即创建',
        cancel: '取消',
      };
    },
    alignedLabels() {
      if (this.isEnglish) {
        return {
          name: this.index === 3 ? 'Name' : 'Activity name',
          zone: 'Activity zone',
          time: 'Activity time',
          type: this.index === 4 ? 'Type' : this.index === 5 ? '顶对齐标签' : 'Activity type',
          resources: 'Resources',
          form: 'Activity form',
        };
      }
      return {
        name: this.index === 3 || this.index === 4 ? '名称' : '活动名称',
        zone: '活动区域',
        time: '活动时间',
        type: this.sizeKey === 'large' && this.index === 5 ? '活动性质' : '性质',
        resources: this.sizeKey === 'small' && this.index === 3
          ? '四字标签'
          : this.sizeKey === 'large' && this.index === 5
            ? '顶对齐标签'
            : '特殊资源',
        form: '活动形式',
      };
    },
    placeholder() {
      return this.isEnglish
        ? { input: '', zone: 'please select your zone', date: 'pick a date', time: 'pick a time' }
        : { input: '请输入', zone: '请选择', date: '选择日期', time: '选择时间' };
    },
    usesGenericSixOptions() {
      return (this.sizeKey === 'small' && this.index === 3)
        || (this.sizeKey === 'large' && this.index === 5);
    },
    checkboxOptions() {
      if (this.usesGenericSixOptions) {
        return ['备选项', '备选项', '备选项', '备选项', '线下主题活动', '单纯品牌曝光'];
      }
      if (this.isEnglish) {
        return ['Online activities', 'Promotion activities', 'Offline activities', 'Simple brand exposure'];
      }
      return ['美食/餐厅线上活动', '地推活动', '线下主题活动', '单纯品牌曝光'];
    },
    checkboxRows() {
      if (this.usesGenericSixOptions) return [this.checkboxOptions.slice(0, 4), this.checkboxOptions.slice(4)];
      return [this.checkboxOptions.slice(0, 2), this.checkboxOptions.slice(2)];
    },
    radioOptions() {
      if (this.sizeKey === 'small' && this.index === 3) return ['备选项', '备选项', '备选项', '备选项'];
      if (this.isEnglish) return ['sponsor', 'venue'];
      return ['线上品牌商赞助', '线下场地免费'];
    },
  },
};
</script>

<style>
.lanhu-form-scene {
  --control-height: 32px;
  --field-gap: 18px;
  --form-font-size: 14px;
  --group-row-height: 32px;
  --group-row-gap: 8px;
  width: max-content;
  margin-left: 20px;
  color: #333333;
  font-size: 14px;
  line-height: 22px;
}

.lanhu-form-scene.is-crop-top {
  margin-top: -20px;
}

.lanhu-form-scene--large {
  --control-height: 40px;
  --field-gap: 21px;
  --group-row-height: 40px;
  --group-row-gap: 0px;
}

.lanhu-form-scene--small {
  --control-height: 24px;
  --field-gap: 18px;
  --group-row-height: 24px;
  --form-font-size: 12px;
  font-size: 12px;
  line-height: 20px;
}

.lanhu-form-scene .lanhu-form {
  width: 460px;
  max-width: none;
}

.lanhu-form-scene .lanhu-form .el-form-item {
  margin-bottom: var(--field-gap);
}

.lanhu-form-scene .lanhu-form .el-form-item:last-child {
  margin-bottom: 0;
}

.lanhu-form-scene .el-form-item__label {
  height: var(--control-height);
  padding-right: 12px;
  color: #333333;
  font-size: var(--form-font-size);
  line-height: var(--control-height);
  white-space: nowrap;
}

.lanhu-form-scene .el-form-item__content {
  min-height: var(--control-height);
  font-size: var(--form-font-size);
  line-height: var(--control-height);
}

.lanhu-form-scene .el-input,
.lanhu-form-scene .el-select,
.lanhu-form-scene .el-date-editor {
  width: 100%;
}

.lanhu-form-scene .el-input__wrapper,
.lanhu-form-scene .el-select__wrapper {
  min-height: var(--control-height) !important;
  height: var(--control-height) !important;
  border-radius: 2px;
}

.lanhu-form-scene .el-input__inner,
.lanhu-form-scene .el-select__placeholder,
.lanhu-form-scene .el-date-editor .el-range-input {
  font-size: var(--form-font-size);
}

.lanhu-form-scene input::placeholder,
.lanhu-form-scene textarea::placeholder {
  color: #BFBFBF;
}

.lanhu-form-scene .el-textarea__inner {
  min-height: 52px !important;
  height: 52px;
  padding: 7px 10px;
  color: #333333;
  border-color: #DCDCDC;
  border-radius: 2px;
  font-family: inherit;
  font-size: var(--form-font-size);
  line-height: 22px;
}

.lanhu-form-scene .el-button {
  min-height: var(--control-height) !important;
  height: var(--control-height) !important;
  padding: 0 16px;
  font-size: var(--form-font-size);
}

.lanhu-form-scene--large .el-button {
  padding: 0 20px;
}

.lanhu-form-scene--small .el-button {
  padding: 0 12px;
}

.lanhu-form-scene .el-button + .el-button {
  margin-left: 10px;
}

.lanhu-form-scene .el-button:not(.el-button--primary) {
  color: #4D4D4D !important;
  background: #FFFFFF !important;
}

.lanhu-form-scene .el-checkbox,
.lanhu-form-scene .el-radio {
  height: var(--group-row-height);
  margin-right: 0;
  color: #333333;
  font-size: inherit;
  line-height: var(--group-row-height);
}

.lanhu-form-scene .el-checkbox__label,
.lanhu-form-scene .el-radio__label {
  padding-left: 8px;
  color: #333333;
  font-size: var(--form-font-size) !important;
}

.lanhu-form-scene .el-switch {
  height: var(--control-height);
}

.lanhu-form-scene .el-switch__core {
  width: 40px;
  min-width: 40px;
  height: 20px;
  border-color: #E4E7ED;
  background: #E4E7ED;
}

.lanhu-form-scene .lanhu-form--typical:not(.is-english) .el-form-item__content {
  width: 392px;
}

.lanhu-form-scene .lanhu-form--typical.is-english .el-form-item__content {
  width: 336px;
}

.lanhu-form-scene .lanhu-form--aligned:not(.is-top) .el-form-item__content {
  width: 382px;
}

.lanhu-form-scene.is-english .lanhu-form--aligned:not(.is-top) .el-form-item__content {
  width: 326px;
}

.lanhu-form-scene--small .lanhu-form--typical:not(.is-english) .el-form-item__content {
  width: 400px;
}

.lanhu-form-scene--small.lanhu-form-scene--scene-3 .lanhu-form--aligned:not(.is-top) .el-form-item__content {
  width: 390px;
}

.lanhu-form-scene .lanhu-form--aligned.is-left .el-form-item__label {
  justify-content: flex-start;
  text-align: left;
}

.lanhu-form-scene .lanhu-form--aligned.is-left .is-required > .el-form-item__label::before,
.lanhu-form-scene .lanhu-form--aligned.is-top .is-required > .el-form-item__label::before {
  display: none !important;
}

.lanhu-form-scene .lanhu-form--aligned.is-left .is-required > .el-form-item__label::after,
.lanhu-form-scene .lanhu-form--aligned.is-top .is-required > .el-form-item__label::after {
  margin-left: 4px;
  color: #F53F3F;
  content: "*";
}

.lanhu-form-scene .lanhu-form--aligned.is-right .is-required > .el-form-item__label::before {
  margin-right: 4px;
  color: #F53F3F;
}

.lanhu-form-scene .lanhu-time-range {
  display: flex;
  width: 100%;
  height: var(--control-height);
  align-items: center;
  gap: 12px;
}

.lanhu-form-scene .lanhu-time-range .el-date-editor {
  width: 0;
  min-width: 0;
  flex: 1 1 0;
}

.lanhu-form-scene .lanhu-range-separator {
  width: 8px;
  color: #333333;
  text-align: center;
}

.lanhu-form-scene .lanhu-checkbox-grid {
  display: grid;
  width: 100%;
  gap: var(--group-row-gap);
}

.lanhu-form-scene .lanhu-check-row {
  display: flex;
  height: var(--group-row-height);
  align-items: center;
}

.lanhu-form-scene .lanhu-check-row .el-checkbox {
  width: 165px;
}

.lanhu-form-scene.is-english .lanhu-check-row .el-checkbox {
  width: 153px;
}

.lanhu-form-scene .lanhu-check-row:has(.el-checkbox:nth-child(4)) .el-checkbox {
  width: 82px;
}

.lanhu-form-scene .lanhu-check-row:has(.el-checkbox:nth-child(4)) + .lanhu-check-row .el-checkbox {
  width: 165px;
}

.lanhu-form-scene .lanhu-radio-row {
  display: flex;
  width: 100%;
  height: var(--group-row-height);
  align-items: center;
  gap: 21px;
}

.lanhu-form-scene .lanhu-radio-row.is-four {
  gap: 26px;
}

.lanhu-form-scene.is-english .lanhu-radio-row {
  gap: 25px;
}

.lanhu-form-scene .lanhu-group-item > .el-form-item__content {
  min-height: calc(var(--group-row-height) * 2 + var(--group-row-gap));
  align-items: flex-start;
}

.lanhu-form-scene .lanhu-form-actions .el-form-item__content {
  align-items: center;
}

.lanhu-form-scene .lanhu-form--inline {
  display: flex;
  width: auto;
  align-items: flex-start;
}

.lanhu-form-scene .lanhu-form--inline .el-form-item {
  margin-right: 24px;
  margin-bottom: 0;
}

.lanhu-form-scene .lanhu-form--inline .el-form-item:nth-child(1) .el-form-item__label {
  width: 54px;
}

.lanhu-form-scene .lanhu-form--inline .el-form-item:nth-child(2) .el-form-item__label {
  width: 68px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .el-form-item:nth-child(1) .el-form-item__label {
  width: 94px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .el-form-item:nth-child(2) .el-form-item__label {
  width: 100px;
}

.lanhu-form-scene .lanhu-form--inline .el-input {
  width: 146px;
}

.lanhu-form-scene--default:not(.is-english) .lanhu-form--inline .el-form-item:nth-child(2) .el-input {
  width: 132px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .el-input {
  width: 186px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .el-form-item:nth-child(2) .el-form-item__label {
  width: 98px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .el-form-item:nth-child(2) .el-input {
  width: 182px;
}

.lanhu-form-scene--small .lanhu-form--inline .el-form-item:nth-child(1) .el-form-item__label {
  width: 48px;
}

.lanhu-form-scene--small .lanhu-form--inline .el-form-item:nth-child(2) .el-form-item__label {
  width: 62px;
}

.lanhu-form-scene--small .lanhu-form--inline .el-input {
  width: 152px;
}

.lanhu-form-scene .lanhu-form--inline .lanhu-form-actions {
  margin-right: 0;
}

.lanhu-form-scene .lanhu-form--inline .lanhu-form-actions .el-button {
  width: 60px;
  padding: 0;
}

.lanhu-form-scene--large .lanhu-form--inline .lanhu-form-actions .el-button {
  width: 68px;
}

.lanhu-form-scene--large .lanhu-form--inline .el-button + .el-button {
  margin-left: 12px;
}

.lanhu-form-scene--small .lanhu-form--inline .lanhu-form-actions .el-button {
  width: 48px;
}

.lanhu-form-scene--small .lanhu-form--inline .el-button + .el-button {
  margin-left: 8px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .lanhu-form-actions .el-button:first-child {
  width: 72px;
}

.lanhu-form-scene.is-english .lanhu-form--inline .lanhu-form-actions .el-button:last-child {
  width: 70px;
}

.lanhu-form-scene .lanhu-segment {
  display: flex;
  margin-bottom: 24px;
}

.lanhu-form-scene .lanhu-segment .el-radio-button__inner {
  width: 60px;
  height: 32px;
  padding: 0;
  color: #4D4D4D;
  border-color: #DCDCDC;
  border-radius: 0;
  line-height: 30px;
}

.lanhu-form-scene .lanhu-segment .el-radio-button:first-child .el-radio-button__inner {
  border-radius: 2px 0 0 2px;
}

.lanhu-form-scene .lanhu-segment .el-radio-button:last-child .el-radio-button__inner {
  border-radius: 0 2px 2px 0;
}

.lanhu-form-scene .lanhu-segment .el-radio-button__original-radio:checked + .el-radio-button__inner {
  color: #FFFFFF;
  background: #FF6014;
  border-color: #FF6014;
  box-shadow: -1px 0 0 0 #FF6014;
}

.lanhu-form-scene .lanhu-form--aligned.is-top .el-form-item {
  display: block;
}

.lanhu-form-scene .lanhu-form--aligned.is-top .el-form-item__label {
  display: flex;
  width: 100% !important;
  height: 22px;
  margin-bottom: 6px;
  padding: 0;
  justify-content: flex-start;
  line-height: 22px;
}

.lanhu-form-scene .lanhu-form--aligned.is-top .el-form-item__content {
  width: 460px;
}

.lanhu-form-scene .lanhu-form--aligned.is-top .lanhu-group-item > .el-form-item__content {
  min-height: calc(var(--group-row-height) * 2 + var(--group-row-gap));
}

.lanhu-form-scene .lanhu-form--aligned.is-top .lanhu-switch-item {
  margin-bottom: 22px;
}

.lanhu-form-scene .lanhu-form--aligned.is-top .lanhu-group-item {
  margin-bottom: 24px;
}

.lanhu-form-scene .lanhu-clipped-name {
  display: block;
  width: 460px;
  margin-bottom: var(--field-gap);
}

.lanhu-form-scene .lanhu-clipped-name .el-input__wrapper {
  display: flex;
  width: 100%;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-form--aligned.is-top .el-form-item {
  margin-bottom: 24px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large {
  --control-height: 32px;
  --group-row-height: 32px;
  --group-row-gap: 16px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .el-button {
  padding: 0 16px;
}

/* 蓝湖顶部对齐画板明确统一为 32px，覆盖尺寸组件给日期控件根节点设置的高度。 */
.lanhu-form-scene--scene-5.lanhu-form-scene--large .el-date-editor,
.lanhu-form-scene--scene-5.lanhu-form-scene--small .el-date-editor {
  min-height: 32px !important;
  height: 32px !important;
}

.lanhu-form-scene--scene-1.lanhu-form-scene--large {
  margin-top: 2px;
}

.lanhu-form-scene--scene-3.lanhu-form-scene--large {
  margin-top: 4px;
}

.lanhu-form-scene--scene-3.lanhu-form-scene--small {
  position: relative;
  margin-top: -20px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small {
  --control-height: 32px;
  --form-font-size: 14px;
  --group-row-height: 32px;
  margin-top: -12px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .el-button {
  padding: 0 16px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .lanhu-switch-item {
  margin-bottom: 35px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .lanhu-switch-item .el-switch {
  transform: translateY(10px);
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .lanhu-group-item {
  margin-bottom: 18px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .lanhu-radio-item {
  margin-bottom: 22px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--small .lanhu-description-item {
  margin-bottom: 16px !important;
}

.lanhu-form-scene--scene-5.is-english {
  margin-top: -14px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large {
  margin-top: -24px;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-switch-item {
  margin-bottom: 28px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-group-item {
  margin-bottom: 34px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-radio-item {
  margin-bottom: 35px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-description-item {
  margin-bottom: 20px !important;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-switch-item .el-switch,
.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-group-item .lanhu-checkbox-grid {
  transform: translateY(7px);
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-form-actions .el-button:first-child {
  width: 88px;
  padding: 0;
}

.lanhu-form-scene--scene-5.lanhu-form-scene--large .lanhu-form-actions .el-button:last-child {
  width: 60px;
  padding: 0;
}

.lanhu-form-scene .lanhu-clipped-description {
  width: 460px;
  height: 30px;
  margin: 0;
  overflow: hidden;
  color: #666666;
  line-height: 22px;
  transform: translateY(-12px);
}

.lanhu-form-scene--scene-3.lanhu-form-scene--small .lanhu-check-row:has(.el-checkbox:nth-child(4)) .el-checkbox {
  width: 80px;
}

.lanhu-form-scene--scene-3.lanhu-form-scene--small .lanhu-checkbox-grid {
  gap: 10px;
  transform: translateY(3px);
}

.lanhu-form-scene--scene-3.lanhu-form-scene--small .lanhu-radio-row.is-four {
  gap: 20px;
}

.lanhu-form-scene .el-checkbox__label,
.lanhu-form-scene .el-radio__label,
.lanhu-form-scene .el-button,
.lanhu-form-scene .lanhu-segment .el-radio-button__inner {
  font-weight: 400;
}

.lanhu-form-scene .el-input__wrapper,
.lanhu-form-scene .el-select__wrapper {
  box-shadow: 0 0 0 1px #DCDCDC inset !important;
}

.evidence-mode .scenario-demo:has(.lanhu-form-scene) {
  width: 900px !important;
  max-width: 900px;
  min-height: 100vh;
}

html:has(.evidence-mode .lanhu-form-scene),
body:has(.evidence-mode .lanhu-form-scene),
#app:has(.evidence-mode .lanhu-form-scene) {
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
</style>
