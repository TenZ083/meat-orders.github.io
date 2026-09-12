/* Заказы мяса · app.js */
(function(){
'use strict';

/* ---- state ---- */
const LS='meat_v1';
const uid=()=>Math.random().toString(36).slice(2,10);
let S={orders:[],razdelka:[],done:false};
try{const r=JSON.parse(localStorage.getItem(LS)||'{}');if(r&&r.orders)S=r;else S={orders:[],razdelka:[],done:false};}catch(e){}
function saveLocal(){localStorage.setItem(LS,JSON.stringify(S));}
/* ==== FIREBASE (реалтайм-синхронизация между устройствами) ====
   1) Создай проект на console.firebase.google.com
   2) Вкладка «Параметры приложения» → скопируй объект firebaseConfig целиком
   3) Вставь его ниже вместо null (можно прямо в фигурных скобках)
   4) Firestore включи: Build → Firestore Database → Create
   Все заказы/разделка теперь общие между устройствами. */
const FB_CONFIG=null;
let _db=null;
async function initFB(){
  if(!FB_CONFIG)return;
  const app=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const fb=app.initializeApp(FB_CONFIG);
  const dbm=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  _db=dbm.getFirestore(fb);
  const ref=dbm.doc(_db,'state','main');
  dbm.onSnapshot(ref,snap=>{const d=snap.data()||{};S.orders=d.orders||[];S.razdelka=d.razdelka||[];S.done=!!d.done;saveLocal();window.dispatchEvent(new CustomEvent('meat-db-sync',{detail:S}));},console.error);
}
initFB();
function save(){saveLocal();if(_db)import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>m.setDoc(m.doc(_db,'state','main'),{orders:S.orders,razdelka:S.razdelka,done:S.done})).catch(console.error);}
/* ==== конец Firebase — дальше код без изменений ==== */

/* ---- Firebase (real-time sync) ---- */
let _fb=null;
const useFB=()=>!!window.fb_app&&!!_fb;
function fbOrders(){return useFB()?_fb.orders:[];}
function fbRazdelka(){return useFB()?_fb.razdelka:[];}
function applyState(s){S=s;renderAdmin();renderPickList();renderPickerStats();renderRazdelka();}
async function bootFirebase(){
  try{
    const app=window.fb_app;
    if(!app)return;
    const {initializeApp}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const fb=initializeApp(app);
    const db=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js').then(m=>m.getDatabase(fb)).catch(()=>import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>m.getFirestore(fb)));
    const fbMode=String(db.constructor.name).toLowerCase().includes('firestore')||!!db.collection;
    _fb={orders:[],razdelka:[]};
    if(!fbMode){ /* realtime DB path */ }
    // Fallback: use Firestore collections
    const {collection,onSnapshot,doc,getDocs}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const ordersCol=collection(db,'orders');
    const razCol=collection(db,'razdelka');
    onSnapshot(ordersCol,snap=>{const arr=[];snap.forEach(d=>{arr.push(Object.assign({},d.data(),{id:d.id}));});_fb.orders=arr;applyState({orders:_fb.orders,razdelka:_fb.razdelka,done:false});},err=>console.error('orders',err));
    onSnapshot(razCol,snap=>{const arr=[];snap.forEach(d=>{arr.push(Object.assign({},d.data(),{id:d.id}));});_fb.razdelka=arr;applyState({orders:_fb.orders,razdelka:_fb.razdelka,done:false});},err=>console.error('raz',err));
  }catch(e){console.warn('Firebase init failed, using localStorage:',e);}
}
function fbAddOrder(o){if(useFB())return import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>{const c=m.collection(_fb.db||document,'orders');m.addDoc(c,o).catch(console.error);});return null;}
function fbUpdateCollected(id,col){if(useFB())return import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>{const d=m.doc(_fb.db||document,'orders',id);m.updateDoc(d,{collected:col}).catch(console.error);});return null;}
function fbDeleteOrder(id){if(useFB())return import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>{const d=m.doc(_fb.db||document,'orders',id);m.deleteDoc(d).catch(console.error);});return null;}
function fbAddRazdelka(r){if(useFB())return import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>{const c=m.collection(_fb.db||document,'razdelka');m.addDoc(c,r).catch(console.error);});return null;}
function fbSetDone(v){if(useFB())return import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(m=>{const d=m.doc(_fb.db||document,'meta','day');m.setDoc(d,{done:v}).catch(console.error);});return null;}
function fbLoad(){bootFirebase();}
window.fb_app=null;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{if(window.fb_app)bootFirebase();});
else if(window.fb_app)bootFirebase();
const today=new Date().toISOString().slice(0,10);

