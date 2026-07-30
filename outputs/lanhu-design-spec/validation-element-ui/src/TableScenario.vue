<!-- AI-code-start lines:594 tool:Codex -->
<template>
  <section
    class="table-scenario"
    :class="[densityClass, `table-scene-${index}`]"
    :data-table-scene="scenario.id"
    :data-table-state="evidenceState"
  >
    <div
      v-if="isClassicPage"
      ref="classicPreviewShell"
      class="classic-preview-shell"
      :style="classicPreviewStyle"
    >
      <!-- 经典表格页按蓝湖三档画布独立还原，避免组件库默认布局挤压操作列。 -->
      <div class="classic-table-page">
        <aside class="classic-sidebar">
          <el-menu default-active="3-1" :default-openeds="['3']" class="classic-menu">
            <el-menu-item index="1"><i class="el-icon-s-home" aria-hidden="true" /><span>首页</span></el-menu-item>
            <el-menu-item index="2"><i class="el-icon-pie-chart" aria-hidden="true" /><span>数据可视化</span><i class="el-icon-arrow-down classic-menu-tail" aria-hidden="true" /></el-menu-item>
            <el-menu-item index="2-1"><i class="el-icon-edit-outline" aria-hidden="true" /><span>表单页</span><i class="el-icon-arrow-down classic-menu-tail" aria-hidden="true" /></el-menu-item>
            <el-submenu index="3">
              <template slot="title"><i class="el-icon-tickets" aria-hidden="true" /><span>列表页</span></template>
              <el-menu-item index="3-1">基础表格</el-menu-item>
              <el-menu-item index="3-2">卡片列表</el-menu-item>
            </el-submenu>
            <el-menu-item index="4"><i class="el-icon-document" aria-hidden="true" /><span>详情页</span><i class="el-icon-arrow-down classic-menu-tail" aria-hidden="true" /></el-menu-item>
            <el-menu-item index="5"><i class="el-icon-circle-check" aria-hidden="true" /><span>结果页</span><i class="el-icon-arrow-down classic-menu-tail" aria-hidden="true" /></el-menu-item>
            <el-menu-item index="6"><i class="el-icon-warning-outline" aria-hidden="true" /><span>异常页</span><i class="el-icon-arrow-down classic-menu-tail" aria-hidden="true" /></el-menu-item>
            <el-menu-item index="7"><i class="el-icon-user" aria-hidden="true" /><span>个人中心</span></el-menu-item>
          </el-menu>
          <el-button class="classic-sidebar-collapse" aria-label="收起导航"><i class="el-icon-s-fold" aria-hidden="true" /></el-button>
        </aside>
        <header class="classic-topbar">
          <div class="classic-header-copy">
            <el-breadcrumb separator="/">
              <el-breadcrumb-item>表格页</el-breadcrumb-item>
              <el-breadcrumb-item>基础表格</el-breadcrumb-item>
            </el-breadcrumb>
            <h3>基础表格页</h3>
            <p>表格页用于展示多条结构类似的数据，可对数据进行排序、筛选、对比或其他自定义操作。</p>
          </div>
          <div class="classic-header-utility">
            <span>消息中心</span>
            <span><i class="el-icon-user" aria-hidden="true" />1073000000@qq.com</span>
          </div>
        </header>
        <main class="classic-workspace">
        <el-card shadow="never" class="classic-filter-card">
          <el-form class="classic-filter-form" label-suffix=":">
            <div class="classic-filter-grid">
              <el-form-item label="日期" class="classic-field-date">
                <div class="classic-range-fields">
                  <el-date-picker v-model="filters.startDate" type="date" placeholder="选择日期" :size="controlSize" />
                  <span>−</span>
                  <el-date-picker v-model="filters.endDate" type="date" placeholder="选择日期" :size="controlSize" />
                </div>
              </el-form-item>
              <el-form-item label="姓名" class="classic-field-name">
                <el-input v-model="filters.name" placeholder="请输入" :size="controlSize" />
              </el-form-item>
              <el-form-item label="状态" class="classic-field-status">
                <el-select v-model="filters.status" placeholder="请选择" :size="controlSize">
                  <el-option label="进行中" value="running" />
                  <el-option label="已完成" value="finished" />
                </el-select>
              </el-form-item>
              <el-form-item label="地址" class="classic-field-address">
                <el-input v-model="filters.address" placeholder="请输入" :size="controlSize" />
              </el-form-item>
              <el-form-item label="完成进度" class="classic-field-progress">
                <div class="classic-range-fields">
                  <el-input v-model="filters.progressStart" placeholder="请输入" :size="controlSize" />
                  <span>−</span>
                  <el-input v-model="filters.progressEnd" placeholder="请输入" :size="controlSize" />
                </div>
              </el-form-item>
              <el-form-item class="classic-filter-actions">
                <el-button type="primary" :size="controlSize">搜索</el-button>
                <el-button :size="controlSize">重置</el-button>
                <el-button class="classic-collapse-link" type="text" :size="controlSize">收起<i class="el-icon-arrow-up" aria-hidden="true" /></el-button>
              </el-form-item>
            </div>
          </el-form>
        </el-card>

        <el-card shadow="never" class="classic-table-card">
          <div class="classic-table-toolbar">
            <div class="classic-toolbar-actions">
              <el-button type="primary" :size="controlSize"><i class="el-icon-plus" aria-hidden="true" /><span>新建</span></el-button>
              <el-button :size="controlSize">批量导入</el-button>
            </div>
          </div>
          <el-table
            class="classic-data-table"
            :data="classicRows"
            @selection-change="selectedRows = $event"
          >
            <el-table-column type="selection" :width="classicColumnWidth.selection" />
            <el-table-column prop="date" label="日期" :width="classicColumnWidth.date" />
            <el-table-column prop="name" label="姓名" :width="classicColumnWidth.name" show-overflow-tooltip />
            <el-table-column label="状态" :width="classicColumnWidth.status">
              <template slot-scope="{ row }">
                <el-tag :class="`status-tag status-${row.statusType}`" effect="plain">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
            <el-table-column label="完成进度" :width="classicColumnWidth.progress">
              <template slot-scope="{ row }">
                <el-progress :percentage="row.progress" :stroke-width="6" />
              </template>
            </el-table-column>
            <el-table-column label="操作" :width="classicColumnWidth.action">
              <template slot-scope="scope">
                <el-button class="classic-action-link" type="text">详情</el-button>
                <el-button class="classic-action-link" type="text">编辑</el-button>
                <el-button class="classic-action-link" type="text">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="classic-pagination">
            <span>共 6532 条</span>
            <el-pagination
              :current-page.sync="currentPage"
              :page-count="classicPageCount"
              :pager-count="7"
              :small="index === 22"
              :background="index === 24"
              layout="prev, pager, next"
            />
          </div>
          </el-card>
        </main>
      </div>
    </div>

    <div v-else class="table-component-example">
      <el-table v-if="index === 1" class="spec-table" :data="baseRows">
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 2" class="spec-table" :data="baseRows" stripe>
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 3" class="spec-table" :data="baseRows" border>
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 4" class="spec-table status-row-table" :data="statusRows" :row-class-name="statusRowClass">
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 5" class="spec-table" :data="longRows" height="240">
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <div v-else-if="index === 6" class="wide-table-shell">
        <el-table class="spec-table wide-table" :data="baseRows">
          <el-table-column fixed prop="date" label="日期" width="160" />
          <el-table-column prop="name" label="姓名" width="140" />
          <el-table-column prop="province" label="省份" width="140" />
          <el-table-column prop="city" label="城市" width="140" />
          <el-table-column prop="address" label="地址" width="360" />
          <el-table-column fixed="right" label="操作" width="140">
            <template slot-scope><el-button type="text">查看</el-button><el-button type="text">编辑</el-button></template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else-if="index === 7" class="wide-table-shell">
        <el-table class="spec-table wide-table" :data="longRows" height="240">
          <el-table-column fixed prop="date" label="日期" width="160" />
          <el-table-column prop="name" label="姓名" width="140" />
          <el-table-column prop="province" label="省份" width="140" />
          <el-table-column prop="city" label="城市" width="140" />
          <el-table-column prop="address" label="地址" width="360" />
          <el-table-column fixed="right" label="操作" width="140">
            <template slot-scope><el-button type="text">查看</el-button><el-button type="text" class="danger-text-button">删除</el-button></template>
          </el-table-column>
        </el-table>
      </div>

      <el-table v-else-if="index === 8" class="spec-table" :data="longRows" max-height="240">
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 9" class="spec-table" :data="baseRows" border>
        <el-table-column label="配送信息">
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column label="地址信息">
            <el-table-column prop="province" label="省份" width="120" />
            <el-table-column prop="city" label="城市" width="120" />
            <el-table-column prop="address" label="详细地址" />
          </el-table-column>
        </el-table-column>
      </el-table>

      <el-table
        v-else-if="index === 10"
        class="spec-table selectable-table"
        :data="baseRows"
        :row-class-name="selectedRowClass"
      >
        <el-table-column label="" width="52" align="center">
          <template slot-scope="{ row }"><el-radio v-model="singleSelected" :label="row.id"><span /></el-radio></template>
        </el-table-column>
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table
        v-else-if="index === 11"
        ref="selectionTable"
        class="spec-table"
        :data="selectionRows"
        @selection-change="selectedRows = $event"
      >
        <el-table-column type="selection" width="52" :selectable="rowSelectable" />
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table
        v-else-if="index === 12"
        class="spec-table"
        :data="baseRows"
        :default-sort="defaultSort"
      >
        <el-table-column prop="date" label="日期" width="180" sortable />
        <el-table-column prop="name" label="姓名" width="160" sortable />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 13" class="spec-table" :data="baseRows">
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column
          prop="name"
          label="姓名"
          width="160"
          column-key="name"
          :filters="nameFilters"
          :filter-method="filterName"
          :filtered-value="activeFilterValues"
        />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table v-else-if="index === 14" class="spec-table custom-cell-table" :data="statusRows">
        <el-table-column prop="name" label="任务" width="150" />
        <el-table-column label="状态" width="130">
          <template slot-scope="{ row }"><el-tag :type="row.tagType" effect="light">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="进度">
          <template slot-scope="{ row }"><el-progress :percentage="row.progress" :stroke-width="6" /></template>
        </el-table-column>
        <el-table-column label="操作" width="130">
          <template slot-scope><el-button type="text">详情</el-button><el-button type="text" class="danger-text-button">删除</el-button></template>
        </el-table-column>
      </el-table>

      <el-table v-else-if="index === 15" class="spec-table" :data="baseRows">
        <el-table-column prop="date" width="180">
          <template slot="header"><span class="custom-table-header">日期 <el-tooltip content="数据更新时间"><span aria-label="说明">ⓘ</span></el-tooltip></span></template>
        </el-table-column>
        <el-table-column prop="name" label="姓名" width="160" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table
        v-else-if="index === 16"
        class="spec-table"
        :data="baseRows"
        row-key="id"
        :expand-row-keys="expandedRowKeys"
      >
        <el-table-column type="expand">
          <template slot-scope="{ row }">
            <div class="expanded-row-content">
              <strong>{{ row.name }} 的配送详情</strong>
              <span>省份：{{ row.province }}</span>
              <span>城市：{{ row.city }}</span>
              <span>地址：{{ row.address }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <el-table
        v-else-if="index === 17"
        class="spec-table tree-state-table"
        :data="treeRows"
        row-key="id"
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        lazy
        :load="loadTreeNode"
        default-expand-all
      >
        <el-table-column prop="name" label="组织 / 任务" width="240" />
        <el-table-column prop="owner" label="负责人" width="140" />
        <el-table-column prop="stateLabel" label="加载状态" />
      </el-table>

      <el-table
        v-else-if="index === 18"
        class="spec-table summary-table"
        :data="amountRows"
        show-summary
        :summary-method="summaryMethod"
      >
        <el-table-column prop="name" label="项目" width="220" />
        <el-table-column prop="quantity" label="数量" width="160" />
        <el-table-column prop="amount" label="金额（元）" />
      </el-table>

      <el-table v-else-if="index === 19" class="spec-table" :data="mergeRows" border :span-method="spanMethod">
        <el-table-column prop="category" label="分类" width="160" />
        <el-table-column prop="name" label="项目" width="180" />
        <el-table-column prop="amount" label="金额（元）" />
      </el-table>

      <el-table v-else-if="index === 20" class="spec-table" :data="baseRows">
        <el-table-column type="index" label="业务序号" width="120" :index="indexMethod" />
        <el-table-column prop="date" label="日期" width="160" />
        <el-table-column prop="name" label="姓名" width="140" />
        <el-table-column prop="address" label="地址" />
      </el-table>

      <div v-else-if="index === 21" class="table-layout-pair">
        <div>
          <h4>fixed 固定布局</h4>
          <el-table class="spec-table fixed-layout-table" :data="layoutRows">
            <el-table-column prop="name" label="名称" width="150" />
            <el-table-column prop="description" label="描述" show-overflow-tooltip />
          </el-table>
        </div>
        <div>
          <h4>auto 自动布局</h4>
          <el-table class="spec-table auto-layout-table" :data="layoutRows">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="description" label="描述" />
          </el-table>
        </div>
      </div>
    </div>
  </section>
</template>

<script>
export default {
  name: 'TableScenario',
  props: {
    scenario: { type: Object, required: true },
    evidenceMode: { type: Boolean, default: false },
    evidenceState: { type: String, default: 'Default' },
  },
  data() {
    const baseRows = [
      { id: 1, date: '2024-05-02', name: '王小虎', province: '上海', city: '普陀区', address: '金沙江路 1518 弄' },
      { id: 2, date: '2024-05-04', name: '李小明', province: '北京', city: '朝阳区', address: '望京东路 8 号' },
      { id: 3, date: '2024-05-01', name: '陈晨', province: '浙江', city: '杭州市', address: '文一西路 969 号' },
      { id: 4, date: '2024-05-03', name: '赵敏', province: '广东', city: '深圳市', address: '深南大道 1001 号' },
    ];
    return {
      baseRows,
      longRows: Array.from({ length: 12 }, (_, rowIndex) => ({
        ...baseRows[rowIndex % baseRows.length],
        id: rowIndex + 1,
        name: `${baseRows[rowIndex % baseRows.length].name} ${rowIndex + 1}`,
      })),
      selectionRows: [...baseRows, { id: 5, date: '2024-05-05', name: '禁用行', address: '该行不可选择', disabled: true }],
      statusRows: [
        { ...baseRows[0], status: '默认', tagType: 'info', progress: 20, rowState: 'default' },
        { ...baseRows[1], status: '警告', tagType: 'warning', progress: 40, rowState: 'warning' },
        { ...baseRows[2], status: '成功', tagType: 'success', progress: 80, rowState: 'success' },
        { ...baseRows[3], status: '当前', tagType: '', progress: 60, rowState: 'current' },
      ],
      amountRows: [
        { name: '设计服务', quantity: 2, amount: 3200 },
        { name: '研发服务', quantity: 4, amount: 8600 },
        { name: '测试服务', quantity: 1, amount: 1800 },
      ],
      mergeRows: [
        { category: '基础服务', name: '设计', amount: 3200 },
        { category: '基础服务', name: '研发', amount: 8600 },
        { category: '增值服务', name: '测试', amount: 1800 },
        { category: '增值服务', name: '运维', amount: 2400 },
      ],
      layoutRows: [
        { name: '短标题', description: '这是一段用于验证固定布局省略效果的较长描述内容' },
        { name: '较长的业务名称', description: '短描述' },
      ],
      classicRows: [
        { id: 1, date: '2016-05-03', name: 'Tom', status: '进行中', statusType: 'running', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 2, date: '2016-05-03', name: 'Tom', status: '进行中', statusType: 'running', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 3, date: '2016-05-03', name: 'Tom', status: '进行中', statusType: 'running', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 4, date: '2016-05-03', name: 'Tom', status: '已完成', statusType: 'finished', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 5, date: '2016-05-03', name: 'Tom', status: '已完成', statusType: 'finished', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 6, date: '2016-05-03', name: 'Tom', status: '已关闭', statusType: 'closed', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 7, date: '2016-05-03', name: 'Tom', status: '已关闭', statusType: 'closed', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 8, date: '2016-05-03', name: 'Tom', status: '已废止', statusType: 'stopped', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
        { id: 9, date: '2016-05-03', name: 'Tom', status: '已废止', statusType: 'stopped', address: 'No. 189, Grove St, Los Angeles', progress: 40 },
      ],
      singleSelected: 1,
      selectedRows: [],
      currentPage: 1,
      filters: {
        startDate: '',
        endDate: '',
        name: '',
        status: '',
        address: '',
        progressStart: '',
        progressEnd: '',
      },
      classicPreviewWidth: 0,
      classicResizeObserver: null,
      nameFilters: [
        { text: '王小虎', value: '王小虎' },
        { text: '李小明', value: '李小明' },
      ],
    };
  },
  computed: {
    index() {
      return this.scenario.ordinal;
    },
    isClassicPage() {
      return this.index >= 22;
    },
    densityClass() {
      return this.index === 22 ? 'density-small' : this.index === 24 ? 'density-large' : 'density-medium';
    },
    densityLabel() {
      return this.index === 22 ? 'Small' : this.index === 24 ? 'Large' : 'Medium';
    },
    classicViewport() {
      return this.index === 22 ? '1280 × 800' : this.index === 24 ? '1920 × 1080' : '1440 × 900';
    },
    classicDimensions() {
      if (this.index === 22) return { width: 1280, height: 800 };
      if (this.index === 24) return { width: 1920, height: 1080 };
      return { width: 1440, height: 900 };
    },
    classicPageCount() {
      return this.index === 24 ? 100 : 10;
    },
    classicPreviewStyle() {
      const { width, height } = this.classicDimensions;
      const availableWidth = this.classicPreviewWidth || width;
      const scale = this.evidenceMode ? 1 : Math.min(1, availableWidth / width);
      return {
        '--classic-page-width': `${width}px`,
        '--classic-page-height': `${height}px`,
        '--classic-preview-scale': scale.toFixed(4),
        '--classic-preview-height': `${Math.ceil(height * scale)}px`,
      };
    },
    controlSize() {
      return this.index === 22 ? 'mini' : this.index === 24 ? 'medium' : 'small';
    },
    classicColumnWidth() {
      if (this.index === 22) return { selection: 40, date: 122, name: 96, status: 90, progress: 180, action: 136 };
      if (this.index === 24) return { selection: 48, date: 160, name: 112, status: 120, progress: 284, action: 207 };
      return { selection: 48, date: 160, name: 116, status: 120, progress: 220, action: 190 };
    },
    defaultSort() {
      if (this.evidenceState === 'Ascending') return { prop: 'date', order: 'ascending' };
      if (this.evidenceState === 'Descending') return { prop: 'date', order: 'descending' };
      return {};
    },
    activeFilterValues() {
      return this.evidenceState === 'Active' ? ['王小虎'] : [];
    },
    expandedRowKeys() {
      return this.evidenceState === 'Collapsed' ? [] : [1];
    },
    treeRows() {
      const stateLabel = this.evidenceState === 'Loading'
        ? 'Loading…'
        : this.evidenceState === 'Error' ? '加载失败，请重试' : '已加载';
      return [
        {
          id: 1,
          name: '华东区域',
          owner: '王小虎',
          stateLabel,
          children: [
            { id: 11, name: '上海分组', owner: '李小明', stateLabel },
            { id: 12, name: '杭州分组', owner: '陈晨', stateLabel },
          ],
        },
        { id: 2, name: '华南区域', owner: '赵敏', stateLabel: '待展开', hasChildren: true },
      ];
    },
  },
  mounted() {
    if (this.isClassicPage) {
      this.$nextTick(() => {
        const shell = this.$refs.classicPreviewShell;
        if (!shell) return;
        // 普通预览按卡片可用宽度等比缩放；证据模式由计算属性强制保持 1:1。
        const syncPreviewWidth = () => {
          this.classicPreviewWidth = shell.clientWidth;
        };
        syncPreviewWidth();
        this.classicResizeObserver = new ResizeObserver(syncPreviewWidth);
        this.classicResizeObserver.observe(shell);
      });
    }
    if ([5, 6, 7].includes(this.index) && this.evidenceState === 'Scrolled') {
      this.$nextTick(() => {
        const scrollTable = () => {
          this.$el.querySelectorAll('.el-table__body-wrapper').forEach((scrollContainer) => {
            if (scrollContainer.scrollHeight > scrollContainer.clientHeight) scrollContainer.scrollTop = 96;
            if (scrollContainer.scrollWidth > scrollContainer.clientWidth) scrollContainer.scrollLeft = 180;
            scrollContainer.dispatchEvent(new Event('scroll'));
          });
        };
        scrollTable();
        window.setTimeout(scrollTable, 80);
        window.setTimeout(scrollTable, 160);
      });
    }
    if (this.index === 13 && this.evidenceState === 'Open') {
      this.$nextTick(() => {
        const openFilter = () => this.$el.querySelector('.el-table__column-filter-trigger')?.click();
        window.setTimeout(openFilter, 80);
      });
    }
    if (this.index === 11 && ['Selected', 'Indeterminate'].includes(this.evidenceState)) {
      this.$nextTick(() => {
        const count = this.evidenceState === 'Selected' ? 4 : 2;
        this.selectionRows.slice(0, count).forEach((row) => this.$refs.selectionTable.toggleRowSelection(row, true));
      });
    }
  },
  beforeDestroy() {
    this.classicResizeObserver?.disconnect();
  },
  methods: {
    statusRowClass({ row }) {
      return `is-${row.rowState}`;
    },
    selectedRowClass({ row }) {
      return row.id === this.singleSelected ? 'is-current-selected' : '';
    },
    rowSelectable(row) {
      return !row.disabled;
    },
    filterName(value, row) {
      return row.name === value;
    },
    loadTreeNode(row, treeNode, resolve) {
      // 懒加载节点保持现有列网格，异步结果只补充子行。
      window.setTimeout(() => resolve([
        { id: `${row.id}-lazy`, name: `${row.name} / 异步子节点`, owner: row.owner, stateLabel: '已加载' },
      ]), 120);
    },
    summaryMethod({ columns, data }) {
      return columns.map((column, columnIndex) => {
        if (columnIndex === 0) return '合计';
        const values = data.map((item) => Number(item[column.property] || 0));
        return values.reduce((total, value) => total + value, 0).toLocaleString('zh-CN');
      });
    },
    spanMethod({ rowIndex, columnIndex }) {
      if (columnIndex === 0 && rowIndex % 2 === 0) return { rowspan: 2, colspan: 1 };
      if (columnIndex === 0 && rowIndex % 2 === 1) return { rowspan: 0, colspan: 0 };
      return { rowspan: 1, colspan: 1 };
    },
    indexMethod(rowIndex) {
      return `NO.${String(rowIndex + 1).padStart(3, '0')}`;
    },
  },
};
</script>
