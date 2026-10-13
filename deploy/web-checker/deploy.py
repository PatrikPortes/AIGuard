"""Run as root on VPS: python3 deploy.py COMMIT BUNDLE. No secrets are printed."""
import subprocess,json,pathlib,os,sys,time,hashlib
commit,bundle=sys.argv[1:];assert len(commit)==40 and all(x in '0123456789abcdef' for x in commit)
name='verimtomu-web';backup=name+'-before-web-checker-20261013';base='sha256:d91f79fbc0cde8431e3558a3833b26a8fb124b860f03fb94207511a944023a90'
def run(a):return subprocess.check_output(a).decode().strip()
def inspect(n):return json.loads(run(['docker','inspect',n]))[0]
old=inspect(name);assert old['Image']==base,'Production image changed'
others={n:inspect(n)['Id']for n in ['verimtomu-ai-proxy','verimtomu-admin-staging']}
h=old['HostConfig'];net=list(old['NetworkSettings']['Networks'].items());assert len(net)==1 and net[0][0]=='verimtomu-private'
assert h['ReadonlyRootfs']and h['CapDrop']==['ALL']and 'no-new-privileges:true'in h['SecurityOpt']and not h.get('PortBindings')and not h['Privileged']
assert sorted((m['Source'],m['Destination'],m['RW'])for m in old['Mounts'])==sorted([('/opt/verimtomu/ai-data','/app/data',True),('/opt/verimtomu/usage-private','/usage-private',True),('/opt/verimtomu/usage-export','/usage-export',True)])
assert subprocess.run(['docker','inspect',backup],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0,'Backup already exists'
root=pathlib.Path('/opt/verimtomu/web-checker-release');assert not root.exists(),'Release directory exists';root.mkdir(mode=0o700)
subprocess.check_call(['tar','-xzf',bundle,'-C',str(root)])
expected=json.loads((root/'production-baseline.json').read_text())
js='const f=require("fs"),c=require("crypto");let s="";process.stdin.on("data",b=>s+=b);process.stdin.on("end",()=>console.log(JSON.stringify(Object.fromEntries(JSON.parse(s).map(k=>[k,c.createHash("sha256").update(f.readFileSync("/app/"+k)).digest("hex")])))));'
def hashes(keys):return json.loads(subprocess.check_output(['docker','exec','-i',name,'node','-e',js],input=json.dumps(list(keys)).encode()))
assert hashes(expected)==expected,'Production source changed'
context=root/'context';subprocess.check_call(['docker','build','--network','none','--pull=false','--build-arg','BASE_IMAGE='+base,'--build-arg','RELEASE_COMMIT='+commit,'-f',str(context/'Dockerfile'),'-t','verimtomu-web:web-checker-'+commit[:7],str(context)])
image=run(['docker','image','inspect','verimtomu-web:web-checker-'+commit[:7],'--format','{{.Id}}'])
env=root/'runtime.env';fd=os.open(env,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w')as out:
 for item in old['Config']['Env']:assert '\n'not in item;out.write(item+'\n')
args=['docker','run','-d','--name',name,'--network',net[0][0],'--ip',net[0][1]['IPAddress'],'--env-file',str(env),'--restart',h['RestartPolicy']['Name'],'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory',str(h['Memory']),'--pids-limit',str(h['PidsLimit']),'--user',old['Config']['User']]
for opt,key in [('--cpu-period','CpuPeriod'),('--cpu-quota','CpuQuota'),('--cpus','NanoCpus')]:
 v=h.get(key,0)
 if v:args.extend([opt,str(v/1e9)if key=='NanoCpus'else str(v)])
for m in old['Mounts']:args.extend(['--mount','type='+m['Type']+',src='+m['Source']+',dst='+m['Destination']+(''if m['RW']else',readonly')])
for p,v in h['Tmpfs'].items():args.extend(['--tmpfs',p+':'+v])
args.extend(['--log-driver',h['LogConfig']['Type']])
for k,v in h['LogConfig']['Config'].items():args.extend(['--log-opt',k+'='+v])
args.append(image)
rollback="""import subprocess,json,time
name='verimtomu-web';backup='verimtomu-web-before-web-checker-20261013'
def inspect(n):return json.loads(subprocess.check_output(['docker','inspect',n]))[0]
assert inspect(backup)['Image']=='"""+base+"""'
subprocess.check_call(['docker','stop',name]);subprocess.check_call(['docker','rename',name,name+'-rolled-back-'+str(int(time.time()))]);subprocess.check_call(['docker','rename',backup,name]);subprocess.check_call(['docker','start',name]);print('Previous production restored.')
"""
(root/'rollback.py').write_text(rollback)
changed=False
try:
 assert inspect(name)['Id']==old['Id']
 subprocess.check_call(['docker','stop',name]);subprocess.check_call(['docker','rename',name,backup]);changed=True
 subprocess.check_call(args)
 ip=net[0][1]['IPAddress'];url='http://'+ip+':3000'
 for _ in range(25):
  r=subprocess.run(['curl','-sS','--max-time','3',url+'/api/health'],capture_output=True)
  try:
   health=json.loads(r.stdout);assert health['ai_configured']is True and health['rules_fallback']is True;break
  except Exception:time.sleep(1)
 else:raise RuntimeError('Application startup failed')
 updated=dict(expected)
 for folder in ['src','public']:
  for p in (context/folder).rglob('*'):
   if p.is_file():updated[str(p.relative_to(context))]=hashlib.sha256(p.read_bytes()).hexdigest()
 assert hashes(updated)==updated,'Deployed source mismatch'
 new=inspect(name)
 for key in ['Memory','CpuPeriod','CpuQuota','NanoCpus','PidsLimit','ReadonlyRootfs','CapDrop','SecurityOpt','LogConfig','Tmpfs','PortBindings','RestartPolicy']:
  assert new['HostConfig'].get(key)==h.get(key),'Runtime configuration differs: '+key
 assert new['Config']['Env']==old['Config']['Env']
 assert sorted((m['Source'],m['Destination'],m['RW'])for m in new['Mounts'])==sorted((m['Source'],m['Destination'],m['RW'])for m in old['Mounts'])
 for path,status in [('/',200),('/overit-zpravu',200),('/proverit-pujcku',200),('/proverit-web',200),('/sitemap.xml',200),('/robots.txt',200),('/privacy',200),('/404.html',404)]:
  code=run(['curl','-s','-o','/dev/null','-w','%{http_code}',url+path]);assert code==str(status),'Route failed: '+path
 assert all(inspect(n)['Id']==ident for n,ident in others.items())
 print('DEPLOYED '+commit+'; all source hashes, mounts, secrets, isolation and other containers preserved.')
except BaseException:
 if changed:
  if subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
   subprocess.run(['docker','stop',name],stdout=subprocess.DEVNULL);subprocess.check_call(['docker','rename',name,name+'-failed-'+str(int(time.time()))])
  subprocess.check_call(['docker','rename',backup,name]);subprocess.check_call(['docker','start',name]);print('Previous production restored.')
 raise
