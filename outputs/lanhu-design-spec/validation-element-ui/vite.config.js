// AI-code-start lines:8 tool:Codex
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';

// Vue 2.7 使用官方插件编译单文件组件，并输出相对资源路径。
export default defineConfig({
  base: './',
  plugins: [vue()],
});
