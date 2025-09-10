
// === src/hud.js ===
// HUD（総売上 / 原価率 / ST平均売上）の生成・配置・更新・イベント購読を担当
let __inited = false;

export function initHUD(){
  if (__inited) return;
  __inited = true;
  ensureTopStats();
  updateHUD();
  // 外部互換（旧名を公開）
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.updateTopStats = updateHUD;
  // イベント購読
  window.addEventListener('asoble:selectedMachines', updateHUD);
  window.addEventListener('asoble:activeLabel', updateHUD);
  window.addEventListener('asoble:data', updateHUD);
  window.addEventListener('asoble:rows', updateHUD);
  window.addEventListener('asoble:update', updateHUD);
  window.addEventListener('storage', (e)=>{ if (e && e.key === 'asoble:machines') updateHUD(); });

    // 追加: 選択状態の自動検知（Set変異 / setter / 同タブlocalStorage / ポーリング）
    try { hookSelectedMachines(); } catch {}
    try { patchLocalStorage(); } catch {}
    try { startSelectionPolling(); } catch {}
}

function ensureTopStats(){
  if (document.getElementById('top-stats')) return;
  const el = document.createElement('div');
  el.id = 'top-stats';
  el.className = 'top-stats';
  el.innerHTML =
    '<span class="ts-item"><span class="ts-key">総売上</span><span class="ts-val" data-k="sum">—</span><span class="ts-unit">円</span></span>' +
    '<span class="ts-sep" aria-hidden="true"></span>' +
    '<span class="ts-item"><span class="ts-key">原価率</span><span class="ts-val" data-k="rate">—</span></span>' +
    '<span class="ts-sep" aria-hidden="true"></span>' +
    '<span class="ts-item"><span class="ts-key">ST平均売上</span><span class="ts-val" data-k="avg">—</span><span class="ts-unit">円</span></span>';
  document.body.appendChild(el);
  placeTopStats(el);
  // レイアウト確定後の再配置
  requestAnimationFrame(()=>requestAnimationFrame(()=>placeTopStats(el)));
  window.addEventListener('load', ()=>placeTopStats(el), { once:true });
  setTimeout(()=>placeTopStats(el), 300);
  setTimeout(()=>placeTopStats(el), 1000);
}

function findZoomAnchor(){
  const sel = ['#zoom-toggle','.zoom-toggle','[data-zoom-toggle]','#zoom-in','.zoom-in','[data-action="zoom-in"]','#zoom_out','.zoom-out','[data-action="zoom-out"]','.zoom-buttons','.controls [role="toolbar"]'];
  for (const s of sel){ const a = document.querySelector(s); if (a) return a; }
  return null;
}
function placeTopStats(el){
  try{
    const anchor = findZoomAnchor();
    const PAD=8, GAP=12, vw=window.innerWidth, vh=window.innerHeight;
    if (!anchor){ el.style.left='10px'; el.style.top='8px'; return; }
    const prevL=el.style.left, prevT=el.style.top;
    el.style.left='-9999px'; el.style.top='-9999px';
    const ar=anchor.getBoundingClientRect(), er=el.getBoundingClientRect();
    const midY = ar.top + (ar.height - er.height)/2;
    const C = {
      left:  { x: ar.left  - er.width - GAP, y: midY },
      right: { x: ar.right + GAP,            y: midY },
      above: { x: ar.left,                   y: ar.top    - er.height - GAP },
      below: { x: ar.left,                   y: ar.bottom + GAP }
    };
    const fits = ({x,y}) => x>=PAD && x+er.width<=vw-PAD && y>=PAD && y+er.height<=vh-PAD;
    const pos = (fits(C.left)&&C.left) || (fits(C.right)&&C.right)
      || (fits(C.above)&&{ x: clamp(C.above.x, PAD, vw-er.width-PAD), y: C.above.y })
      || { x: clamp(C.below.x, PAD, vw-er.width-PAD), y: Math.min(C.below.y, vh-er.height-PAD) };
    el.style.left = Math.round(pos.x)+'px';
    el.style.top  = Math.round(pos.y)+'px';
    if (prevL === '-9999px') el.style.left = Math.round(pos.x)+'px';
    if (prevT === '-9999px') el.style.top  = Math.round(pos.y)+'px';
  }catch{}
}

