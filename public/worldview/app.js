import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/+esm";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js/+esm";
import { STAGES, PRINCIPLES, EVIDENCE, THREAD } from "./data.js";

const els={
  scaleButtons:document.getElementById("scaleButtons"),
  stepNumber:document.getElementById("stepNumber"),
  stepTotal:document.getElementById("stepTotal"),
  fieldLabel:document.getElementById("fieldLabel"),
  stageTitle:document.getElementById("stageTitle"),
  stageScale:document.getElementById("stageScale"),
  stagePrompt:document.getElementById("stagePrompt"),
  storyPanel:document.getElementById("storyPanel"),
  bridgeText:document.getElementById("bridgeText"),
  cautionText:document.getElementById("cautionText"),
  sceneTitle:document.getElementById("sceneTitle"),
  principleList:document.getElementById("principleList"),
  principleTrace:document.getElementById("principleTrace"),
  prevStage:document.getElementById("prevStage"),
  nextStage:document.getElementById("nextStage"),
  resetCamera:document.getElementById("resetCamera"),
  toggleMotion:document.getElementById("toggleMotion"),
  stage3d:document.getElementById("stage3d"),
  threadThesis:document.getElementById("threadThesis")
};

let stageIndex=0;
let layer="mechanism";
let selectedPrinciple=null;
let autoMotion=false;

els.stepTotal.textContent="/ "+String(STAGES.length).padStart(2,"0");
els.threadThesis.textContent=THREAD.thesis+" "+THREAD.warning;

const scaleButtons=STAGES.map((s,i)=>{
  const b=document.createElement("button");
  b.type="button";
  b.className="scale-button";
  b.innerHTML="<span>"+escapeHtml(s.title)+"</span><span>"+escapeHtml(s.scale)+"</span>";
  b.addEventListener("click",()=>goTo(i));
  els.scaleButtons.appendChild(b);
  return b;
});

const principleButtons=new Map();
Object.entries(PRINCIPLES).forEach(([id,p])=>{
  const b=document.createElement("button");
  b.type="button";
  b.className="principle-button";
  b.innerHTML="<span>"+escapeHtml(p.label)+"</span><span>сквозной вопрос</span>";
  b.addEventListener("click",()=>selectPrinciple(id));
  els.principleList.appendChild(b);
  principleButtons.set(id,b);
});

document.querySelectorAll(".layer-tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    layer=btn.dataset.layer;
    document.querySelectorAll(".layer-tab").forEach(x=>x.classList.toggle("is-active",x===btn));
    renderStory();
  });
});

els.prevStage.addEventListener("click",()=>goTo(stageIndex-1));
els.nextStage.addEventListener("click",()=>goTo(stageIndex+1));
els.resetCamera.addEventListener("click",()=>resetCamera());
els.toggleMotion.addEventListener("click",()=>{
  autoMotion=!autoMotion;
  controls.autoRotate=autoMotion;
  els.toggleMotion.textContent="Медленное вращение: "+(autoMotion?"вкл.":"выкл.");
  els.toggleMotion.setAttribute("aria-pressed",String(autoMotion));
});

function goTo(next){
  stageIndex=Math.max(0,Math.min(STAGES.length-1,next));
  selectedPrinciple=null;
  renderAll();
  rebuildVisual(STAGES[stageIndex]);
  resetCamera();
  scaleButtons[stageIndex]?.scrollIntoView({behavior:prefersReduced?"auto":"smooth",inline:"center",block:"nearest"});
}

