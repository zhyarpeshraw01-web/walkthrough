"""Offscreen OpenGL check of the application's real vertex/fragment shader logic.
This is not browser QA. Three.js's colour-management include is replaced with
identity because this test uses unencoded RGB textures and an RGB framebuffer.
"""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image,ImageOps
import moderngl

ROOT=Path(__file__).resolve().parents[1];DEST=ROOT/'Emile_Cinematic';OUT=ROOT/'work/render-checks';OUT.mkdir(exist_ok=True)
shader=json.loads((ROOT/'work/shaders.json').read_text())
vertex='#version 330\nuniform mat4 projectionMatrix;\nuniform mat4 modelViewMatrix;\nin vec2 uv;\n'+shader['vertex'].replace('attribute ','in ').replace('varying ','out ')
fragment='#version 330\nout vec4 fragColor;\n'+shader['fragment'].replace('varying ','in ').replace('gl_FragColor','fragColor').replace('texture2D','texture').replace('#include <colorspace_fragment>','')
ctx=moderngl.create_standalone_context(backend='egl');program=ctx.program(vertex_shader=vertex,fragment_shader=fragment)
W,H=1100,700;fbo=ctx.simple_framebuffer((W,H),components=3);fbo.use();ctx.enable(moderngl.BLEND);ctx.blend_func=moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA

def sample(arr,u,v):
    x=u*(arr.shape[1]-1);y=v*(arr.shape[0]-1);x0=int(x);y0=int(y);x1=min(x0+1,arr.shape[1]-1);y1=min(y0+1,arr.shape[0]-1);a=x-x0;b=y-y0
    return ((arr[y0,x0]*(1-a)+arr[y0,x1]*a)*(1-b)+(arr[y1,x0]*(1-a)+arr[y1,x1]*a)*b)/255
def perspective():
    f=1/math.tan(math.radians(39)/2);n=.1;far=50
    return np.array([[f/(W/H),0,0,0],[0,f,0,0],[0,0,(far+n)/(n-far),2*far*n/(n-far)],[0,0,-1,0]],np.float32)
def view(x=0,y=0):
    eye=np.array([x,y,4.8]);target=np.array([0,0,.12]);forward=(eye-target);forward/=np.linalg.norm(forward);side=np.cross([0,1,0],forward);side/=np.linalg.norm(side);up=np.cross(forward,side)
    m=np.eye(4);m[:3,:3]=[side,up,forward];m[:3,3]=-m[:3,:3]@eye;return m.astype(np.float32)
def screenshot(name):
    image=Image.frombytes('RGB',(W,H),fbo.read(components=3)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    image.save((OUT/name).with_suffix('.jpg'),quality=95,subsampling=0)
def project(u,v,d,plane,cam):
    z=.72*max(0,min(1,d))**.72;p=np.array([(u-.5)*plane[0]*(4.8-z)/4.8,(.5-v)*plane[1]*(4.8-z)/4.8,z,1]);q=perspective()@cam@p;q/=q[3];return np.array([(q[0]+1)*W/2,(1-q[1])*H/2])

reports=[]
for name in ['timber','garden','threshold']:
    im=Image.open(DEST/f'assets/photos/{name}.jpg').convert('RGB');dep=Image.open(DEST/f'assets/depth/{name}.png').convert('L');arr=np.asarray(dep,dtype=np.float32)
    aspect=im.width/im.height;span=2*4.8*math.tan(math.radians(39)/2);ph=span*min(1,(W/H)/aspect)*.94;pw=ph*aspect
    cols=180;rows=min(240,round(cols/aspect));data=[];idx=[]
    for y in range(rows+1):
        for x in range(cols+1):
            u=x/cols;v=y/rows;data.extend([u,1-v,sample(arr,u,v)])
            i=y*(cols+1)+x
            if x<cols and y<rows:j=i+cols+1;idx.extend([i,j,i+1,i+1,j,j+1])
    vbo=ctx.buffer(np.array(data,np.float32).tobytes());ibo=ctx.buffer(np.array(idx,np.uint32).tobytes());vao=ctx.vertex_array(program,[(vbo,'2f 1f','uv','aDepth')],ibo)
    tex=ctx.texture(im.size,3,ImageOps.flip(im).tobytes());tex.build_mipmaps();tex.filter=(moderngl.LINEAR_MIPMAP_LINEAR,moderngl.LINEAR);tex.use(0)
    dp=ctx.texture(dep.size,3,ImageOps.flip(dep.convert('RGB')).tobytes());dp.build_mipmaps();dp.filter=(moderngl.LINEAR_MIPMAP_LINEAR,moderngl.LINEAR);dp.use(1)
    program['uPhoto']=0;program['uDepth']=1;program['uPlane']=(pw,ph);program['uStrength']=1;program['uReveal']=1.2;program['uOpacity']=1;program['uShowMap']=0
    program['projectionMatrix'].write(perspective().T.tobytes())
    for mode in ['neutral','shifted','layers']:
        ctx.clear(18/255,23/255,19/255,1)
        base=view(.24,.06) if mode=='shifted' else view()
        for i,(lo,hi) in enumerate([(0,.27),(.27,.56),(.56,1.001)]):
            transform=np.eye(4,dtype=np.float32)
            if mode=='layers':transform[0,3]=(i-1)*.12;transform[2,3]=(i-1)*.32
            program['modelViewMatrix'].write((base@transform).T.astype(np.float32).tobytes());program['uLow']=lo;program['uHigh']=hi;vao.render()
        screenshot(f'{name}-{mode}.png')
    # Exact neutral projection must preserve every original photo location.
    errors=[];deltas=[]
    for u,v in [(.15,.15),(.5,.5),(.25,.8),(.83,.76),(.5,.22)]:
        d=sample(arr,u,v);neutral=project(u,v,d,(pw,ph),view());shifted=project(u,v,d,(pw,ph),view(.24,.06));f=W/(2*math.tan(math.radians(39)/2)*(W/H));
        expected=np.array([W/2+(u-.5)*pw*f/4.8,H/2+(.5-v)*ph*(-f)/4.8])
        errors.append(float(np.max(np.abs(neutral-expected))));deltas.append((shifted-neutral).tolist())
    assert max(errors)<.001,(name,errors)
    assert max(d[0] for d in deltas)-min(d[0] for d in deltas)>.5,'Motion collapsed to uniform pan'
    assert all(math.hypot(*d)<28 for d in deltas),'Motion exceeds restraint bound'
    reports.append({'scene':name,'neutral_projection_max_error_px':max(errors),'probe_motion_xy_px':deltas,'max_probe_motion_px':max(math.hypot(*d) for d in deltas)})
    vao.release();vbo.release();ibo.release();tex.release();dp.release()
result={'passed':True,'renderer':ctx.info['GL_RENDERER'],'scope':'Actual offscreen OpenGL rendering of the shader logic; not browser rendering','scenes':reports}
(ROOT/'work/gl-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