export function updateHUD(){
  ensureTopStats();
  const el = document.getElementById('top-stats'); if (!el) return;
  const sel = getSelectedMachines();
  const rows = getRows();
  let salesSum=0, shokaSum=0; 
  const boothSet=new Set();
    // 機種名の全集合を作り、全選択時はフィルタ無効化する
  const allMach = new Set();
  for (const r of rows){
    const m = pick(r, ['対応マシン名','機種名','マシン名','machine','mach','対応機種']);
    const s = (m==null ? '' : String(m).trim());
    if (s) allMach.add(s);
  }
  const activeFilter = (sel.size > 0) && (allMach.size === 0 || sel.size < allMach.size);

  for (const r of rows){
    const mach = pick(r, ['対応マシン名','機種名','マシン名','machine','mach','対応機種']);
    const ms = (mach==null ? '' : String(mach).trim());
    // 機種名が空なら常に含める。フィルタは「有効時のみ」適用
    if (activeFilter && ms && !sel.has(ms)) continue;
 
    let salesRaw = pick(r, ['総売上','売上','sales','C','総売上(円)']);
    if (salesRaw == null) salesRaw = pickLike(r, [/売上/, /sales?/i, /総.*売/]);
    const sales = num(salesRaw);
    let shokaRaw = pick(r, ['消化額','cost','E','消化額(円)']);
    if (shokaRaw == null) shokaRaw = pickLike(r, [/消化|原価/, /cost/i]);
    const shoka = num(shokaRaw);
    const booth = pick(r, ['ブースID','ブース','ST','st','店舗ID','店舗','booth','BoothID','store','Store']);
    salesSum += sales; shokaSum += shoka; if (booth!=null) boothSet.add(String(booth));
  }
  const boothCnt = Math.max(boothSet.size, 0);
  const stAvg = boothCnt>0 ? (salesSum/boothCnt) : 0;
  const genka = salesSum>0 ? (shokaSum*1.1)/salesSum : 0;
  const set = (k,v)=>{
        const n = el.querySelector(`.ts-val[data-k="${k}"]`);
        if (!n) return;
        const prev = n.textContent || '';
        if (prev === String(v)) return;           // 変化がなければ何もしない
        n.textContent = v;                        // 値を更新
        n.classList.remove('updated');            // 付け直しに備えて一旦外す
        // 強制リフローで連続適用でもアニメが効くようにする
        // eslint-disable-next-line no-unused-expressions
        n.offsetWidth;
        n.classList.add('updated');               // ひと呼吸分だけ強調
        setTimeout(()=>n.classList.remove('updated'), 220);
      };
  set('sum',  formatJPY(salesSum));
  set('rate', formatPct(genka));
  set('avg',  formatJPY(stAvg));
  try{ placeTopStats(el); }catch{}
}

// ---- helpers (ローカル) ----
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function num(v){ if (v==null) return 0; const n=Number(String(v).replace(/[^\d.\-]/g,'')); return isFinite(n)?n:0; }
function pick(obj, keys){ for(const k of keys){ if (obj && obj[k]!=null) return obj[k]; } return undefined; }
function pickLike(obj, patterns){
  try{ if(!obj) return undefined;
    for (const k of Object.keys(obj)){
      for (const p of patterns){ const re=(p instanceof RegExp)?p:new RegExp(String(p),'i'); if (re.test(k)) return obj[k]; }
    }
  }catch{} return undefined;
}
function formatJPY(n){ try{ return Number(n||0).toLocaleString('ja-JP',{maximumFractionDigits:0}); } catch{ return String(Math.round(n||0)); } }
function formatPct(x){ if (!isFinite(x)) return '0%'; return (x*100).toFixed(1)+'%'; }
function getSelectedMachines(){
  const A = window.ASOBLE || {};
  if (A.selectedMachines instanceof Set) return A.selectedMachines;
  if (Array.isArray(A.selectedMachines)) return new Set(A.selectedMachines.map(String));
  if (A.selectedMachine != null) return new Set([String(A.selectedMachine)]);
  if (Array.isArray(A.activeMachines)) return new Set(A.activeMachines.map(String));
  if (A.activeMachine != null) return new Set([String(A.activeMachine)]);
  try{ const a = JSON.parse(localStorage.getItem('asoble:machines')||'[]'); return new Set(Array.isArray(a)?a.map(String):[]); }catch{ return new Set(); }
}
function getRows(){
  let rows = window.ASOBLE?.rows || window.ASOBLE?.data?.rows || window.ASOBLE?.rawRows || window.ASOBLE?.csvRows || window.ASOBLE?.tableRows || window.ASOBLE?.grid?.rows || window.ASOBLE?.dataset?.rows || [];
  return Array.isArray(rows) ? rows : [];
}

// ---- 選択変化の自動検知ユーティリティ ----
function hookSelectedMachines(){
  window.ASOBLE = window.ASOBLE || {};

  // Set の add/delete/clear をフックして都度更新
  const observeSet = (s)=>{
    if (!(s instanceof Set)) return s;
    ['add','delete','clear'].forEach(m=>{
      const orig = s[m];
      Object.defineProperty(s, m, {
        configurable: true, writable: true,
        value: function(...args){
          const r = orig.apply(this, args);
          try{ updateHUD(); }catch{}
          return r;
        }
      });
    });
    return s;
  };

  // selectedMachines: setter 経由の代入を監視
  let _sm = window.ASOBLE.selectedMachines;
  Object.defineProperty(window.ASOBLE, 'selectedMachines', {
    get(){ return _sm; },
    set(v){ _sm = v instanceof Set ? observeSet(v) : observeSet(new Set(v || [])); try{ updateHUD(); }catch{} },
    configurable:true
  });

  // selectedMachine（単体）も監視
  let _s1 = window.ASOBLE.selectedMachine;
  Object.defineProperty(window.ASOBLE, 'selectedMachine', {
    get(){ return _s1; },
    set(v){ _s1 = v; try{ updateHUD(); }catch{} },
    configurable:true
  });

  // 既存 Set があればフック化
  if (_sm instanceof Set) observeSet(_sm);
}

function patchLocalStorage(){
  if (!window.ASOBLE) window.ASOBLE = {};
  if (window.ASOBLE.__lsPatched) return;
  const _set = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(k, v){
    const r = _set(k, v);
    if (k === 'asoble:machines'){ try{ updateHUD(); }catch{} }
    return r;
  };
  window.ASOBLE.__lsPatched = true;
}

let __selKey = '';
function startSelectionPolling(){
  if (window.ASOBLE?.__hudPolling) return;
  window.ASOBLE.__hudPolling = setInterval(()=>{
    try{
      const s = getSelectedMachines();
      const k = (s && s.size) ? Array.from(s).sort().join('|') : '';
      if (k !== __selKey){ __selKey = k; updateHUD(); }
    }catch{}
  }, 500);
}