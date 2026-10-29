#!/usr/bin/env python3
"""Rebuild MICRO 2026's official technical program (Python standard library)."""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import urllib.request
from sync_isca2026 import ProgramHTMLParser, write_atomic

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.microarch.org/micro59/program/'
RAW_SOURCE = ROOT / 'assets/data/micro-2026-source.html'
OUTPUT = ROOT / 'assets/data/micro-2026-program.json'
CATEGORIES = [
 {'id':'gpu','label':'GPU 微架构与数值计算','description':'GPU 微架构、数值精度及 GPU 存储与流水线场次。'},
 {'id':'pim-llm','label':'PIM / 3D 堆叠与 LLM','description':'面向 LLM 的近存计算、3D 堆叠及长上下文推理场次。'},
 {'id':'industry','label':'工业界实践','description':'官方 Industry Session，保留独立 track。'},
 {'id':'low-bit','label':'低比特与稀疏推理','description':'LUT、量化及稀疏推理场次；具体主题以逐篇标题为准。'},
 {'id':'interconnect','label':'ML 系统互连与异构调度','description':'官方 ML System Interconect 场次。'},
 {'id':'memory','label':'内存、缓存与地址翻译','description':'内存功耗、刷新、预取、缓存并行及 DRAM 可靠性场次。'},
 {'id':'distinguished','label':'杰出论文场次','description':'官方 Distinguished Papers I / II，包含多个研究主题。'},
 {'id':'domain','label':'机器人、视觉与专用加速','description':'机器人、图、视觉语言模型及数据流推理场次。'},
 {'id':'cpu','label':'CPU 微架构与编译','description':'分支预测、指令预取、微架构及编译场次。'},
 {'id':'modeling','label':'仿真、性能与功耗建模','description':'仿真、性能预测及设计空间探索场次。'},
 {'id':'quantum','label':'量子与新兴计算','description':'官方 Quantum 及 Quantum & Emerging Technologies 场次。'},
 {'id':'pim-search','label':'近数据计算与存内检索','description':'NDP / PIM 设计探索及近存、存内搜索场次。'},
 {'id':'security','label':'安全、共享内存与密码计算','description':'侧信道、机密计算、安全内存共享及密码加速场次。'},
 {'id':'spatial','label':'空间架构、FPGA 与 CGRA','description':'空间映射、高层次综合、FPGA / CGRA 场次。'},
 {'id':'reliability','label':'可靠性与能量受限系统','description':'新兴技术、可靠性、容错及能量受限系统场次。'},
 {'id':'cxl','label':'CXL 分层内存与存储','description':'CXL、缓存带宽和分层内存存储场次。'},
 {'id':'datacenter','label':'并行架构与数据中心','description':'官方 Parallel Architectures / Datacenter Systems 场次。'},
]
SESSION_CATEGORIES = {
 '1a':'gpu','1b':'pim-llm','1c':'industry','1d':'low-bit',
 '2a':'interconnect','2b':'memory','2c':'distinguished','2d':'domain',
 '3a':'cpu','3b':'modeling','3c':'distinguished','3d':'quantum',
 '4a':'pim-search','4b':'security','4c':'pim-llm',
 '5a':'spatial','5b':'reliability','5c':'cxl',
 '6a':'cpu','6b':'reliability','6c':'low-bit','6d':'cxl',
 '7a':'gpu','7b':'modeling','7c':'domain','7d':'memory',
 '8a':'pim-llm','8b':'memory','8c':'domain','8d':'quantum',
 '9a':'spatial','9b':'pim-search','9c':'datacenter','9d':'security',
}
DAYS = {'Day 1: November 2nd, 2026':'2026-11-02','Day 2: November 3rd, 2026':'2026-11-03','Day 3: November 4th, 2026':'2026-11-04'}


