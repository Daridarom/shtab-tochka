import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js";
import { NODES, LINKS, EVIDENCE } from "./data.js";

const stage=document.getElementById("stage");
const searchInput=document.getElementById("searchInput");
const evidenceFilter=document.getElementById("evidenceFilter");
const detailPanel=document.getElementById("detailPanel");
const detailType=document.getElementById("detailType");
const detailTitle=document.getElementById("detailTitle");
const detailSummary=document.getElementById("detailSummary");
const detailMeta=document.getElementById("detailMeta");
const detailLinks=document.getElementById("detailLinks");
const detailSource=document.getElementById("detailSource");
const resetView=document.getElementById("resetView");
const toggleRotate=document.getElementById("toggleRotate");
const closePanel=document.getElementById("closePanel");

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x050816);
scene.fog=new THREE.FogExp2(0x050816,.007);

const camera=new THREE.PerspectiveCamera(52,1,.1,300);
camera.position.set(34,28,46);

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.dampingFactor=.06;
controls.autoRotate=true;
controls.autoRotateSpeed=.42;
controls.minDistance=8;
controls.maxDistance=95;
controls.target.set(-1,5,9);

scene.add(new THREE.HemisphereLight(0x8ab7ff,0x11172b,1.2));
const key=new THREE.PointLight(0xa6c9ff,2.4,120);
key.position.set(18,20,22);
scene.add(key);
const warm=new THREE.PointLight(0xffc878,1.7,90);
warm.position.set(-18,-8,16);
scene.add(warm);

const colors={
  scale:0x62b8ff,
  principle:0xf5c76b,
  source:0xb294ff
};
const evidenceColors={
  fact:0x6fe0a4,
  model:0x64b7ff,
  worldview:0xe6bd69,
  hypothesis:0xe58ea9
};

const nodeById=new Map(NODES.map(n=>[n.id,n]));
const meshById=new Map();
const labelById=new Map();
const edgeObjects=[];
const visibleIds=new Set(NODES.map(n=>n.id));
let selectedId=null;

function makeTextSprite(text,color="#eef5ff"){
  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");
  const dpr=2;
  ctx.font="700 28px Inter, Arial, sans-serif";
  const w=Math.ceil(ctx.measureText(text).width)+34;
  canvas.width=w*dpr;canvas.height=52*dpr;
  ctx.scale(dpr,dpr);
  ctx.font="700 28px Inter, Arial, sans-serif";
  ctx.fillStyle="rgba(5,8,22,.72)";
  roundRect(ctx,0,2,w,46,12);ctx.fill();
  ctx.strokeStyle="rgba(160,188,238,.18)";ctx.lineWidth=1;
  roundRect(ctx,.5,2.5,w-1,45,12);ctx.stroke();
  ctx.fillStyle=color;ctx.textBaseline="middle";ctx.fillText(text,17,25);
  const tex=new THREE.CanvasTexture(canvas);
  tex.colorSpace=THREE.SRGBColorSpace;
  tex.minFilter=THREE.LinearFilter;
  const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false});
  const sprite=new THREE.Sprite(mat);
  sprite.scale.set(w/18,52/18,1);
  sprite.userData.isLabel=true;
  return sprite;
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}

const nodeGroup=new THREE.Group();
scene.add(nodeGroup);

NODES.forEach(n=>{
  const radius=n.type==="source"?.72:n.type==="principle"?.82:n.id==="universe"?1.28:1;
  const geom=new THREE.SphereGeometry(radius,30,20);
  const mat=new THREE.MeshStandardMaterial({
    color:colors[n.type],
    emissive:evidenceColors[n.evidence],
    emissiveIntensity:.18,
    roughness:.38,
    metalness:.18,
    transparent:true,
    opacity:.96
  });
  const mesh=new THREE.Mesh(geom,mat);
  mesh.position.fromArray(n.pos);
  mesh.userData.nodeId=n.id;
  nodeGroup.add(mesh);
  meshById.set(n.id,mesh);

  const haloGeom=new THREE.RingGeometry(radius*1.38,radius*1.55,48);
  const haloMat=new THREE.MeshBasicMaterial({color:evidenceColors[n.evidence],transparent:true,opacity:.46,side:THREE.DoubleSide,depthWrite:false});
  const halo=new THREE.Mesh(haloGeom,haloMat);
  halo.lookAt(camera.position);
  mesh.add(halo);
  mesh.userData.halo=halo;

  const label=makeTextSprite(n.label);
  label.position.copy(mesh.position).add(new THREE.Vector3(0,radius+1.15,0));
  nodeGroup.add(label);
  labelById.set(n.id,label);
});

