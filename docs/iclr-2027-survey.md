---
layout: page
title: ICLR 2027 调研维护说明
lang: zh-CN
permalink: /docs/iclr-2027-survey/
sitemap: false
---

调研范围是 **ICLR 2027 模型量化相关的官方公开 Active submissions**。页面仅使用 OpenReview 官方数据；摘要解读、官方原稿全文阅读、活跃投稿状态与录用状态分别记录。

### 本次官方快照

用户在能正常显示投稿列表的浏览器会话中，使用官网公开 API 客户端导出完整公开 notes。采集于 **2026-10-09 13:19（北京时间）**：

| 项目 | 本次结果 |
| --- | ---: |
| 公开活跃投稿，全会议 | 42,368 |
| 完整分页 | 43 |
| 标题、摘要和关键词自动初筛 | 1,133 |
| 官网摘要范围清理排除 | 139 |
| 保留待审候选 | 994 |
| 代表论文的官网摘要解读 | 12 |
| 已取得并阅读该版本官方 PDF | 6 |

已校验总数、唯一 ID、公开 readers、字段公开权限和 ICLR.cc/2027/Conference/Submission venue。完整导出 SHA256 为 **5f1a2de3f9e06fccad0078949f756c116915103d433f31f39333f3c1a1a7f023**。原始 90 MB JSON 和下载的 PDF ZIP 保留本地，由 Git 和 Jekyll 排除，网页只发布候选索引及中文解读。

[官方索引与解读 JSON]({{ '/assets/data/iclr-2027-quantization.json' | relative_url }}) 记录来源、UTC 时间、导出校验值和逐篇摘要。[范围排除记录]({{ '/assets/data/iclr-2027-official-exclusions.json' | relative_url }}) 记录 139 条排除理由。范围清理直接依据本次官网摘要；检查表示、tokenizer、codec 等工作，并保留权重 VQ、KV 压缩、二值网络、SNN 数值量化及含混项。剩余候选未逐篇确认为模型量化论文，仍可能误收或漏检。

此前的公开预印本和镜像研究文件作为历史资料保留在仓库，已从网站构建和主页面加载中排除。它们不会覆盖官方 ID、摘要或阅读计数。

### 获取与导入

Python 3 同步脚本仅使用标准库。正常匿名 API 可用时：

~~~bash
python3 scripts/sync_iclr2027.py
~~~

脚本从 Conference group 读取 active venue ID，然后顺序分页，核对稳定 count、唯一 ID 和活跃 venue。遇访问验证、数量变化或不完整分页时返回非零，保留上次成功的官方记录与人工笔记，本次数量标为未知。历史快照不代表当前状态；取得有效的完整零条结果时才显示零。

若日常浏览器能看到官网投稿列表，打开 [官方导出助手]({{ '/tools/openreview-export/' | relative_url }})，复制脚本，在**同一个 OpenReview 官方页面**的 Console 执行。脚本复用官网 Webfield2.api.get 或正常浏览器会话的 GET 请求，不读取或导出密码、Cookie、令牌、私有评论或作者身份。只导出公开研究字段和 ID、编号、时间；逐页及最后一次检查总数，遇验证或分页异常则停止。

完整 JSON 放到项目根目录后：

~~~bash
python3 scripts/sync_iclr2027.py --input-json iclr-2027-official-active-submissions.json --scope-exclusions assets/data/iclr-2027-official-exclusions.json
~~~

排除清单必须对应**完全相同的原始导出 SHA256**，且所有 ID 是该快照的初筛候选，数量一致。新快照需重新审核范围、制作对应的清单；不能把旧快照的排除结果直接套到新导出。省略 --scope-exclusions 时只执行自动初筛。

导入保留原始 fetched_at，另记 checked_at；不能把本地导入时间当成官网采集时间。局部搜索结果不能作为完整列表导入。

### 阅读与总结

代表样本涵盖 Softmax Reparameterization、Chameleon、HeadGuard、QuantMLA、AYOT、JustQuant、LoopQuant、2PTC、SQuAT、SCOPE、HybridQuant、ULMoE、RTAQ、OrbitQuant、Prefix-Point、MetricKV、CanonQ 和 HEPH。前六篇已取得并核对该版官方原稿，附正文、表格和相关附录页码证据；其余十二篇仅根据官方摘要解读。每篇注明量化对象、位宽、方法、作者报告的结果和未核实的问题。

| 阅读状态 | 必要依据 | 计数 |
| --- | --- | --- |
| candidate | 标题、摘要、关键词初筛 | 待审候选 |
| abstract | review_basis 为 official_abstract，有效中文摘要解读 | 官网摘要解读 |
| reviewed | 对应版本官方 PDF 已取得、校验并阅读全文 | 官方投稿全文已读 |

不能把预印本全文阅读自动提升为官方原稿阅读，也不能把摘要中的作者结果当作独立复现。全文状态还要求 review_basis 为 official_pdf、official_pdf_verified 为 true、64 位十六进制 pdf_sha256、reviewed_pdf_url 与快照 PDF 一致，以及 reviewed_source_updated_at 与记录版本一致。修改标题、摘要、PDF 或更新时间会恢复 candidate，保留旧笔记以供复核。不再属于 active venue 的投稿不进入新快照。

