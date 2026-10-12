#!/usr/bin/env python3
"""Delivery sizes from unchanged approved artwork; no crop or drawing."""
from pathlib import Path
from PIL import Image,ImageChops
import hashlib,json,re,math
ROOT=Path(__file__).resolve().parents[1];PUBLIC=ROOT/'public';original=Image.open(PUBLIC/'assets/characters/verkarob.png').convert('RGBA')
catalog=PUBLIC/'character-assets.js';s=catalog.read_text();objects=json.loads(s.split('export const characterAssets = ',1)[1].split(';',1)[0]);records=json.loads(s.split('export const characterAssetFiles = ',1)[1].rsplit(';',1)[0])
new=[]
for width in [420,640,840]:
 image=original.resize((width,round(original.height*width/original.width)),Image.Resampling.LANCZOS)
 source=PUBLIC/f'assets/characters/responsive/verkarob-{width}.png';source.parent.mkdir(parents=True,exist_ok=True);image.save(source,optimize=True)
 import io
 b=io.BytesIO();image.save(b,format='WEBP',quality=82,method=6,exact=True);data=b.getvalue();sha=hashlib.sha256(data).hexdigest()
 path=PUBLIC/f'assets/characters/optimized/verkarob-{width}.{sha}.webp';path.write_bytes(data)
 decoded=Image.open(path).convert('RGBA');alpha=decoded.getchannel('A').tobytes()==image.getchannel('A').tobytes();assert alpha
 cream=Image.new('RGBA',image.size,(255,250,244,255));a=Image.alpha_composite(cream,image).convert('RGB');b=Image.alpha_composite(cream,decoded).convert('RGB');hist=ImageChops.difference(a,b).histogram();mse=sum((i%256)**2*n for i,n in enumerate(hist))/(width*image.height*3);psnr=100 if mse==0 else 10*math.log10(255**2/mse)
 name=f'verkarob-{width}';url='/'+str(path.relative_to(PUBLIC));objects[name]=url
 new.append(dict(name=name,url=url,width=width,height=image.height,bytes=len(data),sha256=sha,source=str(source.relative_to(PUBLIC)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),source_bytes=source.stat().st_size,source_width=width,source_height=image.height,alpha_range=list(image.getchannel('A').getextrema()),alpha_equal_to_resampled_source=alpha,webp_lossless=False,cream_composite_psnr_db=round(psnr,2)))
 print(width,len(data),'bytes; PSNR',round(psnr,2))
records=[r for r in records if r['name']not in {x['name']for x in new}]+new
catalog.write_text('// Generated asset catalog. Hero variants: scripts/optimize-hero.py.\nexport const characterAssets = '+json.dumps(objects,ensure_ascii=False,indent=2)+';\nexport const characterAssetFiles = '+json.dumps(records,ensure_ascii=False,indent=2)+';\n')
