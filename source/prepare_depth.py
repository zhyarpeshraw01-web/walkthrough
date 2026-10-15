"""Precompute genuine monocular depth; no geometry or photo content is generated."""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np
import onnxruntime as ort
import hashlib, json, shutil, time

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'Emile_Cinematic'
SOURCES=ROOT.parent/'emiliano/assets/normalized'
options=ort.SessionOptions()
options.intra_op_num_threads=4
options.inter_op_num_threads=1
session=ort.InferenceSession(str(ROOT/'work/depth-model.onnx'), options, providers=['CPUExecutionProvider'])
records=[]
for scene,filename in [('timber','record_p2_2.jpeg'),('garden','casas_10.jpg'),('threshold','ad_187.jpg')]:
    image=Image.open(SOURCES/filename).convert('RGB')
    shutil.copyfile(SOURCES/filename,DEST/f'assets/photos/{scene}.jpg')
    w,h=image.size
    scale=518/min(w,h)
    iw,ih=[round(v*scale/14)*14 for v in (w,h)]
    pixels=np.asarray(image.resize((iw,ih),Image.Resampling.BICUBIC),dtype=np.float32)/255
    pixels=(pixels-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
    tensor=np.transpose(pixels,(2,0,1))[None,...]
    start=time.time()
    depth=session.run(None,{'pixel_values':tensor})[0].squeeze()
    lo,hi=np.percentile(depth,[.5,99.5])
    depth=np.clip((depth-lo)/(hi-lo),0,1)
    # White = nearer. Relative inverse-depth, never distances in metres.
    Image.fromarray((depth*65535).astype(np.uint16)).save(DEST/f'assets/depth/{scene}-raw16.png')
    normalized=Image.fromarray((depth*255).astype(np.uint8))
    normalized=normalized.resize((round(768*w/max(w,h)),round(768*h/max(w,h))),Image.Resampling.BICUBIC)
    normalized.filter(ImageFilter.GaussianBlur(.65)).save(DEST/f'assets/depth/{scene}.png')
    records.append({'scene':scene,'source_dimensions':[w,h],'inference_dimensions':[iw,ih],
      'model':'onnx-community/depth-anything-v2-small','variant':'model_quantized.onnx',
      'depth':'relative inverse depth; white nearer; not metric','normalization_percentiles':[.5,99.5],
      'display_smoothing_sigma_pixels':.65,'source_sha256':hashlib.sha256((SOURCES/filename).read_bytes()).hexdigest(),
      'model_sha256':hashlib.sha256((ROOT/'work/depth-model.onnx').read_bytes()).hexdigest()})
    print(scene,'depth',depth.shape,'seconds',round(time.time()-start,2),flush=True)
(DEST/'docs/depth-provenance.json').write_text(json.dumps(records,indent=2))
shutil.copyfile(ROOT.parent/'emiliano/assets/ad_ground_floor_layout.jpg',DEST/'assets/photos/ground-floor.jpg')
print('Completed three AI-estimated depth maps.',flush=True)
