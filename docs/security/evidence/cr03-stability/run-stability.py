from pathlib import Path
import subprocess,os,json,re,statistics,hashlib,math,sys,tempfile
evidence=Path(__file__).resolve().parent;repo=evidence.parents[3];p=Path(sys.argv[1]) if len(sys.argv)>1 else Path(tempfile.mkdtemp(prefix='verim-cr03-retest-'));p.mkdir(parents=True,exist_ok=True);test=repo/'tests/remediation.test.js';source=repo/'src/analysis.js'
test_hash=hashlib.sha256(test.read_bytes()).hexdigest();source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
assert test_hash=='e6d4ec23823b9b1d9c399dccfb5fb3684a5124bf41814b84dc3c53ef8966760f'
rows=[];cmd=['node','--import',str(evidence/'observe-assertion.mjs'),'--test','--test-reporter=tap','--test-name-pattern=CR-03','tests/remediation.test.js']
for i in range(1,31):
 r=subprocess.run(cmd,cwd=repo,env={**os.environ,'AI_MODE':'rules','NODE_ENV':'development'},capture_output=True,text=True,timeout=30)
 (p/('run-%02d.tap'%i)).write_text(r.stdout+r.stderr)
 captured=re.findall(r'CR03_CPU_OBSERVATION Maximum CPU ([0-9.]+) ms; threshold 20 ms',r.stdout);assert len(captured)==1
 row={'run':i,'max_process_CPU_ms_over_80_analyses':float(captured[0]),'exit_code':r.returncode};rows.append(row);print(json.dumps(row),flush=True)
 assert hashlib.sha256(test.read_bytes()).hexdigest()==test_hash and hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
values=[x['max_process_CPU_ms_over_80_analyses'] for x in rows]
d={'node':subprocess.check_output(['node','--version'],text=True).strip(),'command':cmd,'conditions':'30 sequential fresh Node processes, normal CPU affinity, no competing build/audit workloads started; existing shared environment background processes are not under our control','measurement':'Unmodified existing CR03 test;20 warmups and80 measured analyses. External observer records the existing assertion message and delegates the unchanged original assert.ok. No threshold/calculation/corpus changes.','test_sha256':test_hash,'source_sha256':source_hash,'runs':rows,'min_ms':min(values),'median_ms':statistics.median(values),'p95_nearest_rank_ms':sorted(values)[math.ceil(.95*len(values))-1],'max_ms':max(values),'over_20_ms':sum(x>20 for x in values),'at_or_over_20_ms':sum(x>=20 for x in values),'failed_runs':sum(x['exit_code']!=0 for x in rows),'result':'PASS' if all(x['exit_code']==0 and x['max_process_CPU_ms_over_80_analyses']<20 for x in rows) else 'FAIL'}
(p/'results30.json').write_text(json.dumps(d,indent=2)+'\n');print(json.dumps({k:v for k,v in d.items() if k not in ['runs','command','conditions','measurement']},indent=2))
