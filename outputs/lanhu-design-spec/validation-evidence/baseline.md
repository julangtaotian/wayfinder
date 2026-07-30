# 蓝湖规范实施基线

记录时间：2026-07-24  
设计源：蓝湖项目「后台规范」Web `@1x`

## 基线结论

| 项目 | 基线值 | 统计规则 |
| --- | ---: | --- |
| Markdown 总数 | 29 | 1 个 README 索引 + 28 份详细规范 |
| 详细规范 | 28 | 3 份基础规范 + 25 份组件/表单/选择器规范 |
| 组件类规范 | 25 | `components/`、`forms/`、`pickers/` 下的全部 Markdown |
| 蓝湖画板 | 29 | 以 README 的画板覆盖表和参考画板文件为准 |
| 画板场景 | 159 | 只统计“画板场景”章节各表的数据行，不统计表头和分隔行 |

## 场景基线

| 文档 | 场景数 |
| --- | ---: |
| `components/badge.md` | 5 |
| `components/button.md` | 9 |
| `components/checkbox.md` | 4 |
| `components/collapse.md` | 3 |
| `components/color-picker.md` | 4 |
| `components/dialog-usage.md` | 7 |
| `components/dialog.md` | 6 |
| `components/frequent-components-32.md` | 18 |
| `components/input-number.md` | 4 |
| `components/input.md` | 10 |
| `components/menu.md` | 3 |
| `components/pagination.md` | 10 |
| `components/progress.md` | 5 |
| `components/radio.md` | 5 |
| `components/select.md` | 9 |
| `components/switch.md` | 3 |
| `components/transfer.md` | 8 |
| `components/upload.md` | 5 |
| `forms/form-default-cn.md` | 5 |
| `forms/form-default-en.md` | 5 |
| `forms/form-large-cn.md` | 5 |
| `forms/form-small-cn.md` | 5 |
| `pickers/cascader.md` | 4 |
| `pickers/date-time-picker.md` | 14 |
| `pickers/time-picker.md` | 3 |
| 合计 | 159 |

## 文件哈希基线

哈希算法：SHA-256。以下值记录规范化实施前的文件内容。

| 文档 | SHA-256 |
| --- | --- |
| `README.md` | `020c20627a754876bcc23f7ac0640a6c1c0f28f5881da8efe4236fa5cde38531` |
| `components/badge.md` | `ad28d48ac71582d8cd8128bf6d490401072dbc4cc2ffe7f817d152632bcae97a` |
| `components/button.md` | `69b9c0bbd314f4664d24247590836a6bf9a57f06ad6274a8a2c4efc7f8aa5483` |
| `components/checkbox.md` | `45ba1bbea6c4554811e2f6fccb6d558a184273d27a2d24a374b1f96f62e733d0` |
| `components/collapse.md` | `04c76e7804955750564563efb1962e5fe1b86bea809cc26d5c25db915b7fa316` |
| `components/color-picker.md` | `e82906a0e3304c958cf4f2b2858c815089447054ada868594e147d21f933c57d` |
| `components/dialog-usage.md` | `e6f80cf41d4445de333e5c7ff4ac90deb7053e0c7595fb9848acb93213b50fbf` |
| `components/dialog.md` | `4fec9660fd0c158c9652b27624ba7811bfb5ef1941bbc348317e3d964aca7e79` |
| `components/frequent-components-32.md` | `55ec0206f9b26f7e2f5e21dfd9603302510346f8a2194c5830eb3b7d9ef4252b` |
| `components/input-number.md` | `f4c88e7228320c33586ad757885738d63857476da412b7e425fffe22966b6dee` |
| `components/input.md` | `ea5b7d226d8deb696d9c8de7eaaa5969cd347b395202be5c3c12da4b145c4062` |
| `components/menu.md` | `0931c464d7d1ff269a5f78a0080039d327c27f0d2505399dc69d8dca1af7b6c4` |
| `components/pagination.md` | `9dbf4954d94bdcdaf15d30fa70a17979286b401135fb5685805fc9b636b26256` |
| `components/progress.md` | `a9d8c18b4d293fecd6c8d4543ca3a59528d7f1cf2027d61a0d561a19197161d0` |
| `components/radio.md` | `af2ade632eed9a473e922f98bb277bdc199a1286ccd9d55225285b3a5fc92fca` |
| `components/select.md` | `7ae5e35a3d25253297572b87e144debfc3a81fc5ba6bf5eb0860c92a4d2a7ce5` |
| `components/switch.md` | `36c525193695587629c833ad4ad98c49a59be36df98ffe176e5ed82fb9d8ada4` |
| `components/transfer.md` | `061a97e611639bf8f741cf3f4193dbb713c042700ffaa603730aa7e80ed1c595` |
| `components/upload.md` | `0125487bf4a162bbd4bc9172cca58d6fd2ca12d59d2cc3980144517ed11a402e` |
| `forms/form-default-cn.md` | `3f141365c32a461f2f1cbea996f68d92634818dc87c03834d579eba0057098f6` |
| `forms/form-default-en.md` | `71fd479eceffea043a0468639aaa43c74815a152e177e1b95fb1aace4126c330` |
| `forms/form-large-cn.md` | `e11b486d1a10729a9b078720aa0356e695b317a2f4086678992e813c2c0093ed` |
| `forms/form-small-cn.md` | `df055c29f125edde51d86595faff8a98296e4ae27cb829ea5ae5b3c9807cc7b0` |
| `foundations/colors-assist.md` | `1654e1c7ee09cc38b2b0f90a801904c5c12e43a07c4cfa693b5d9e621221ceb4` |
| `foundations/colors-primary-functional.md` | `c843d5d56406614800ba047c1e5cf1ade3ea234eb25de53bf9222d83c96af25b` |
| `foundations/component-sizing.md` | `59c32c7083b9fead6b8034dbe92e59b856a20c69fe5f2c78e818a27d805a08ca` |
| `pickers/cascader.md` | `db557f448fb88187e362b7841a67985889f49c80c8d46ac37a9f0e07de447fe4` |
| `pickers/date-time-picker.md` | `833faaed1a7ce1efe01991ae48fbe0aabbca0ad243bd14fa9b3dc6551f028a08` |
| `pickers/time-picker.md` | `561cc45a02506cac6f2c39802f22a312b0834fd7eb86561b8037d6d53621c410` |

## 计数注意事项

`Dialog`、`高频组件集合` 和 `Pagination` 的“画板场景”章节中包含分组表头。扫描器必须按每个 Markdown 表格跳过第一行表头和第二行分隔线；仅按“首列是否等于场景”过滤会把 4 行表头误计为场景。
