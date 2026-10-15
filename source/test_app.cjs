const fs=require('fs'),path=require('path'),assert=require('assert');
const {JSDOM,VirtualConsole}=require('./test-deps/node_modules/jsdom');
const {PNG}=require('./test-deps/node_modules/pngjs');
const ROOT=path.join(__dirname,'../Emile_Cinematic');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/asset-manifest.json')));

async function boot(fallback=false){
  const messages=[],vc=new VirtualConsole();vc.on('jsdomError',e=>messages.push(e.message));vc.on('error',e=>messages.push(String(e)));
  const dom=new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),{runScripts:'outside-only',url:'file://'+ROOT+'/index.html',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window;let clock=0,raf=null;
  Object.defineProperty(w.performance,'now',{value:()=>clock});
  w.requestAnimationFrame=fn=>{raf=fn;return 1;};w.cancelAnimationFrame=()=>{};
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.ResizeObserver=class {constructor(fn){this.fn=fn;}observe(){}disconnect(){}};
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {left:0,top:0,right:1100,bottom:700,width:1100,height:700};};
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve()};};
  w.Element.prototype.setPointerCapture=function(id){this._capture=id;};w.Element.prototype.hasPointerCapture=function(id){return this._capture===id;};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return {drawImage:(img)=>{this._img=img;},getImageData:()=>this._img.pixels};};
  w.eval(fs.readFileSync(path.join(ROOT,'vendor/three.min.js'),'utf8'));
  w.THREE.WebGLRenderer=class{constructor(){if(fallback)throw new Error('Deliberate unavailable WebGL');}setPixelRatio(){}setClearColor(){}setSize(){}render(s,c){s.updateMatrixWorld(true);c.updateMatrixWorld(true);}};
  w.eval(fs.readFileSync(path.join(ROOT,'assets.bundle.js'),'utf8'));
  w.Image=class {set src(value){this._src=value;const key=Object.keys(w.EMILE_ASSETS).find(k=>w.EMILE_ASSETS[k]===value),m=manifest.find(a=>a.key===key);if(!m)throw new Error('Unknown image');this.width=m.width;this.height=m.height;if(m.file.endsWith('.png')){const png=PNG.sync.read(fs.readFileSync(path.join(ROOT,m.file)));this.pixels={width:png.width,height:png.height,data:png.data};}queueMicrotask(()=>this.onload&&this.onload());}get src(){return this._src;}};
  for(const f of ['content.js','scene-math.js','app.js'])w.eval(fs.readFileSync(path.join(ROOT,f),'utf8'));
  for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  function frames(n=100){for(let i=0;i<n;i++){clock+=16;if(raf)raf(clock);}}
  frames(3);assert(w.EMILE_DEBUG,'Initialization failed: '+messages.join(';'));
  return {dom,w,frames,messages};
}
(async()=>{
  let checks=0;const ok=(test,message)=>{assert(test,message);checks++;};
  const {dom,w,frames,messages}=await boot();const d=w.document,api=w.EMILE_DEBUG;
  ok(api.models.length===3,'Three models loaded');ok(d.querySelector('#enterButton').disabled===false,'Entry unlocked');
  d.querySelector('#enterButton').click();frames(100);ok(api.state.entered,'Introduction exits');
  let tested=0;
  for(let i=0;i<3;i++){
    api.changeScene(i);frames(110);ok(api.state.index===i&&!api.state.transition,'Cinematic scene transition completes');
    for(const obj of w.EMILE.scenes[i].hotspots){d.querySelector(`[data-select="${obj.id}"]`).click();frames(2);ok(api.state.selected===obj.id,'Object selected: '+obj.id);ok(d.querySelector('#insightContent').textContent.includes(obj.boundary),'Evidence boundary present');const p=api.project(...obj.at);ok(p.every(Number.isFinite)&&p[0]>=0&&p[0]<=1100&&p[1]>=0&&p[1]<=700,'Pin remains in frame');tested++;}
  }
  ok(tested===21,'All 21 object analyses opened');
  for(const [lens] of w.EMILE.lenses){d.querySelector('#lensButton').click();d.querySelector(`[data-lens="${lens}"]`).click();ok(api.state.lens===lens,'Lens '+lens+' selected');ok(!d.querySelector('#lensDialog').open,'Lens modal closes');}
  api.setLens('all');api.changeScene(0);frames(110);
  d.querySelector('#analysisButton').click();ok(!api.state.analysis&&d.body.classList.contains('analysis-off'),'Analysis off');d.querySelector('#analysisButton').click();
  d.querySelector('#mapButton').click();ok(api.state.map,'Depth map mode');d.querySelector('#mapButton').click();
  d.querySelector('#layersButton').click();frames(100);ok(api.state.layers&&api.models[0].meshes[0].position.z<-.3,'Real layer separation');d.querySelector('#layersButton').click();frames(100);
  d.querySelector('#motionButton').click();frames(160);ok(!api.state.motion&&api.state.strength<.0001,'Still mode');d.querySelector('#motionButton').click();frames(160);
  const stage=d.querySelector('#stage');stage.dispatchEvent(new w.MouseEvent('pointermove',{clientX:1000,clientY:210,bubbles:true}));frames(160);ok(Math.abs(api.state.aim.x)>.08,'Mouse moves the perspective camera');
  d.querySelector('#planButton').click();ok(d.querySelector('#planDialog').open,'Plan opens');
  d.querySelector('[data-plan="tables"]').click();ok(d.querySelectorAll('#planOverlay rect').length===8,'Eight square table highlights');ok(d.querySelectorAll('#planOverlay circle').length===4,'Three dining circles plus display circle');
  for(const mode of ['zones','seating','light']){d.querySelector(`[data-plan="${mode}"]`).click();ok(d.querySelector('#planOverlay').innerHTML.length>200,'Plan overlay '+mode);}
  d.querySelector('#planExtent').click();ok(d.querySelector('#planSvg').getAttribute('viewBox').includes('1110'),'Whole-floor view');d.querySelector('#planDialog [data-close]').click();
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));frames(110);ok(api.state.index===1,'Keyboard scene navigation');
  api.changeScene(2);api.changeScene(0);frames(220);ok(api.state.index===0&&!api.state.transition,'Queued scene navigation resolves');
  d.querySelector('#methodButton').click();ok(d.querySelector('#methodDialog').open,'Method opens');ok(d.querySelectorAll('#sourceList a').length===9,'Nine source links');
  ok(messages.length===0,'No runtime errors: '+messages.join(';'));
  fs.writeFileSync(path.join(__dirname,'shaders.json'),JSON.stringify({vertex:api.vertexShader,fragment:api.fragmentShader},null,2));
  dom.window.close();
  const fallback=await boot(true);ok(!fallback.w.EMILE_DEBUG.state.webgl,'WebGL failure activates still mode');ok(!fallback.w.document.querySelector('#fallback').hidden,'Fallback photograph visible');ok(fallback.w.document.querySelector('#layersButton').disabled,'Unavailable GPU controls disabled');fallback.w.document.querySelector('#enterButton').click();fallback.w.EMILE_DEBUG.selectObject('saarinen');ok(fallback.w.EMILE_DEBUG.state.selected==='saarinen','Fallback analysis functions');fallback.dom.window.close();
  const report={checks,objects:tested,scenes:3,passed:true,scope:'DOM/state execution with a mocked graphics device; actual browser rendering and Windows launch not tested'};
  fs.writeFileSync(path.join(__dirname,'dom-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.stack);process.exit(1);});
