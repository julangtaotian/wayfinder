<template>
  <div
    class="date-time-spec-scene"
    :class="[`date-time-spec-scene-${scenario.ordinal}`, { 'is-range-scene': isRangeScene, 'is-time-picker-scene': isTimePicker }]"
  >
    <div
      class="date-time-trigger-shell"
      :class="{ 'has-hidden-value': hideTriggerValue }"
      :data-placeholder="triggerPlaceholder"
    >
      <el-time-select
        v-if="isFixedTime"
        ref="picker"
        v-model="timeString"
        class="date-time-trigger date-time-trigger-single"
        :picker-options="{ start: '08:30', step: '00:15', end: '18:30' }"
        placeholder="选择时间"
        :popper-class="popperClass"
      />
      <el-time-picker
        v-else-if="isTimePicker"
        ref="picker"
        v-model="timeModel"
        class="date-time-trigger"
        :class="isRangeScene ? 'date-time-trigger-range' : 'date-time-trigger-single'"
        :is-range="isRangeScene"
        placeholder="选择时间"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        range-separator="至"
        :popper-class="popperClass"
      />
      <el-date-picker
        v-else
        ref="picker"
        v-model="dateModel"
        class="date-time-trigger"
        :class="isRangeScene ? 'date-time-trigger-range' : 'date-time-trigger-single'"
        :type="datePickerType"
        :default-value="defaultDateValue"
        :picker-options="hasShortcuts ? pickerOptions : {}"
        :unlink-panels="isRangeScene"
        :placeholder="datePlaceholder"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        range-separator="至"
        :popper-class="popperClass"
      />
      <div v-if="hideTriggerValue" class="date-time-trigger-overlay" aria-hidden="true">
        <template v-if="isRangeScene">
          <span>{{ rangePlaceholderStart }}</span>
          <b>至</b>
          <span>{{ rangePlaceholderEnd }}</span>
        </template>
        <span v-else>{{ triggerPlaceholder }}</span>
      </div>
    </div>
  </div>
</template>

<script>
const FIXED_DATE = new Date(2021, 4, 15, 10, 30, 0);

function createInitialDateValue(index) {
  if (index === 4) return new Date(2026, 0, 1);
  if (index === 5) return new Date(2022, 6, 1);
  if (index === 6) {
    return [1, 5, 6, 11, 12, 13, 14, 28].map((day) => new Date(2021, 4, day));
  }
  if ([7, 8].includes(index)) return null;
  if ([9, 10].includes(index)) return [new Date(2022, 4, 1), new Date(2022, 7, 1)];
  return null;
}

export default {
  name: 'DateTimePickerScenario',
  props: {
    scenario: { type: Object, required: true },
    evidenceMode: { type: Boolean, default: false },
    evidenceState: { type: String, default: 'Default' },
  },
  data() {
    return {
      dateModel: createInitialDateValue(this.scenario.ordinal),
      timeString: '',
      timeModel: this.scenario.ordinal === 3
        ? [new Date(2021, 4, 15, 18, 40, 0), new Date(2021, 4, 15, 18, 40, 0)]
        : new Date(2021, 4, 15, 18, 40, 0),
    };
  },
  computed: {
    isTimePicker() {
      return this.scenario.componentId === 'time-picker';
    },
    isFixedTime() {
      return this.isTimePicker && this.scenario.ordinal === 1;
    },
    isRangeScene() {
      if (this.isTimePicker) return this.scenario.ordinal === 3;
      return [7, 8, 9, 10, 13, 14].includes(this.scenario.ordinal);
    },
    hasShortcuts() {
      return !this.isTimePicker && [2, 8, 10, 12, 14].includes(this.scenario.ordinal);
    },
    datePickerType() {
      return ['date', 'date', 'week', 'year', 'month', 'dates', 'daterange', 'daterange', 'monthrange', 'monthrange', 'datetime', 'datetime', 'datetimerange', 'datetimerange'][this.scenario.ordinal - 1];
    },
    defaultDateValue() {
      if (this.isRangeScene) return [new Date(2021, 4, 1), new Date(2021, 4, 1)];
      if (this.scenario.ordinal === 4) return new Date(2026, 0, 1);
      if (this.scenario.ordinal === 5) return new Date(2022, 0, 1);
      return FIXED_DATE;
    },
    pickerOptions() {
      const start = new Date(2021, 4, 15);
      const end = new Date(2021, 4, 21);
      return {
        shortcuts: ['今天', '昨天', '一周前'].map((text, offset) => ({
          text,
          onClick: (picker) => picker.$emit('pick', this.isRangeScene
            ? [new Date(start.getTime() - offset * 86400000), new Date(end.getTime() - offset * 86400000)]
            : new Date(start.getTime() - offset * 86400000)),
        })),
      };
    },
    hideTriggerValue() {
      if (this.isFixedTime) return false;
      if (this.isTimePicker) return true;
      return this.dateModel !== null;
    },
    datePlaceholder() {
      return [11, 12].includes(this.scenario.ordinal) ? '选择时间' : '选择日期';
    },
    triggerPlaceholder() {
      return this.isTimePicker || [11, 12].includes(this.scenario.ordinal) ? '选择时间' : '选择日期';
    },
    rangePlaceholderStart() {
      return this.isTimePicker ? '开始时间' : '开始日期';
    },
    rangePlaceholderEnd() {
      return this.isTimePicker ? '结束时间' : '结束日期';
    },
    popperClass() {
      const family = this.isTimePicker ? 'time-picker' : 'date-picker';
      return `lanhu-${family}-popper lanhu-${family}-popper-${this.scenario.ordinal} evidence-state-${this.evidenceState.toLowerCase()} ${this.evidenceMode ? 'is-evidence-popper' : ''}`;
    },
  },
  watch: {
    evidenceMode(value) {
      if (value) this.openEvidenceScene();
      else this.closePicker();
    },
  },
  mounted() {
    this.openEvidenceScene();
  },
  methods: {
    openEvidenceScene() {
      if (!this.evidenceMode) return;
      // 蓝湖规范画板直接展示展开面板，证据路由加载后稳定复现相同状态。
      this.$nextTick(() => {
        this.openPicker();
        window.setTimeout(this.normalizeScrollPosition, 260);
      });
    },
    openPicker() {
      const picker = this.$refs.picker;
      picker?.showPicker?.();
      picker?.focus?.();
      const input = picker?.$el?.querySelector?.('input');
      input?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      input?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    closePicker() {
      const picker = this.$refs.picker;
      picker?.handleClose?.();
      picker?.hidePicker?.();
      picker?.blur?.();
    },
    normalizeScrollPosition() {
      if (!this.isTimePicker || this.isFixedTime) return;
      // 任意时间画板以 18:40:00 为中心行，固定滚动位置避免截图受当前系统时间影响。
      document.querySelectorAll(`.${this.popperClass.split(' ')[1]} .el-time-spinner__wrapper`).forEach((node, index) => {
        node.scrollTop = [18, 40, 0][index % 3] * 32;
      });
    },
  },
};
</script>