function renderAll(){
  const s=STAGES[stageIndex];
  els.stepNumber.textContent=String(stageIndex+1).padStart(2,"0");
  els.fieldLabel.textContent=s.field;
  els.stageTitle.textContent=s.title;
  els.stageScale.textContent=s.scale;
  els.stagePrompt.textContent=s.prompt;
  els.bridgeText.textContent=s.bridge;
  els.cautionText.textContent=s.caution;
  els.sceneTitle.textContent=s.title;
  els.prevStage.disabled=stageIndex===0;
  els.nextStage.disabled=stageIndex===STAGES.length-1;
  els.prevStage.textContent=stageIndex===0?"← Приблизиться":("← "+STAGES[stageIndex-1].title);
  els.nextStage.textContent=stageIndex===STAGES.length-1?"Маршрут пройден":(STAGES[stageIndex+1].title+" →");
  scaleButtons.forEach((b,i)=>b.classList.toggle("is-active",i===stageIndex));
  principleButtons.forEach((b,id)=>{
    b.classList.toggle("is-present",s.principles.includes(id));
    b.classList.toggle("is-selected",id===selectedPrinciple);
    const count=STAGES.filter(x=>x.principles.includes(id)).length;
    b.lastElementChild.textContent=s.principles.includes(id)?"есть здесь":count+"/"+STAGES.length;
  });
  renderStory();
  renderPrincipleTrace();
}

function renderStory(){
  const s=STAGES[stageIndex];
  if(layer==="mechanism"){
    els.storyPanel.innerHTML=
      '<div class="evidence-badge">'+escapeHtml(EVIDENCE[s.evidence]?.label||"Научное знание")+'</div>'+
      '<div class="fact-grid">'+
      fact("Целое",s.whole)+fact("Части",s.parts)+fact("Что связывает",s.binds)+
      fact("Что проходит",s.flow)+fact("Как сохраняется",s.stability)+fact("Что возникает нового",s.emergence)+
      '</div>';
    return;
  }
  if(layer==="principle"){
    const chips=s.principles.map(id=>'<span class="principle-chip">'+escapeHtml(PRINCIPLES[id].label)+'</span>').join("");
    els.storyPanel.innerHTML=
      '<div class="principle-chips">'+chips+'</div>'+
      '<div class="principle-copy"><p>'+escapeHtml(s.bridge)+'</p><p><strong>Проверка:</strong> выбери любой принцип справа — карта покажет, на каких ещё масштабах он встречается.</p></div>';
    return;
  }
  if(layer==="source"){
    els.storyPanel.innerHTML=
      '<div class="source-list">'+s.sources.map(src=>
        '<div class="source-card"><strong>'+escapeHtml(src.label)+'</strong><p>'+escapeHtml(src.note)+'</p></div>'
      ).join("")+
      '<div class="source-card"><strong>Правило источников</strong><p>Следующая версия будет хранить страницу или конкретный фрагмент для каждого содержательного утверждения из нашей библиотеки. Общенаучные утверждения будут отделены от авторских концепций.</p></div>'+
      '</div>';
    return;
  }
  els.storyPanel.innerHTML=
    '<div class="meaning-card"><p>'+escapeHtml(s.worldview)+'</p><small>Это вопрос для философского и богословского слоя. Ответ на него не выводится автоматически из научного механизма.</small></div>';
}

function fact(label,text){
  return '<div class="fact-item"><b>'+escapeHtml(label)+'</b><p>'+escapeHtml(text)+'</p></div>';
}

function selectPrinciple(id){
  selectedPrinciple=selectedPrinciple===id?null:id;
  renderAll();
  if(selectedPrinciple)layerHighlight(selectedPrinciple); else clearLayerHighlight();
}

function renderPrincipleTrace(){
  if(!selectedPrinciple){
    els.principleTrace.innerHTML='<p class="trace-kicker">Выбери принцип</p><p>Например, «Связь» покажет, на каких уровнях этот вопрос проявляется и где механизмы уже различаются.</p>';
    return;
  }
  const p=PRINCIPLES[selectedPrinciple];
  const stages=STAGES.filter(s=>s.principles.includes(selectedPrinciple));
  els.principleTrace.innerHTML=
    '<p class="trace-kicker">'+escapeHtml(p.label)+'</p>'+
    '<p><strong>'+escapeHtml(p.question)+'</strong></p>'+
    '<p>'+escapeHtml(p.note)+'</p>'+
    '<div class="trace-stages">'+stages.map(s=>'<span class="trace-stage">'+escapeHtml(s.title)+'</span>').join("")+'</div>';
}

