# Synthetic ASCII-only fixtures; no personal or real contract data.
from pathlib import Path
root=Path(__file__).parent

def make_pdf(pages,javascript=False):
 objects={1:b'<< /Type /Catalog /Pages 2 0 R >>',3:b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'}
 kids=[]
 for index,lines in enumerate(pages):
  page=4+index*2;stream=page+1;kids.append(f'{page} 0 R')
  commands=['BT /F1 11 Tf 40 760 Td']
  for line in lines:
   escaped=line.replace('\\','\\\\').replace('(','\\(').replace(')','\\)');commands+=['('+escaped+') Tj','0 -18 Td']
  commands+=['ET'];data='\n'.join(commands).encode();objects[stream]=b'<< /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
  objects[page]=f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream} 0 R >>'.encode()
 objects[2]=f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode()
 if javascript:objects[1]=b'<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (globalThis.contractPdfScriptExecuted=true;) >> >>'
 data=b'%PDF-1.4\n';offsets={}
 for i in sorted(objects):offsets[i]=len(data);data+=f'{i} 0 obj\n'.encode()+objects[i]+b'\nendobj\n'
 xref=len(data);size=max(objects)+1;data+=f'xref\n0 {size}\n'.encode()+b'0000000000 65535 f \n'
 for i in range(1,size):data+=f'{offsets.get(i,0):010d} 00000 {"n"if i in offsets else"f"} \n'.encode()
 data+=f'trailer << /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode();return data
lines=['Smluvni pokuta pri prodleni cini 1000 Kc.','Smlouva se automaticky prodluzuje na dalsi obdobi.','Vypovedni lhuta je jeden mesic a dorucuje se pisemne.','Dodavatel muze jednostranne zmenit cenik sluzeb.','Poplatek se hradi dle ceniku prilozenych podminek.','Spor bude resit rozhodci rizeni podle dohody.']
(root/'text-contract.pdf').write_bytes(make_pdf([lines,lines]))
(root/'script-contract.pdf').write_bytes(make_pdf([lines],True))
for n in range(5):(root/f'scan-{n+1}.pdf').write_bytes(make_pdf([[]]))
(root/'too-many-pages.pdf').write_bytes(make_pdf([lines]*41))
(root/'malformed.pdf').write_bytes(b'%PDF-1.4\nthis is not a valid PDF\n')
