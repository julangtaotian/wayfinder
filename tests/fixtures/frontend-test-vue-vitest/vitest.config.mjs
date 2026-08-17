import { fileURLToPath } from 'node:url';

// fixture 只验证项目原生测试发现；运行缓存统一写入 outputs，避免污染 fixture。
export default {
  cacheDir: fileURLToPath(new URL('../../../outputs/frontend-test-runtime/vite-cache/', import.meta.url)),
  test: {
    environment: 'node',
    globals: true,
  },
};