LINKS.forEach(link=>{
  const a=nodeById.get(link.source),b=nodeById.get(link.target);
  if(!a||!b)return;
  const pts=[new THREE.Vector3(...a.pos),new THREE.Vector3(...b.pos)];
  const geom=new THREE.BufferGeometry().setFromPoints(pts);
  const material=new THREE.LineBasicMaterial({
    color:link.kind==="source"?0x8f7fc9:link.kind==="principle"?0x7d8fb8:0x7898c8,
    transparent:true,
    opacity:link.kind==="source"?.17:.22
  });
  const line=new THREE.Line(geom,material);
  line.userData.link=link;
  scene.add(line);
  edgeObjects.push(line);
});

function createStars(){
  const geom=new THREE.BufferGeometry();
  const count=1100;
  const arr=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const r=50+Math.random()*75;
    const t=Math.random()*Math.PI*2;
    const p=Math.acos(2*Math.random()-1);
    arr[i*3]=r*Math.sin(p)*Math.cos(t);
    arr[i*3+1]=r*Math.cos(p);
    arr[i*3+2]=r*Math.sin(p)*Math.sin(t);
  }
  geom.setAttribute("position",new THREE.BufferAttribute(arr,3));
  const mat=new THREE.PointsMaterial({size:.22,color:0x8196c4,transparent:true,opacity:.62,depthWrite:false});
  scene.add(new THREE.Points(geom,mat));
}
createStars();

const raycaster=new THREE.Raycaster();
const pointer=new THREE.Vector2();
let down=null;
renderer.domElement.addEventListener("pointerdown",e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener("pointerup",e=>{
  if(!down)return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);
  down=null;
  if(moved>7)return;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects([...meshById.values()],false).filter(h=>visibleIds.has(h.object.userData.nodeId));
  if(hits[0])selectNode(hits[0].object.userData.nodeId,true);
});

function connectedIds(id){
  const set=new Set();
  LINKS.forEach(l=>{if(l.source===id)set.add(l.target);if(l.target===id)set.add(l.source);});
  return set;
}

function selectNode(id,focus=false){
  if(!nodeById.has(id))return;
  selectedId=id;
  const n=nodeById.get(id);
  const connected=connectedIds(id);

  meshById.forEach((mesh,nodeId)=>{
    const active=nodeId===id||connected.has(nodeId);
    mesh.material.opacity=active?1:.23;
    mesh.material.emissiveIntensity=nodeId===id?.9:active?.34:.07;
    mesh.scale.setScalar(nodeId===id?1.35:1);
  });
  labelById.forEach((label,nodeId)=>{label.material.opacity=nodeId===id||connected.has(nodeId)?1:.18;});
  edgeObjects.forEach(line=>{
    const l=line.userData.link;
    const active=l.source===id||l.target===id;
    line.material.opacity=active?.88:.055;
    line.material.color.set(active?0xb9d4ff:(l.kind==="source"?0x8f7fc9:0x7898c8));
  });
  renderPanel(n,connected);
  if(focus)focusCamera(n);
}

function renderPanel(n,connected){
  detailPanel.classList.remove("is-idle");
  detailType.textContent=n.type==="scale"?"Масштаб":n.type==="principle"?"Сквозной принцип":"Источник";
  detailTitle.textContent=n.label;
  detailSummary.textContent=n.summary;
  detailMeta.innerHTML=
    '<div class="meta-item"><b>Уровень</b><span>'+escapeHtml(n.level||"—")+'</span></div>'+
    '<div class="meta-item"><b>Доказательность</b><span class="badge badge-'+n.evidence+'">'+escapeHtml(EVIDENCE[n.evidence]?.label||n.evidence)+'</span></div>';
  const related=[...connected].map(id=>nodeById.get(id)).filter(Boolean);
  detailLinks.innerHTML=related.length
    ?'<h3>Связанные узлы</h3><div class="related-list">'+related.map(x=>'<button type="button" data-node="'+x.id+'">'+escapeHtml(x.label)+'</button>').join("")+'</div>'
    :"";
  detailLinks.querySelectorAll("button[data-node]").forEach(btn=>btn.addEventListener("click",()=>selectNode(btn.dataset.node,true)));
  const sourceParts=[];
  if(n.source)sourceParts.push("<strong>"+escapeHtml(n.source)+"</strong>");
  if(n.sourceNote)sourceParts.push(escapeHtml(n.sourceNote));
  detailSource.innerHTML=sourceParts.length?"<h3>Источник / примечание</h3>"+sourceParts.join("<br>"):"";
}

