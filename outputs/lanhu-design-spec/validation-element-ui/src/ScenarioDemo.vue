<!-- AI-code-start lines:992 tool:Codex -->
<template>
  <div class="scenario-demo" :class="[demoClass, evidenceStateClass]" :data-variant="variantName">
    <template v-if="componentId === 'badge'">
      <div class="demo-row">
        <el-badge
          v-for="item in badgeItems"
          :key="`${item.host}-${item.value}`"
          :value="item.value"
          :max="item.max"
          :type="item.type"
          :is-dot="item.isDot"
          :aria-label="item.ariaLabel"
        >
          <!-- 小红点场景保留蓝湖中的按钮、文本和邮件图标三种宿主。 -->
          <el-button v-if="item.hostType === 'button'" type="primary" class="badge-host-button" :aria-label="item.host">
            <i class="el-icon-share" />
          </el-button>
          <span v-else-if="item.hostType === 'text'" class="badge-host-text">{{ item.host }}</span>
          <i v-else-if="item.hostType === 'icon'" class="el-icon-message badge-host-icon" />
          <el-button v-else>{{ item.host }}</el-button>
        </el-badge>
      </div>
    </template>

    <template v-else-if="componentId === 'button'">
      <div class="demo-row">
        <el-button
          v-for="item in buttonItems"
          :key="`${item.type}-${item.label}-${item.icon}`"
          :type="item.text ? 'text' : item.type"
          :plain="item.plain"
          :round="item.round"
          :circle="item.circle"
          :disabled="item.disabled"
          :aria-label="item.ariaLabel"
        >
          <i v-if="item.icon && item.iconPosition !== 'right'" :class="item.icon" />
          <span v-if="item.label">{{ item.label }}</span>
          <i v-if="item.icon && item.iconPosition === 'right'" :class="item.icon" />
        </el-button>
      </div>
    </template>

    <template v-else-if="componentId === 'checkbox'">
      <div v-if="index <= 2" class="demo-row">
        <el-checkbox v-model="checkboxStateA" :disabled="index === 2">未选</el-checkbox>
        <el-checkbox v-model="checkboxStateB" :disabled="index === 2">已选</el-checkbox>
        <el-checkbox v-model="checkboxStateC" :indeterminate="true" :disabled="index === 2">半选</el-checkbox>
      </div>
      <el-checkbox-group v-else-if="index === 3" v-model="checkedValues">
        <el-checkbox v-for="city in checkboxCities" :key="city" :label="city">{{ city }}</el-checkbox>
      </el-checkbox-group>
      <div v-else class="checkbox-size-stack">
        <div v-for="size in ['medium', 'small', 'mini']" :key="size" class="demo-row">
          <el-checkbox :value="false" border :size="size">{{ checkboxSizeLabel(size) }}未选</el-checkbox>
          <el-checkbox :value="true" border :size="size">{{ checkboxSizeLabel(size) }}已选</el-checkbox>
          <el-checkbox :value="true" border :size="size" disabled>{{ checkboxSizeLabel(size) }}禁用</el-checkbox>
        </div>
      </div>
    </template>

    <template v-else-if="componentId === 'collapse'">
      <el-collapse v-model="collapseNames" :accordion="index === 2">
        <el-collapse-item name="1">
          <template slot="title">
            <span>一致性 Consistency</span>
            <i v-if="index === 3" class="el-icon-info collapse-title-icon" />
          </template>
          <div class="collapse-copy">
            <span>与现实生活一致：与现实生活的流程、逻辑保持一致，遵循用户习惯的语言和概念；</span>
            <span>在界面中一致：所有的元素和结构需保持一致，比如：设计样式、图标和文本、元素的位置等。</span>
          </div>
        </el-collapse-item>
        <el-collapse-item title="反馈 Feedback" name="2">通过界面样式和交互动效让用户清晰感知操作。</el-collapse-item>
        <el-collapse-item title="效率 Efficiency" name="3">界面流程简单直观，帮助用户快速完成任务。</el-collapse-item>
        <el-collapse-item title="可控 Controllability" name="4">用户可以撤销、回退或中止当前操作。</el-collapse-item>
      </el-collapse>
    </template>

    <template v-else-if="componentId === 'color-picker'">
      <div class="demo-row color-picker-row">
        <!-- 基础场景同时保留蓝湖中的无值与有值触发器，面板由无值触发器承载。 -->
        <template v-if="index === 1">
          <el-color-picker ref="evidenceControl" v-model="emptyColor" size="small" popper-class="el-popper" />
          <el-color-picker v-model="color" size="small" popper-class="el-popper" />
        </template>
        <template v-else-if="index === 4">
          <el-color-picker v-for="size in ['medium', 'small', 'mini']" :key="size" v-model="color" :size="size" popper-class="el-popper" />
        </template>
        <el-color-picker
          v-else
          ref="evidenceControl"
          v-model="color"
          size="small"
          :show-alpha="index === 2"
          :predefine="index === 3 ? predefineColors : undefined"
          popper-class="el-popper"
        />
      </div>
    </template>

    <template v-else-if="componentId === 'dialog' || componentId === 'dialog-usage'">
      <el-button type="primary" @click="openDialogScene">{{ index > 4 ? '打开复杂对话框' : '打开对话框' }}</el-button>
      <el-dialog
        :visible.sync="dialogVisible"
        :title="dialogTitle"
        :width="dialogWidth"
        :center="isCenteredDialog"
        :custom-class="dialogClass"
        :modal="false"
        :append-to-body="false"
        :modal-append-to-body="false"
        :lock-scroll="false"
        :close-on-click-modal="false"
        top="0"
      >
        <p v-if="dialogKind === 'simple'" class="dialog-description">描述文字</p>
        <el-form
          v-else-if="dialogKind === 'usage-form' || dialogKind === 'small-dual'"
          :model="form"
          class="dialog-guidance-form"
          :class="{ 'is-two-column': isTwoColumnUsageDialog }"
        >
          <div class="dialog-guidance-column">
            <el-form-item label="四字标签" required><el-input v-model="form.name" placeholder="请输入" /></el-form-item>
            <el-form-item label="四字标签" required><el-input v-model="form.approver" placeholder="请输入" /></el-form-item>
            <el-form-item label="四字标签" required>
              <el-radio-group v-model="form.resource">
                <el-radio label="备选项一">备选项</el-radio>
                <el-radio label="备选项二">备选项</el-radio>
                <el-radio v-if="index === 4" label="备选项三">备选项</el-radio>
                <el-radio v-if="index === 4" label="备选项四">备选项</el-radio>
                <el-radio v-if="index === 4" label="备选项五">备选项</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="四字标签" required>
              <el-upload action="#" :auto-upload="false"><el-button type="primary">点击上传</el-button></el-upload>
            </el-form-item>
          </div>
          <div v-if="isTwoColumnUsageDialog" class="dialog-guidance-column">
            <el-form-item label="四字标签" required>
              <el-select v-model="form.city" placeholder="请选择">
                <el-option label="备选项" value="option-1" />
              </el-select>
            </el-form-item>
            <el-form-item label="四字标签" required><el-date-picker v-model="form.date" type="date" placeholder="选择日期" /></el-form-item>
            <el-form-item label="四字标签" required>
              <el-checkbox-group v-model="form.types">
                <el-checkbox label="备选项一">备选项</el-checkbox>
                <el-checkbox label="备选项二">备选项</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="四字标签" required>
              <el-upload action="#" :auto-upload="false"><el-button type="primary">点击上传</el-button></el-upload>
            </el-form-item>
          </div>
        </el-form>
        <el-form v-else-if="dialogKind === 'standard-form'" :model="form" class="dialog-standard-form">
          <el-form-item label="活动名称"><el-input v-model="form.name" placeholder="请输入" /></el-form-item>
          <el-form-item label="活动日期"><el-date-picker v-model="form.date" type="date" placeholder="选择日期" /></el-form-item>
          <el-form-item label="活动区域"><el-input v-model="form.city" placeholder="请输入" /></el-form-item>
          <el-form-item label="活动资源">
            <el-radio-group v-model="form.resource">
              <el-radio label="品牌赞助">品牌赞助</el-radio>
              <el-radio label="免费场地">免费场地</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
        <el-table v-else-if="dialogKind === 'table'" :data="dialogTableData">
          <el-table-column prop="date" label="Date" width="150" />
          <el-table-column prop="name" label="Name" width="200" />
          <el-table-column prop="address" label="Address" />
        </el-table>
        <div v-else-if="dialogKind === 'dynamic'" class="dialog-dynamic-content">
          <div class="dialog-filter-row">
            <span>创建日期</span>
            <el-date-picker v-model="form.date" type="date" placeholder="选择日期" />
            <span class="dialog-range-separator">–</span>
            <el-time-picker v-model="dialogTimeValue" placeholder="选择时间" />
            <span>供应商名称</span>
            <el-input v-model="form.name" placeholder="请输入" />
            <el-button type="primary">查询</el-button>
            <el-button>重置</el-button>
          </div>
          <div class="dialog-table-placeholder" aria-label="大型表格内容区" />
        </div>
        <div v-if="dialogKind !== 'table' && dialogKind !== 'dynamic'" slot="footer">
          <el-button @click="closeDialogScene">取消</el-button>
          <el-button type="primary" @click="closeDialogScene">确定</el-button>
        </div>
      </el-dialog>
      <!-- Small 画板同时展示表单型与信息型两种 480px 对话框。 -->
      <el-dialog
        v-if="componentId === 'dialog-usage' && index === 3"
        :visible.sync="secondaryDialogVisible"
        title="标题名称"
        width="480px"
        custom-class="dialog-panel dialog-panel--usage-info"
        :modal="false"
        :append-to-body="false"
        :modal-append-to-body="false"
        :lock-scroll="false"
        :close-on-click-modal="false"
        top="0"
      >
        <p class="dialog-info-description"><i class="el-icon-info" /><span>详细描述文字</span></p>
        <div slot="footer">
          <el-button @click="closeDialogScene">取消</el-button>
          <el-button type="primary" @click="closeDialogScene">确定</el-button>
        </div>
      </el-dialog>
    </template>

    <FrequentComponents32
      v-else-if="componentId === 'frequent-components-32'"
      :index="frequentType"
      :evidence-mode="evidenceMode"
      :evidence-state="evidenceState"
    />

    <template v-else-if="componentId === 'input-number'">
      <div v-if="index === 4" class="demo-row input-number-sizes"><el-input-number v-model="numberValue" size="medium" :precision="2" /><el-input-number v-model="numberValue" size="small" :precision="2" /><el-input-number v-model="numberValue" size="mini" :precision="2" /></div>
      <el-input-number v-else v-model="numberValue" :min="0" :max="10" :step="index === 3 ? 2 : 1" :precision="2" :disabled="index === 2" />
    </template>

    <template v-else-if="componentId === 'input'">
      <el-autocomplete v-if="index === 9" ref="evidenceControl" v-model="textValue" class="input-autocomplete" :fetch-suggestions="querySuggestions" placeholder="请输入" popper-class="input-suggestion-panel" />
      <div v-else-if="index === 8" class="demo-row input-size-row"><el-input v-model="textValue" size="medium" placeholder="请输入" /><el-input v-model="textValue" size="small" placeholder="请输入" /><el-input v-model="textValue" size="mini" placeholder="请输入" /></div>
      <div v-else-if="index === 10" class="input-limit-stack">
        <div class="input-limit-item input-limit-single">
          <el-input v-model="limitText" maxlength="10" placeholder="请输入" />
          <span class="input-count">{{ limitText.length }}/10</span>
        </div>
        <div class="input-limit-item input-limit-textarea">
          <el-input v-model="limitTextarea" type="textarea" :rows="2" maxlength="200" placeholder="请输入" />
          <span class="input-count">{{ limitTextarea.length }}/200</span>
        </div>
      </div>
      <el-input v-else-if="index === 3" v-model="textValue" class="input-clear-example">
        <i slot="suffix" class="el-icon-circle-close input-clear-icon" aria-label="清空" @click="textValue = ''" />
      </el-input>
      <div v-else-if="index === 4" class="demo-row input-password-row">
        <el-input v-model="textValue" type="password">
          <img slot="suffix" class="local-icon input-password-icon" src="/assets/icons/visibility-off-28-neutral.png" alt="隐藏密码" />
        </el-input>
        <el-input v-model="textValue"><i slot="suffix" class="el-icon-view input-password-icon" /></el-input>
      </div>
      <div v-else-if="index === 5" class="input-icon-grid">
        <el-input v-model="textValue" placeholder="请输入"><i slot="prefix" class="el-icon-search" /></el-input>
        <el-input v-model="textValue" placeholder="请输入"><i slot="suffix" class="el-icon-date" /></el-input>
        <el-input v-model="textValue" class="input-focus-example" placeholder="请输入"><i slot="prefix" class="el-icon-search" /></el-input>
        <el-input v-model="textValue" class="input-focus-example" placeholder="请输入"><i slot="suffix" class="el-icon-date" /></el-input>
      </div>
      <div v-else-if="index === 7" class="input-compound-stack">
        <el-input v-model="textValue" placeholder="请输入"><template slot="prepend">文案</template></el-input>
        <el-input v-model="textValue" placeholder="请输入"><template slot="append">文案</template></el-input>
      </div>
      <el-input v-else
        v-model="textValue"
        :type="index === 6 ? 'textarea' : 'text'"
        :rows="index === 6 ? 2 : undefined"
        placeholder="请输入"
        :clearable="index === 3"
        :disabled="index === 2"
      />
    </template>

    <template v-else-if="componentId === 'menu'">
      <el-menu v-if="index < 3" ref="evidenceMenu" default-active="1" mode="horizontal">
        <el-menu-item index="1">Processing Center</el-menu-item>
        <el-submenu index="2" popper-class="menu-evidence-popup">
          <template slot="title">{{ index === 2 ? 'Processing Center' : 'Workspace' }}</template>
          <el-menu-item index="2-1">item one</el-menu-item>
          <el-menu-item index="2-2">item one</el-menu-item>
          <el-submenu index="2-3" popper-class="menu-evidence-popup"><template slot="title">item one</template><el-menu-item index="2-3-1">item one</el-menu-item><el-menu-item index="2-3-2">item one</el-menu-item><el-menu-item index="2-3-3">item one</el-menu-item></el-submenu>
        </el-submenu>
        <el-menu-item index="3" disabled>Info</el-menu-item>
        <el-menu-item index="4">Orders</el-menu-item>
      </el-menu>
      <el-menu v-else default-active="2" :default-openeds="['1', '1-4']" mode="vertical">
        <el-submenu index="1">
          <template slot="title"><i class="el-icon-info" /><span>Navigator One</span></template>
          <el-menu-item-group title="Group one"><el-menu-item index="1-1">item one</el-menu-item><el-menu-item index="1-2">item one</el-menu-item></el-menu-item-group>
          <el-menu-item-group title="Group two"><el-menu-item index="1-3">item three</el-menu-item></el-menu-item-group>
          <el-submenu index="1-4"><template slot="title">item three</template><el-menu-item index="1-4-1">item one</el-menu-item></el-submenu>
        </el-submenu>
        <el-menu-item index="2"><i class="el-icon-info" /><span>Navigator Two</span></el-menu-item>
        <el-menu-item index="3" disabled><i class="el-icon-info" /><span>Navigator Three</span></el-menu-item>
        <el-menu-item index="4"><i class="el-icon-info" /><span>Navigator Four</span></el-menu-item>
      </el-menu>
    </template>

    <TableScenario
      v-else-if="componentId === 'table'"
      :scenario="scenario"
      :evidence-mode="evidenceMode"
      :evidence-state="evidenceState"
    />

    <PaginationProgress
      v-else-if="componentId === 'pagination' || componentId === 'progress'"
      :component-id="componentId"
      :index="index"
    />

    <TransferUpload
      v-else-if="componentId === 'transfer' || componentId === 'upload'"
      :component-id="componentId"
      :index="index"
      :evidence-state="evidenceState"
    />

    <template v-else-if="componentId === 'radio'">
      <el-radio-group v-if="index <= 2" v-model="radioValue" :disabled="index === 2">
        <el-radio label="1">备选项</el-radio>
        <el-radio label="2">备选项</el-radio>
      </el-radio-group>
      <el-radio-group v-else-if="index === 3" v-model="radioValue">
        <el-radio v-for="item in radioGroupItems" :key="item" :label="item">备选项</el-radio>
      </el-radio-group>
      <div v-else-if="index === 4" class="radio-button-matrix">
        <div v-for="(column, columnIndex) in radioButtonColumns" :key="columnIndex" class="radio-button-stack">
          <el-radio-group v-for="state in column" :key="state.label" v-model="state.value" :disabled="state.disabled">
            <el-radio-button v-for="item in radioButtonItems" :key="item" :label="item" :disabled="state.disabledItems && state.disabledItems.includes(item)">选项</el-radio-button>
          </el-radio-group>
        </div>
      </div>
      <div v-else class="radio-size-stack">
        <template v-for="size in ['medium', 'small', 'mini']">
          <div :key="`${size}-enabled`" class="demo-row">
            <el-radio value="selected" label="selected" border :size="size">备选项</el-radio>
            <el-radio value="unselected" label="selected" border :size="size">备选项</el-radio>
          </div>
          <div :key="`${size}-disabled`" class="demo-row">
            <el-radio value="selected" label="selected" border :size="size" disabled>备选项</el-radio>
            <el-radio value="unselected" label="selected" border :size="size" disabled>备选项</el-radio>
          </div>
        </template>
      </div>
    </template>

    <template v-else-if="componentId === 'select'">
      <!-- 多选、分组与筛选在蓝湖中均为双状态并排展示，使用两组真实 Select 完整还原。 -->
      <div v-if="index === 5" class="select-variant-pair">
        <el-select ref="evidenceControl" v-model="selectMultipleSimple" multiple placeholder="请选择">
          <el-option v-for="option in visibleSelectOptions" :key="option.value" :label="option.label" :value="option.value">
            <span class="option-content">
              <span>{{ option.label }}</span>
              <img v-if="selectMultipleSimple.includes(option.value)" class="local-icon icon-24" src="/assets/icons/check-24-brand.png" alt="已选" />
            </span>
          </el-option>
        </el-select>
        <el-select ref="secondaryEvidenceControl" v-model="selectMultiple" multiple collapse-tags placeholder="请选择">
          <el-option v-for="option in options" :key="option.value" :class="{ 'select-extra-option': option.extra }" :label="option.label" :value="option.value">
            <span class="option-content">
              <span>{{ option.label }}</span>
              <img v-if="selectMultiple.includes(option.value)" class="local-icon icon-24" src="/assets/icons/check-24-brand.png" alt="已选" />
            </span>
          </el-option>
        </el-select>
      </div>
      <div v-else-if="index === 7" class="select-variant-pair">
        <el-select ref="evidenceControl" v-model="selectValue" placeholder="请选择">
          <el-option-group label="热门城市">
            <el-option label="上海" value="option-1" />
            <el-option label="北京" value="option-2" />
          </el-option-group>
          <el-option-group class="select-secondary-group" label=" ">
            <el-option label="选项 5" value="option-5" />
            <el-option label="成都" value="option-6" />
            <el-option label="深圳" value="option-7" />
            <el-option label="广东" value="option-8" />
            <el-option label="大连" value="option-9" />
          </el-option-group>
        </el-select>
        <el-select ref="secondaryEvidenceControl" v-model="selectValueSecondary" placeholder="请选择">
          <el-option-group label="热门城市">
            <el-option label="上海" value="option-1" />
            <el-option label="北京" value="option-2" />
          </el-option-group>
          <el-option-group class="select-secondary-group" label=" ">
            <el-option label="选项 5" value="option-5" />
            <el-option label="成都" value="option-6" />
            <el-option label="深圳" value="option-7" />
            <el-option label="广东" value="option-8" />
            <el-option label="大连" value="option-9" />
          </el-option-group>
        </el-select>
      </div>
      <div v-else-if="index === 8" class="select-variant-pair">
        <el-select ref="evidenceControl" v-model="selectValue" filterable placeholder="请选择">
          <el-option v-for="option in visibleSelectOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select ref="secondaryEvidenceControl" v-model="selectFilteredValue" filterable placeholder="请选择">
          <el-option label="选项 4" value="option-4" />
        </el-select>
      </div>
      <el-select
        v-else
        ref="evidenceControl"
        v-model="selectModel"
        placeholder="请选择"
        :disabled="index === 3"
        :clearable="index === 4"
        :filterable="index === 9"
        :loading="index === 9 && remoteState === 'loading'"
        :no-data-text="remoteEmptyText"
      >
        <el-option
          v-for="option in sceneOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
          :disabled="(index === 2 && option.value === 'option-3') || (index === 6 && evidenceState === 'Disabled' && option.value === 'option-3')"
        >
          <span class="option-content">
            <span>{{ index === 6 ? `${option.label} · 自定义说明` : option.label }}</span>
            <img v-if="isOptionSelected(option.value)" class="local-icon icon-24" src="/assets/icons/check-24-brand.png" alt="已选" />
          </span>
        </el-option>
      </el-select>
      <el-radio-group v-if="index === 9" v-model="remoteState" class="state-controls" size="mini">
        <el-radio-button label="loading">Loading</el-radio-button>
        <el-radio-button label="empty">Empty</el-radio-button>
        <el-radio-button label="error">Error</el-radio-button>
        <el-radio-button label="ready">Ready</el-radio-button>
      </el-radio-group>
    </template>

    <template v-else-if="componentId === 'switch'">
      <div class="demo-row">
        <!-- 蓝湖基础与禁用行展示品牌橙、成功绿两种开启态；文字行才展示关闭与开启。 -->
        <template v-if="index === 2">
          <el-switch v-model="switchOff" inactive-text="左边文字" active-text="右边文字" />
          <el-switch v-model="switchOn" inactive-text="左边文字" active-text="右边文字" active-color="#00B42A" />
        </template>
        <template v-else>
          <el-switch v-model="switchBrand" :disabled="index === 3" active-color="#FF6014" />
          <el-switch v-model="switchSuccess" :disabled="index === 3" active-color="#00B42A" />
        </template>
      </div>
    </template>

    <FormScenario v-else-if="componentId.startsWith('form-')" :scenario="scenario" />

    <template v-else-if="componentId === 'cascader'">
      <el-cascader
        ref="evidenceControl"
        v-model="cascaderValue"
        :options="cascaderOptionsForScene"
        :props="{ multiple: index === 3, checkStrictly: index === 4 }"
        :collapse-tags="index === 3"
        :popper-class="`cascader-evidence-${evidenceState.toLowerCase()}`"
        clearable
      />
    </template>

    <DateTimePickerScenario
      v-else-if="['date-time-picker', 'time-picker'].includes(componentId)"
      :scenario="scenario"
      :evidence-mode="evidenceMode"
      :evidence-state="evidenceState"
    />
  </div>
