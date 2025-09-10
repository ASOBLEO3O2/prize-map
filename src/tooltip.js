// === src/draw/tooltip.js（固定サイズ版・全文） ===
// input.js からは formatTip(h) / showTip(html,x,y) / hideTip() を使う。
// h は { label, boothId, prize, sales, count, cost, rate } 想定。

import { strokeFromRate } from './utils.js';

let tipEl;

export function showTip(html, sx, sy) {
  const el = ensureEl();
  el.innerHTML = html;
  position(el, sx, sy);
  el.style.opacity = '1';
}

export function hideTip() {
  const el = document.getElementById(TPID);
  if (el) el.style.opacity = '0';
}

// ── 表示フォーマット ────────────────────────────────
// タイトル=ブースID（太字）
// 景品名=折り返し全文（固定サイズ内・必要なら内部スクロール）
// 指標=売上/単価/消化数/消化額/原価率
export function formatTip(h) {
  const boothId = safe(h?.boothId) || '(ブース不明)';
  const prize   = safe(h?.prize);

  const sales = toNum(h?.sales);
  const count = toNum(h?.count);
  const cost  = toNum(h?.cost);
  const rate  = toNum(h?.rate);
  const unit  = (isFinite(sales) && isFinite(count) && count > 0) ? (sales / count) : NaN;


  
  const salesBg    = cssColorFromSales(sales);
  const rateBorder = (isFinite(rate) ? strokeFromRate(rate) : null);

  const rows = [
    ['売上',    yen(sales)],
    ['単価',    yen(unit)],
    ['消化数',  num(count)],
    ['消化額',  yen(cost)],
    ['原価率',  pct(rate)],
  ];

  return `
    <div class="tp-wrap" style="background:${esc(salesBg||'rgba(30,30,30,.9)')};border:3px solid ${esc(rateBorder||'rgba(255,255,255,.2)')};border-radius:10px;">
      <div class="tp-title" title="${esc(boothId)}">${esc(boothId)}</div>
      ${prize ? `<div class="tp-prize" title="${esc(prize)}">${esc(prize)}</div>` : ``}
      <div class="tp-grid">
        ${rows.map(([k,v]) => `<div class="tp-row"><div class="tp-key">${esc(k)}</div><div class="tp-val">${esc(v)}</div></div>`).join('')}
      </div>
    </div>
  `;
}

// ── internals ───────────────────────────────────────
const TPID  = 'asoble-tip';
const POPUW = 320;   // ← 固定「幅」px
const POPUH = 220;   // ← 固定「高さ」px

function ensureEl() {
  let el = document.getElementById(TPID);
  if (!el) {
    el = document.createElement('div');
    el.id = TPID;
    el.style.cssText = `
      position: fixed; left: 0; top: 0; z-index: 3000;
      width: ${POPUW}px;                                /* 横は固定 */
     /* 高さは内容に合わせる（スクロール禁止のためオーバーフロー時は後段でscale） */
      background: rgba(15, 15, 20, 0.96);
      color: #eee;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.45);
      padding: 10px 12px;
      pointer-events: none;
      transition: opacity .12s ease;
      opacity: 0;
      font: 12px/1.55 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Noto Sans JP", sans-serif;
       overflow: hidden;  /* スクロール禁止 */
    `;
    document.body.appendChild(el);

    // 内部スクロール用のラッパ（固定枠内でスクロール）
    const style = document.createElement('style');
    style.textContent = `
      #${TPID} .tp-wrap  { /* 外側でスケールするので内部スクロールはしない */ }
      #${TPID} .tp-title { font-weight: 800; font-size: 13px; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #${TPID} .tp-prize { font-size: 12px; opacity: .97; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* 1行固定 */
      #${TPID} .tp-grid  { display: grid; gap: 6px; }
      #${TPID} .tp-row   { display: grid; grid-template-columns: auto 1fr; align-items: center; padding: 6px 10px; border-radius: 8px; border: 2px solid transparent; }
      #${TPID} .tp-key   { opacity: .78; }
      #${TPID} .tp-val   { text-align: right; font-variant-numeric: tabular-nums; }
    `;
    document.head.appendChild(style);
  }
  return el;
}