function escapeHtml(v){
  return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
}

// 3D
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x030610);
scene.fog=new THREE.FogExp2(0x030610,.018);
const camera=new THREE.PerspectiveCamera(46,1,.1,160);
camera.position.set(10,7,14);

const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
els.stage3d.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.07;
controls.enablePan=false;
controls.autoRotate=false;
controls.autoRotateSpeed=.35;
controls.minDistance=5;
controls.maxDistance=30;

scene.add(new THREE.HemisphereLight(0x8ab7ff,0x101528,1.5));
const key=new THREE.PointLight(0xc7dcff,3,80);key.position.set(8,10,12);scene.add(key);
const warm=new THREE.PointLight(0xffd08a,1.8,60);warm.position.set(-8,-4,8);scene.add(warm);

const world=new THREE.Group();
scene.add(world);
const background=new THREE.Group();
scene.add(background);
createStarfield();

function clearGroup(group){
  while(group.children.length){
    const obj=group.children.pop();
    obj.traverse?.(o=>{
      o.geometry?.dispose?.();
      if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.()); else o.material?.dispose?.();
    });
  }
}

function mat(color,opts={}){
  const m=new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.08,...opts});
  m.userData.baseEmissiveIntensity=m.emissiveIntensity||0;
  return m;
}
function sphere(r,color,pos=[0,0,0],opts={}){
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,32,22),mat(color,opts));
  m.position.set(...pos);world.add(m);return m;
}
function line(points,color=0x5d79ad,opacity=.55){
  const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:true,opacity}));
  world.add(l);return l;
}
function ring(r,color=0x5276a7,opacity=.35,rot=[Math.PI/2,0,0]){
  const g=new THREE.TorusGeometry(r,.018,8,100);
  const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity});
  const t=new THREE.Mesh(g,m);t.rotation.set(...rot);world.add(t);return t;
}
function dotNetwork(count,radius){
  const pts=[];
  for(let i=0;i<count;i++){
    const p=randomSpherePoint(radius*(.4+.6*Math.random()));
    pts.push(p);
    sphere(.12, i%3===0?0xe1bd70:0x6ba8d9,p,{emissive:i%3===0?0x5b4313:0x102b55,emissiveIntensity:.35});
  }
  for(let i=0;i<count*1.4;i++){
    const a=pts[Math.floor(Math.random()*pts.length)],b=pts[Math.floor(Math.random()*pts.length)];
    if(a!==b && distance(a,b)<radius*1.45)line([a,b],0x4b6f9e,.24);
  }
}
function randomSpherePoint(r){
  const u=Math.random(),v=Math.random();
  const theta=2*Math.PI*u,phi=Math.acos(2*v-1);
  return [r*Math.sin(phi)*Math.cos(theta),r*Math.cos(phi),r*Math.sin(phi)*Math.sin(theta)];
}
function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}

function rebuildVisual(s){
  clearGroup(world);
  clearLayerHighlight();
  world.rotation.set(0,0,0);
  if(s.visual==="atom")drawAtom();
  if(s.visual==="molecule")drawMolecule();
  if(s.visual==="cell")drawCell();
  if(s.visual==="organism")drawOrganism();
  if(s.visual==="ecosystem")drawEcosystem();
  if(s.visual==="biosphere")drawBiosphere();
  if(s.visual==="solar")drawSolar();
  if(s.visual==="galaxy")drawGalaxy();
  if(s.visual==="universe")drawUniverse();
}

