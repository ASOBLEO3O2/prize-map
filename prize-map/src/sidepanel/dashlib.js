// dashlib.js
// ダッシュボードのロジック（集計・描画）だけを切り出した純関数モジュール。
// UI生成やイベント配線は dashboard.js 側に残し、本モジュールからは行いません。

// === 公開API ===
export { recompute, renderGraph, renderSubplot };

// === 集計 ===
function recompute(allRows, state){
  const rows = Array.isArray(allRows) ? allRows : [];
  // キー名
  const COL_MACHINE = '対応マシン名';
  const COL_LABEL   = 'ラベルID';
  const COL_SALES   = '総売上';
  const COL_COST    = '消化額';
  const COL_PRIZE   = detectPrizeKey(rows);

  const byMachine = new Map(); // name -> { sales, cost, labels:Set, count, avg, rate }
  const byLabel   = new Map(); // label -> { name, prize, sales, cost }

  for (const r of rows){
    const name  = str(r[COL_MACHINE]);
    const label = str(r[COL_LABEL]);
    const sales = num(r[COL_SALES]);
    const cost  = num(r[COL_COST]);
    const prize = COL_PRIZE ? str(r[COL_PRIZE]) : '';

    // UIのマシンフィルタ：複数選択(Set)があれば集合判定
    if (state && state.machines instanceof Set){
      if (state.machines.size > 0 && !state.machines.has(name)) continue;
    }

    // label
    if (label){
      const cur = byLabel.get(label) || { name, prize:'', sales:0, cost:0 };
      cur.sales += sales; cur.cost += cost;
      if (!cur.prize && prize) cur.prize = prize; // 最初に見つかった景品名を代表に
      byLabel.set(label, cur);
    }
    // machine
    const m = byMachine.get(name) || { sales:0, cost:0, labels:new Set(), count:0 };
    m.sales += sales; m.cost += cost; m.labels.add(label); m.count += 1;
    byMachine.set(name, m);
  }

  // 平均売上（ラベル単位平均）と原価率
  for (const [, m] of byMachine){
    const denom = Math.max(1, m.labels.size);
    m.avg = m.sales / denom;
    m.rate = (m.sales > 0) ? ((m.cost * 1.1) / m.sales) : 0; // 原価率
  }

  // 機種別配列
  const machines = [...byMachine.entries()].map(([name, v]) => ({ name, ...v }));
  machines.sort((a,b)=>b.sales - a.sales);

  // トップ一覧（ラベル単位）
  let labels = [...byLabel.entries()].map(([label, v]) => {
    const rate = v.sales>0 ? (v.cost*1.1)/v.sales : 0;
    return { label, prize: v.prize || label, machine: v.name, sales: v.sales, cost: v.cost, rate };
  });

  // 原価率フィルタ（％基準）
  if (state){
    const lo = Math.max(0, Math.min(100, Number(state.rmin)||0))/100;
    const hi = Math.max(0, Math.min(100, Number(state.rmax)||100))/100;
    labels = labels.filter(x => x.rate >= lo && x.rate <= hi);

    // 並び順
    const key = state.sort || 'sales_desc';
    const cmp = {
      sales_desc: (a,b)=> b.sales - a.sales,
      sales_asc:  (a,b)=> a.sales - b.sales,
      rate_asc:   (a,b)=> a.rate  - b.rate,
      rate_desc:  (a,b)=> b.rate  - a.rate,
    }[key] || ((a,b)=> b.sales - a.sales);
    labels.sort(cmp);
  } else {
    labels.sort((a,b)=>b.sales - a.sales);
  }

  // 散布図用にフィルタ・ソート後の全点を保持（上限なし）
  const points = labels.slice();
  // テーブルは従来通り上位50件のみ
  const topList = labels.slice(0, 50);
  // 構成比合計
  const total = machines.reduce((s,m)=>s+m.sales,0);
  return { machines, total, topList, points };
}