def parse_program(source_bytes, fetched_at):
 parser=ProgramHTMLParser();parser.feed(source_bytes.decode('utf-8'));parser.close()
 root=parser.root;sessions=[];papers=[];excluded=[];day=None
 for node in root.walk():
  if node.tag=='h2' and node.text() in DAYS:day=DAYS[node.text()]
  if not node.has_class('panel-session'):continue
  title=node.find_one('panel-title').text();entries=node.find_all('paper')
  if not entries:continue
  if title=='Session 0A: Opening Remarks':
   for entry in entries:excluded.append({'session_id':'0a','title':entry.find_one('paper-title').text(),'reason':'Opening message, not a research paper.','source_url':SOURCE+'#i-a'})
   continue
  match=re.fullmatch(r'Session (\d+[A-D]): (.+)',title)
  if not match or not day:raise ValueError('Unexpected session: '+title)
  sid=match[1].lower();theme=match[2]
  if sid not in SESSION_CATEGORIES:raise ValueError('Add explicit category for '+sid)
  category=SESSION_CATEGORIES[sid];track='industry' if theme=='Industry Session' else 'main'
  if (track=='industry') != (category=='industry'):raise ValueError('Track mismatch')
  heading=node.find_one('panel-heading')
  anchor=next(n.attrs['href'].removeprefix('#') for n in heading.walk() if n.tag=='a' and n.attrs.get('href','').startswith('#'))
  url=SOURCE+'#'+anchor
  locations=node.find_all('session-location');chairs=node.find_all('session-chair')
  session={'id':sid,'title':title,'theme':theme,'date':day,'location':locations[0].text().removeprefix('Location: ') if locations else '', 'chair':chairs[0].text().removeprefix('Session Chair: ') if chairs else '', 'category':category,'track':track,'paper_count':len(entries),'source_url':url}
  sessions.append(session)
  for entry in entries:
   name=entry.find_one('paper-title').text();authors=entry.find_one('paper-authors').text()
   if not name or not authors:raise ValueError('Missing paper title/authors')
   if any(n.tag=='a' and n.attrs.get('href') for n in entry.find_one('paper-title').walk()):raise ValueError('Review new paper link semantics')
   papers.append({'id':'micro26-'+hashlib.sha256(name.encode()).hexdigest()[:12],'title':name,'authors':authors,'session_id':sid,'session':title,'category':category,'track':track,'date':day,'time':None,'source_url':url,'paper_url':None,'abstract':None})
 if len(papers)+len(excluded)!=len(root.find_all('paper')):raise ValueError('Unaccounted source paper blocks')
 if len(set(p['id'] for p in papers))!=len(papers):raise ValueError('Duplicate title or ID')
 if len(set(s['id'] for s in sessions))!=len(sessions):raise ValueError('Duplicate session')
 counts=Counter(p['category'] for p in papers)
 return {'metadata':{'conference':'MICRO 2026','edition':59,'city':'Athens, Greece','conference_dates':'2026-10-31 / 2026-11-04','paper_dates':'2026-11-02 / 2026-11-04','source_name':'MICRO 2026 official main program','source_url':SOURCE,'source_file':'assets/data/micro-2026-source.html','source_sha256':hashlib.sha256(source_bytes).hexdigest(),'fetched_at':fetched_at,'total_papers':len(papers),'main_papers':sum(p['track']=='main' for p in papers),'industry_papers':sum(p['track']=='industry' for p in papers),'session_count':len(sessions),'source_paper_block_count':len(root.find_all('paper')),'excluded_empty_slot_count':0,'excluded_nonpaper_count':len(excluded),'main_session_count':sum(s['track']=='main' for s in sessions),'industry_session_count':sum(s['track']=='industry' for s in sessions),'category_method':'Exclusive grouping of official sessions; not per-paper topic classification.','scope':'All named papers in the published main program, including Industry Session; opening remarks, keynotes, PhD Jobs and SRC sessions, panels and social activities excluded.','scope_explanation':'会前已公布议程，含 Research Track 与首届 Industry Track；排除开幕致辞、主题报告、招聘、SRC 和社交活动。','available_fields':['title','authors_with_affiliations','session','track','date','location','chair'],'limitations':['会议尚未举行；这里总结已公布的论文议程与公开版本，不是会后报告。','方向按官方场次互斥归组；杰出论文场次单列，不表示完整主题占比。','官网不提供论文摘要和原文；公开版本的技术解读单独标注来源。','标题仅规范化空白，保留官网 LaTeX 和可能的拼写问题。']},'categories':[{**c,'paper_count':counts[c['id']]} for c in CATEGORIES],'sessions':sessions,'papers':papers,'excluded_slots':excluded}


def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input-html',type=Path);parser.add_argument('--fetched-at');parser.add_argument('--output',type=Path,default=OUTPUT);args=parser.parse_args()
 if args.input_html:
  source=args.input_html.read_bytes();stamp=args.fetched_at
  if not stamp and args.output.exists():
   old=json.loads(args.output.read_text())['metadata']
   if old['source_sha256']==hashlib.sha256(source).hexdigest():stamp=old['fetched_at']
  if not stamp:parser.error('--fetched-at required for a new offline snapshot')
 else:
  req=urllib.request.Request(SOURCE,headers={'User-Agent':'Galen-MICRO2026-Survey/1.0'})
  with urllib.request.urlopen(req,timeout=60) as response:source=response.read()
  stamp=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
 if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z',stamp):parser.error('UTC timestamp required')
 dt.datetime.fromisoformat(stamp.replace('Z','+00:00'))
 data=parse_program(source,stamp)
 if not args.input_html:write_atomic(RAW_SOURCE,source)
 write_atomic(args.output,(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode())
 m=data['metadata'];print(f"{m['total_papers']} papers: {m['main_papers']} main + {m['industry_papers']} industry; {m['session_count']} sessions")

if __name__=='__main__':main()