function drawAtom(){
  sphere(.72,0xd3a85e,[-.38,0,0],{emissive:0x5a3511,emissiveIntensity:.5});
  sphere(.72,0x7695c8,[.42,.08,0],{emissive:0x142d59,emissiveIntensity:.45});
  const cloud=new THREE.Mesh(new THREE.SphereGeometry(4.3,40,26),new THREE.MeshBasicMaterial({color:0x68aef0,transparent:true,opacity:.055,wireframe:true}));
  world.add(cloud);
  const cloud2=cloud.clone();cloud2.scale.set(.72,.72,.72);cloud2.rotation.set(.4,.7,0);world.add(cloud2);
  for(let i=0;i<70;i++){const p=randomSpherePoint(2.3+Math.random()*2);sphere(.035,0x9bd3ff,p,{emissive:0x3c83c4,emissiveIntensity:1});}
}
function drawMolecule(){
  const pts=[[-2.1,0,0],[0,0,0],[1.8,1.35,.35],[1.8,-1.35,-.35],[0,2.1,-.3]];
  const cols=[0x7ea6d9,0xd9b35f,0x76a2d5,0x76a2d5,0xb487d9];
  pts.forEach((p,i)=>sphere(i===1?1.05:.8,cols[i],p,{emissive:cols[i],emissiveIntensity:.12}));
  [[0,1],[1,2],[1,3],[1,4]].forEach(([a,b])=>{const A=new THREE.Vector3(...pts[a]),B=new THREE.Vector3(...pts[b]);cylinderBetween(A,B,.13,0x607ca8)});
}
function cylinderBetween(a,b,r,color){
  const d=b.clone().sub(a),len=d.length(),mid=a.clone().add(b).multiplyScalar(.5);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,len,16),mat(color));
  m.position.copy(mid);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());world.add(m);return m;
}
function drawCell(){
  sphere(4.1,0x356b87,[0,0,0],{transparent:true,opacity:.18,roughness:.2,side:THREE.DoubleSide});
  sphere(1.35,0xa17bc8,[-.7,.3,.2],{transparent:true,opacity:.78,emissive:0x39214c,emissiveIntensity:.4});
  for(let i=0;i<11;i++){
    const p=randomSpherePoint(2.5*Math.random()+.7);
    const o=sphere(.22+.16*Math.random(),i%2?0x72b9a1:0xe0b35f,p,{emissive:i%2?0x173d35:0x4d3612,emissiveIntensity:.35});
    o.scale.set(1.5,.7,.8);
  }
  for(let i=0;i<7;i++){const p=randomSpherePoint(3.4);sphere(.07,0x9bd2ff,p,{emissive:0x4b96cf,emissiveIntensity:.8});}
}
function drawOrganism(){
  const core=sphere(3.8,0x28466f,[0,0,0],{transparent:true,opacity:.13,side:THREE.DoubleSide});
  const organs=[[-1.4,1.2,.4],[1.4,1,.2],[-1.2,-1.2,.4],[1.1,-1.3,.2],[0,.2,1.5],[0,.1,-1.6]];
  organs.forEach((p,i)=>sphere(.65,i%2?0xd3a85e:0x75a6d9,p,{emissive:i%2?0x483310:0x17365b,emissiveIntensity:.32}));
  for(let i=0;i<organs.length;i++)for(let j=i+1;j<organs.length;j++)if((i+j)%2===0)line([organs[i],organs[j]],0x7198c8,.38);
  const loop=[];for(let i=0;i<=80;i++){const a=i/80*Math.PI*2;loop.push([2.5*Math.cos(a),1.3*Math.sin(a),.7*Math.sin(a*2)])}
  line(loop,0xc98b83,.65);
}
function drawEcosystem(){
  dotNetwork(38,4.3);
  const ground=new THREE.Mesh(new THREE.CircleGeometry(4.8,64),new THREE.MeshStandardMaterial({color:0x182d31,transparent:true,opacity:.55,side:THREE.DoubleSide}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-3.2;world.add(ground);
  for(let i=0;i<9;i++){const x=-3.5+Math.random()*7,z=-2.8+Math.random()*5.6;const h=.6+Math.random()*1.7;const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,h,8),mat(0x79634a));trunk.position.set(x,-3.2+h/2,z);world.add(trunk);sphere(.25+.2*Math.random(),0x55866b,[x,-3.2+h,z],{emissive:0x143425,emissiveIntensity:.25});}
}
function drawBiosphere(){
  sphere(3.65,0x356c9b,[0,0,0],{roughness:.65,emissive:0x102743,emissiveIntensity:.35});
  const landMat=new THREE.MeshBasicMaterial({color:0x6d9a6e,transparent:true,opacity:.68});
  for(let i=0;i<28;i++){const p=randomSpherePoint(3.69);const m=new THREE.Mesh(new THREE.SphereGeometry(.18+.18*Math.random(),10,8),landMat);m.position.set(...p);m.scale.set(1.8,.55,1);m.lookAt(0,0,0);world.add(m);}
  const atmos=new THREE.Mesh(new THREE.SphereGeometry(4.05,40,28),new THREE.MeshBasicMaterial({color:0x85c9ff,transparent:true,opacity:.08,side:THREE.BackSide}));world.add(atmos);
  for(let i=0;i<14;i++){const a=randomSpherePoint(3.85),b=randomSpherePoint(3.85);line([a,b],0x78c89b,.16);}
}
function drawSolar(){
  sphere(1.55,0xf1c56b,[0,0,0],{emissive:0xf0a82c,emissiveIntensity:1.8});
  const radii=[2.5,3.4,4.5,5.7,7.2];
  radii.forEach((r,i)=>{
    ring(r,0x54729e,.25,[Math.PI/2,.05*i,.12*i]);
    const a=.7+i*.85;
    const p=[r*Math.cos(a),0,r*Math.sin(a)];
    sphere(.18+i*.06,i===2?0x6fa5cb:0xa4a8b6,p,{emissive:0x17243b,emissiveIntensity:.25});
  });
}
function drawGalaxy(){
  sphere(.45,0xf4d68c,[0,0,0],{emissive:0xffc857,emissiveIntensity:2});
  const arms=4;
  for(let i=0;i<1100;i++){
    const arm=i%arms;
    const r=Math.pow(Math.random(),.58)*6.5;
    const a=arm*(Math.PI*2/arms)+r*.72+(Math.random()-.5)*.5;
    const y=(Math.random()-.5)*.55*(1-r/7);
    const p=[r*Math.cos(a),y,r*Math.sin(a)];
    sphere(.018+Math.random()*.035,i%13===0?0xeac077:0x8fb8e8,p,{emissive:0x42628a,emissiveIntensity:.6});
  }
}
function drawUniverse(){
  dotNetwork(85,6.5);
  for(let i=0;i<6;i++){
    const pts=[];for(let j=0;j<18;j++){const t=j/17;pts.push([-6+12*t,Math.sin(t*6+i)*2.2+(i-2.5)*.45,Math.cos(t*5+i)*2.4]);}
    line(pts,0x5b78a7,.2);
  }
}

