// 共享 CLI 解析器先完整校验参数，再允许入口调用任何项目读取或写入逻辑。
export function parseCliArgs(argv, {
  defaults = {},
  valueOptions = {},
  booleanOptions = {},
} = {}) {
  const args = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (Object.prototype.hasOwnProperty.call(valueOptions, option)) {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
        throw new Error(`参数 ${option} 缺少值`);
      }
      args[valueOptions[option]] = value;
      index += 1;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(booleanOptions, option)) {
      args[booleanOptions[option]] = true;
      continue;
    }

    throw new Error(`不支持的参数：${option}`);
  }

  return args;
}