/* ---- picker (Сборка) ---- */
let pickList=null,activeOrder=null,buf='';
function remaining(o){return Math.max(0,(o.ordered||0)-(o.collected||0));}
function collectedSum(){return S.orders.reduce((a,o)=>a+(o.collected||0),0);}

function pickerStats(){
  const t=S.orders.length;
  const c=collectedSum();
  const r=S.orders.reduce((a,o)=>a+remaining(o),0);
  document.querySelector('[data-hook="picker-stats"] [data-value="total"]')&&(document.querySelector('[data-value="total"]').textContent=t);
}
function setStat(v){const el=document.querySelector('[data-value="'+v+'"]');if(el)el.textContent=0;}
function renderPickerStats(){
  const total=S.orders.length;
  const collected=collectedSum();
  const rest=S.orders.reduce((a,o)=>a+remaining(o),0);
  document.querySelector('[data-value="total"]')&&(document.querySelector('[data-value="total"]').textContent=total);
  document.querySelector('[data-value="collected"]')&&(document.querySelector('[data-value="collected"]').textContent=collected);
  document.querySelector('[data-value="remaining"]')&&(document.querySelector('[data-value="remaining"]').textContent=rest);
}

function openModal(o){
  activeOrder=o.id;
  const m=document.getElementById('weight-modal');
  if(!m)return;
  m.classList.add('open');
  document.body.classList.add('modal-open');
  document.querySelector('[data-hook="modal-product"]').textContent=(o.product||'Товар')+' · '+(o.cat==='shop'?'Магазин':'Клиент')+' '+(o.name||'');
  const disp=document.getElementById('weight-display');if(disp)disp.value='';buf='';
}
function closeModal(){
  document.getElementById('weight-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
  activeOrder=null;
}
function confirmWeight(){
  const d=document.getElementById('weight-display');if(!d)return;
  const w=parseFloat(d.value);
  if(!activeOrder||!isFinite(w)||w<=0){closeModal();return;}
  const o=S.orders.find(x=>x.id===activeOrder);if(!o){closeModal();return;}
  o.collected=Math.min(o.ordered,(o.collected||0)+w);
  save();renderPickList();renderPickerStats();
  closeModal();
}

function renderPickList(){
  if(pickList){pickList.remove();pickList=null;}
  const app=document.querySelector('.app');
  const modal=document.getElementById('weight-modal');
  pickList=document.createElement('section');
  pickList.id='pick-list';
  pickList.innerHTML='<h2 class="section-title">Выбери товар</h2>';
  if(!S.orders.length){pickList.innerHTML+='<div class="empty">Нет заказов для сборки</div>';app.insertBefore(pickList,modal);return;}

  const byCat=S.orders.filter(o=>o.cat===activeMode);
  let html='';
  // group: for client -> group by name; shop -> flat
  if(activeMode==='client'){
    const g={};byCat.forEach(o=>{(g[o.name]=g[o.name]||[]).push(o);});
    Object.keys(g).forEach(name=>{html+='<div class="group-h">👤 '+name+'</div>';g[name].forEach(o=>{html+=row(o);});});
  }else{
    byCat.forEach(o=>{html+=row(o);});
  }
  pickList.innerHTML=html;
  app.insertBefore(pickList,modal);
  pickList.querySelectorAll('[data-order]').forEach(el=>el.addEventListener('click',()=>openModal(S.orders.find(x=>x.id===el.dataset.order))));
}
function row(o){return '<button class="pick-row" data-order="'+o.id+'"><span>'+ (o.product||'') +'</span><small>ост.'+remaining(o)+' кг</small></button>';}

let activeMode='shop';
function bindPicker(){
  const el=document.querySelector('[data-hook="picker"]');if(!el)return;
  document.querySelectorAll('.action-card').forEach(c=>c.addEventListener('click',()=>{activeMode=(c.dataset.hook==='mode-client')?'client':'shop';renderPickList();}));
  // keypad
  document.querySelectorAll('[data-key]').forEach(k=>k.addEventListener('click',()=>{
    const d=document.getElementById('weight-display');if(!d)return;
    const key=k.dataset.key;
    if(key==='C'){buf='';}else{buf+=key;}
    d.value=buf;
  }));
  document.querySelector('[data-hook="confirm-weight"]')&&document.querySelector('[data-hook="confirm-weight"]').addEventListener('click',confirmWeight);
  document.querySelector('[data-hook="modal-close"]')&&document.querySelector('[data-hook="modal-close"]').addEventListener('click',closeModal);
  renderPickerStats();
}

/* ---- admin ---- */
function bindAdmin(){
  // tabs
  const tabs=document.getElementById('add-tabs');
  if(tabs){tabs.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelector('[data-hook="fast-form"]')&&(document.querySelector('[data-hook="fast-form"]').hidden=t.dataset.tab!=='fast');
    document.querySelector('[data-hook="manual-form"]')&&(document.querySelector('[data-hook="manual-form"]').hidden=t.dataset.tab!=='manual');
    document.querySelector('[data-hook="batch-form"]')&&(document.querySelector('[data-hook="batch-form"]').hidden=t.dataset.tab!=='batch');
  }));}

  // fast form (line)
  const ff=document.querySelector('[data-hook="fast-form"]');
  if(ff)ff.addEventListener('submit',e=>{e.preventDefault();const line=(document.getElementById('fast-line').value||'').trim();if(!line)return;parseLine(line);save();renderAdmin();});

  // manual form
  const mf=document.querySelector('[data-hook="manual-form"]');
  if(mf)mf.addEventListener('submit',e=>{e.preventDefault();const name=(document.getElementById('m-client').value||'').trim();const prod=(document.getElementById('m-product').value||'').trim();const w=parseFloat(document.getElementById('m-weight').value);if(!name||!prod||!isFinite(w)||w<=0)return;S.orders.push({id:uid(),cat:'client',name:name,product:prod,ordered:w,collected:0});save();renderAdmin();});

  // batch form
  const bf=document.querySelector('[data-hook="batch-form"]');
  if(bf)bf.addEventListener('submit',e=>{e.preventDefault();const name=(document.getElementById('b-client').value||'').trim();const lines=(document.getElementById('b-lines').value||'').split('\n').map(s=>s.trim()).filter(Boolean);if(!name||!lines.length)return;lines.forEach(l=>{const p=l.split(/\s+/);S.orders.push({id:uid(),cat:'client',name:name,product:p[0],ordered:parseFloat(p[1])||0,collected:0});});save();renderAdmin();});

  // finish day
  document.querySelector('[data-hook="finish-day"]')&&document.querySelector('[data-hook="finish-day"]').addEventListener('click',()=>{
    if(!confirm('Завершить день?'))return;S.done=true;save();renderAdmin();
  });
}