可用导出助手第二部分在正常官网浏览器下载六篇官方原稿，生成 iclr-2027-six-official-papers.zip。脚本核对官方 ID、标题、编号、公开权限、active venue 与固定 PDF 路径，验证 HTTP 200 和 PDF 文件头，附 SHA256 与 manifest；任一篇失败时不保存残缺 ZIP。真正阅读后再更新上述状态，不能因下载成功就标为已读。

论文记录的人工字段：

- summary、contribution、limitations：中文问题、方法、作者结果及明确局限。
- quantization_target、bit_width、categories：量化对象、摘要明确给出的精度和方向；未知位宽直接注明。
- evidence：原文位置与对应事实；摘要解读的位置为“官方摘要”。
- review_status、review_basis：区分摘要与全文。
- 全文的文件校验值、对应版本和 reading_basis：实际官方原稿的阅读依据。

方向标签是检索和阅读框架，一篇可多标签。代表论文观察比较已解读样本，附对应官方 ID；不能推断全会议的趋势、比例或录用情况。

### 候选全景总结与研究建议

新增章节以本次 **994 条官方候选** 为分母，包含方向总表、6 条关键趋势、3 条共同认识和 5 项研究建议。代表作均链接到官方记录对应的论文卡片；建议给出可证伪的问题、对照实验、指标、资源条件与局限。

| 方向 | 候选标签数 | 占 994 条候选 |
| --- | ---: | ---: |
| 训练后量化 | 569 | 57.24% |
| 硬件与系统 | 465 | 46.78% |
| 低精度训练 | 239 | 24.04% |
| 理论与分析 | 154 | 15.49% |
| KV Cache | 143 | 14.39% |
| 扩散模型 | 110 | 11.07% |
| 推理能力 | 106 | 10.66% |
| 多模态 | 96 | 9.66% |
| 量化感知训练 | 86 | 8.65% |

643 条具有多个标签，922 条至少有一个标签，另有 72 条未命中这些方向；总标签次数为 1,968。各方向数量和占比不能相加。标签来自自动初筛及少量人工修订，PTQ 的宽线索包括校准、旋转、重建，低精度训练线索还包括 FP4/FP8、梯度和优化器。方向统计并非确认采用该方法的论文计数。

表头保留“战线饱和度”，具体定义为**候选密度代理**：高 ≥200 条、中 100–199 条、相对低 <100 条。阈值用于便于浏览，无法据此判断创新空间已经饱和、研究质量、竞争难度或录用概率。不同标签宽度也会影响数量。

另对全部标题、官方摘要和关键词检索 15 类明确词项，每个词项按官方 ID 去重。词项计数仅表示“提及”，可能是背景、基线或否定句；不表示本文采用、实现或证明了对应方法。趋势归纳结合相关句扫描、重点核对的官方代表摘要和已有六篇官方原稿笔记，属于本快照的研究主题总结；没有跨年增长对照或全体作者意见调查。“共同认识”和选题建议是本调研的综合判断，不能当作整个领域的一致共识。用于跨论文归纳的摘要核对不改变逐篇中文摘要解读与全文已读的计数。

统计数据由以下命令从主索引重建，**不改动主索引或人工阅读状态**：

~~~bash
python3 scripts/build_iclr2027_landscape.py
python3 -m unittest discover -s scripts -p 'test_build_iclr2027_landscape.py' -v
~~~

[总体统计 JSON]({{ '/assets/data/iclr-2027-landscape.json' | relative_url }}) 保存方向、词项、交叉分类的命中 ID 和规则，以及原始官方导出 SHA256、主索引精确字节 SHA256、快照时间。[总体归纳 JSON]({{ '/assets/data/iclr-2027-landscape-notes.json' | relative_url }}) 保存代表作、趋势事实来源与研究建议，绑定相同版本。

更新候选索引后，先重新生成统计，再逐项核对归纳的来源、代表作分类和有效性，最后更新归纳 JSON 的版本绑定。**不能仅替换哈希来沿用未经核对的旧结论。** 页面要求两份分析文件与当前主索引精确匹配；来源、哈希、时间、数量或方向成员不匹配时，仅隐藏总结章节，保留可用的论文索引。历史快照不可作为当前全景结论。

### 验证

~~~bash
python3 -m unittest discover -s scripts -p 'test_sync_iclr2027.py' -v
node scripts/test_openreview_export.cjs
~~~

Python 验证完整分页、范围清单与源快照绑定、权限、版本变化、历史数据保留及摘要/全文独立计数。导出脚本的内存测试核对官网客户端分页、字段清理、最后计数复核和错误停止，不访问真实官网。页面另经桌面、平板、手机浏览器检查搜索、分类、阅读筛选、分页、官方链接与失败显示。

[返回调研页面]({{ '/iclr-2027-quantization/' | relative_url }}) · [OpenReview 原始投稿列表](https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions)
