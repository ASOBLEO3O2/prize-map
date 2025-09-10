// === src/render.js ===
import { COLS, startX, startY, gapX, gapY, cellStrokeFallback, labelColor } from './constants.js';
import { clamp, toNumberLoose, strokeFromRate, fillFromSalesFunc } from './utils.js';
import { layoutItemsEqualSplit } from './layout.js';

 function fillBlinkRadial(ctx, x, y, w, h, baseColor, id){
     // 位相 0..1（IDでデシンク）。周期 ~2.5s
     const t   = (typeof performance !== 'undefined' ? performance.now() : Date.now());
     const off = ((typeof id === 'string' ? id.length : id|0) % 997) / 997;
     const phase = (t * 0.0034 + off) % 1; // ≈2.5s
     const cx = x + w * 0.5, cy = y + h * 0.5;
     const rMax = Math.max(1, Math.max(w, h) * 0.9);
     // 正規化ヘルパ（上端は 1-EPS に丸める）
     const EPS = 1e-6;
     const clamp01e = (v)=> (v <= 0 ? 0 : (v >= 1 ? 1 - EPS : v));
     // リング中心位置(0..1)と幅(0..1)
     const ringPos = clamp01e(phase);
     const ringWid = 0.12;
     let s0 = 0.0;
     let s1 = clamp01e(ringPos - ringWid);
     let s2 = clamp01e(ringPos);
     let s3 = clamp01e(ringPos + ringWid*0.6);
     let s4 = 1 - EPS;
     // 単調増加を保証（同値は EPS で分離）
     if (s1 < s0) s1 = s0;
     if (s2 <= s1) s2 = Math.min(s1 + EPS, s4);
     if (s3 <= s2) s3 = Math.min(s2 + EPS, s4);
     // グラデーション（全域 rMax）
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMax);
      const cFade   = baseColor.replace(/rgba\(([^)]+),\s*([0-9]*\.?[0-9]+)\)/, 'rgba($1, 0.00)');
     const cStrong = baseColor.replace(/rgba\(([^)]+),\s*([0-9]*\.?[0-9]+)\)/, 'rgba($1, 0.90)');
     g.addColorStop(s0, cFade);
     g.addColorStop(s1, cFade);
     g.addColorStop(s2, cStrong);
     g.addColorStop(s3, cFade);
     g.addColorStop(s4, cFade);
      ctx.fillStyle = g;
      ctx.fill();
 }

// 角丸パス（副作用なし：パスのみ作成）
function pathRoundRect(ctx, x, y, w, h, r){
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    // パスは開かない（stroke/fill側で使用）
}
  

// ---- サイドパネル状態 ----
function getSelectedMachines(){
  const v = window.ASOBLE?.selectedMachines;
  if (v instanceof Set) return v;
  try {
    const arr = JSON.parse(localStorage.getItem('asoble:machines') || '[]');
    if (Array.isArray(arr)) return new Set(arr.map(String));
  } catch {}
  return new Set();
}
function shouldShowLabel(){
  if (typeof window.ASOBLE?.showLabel === 'boolean') return !!window.ASOBLE.showLabel;
  try {
    const st = JSON.parse(localStorage.getItem('asoble:view') || '{}');
    if ('showLabel' in st) return !!st.showLabel;
    if ('showMachineLabel' in st) return !!st.showMachineLabel; // 旧キー互換
  } catch {}
  return true;
}

// 下地の黒ベール（0=透明,1=真っ黒）
function getBaseShade(){
  if (typeof window.ASOBLE?.bgOpacity === 'number') return clamp(window.ASOBLE.bgOpacity, 0, 1);
  try {
    const st = JSON.parse(localStorage.getItem('asoble:view') || '{}');
    const v = (typeof st.bgOpacity === 'number') ? st.bgOpacity : 0;
    return clamp(v, 0, 1);
  } catch { return 0; }
}

// 選択外を暗くする透明度（0..1）
function getDimOpacity(){
  try{
    let v = window.ASOBLE?.dimOpacity;
    if (typeof v !== 'number'){
      const st = JSON.parse(localStorage.getItem('asoble:view') || '{}');
      v = st?.dimOpacity;
    }
    if (typeof v !== 'number') v = 0.35;
    return Math.min(1, Math.max(0, v));
  }catch{ return 0.35; }
}

