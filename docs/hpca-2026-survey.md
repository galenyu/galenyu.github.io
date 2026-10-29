---
layout: page
title: HPCA 2026 调研维护说明
lang: zh-CN
nav_section: research
permalink: /docs/hpca-2026-survey/
sitemap: false
---

本次调研覆盖 [HPCA 2026 官方技术议程](https://2026.hpca-conf.org/program/program-hpca-2026/) 的 Main Conference 与 Industry Track。第 32 届会议于 **2026 年 1 月 31 日至 2 月 4 日**在澳大利亚悉尼举行；论文场次位于 **2 月 2—4 日**。

### 快照与覆盖范围

官方 HTML 于 **2026-10-29 18:12:09（北京时间）**采集，保存在仓库 `assets/data/hpca-2026-source.html`，不发布原始快照。SHA256：

`158c9022856dad097edca895d68bf89991637e1915f10c8a87ef3772b35b27d2`

| 项目 | 数量 |
| --- | ---: |
| 议程论文 | 122 |
| Main Conference | 119 |
| Industry Track | 3 |
| 论文 Session | 31 |
| 主会 Session | 30 |
| Industry Session | 1 |
| 排除的 Main Conference 标签非论文活动 | 1 |
| 代表论文中文解读 | 17 |
| 公开原文重点章节解读 | 3 |
| 官方摘要解读 | 14 |

索引以完整议程中的论文展示条目为基础。官方将 **HPCA Business Meeting** 也标为 Main Conference；该条目没有研究论文作者，明确记录在 `excluded_slots`，没有计为第 120 篇主会论文。Best of CAL 是既有期刊论文的精选展示，未计入当届主会/工业界论文；workshop、tutorial、keynote、餐饮、注册和同地其他会议均不纳入。

[结构化论文索引]({{ '/assets/data/hpca-2026-program.json' | relative_url }}) 保留官方标题、作者与单位、场次、track、日期、时间、地点与 Researchr 事件 ID。官方个别标题包含 LaTeX 数学标记、大小写或拼写差异，索引只规范化空白，不擅自重写。作者与单位作为完整原文字符串保留，不按单位中的逗号拆分作者。仅当官方议程明确提供 Pre-print/PDF 链接时才填入 `paper_url`；未知摘要与论文地址保持为空。

### 分类方法

下表将**官方场次**互斥归组，便于浏览；不是阅读每篇论文后建立的主题标签。每篇只进入一个浏览方向，所以计数合计 122。最佳论文候选单列，其中也包含 PIM、LLM 和可靠性研究。LLM、GPU、量子等主题也可能散落在其他场次，不能将某组的数字解释为全会议某主题的真实总量或占比。

| 浏览方向 | 议程论文数 |
| --- | ---: |
| 最佳论文候选 | 4 |
| LLM 推理与服务 | 12 |
| 近数据与存内计算 | 8 |
| 存储系统与一致性 | 8 |
| 内存可靠性 | 4 |
| 安全与侧信道 | 8 |
| 密码计算加速 | 8 |
| 量子架构与编译 | 8 |
| CPU、缓存与预取 | 8 |
| 晶圆级与分布式训练 | 8 |
| 视觉、图形与多模态 | 8 |
| GPU 内核与资源管理 | 8 |
| 专用加速器与设计方法 | 12 |
| 图计算与生物信息 | 7 |
| 系统资源与可重构计算 | 8 |
| 工业界实践 | 3 |

数量表示本次官方议程覆盖面，不表示质量、领域饱和程度、接受概率或跨年增长。场次映射保存在同步脚本的 `SESSION_GROUPS`；官网新增或缺失场次时，脚本停止并要求检查，而非默默归入“其他”。

### 阅读材料与综合判断

[代表论文笔记]({{ '/assets/data/hpca-2026-notes.json' | relative_url }}) 通过完全相同的官方标题连接到索引，并绑定原始快照 SHA256 和 122 篇总数。17 篇按公开材料与研究问题选择，不是排名或随机样本。

14 篇依据官方 Researchr 论文详情页的 Abstract；3 篇进一步核对以下公开原文的指定章节：

- [Focus，arXiv v1](https://arxiv.org/html/2512.14661v1)：§VII-A～C 的实验方法、精度表及 §VIII-B 最坏情形。周期仿真与综合结果不写成流片实测。
- [C³，作者公开 PDF](https://anatolelefort.net/papers/c3-hpca26.pdf)：§I 设计规则、§V 实现与仿真假设、§VI-A 正确性测试。记录 gem5 SE、Garnet 网络与缓存配置的适用边界。
- [TraceRTL，作者公开 PDF](https://tutorial.xiangshan.cc/hpca26/slides/tracertl_hpca2026.pdf)：§V 工作流、§VI-A 实验设置、§VII-A 轨迹转换与 §VII-C 性能敏感性。区分原始轨迹精度、跨 ISA 指令膨胀及缺失 opcode 的重映射误差。

“公开原文解读”只表示核对这些章节，不能解释为通读每页；摘要解读没有审计完整实验设置。卡片中把作者报告的性能数字与阅读者归纳分开；本次未独立复现。预印本与会议定稿可能存在版本差异。

6 条趋势、3 条共同认识与 4 条研究建议是基于所列代表稿的综合判断，不冒充全会议共识。每条都列出具体依据论文；研究建议包含问题与可验证实验，不承诺新颖性。

### 更新与离线重建

脚本只依赖 Python 3 标准库。重新获取官方议程并校验后写入：

~~~bash
python3 scripts/sync_hpca2026.py
~~~

从仓库已有 HTML 离线重建，保留相同快照的原采集时间：

~~~bash
python3 scripts/sync_hpca2026.py --input-html assets/data/hpca-2026-source.html
~~~

首次导入新 HTML 需注明真实采集时间，例如本次快照：

~~~bash
python3 scripts/sync_hpca2026.py --input-html assets/data/hpca-2026-source.html --fetched-at 2026-10-29T10:12:09Z
~~~

脚本检查稳定 ID、标题唯一性、完整作者、官方场次映射和当前 119+3 论文规模。官网发生变化时先复核差异并更新范围，再替换已发布数据。新快照不会自动继承旧版代表阅读；应同时核对笔记标题、原文版本、阅读依据及其绑定 SHA256。

[返回 HPCA 2026 调研]({{ '/hpca-2026/' | relative_url }}) · [官方技术议程](https://2026.hpca-conf.org/program/program-hpca-2026/)
