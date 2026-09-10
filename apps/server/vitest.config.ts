import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20_000,
    fileParallelism: false, // 多个测试文件共用 :memory:/临时 sqlite 文件时避免相互干扰
  },
});
