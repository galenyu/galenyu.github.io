---
layout: page
title: MICRO 2026 调研维护说明
lang: zh-CN
nav_section: research
permalink: /docs/micro-2026-survey/
sitemap: false
---

本次调研依据 [MICRO 2026 官方 Main Program](https://www.microarch.org/micro59/program/)。第 59 届 MICRO 位于希腊雅典，会议日期为 2026 年 10 月 31 日至 11 月 4 日，技术论文报告为 11 月 2–4 日。截至本次快照（2026-10-29），会议尚未举行；页面总结已公布论文及公开版本，不是会后报道。

### 覆盖范围与快照

| 项目 | 数量 |
| --- | ---: |
| 有标题和作者的议程论文 | 220 |
| Research Track | 213 |
| 首届 Industry Track | 7 |
| 论文场次 | 34 |
| 主会 / 工业界场次 | 33 / 1 |
| 排除的开幕致辞 | 3 |
| 有来源的代表解读 | 18 |
| 其中原文重点章节解读 / 摘要解读 | 3 / 15 |

原始 HTML 保存在仓库 `assets/data/micro-2026-source.html`，不进入网站发布。快照 SHA256 为 `f941b51bc35eb786cf4e5d407c8da138189e45a95e00d86c7bab7385b1c39634`（以结构化索引的 `metadata.source_sha256` 为准）。[结构化索引]({{ '/assets/data/micro-2026-program.json' | relative_url }}) 记录逐篇标题、作者与单位原文、日期、场次、track 和对应官网锚点。

官网共有 223 个 `.paper` 节点。开幕 Session 0A 的三条 Welcome Message 逐项记录在 `excluded_slots` 中并排除。Keynote、PhD Jobs、SRC、Panel 和社交活动不进入论文索引。Industry Session 为 1C，含七篇论文。统计来自实际节点核对，不直接采用搜索摘要或媒体所报总数。

官网没有逐篇摘要和论文 URL，因此索引的 `abstract` 与 `paper_url` 保持 `null`。`source_url` 是已核对的官方场次，不冒充论文下载地址；逐篇公开阅读来源记录在独立笔记中。

### 方向分类

分类按官方场次互斥归组，每篇论文计入一个浏览方向；并非逐篇阅读后的主题判定。官方场次可能含跨主题工作，Distinguished Papers 两场单列，不能把某组数量解释为全会议该主题的完整数量，也不能据此判断研究质量或创新饱和度。

| 浏览方向 | 官方场次 |
| --- | --- |
| GPU 微架构与数值计算 | 1A、7A |
| PIM / 3D 堆叠与 LLM | 1B、4C、8A |
| 工业界实践 | 1C |
| 低比特与稀疏推理 | 1D、6C |
| ML 系统互连与异构调度 | 2A |
| 内存、缓存与地址翻译 | 2B、7D、8B |
| 杰出论文场次 | 2C、3C |
| 机器人、视觉与专用加速 | 2D、7C、8C |
| CPU 微架构与编译 | 3A、6A |
| 仿真、性能与功耗建模 | 3B、7B |
| 量子与新兴计算 | 3D、8D |
| 近数据计算与存内检索 | 4A、9B |
| 安全、共享内存与密码计算 | 4B、9D |
| 空间架构、FPGA 与 CGRA | 5A、9A |
| 可靠性与能量受限系统 | 5B、6B |
| CXL 分层内存与存储 | 5C、6D |
| 并行架构与数据中心 | 9C |

### 阅读材料与边界

[中文笔记]({{ '/assets/data/micro-2026-notes.json' | relative_url }}) 通过完全相同的官方标题连接索引，绑定本次官方源的 SHA256 和 220 篇总数。arXiv 的标题可能有大小写或排版短横差异，笔记另存 `source_title`；官方标题保留原样。

三篇原文解读分别为：

- [Caerus 作者公开 PDF](https://samainsworth.github.io/Caerus-Prefetcher-Micro.pdf)：摘要、§I、§IV 和 §V 开头。重点核对 ChampSim 配置与基线，区分相对无预取和相对 Berti 的收益。
- [VOXEL arXiv v1](https://arxiv.org/html/2604.26821v1)：摘要、§I、§3.4–3.5 与 §4 概述。验证使用 IPU emulator，并回放加入 DRAM 时延；不是商业 3D DRAM AI 芯片实测。未采用后续 v2 的未读内容。
- [PEEK arXiv v1](https://arxiv.org/html/2610.03045v1)：摘要、§III–IV、§VII.1–3、VII.6 与 VII.9。区分主要 FPGA / RTL 结果与缩小的 TinyPEEK 流片配置。

其余 15 篇为指定版本的公开摘要解读，逐篇给出摘要来源、问题、方法、研究启发和阅读边界，不补写摘要没有支持的实验细节。作者报告的指标不是独立复现；“局限”中的未核对事项用于说明本次阅读证据范围，并非冒充作者自述缺陷。六个趋势、三条共同认识与四个选题建议仅归纳所列代表稿，不是全会议共识，也未作跨年趋势或新颖性判断。

### 更新与重建

同步脚本仅依赖 Python 标准库，并复用 `scripts/sync_isca2026.py` 的 HTML 节点解析和原子写入辅助函数。

~~~bash
python3 scripts/sync_micro2026.py
python3 scripts/sync_micro2026.py --input-html assets/data/micro-2026-source.html
~~~

首次导入新的离线快照时，必须传入真实采集时刻；同一 SHA256 的离线重建继承原时间：

~~~bash
python3 scripts/sync_micro2026.py --input-html assets/data/micro-2026-source.html --fetched-at 2026-10-29T10:11:39Z
~~~

脚本会检查标题和作者非空、论文与场次 ID 唯一、每个 `.paper` 节点被索引或明确排除、工业界归类与官方标题一致。新增论文场次必须先更新显式方向映射；官网新增论文链接时脚本停止，要求人工确认链接语义。全部验证成功后才写入索引。

更新索引后需重新核对代表稿身份、来源版本和笔记的快照绑定；不得将旧版阅读自动当作新版已读证据。

[返回 MICRO 2026 调研]({{ '/micro-2026/' | relative_url }}) · [官方会议主页](https://www.microarch.org/micro59/)
