"""Create minimal secret-free deployment bundle: python3 deploy/web-checker/package.py /tmp/release.tar.gz"""
import pathlib,tarfile,sys
root=pathlib.Path(__file__).resolve().parents[2]
files=['src/server.js','src/sender.js','public/index.html','public/style.css','public/sitemap.xml','public/web.html','public/web-checker.js','public/brand-references.js']
with tarfile.open(sys.argv[1],'w:gz')as out:
 for name in files:out.add(root/name,arcname='context/'+name)
 out.add(root/'deploy/web-checker/Dockerfile',arcname='context/Dockerfile')
 out.add(root/'deploy/web-checker/production-baseline.json',arcname='production-baseline.json')
print('Secret-free deployment bundle prepared.')