function parseLine(line){
  // "Клиент товар вес" — last token is weight, first is client/name, middle = product
  const p=line.split(/\s+/);
  if(p.length<3)return;
  const w=parseFloat(p[p.length-1]);
  const prod=p.slice(0,p.length-1).join(' ');
  S.orders.push({id:uid(),cat:'client',name:prod,product:prod,ordered:w||0,collected:0});
}

function renderAdmin(){
  // stats
  const t=S.orders.length;
  const pos=S.orders.reduce((a,o)=>a+(o.ordered?1:0),0);
  const kg=S.orders.reduce((a,o)=>a+(o.collected||0),0);
  document.querySelector('[data-value="clients"]')&&(document.querySelector('[data-value="clients"]').textContent=t);
  document.querySelector('[data-value="positions"]')&&(document.querySelector('[data-value="positions"]').textContent=pos);
  document.querySelector('[data-value="kg-collected"]')&&(document.querySelector('[data-value="kg-collected"]').textContent=kg);

  // summary by product
  const sum={};S.orders.forEach(o=>{sum[o.product]=(sum[o.product]||0)+(o.ordered||0);});
  const sc=document.querySelector('[data-hook="summary-by-product"]');
  if(sc){if(!Object.keys(sum).length){sc.innerHTML='<div class="empty">Нет заказов</div>';}else{let h='';Object.keys(sum).sort().forEach(p=>{h+='<div class="sum-row"><span>'+p+'</span><b>'+sum[p]+' кг</b></div>';});sc.innerHTML=h;}}

  // orders list
  const ol=document.querySelector('[data-hook="orders-list"]');
  if(ol){if(!S.orders.length){ol.innerHTML='<div class="empty">Загруза...</div>';}else{let h='';S.orders.forEach(o=>{h+='<div class="order-row" data-id="'+o.id+'"><span>'+ (o.product||'') +' · '+(o.name||'')+'</span><small>заказано '+(o.ordered||0)+' / собрано '+(o.collected||0)+'</small></div>';});ol.innerHTML=h;ol.querySelectorAll('[data-id]').forEach(el=>el.addEventListener('click',()=>{const i=S.orders.findIndex(x=>x.id===el.dataset.id);if(i>-1){S.orders.splice(i,1);save();renderAdmin();}}));}}
}