// --- helpers ---------------------------------------------------
function cssColorFromSales(sales){
  if (!isFinite(sales)) return null;
  // 1) まず描画側で公開されているCSS色関数があれば使う
  if (typeof window.ASOBLE?.colorForSalesCss === 'function') {
    try { return window.ASOBLE.colorForSalesCss(sales) || null; } catch {}
  }
  // 2) 次に既存の colorFromSales / fillFromSales を試す（CanvasGradientなら弾く）
  const fn = (window.ASOBLE?.colorFromSales || window.ASOBLE?.fillFromSales);
  if (typeof fn === 'function') {
    try {
      const v = fn(sales);
      if (typeof v === 'string') return v; // CSS色としてそのままOK
      // CanvasGradient等はCSSでは使えないためスキップ
    } catch {}
  }
    // 3) フォールバックA：既知の min/max（stats 互換も考慮）で連続色を生成
  const min = Number(window.ASOBLE?.salesMin ?? window.ASOBLE?.stats?.salesMin) || 0;
  const max = Number(window.ASOBLE?.salesMax ?? window.ASOBLE?.stats?.salesMax) || 0;
  
  if (max > min) {
    const t = Math.max(0, Math.min(1, (sales - min) / (max - min)));
    // 緑→黄→赤 の中間を想定（他設定と違和感が出ないよう中庸）
    const hue = 120 - 120 * t;      // 120=緑 → 0=赤
    const sat = 80;                 // %
    const lig = 55;                 // %
    return `hsl(${Math.round(hue)} ${sat}% ${lig}%)`;
      }
  // 4) フォールバックB：しきい値モードに追従（salesThresholdを境に2値）
  const th = Number(window.ASOBLE?.salesThreshold);
  const mode = String(window.ASOBLE?.salesMode || '').toLowerCase();
  if (isFinite(th) && th > 0 && mode === 'threshold') {
    return (sales >= th) ? 'hsl(8 80% 55%)' /*高*/ : 'hsl(210 10% 35%)' /*低（減光）*/;
  }
  // 5) それでも取得不可なら中庸色（見えることを最優先）
  return 'hsl(200 12% 38%)';
}

function position(el, sx, sy) {
  const pad = 14;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
   el.style.left = (sx + pad) + 'px';
  el.style.top  = (sy + pad) + 'px';
  el.style.transformOrigin = 'left top';
  el.style.transform = 'scale(1)';           /* いったん等倍で測る */

  const r = el.getBoundingClientRect();
    // 1) はみ出す場合は scale で全体を収める
  const m = 6;
  const sxScale = (vw - m*2) / r.width;
  const syScale = (vh - m*2) / r.height;
  const scale = Math.min(1, sxScale, syScale);
  if (scale < 1) el.style.transform = `scale(${scale})`;

  // 2) scale 後の再配置（右端/下端を超えないようにする）
  const rr = el.getBoundingClientRect();
  let x = rr.left, y = rr.top;
  if (rr.right  > vw - m) x = Math.max(m, vw - rr.width  - m);
  if (rr.bottom > vh - m) y = Math.max(m, vh - rr.height - m);
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

function row(k, v, bgColor, borderColor) {
  const style = `${bgColor ? `background:${esc(bgColor)};` : ''}${borderColor ? `border-color:${esc(borderColor)};` : ''}`;
  return `<div class="tp-row" style="${style}"><div class="tp-key">${esc(k)}</div><div class="tp-val">${esc(v)}</div></div>`;
}

function yen(v){
  return (isFinite(v) ? new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0
  }).format(v) : '—');
}
function num(v){
  return (isFinite(v) ? new Intl.NumberFormat('ja-JP').format(v) : '—');
}
function pct(v){
  return (isFinite(v) ? (v * 100).toFixed(1) + '%' : '—');
}

function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function safe(v){ return (v===undefined||v===null) ? '' : String(v); }
function toNum(v){ const n = typeof v === 'string' ? Number(v.replace(/[, ]/g,'')) : Number(v); return Number.isFinite(n) ? n : NaN; }