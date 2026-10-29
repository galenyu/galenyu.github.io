#!/usr/bin/env python3
"""Build the HPCA 2026 paper index from its official Researchr program."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = 'https://2026.hpca-conf.org/program/program-hpca-2026/'
SOURCE = ROOT / 'assets/data/hpca-2026-source.html'
OUTPUT = ROOT / 'assets/data/hpca-2026-program.json'
CATEGORIES = [
 ('best-paper', '最佳论文候选', '官方 Best Paper Candidates 场次，包含多种研究方向。'),
 ('llm', 'LLM 推理与服务', '大模型服务、推理优化与跨层系统工具场次。'),
 ('pim', '近数据与存内计算', '近数据处理、存内计算接口与 PIM 架构场次。'),
 ('memory', '存储系统与一致性', '缓存一致性、内存系统、地址转换和 Chiplet 互连场次。'),
 ('reliability', '内存可靠性', '故障预测、内存镜像与纠错场次。'),
 ('security', '安全与侧信道', 'DRAM 防护、硬件攻击与侧信道防御场次。'),
 ('crypto', '密码计算加速', '全同态加密、零知识证明与隐私检索场次。'),
 ('quantum', '量子架构与编译', '量子处理器、纠错、编译与仿真场次。'),
 ('cpu', 'CPU、缓存与预取', 'CPU 微架构、分支预测、缓存与预取场次。'),
 ('wafer', '晶圆级与分布式训练', '晶圆级大模型系统、分布式与多 GPU 训练场次。'),
 ('visual', '视觉、图形与多模态', '3D 渲染、空间加速器、视觉和视频模型场次。'),
 ('gpu', 'GPU 内核与资源管理', 'GPU 内核优化、共置、显存管理与多 Chiplet 系统场次。'),
 ('accelerators', '专用加速器与设计方法', '新计算范式、设计建模与领域专用加速器场次。'),
 ('graph-bio', '图计算与生物信息', '图神经网络、检索、基因组与生物信息场次。'),
 ('systems', '系统资源与可重构计算', '服务资源管理、FPGA、SmartNIC 与可重构计算场次。'),
 ('industry', '工业界实践', '官方 Industry Track 论文。'),
]
SESSION_GROUPS = {
 'Cache Coherence and Chiplet Interconnects':'memory', 'Best Paper Candidates':'best-paper',
 'Homomorphic Encryption Acceleration':'crypto', 'DRAM Security and Reliability':'security',
 'Near-Data Processing and Storage':'pim', 'Quantum Computing Architecture':'quantum',
 'Memory System Reliability':'reliability', 'LLM Inference Serving Systems':'llm',
 'Quantum Compilation and Simulation':'quantum', 'Processing-in-Memory Architectures':'pim',
 'Efficient LLM Inference Techniques':'llm', '3D Graphics and Rendering Acceleration':'visual',
 'CPU Microarchitecture Optimization':'cpu', 'Wafer-Scale Systems for Large Models':'wafer',
 'Caching and Prefetching':'cpu', 'Visual and Multimodal Acceleration':'visual',
 'Zero-Knowledge and Private Information Retrieval':'crypto', 'Memory Systems for Scalable Computing':'memory',
 'LLM Systems and Microarchitecture Tools':'llm', 'Emerging Compute Paradigms':'accelerators',
 'Accelerator Design and Modeling':'accelerators', 'Distributed and Multi-GPU Training':'wafer',
 'Domain Specific Accelerators':'accelerators', 'Industry Track':'industry',
 'Genomics and Bioinformatics':'graph-bio', 'Hardware Security and Side-Channel Defenses':'security',
 'Graph Neural Networks and Retrieval Systems':'graph-bio', 'GPU Kernel Optimization and Resource Sharing':'gpu',
 'FPGA, SmartNIC, and Reconfigurable Computing':'systems', 'Efficient Serving and Resource Management':'systems',
 'GPU Memory Management and Multi-Chiplet Systems':'gpu',
}
class Node:
 def __init__(self, tag='', attrs=(), parent=None):
  self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []
 def text(self):
  return ' '.join(' '.join(c.text() if isinstance(c, Node) else c for c in self.children).split())
 def find(self, tag=None, cls=None, attr=None):
  result=[]
  for c in self.children:
   if isinstance(c, Node):
    if (not tag or c.tag == tag) and (not cls or cls in c.attrs.get('class','').split()) and (not attr or attr in c.attrs):
     result.append(c)
    result.extend(c.find(tag, cls, attr))
  return result
class Parser(HTMLParser):
 def __init__(self):
  super().__init__(); self.root=Node(); self.current=self.root
 def handle_starttag(self, tag, attrs):
  node=Node(tag, attrs, self.current); self.current.children.append(node)
  if tag not in {'br','hr','img','input','col','meta','link','wbr','source'}: self.current=node
 def handle_startendtag(self, tag, attrs):
  self.current.children.append(Node(tag, attrs, self.current))
 def handle_endtag(self, tag):
  node=self.current
  while node.parent and node.tag != tag: node=node.parent
  if node.parent: self.current=node.parent
 def handle_data(self, data): self.current.children.append(data)

def parse(raw, fetched_at):
 parser=Parser(); parser.feed(raw.decode('utf-8'))
 papers=[]; sessions=[]; excluded=[]
 for table in parser.root.find('table', cls='session-table'):
  info=table.find(cls='session-info-in-table')
  if not info: continue
  # The session title is the direct text before the track span and room link.
  title=' '.join(' '.join(c for c in info[0].children if isinstance(c,str)).split())
  title=re.sub(r'\s+at$', '', title).strip()
  rows=[row for row in table.find('tr') if row.attrs.get('data-slot-id')]
  selected=[row for row in rows if any(t.text() in {'Main Conference','Industry Track'} for t in row.find(cls='prog-track'))]
  if not selected: continue
  if title == 'Business Meeting':
   excluded.extend({'title':r.find('a',attr='data-event-modal')[0].text(), 'reason':'Official Main Conference-tagged business meeting; not a research paper.', 'source_url':SOURCE_URL} for r in selected)
   continue
  if title not in SESSION_GROUPS: raise ValueError('Unmapped official session: '+title)
  cat=SESSION_GROUPS[title]; track='industry' if cat=='industry' else 'main'
  sid='s'+hashlib.sha256(title.encode()).hexdigest()[:10]
  raw_date=table.attrs['data-facet-date']; date=datetime.strptime(raw_date,'%a %d %b %Y').date().isoformat()
  slot=table.find(cls='slot-label')[0].text()
  chairs=info[0].find('small'); chair=chairs[0].text().removeprefix('Chair(s):').strip() if chairs else None
  sessions.append({'id':sid,'title':title,'theme':title,'date':date,'time':slot,'location':table.attrs.get('data-facet-room'),'chair':chair,'category':cat,'track':track,'paper_count':len(selected),'source_url':SOURCE_URL})
  for row in selected:
   link=row.find('a',attr='data-event-modal')[0]; paper_title=link.text()
   authors=row.find(cls='performers')[0].text()
   if not paper_title or not authors: raise ValueError('Missing title or authors')
   publications=row.find('a',cls='publication-link')
   paper_url=next((n.attrs.get('href') for n in publications if n.text().strip().lower() in {'pre-print','preprint','paper','pdf'}),None)
   papers.append({'id':'hpca26-'+hashlib.sha256(paper_title.encode()).hexdigest()[:12], 'title':paper_title,'authors':authors,'session_id':sid,'session':title,'category':cat,'track':track,'date':date,'time':row.find(cls='start-time')[0].text(), 'source_url':SOURCE_URL,'paper_url':paper_url,'abstract':None,'official_event_id':link.attrs['data-event-modal']})
 counts=Counter(p['category'] for p in papers); tracks=Counter(p['track'] for p in papers)
 if len({p['title'].casefold() for p in papers}) != len(papers) or len({p['id'] for p in papers}) != len(papers): raise ValueError('Duplicate title or id')
 if len(sessions)!=len(SESSION_GROUPS): raise ValueError('Missing expected official session')
 if tracks != {'main':119,'industry':3}: raise ValueError('Official program membership changed; review scope before replacing index: '+str(tracks))
 metadata={'conference':'HPCA 2026','source_name':'HPCA 2026 official Researchr technical program','source_url':SOURCE_URL,'source_file':'assets/data/hpca-2026-source.html','source_sha256':hashlib.sha256(raw).hexdigest(),'fetched_at':fetched_at,'total_papers':len(papers),'main_papers':tracks['main'],'industry_papers':tracks['industry'],'session_count':len(sessions),'main_session_count':sum(s['track']=='main' for s in sessions),'industry_session_count':sum(s['track']=='industry' for s in sessions),'source_paper_block_count':len(papers)+len(excluded),'excluded_empty_slot_count':0,'excluded_nonpaper_count':len(excluded),'category_method':'Exclusive grouping of official sessions; not per-paper topic classification.','scope':'All Main Conference and Industry Track paper presentations; excludes business meeting, Best of CAL, keynotes, workshops, tutorials, social events and co-located conferences.','available_fields':['title','authors_with_affiliations','session','track','date','time','location','chair','selected_author_preprint_links'],'limitations':['方向按官方场次互斥归组，不等同于逐篇主题标注；最佳论文候选场次单列。','索引不表示已阅读全文；中文解读另行记录材料与阅读深度。','Best of CAL 为既有期刊论文展示，未计入当届主会与工业界论文。','官网议程的数学标记与大小写保留原文；摘要未批量采集，未知字段保持为空。']}
 categories=[{'id':cid,'label':label,'description':desc,'paper_count':counts[cid]} for cid,label,desc in CATEGORIES]
 return {'metadata':metadata,'categories':categories,'sessions':sessions,'papers':papers,'excluded_slots':excluded}

def main():
 ap=argparse.ArgumentParser(description=__doc__); ap.add_argument('--input-html',type=Path); ap.add_argument('--fetched-at'); args=ap.parse_args()
 if args.input_html:
  raw=args.input_html.read_bytes(); stamp=args.fetched_at
  if not stamp and OUTPUT.exists():
   old=json.loads(OUTPUT.read_text());
   if old['metadata']['source_sha256']==hashlib.sha256(raw).hexdigest():stamp=old['metadata']['fetched_at']
  if not stamp: raise SystemExit('New offline snapshot requires --fetched-at in ISO 8601 UTC')
 else:
  raw=urlopen(SOURCE_URL,timeout=120).read();stamp=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
 data=parse(raw,stamp)
 if not args.input_html: SOURCE.write_bytes(raw)
 OUTPUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f"HPCA 2026: {len(data['papers'])} papers, {len(data['sessions'])} sessions; source SHA256 {data['metadata']['source_sha256']}")
if __name__=='__main__':main()
