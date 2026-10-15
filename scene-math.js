(function (root) {
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
  function sample(field,u,v){
    const x=clamp(u)*(field.width-1),y=clamp(v)*(field.height-1),x0=Math.floor(x),y0=Math.floor(y);
    const x1=Math.min(x0+1,field.width-1),y1=Math.min(y0+1,field.height-1),fx=x-x0,fy=y-y0;
    const get=(a,b)=>field.data[(b*field.width+a)*4]/255;
    return (get(x0,y0)*(1-fx)+get(x1,y0)*fx)*(1-fy)+(get(x0,y1)*(1-fx)+get(x1,y1)*fx)*fy;
  }
  function fit(aspect,viewAspect,fov=39,cameraZ=4.8){
    const span=2*cameraZ*Math.tan(fov*Math.PI/360),h=span*Math.min(1,viewAspect/aspect)*.94;
    return {width:h*aspect,height:h,cameraZ};
  }
  function point(u,v,d,frame,strength=1){
    const z=.72*Math.pow(clamp(d),.72)*strength;
    const correction=(frame.cameraZ-z)/frame.cameraZ;
    return [(u-.5)*frame.width*correction,(.5-v)*frame.height*correction,z];
  }
  function bands(d){return d<.27?0:d<.56?1:2;}
  const api={clamp,smooth,ease,sample,fit,point,bands};
  root.EMILEMath=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
