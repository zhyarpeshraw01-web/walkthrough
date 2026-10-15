from pathlib import Path
from PIL import Image, ImageDraw
import json, base64, shutil, hashlib

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'Emile_Cinematic'
content=json.loads((ROOT/'work/content.json').read_text())
assets={}; manifest=[]
def add(key,relative,mime):
    p=DEST/relative;b=p.read_bytes()
    assets[key]='data:'+mime+';base64,'+base64.b64encode(b).decode()
    image=Image.open(p)
    manifest.append({'key':key,'file':relative,'width':image.width,'height':image.height,'sha256':hashlib.sha256(b).hexdigest()})

for scene in content['scenes']:
    name=scene['id'];w,h=scene['size']
    add(name+'-photo',f'assets/photos/{name}.jpg','image/jpeg')
    add(name+'-depth',f'assets/depth/{name}.png','image/png')
    # Discrete, manually traced analytical regions. Values correspond to the legend JSON.
    labels=Image.new('L',(w,h),0);draw=ImageDraw.Draw(labels)
    def area(points):return abs(sum(x*points[(i+1)%len(points)][1]-points[(i+1)%len(points)][0]*y for i,(x,y) in enumerate(points)))
    objects=sorted(enumerate(scene['hotspots'],1),key=lambda x:area(x[1]['polygon']),reverse=True)
    for i,obj in objects:draw.polygon([(round(x*w),round(y*h)) for x,y in obj['polygon']],fill=i)
    labels.save(DEST/f'assets/masks/{name}-regions.png')
    (DEST/f'assets/masks/{name}-regions.json').write_text(json.dumps({'kind':'Manual analytical segmentation, not AI object detection or surveyed outlines','regions':{str(i):{'id':o['id'],'label':o['short'],'normalized_polygon':o['polygon']} for i,o in enumerate(scene['hotspots'],1)}},indent=2))
    depth=Image.open(DEST/f'assets/depth/{name}.png').convert('L')
    for i,(lo,hi) in enumerate([(0,.27),(.27,.56),(.56,1.001)]):
        mask=depth.point([255 if lo<=v/255<hi else 0 for v in range(256)])
        mask.save(DEST/f'assets/masks/{name}-depth-band-{i+1}.png')
add('ground-floor','assets/photos/ground-floor.jpg','image/jpeg')
(DEST/'assets.bundle.js').write_text('/* Embedded offline copies of the separately included assets. See docs/RIGHTS.txt. */\nwindow.EMILE_ASSETS='+json.dumps(assets,separators=(',',':'))+';\n')
# A data URL avoids local-font CORS inconsistencies in file:// browsers.
font=base64.b64encode((DEST/'assets/fonts/CormorantGaramond.ttf').read_bytes()).decode()
with (DEST/'assets.bundle.js').open('a') as f:
    css='@font-face{font-family:Cormorant;src:url(data:font/ttf;base64,'+font+') format("truetype");font-weight:300 700;font-display:swap}'
    f.write('(function(){var s=document.createElement("style");s.textContent='+json.dumps(css)+';document.head.appendChild(s);})();\n')
(DEST/'docs/asset-manifest.json').write_text(json.dumps(manifest,indent=2))
shutil.copyfile(ROOT/'work/prepare_depth.py',DEST/'source/prepare_depth.py')
shutil.copyfile(__file__,DEST/'source/bundle_assets.py')
(DEST/'source/analysis-content.json').write_text(json.dumps(content,ensure_ascii=False,indent=2))
(DEST/'START_EMILE.cmd').write_bytes(b'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nif not exist "%~dp0index.html" (\r\n  echo Please extract the complete ZIP folder before launching.\r\n  pause\r\n  exit /b 1\r\n)\r\nstart "" "%~dp0index.html"\r\nexit /b\r\n')
print('Bundled',len(manifest),'runtime image assets;',sum(len(v) for v in assets.values())//1024,'KiB of embedded data.')
