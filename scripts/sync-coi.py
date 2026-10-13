"""Synchronize official ČOI CSV only. No input domain or customer data accepted."""
import csv,io,json,pathlib,sys,os,tempfile,datetime
SOURCE='https://coi.gov.cz/userdata/files/dokumenty-ke-stazeni/open-data/rizikove-seznam.csv'
PAGE='https://coi.gov.cz/pro-spotrebitele/otevrena-data/rizikove-weby/'
LICENSE='https://coi.gov.cz/pro-spotrebitele/otevrena-data/licence-otevrenych-dat/'
def parse_csv(raw):
 try:text=raw.decode('utf-8-sig')
 except UnicodeDecodeError:text=raw.decode('cp1250')
 if len(raw)>2_000_000 or '<html'in text.lower():raise ValueError('Unexpected source content')
 from urllib.parse import urlsplit
 records={}
 for row in csv.reader(io.StringIO(text),delimiter=';',quotechar="'"):
  if not row or not ''.join(row).strip():continue
  if len(row)!=2:raise ValueError('Unexpected CSV schema')
  address,reason=row;u=urlsplit('https://'+address.strip());host=(u.hostname or '').lower().rstrip('.');host=host.encode('idna').decode('ascii')
  if not host or '.'not in host or u.username or u.password or len(host)>253 or not reason.strip() or len(reason)>4000:raise ValueError('Invalid record')
  records.setdefault(host,[])
  if reason.strip()not in records[host]:records[host].append(reason.strip())
 if len(records)<100:raise ValueError('Incomplete list')
 return records
def atomic_write(path,value):
 path.parent.mkdir(parents=True,exist_ok=True)
 fd,temp=tempfile.mkstemp(dir=path.parent,prefix='.coi-')
 try:
  with os.fdopen(fd,'w')as out:json.dump(value,out,ensure_ascii=False);out.write('\n');out.flush();os.fsync(out.fileno())
  os.chmod(temp,0o644);os.replace(temp,path)
 finally:
  if os.path.exists(temp):os.unlink(temp)
def sync(path):
 now=datetime.datetime.now(datetime.timezone.utc).isoformat();old={}
 try:old=json.loads(path.read_text())
 except (OSError,ValueError):pass
 try:
  import subprocess
  raw=subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','15','--max-filesize','2000000','--user-agent','Verimtomu-COI-sync/2.0 (info@growmate.cz)',SOURCE],stderr=subprocess.DEVNULL)
  last_modified=None;records=parse_csv(raw)
  if old.get("records") and len(records)<len(old["records"])*0.7:raise ValueError("Unexpected list shrinkage")
  value={'schema':1,'source':SOURCE,'sourcePage':PAGE,'license':LICENSE,'fetchedAt':now,'lastAttemptAt':now,'lastAttemptOk':True,'sourceLastModified':last_modified,'records':records}
  atomic_write(path,value);print('COI synchronized: '+str(len(records))+' exact domains')
 except Exception:
  old.update(schema=1,source=SOURCE,sourcePage=PAGE,license=LICENSE,lastAttemptAt=now,lastAttemptOk=False)
  atomic_write(path,old);print('COI unavailable; previous copy retained, results unverified');return False
 return True
if __name__=='__main__':sys.exit(0 if sync(pathlib.Path(sys.argv[1]))else 1)
