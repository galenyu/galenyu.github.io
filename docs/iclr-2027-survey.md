---
layout: page
title: ICLR 2027 调研维护说明
lang: zh-CN
permalink: /docs/iclr-2027-survey/
sitemap: false
---

这份调研的目标是 **ICLR 2027 模型量化相关的公开 Active submissions**。完整 OpenReview 列表暂受浏览器验证限制；现阶段整理可取得的公开预印本全文，并用第三方历史快照补充候选线索。阅读全文、作者投稿声明、镜像投稿关联与官方当前活跃状态分别核对。投稿与录用结果是不同状态。

### 当前来源与阅读状态

- `assets/data/iclr-2027-quantization.json`：OpenReview 官方活跃投稿快照。未获取完整列表时状态为 `unavailable`，会议总数和候选数为未知。
- `assets/data/iclr-2027-reading-notes.json` 的 `papers`：公开全文阅读笔记。`source_kind: public_preprint` 表示原文来自公开预印本；`submission_evidence: author_reported` 表示有作者明确声明，`mirror_snapshot` 表示关联仅来自镜像。`active_submission_verified: false` 表示尚未与官方当前活跃记录匹配。不能据此判断未撤稿、未桌拒或已录用。
- 同一文件的 `candidates`：第三方快照的自动初筛线索，`source_kind: mirror_candidate`。记录标题、关键词、编号和链接，不发布原始摘要，不填未经全文阅读的方法或实验总结。
- `mirror_metadata`：固定来源提交、快照日期、筛选方式和核验边界；镜像记录数量不会填入官方统计卡片。

截至 2026-10-09 已核对 Softmax Reparameterization（arXiv v2）、Chameleon（v1）、HeadGuard（v1）、QuantMLA（v2）、JustQuant（v1）与 AYOT / ScaleQ-1.58（v1）的正文、关键表格和局限。前三篇具有作者明确的 ICLR 2027 声明；后三篇的投稿关联仅来自镜像。AYOT 的预印本副标题与镜像不同，方法和摘要数值匹配，但原投稿版本对应关系仍待官方原页核实。页面记录原文链接、版本、量化对象/精度、实验结果和部署证据；没有运行作者代码，不能称为独立复现。SP-QAT 只有作者公开投稿声明，尚无已取得的可核对全文，因此单列为线索。

