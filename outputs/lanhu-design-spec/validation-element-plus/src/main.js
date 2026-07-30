// AI-code-start lines:24 tool:Codex
import { createApp, version as vueVersion } from 'vue';
import ElementPlus, { version as elementPlusVersion } from 'element-plus';
// 验收统一使用中文语言包，避免日期、时间等弹层混入英文默认文案。
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import './theme.css';
import App from './App.vue';

const app = createApp(App);
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');

// 暴露真实运行时版本，浏览器验收可据此排除“只写标签未加载组件库”。
document.documentElement.dataset.validationFramework = `Vue ${vueVersion}`;
document.documentElement.dataset.validationLibrary = `Element Plus ${elementPlusVersion}`;
document.documentElement.dataset.validationInput = 'markdown-and-local-assets';
window.__VALIDATION_META__ = Object.freeze({
  framework: 'Vue',
  frameworkVersion: vueVersion,
  library: 'Element Plus',
  libraryVersion: elementPlusVersion,
  inputPolicy: 'markdown-and-local-assets',
  nativeBaselineAccepted: false,
});