// 景品名カラムの推定（例：景品名/商品名/景品/商品 を優先）
function detectPrizeKey(rows){
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const keys = Object.keys(rows.find(r=>r) || {});
  const candOrder = [/景品名/i, /商品名/i, /景品/i, /商品/i];
  for (const re of candOrder){
    const k = keys.find(x => re.test(String(x)));
    if (k) return k;
  }
  return '';
}

// === グラフ描画 ===
function renderGraph(canvas, data, type){
  if (!canvas) return;
  const dpr = Math.max(1, window.devicePixelRatio||1);
  const cssW = canvas.clientWidth || 320, cssH = canvas.clientHeight || 240;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height= Math.floor(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);

  if (!data || !Array.isArray(data.machines) || data.machines.length===0){
    ctx.fillStyle = '#ccc'; ctx.fillText('データがありません', 10, 20); return;
  }
  if (type === 'composition')      drawPie(ctx, cssW, cssH, data);
  else if (type === 'topn')        drawBars(ctx, cssW, cssH, data);
  else if (type === 'hist')        drawHist(ctx, cssW, cssH, data);
  else if (type === 'scatter')     drawScatter(ctx, cssW, cssH, data);
  else                             drawBars(ctx, cssW, cssH, data);
}

// 下段サブプロット描画（ヒスト/散布を状態で切替）
function renderSubplot(canvas, data, state){
  if (!canvas) return;
  window.__ASOBLE_LAST_DATA__ = data; // 即時切替用に保持
  const dpr = Math.max(1, window.devicePixelRatio||1);
  let cssW = canvas.clientWidth || 320, cssH = canvas.clientHeight || 160;
  if (cssH === 0) { try { canvas.style.height = '160px'; } catch{} cssH = 160; }
  canvas.width = Math.floor(cssW * dpr);
  canvas.height= Math.floor(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssW,cssH);
  const mode = (state?.subplot) || (canvas.closest('.db-graph')?.dataset.mode) || (canvas.closest('.db-subplot')?.dataset.mode) || 'hist';
  if (mode === 'scatter') drawScatter(ctx, cssW, cssH, data);
  else                    drawHist(ctx, cssW, cssH, data);
}

// --- 原価率ヒストグラム ---
function drawHist(ctx, W, H, data){
  const pts = Array.isArray(data.points) ? data.points : (data.topList||[]);
  if (!pts.length){ ctx.fillStyle='#ccc'; ctx.fillText('データがありません',10,20); return; }
  // 0–100% を 5% 刻みの等幅ビン（rmin/rmax は recompute 時点で適用済み）
  const BIN = 5, N = Math.ceil(100/BIN);
  const bins = new Array(N).fill(0);
  for (const p of pts){
    const pr = Math.max(0, Math.min(0.9999, (p.rate||0))); // 100% は最終ビンに含めるため少し手前で丸め
    const idx = Math.floor(pr*100 / BIN);
    bins[idx] += 1;
  }
  const max = Math.max(1, ...bins);
  const padL=28, padB=28, padR=12, padT=14;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  ctx.save();
  ctx.translate(padL, padT);
  // 軸
  ctx.strokeStyle='rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.moveTo(0, innerH); ctx.lineTo(innerW, innerH); ctx.stroke();
  // 棒
  const bw = innerW / N;
  for(let i=0;i<N;i++){
    const h = Math.max(1, innerH * (bins[i]/max));
    const x = i*bw + 1, y = innerH - h;
    ctx.fillStyle='rgba(98,221,255,.85)';
    ctx.fillRect(x, y, Math.max(1, bw-2), h);
  }
  // 目盛（0,50,100）
  ctx.fillStyle='#fff'; ctx.font='11px system-ui'; ctx.textBaseline='top';
  ctx.fillText('0%', 0, innerH+4);
  ctx.textAlign='center'; ctx.fillText('50%', innerW/2, innerH+4);
  ctx.textAlign='right';  ctx.fillText('100%', innerW, innerH+4);
  ctx.restore();
}

