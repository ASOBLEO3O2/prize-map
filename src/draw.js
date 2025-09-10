// === src/draw.js ===
// エクスポートのみ（自動実行しない）: initAndFirstDraw({ labels, byLabel, salesMin, salesMax, bgImg })

import { viewInit, startX, gapX } from './constants.js';
import { measureContentRect, layoutItemsEqualSplit } from './layout.js';
import drawAll from './render.js';
import { bindPointer } from './input.js';
import { hideTip } from './tooltip.js';
import { fitContent, clampPan, createView, applyViewMode, ensureZoomToggle } from './view.js';

export function initAndFirstDraw({ labels = [], byLabel = new Map(), salesMin = 0, salesMax = 0, bgImg = null } = {}) {
  const canvas = document.getElementById('overlay');
  if (!canvas) throw new Error('#overlay not found');
  const ctx = canvas.getContext('2d');

  // 物理解像度をビューポートに合わせる
  const resizeCanvas = () => {
    const w = Math.max(1, window.innerWidth || 1);
    const h = Math.max(1, window.innerHeight || 1);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  };
  resizeCanvas();

   // ワールド矩形（背景＋コンテンツのユニオン）
   // — 列数を動的決定：代表的なグループ幅を推定し、画面幅に収める —
   let approxW = 0, counted = 0;
   for (const label of labels){
     const items = byLabel.get(label)||[]; if (!items.length) continue;
     approxW += (layoutItemsEqualSplit(items).groupW || 0);
     if (++counted >= 8) break; // サンプリング上限
   }
   approxW = (counted>0 ? approxW/counted : 260);
   const availW = Math.max(1, (canvas.width||1) - startX*2);
   const cols = Math.max(1, Math.floor( (availW + gapX) / (approxW + gapX) ));
   const contentRect = measureContentRect(labels, byLabel, cols);
   // 描画側（render.js）の折返しでも同じ列数を使う
   window.ASOBLE = window.ASOBLE || {};
   window.ASOBLE.layoutCols = cols;
   const bgRect = (bgImg && bgImg.width && bgImg.height)
    ? { left: 0, top: 0, right: bgImg.width, bottom: bgImg.height, width: bgImg.width, height: bgImg.height }
    : null;
  const worldRect = (() => {
    if (!bgRect) return contentRect;
    const left = Math.min(bgRect.left, contentRect.left);
    const top = Math.min(bgRect.top, contentRect.top);
    const right = Math.max(bgRect.right, contentRect.right);
    const bottom = Math.max(bgRect.bottom, contentRect.bottom);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  })();

  // ビュー初期化 & 初期fit
   const view = createView({ ...viewInit, mode: 'fit' });
   // 初期フィットは背景ではなく“コンテンツ矩形”を基準にする
   applyViewMode(view, contentRect, canvas, 'fit');

  // ヒット配列と描画
  const hitRects = [];
    // ズームボタンの状態同期（移動モードで無効化/半透明）
  let btn; // ensureZoomToggle 後に代入される
  const syncZoomBtn = () => {
    if (!btn) return;
    const disabled = !!(window.ASOBLE?.moveMode);
    btn.disabled = disabled; btn.style.opacity = disabled ? 0.6 : 1;
  };
  const redraw = () => { syncZoomBtn(); drawAll(ctx, canvas, view, bgImg, labels, byLabel, salesMin, salesMax, hitRects); };

  // 座標変換と当たり判定
  function toContentXY(sx, sy) {
    const r = canvas.getBoundingClientRect();
    return { x: (sx - r.left - view.tx) / view.scale, y: (sy - r.top - view.ty) / view.scale };
  }
  function rectHitAtContent(x, y) {
    for (let i = hitRects.length - 1; i >= 0; i--) {
      const rr = hitRects[i];
      if (x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h) return rr;
    }
    return null;
  }

  // 入力（パン/ズーム/ダブルクリック/ピンチ）
  bindPointer({
     canvas, view, toContentXY, rectHitAtContent, worldRect,
    drawAll: redraw,
    onModeChange: (next) => { applyViewMode(view, worldRect, canvas, next); redraw(); }
  });

  // ズームトグル（fit ↔ x3）
   btn = ensureZoomToggle(() => {
    if (window.ASOBLE?.moveMode) return;
    const next = (view.mode === 'x3') ? 'fit' : 'x3';
    applyViewMode(view, worldRect, canvas, next);
    redraw();
    btn.textContent = (view.mode === 'x3') ? '全体表示' : '3× 表示';
  });

  // 初期表示文言＆状態を即反映
  btn.textContent = (view.mode === 'x3') ? '全体表示' : '3× 表示';
  syncZoomBtn();

  // リサイズ保持
  window.addEventListener('resize', () => {
    // 移動モード中は「リサイズ前に見えていた画面中心のコンテンツ座標」を保持し、
    // リサイズ後に同じ点が画面中心に来るよう tx/ty を補正する
    if (window.ASOBLE?.moveMode) {
          // 1) リサイズ前の画面中心が指すコンテンツ座標を計算
          const beforeCenterX = (canvas.width  / 2 - view.tx) / (view.scale || 1);
          const beforeCenterY = (canvas.height / 2 - view.ty) / (view.scale || 1);
          // 2) リサイズ
          resizeCanvas();
          // 3) 同じコンテンツ点が画面中心に来るように tx/ty を再計算
          view.tx = canvas.width  / 2 - beforeCenterX * (view.scale || 1);
          view.ty = canvas.height / 2 - beforeCenterY * (view.scale || 1);
          redraw();
          return;
        }
    
                 resizeCanvas();
         // リサイズ後も、“x3”は背景基準、“fit”はコンテンツ基準で再適用
         applyViewMode(
           view,
           (view.mode === 'x3' ? worldRect : contentRect),
           canvas,
           (view.mode === 'x3' ? 'x3' : 'fit')
         );
         redraw();
  });
  window.addEventListener('blur', hideTip);

  // 外部API（契約）
  const api = {
    setMode: (m) => { applyViewMode(view, worldRect, canvas, m === 'x3' ? 'x3' : 'fit'); redraw(); },
    reset: () => { applyViewMode(view, worldRect, canvas, 'fit'); redraw(); },
    getMode: () => view.mode || 'fit',
  };
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.viewApi = api;
  window.ASOBLE.requestRedraw = redraw;

  // 初回描画
  redraw();
  return api;
}