function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));}

function focusCamera(n){
  const target=new THREE.Vector3(...n.pos);
  const dir=camera.position.clone().sub(controls.target).normalize();
  const distance=n.type==="source"?10:8.5;
  animateCamera(target.clone().add(dir.multiplyScalar(distance)),target,700);
}

function animateCamera(toPos,toTarget,duration){
  const fromPos=camera.position.clone();
  const fromTarget=controls.target.clone();
  const start=performance.now();
  function step(now){
    const t=Math.min(1,(now-start)/duration);
    const e=1-Math.pow(1-t,3);
    camera.position.lerpVectors(fromPos,toPos,e);
    controls.target.lerpVectors(fromTarget,toTarget,e);
    if(t<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function clearSelection(){
  selectedId=null;
  meshById.forEach((mesh,id)=>{
    mesh.material.opacity=visibleIds.has(id)?.96:.06;
    mesh.material.emissiveIntensity=.18;
    mesh.scale.setScalar(1);
  });
  labelById.forEach((label,id)=>{label.material.opacity=visibleIds.has(id)?1:.04;});
  edgeObjects.forEach(line=>{
    const l=line.userData.link;
    line.material.opacity=(visibleIds.has(l.source)&&visibleIds.has(l.target))?(l.kind==="source"?.17:.22):.02;
  });
}

function applyFilters(){
  const q=searchInput.value.trim().toLowerCase();
  const evidence=evidenceFilter.value;
  visibleIds.clear();
  NODES.forEach(n=>{
    const text=(n.label+" "+n.summary+" "+(n.source||"")+" "+(n.level||"")).toLowerCase();
    const okQ=!q||text.includes(q);
    const okE=evidence==="all"||n.evidence===evidence;
    const visible=okQ&&okE;
    if(visible)visibleIds.add(n.id);
    const mesh=meshById.get(n.id),label=labelById.get(n.id);
    mesh.visible=visible;label.visible=visible;
  });
  edgeObjects.forEach(line=>{
    const l=line.userData.link;
    line.visible=visibleIds.has(l.source)&&visibleIds.has(l.target);
  });
  if(selectedId&&!visibleIds.has(selectedId)){
    selectedId=null;
    detailPanel.classList.add("is-idle");
    detailType.textContent="Карта";
    detailTitle.textContent="Фильтр применён";
    detailSummary.textContent="Выбери один из оставшихся узлов.";
    detailMeta.innerHTML="";detailLinks.innerHTML="";detailSource.innerHTML="";
  }
  clearSelection();
}
searchInput.addEventListener("input",applyFilters);
evidenceFilter.addEventListener("change",applyFilters);

resetView.addEventListener("click",()=>{
  clearSelection();
  animateCamera(new THREE.Vector3(34,28,46),new THREE.Vector3(-1,5,9),800);
});
toggleRotate.addEventListener("click",()=>{
  controls.autoRotate=!controls.autoRotate;
  toggleRotate.setAttribute("aria-pressed",String(controls.autoRotate));
  toggleRotate.textContent="Автовращение: "+(controls.autoRotate?"вкл.":"выкл.");
});
closePanel.addEventListener("click",()=>{
  clearSelection();
  detailPanel.classList.add("is-idle");
  detailType.textContent="Карта";detailTitle.textContent="Выбери узел";
  detailSummary.textContent="Нажми на любой объект в 3D-пространстве. Связанные узлы и линии будут подсвечены.";
  detailMeta.innerHTML="";detailLinks.innerHTML="";detailSource.innerHTML="";
});

function resize(){
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
window.addEventListener("resize",resize);
resize();

const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if(reduceMotion){controls.autoRotate=false;toggleRotate.textContent="Автовращение: выкл.";toggleRotate.setAttribute("aria-pressed","false");}

renderer.setAnimationLoop(()=>{
  controls.update();
  meshById.forEach(mesh=>{
    if(mesh.userData.halo)mesh.userData.halo.quaternion.copy(camera.quaternion);
  });
  renderer.render(scene,camera);
});