/* ---- razdelka ---- */
function bindRazdelka(){
  const f=document.querySelector('[data-hook="razdelka-form"]');if(!f)return;
  // chips
  document.querySelectorAll('[data-worker]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-worker]').forEach(x=>x.classList.remove('active'));b.classList.add('active');}));
  document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-source]').forEach(x=>x.classList.remove('active'));b.classList.add('active');}));

  const rows=document.querySelector('[data-hook="out-rows"]');
  let outRows=[];
  function addRow(){const r=document.createElement('div');r.style.display='flex';r.style.gap='6px';r.innerHTML='<input class="input" placeholder="товар"><input class="input" inputmode="decimal" placeholder="кг">';rows.appendChild(r);outRows.push(r);}
  // small + button
  const btn=document.createElement('button');btn.type='button';btn.className='btn';btn.textContent='＋ позиция';btn.addEventListener('click',addRow);rows.parentNode.insertBefore(btn,rows.nextSibling);
  addRow();

  f.addEventListener('submit',e=>{e.preventDefault();
    const worker=(document.querySelector('[data-worker].active']||{}).dataset?document.querySelector('[data-worker].active').dataset.worker:'');
    const source=(document.querySelector('[data-source].active']||{});source=source.dataset?source.dataset.source:'';
    const cat=document.getElementById('r-cat').value;
    const prod=(document.getElementById('r-product').value||'').trim();
    const kg=parseFloat(document.getElementById('r-input-weight').value);
    if(!prod||!isFinite(kg)||kg<=0)return;
    const outs=[];outRows.forEach(r=>{const a=r.querySelector('input');const b2=r.querySelectorAll('input')[1];if(a.value&&b2.value)outs.push({product:a.value,kg:parseFloat(b2.value)||0});});
    S.razdelka.push({id:uid(),worker:worker||'?',cat:cat,source:source||'?',inProduct:prod,kg:kg,out:outs});
    save();renderRazdelka();document.getElementById('r-product').value='';document.getElementById('r-input-weight').value='';
  });
}
function renderRazdelka(){
  document.querySelector('[data-value="batches"]')&&(document.querySelector('[data-value="batches"]').textContent=S.razdelka.length);
  const items=S.razdelka.reduce((a,b)=>a+b.out.length,0);
  document.querySelector('[data-value="items-out"]')&&(document.querySelector('[data-value="items-out"]').textContent=items);
  const tl=document.querySelector('[data-hook="taken-list"]');
  if(tl){if(!S.razdelka.length){tl.innerHTML='<div class="empty">Нет партий</div>';}else{let h='';S.razdelka.forEach(b=>{h+='<div class="taken-row"><span>'+b.inProduct+'</span><small>'+b.kg+' кг · '+(b.worker||'')+'</small></div>';});tl.innerHTML=h;}}
  const os=document.querySelector('[data-hook="output-summary"]');
  if(os){const sum={};S.razdelka.forEach(b=>b.out.forEach(o=>{sum[o.product]=(sum[o.product]||0)+o.kg;}));if(!Object.keys(sum).length){os.innerHTML='<div class="empty">Не разделано</div>';}else{let h='';Object.keys(sum).sort().forEach(p=>{h+='<div class="sum-row"><span>'+p+'</span><b>'+sum[p]+' кг</b></div>';});os.innerHTML=h;}}
}

/* ---- boot ---- */
function init(){
  if(document.getElementById('add-tabs')||document.querySelector('[data-hook="fast-form"]')){bindAdmin();renderAdmin();}
  if(document.getElementById('weight-modal')){bindPicker();renderPickList();}
  if(document.querySelector('[data-hook="razdelka-form"]')){bindRazdelka();renderRazdelka();}
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