</template>

<script>
import DateTimePickerScenario from './DateTimePickerScenario.vue';
import FormScenario from './FormScenario.vue';
import FrequentComponents32 from './FrequentComponents32.vue';
import PaginationProgress from './PaginationProgress.vue';
import TableScenario from './TableScenario.vue';
import TransferUpload from './TransferUpload.vue';

export default {
  name: 'ScenarioDemo',
  components: { DateTimePickerScenario, FormScenario, FrequentComponents32, PaginationProgress, TableScenario, TransferUpload },
  props: {
    scenario: { type: Object, required: true },
    evidenceMode: { type: Boolean, default: false },
    evidenceState: { type: String, default: 'Default' },
  },
  data() {
    return {
      textValue: this.scenario.componentId === 'input'
        ? ({ 3: '输入中', 4: '666888' }[this.scenario.ordinal] || '')
        : '示例内容',
      textareaValue: '用于展示多行内容',
      checkedValues: ['北京'],
      checkboxCities: ['北京', '上海', '广州', '深圳', '杭州'],
      checkboxStateA: false,
      checkboxStateB: true,
      checkboxStateC: false,
      collapseNames: this.scenario.componentId === 'collapse'
        && (this.evidenceState === 'Collapsed' || (this.scenario.ordinal === 1 && this.evidenceState === 'Default'))
        ? []
        : ['1'],
      badgeTypes: ['primary', 'success', 'warning', 'danger', 'info'],
      emptyColor: null,
      color: '#FF6014',
      // 预定义颜色按蓝湖两行色板还原：第一行 10 个实色，第二行 4 个透明色。
      predefineColors: [
        '#F53F3F',
        '#FF7D00',
        '#FADC19',
        '#9FDB1D',
        '#00B42A',
        '#14C9C9',
        '#3491FA',
        '#722ED1',
        '#F5319D',
        '#FF6014',
        'rgba(0, 180, 42, 0.5)',
        'rgba(20, 201, 201, 0.5)',
        'rgba(52, 145, 250, 0.5)',
        'rgba(245, 49, 157, 0.5)',
      ],
      dialogVisible: false,
      secondaryDialogVisible: false,
      booleanValue: true,
      switchOff: false,
      switchOn: true,
      switchBrand: true,
      switchSuccess: true,
      radioValue: '2',
      numberValue: 1,
      progressValue: 60,
      currentPage: 2,
      tabValue: 'user',
      timeString: '08:30',
      dialogTimeValue: null,
      selectValue: [3, 9].includes(this.scenario.ordinal) ? '' : this.scenario.ordinal === 4 ? 'selected' : 'option-5',
      selectValueSecondary: 'option-1',
      selectFilteredValue: 'option-4',
      selectMultipleSimple: ['option-2', 'option-3'],
      selectMultiple: ['option-2', 'option-3', 'option-4', 'option-5', 'option-6', 'option-7', 'option-8'],
      remoteState: this.evidenceState === 'Loading' ? 'loading' : this.evidenceState === 'Error' ? 'error' : 'ready',
      dateValue: new Date(2021, 4, 15, 10, 30),
      dateRange: [new Date(2021, 4, 10), new Date(2021, 4, 15)],
      multipleDates: [new Date(2021, 4, 10), new Date(2021, 4, 15)],
      limitText: '',
      limitTextarea: '',
      radioGroupItems: ['备选项-1', '备选项-2', '备选项-3'],
      radioButtonItems: ['选项-1', '选项-2', '选项-3', '选项-4'],
      radioButtonColumns: [
        [
          { label: '第一项选中-1', value: '选项-1' },
          { label: '第二项选中-1', value: '选项-2' },
          { label: '第三项选中-1', value: '选项-3' },
          { label: '第四项选中-1', value: '选项-4' },
          { label: '第一项禁用', value: '', disabledItems: ['选项-1'] },
          { label: '第二项禁用', value: '', disabledItems: ['选项-2'] },
          { label: '第三项禁用', value: '', disabledItems: ['选项-3'] },
          { label: '第四项禁用', value: '', disabledItems: ['选项-4'] },
          { label: '第一项选中-2', value: '选项-1' },
          { label: '第二项选中-2', value: '选项-2' },
          { label: '第三项选中-2', value: '选项-3' },
          { label: '第四项选中-2', value: '选项-4' },
          { label: '第一项选中-3', value: '选项-1' },
          { label: '第一项选中-4', value: '选项-1' },
          { label: '第一项选中-5', value: '选项-1' },
        ],
        [
          { label: '整组未选-1', value: '' },
          { label: '整组未选-2', value: '' },
          { label: '整组未选-3', value: '' },
          { label: '整组未选-4', value: '' },
          { label: '整组禁用', value: '', disabled: true },
          { label: '局部禁用并选中', value: '选项-3', disabledItems: ['选项-2'] },
          { label: '第三项禁用-2', value: '', disabledItems: ['选项-3'] },
          { label: '第四项选中-3', value: '选项-4' },
          { label: '第一项选中-6', value: '选项-1' },
          { label: '第一项选中第三项禁用', value: '选项-1', disabledItems: ['选项-3'] },
          { label: '第一项选中-7', value: '选项-1' },
          { label: '第一项选中-8', value: '选项-1' },
        ],
      ],
      pickerOptions: {
        shortcuts: [
          { text: '今天', onClick: (picker) => picker.$emit('pick', new Date()) },
          { text: '昨天', onClick: (picker) => picker.$emit('pick', new Date(Date.now() - 86400000)) },
          { text: '一周前', onClick: (picker) => picker.$emit('pick', new Date(Date.now() - 604800000)) },
        ],
      },
      cascaderValue: this.initialCascaderValue(),
      transferValue: [],
      form: {
        name: '',
        city: '',
        approver: '',
        date: ['dialog', 'dialog-usage'].includes(this.scenario.componentId) ? null : new Date(2021, 4, 15, 10, 30),
        delivery: true,
        types: ['Online'],
        resource: 'Sponsor',
        description: '',
      },
      tableData: [{ name: '张三', city: '北京' }, { name: '李四', city: '上海' }],
      dialogTableData: [
        { date: '2016-05-04', name: 'Tom', address: 'No. 189, Grove St, Los Angeles' },
        { date: '2016-05-03', name: 'Tom', address: 'No. 189, Grove St, Los Angeles' },
        { date: '2016-05-02', name: 'Tom', address: 'No. 189, Grove St, Los Angeles' },
        { date: '2016-05-01', name: 'Tom', address: 'No. 189, Grove St, Los Angeles' },
      ],
      uploadFiles: [{ name: 'food.jpeg', url: '/assets/icons/check-24-brand.png', status: 'success' }],
      options: Array.from({ length: 10 }, (_, offset) => ({
        label: `选项 ${offset + 1}`,
        value: `option-${offset + 1}`,
        extra: offset >= 5,
      })),
      transferData: Array.from({ length: 13 }, (_, offset) => ({
        key: offset + 1,
        label: `备选项 ${offset + 1}`,
        disabled: offset === 4,
      })),
    };
  },
  computed: {
    componentId() {
      return this.scenario.componentId;
    },
    index() {
      return this.scenario.ordinal;
    },
    frequentType() {
      return this.index;
    },
    demoClass() {
      return [
        `demo-${this.componentId}`,
        this.componentId === 'form-small-cn' ? 'force-small' : '',
        this.componentId === 'form-large-cn' ? 'force-large' : '',
      ];
    },
    evidenceStateClass() {
      // 只在证据路由中启用受控视觉状态，正常组件交互仍由 Element UI 处理。
      return this.evidenceMode ? `evidence-state-${this.evidenceState.toLowerCase()}` : '';
    },
    buttonTypes() {
      return ['', 'primary', 'success', 'info', 'warning', 'danger'];
    },
    buttonItems() {
      if (this.index === 4) {
        return [
          { type: 'primary', icon: 'el-icon-search', circle: true, ariaLabel: '搜索' },
          { type: 'primary', icon: 'el-icon-edit', circle: true, ariaLabel: '编辑' },
          { type: 'success', icon: 'el-icon-check', circle: true, ariaLabel: '确认' },
          { type: 'info', icon: 'el-icon-message', circle: true, ariaLabel: '消息' },
          { type: 'warning', icon: 'el-icon-star-off', circle: true, ariaLabel: '收藏' },
          { type: 'danger', icon: 'el-icon-delete', circle: true, ariaLabel: '删除' },
        ];
      }
      if (this.index <= 6) {
        return this.buttonTypes.map((type) => ({
          type,
          label: this.buttonLabel(type),
          plain: this.index === 2 || this.index === 6,
          round: this.index === 3,
          disabled: this.index === 5 || this.index === 6,
        }));
      }
      if (this.index === 7) {
        return [
          { type: 'primary', label: '文字按钮', text: true },
          { type: 'primary', label: '禁用文字按钮', text: true, disabled: true },
        ];
      }
      if (this.index === 8) {
        return [
          { type: 'primary', icon: 'el-icon-edit', ariaLabel: '编辑' },
          { type: 'primary', icon: 'el-icon-share', ariaLabel: '分享' },
          { type: 'primary', icon: 'el-icon-delete', ariaLabel: '删除' },
        ];
      }
      return [
        { type: 'primary', icon: 'el-icon-search', label: '搜索', iconPosition: 'left' },
        { type: 'primary', icon: 'el-icon-upload2', label: '上传', iconPosition: 'right' },
      ];
    },
    badgeItems() {
      if (this.index === 1) {
        return [
          { host: 'comments', value: 12, type: 'danger' },
          { host: 'replies', value: 3, type: 'danger' },
          { host: 'comments', value: 1, type: 'primary' },
          { host: 'replies', value: 2, type: 'warning' },
        ];
      }
      if (this.index === 2) return ['danger', 'primary', 'warning'].map((type) => ({ host: 'comments', value: 12, type }));
      if (this.index === 3) {
        return [
          { host: 'comments', value: 200, max: 99, type: 'danger', ariaLabel: '99+' },
          { host: 'replies', value: 10, max: 9, type: 'danger', ariaLabel: '9+' },
        ];
      }
      if (this.index === 4) return [{ host: 'comments', value: 'New', type: 'danger' }, { host: 'replies', value: 'Hot', type: 'danger' }];
      return [
        { host: '分享', hostType: 'button', value: '', type: 'danger', isDot: true },
        { host: 'query', hostType: 'text', value: '', type: 'danger', isDot: true },
        { host: '邮件', hostType: 'icon', value: '', type: 'danger', isDot: true },
      ];
    },
    progressItems() {
      if (this.index === 1) {
        return [
          { percentage: 50 },
          { percentage: 100, label: 'Full' },
          { percentage: 100, status: 'success' },
          { percentage: 50, status: 'warning' },
          { percentage: 50, status: 'exception' },
        ];
      }
      if (this.index === 2) {
        return [
          { percentage: 50, textInside: true, strokeWidth: 24 },
          { percentage: 100, textInside: true, strokeWidth: 24 },
          { percentage: 50, textInside: true, strokeWidth: 24, status: 'warning' },
          { percentage: 50, textInside: true, strokeWidth: 24, status: 'exception' },
        ];
      }
      if (this.index === 3) {
        return [
          { percentage: 50, color: '#FF6014' },
          { percentage: 70, color: '#999999' },
          { percentage: 80, color: '#E6A23C' },
        ];
      }
      if (this.index === 4) {
        return [
          { percentage: 0, type: 'circle' },
          { percentage: 25, type: 'circle' },
          { percentage: 100, type: 'circle', status: 'success' },
          { percentage: 50, type: 'circle', status: 'warning' },
          { percentage: 50, type: 'circle', status: 'exception' },
        ];
      }
      return [
        { percentage: 50, label: 'Content' },
        { percentage: 80, textInside: true, strokeWidth: 24 },
        { percentage: 100, status: 'success', label: 'Done' },
        { percentage: 80, label: 'Progressing' },
      ];
    },
    dialogWidth() {
      if (this.componentId === 'dialog') return [1, 4].includes(this.index) ? '480px' : '720px';
      return ['480px', '904px', '480px', '720px', '960px', '1232px', '80%'][this.index - 1];
    },
    dialogKind() {
      if (this.componentId === 'dialog-usage') {
        if (this.index === 1) return 'simple';
        if (this.index === 3) return 'small-dual';
        if (this.index === 7) return 'dynamic';
        return 'usage-form';
      }
      if ([1, 4].includes(this.index)) return 'simple';
      return [2, 5].includes(this.index) ? 'standard-form' : 'table';
    },
    dialogTitle() {
      if (this.dialogKind === 'table') return 'Shipping address';
      return '标题名称';
    },
    isCenteredDialog() {
      return this.componentId === 'dialog' && this.index >= 4;
    },
    isTwoColumnUsageDialog() {
      return this.componentId === 'dialog-usage' && [2, 5, 6].includes(this.index);
    },
    dialogClass() {
      const classes = ['dialog-panel', `dialog-panel--${this.componentId}-${this.index}`];
      if (this.dialogKind === 'simple') classes.push('dialog-panel--simple');
      if (this.dialogKind === 'standard-form') classes.push('dialog-panel--standard-form');
      if (this.dialogKind === 'table') classes.push('dialog-panel--table');
      if (this.dialogKind === 'usage-form' || this.dialogKind === 'small-dual') classes.push('dialog-panel--usage-form');
      if (this.dialogKind === 'small-dual') classes.push('dialog-panel--small-dual-primary');
      if (this.dialogKind === 'dynamic') classes.push('dialog-panel--dynamic');
      if (this.isCenteredDialog) classes.push('is-centered-layout');
      return classes.join(' ');
    },
    isEnglishForm() {
      return this.componentId === 'form-default-en';
    },
    formSize() {
      if (this.componentId === 'form-large-cn') return 'medium';
      if (this.componentId === 'form-small-cn') return 'mini';
      return 'small';
    },
    formLabels() {
      if (this.isEnglishForm) {
        return { approver: 'Approved by', zone: 'Activity zone', search: 'Search', reset: 'Reset', name: 'Activity name', time: 'Activity time', delivery: 'Instant delivery', type: 'Activity type', resources: 'Resources', description: 'Activity form', create: 'Create', cancel: 'Cancel' };
      }
      return { approver: '审批人', zone: '活动区域', search: '查询', reset: '重置', name: '活动名称', time: '活动时间', delivery: '即时配送', type: '活动性质', resources: '特殊资源', description: '活动形式', create: '创建活动', cancel: '取消' };
    },
    variantName() {
      if (this.componentId === 'date-time-picker') return `${this.datePickerType}-${this.isShortcutDate ? 'shortcut' : 'default'}`;
      if (this.componentId === 'select') return `select-${this.index}-${this.index === 9 ? this.remoteState : 'default'}`;
      return `${this.componentId}-${this.index}`;
    },
    selectModel: {
      get() {
        return this.index === 5 ? this.selectMultiple : this.selectValue;
      },
      set(value) {
        if (this.index === 5) this.selectMultiple = value;
        else this.selectValue = value;
      },
    },
    visibleSelectOptions() {
      return this.options.filter((option) => !option.extra);
    },
    paginationLayout() {
      if (this.index === 1) return 'total, prev, pager, next';
      if (this.index === 2) return 'sizes, prev, pager, next';
      if (this.index === 3) return 'total, sizes, prev, pager, next, jumper';
      if (this.index === 4) return 'prev, pager, next, jumper';
      if (this.index === 5) return 'total, prev, pager, next, jumper';
      if (this.index === 6) return 'sizes, prev, pager, next, jumper';
      if (this.index === 7) return 'total, sizes, prev, pager, next, jumper';
      return 'prev, pager, next';
    },
    paginationItems() {
      const layouts = [
        'total, prev, pager, next',
        'sizes, prev, pager, next',
        'total, sizes, prev, pager, next',
        'prev, pager, next, jumper',
        'total, prev, pager, next, jumper',
        'sizes, prev, pager, next, jumper',
        'total, sizes, prev, pager, next, jumper',
      ];
      if (this.index <= 7) return [{ layout: this.paginationLayout, background: false, small: false }];
      if (this.index === 8) return layouts.map((layout) => ({ layout, background: false, small: false }));
      if (this.index === 9) return layouts.map((layout) => ({ layout, background: true, small: false }));
      return layouts.flatMap((layout) => [
        { layout, background: false, small: true },
        { layout, background: true, small: true },
      ]);
    },
    cascaderOptionsForScene() {
      const childRows = Array.from({ length: 12 }, (_, offset) => ({
        value: `child-${offset + 1}`,
        label: `第${this.chineseNumber(offset + 1)}行`,
        disabled: [2, 3, 4].includes(this.index) && [8, 11].includes(offset + 1),
      }));
      return Array.from({ length: 10 }, (_, offset) => {
        const row = offset + 1;
        const hasChildren = this.index === 1 ? row === 10 : row % 2 === 0;
        return {
          value: `row-${row}`,
          label: `第${this.chineseNumber(row)}行`,
          disabled: [2, 3, 4].includes(this.index) && row === 8,
          children: hasChildren ? childRows.map((item) => ({ ...item })) : undefined,
        };
      });
    },
    datePickerType() {
      const types = ['date', 'date', 'week', 'year', 'month', 'dates', 'daterange', 'daterange', 'monthrange', 'monthrange', 'datetime', 'datetime', 'datetimerange', 'datetimerange'];
      return types[this.index - 1];
    },
    isShortcutDate() {
      return [2, 8, 10, 12, 14].includes(this.index);
    },
    sceneOptions() {
      if (this.index === 9 && this.remoteState !== 'ready') return [];
      if (this.index === 4) return [{ label: '已选择', value: 'selected' }];
      return this.visibleSelectOptions;
    },
    remoteEmptyText() {
      return this.remoteState === 'error' ? '加载失败，请重试' : '无匹配数据';
    },
    timeModel: {
      get() {
        return this.index === 3 ? this.dateRange : this.dateValue;
      },
      set(value) {
        if (Array.isArray(value)) this.dateRange = value;
        else this.dateValue = value;
      },
    },
    dateModel: {
      get() {
        if (['daterange', 'monthrange', 'datetimerange'].includes(this.datePickerType)) return this.dateRange;
        if (this.datePickerType === 'dates') return this.multipleDates;
        return this.dateValue;
      },
      set(value) {
        if (Array.isArray(value)) this.dateRange = value;
        else this.dateValue = value;
      },
    },
    datePlaceholder() {
      return this.datePickerType === 'datetime' ? '选择日期时间' : '选择日期';
    },
  },
  mounted() {
    if (!this.evidenceMode) return;
    if (['dialog', 'dialog-usage'].includes(this.componentId)) this.openDialogScene();
    if (this.componentId === 'frequent-components-32' && this.index === 16) this.dialogVisible = true;
    // 多选证据预先选择一个末级节点，让真实 Cascader 呈现父级半选状态。
    if (this.componentId === 'cascader' && this.index === 3 && ['Indeterminate', 'Disabled'].includes(this.evidenceState)) {
      this.cascaderValue = [['row-4', 'child-4'], ['row-4', 'child-5']];
    }
    // 蓝湖画板直接展示弹层，证据路由也自动还原为相同的初始可见状态。
    this.$nextTick(this.openEvidenceOverlay);
  },
  methods: {
    openDialogScene() {
      this.dialogVisible = true;
      this.secondaryDialogVisible = this.componentId === 'dialog-usage' && this.index === 3;
    },
    closeDialogScene() {
      this.dialogVisible = false;
      this.secondaryDialogVisible = false;
    },
    openEvidenceOverlay() {
      if (this.componentId === 'select' && ([3, 4].includes(this.index) || (this.index === 9 && this.evidenceState === 'Default'))) return;
      if (this.componentId === 'color-picker' && this.index === 4) return;
      if (this.componentId === 'menu' && this.index === 2) {
        this.$refs.evidenceMenu?.open?.('2');
        // 子菜单必须等待父级弹层挂载后再展开，避免证据截图停留在单行过渡态。
        window.setTimeout(() => this.$refs.evidenceMenu?.open?.('2-3'), 160);
        return;
      }
      const rawControl = this.$refs.evidenceControl;
      const control = Array.isArray(rawControl) ? rawControl[0] : rawControl;
      if (!control) return;
      if (this.componentId === 'input' && this.index === 9) {
        const openSuggestions = () => {
          control.focus?.();
          const input = control.$el?.querySelector?.('input');
          input?.dispatchEvent(new Event('input', { bubbles: true }));
        };
        openSuggestions();
        window.setTimeout(openSuggestions, 120);
      }
      else if (this.componentId === 'select') {
        control.toggleMenu?.();
        window.setTimeout(() => this.$refs.secondaryEvidenceControl?.toggleMenu?.(), 80);
      }
      else if (this.componentId === 'cascader') {
        control.toggleDropDownVisible?.(true);
        // 证据模式固定从第一行开始展示，避免组件自动滚动到已选末级节点。
        window.setTimeout(() => {
          document.querySelectorAll('.el-cascader-menu__wrap').forEach((node) => { node.scrollTop = 0; });
        }, 120);
      }
      else if (this.componentId === 'color-picker') {
        control.handleTrigger?.();
        window.setTimeout(() => { if (!control.showPicker) control.handleTrigger?.(); }, 120);
      }
      else control.showPicker?.();
    },
    checkboxSizeLabel(size) {
      return { medium: '大', small: '默认', mini: '小' }[size];
    },
    radioSizeLabel(size) {
      return this.checkboxSizeLabel(size);
    },
    progressFormat(percentage) {
      return `完成 ${percentage}%`;
    },
    querySuggestions(query, callback) {
      const values = ['选项 1', '选项 2', '选项 3', '选项 4', '选项 5']
        .filter((value) => value.includes(query))
        .map((value) => ({ value }));
      callback(values);
    },
    isOptionSelected(value) {
      return Array.isArray(this.selectModel) ? this.selectModel.includes(value) : this.selectModel === value;
    },
    initialCascaderValue() {
      if (this.scenario.componentId !== 'cascader') return [];
      if (this.scenario.ordinal === 1) return ['row-10', 'child-1'];
      if (this.scenario.ordinal === 2) return ['row-10', 'child-6'];
      if (this.scenario.ordinal === 3) return [['row-4', 'child-4'], ['row-4', 'child-5']];
      return ['row-6', 'child-6'];
    },
    chineseNumber(value) {
      const labels = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
      return labels[value - 1];
    },
    buttonLabel(type) {
      return {
        '': this.index === 2 ? '朴素' : this.index === 6 ? '按钮' : '默认',
        primary: '主要',
        success: '正确',
        info: '信息',
        warning: '警告',
        danger: '危险',
      }[type];
    },
  },
};
</script>
