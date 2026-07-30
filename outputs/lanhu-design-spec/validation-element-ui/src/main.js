// AI-code-start lines:23 tool:Codex
import Vue from 'vue';
import ElementUI from 'element-ui';
import 'element-ui/lib/theme-chalk/index.css';
import './theme.css';
import App from './App.vue';

Vue.use(ElementUI);
new Vue({
  render: (createElement) => createElement(App),
}).$mount('#app');

// 暴露真实运行时版本，验收时同时确认 Vue 2 与 Element UI 已加载。
document.documentElement.dataset.validationFramework = `Vue ${Vue.version}`;
document.documentElement.dataset.validationLibrary = `Element UI ${ElementUI.version}`;
document.documentElement.dataset.validationInput = 'markdown-and-local-assets';
window.__VALIDATION_META__ = Object.freeze({
  framework: 'Vue',
  frameworkVersion: Vue.version,
  library: 'Element UI',
  libraryVersion: ElementUI.version,
  inputPolicy: 'markdown-and-local-assets',
  nativeBaselineAccepted: false,
});
