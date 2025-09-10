// 売上カード：ツールチップと同じ意味で「塗り=売上」「枠=原価率」
export function mountCardsMode(host, rows){
  if (!host) return;
  host.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);color:#fff">
      <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.15)">
        <strong>売上カード</strong>
        <span style="font-size:12px;color:#bbb">（最大50件）</span>
        <span style="flex:1"></span>
        <button id="card-zoom" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer">拡大</button>
      </div>
      <div id="card-body" style="padding:10px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;"></div>
    </div>`;
  const body = host.querySelector('#card-body');
  const btn = host.querySelector('#card-zoom');

  const items = computeTopByLabel(rows).slice(0,50);
  const maxSales = Math.max(1, ...items.map(x=>x.sales||0));
  items.forEach((r,i)=>{
    const rate = clamp01(r.rate||0);
    const fill = fillFromSales(r.sales||0, maxSales);
    const stroke = strokeFromRate(rate);
    const el = document.createElement('div');
    el.style.cssText = [
      'border:2px solid '+stroke,'border-radius:12px','padding:10px','background:'+fill,
      'box-shadow:0 8px 20px rgba(0,0,0,.25)'
    ].join(';');
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <div style="font-size:12px;color:#bbb">#${i+1}</div>
        <div style="font-weight:600">${esc(r.prize||r.label||'-')}</div>
        <span style="flex:1"></span>
        <div style="font-size:12px;color:#ccc">${esc(r.machine||'-')}</div>
      </div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:13px">
        <div style="color:#9fb">売上</div><div>¥${fmt(r.sales||0)}</div>
        <div style="color:#fb9">原価率</div><div>${(rate*100).toFixed(1)}%</div>
      </div>`;
    body.appendChild(el);
  });

  let zoomed=false;
  btn.addEventListener('click', ()=>{
    zoomed=!zoomed;
    btn.textContent = zoomed? '縮小':'拡大';
    body.style.gridTemplateColumns = zoomed? 'repeat(1,minmax(0,1fr))':'repeat(2,minmax(0,1fr))';
  });
}

// --- helpers ---
function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }

function strokeFromRate(rate){
  // 緑(#34D399) → 橙(#F59E0B) → 赤(#F87171)
  const t = clamp01(rate);
  const mid = 0.5;
  if (t <= mid){
    const k = t / mid;
    return lerpHex('#34D399', '#F59E0B', k);
  } else {
    const k = (t - mid) / (1 - mid);
    return lerpHex('#F59E0B', '#F87171', k);
  }
}

function fillFromSales(s, sMax){
  const t = clamp01(sMax ? s / sMax : 0);
  const eased = Math.pow(t, 0.6); // 高売上を強調
  return lerpHex('#0F172A', '#76E4F7', eased); // 濃紺→シアン
}

function lerpHex(a, b, t){
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r-pa.r)*t);
  const g = Math.round(pa.g + (pb.g-pa.g)*t);
  const b2 = Math.round(pa.b + (pb.b-pa.b)*t);
  return `rgb(${r}, ${g}, ${b2})`;
}
function hexToRgb(h){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:0,g:0,b:0 };
}

function computeTopByLabel(rows){
  const COL_MACHINE='対応マシン名', COL_LABEL='ラベルID', COL_SALES='総売上', COL_COST='消化額';
  const PRIZE = detectPrizeKey(rows);
  const mp = new Map();
  for(const r of (Array.isArray(rows)?rows:[])){
    const label = str(r[COL_LABEL]), mach=str(r[COL_MACHINE]);
    const s=num(r[COL_SALES]), c=num(r[COL_COST]); const p=PRIZE? str(r[PRIZE]):'';
    if (!label) continue;
    const cur = mp.get(label)||{machine:mach, prize:p||label, sales:0, cost:0, label};
    cur.sales+=s; cur.cost+=c; if (!cur.prize && p) cur.prize=p; if (!cur.machine && mach) cur.machine=mach;
    mp.set(label, cur);
  }
  const arr = [...mp.values()].map(v=>({...v, rate:(v.sales>0)? (v.cost*1.1)/v.sales : 0}));
  arr.sort((a,b)=> b.sales - a.sales);
  return arr;
}
function detectPrizeKey(rows){
  if (!Array.isArray(rows)||rows.length===0) return '';
  const keys = Object.keys(rows.find(r=>r)||{});
  const cand=[/景品名/i,/商品名/i,/景品/i,/商品/i];
  for(const re of cand){ const k=keys.find(x=>re.test(String(x))); if(k) return k; }
  return '';
}
const num = v => { const n = Number(String(v??'').replace(/[^\d.-]/g,'')); return isFinite(n)?n:0; };
const str = v => (v==null?'':String(v).trim());
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt = n => (Number(n)||0).toLocaleString('ja-JP');
