// AI-code-start lines:8 tool:Codex
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 使用相对资源路径，保证构建产物可独立预览。
export default defineConfig({
  base: './',
  plugins: [vue()],
});
