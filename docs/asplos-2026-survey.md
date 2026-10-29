---
layout: page
title: ASPLOS 2026 调研维护说明
lang: zh-CN
nav_section: research
permalink: /docs/asplos-2026-survey/
sitemap: false
---

本次调研覆盖第 **31 届 ASPLOS**（2026 年 3 月 22–26 日，美国匹兹堡）[官方详细技术议程](https://www.asplos-conference.org/asplos2026/program/index.html)。论文场次位于 3 月 24–26 日；keynote、WACI、workshop、tutorial、接待和重复展示论文的 poster 活动不计入论文目录。

### 来源快照与计数

官网 HTML 采集于 **2026-10-29T10:11:48Z**（UTC），SHA256 为 `58470e84dffaaad19c0c93f7b7270735f720815f4da0d047d74609031a96b037`。

| 项目 | 数量 |
| --- | ---: |
| 详细议程中标题唯一、作者非空的论文 | 168 |
| 主会论文场次 | 36 |
| 独立列出的 Industry Track | 0 |
| 官网概览自述 unique papers | 167 |

**官网自身存在计数差异。** 同页概览写“167 unique papers”，详细议程包含 168 个 `.paper` 节点，且 168 个规范化标题均不重复。第 1–6 组共 24 个场次，每场 5 篇（120 篇）；第 7–9 组共 12 个场次，每场 4 篇（48 篇）。本索引保留全部 168 个可逐条核对的论文条目，不凭猜测删掉其中一篇，也不将该数冒称为出版社论文集总数。

[结构化索引]({{ '/assets/data/asplos-2026-program.json' | relative_url }}) 保存论文标题、作者与单位原字符串、场次、官方锚点和会议当地时间。没有猜测作者分隔符，也不修改官网可能存在的标题拼写。`time` 为场次时间，不是逐篇发言时间。官网未提供逐篇摘要、DOI 或原文链接，`abstract` 和 `paper_url` 保持 `null`；代表论文的阅读来源另列于笔记文件。原始 HTML 保存在 `assets/data/asplos-2026-source.html`，用于离线复核，不进入网站构建。

### 分类口径

方向按**官方 Session 互斥归组**，服务检索；不是逐篇阅读后的主题统计。一个 Session 中也可能含有其他方向的论文，例如 Speculative Decoding 包含 Protocol Buffers 解码，不能将该分组计数直接称为全部 LLM 论文数。

| 浏览方向 | 官方场次 | 论文数 |
| --- | --- | ---: |
| LLM 推理与服务 | 1A、1B、2B、3A、3B | 25 |
| 模型训练与监测 | 2A、4A | 10 |
| 张量编译与代码生成 | 4B、7B | 9 |
| GPU 系统与编程 | 2C、8A | 9 |
| CXL、分离式内存与存储 | 1D、5D、6D、8C | 19 |
| 存内计算 | 4D | 5 |
| 安全、可信执行与密码计算 | 2D、3D、7A | 14 |
| 量子与新兴计算 | 1C、4C、9B | 14 |
| 生成模型、视觉与端侧 AI | 3C、5A、5B | 15 |
| 神经网络与可重构加速器 | 6A、8D | 9 |
| 形式验证、测试与硬件语言 | 5C、6B、7C | 14 |
| 图与稀疏计算 | 6C | 5 |
| 处理器微架构 | 7D | 4 |
| 云、网络与无服务器系统 | 8B、9D | 8 |
| 系统分析与优化 | 9A | 4 |
| 可靠性与容错 | 9C | 4 |

计数表示本次议程的组织与覆盖范围，不表示研究质量、跨年增长、创新难度或领域饱和度。

### 代表论文与证据边界

本次整理 **19 篇**代表论文，包含 **6 篇公开原文重点章节解读**与 **13 篇公开摘要解读**。选择覆盖推理、训练、GPU 编译、存储、验证、安全、量子、硬件语言、可靠性与云成本，以公开可读性和研究问题为依据，不是排名或随机样本。笔记使用官方详细议程的精确标题连接，逐篇标注来源、版本和实际核对的章节。

公开原文解读并不表示通读每一页或独立复现。作者预印本、作者公开稿、机构摘要与会议版本可能在题名、作者和实验上存在差异。例如 BlendServe 与 SwiftSpec 的预印本题名和官网议程不同，已经在 `reading_basis` 中说明。官网议程决定会议身份，选定阅读来源决定技术解释的证据范围。

需要特别保留的阅读结论：

- **SNIP** 的 §6.1 使用 fake quantization，并以 FP4 FLOPs 占比作效率指标，未给出原生 FP4 硬件的端到端计时；不能将计算预算表述为已实测加速。
- **PACT** 的会议稿采用降频远端 NUMA 仿真 CXL；仓库后续实现另有改动，不能混用结果。
- **Insum** 所读预印本在 RTX3090 与带补丁的 PyTorch 上测四类稀疏内核；表达式行数不能等同整个编译器代码量。
- **Radshield** 的部署章节说明相关任务尚未在轨检出辐射错误；部署事实和实测错误覆盖率需要区分。

六个主题、三条共同认识与四个选题建议均为调研者基于所列论文的综合判断，不代表全会议作者共识，也不保证建议的新颖性。建议包含待检验问题与可操作实验，不把摘要未覆盖的内容冒充作者承认的缺陷。

### 重建与更新

脚本只依赖 Python 标准库，复用 `scripts/sync_isca2026.py` 中的 HTML 树解析器。所有计数、标题、作者、场次锚点、唯一性和已知分类检查通过后才替换 JSON。

更新公开官网快照：

~~~bash
python3 scripts/sync_asplos2026.py
~~~

用已保存快照离线重建（保留真实采集时间）：

~~~bash
python3 scripts/sync_asplos2026.py --input-html assets/data/asplos-2026-source.html
~~~

导入新的离线快照时，必须提供真实采集时间：

~~~bash
python3 scripts/sync_asplos2026.py --input-html /path/to/official-program.html --fetched-at 2026-10-29T10:11:48Z
~~~

同步脚本不会自动继承人工阅读笔记为新版本证据。`asplos-2026-notes.json` 中的 `program_source_sha256` 和 `program_count` 必须与索引匹配；更新快照后应人工重新核对身份、来源和实际阅读依据。

[返回 ASPLOS 2026 调研]({{ '/asplos-2026/' | relative_url }}) · [官方技术议程](https://www.asplos-conference.org/asplos2026/program/index.html)