// 売上しきい値（0で無効）
function getSalesThreshold(){
  if (typeof window.ASOBLE?.salesThreshold === 'number') return Math.max(0, Number(window.ASOBLE.salesThreshold) || 0);
  try {
    const st = JSON.parse(localStorage.getItem('asoble:view') || '{}');
    return Math.max(0, Number(st?.salesThreshold || 0));
  } catch { return 0; }
}

// ラベル別の回転角（deg）
function getRotationDegFor(label){
  try{
    const map = (window.ASOBLE?.rotationMap)
      || JSON.parse(localStorage.getItem('asoble:rotations') || '{}');
    const v = map?.[label];
    const n = Number(v) || 0;
    return ((n % 360) + 360) % 360;
  }catch{ return 0; }
}

// 塗り/枠の有効フラグと塗りモード（'threshold' | 'average'）
function getFillEnabled(){
  if (typeof window.ASOBLE?.fillEnabled === 'boolean') return !!window.ASOBLE.fillEnabled;
  try { const st = JSON.parse(localStorage.getItem('asoble:view') || '{}'); return ('fillEnabled' in st) ? !!st.fillEnabled : true; } catch { return true; }
}
function getStrokeEnabled(){
  if (typeof window.ASOBLE?.strokeEnabled === 'boolean') return !!window.ASOBLE.strokeEnabled;
  try { const st = JSON.parse(localStorage.getItem('asoble:view') || '{}'); return ('strokeEnabled' in st) ? !!st.strokeEnabled : true; } catch { return true; }
}
function getFillMode(){
  const v = (()=>{
    if (typeof window.ASOBLE?.fillMode === 'string') return window.ASOBLE.fillMode;
    try { const st = JSON.parse(localStorage.getItem('asoble:view') || '{}'); return st?.fillMode; } catch {}
    return undefined;
  })();
  return (v === 'average') ? 'average' : 'threshold';
}

// --- 機種名ノーマライズ（全角→半角 / 空白除去 / 大文字化）---
function normalizeMachineName(s){
  const toHalf = (t) => t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const base = String(s || '').trim();
  return toHalf(base).replace(/\s+/g,'').toUpperCase();
}
function getSelectedMachinesNormalized(){
  const raw = getSelectedMachines();
  const out = new Set();
  for (const m of raw) out.add(normalizeMachineName(m));
  return out;
}

// ---- ラベル移動：オフセット（{ [label]: {dx,dy} }）----
const LS_OFF = 'asoble:offsets';
function loadOffsets(){ try{ const o=JSON.parse(localStorage.getItem(LS_OFF)||'{}'); return (o&&typeof o==='object')?o:{}; }catch{return{};} }
function getOffset(label){ const o = (window.ASOBLE?.offsets)||loadOffsets(); const v = o && o[label]; return (v&&isFinite(v.dx)&&isFinite(v.dy))?v:{dx:0,dy:0}; }

