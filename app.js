/* Emile photographic study — classic scripts and embedded assets support file:// offline use. */
(function () {
  'use strict';
  const D=window.EMILE, M=window.EMILEMath, A=window.EMILE_ASSETS;
  const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const state={index:0,lens:'all',selected:null,analysis:true,motion:!reduced.matches,map:false,layers:false,entered:false,transition:null,pending:null,mouse:{x:0,y:0},drag:{x:0,y:0},aim:{x:0,y:0},strength:reduced.matches?0:1,layer:0,webgl:true};
  let renderer,scene,camera,models=[],pins=[],polygons=[],width=1,height=1,lastTime=0,pointer=null,dirty=true;
  const vector=typeof THREE!=='undefined'?new THREE.Vector3():null;
  const vertexShader=`
    attribute float aDepth;
    uniform vec2 uPlane;
    uniform float uStrength;
    varying vec2 vUv;
    varying float vDepth;
    void main(){
      vUv=uv; vDepth=aDepth;
      float z=0.72*pow(clamp(aDepth,0.0,1.0),0.72)*uStrength;
      vec3 p=vec3((uv-0.5)*uPlane*((4.8-z)/4.8),z);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
    }`;
  const fragmentShader=`
    uniform sampler2D uPhoto;
    uniform sampler2D uDepth;
    uniform float uLow;
    uniform float uHigh;
    uniform float uReveal;
    uniform float uOpacity;
    uniform float uShowMap;
    varying vec2 vUv;
    varying float vDepth;
    void main(){
      if(vDepth<uLow || vDepth>=uHigh) discard;
      float rank=vDepth*0.78+vUv.x*0.22;
      float visible=1.0-smoothstep(uReveal-0.09,uReveal+0.09,rank);
      if(visible<0.003) discard;
      vec4 colour=mix(texture2D(uPhoto,vUv),texture2D(uDepth,vUv),uShowMap);
      gl_FragColor=vec4(colour.rgb,visible*uOpacity);
      #include <colorspace_fragment>
    }`;
  function svg(tag,attrs={}){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
  function htmlEscape(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function current(){return D.scenes[state.index];}
  function filtered(){return current().hotspots.filter(h=>state.lens==='all'||h.tags.includes(state.lens));}
  function announce(text){$('announcement').textContent=text;}
  function loadImage(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('An embedded image could not be decoded.'));i.src=src;});}
  function depthPixels(img){const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height);}
  function texture(img){const t=new THREE.Texture(img);t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(8,renderer.capabilities?.getMaxAnisotropy?.()||1);t.needsUpdate=true;return t;}
  function geometry(field,aspect){
    const cols=180,rows=Math.min(240,Math.round(cols/aspect)),count=(cols+1)*(rows+1);
    const positions=new Float32Array(count*3),uv=new Float32Array(count*2),depth=new Float32Array(count),indices=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
      const i=y*(cols+1)+x,u=x/cols,v=y/rows;
      positions[i*3]=u-.5;positions[i*3+1]=.5-v;uv[i*2]=u;uv[i*2+1]=1-v;depth[i]=M.sample(field,u,v);
      if(x<cols&&y<rows){const j=i+cols+1;indices.push(i,j,i+1,i+1,j,j+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('aDepth',new THREE.BufferAttribute(depth,1));g.setIndex(indices);return g;
  }
  async function makeModel(info){
    const [photo,depth]=await Promise.all([loadImage(A[info.id+'-photo']),loadImage(A[info.id+'-depth'])]);
    const model={info,photo,depth,field:depthPixels(depth),frame:M.fit(photo.width/photo.height,1),meshes:[],group:null};
    if(!state.webgl)return model;
    const g=geometry(model.field,photo.width/photo.height),p=texture(photo),d=texture(depth),group=new THREE.Group();
    const ranges=[[0,.27],[.27,.56],[.56,1.001]];
    ranges.forEach(([lo,hi],i)=>{
      const uniforms={uPhoto:{value:p},uDepth:{value:d},uPlane:{value:new THREE.Vector2(1,1)},uStrength:{value:state.strength},uLow:{value:lo},uHigh:{value:hi},uReveal:{value:1.2},uOpacity:{value:1},uShowMap:{value:0}};
      const mat=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
      const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;mesh.renderOrder=i;group.add(mesh);model.meshes.push(mesh);
    });
    model.group=group;group.visible=false;scene.add(group);return model;
  }
  function setupRenderer(){
    try{
      if(typeof THREE==='undefined')throw new Error('Three.js unavailable');
      renderer=new THREE.WebGLRenderer({canvas:$('sceneCanvas'),alpha:true,antialias:true,powerPreference:'high-performance'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));renderer.setClearColor(0x121713,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(39,1,.1,50);camera.position.set(0,0,4.8);camera.lookAt(0,0,0);
      $('sceneCanvas').addEventListener('webglcontextlost',e=>{e.preventDefault();activateFallback('WebGL paused. The study remains available as still photographs.');});
    }catch(e){activateFallback('WebGL is unavailable. Still photographs and all analysis remain available.');}
  }
  function activateFallback(message){state.webgl=false;state.motion=false;state.map=false;state.layers=false;state.strength=0;$('sceneCanvas').hidden=true;$('fallback').hidden=false;$('fallback').src=A[current().id+'-photo'];$('controlNote').textContent=message;$('effectLabel').textContent='Still mode · WebGL unavailable';announce(message);syncControls();dirty=true;}
  function resize(){
    const r=$('stage').getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);
    if(state.webgl){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    $('analysisSvg').setAttribute('viewBox',`0 0 ${width} ${height}`);
    models.forEach(model=>{model.frame=M.fit(model.photo.width/model.photo.height,width/height);model.meshes.forEach(mesh=>mesh.material.uniforms.uPlane.value.set(model.frame.width,model.frame.height));});
    if(!state.webgl&&models[state.index]){const model=models[state.index],scale=Math.min(width/model.photo.width,height/model.photo.height)*.94,w=model.photo.width*scale,h=model.photo.height*scale;Object.assign($('fallback').style,{width:w+'px',height:h+'px',left:(width-w)/2+'px',top:(height-h)/2+'px'});}
    dirty=true;
  }
  function project(u,v){
    const model=models[state.index];if(!model)return[0,0];
    if(!state.webgl){const scale=Math.min(width/model.photo.width,height/model.photo.height)*.94,w=model.photo.width*scale,h=model.photo.height*scale;return[(width-w)/2+u*w,(height-h)/2+v*h];}
    const p=M.point(u,v,M.sample(model.field,u,v),model.frame,state.strength);vector.set(...p);model.group.localToWorld(vector);vector.project(camera);return[(vector.x*.5+.5)*width,(-vector.y*.5+.5)*height];
  }
  function updateOverlay(){
    if(!state.entered||!state.analysis||state.transition||state.layers)return;
    const points=filtered();
    pins.forEach(({el,item})=>{const [x,y]=project(...item.at);el.style.left=x+'px';el.style.top=y+'px';el.querySelector('.tip').classList.toggle('left',x>width*.68);});
    polygons.forEach(({el,item})=>{el.setAttribute('points',item.polygon.map(p=>project(...p).map(n=>n.toFixed(1)).join(',')).join(' '));});
    const sel=points.find(h=>h.id===state.selected);$('guides').replaceChildren();
    if(sel){
      const [x,y]=project(...sel.at),endX=Math.min(width-18,x+Math.min(130,width*.13)),endY=Math.max(25,y-45);
      $('leader').setAttribute('d',`M ${x+17} ${y} L ${endX-15} ${endY} L ${endX} ${endY}`);
      if(sel.path){const path=svg('polyline',{points:sel.path.map(p=>project(...p).join(',')).join(' '),class:'guide'});$('guides').append(path);const a=project(...sel.path[sel.path.length-1]);$('guides').append(svg('circle',{cx:a[0],cy:a[1],r:3,fill:'#d5c194'}));}
      if(sel.id==='skylight')for(const u of [.35,.5,.65]){const a=project(u,.16),b=project(u,.32);$('guides').append(svg('path',{d:`M ${a} L ${b} l -4 -9 m 4 9 l 4 -9`,class:'guide'}));}
    }else $('leader').setAttribute('d','');
  }
  function createHotspots(){
    $('hotspots').replaceChildren();$('regions').replaceChildren();pins=[];polygons=[];
    for(const item of filtered()){
      const poly=svg('polygon',{class:'region'+(state.lens!=='all'?' filtered':''),points:'',tabindex:'-1'});
      poly.addEventListener('click',e=>{if(pointer&&pointer.distance>8)return;e.stopPropagation();selectObject(item.id);});
      poly.addEventListener('pointerenter',()=>poly.classList.add('hover'));poly.addEventListener('pointerleave',()=>poly.classList.remove('hover'));
      // Broad wall/floor regions stay behind small object masks in the document order.
      $('regions').append(poly);polygons.push({el:poly,item});
      const pin=document.createElement('button');pin.className='pin';pin.dataset.object=item.id;pin.setAttribute('aria-label',item.short);pin.setAttribute('aria-pressed','false');pin.innerHTML=`${item.code}<span class="tip">${htmlEscape(item.short)}</span>`;
      pin.addEventListener('pointerdown',e=>e.stopPropagation());pin.addEventListener('click',e=>{e.stopPropagation();selectObject(item.id);});
      pin.addEventListener('pointerenter',()=>poly.classList.add('hover'));pin.addEventListener('pointerleave',()=>poly.classList.remove('hover'));
      $('hotspots').append(pin);pins.push({el:pin,item});
    }
    // Put smaller masks on top so a chair remains selectable over a floor region.
    const area=p=>Math.abs(p.reduce((a,v,i)=>{const w=p[(i+1)%p.length];return a+v[0]*w[1]-w[0]*v[1];},0));
    polygons.sort((a,b)=>area(b.item.polygon)-area(a.item.polygon)).forEach(p=>$('regions').append(p.el));
    updateSelection();dirty=true;
  }
  function updateSelection(){pins.forEach(p=>{p.el.classList.toggle('active',p.item.id===state.selected);p.el.setAttribute('aria-pressed',String(p.item.id===state.selected));});polygons.forEach(p=>p.el.classList.toggle('active',p.item.id===state.selected));}
  function diagram(type){
    const line=(x1,y1,x2,y2)=>`<path class="draw" d="M${x1} ${y1}L${x2} ${y2}"/>`;
    const box=(x,y,w,h,c='soft')=>`<rect class="${c}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    const txt=(x,y,t)=>`<text class="label" x="${x}" y="${y}">${t}</text>`;
    let s='';
    if(type==='chair')s=`<path class="draw" d="M64 60V27Q65 19 74 27L83 48H119M80 48V66M119 48L124 66M67 35H106V48M153 52H213M153 52l7-4m-7 4l7 4M213 52l-7-4m7 4l-7 4"/>`+txt(45,81,'BODY SUPPORT')+txt(154,81,'PULL-BACK SPACE');
    else if(type==='table')s=box(48,23,42,42)+`<circle class="draw" cx="193" cy="44" r="25"/>`+[35,103].map(x=>`<circle class="green" cx="${x}" cy="44" r="6"/>`).join('')+txt(39,82,'RECTILINEAR')+txt(166,82,'RADIAL');
    else if(type==='banquette')s=`<path class="green" d="M45 65V20H255V65H244V31H56V65Z"/>`+box(72,40,44,15)+box(184,40,44,15)+`<circle class="draw" cx="94" cy="67" r="7"/><circle class="draw" cx="206" cy="67" r="7"/>`+txt(94,86,'EDGE + LOOSE SEATS');
    else if(type==='route')s=[48,204].map(x=>[20,46].map(y=>box(x,y,45,18)).join('')).join('')+`<path class="draw" stroke-dasharray="4 4" d="M150 74V16m0 0l-5 8m5-8l5 8"/>`+txt(105,87,'MOVEMENT BAND');
    else if(type==='section')s=`<path class="draw" d="M36 65V28H139V65M164 65V10H267V65"/>`+line(30,66,274,66)+txt(48,84,'ENCLOSURE')+txt(184,84,'RELEASE');
    else if(type==='rhythm'||type==='grain')s=Array.from({length:7},(_,i)=>type==='rhythm'?box(38+i*34,16,21,48):line(35,17+i*7,266,17+i*7)).join('')+txt(105,83,'REPETITION / UNITY');
    else if(type==='daylight'||type==='lighting')s=line(45,16,255,16)+[75,150,225].map(x=>`<path class="draw" d="M${x} 23v37m0 0l-5-8m5 8l5-8"/>`).join('')+txt(86,82,type==='daylight'?'OVERHEAD → DOWNWARD':'SOURCE → SURFACE');
    else if(type==='balance')s=line(150,12,150,65)+[60,210].map(x=>box(x,41,30,22)).join('')+line(45,67,255,67)+txt(84,84,'VISUAL WEIGHT / AXIS');
    else if(type==='biophilia')s=[0,1,2,3,4,5,6].map(i=>`<ellipse class="green" cx="${65+i*28}" cy="${34+(i%3)*9}" rx="14" ry="23" transform="rotate(${i%2?25:-25} ${65+i*28} ${34+(i%3)*9})"/>`).join('')+txt(89,84,'LAYER / TEXTURE / LIFE');
    else if(type==='materials')s=box(35,22,108,40)+box(157,22,108,40,'green')+line(150,15,150,70)+txt(52,84,'PALE MINERAL')+txt(184,84,'TIMBER');
    else s=`<path class="draw" d="M40 66L135 28M260 66L165 28"/><rect class="green" x="130" y="14" width="40" height="40"/>`+txt(102,84,'FRAMED EMPHASIS');
    return `<svg class="mini-diagram" viewBox="0 0 300 94" role="img" aria-label="${type} analytical principle diagram">${s}</svg><p class="mini-label">PRINCIPLE DIAGRAM · NOT MEASURED</p>`;
  }
  function renderInsight(){
    const sc=current(),obj=sc.hotspots.find(h=>h.id===state.selected),lens=D.lenses.find(l=>l[0]===state.lens);
    $('lensName').textContent=lens[1];
    if(obj){
      $('insightContent').innerHTML=`<button class="back" id="backToScene">← ${htmlEscape(sc.title)}</button><p class="insight-eyebrow">${htmlEscape(obj.tags[0])} / OBJECT ${obj.code}</p><h2>${htmlEscape(obj.title)}</h2><p class="reading">${htmlEscape(obj.reading)}</p><h4>Spatial rationale</h4><p class="rationale">${htmlEscape(obj.rationale)}</p>${diagram(obj.diagram)}<p class="boundary">${htmlEscape(obj.boundary)}</p><span class="evidence-tag">${htmlEscape(obj.evidence)}</span><div class="source-row"><button class="source-button" id="objectSource">Read the source evidence ↗</button><button class="source-button" id="objectPlan">Locate on plan ↗</button></div>`;
      $('backToScene').onclick=()=>selectObject(null);$('objectSource').onclick=()=>openMethod(obj.sources);$('objectPlan').onclick=()=>openPlan(obj.tags.includes('lighting')?'light':obj.tags.includes('furniture')?'seating':'zones');
    }else{
      $('insightContent').innerHTML=`<p class="insight-eyebrow">COMPOSITION ${sc.num} / 03</p><h2>${htmlEscape(sc.title)}</h2><p class="scene-subtitle">${htmlEscape(sc.subtitle)}</p><p class="scene-description">${htmlEscape(sc.description)}</p><div class="scene-metadata">${sc.overview.map(t=>`<span>${htmlEscape(t)}</span>`).join('')}</div><h4>${state.lens==='all'?'Select an object in the photograph':htmlEscape(lens[1])+' in this photograph'}</h4>`;
    }
    const list=filtered();$('objectList').innerHTML=list.map(o=>`<button data-select="${o.id}" class="${o.id===state.selected?'active':''}"><span><span class="object-number">${o.code}</span>${htmlEscape(o.short)}</span><span class="object-arrow">↗</span></button>`).join('');
    if(!list.length){const target=D.scenes.findIndex(s=>s.hotspots.some(h=>h.tags.includes(state.lens)));$('objectList').innerHTML=`<p class="boundary">This lens is best examined in another composition.</p><button id="relatedScene">Open ${htmlEscape(D.scenes[target].title)} →</button>`;$('relatedScene').onclick=()=>changeScene(target);}
    $('objectList').querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectObject(b.dataset.select));
    updateSelection();
  }
  function selectObject(id){
    state.selected=id;state.analysis=true;state.layers=false;syncControls();renderInsight();$('insight').scrollTop=0;dirty=true;
    if(id){const h=current().hotspots.find(h=>h.id===id);announce(h.title+'. '+h.reading);}
  }
  function setLens(lens){state.lens=lens;state.selected=null;state.analysis=true;syncControls();createHotspots();renderInsight();$('lensDialog').close();$('insight').scrollTop=0;announce(D.lenses.find(x=>x[0]===lens)[1]+' analysis selected.');}
  function sceneUI(){
    const sc=current();document.body.dataset.theme=sc.theme;$('frameTitle').textContent=sc.num+' / '+sc.title.toUpperCase();$('sceneCount').textContent=sc.num+' / 03';$('photoCredit').textContent=sc.credit;$('progressRail').firstElementChild.style.width=((state.index+1)/3*100)+'%';
    $('chapters').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('active',i===state.index);b.setAttribute('aria-current',i===state.index?'step':'false');});
    if(!state.webgl){$('fallback').src=A[sc.id+'-photo'];resize();}
    $('fallback').alt=sc.title+' at Emile Restaurant, photographed by Fernando Guerra';createHotspots();renderInsight();
  }
  function enter(){if(!models.length)return;state.entered=true;document.body.classList.remove('intro-active');$('intro').setAttribute('aria-hidden','true');$('enterButton').tabIndex=-1;$('stage').focus({preventScroll:true});resize();announce('Study opened. Select a numbered object to read its analysis.');}
  function home(){state.entered=false;state.selected=null;document.body.classList.add('intro-active');$('intro').removeAttribute('aria-hidden');$('enterButton').tabIndex=0;resize();$('enterButton').focus({preventScroll:true});}
  function changeScene(index){
    index=(index+D.scenes.length)%D.scenes.length;
    if(state.transition){state.pending=index;return;}if(index===state.index)return;
    if(!state.entered)enter();
    const old=state.index;state.index=index;state.selected=null;state.layers=false;state.drag={x:0,y:0};state.mouse={x:0,y:0};syncControls();sceneUI();
    if(state.webgl){models[old].group.visible=true;models[index].group.visible=true;state.transition={old,next:index,start:performance.now(),duration:reduced.matches?220:1450,direction:(index-old+3)%3===1?1:-1};document.body.classList.add('transitioning');}
    else{$('fallback').animate([{opacity:.3},{opacity:1}],{duration:reduced.matches?0:400});}
    announce('Composition '+current().num+': '+current().title);dirty=true;
  }
  function syncControls(){
    document.body.classList.toggle('analysis-off',!state.analysis);document.body.classList.toggle('layer-study',state.layers);document.body.classList.toggle('map-study',state.map);
    for(const [id,on] of [['analysisButton',state.analysis],['motionButton',state.motion],['mapButton',state.map],['layersButton',state.layers]]){$(id).setAttribute('aria-pressed',String(on));$(id).classList.toggle('active',on);}
    $('motionButton').textContent=state.motion?'Depth effect':'Original still';
    if(state.webgl){$('effectLabel').textContent=state.layers?'Separated depth bands · interpretive diagram':state.map?'AI depth map · white nearer / black farther':state.motion?'Estimated depth · gently move or drag':'Original photograph · stationary view';$('controlNote').textContent=state.layers?'Three optical depth bands. Empty gaps are not hidden architecture.':state.map?'This is the precomputed AI map, not measured distance.':state.motion?'Hover for parallax. Drag gently; quick touch swipes change scenes.':'Motion is off. Object analysis remains available.';}
    $('mapButton').disabled=!state.webgl;$('layersButton').disabled=!state.webgl;$('motionButton').disabled=!state.webgl;dirty=true;
  }
  function modalOpen(dialog){if(dialog.open)return;dialog.showModal();state.mouse={x:0,y:0};}
  function openMethod(ids=[]){modalOpen($('methodDialog'));$('sourceList').querySelectorAll('[data-source]').forEach(el=>el.style.background=ids.includes(el.dataset.source)?'#cdb68e18':'');if(ids.length)$('sourceList').scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});}
  let planMode='zones',fullPlan=false;
  function openPlan(mode='zones'){planMode=mode;fullPlan=false;renderPlan();modalOpen($('planDialog'));}
  function renderPlan(){
    $('planImage').setAttribute('href',A['ground-floor']);$('planSvg').setAttribute('viewBox',fullPlan?'390 220 1120 1110':'425 253 753 284');$('planExtent').textContent=fullPlan?'Focus on restaurant':'Show full floor';
    document.querySelectorAll('[data-plan]').forEach(b=>b.classList.toggle('active',b.dataset.plan===planMode));
    const main='689,275 1020,287 1010,485 680,470',garden='461,270 689,275 680,470 452,459';
    const poly=(p,col,opacity=.16)=>`<polygon points="${p}" fill="${col}" fill-opacity="${opacity}" stroke="${col}" stroke-width="1.6"/>`;
    const circle=(x,y,r,col)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" fill-opacity=".2" stroke="${col}" stroke-width="1.5"/>`;
    let s='',leg=[],explain='';
    if(planMode==='zones'){
      s=poly(main,'#a66540')+poly(garden,'#54765b')+`<path d="M1080 380L1014 377 994 400 920 406 702 405 650 402" fill="none" stroke="#3b7d80" stroke-width="3"/><path d="M650 402l14-6-1 13Z" fill="#3b7d80"/>`;
      leg=[['#a66540','Timber dining room'],['#54765b','Garden dining room'],['#3b7d80','Interpreted guest sequence']];explain='The public approach leads to the timber room, then toward the garden. The route is an interpretation of the drawing.';
    }else if(planMode==='seating'){
      s=poly(main,'#3b7d80',.1)+poly(garden,'#ab7658',.1)+poly('475,284 676,290 675,305 490,300 485,431 672,441 671,455 468,446','#54765b',.32);
      s+=`<text x="830" y="384" fill="#255d60" font-size="19" font-family="Arial">A + B</text><text x="570" y="381" fill="#8b5235" font-size="18" font-family="Arial">C</text><text x="474" y="420" fill="#35553b" font-size="15" font-family="Arial">D</text>`;
      leg=[['#3b7d80','A + B: main-room loose chairs'],['#ab7658','C: garden loose armchairs'],['#54765b','D: perimeter banquette']];explain='3 physical seating forms; 4 analytical finish/location configurations. The plan does not identify individual chair models.';
    }else if(planMode==='tables'){
      [[780,304],[846,307],[913,309],[978,313],[769,436],[836,439],[903,443],[970,447]].forEach(([x,y])=>{s+=`<rect x="${x-12}" y="${y-12}" width="24" height="24" fill="#a6654033" stroke="#a66540" stroke-width="1.4"/>`;});
      [[734,370],[809,374],[960,381]].forEach(([x,y])=>s+=circle(x,y,14,'#3b7d80'));s+=circle(885,378,24,'#ab883c');
      leg=[['#a66540','8 square dining tables'],['#3b7d80','3 round dining tables'],['#ab883c','1 central display table']];explain='Main-room plan count: 11 dining tables + 1 display. The factsheet names 5 table variants across both rooms: Universal square, Universal round, Niemeyer, F-Knoll oval and F-Knoll round. The two garden variants are not confidently matched to the photographs.';
    }else{
      s=poly(garden,'#a58740',.13)+`<path d="M706 283L1018 292M706 476L1018 486" stroke="#a58740" stroke-width="3"/><path d="M850 342V430m0 0l-5-9m5 9l5-9" stroke="#a58740" stroke-width="2"/>`;[[490,320],[555,320],[620,320]].forEach(([x,y])=>s+=circle(x,y,9,'#a58740'));
      leg=[['#a58740','Garden: overhead daylight'],['#a58740','Timber room: ceiling + wall-light layers']];explain='Diagrammatic lighting zones. These symbols do not locate actual fixtures and are not an original reflected-ceiling plan.';
    }
    $('planOverlay').innerHTML=`<g transform="scale(${2000/1888},${1414/1334})">${s}</g>`;
    $('planLegend').innerHTML=leg.map(([c,t])=>`<span style="--swatch:${c}">${t}</span>`).join('');$('planExplanation').textContent=explain;
  }
  function bindUI(){
    $('enterButton').onclick=enter;$('homeButton').onclick=home;$('nextButton').onclick=()=>changeScene(state.index+1);$('prevButton').onclick=()=>changeScene(state.index-1);
    $('chapters').innerHTML=D.scenes.map((s,i)=>`<button data-scene="${i}" aria-label="Open ${s.title}"><span>${s.num}</span>${s.id==='timber'?'Timber':s.id==='garden'?'Garden':'Threshold'}</button>`).join('');$('chapters').querySelectorAll('button').forEach(b=>b.onclick=()=>changeScene(+b.dataset.scene));
    $('analysisButton').onclick=()=>{state.analysis=!state.analysis;syncControls();};
    $('motionButton').onclick=()=>{state.motion=!state.motion;state.layers=false;state.drag={x:0,y:0};state.mouse={x:0,y:0};syncControls();};
    $('mapButton').onclick=()=>{state.map=!state.map;syncControls();};
    $('layersButton').onclick=()=>{state.layers=!state.layers;if(state.layers)state.motion=true;syncControls();};
    $('lensButton').onclick=()=>{const counts=l=>current().hotspots.filter(h=>l==='all'||h.tags.includes(l)).length;$('lensOptions').innerHTML=D.lenses.map(([id,name])=>`<button data-lens="${id}" class="${id===state.lens?'active':''}">${name}<span>${counts(id).toString().padStart(2,'0')}</span></button>`).join('');$('lensOptions').querySelectorAll('button').forEach(b=>b.onclick=()=>setLens(b.dataset.lens));modalOpen($('lensDialog'));};
    $('planButton').onclick=()=>openPlan();$('methodButton').onclick=()=>openMethod();
    document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
    document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>{planMode=b.dataset.plan;renderPlan();});$('planExtent').onclick=()=>{fullPlan=!fullPlan;renderPlan();};
    $('sourceList').innerHTML=D.sources.map(s=>`<div data-source="${s.id}"><a href="${s.url}" target="_blank" rel="noopener noreferrer">${htmlEscape(s.name)} ↗</a><p>${htmlEscape(s.role)}</p></div>`).join('');
    $('fullButton').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){announce('Fullscreen is not available in this browser.');}};
    document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]'))return;if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const k=e.key.toLowerCase();if(k==='arrowright'){e.preventDefault();changeScene(state.index+1);}else if(k==='arrowleft'){e.preventDefault();changeScene(state.index-1);}else if(k==='a')$('analysisButton').click();else if(k==='m')$('motionButton').click();else if(k==='p')openPlan();else if(k==='f')$('fullButton').click();else if(k==='escape')selectObject(null);});
    const stage=$('stage');
    stage.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,start:performance.now(),distance:0,type:e.pointerType,dragX:state.drag.x,dragY:state.drag.y};});
    stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect();if(e.pointerType!=='touch')state.mouse={x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2};if(pointer&&pointer.id===e.pointerId){const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer.distance=Math.hypot(dx,dy);if(pointer.distance>5&&!stage.hasPointerCapture(e.pointerId))stage.setPointerCapture(e.pointerId);state.drag.x=M.clamp(pointer.dragX+dx/r.width*.55,-.14,.14);state.drag.y=M.clamp(pointer.dragY-dy/r.height*.4,-.09,.09);}dirty=true;});
    const endPointer=e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,elapsed=performance.now()-pointer.start;if(pointer.type==='touch'&&Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.5&&elapsed<500)changeScene(state.index+(dx<0?1:-1));if(pointer.distance>8){const cancelled=pointer;setTimeout(()=>{if(pointer===cancelled)pointer=null;},0);}else pointer=null;state.drag.x*=.6;state.drag.y*=.6;};
    stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',()=>{pointer=null;state.drag={x:0,y:0};dirty=true;});stage.addEventListener('pointerleave',()=>{if(!pointer){state.mouse={x:0,y:0};state.drag={x:0,y:0};dirty=true;}});
    reduced.addEventListener('change',e=>{if(e.matches){state.motion=false;state.layers=false;syncControls();}});
    document.addEventListener('visibilitychange',()=>{lastTime=performance.now();});
    new ResizeObserver(resize).observe(stage);
  }
  function tick(time){
    requestAnimationFrame(tick);if(document.hidden||!models.length)return;
    const dt=Math.min((time-lastTime)/1000||.016,.05);lastTime=time;
    const lerp=1-Math.exp(-dt*5.5),canMove=state.motion&&!reduced.matches&&!document.querySelector('dialog[open]');
    const tx=canMove?M.clamp(state.mouse.x*.12+state.drag.x,-.24,.24):0,ty=canMove?M.clamp(state.mouse.y*.07+state.drag.y,-.14,.14):0;
    const moving=Math.abs(tx-state.aim.x)+Math.abs(ty-state.aim.y)+Math.abs((state.motion?1:0)-state.strength)+Math.abs((state.layers?1:0)-state.layer)>.00002;
    if(!dirty&&!state.transition&&!moving)return;
    state.aim.x+=(tx-state.aim.x)*lerp;state.aim.y+=(ty-state.aim.y)*lerp;
    state.strength+=((state.motion?1:0)-state.strength)*lerp;state.layer+=((state.layers?1:0)-state.layer)*lerp;
    if(reduced.matches){state.strength=state.motion?1:0;state.layer=state.layers?1:0;}
    if(state.webgl){
      camera.position.set(state.aim.x,state.aim.y,4.8);camera.lookAt(0,0,.12);camera.updateMatrixWorld();
      models.forEach((model,i)=>{
        if(!model.group.visible)return;
        model.group.position.set(0,0,0);model.group.rotation.set(0,-.065*state.layer,0);
        model.meshes.forEach((mesh,j)=>{mesh.position.set((j-1)*.12*state.layer,0,(j-1)*.32*state.layer);const u=mesh.material.uniforms;u.uStrength.value=state.strength;u.uShowMap.value=state.map?1:0;u.uReveal.value=1.2;u.uOpacity.value=1;mesh.renderOrder=(i===state.index?10:0)+j;});
      });
      if(state.transition){
        const t=state.transition,q=M.clamp((time-t.start)/t.duration),e=M.ease(q),old=models[t.old],next=models[t.next];
        if(reduced.matches){old.meshes.forEach(m=>m.material.uniforms.uOpacity.value=1-q);next.meshes.forEach(m=>m.material.uniforms.uOpacity.value=q);}
        else{
          old.group.position.x=-t.direction*.09*e;old.group.rotation.y=-t.direction*.035*e;
          next.group.position.x=t.direction*.10*(1-e);next.group.rotation.y=t.direction*.035*(1-e);
          old.meshes.forEach((m,j)=>{m.position.z=(j-1)*.16*Math.sin(Math.PI*q);m.position.x=t.direction*(j-1)*.025*Math.sin(Math.PI*q);m.material.uniforms.uReveal.value=1.2-1.4*M.smooth(q/.85);m.material.uniforms.uOpacity.value=1-M.smooth((q-.65)/.35);});
          next.meshes.forEach((m,j)=>{m.position.z=(j-1)*.16*Math.sin(Math.PI*q);m.material.uniforms.uReveal.value=-.2+1.4*M.smooth((q-.15)/.85);});
        }
        if(q>=1){old.group.visible=false;next.group.position.set(0,0,0);next.group.rotation.set(0,0,0);next.meshes.forEach(m=>{m.position.set(0,0,0);m.material.uniforms.uReveal.value=1.2;m.material.uniforms.uOpacity.value=1;});state.transition=null;document.body.classList.remove('transitioning');const pending=state.pending;state.pending=null;if(pending!==null&&pending!==state.index)changeScene(pending);}
      }
      scene.updateMatrixWorld(true);renderer.render(scene,camera);
    }
    updateOverlay();dirty=false;
  }
  async function init(){
    try{
      bindUI();setupRenderer();models=await Promise.all(D.scenes.map(makeModel));
      if(state.webgl)models[0].group.visible=true;resize();sceneUI();syncControls();$('loadNotice').hidden=true;$('enterButton').disabled=false;$('enterButton').firstElementChild.textContent='Explore the interior';requestAnimationFrame(tick);
      window.EMILE_DEBUG={state,models,project,changeScene,setLens,selectObject,vertexShader,fragmentShader};
    }catch(e){$('loadNotice').textContent='The study could not load. Extract the complete ZIP, then open START_EMILE.cmd. '+e.message;console.error(e);}
  }
  init();
})();