// --- 売上×原価率 散布図 ---
function drawScatter(ctx, W, H, data){
  const pts = Array.isArray(data.points) ? data.points : (data.topList||[]);
  if (!pts.length){ ctx.fillStyle='#ccc'; ctx.fillText('データがありません',10,20); return; }
  // 軸余白
  const padL=40, padB=30, padR=12, padT=12;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  // スケール
  const xs = pts.map(p=>p.sales||0);
  const xMax = Math.max(1, ...xs);
  ctx.save(); ctx.translate(padL, padT);
  // 軸
  ctx.strokeStyle='rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.moveTo(0, innerH); ctx.lineTo(innerW, innerH); ctx.stroke(); // x
  ctx.beginPath(); ctx.moveTo(0, 0);        ctx.lineTo(0, innerH);  ctx.stroke(); // y
  // 点
  ctx.fillStyle='rgba(167,139,250,.9)'; // ラベンダー
  const r = 2.5;
  for (const p of pts){
    const x = (p.sales/xMax) * innerW;
    const y = innerH - (Math.max(0, Math.min(1, p.rate||0)) * innerH);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  }
  // 軸ラベル（簡易）
  ctx.fillStyle='#fff'; ctx.font='11px system-ui';
  ctx.textAlign='right'; ctx.fillText('売上', innerW, innerH+16);
  ctx.save(); ctx.translate(-24, innerH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign='center'; ctx.fillText('原価率(%)', 0, 0);
  ctx.restore();
  ctx.restore();
}

// --- 円グラフ（機種構成比） ---
function drawPie(ctx, W, H, data){
  const R = Math.min(W,H)*0.42, cx=W*0.5, cy=H*0.52, inner=R*0.48;
  let start= -Math.PI/2;
  const total = data.total || 1;
  const colors = makePalette(data.machines.length);
  data.machines.forEach((m,i)=>{
    const ang = (m.sales/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.fillStyle = colors[i%colors.length];
    ctx.arc(cx,cy,R,start,start+ang,false); ctx.closePath(); ctx.fill();
    start += ang;
  });
  // ドーナツ内側
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,inner,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  // 凡例（上位5）
  const top5 = data.machines.slice(0,5);
  ctx.font='12px system-ui'; ctx.textBaseline='top';
  let y=8;
  top5.forEach((m,i)=>{
    ctx.fillStyle=colors[i%colors.length]; ctx.fillRect(8,y+3,10,10);
    ctx.fillStyle='#fff'; ctx.fillText(`${i+1}. ${m.name}  ¥${fmt(m.sales)}`, 24, y);
    y+=18;
  });
}

// --- TopN 棒グラフ ---
function drawBars(ctx, W, H, data){
  const topN = data.machines.slice(0,8);
  const max = Math.max(1, ...topN.map(m=>m.sales));
  const barW = (W-40)/topN.length;
  ctx.font='11px system-ui'; ctx.textBaseline='bottom'; ctx.strokeStyle='rgba(255,255,255,.2)';
  // 軸
  ctx.beginPath(); ctx.moveTo(20,H-28); ctx.lineTo(W-10,H-28); ctx.stroke();
  topN.forEach((m,i)=>{
    const x = 20 + i*barW + 6;
    const h = Math.max(2, (H-60)*(m.sales/max));
    ctx.fillStyle = 'rgba(98,221,255,.9)';
    ctx.fillRect(x, H-28-h, Math.max(8,barW-14), h);
    ctx.fillStyle='#fff'; ctx.fillText(short(m.name), x, H-12);
  });
}

// --- パレット ---
function makePalette(n){
  const base = ['#76E4F7','#A78BFA','#F472B6','#F59E0B','#34D399','#60A5FA','#F87171','#22D3EE'];
  const out=[]; for(let i=0;i<n;i++) out.push(base[i%base.length]); return out;
}

// === utils（dashlib内で自己完結） ===
const num = v => { const n = Number(String(v).replace(/[^\d.-]/g,'')); return isFinite(n)?n:0; };
const str = v => (v==null?'':String(v).trim());
const fmt = n => (Number(n)||0).toLocaleString('ja-JP');
const short = s => (String(s).length>6 ? String(s).slice(0,6)+'…' : String(s));
