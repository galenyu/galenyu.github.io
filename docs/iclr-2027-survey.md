---
layout: page
title: ICLR 2027 调研维护说明
lang: zh-CN
permalink: /docs/iclr-2027-survey/
sitemap: false
---

这份调研仅整理 **ICLR 2027 模型量化相关的公开 Active submissions**。论文索引来自 OpenReview，中文阅读笔记由阅读原文后补充；“候选”与“已核验”分别显示。投稿与录用结果是不同状态。

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

初筛搜索标题、摘要与关键词中的 quantization、quantisation、PTQ、QAT、low precision、mixed precision、低比特整数和浮点格式等线索，同时要求模型、权重、激活、网络、训练或推理上下文。它可能漏检或误收；向量量化、表征离散化和数值分析论文尤其需要人工确认是否属于模型量化。

方向标签涵盖训练后量化、量化感知训练、低精度训练、KV Cache、硬件与系统、推理能力、扩散、多模态以及理论分析。一篇论文可有多个标签；标签是阅读框架，不是本届会议的趋势结论。

编辑 `assets/data/iclr-2027-quantization.json` 的对应论文记录，补充：

- `summary`：中文阅读总结，包括研究问题与方法。
- `contribution`：原文可核对的贡献与实验结果。
- `limitations`：适用范围、实验限制与尚待验证的问题。
- `categories`：人工修订的方向标签。
- `review_status`：原文核验完成后设置为 `reviewed`；初筛阶段保持 `candidate`。

没有中文总结的记录不能计为已核验。同步按论文 ID 保留人工字段；标题、摘要或来源的稿件更新时间变化后，会恢复为待核验状态，同时保留旧笔记供重新检查。撤稿或不再属于 Active submissions 的论文不进入新的活跃快照。

### 验证

```bash
python3 -m unittest discover -s scripts -p 'test_sync_iclr2027.py' -v
```

测试覆盖分页完整性、数量变化、重复 ID、非活跃 venue、真实零条结果、未知数量、检索误报、历史数据和阅读笔记保留等行为。

[返回调研页面]({{ '/iclr-2027-quantization/' | relative_url }}) · [OpenReview 原始投稿列表](https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions)
