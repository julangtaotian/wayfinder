# 验证记录

## 当前环境

- 日期：2026-09-03
- 系统：Darwin 25.4.0 arm64
- Node.js：22.12.0
- npm：10.9.0
- Python：3.10.11
- PyYAML：6.0.2

## 官方 Creator validators 预检

- 首次在受限网络环境执行时，命令以 `official_validator_dependency_unavailable` 和非零状态失败，真实保留 pip 网络错误；没有把未启动记录为通过。
- 获得依赖下载权限后，冷缓存执行成功，`cacheStatus` 为 `created`；锁定 wheel 为 `PyYAML-6.0.2-cp310-cp310-macosx_11_0_arm64.whl`，SHA-256 为 `29717114e51c84ddfba879543fb232a6ed60086602313ca38cce623c1d62cfbf`。
- 随后在不追加网络权限的环境中再次执行成功，`cacheStatus` 为 `reused`，证明暖缓存没有重复下载。
- Skill Creator validator：`codex-home/skills/.system/skill-creator/scripts/quick_validate.py`，SHA-256 为 `1fd66498c219616fd9249eacdf16c458412ea9065a9d887fd716aeef03907762`。
- Plugin Creator validator：`codex-home/skills/.system/plugin-creator/scripts/validate_plugin.py`，SHA-256 为 `6ff4bc1cc8ca94827c30c8299951efdac900ff38a5069c03e9a6554fc194a723`。
- 10 个自定义 Skill 各执行一次并退出 0；插件根执行一次并退出 0。
- 单次 `outputs/official-validator-runtime/` 在成功和失败出口均已清理；`outputs/official-validator-cache/` 保留供后续复用，其他输出未删除。
- 机器证据：`evidence/V-02.json`。结论仅为“当前本地 Creator validators 预检通过”，不代表其他平台、最新上游规则、行为质量或公共目录最终审核。

## 自动回归与仓库门禁

- V-01：缓存首次准备、暖缓存复用、全部目标稳定排序、Plugin 单次执行和独立缓存清理通过。
- V-04：validator/Python 不可用、依赖不可用、启动失败和内容失败四类稳定 code，以及 Windows/POSIX 路径、真实退出码、stdout/stderr 和临时运行时清理通过。
- V-03：现有 `scripts/verify.mjs` 完成 7 个阶段；共发现 218 项测试，210 项通过、8 项按既有条件跳过、0 项失败；插件结构通过；34 项活动/主规格严格校验与 53 项归档变更校验通过；OpenSpec 1.9.0 与 76 个运行时包完整性通过。
- `.github/workflows/validate.yml`、`scripts/verify.mjs` 和插件 manifest 没有因本变更修改；根级预检脚本、启动器和依赖锁位于插件目录之外。

## 未覆盖边界

- 未新增或执行五平台真实 Creator validator 矩阵；既有 CI 只会执行受控替身回归。
- PyYAML 锁覆盖 CPython 3.10–3.13 的 macOS x64/ARM64、Linux x64/ARM64（glibc 与 musl）及 Windows x64 wheel；其他 Python 或架构失败关闭。
- 冷缓存离线环境无法准备依赖，这是明确失败边界，不回退用户 Python 包。
