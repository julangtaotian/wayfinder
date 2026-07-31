<template>
  <ResponsiveViewportHarness v-if="harnessMode" />
  <ResponsiveFormLayout v-else-if="layoutMode" library-name="Element Plus" />
  <div
    v-else
    class="validation-shell"
    :class="{ 'evidence-mode': evidenceMode }"
    :data-evidence-state="evidenceState"
  >
    <aside class="validation-sidebar">
      <div class="brand-block">
        <span class="brand-mark">UI</span>
        <div>
          <strong>后台规范</strong>
          <small>Element Plus 验收</small>
        </div>
      </div>
      <el-scrollbar class="component-navigation">
        <el-button
          v-for="view in manifest.componentViews"
          :key="view.id"
          class="navigation-item"
          :class="{ active: view.id === activeViewId }"
          text
          @click="selectView(view.id)"
        >
          <span>{{ view.title }}</span>
          <el-tag size="small" effect="plain">{{ view.scenarioCount }}</el-tag>
        </el-button>
      </el-scrollbar>
    </aside>

    <main class="validation-main">
      <header class="page-heading">
        <div>
          <p>双组件库规范验收 / Vue 3</p>
          <h1>{{ activeView.title }}</h1>
          <span>{{ activeView.source }}</span>
        </div>
        <div class="runtime-evidence">
          <el-tag type="warning" effect="dark">Element Plus</el-tag>
          <el-tag effect="plain">26 个组件视图</el-tag>
          <el-tag effect="plain">183 条场景</el-tag>
        </div>
      </header>

      <section class="scene-grid" :data-component-view="activeView.id">
        <article
          v-for="scenario in activeScenarios"
          :key="scenario.id"
          class="scene-card"
          :class="{ 'is-active-evidence': scenario.id === activeSceneId }"
          :data-scenario-id="scenario.id"
          :data-component-id="scenario.componentId"
          :data-component-library="'element-plus'"
        >
          <div class="scene-heading">
            <div>
              <code>{{ scenario.id }}</code>
              <h2>{{ scenario.title }}</h2>
            </div>
            <el-tag size="small" type="info">{{ scenario.ordinal }}/{{ activeScenarios.length }}</el-tag>
          </div>
          <ScenarioDemo
            :scenario="scenario"
            :evidence-mode="evidenceMode && scenario.id === activeSceneId"
            :evidence-state="evidenceState"
          />
          <p class="scene-summary">{{ scenario.summary }}</p>
        </article>
      </section>
    </main>
  </div>
</template>

<script>
import manifest from './manifest.json';
import ScenarioDemo from './ScenarioDemo.vue';
import ResponsiveFormLayout from './ResponsiveFormLayout.vue';
import ResponsiveViewportHarness from './ResponsiveViewportHarness.vue';

export default {
  name: 'ValidationApp',
  components: { ScenarioDemo, ResponsiveFormLayout, ResponsiveViewportHarness },
  data() {
    const [hashViewId, hashSceneId] = window.location.hash.slice(1).split('/');
    const initialScenario = manifest.scenarios.find((item) => item.id === hashSceneId);
    const search = new URLSearchParams(window.location.search);
    return {
      harnessMode: search.get('harness') === '2560',
      layoutMode: search.get('layout') === 'responsive-form',
      manifest,
      activeViewId: initialScenario?.componentId || (manifest.componentViews.some((item) => item.id === hashViewId)
        ? hashViewId
        : manifest.componentViews[0].id),
      activeSceneId: initialScenario?.id || '',
      evidenceMode: search.get('evidence') === '1',
      evidenceState: search.get('state') || 'Default',
    };
  },
  computed: {
    activeView() {
      return this.manifest.componentViews.find((item) => item.id === this.activeViewId);
    },
    activeScenarios() {
      return this.manifest.scenarios.filter((item) => item.componentId === this.activeViewId);
    },
  },
  mounted() {
    // 组件与场景都写入 hash，刷新后仍可直接复现单个验收对象。
    window.addEventListener('hashchange', this.restoreHash);
    this.focusActiveScene();
  },
  beforeUnmount() {
    window.removeEventListener('hashchange', this.restoreHash);
  },
  methods: {
    selectView(id) {
      window.location.hash = id;
      this.activeViewId = id;
      this.activeSceneId = '';
    },
    restoreHash() {
      const [viewId, sceneId] = window.location.hash.slice(1).split('/');
      const scenario = this.manifest.scenarios.find((item) => item.id === sceneId);
      if (scenario) {
        this.activeViewId = scenario.componentId;
        this.activeSceneId = scenario.id;
      } else if (this.manifest.componentViews.some((item) => item.id === viewId)) {
        this.activeViewId = viewId;
        this.activeSceneId = '';
      }
      this.focusActiveScene();
    },
    focusActiveScene() {
      if (!this.activeSceneId) return;
      this.$nextTick(() => {
        const target = document.querySelector(`[data-scenario-id="${this.activeSceneId}"]`);
        target?.scrollIntoView({ block: this.evidenceMode ? 'start' : 'center' });
      });
    },
  },
};
</script>