function layerHighlight(id){
  clearLayerHighlight();
  world.traverse(o=>{
    const m=o.material;
    if(m && "emissiveIntensity" in m){
      const base=m.userData?.baseEmissiveIntensity ?? m.emissiveIntensity ?? 0;
      m.emissiveIntensity=Math.min(1.1,base+.18);
    }
  });
}
function clearLayerHighlight(){
  world.traverse(o=>{
    const m=o.material;
    if(m && "emissiveIntensity" in m && m.userData?.baseEmissiveIntensity!==undefined){
      m.emissiveIntensity=m.userData.baseEmissiveIntensity;
    }
  });
}

function createStarfield(){
  const count=750,arr=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const p=randomSpherePoint(35+Math.random()*35);
    arr.set(p,i*3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(arr,3));
  const m=new THREE.PointsMaterial({size:.08,color:0x6d7f9f,transparent:true,opacity:.6,depthWrite:false});
  background.add(new THREE.Points(g,m));
}

function resetCamera(){
  camera.position.set(10,7,14);
  controls.target.set(0,0,0);
}

function resize(){
  const w=Math.max(1,els.stage3d.clientWidth),h=Math.max(1,els.stage3d.clientHeight);
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
window.addEventListener("resize",resize);
const prefersReduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if(prefersReduced){autoMotion=false;controls.autoRotate=false;}
resize();
rebuildVisual(STAGES[0]);
renderAll();

renderer.setAnimationLoop(()=>{
  controls.update();
  renderer.render(scene,camera);
});