// ---- 本体 ----
export default function drawAll(ctx, canvas, view, bgImg, labels, byLabel, salesMin, salesMax, hitRects){
  // 0) 全クリア
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // --- 今フレームの公開用バッファ（検証/デバッグ用） ---
  const __frameBlinkIds = [];
  const __frameColorIds = [];
  const __frameDebug    = [];

    // --- 点滅ティッカー管理 ---
  function ensureBlinkTicker(){
    try{
      const on  = !!(window.ASOBLE && window.ASOBLE.blinkEnabled);
      const run = !!(window.ASOBLE && window.ASOBLE.__blinkTicker);
      if (on && !run){
        const tick = ()=>{
          if (window.ASOBLE?.blinkEnabled){
            window.ASOBLE.__now = performance.now();
            window.ASOBLE.requestRedraw?.();
            window.ASOBLE.__blinkTicker = requestAnimationFrame(tick);
          } else {
            window.ASOBLE.__blinkTicker = null;
          }
        };
        window.ASOBLE.__blinkTicker = requestAnimationFrame(tick);
      } else if (!on && run){
        cancelAnimationFrame(window.ASOBLE.__blinkTicker);
        window.ASOBLE.__blinkTicker = null;
      }
    }catch{}
  }
  ensureBlinkTicker();

  // 1) ワールド座標へ（以降はパン/ズーム適用）
  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  // 1-1) 背景
  if (bgImg && bgImg.width && bgImg.height){
    ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height);
  }

  // 1-2) 黒ベール
  {
    const a = getBaseShade();
    if (a > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      const wX = -view.tx / view.scale;
      const wY = -view.ty / view.scale;
      const wW = canvas.width  / view.scale;
      const wH = canvas.height / view.scale;
      ctx.fillRect(wX, wY, wW, wH);
      ctx.restore();
    }
  }

  // 2) 前景（売上→色）
  const selSet  = getSelectedMachinesNormalized();
  const hasSel  = selSet.size > 0;
  const showLbl = shouldShowLabel();
  const threshold = getSalesThreshold();
  const fillEnabled   = getFillEnabled();
  const strokeEnabled = getStrokeEnabled();
  const fillMode      = getFillMode();
  const salesMode     = window.ASOBLE?.salesMode || 'threshold';
  // 新UIの順位指定に統一（後方互換：旧フィールドをフォールバック）
  const rankDir       = (window.ASOBLE?.salesRankDir === 'gte') ? 'gte' : 'lte'; // 'lte' = 1位からN台, 'gte' = 最下位からN台
  const rankValue     = Math.max(1,
                          Number(window.ASOBLE?.salesRankValue)
                          || Number(window.ASOBLE?.salesRankTop)
                          || Number(window.ASOBLE?.salesRankBottom)
                          || 10);
  const quantile      = Math.max(2, Math.min(10, Number(window.ASOBLE?.salesQuantile)||4));
  const blinkEnabled  = !!window.ASOBLE?.blinkEnabled;
   // 「点滅で強調」時の既定はハイライト対象だけ点滅
    let blinkRuleRaw = window.ASOBLE?.blinkRule;
  if (!blinkRuleRaw) {
    if (window.ASOBLE?.highlightStyle === 'blink') {
      blinkRuleRaw = 'highlight-only';
    } else {
      blinkRuleRaw = 'mode-based';
    }
  }
  const blinkRule = (blinkRuleRaw === 'low-rate') ? 'rate-lte' : blinkRuleRaw; // 後方互換
  window.ASOBLE.__blinkRuleResolved = blinkRule;
  const nowMs         = window.ASOBLE?.__now || performance.now();
  const devUseBooths  = !!window.ASOBLE?.devUseBooths;
  // 後方互換: もし 1.0 を超える値（%）が来たら 100 で割る
  const _normPct = (v, d)=> {
    let n = (typeof v === 'number') ? v : d;
    if (n > 1) n = n / 100;
    if (!isFinite(n) || n < 0) n = d;
    return Math.min(1, n);
  };
  const rateLTE       = _normPct(window.ASOBLE?.rateBlinkLTE, 0.10);
  const rateGTE       = _normPct(window.ASOBLE?.rateBlinkGTE, 0.33);
    // --- rank用カットオフ（遅延計算 & キャッシュ）---
  let __rankCutoffsCache = null;
  function getRankCutoffs(){
    if (__rankCutoffsCache) return __rankCutoffsCache;
    try{
      // 選択セット（なければ空 Set=全体扱い）
      const selFromGlobal = window.ASOBLE?.selectedMachines;
       const selRaw = (selFromGlobal instanceof Set)
        ? selFromGlobal
        : (()=>{
            try{
              const a = JSON.parse(localStorage.getItem('asoble:machines')||'[]');
              return new Set(Array.isArray(a) ? a.map(String) : []);
            }catch{ return new Set(); }
          })();
          const sel = new Set([...selRaw].map(m => normalizeMachineName(m)));
          const hasSel = sel.size > 0;

      // 対象売上の収集（選択がある場合のみ機種フィルタ）
      const arr = [];
      for (const lab of labels){
        const rows = byLabel.get(lab) || [];
        for (const r of rows){
          const mach = String(r['対応マシン名'] ?? '').trim();
          const mKey = normalizeMachineName(mach);
          if (hasSel && !sel.has(mKey)) continue;
          const v = toNumberLoose(r['総売上']);
          if (isFinite(v) && v > 0) arr.push(v);
        }
      }
      if (arr.length === 0){
        __rankCutoffsCache = { topCutoff: Infinity, bottomCutoff: -Infinity };
        return __rankCutoffsCache;
      }
      
      // 降順 / 昇順で N 位の値をしきいにする
      const desc = arr.slice().sort((a,b)=>b-a);
      const asc  = desc.slice().reverse();
      const topCutoff    = desc[Math.min(Math.max(0, rankValue-1), desc.length-1)];
      const bottomCutoff = asc[Math.min(Math.max(0, rankValue-1), asc.length-1)];
      __rankCutoffsCache = { topCutoff, bottomCutoff };
      return __rankCutoffsCache;
    }catch{
      __rankCutoffsCache = { topCutoff: Infinity, bottomCutoff: -Infinity };
      return __rankCutoffsCache;
    }
  }

  // 売上ハイライト条件判定
  function isHighlighted(val){
    const s = Number(val)||0;
    if (!isFinite(s) || s<=0) return false;
    switch(salesMode){
      case 'average': {
        // 平均モード：UIの「以上／以下」を反映
        const dir = (window.ASOBLE?.salesAverageDir === 'lte') ? 'lte' : 'gte';
        if (!isFinite(scopeAvg)) return false;
        return (dir === 'lte')
        ? (s <= scopeAvg)   // 以下
        : (s >= scopeAvg);  // 以上
        }
        case 'rank': {
          const { topCutoff, bottomCutoff } = getRankCutoffs();
          // dir に応じて「上位N（>=）」／「下位N（<=）」を切替
          return (rankDir === 'gte') ? (s <= bottomCutoff) : (s >= topCutoff);
        }
        case 'quantile': {
        // 分位（選択スコープ）で境界を算出
        const selRaw = window.ASOBLE?.selectedMachines;
        const hasSel = selRaw instanceof Set && selRaw.size>0;
        const sel = hasSel
          ? new Set([...selRaw].map(m => normalizeMachineName(m)))
          : new Set();
        const arr = [];
        for (const lab of labels){
          const rows = byLabel.get(lab) || [];
          for (const r of rows){
            const mach = String(r['対応マシン名'] ?? '').trim();
            const mKey = normalizeMachineName(mach);
            if (hasSel && !sel.has(mKey)) continue;
            const v = toNumberLoose(r['総売上']);
            if (isFinite(v)) arr.push(v);
          }
        }
        arr.sort((a,b)=>a-b);
        if (arr.length < quantile) return true;
        const idx = Math.floor(arr.length*(quantile-1)/quantile);
        const cutoff = arr[idx] || 0;
        return s >= cutoff;
      }
       case 'threshold': {
        // 0 なら無効（= ハイライトなし）
        if (!(threshold > 0)) return false;
        const dir = (window.ASOBLE?.salesThresholdDir === 'lte') ? 'lte' : 'gte';
                // UIと素直に一致させる
        //  - dir==='gte' → 「以上」ボタン → s >= threshold
        //  - dir==='lte' → 「以下」ボタン → s <= threshold
        return dir === 'gte' ? (s >= threshold) : (s <= threshold);
      }
      default:
        return false; // 安全側：不明モードはハイライトなし
    }
  }

  // --- 点滅対象の判定（blinkRule に従う） ---
    function shouldBlink(salesVal, rateVal, highlightedFlag, isSelected){
    // 選択外は絶対に点滅させない（保険）
    if (hasSel && !isSelected) return false;
    const s = Number(salesVal)||0;
    const r = Number(rateVal);
    switch (blinkRule){
      case 'highlight-only':return !!highlightedFlag;
              // ハイライト条件（売上しきい値/順位/平均/分位）に合致したものだけ点滅
      case 'rate-bounds':
        // 原価率が下限以下 または 上限以上 で点滅
        return (isFinite(r) && (r <= rateLTE || r >= rateGTE));
      case 'below-threshold': {
         if (!(threshold > 0) || !isFinite(s)) return false;
        // しきい値モードの「ハイライトの逆側」を点滅
        return !highlightedFlag;
      }
      case 'rate-lte':
        return (isFinite(r) && r <= rateLTE);
      case 'rate-gte':
        return (isFinite(r) && r >= rateGTE);
      case 'rank-top':{
        const { topCutoff } = getRankCutoffs();
        return (isFinite(s) && s >= topCutoff);
     }
          case 'rank-bottom':{
          const { bottomCutoff } = getRankCutoffs();
          return (isFinite(s) && s <= bottomCutoff);
          }
        case 'mode-based':
      default:
        // 既存互換：モードの「非ハイライト側」を点滅
        return !highlightedFlag;
    }
  }

  // 選択に応じたスコープ計算
  let scopeMin = salesMin, scopeMax = salesMax;
  let scopeSum = 0, scopeCnt = 0;
  if (hasSel) {
    let mn = Infinity, mx = -Infinity;
    for (const label of labels) {
      const items = byLabel.get(label) || [];
      for (const row of items) {
        const machine = String(row['対応マシン名'] ?? '').trim();
        // 機種名は正規化キーで比較（全角→半角・空白除去・大文字化）
        if (!selSet.has(normalizeMachineName(machine))) continue;
        const s = toNumberLoose(row['総売上']);
        if (!isFinite(s)) continue;
        if (s < mn) mn = s;
        if (s > mx) mx = s;
        scopeSum += s; scopeCnt += 1;
      }
    }
    if (mx > mn) { scopeMin = mn; scopeMax = mx; }
  } else {
    for (const label of labels) {
      const items = byLabel.get(label) || [];
      for (const row of items) {
        const s = toNumberLoose(row['総売上']); if (isFinite(s)) { scopeSum += s; scopeCnt += 1; }
      }
    }
  }
  const scopeAvg = (scopeCnt > 0) ? (scopeSum / scopeCnt) : 0;
  // 公開: ツールチップ等が同じスケールで色を算出できるよう同期
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.salesMin = scopeMin;
  window.ASOBLE.salesMax = scopeMax;

  const fillFromSalesScoped = (v) => fillFromSalesFunc(toNumberLoose(v), scopeMin, scopeMax);
  // 公開: ツールチップや外部UIが同じスケール関数を利用できるようにする
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.salesMin = scopeMin;
  window.ASOBLE.salesMax = scopeMax;
  window.ASOBLE.colorForSalesCss = (sales) => fillFromSalesScoped(sales);
  
  // === 開発用：ASOBLE.booths だけで判定を作る（描画より先・早期 return）===
  if (devUseBooths && Array.isArray(window.ASOBLE?.booths) && window.ASOBLE.booths.length){
    const to01 = v => (Number(v) > 1 ? Number(v)/100 : Number(v));
    for (const b of window.ASOBLE.booths){
      const id  = b.id ?? b.label ?? b.name ?? String(b._id ?? '');
      const mch = b.machine ?? b.machineName ?? b.type ?? '';
      const mKey = normalizeMachineName(mch);
      if (hasSel && !selSet.has(mKey)) continue; // 選択外は無視
      const crRaw = b.costRate ?? b.rate ?? b.cost_ratio ?? b.costRatePercent;
      const cr = to01(crRaw);
      const blink = isFinite(cr) && (cr <= rateLTE || cr >= rateGTE);
      if (!id) continue;
      if (blink) __frameBlinkIds.push(id);
      __frameDebug.push({ id, machine:mch, rate:cr, highlighted:false, blink });
    }
    try{
      window.ASOBLE._frameBlinkIds = __frameBlinkIds;
      window.ASOBLE._frameColorIds = __frameColorIds;
      window.ASOBLE._frameDebug    = __frameDebug;
      window.dispatchEvent(new CustomEvent('asoble:blink-scan', {
        detail: { blinkIds: __frameBlinkIds, colorIds: __frameColorIds, debug: __frameDebug }
      }));
    }catch{}
    ctx.restore(); // world transform
    return;
  }

  // 描画開始
  hitRects.length = 0;
  let x = startX, y = startY, col = 0, rowMaxH = 0;
  const C = Math.max(1, (window.ASOBLE?.layoutCols|0) || COLS); // 動的列数

  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.groupBounds = {};
  const __GB = window.ASOBLE.groupBounds;

  for (const label of labels){
    const items = byLabel.get(label) || [];
    if (!items.length) continue;

    const { groupW: W, groupH: H, placements, n } = layoutItemsEqualSplit(items);
    if (col >= C){ col = 0; x = startX; y += rowMaxH + gapY; rowMaxH = 0; }

    const { dx, dy } = getOffset(label);
    const rawBaseX = x + dx, rawBaseY = y + dy;
    let baseX = rawBaseX, baseY = rawBaseY;
    if (bgImg && bgImg.width && bgImg.height){
      const maxX = Math.max(0, bgImg.width  - W);
      const maxY = Math.max(0, bgImg.height - H);
      baseX = Math.min(Math.max(rawBaseX, 0), maxX);
      baseY = Math.min(Math.max(rawBaseY, 0), maxY);
    }

    __GB[label] = { x: baseX, y: baseY, w: W, h: H };

    const __deg = getRotationDegFor(label);
    if (__deg !== 0){
      ctx.save();
      const __cx = baseX + W/2, __cy = baseY + H/2;
      ctx.translate(__cx, __cy);
      ctx.rotate(__deg * Math.PI / 180);
      ctx.translate(-__cx, -__cy);
    }

    for (let i = 0; i < n; i++){
      const p   = placements[i];
      const row = items[i];

      const machine = String(row['対応マシン名'] ?? '').trim();
      // 選択判定も正規化キーで
      const mKey    = normalizeMachineName(machine);
      const isSel   = !hasSel || selSet.has(mKey);
      const sales = toNumberLoose(row['総売上']);
      const count = toNumberLoose(row['消化数']);
      const cost  = toNumberLoose(row['消化額']);
      // 率：売上/消化額から算出。ダメなら costRate 系にフォールバック（%も許容）
      let rate  = (isFinite(sales) && sales > 0) ? (cost * 1.1) / sales : NaN;
      if (!isFinite(rate)){
        let rr = row['原価率'] ?? row['costRate'] ?? row['rate'] ?? row['cost_ratio'] ?? row['costRatePercent'];
        rr = Number(rr);
        if (isFinite(rr)){ rate = (rr > 1 ? rr/100 : rr); }
      }
      const boothId = String(
        row['ブースID'] ?? row['boothId'] ?? row['id'] ?? row['ラベルID'] ?? ''
      );

      // 塗り/枠の分岐に入る前に「ハイライト」「点滅」を一度だけ判定
      const vSales      = sales;
      const highlighted = isHighlighted(vSales);
      const blinkThis   = blinkEnabled && shouldBlink(vSales, rate, highlighted, isSel);

      // 今フレームの公開バッファに蓄積（選択外は除外）
      if (boothId && (!hasSel || isSel)) {
        if (highlighted) __frameColorIds.push(boothId);
        if (blinkThis)   __frameBlinkIds.push(boothId);
        __frameDebug.push({ id: boothId, machine, rate, highlighted, blink: blinkThis });
      }

      const sx = baseX + p.x, sy = baseY + p.y;
      // セルの見た目パラメータ
      const radius = Math.min(p.w, p.h) * 0.12; // 12% の柔らかい角丸（お好みで 0.08〜0.16）
      ctx.save();
      if (hasSel && !isSel) {
                // 非選択は角丸の暗塗りのみ
        pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
        ctx.fillStyle = `rgba(0,0,0,${getDimOpacity()})`;
        ctx.fill();
        ctx.restore();
        } else {
        // ↑ですでに highlighted / blinkThis を算出済み 
        if (!fillEnabled && !strokeEnabled) {
          // 両方OFF → 薄い白の角丸枠のみ
          pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth   = 1 / view.scale;
          ctx.stroke();
          } else {
        
          if (fillEnabled) {
           if (highlighted) {
              pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
              // ハイライト側にも点滅を反映する場合（rank-top等）
              if (blinkThis){
                 // ★図形の点滅：中心→外側へ広がる光（枠線点滅は従来どおり）
               fillBlinkRadial(ctx, sx, sy, p.w, p.h, fillFromSalesScoped(vSales), boothId || i);
              } else {
                ctx.fillStyle = fillFromSalesScoped(vSales);
                ctx.fill();
              } 
            } else {
              pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
              // コンソールからのテスト用: window.ASOBLE.testOpacity を優先
              let a = (window.ASOBLE?.testOpacity ?? getDimOpacity());
              if (blinkThis){
                // 0.55→0.2 に下げてコントラストを強化
                const pulse = 0.20 + 0.80 * Math.abs(Math.sin(nowMs * 0.012));
                a = Math.min(1, a * pulse);
              }
              ctx.fillStyle = `rgba(0,0,0,${a})`;
              ctx.fill();
            } 
          }
           // 枠：薄いベース枠 → 強調枠（レート色）の順で描画
          // ベース枠（常に薄い白）：境界の視認性UP
          pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth   = 1 / view.scale;
          ctx.stroke();

          // 強調枠（有効時のみ）：レート色で上描き
          if (strokeEnabled) {
            const color = strokeFromRate(rate, cellStrokeFallback);
            pathRoundRect(ctx, sx, sy, p.w, p.h, radius);
            if (blinkThis){
              const pulse = 0.55 + 0.45 * Math.abs(Math.sin(nowMs * 0.012));
              ctx.save(); ctx.globalAlpha *= pulse;
              ctx.strokeStyle = color;
              ctx.lineWidth   = (isFinite(rate) ? 2.5 : 1.5) / view.scale;
              ctx.lineJoin    = 'round';
              ctx.stroke(); ctx.restore();
            } else {
              ctx.strokeStyle = color;
              ctx.lineWidth   = (isFinite(rate) ? 2.5 : 1.5) / view.scale;
              ctx.lineJoin    = 'round';
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // ↑ここまででセルの塗り/枠（移動モードON時はサイドで自動OFF）

      hitRects.push({
        x: sx, y: sy, w: p.w, h: p.h,
        label: String(row['ラベルID'] || ''),
        boothId: String(row['ブースID'] || ''),
        prize: String(row['景品名'] || ''),
        machine: machine,
        sales, count, cost, rate
      });
    
     // === 移動モード用オーバーレイ（L/R または 1..n） ===
      if (window.ASOBLE?.moveMode) {
          ctx.save();
          const box = Math.min(p.w, p.h);
          // 基本係数（4分割はさらに小さめ）
          const k = (n === 4) ? 0.35 : 0.40;
          let markFs = Math.max(4, Math.floor(box * k));
          ctx.font = `${markFs}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
  
          // 2分割は L/R、それ以外は 1..n
          let mark = String(i + 1);
          if (n === 2) {
            const cx = baseX + W / 2;
            const centerX = sx + p.w / 2;
            mark = (centerX < cx) ? 'L' : 'R';
          }
          // 横幅フィット（セル幅の 70% 以内に収める：1回だけ補正）
          const maxW = p.w * 0.7;
          let m = ctx.measureText(mark);
          if (m.width > maxW) {
            markFs = Math.max(5, Math.floor(markFs * (maxW / (m.width + 1))));
            ctx.font = `${markFs}px sans-serif`;
          }
  
          // 追加：高さフィット（55%）
          const maxH = p.h * 0.75;
          if (markFs > maxH) { markFs = Math.floor(maxH); ctx.font = `${markFs}px sans-serif`; }

          // 可読性：アウトラインはフォントに比例して薄め・細め
          const outline = Math.max(0.5, Math.round(markFs * 0.12)) / view.scale;
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = outline;
          ctx.fillStyle = '#fff';
        

          ctx.strokeText(mark, sx + p.w / 2, sy + p.h / 2);
          ctx.fillText(mark,   sx + p.w / 2, sy + p.h / 2);
          ctx.restore();
      }
      }// ← close: for (let i = 0; i < n; i++)

    // ===== group-level (per label) =====
    if (window.ASOBLE?.activeLabel === label){
      ctx.save();
      const dash = 6 / view.scale;
      if (ctx.setLineDash) ctx.setLineDash([dash, dash]);
      ctx.lineWidth = 3 / view.scale;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(baseX, baseY, W, H);
      ctx.restore();
    }
    // 回転はテキスト描画の前に解除（ラベル文字は水平表示）
    if ((__deg ?? 0) !== 0) ctx.restore();

    if (showLbl){ 
         // もっと小さめ：min(W,H)*0.08 を基準にし、8〜14pxに制限
       let fs = Math.max(8, Math.min(14, Math.floor(Math.min(W, H) * 0.08)));
        ctx.font = `${fs}px sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 文字列を2行に分割（スペースで区切る or 8文字ごと）
        const parts = label.split(/\s+/);
        let lines = [];
        if (parts.length > 1) {
          lines = [parts[0], parts.slice(1).join(" ")];
        } else if (label.length > 8) {
          lines = [label.slice(0, Math.ceil(label.length/2)), label.slice(Math.ceil(label.length/2))];
        } else {
          lines = [label];
        }
        const lineHeight = fs * 1.2;
        const centerY = baseY + H / 2;
        if (lines.length === 1) {
          ctx.fillText(lines[0], baseX + W / 2, centerY);
        } else {
          ctx.fillText(lines[0], baseX + W / 2, centerY - lineHeight/2);
          ctx.fillText(lines[1], baseX + W / 2, centerY + lineHeight/2);
        }
      }
      // 次のグループへ
      x += W + gapX;
      col += 1;
      rowMaxH = Math.max(rowMaxH, H);
    } // for (const label of labels)

  // --- 今フレームの判定結果を公開し、イベントも通知 ---
  try {
    window.ASOBLE._frameBlinkIds = __frameBlinkIds;
    window.ASOBLE._frameColorIds = __frameColorIds;
    window.ASOBLE._frameDebug    = __frameDebug;
    window.dispatchEvent(new CustomEvent('asoble:blink-scan', {
      detail: { blinkIds: __frameBlinkIds, colorIds: __frameColorIds, debug: __frameDebug }
    }));
  } catch {}
   // === 追加: 選択オーバーレイ（移動モード中のみ描画） ===
   if (window.ASOBLE && window.ASOBLE.moveMode) {
     try{
       const R = window.ASOBLE.selectRect;
       if (R){
         const x = Math.min(R.x0, R.x1), y = Math.min(R.y0, R.y1);
         const w = Math.abs(R.x1 - R.x0), h = Math.abs(R.y1 - R.y0);
         ctx.save();
         ctx.strokeStyle = 'rgba(0,180,255,0.9)';
         ctx.fillStyle   = 'rgba(0,180,255,0.15)';
         ctx.lineWidth   = 1 / Math.max(1, view.scale);
         if (ctx.setLineDash) ctx.setLineDash([6/Math.max(1,view.scale), 4/Math.max(1,view.scale)]);
         ctx.strokeRect(x,y,w,h); ctx.fillRect(x,y,w,h);
         ctx.restore();
       }
       const picked = new Set(window.ASOBLE.selectedLabels || []);
       if (picked.size){
         ctx.save();
         ctx.strokeStyle = 'rgba(0,180,255,0.95)';
         ctx.lineWidth   = 2 / Math.max(1, view.scale);
         if (ctx.setLineDash) ctx.setLineDash([6/Math.max(1,view.scale), 4/Math.max(1,view.scale)]);
         for (const rr of hitRects){
           if (picked.has(String(rr.label))){
             ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
           }
         }
         ctx.restore();
       }
     } catch {}
   }


   // === 追加: スマートガイド描画（移動中のみ・短い区間） ===
   if (window.ASOBLE?.moveMode && window.ASOBLE?.isDragging && Array.isArray(window.ASOBLE.guideLines)) {
      try {
        ctx.save();
      const lw = 1 / Math.max(1, view.scale);
       ctx.lineWidth = lw;
       for (const g of window.ASOBLE.guideLines) {
         const col = g.color || 'rgba(255,63,180,0.95)';
         ctx.strokeStyle = col;
         if (g.type === 'v') {
           const y0 = (Number.isFinite(g.y0) ? g.y0 : -1e5);
           const y1 = (Number.isFinite(g.y1) ? g.y1 :  1e5);
           ctx.beginPath(); ctx.moveTo(g.x, y0); ctx.lineTo(g.x, y1); ctx.stroke();
         } else if (g.type === 'h') {
           const x0 = (Number.isFinite(g.x0) ? g.x0 : -1e5);
           const x1 = (Number.isFinite(g.x1) ? g.x1 :  1e5);
           ctx.beginPath(); ctx.moveTo(x0, g.y); ctx.lineTo(x1, g.y); ctx.stroke();
         } else if (g.type === 'measure-h') {
           // 短い両矢印＋ラベル
           const y = g.y;
           ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); ctx.stroke();
           // 矢印
           const a = 6 / Math.max(1, view.scale);
           ctx.beginPath(); ctx.moveTo(g.x0, y); ctx.lineTo(g.x0+a, y-a/2); ctx.lineTo(g.x0+a, y+a/2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
           ctx.beginPath(); ctx.moveTo(g.x1, y); ctx.lineTo(g.x1-a, y-a/2); ctx.lineTo(g.x1-a, y+a/2); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
           // ラベル
           ctx.fillStyle = '#fff';
           ctx.font = `${Math.max(10, Math.floor(12/Math.max(1, view.scale)))}px sans-serif`;
           ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
           ctx.fillText(g.label || '', (g.x0+g.x1)/2, y - 2/Math.max(1, view.scale));
         } else if (g.type === 'measure-v') {
           const x = g.x;
           ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x, g.y1); ctx.stroke();
           const a = 6 / Math.max(1, view.scale);
           ctx.beginPath(); ctx.moveTo(x, g.y0); ctx.lineTo(x-a/2, g.y0+a); ctx.lineTo(x+a/2, g.y0+a); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
           ctx.beginPath(); ctx.moveTo(x, g.y1); ctx.lineTo(x-a/2, g.y1-a); ctx.lineTo(x+a/2, g.y1-a); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
           ctx.fillStyle = '#fff';
           ctx.font = `${Math.max(10, Math.floor(12/Math.max(1, view.scale)))}px sans-serif`;
           ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
           ctx.fillText(g.label || '', x + 2/Math.max(1, view.scale), (g.y0+g.y1)/2);
         }
       }
        
        ctx.restore();
      } catch {}
    }
   ctx.restore(); // world transform
}