第三方来源为 [iclr2027-explorer 的固定提交](https://github.com/yzc-666/iclr2027-explorer/tree/5b07b9aa7c2c5fbca35a9f4bb765cf71c489dbf0)，提交时间 2026-10-07。下载的摘要分片逐一通过该 Git 树的 blob SHA 校验，再在本地做标题、关键词和摘要初筛。镜像未保留原始 `readers` 和 `venueid`；即使内部数量一致，也不能证明官方公开性字段、列表完整性或当前状态，不能作为下面的官方完整导出导入。

本次快照初筛得到 1,136 条线索，按摘要中的范围规则和保守人工抽查排除 141 条纯表示离散化、tokenizer、codec 等记录，保留 995 条候选。模糊项保留待审，仍可能误收或漏检；6 条已读关联合并后，页面另有 989 条待阅读镜像候选。[排除清单与筛选元数据]({{ "/assets/data/iclr-2027-mirror-exclusions.json" | relative_url }}) 可供核对。候选数不是官方或已确认的模型量化论文数。

“公开全文已读”仅计实际有全文取证的阅读笔记。方向标签和阶段性观察描述本页展示记录，不能作为 ICLR 2027 全量方向分布或趋势结论。主论文索引保留原文入口，并按来源筛选。

### 获取数据

在仓库根目录运行（Python 3，仅使用标准库）：

```bash
python3 scripts/sync_iclr2027.py
```

脚本先从 Conference group 读取 `submission_venue_id`，再以该 ID 分页下载公开 notes。每页的 count 必须稳定，完整列表须满足总数、唯一论文 ID 和活跃投稿 venue 校验。它只访问匿名公开接口，不使用私人投稿权限。

OpenReview 要求访问验证或请求失败时，脚本会返回非零退出码，将状态标为 `unavailable`，保留上次成功数据和人工笔记，并将本次投稿数、候选数标为 `null`。页面显示未知数量与历史快照日期。首次访问失败时，空数组表示尚未取得论文，不能解释成“零篇量化论文”。

如果已有从公开来源取得的**完整** JSON 导出，可以导入：

```bash
python3 scripts/sync_iclr2027.py --input-json /path/to/public-export.json
```

导出必须包含 `active_venue_id: "ICLR.cc/2027/Conference/Submission"`、完整 `notes` 数组与准确 `count`，每条 note 都须保留 OpenReview 原始 `content.venueid`、标题与唯一 ID，且 `readers` 必须包含 `everyone`，确认原始记录为公开数据。局部检索结果不可冒充完整投稿列表。

### 网站要求浏览器验证时

在正常浏览器打开 [ICLR 2027 投稿列表](https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions)，手动完成 OpenReview 的人机验证，或自行登录。无需向维护者提供账号、密码或 Cookie。

若已能访问公开列表，可查看 [公开数据导出脚本]({{ '/assets/js/openreview-export.js' | relative_url }})，在官方 OpenReview 页面的浏览器开发者工具 Console 中执行。脚本请求正常公开 API，检查每条记录的 `readers` 含 `everyone`，完整分页后下载 `iclr-2027-public-submissions.json`；不会导出登录凭据。再用上述 `--input-json` 命令导入。

若脚本仍返回 403，说明该浏览器的正常 API 请求尚未通过验证，不能将局部页面或验证错误当作完整导出。导出脚本已做静态检查，尚未在真实已验证会话中运行成功。

### 初筛与核验

初筛搜索标题、摘要与关键词中的 quantization、quantisation、PTQ、QAT、low precision、mixed precision、低比特整数、W3A16 等配置和浮点格式等线索，同时要求模型、权重、激活、网络、训练或推理上下文。它可能漏检或误收；向量量化、表征离散化和数值分析论文尤其需要人工确认是否属于模型量化。候选数量只是可继续阅读的线索数量，不是已确认的模型量化论文数。

方向标签涵盖训练后量化、量化感知训练、低精度训练、KV Cache、硬件与系统、推理能力、扩散、多模态以及理论分析。一篇论文可有多个标签；标签是阅读框架，不是本届会议的趋势结论。

编辑 `assets/data/iclr-2027-quantization.json` 的对应论文记录，补充：

- `summary`：中文阅读总结，包括研究问题与方法。
- `contribution`：原文可核对的贡献与实验结果。
- `limitations`：适用范围、实验限制与尚待验证的问题。
- `categories`：人工修订的方向标签。
- `review_status`：原文核验完成后设置为 `reviewed`；初筛阶段保持 `candidate`。

没有中文总结的记录不能计为已核验。同步按论文 ID 保留人工字段；标题、摘要或来源的稿件更新时间变化后，会恢复为待核验状态，同时保留旧笔记供重新检查。撤稿或不再属于 Active submissions 的论文不进入新的活跃快照。

公开阅读笔记应在独立 `reading-notes` 文件中维护，保留 `active_submission_verified: false`，注明预印本版本、阅读范围和投稿关联证据。仅取得摘要时保持候选，不标记 `reviewed`。同一论文的镜像候选与全文笔记按候选 ID 或规范化标题合并展示，优先显示全文笔记。

### 验证

```bash
python3 -m unittest discover -s scripts -p 'test_sync_iclr2027.py' -v
```

测试覆盖分页完整性、数量变化、重复 ID、非活跃 venue、真实零条结果、未知数量、检索误报、历史数据和阅读笔记保留等行为。

[返回调研页面]({{ '/iclr-2027-quantization/' | relative_url }}) · [OpenReview 原始投稿列表](https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions)
