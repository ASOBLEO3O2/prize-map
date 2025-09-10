import { clamp } from './utils.js';

export function createView(init){
  return { ...init, fitScale: 1 };
}

/** mode: 'fit' | 'x3' | 'free'
 * worldRect は「背景サイズの矩形」を渡してください
 * 例: {left:0, top:0, right:bg.width, bottom:bg.height, width:bg.width, height:bg.height}
 */
export function applyViewMode(view, worldRect, canvas, mode){
   // === 移動モード中ガード（スロットル付き）: re-fit/x3 を無効化 ===
  try {
    if (window.ASOBLE?.moveMode) {
      const now = Date.now();
      if (!window.ASOBLE.__applyBlockWarnAt || now - window.ASOBLE.__applyBlockWarnAt > 500) {
        window.ASOBLE.__applyBlockWarnAt = now;
        // eslint-disable-next-line no-console
        console.warn('[applyViewMode] blocked because moveMode=true', {
          requestedMode: mode,
          // stack は必要に応じてコメントアウト可
          stack: (new Error()).stack
        });
      }
      clampPan(view, canvas, worldRect, 12); return { blocked: true, clamped: true };
    }
  } catch {}

  // === 以降は通常処理（必ず関数内に残す） ===
  if (!worldRect || !worldRect.width || !worldRect.height) {
    view.mode = mode;
    return { blocked: false };
  }

  // 背景基準でフィット倍率
  const margin = 12;
  const availW = Math.max(1, canvas.width  - margin*2);
  const availH = Math.max(1, canvas.height - margin*2);
  const fit = Math.min(availW/worldRect.width, availH/worldRect.height);
  view.fitScale = fit;

  if (mode === 'fit'){
    view.scale = clamp(fit, view.minScale, view.maxScale);
  } else if (mode === 'x3'){
    view.scale = clamp(3, view.minScale, view.maxScale);
  }

  // 背景中心に揃える
  const cx = (worldRect.left + worldRect.right) / 2;
  const cy = (worldRect.top  + worldRect.bottom) / 2;
  view.tx = canvas.width/2  - cx*view.scale;
  view.ty = canvas.height/2 - cy*view.scale;

  clampPan(view, canvas, worldRect, margin);
  view.mode = mode;
  return { blocked: false };

}

/** ホイール/ピンチズーム（フォーカス維持） */
export function zoomAtScreen(view, canvas, toContentXY, screenPt, factor, onModeChange, worldRect){
  const before = toContentXY(screenPt.x, screenPt.y);

  // 背景基準の下限/上限を狭める（必要なら数値調整）
  const dynamicMin = Math.max(view.minScale ?? 0.1, (view.fitScale || 1) * 0.9); // ← fit の 90% まで
  const dynamicMax = (view.maxScale ?? 16); // ← 上限は設定値を尊重
  const s0 = view.scale;
  const s1 = clamp(s0 * factor, dynamicMin, dynamicMax);
  view.scale = s1;

  // フォーカス維持
  view.tx = screenPt.x - before.x * s1;
  view.ty = screenPt.y - before.y * s1;

  clampPan(view, canvas, worldRect);

  const prev = view.mode;
  view.mode = (Math.abs(view.scale-3)<0.001) ? 'x3' : 'free';
  if (prev !== view.mode && onModeChange) onModeChange(view.mode);
}

/** パン可動域のクランプ（背景矩形を基準） */
export function clampPan(view, canvas, worldRect, margin=12){
  if (!worldRect || !worldRect.width || !worldRect.height) return;
  const contentScrW = worldRect.width  * view.scale;
  const contentScrH = worldRect.height * view.scale;
  // tx/ty の許容範囲（四辺に margin の余白は許容）
  const minTx = canvas.width  - worldRect.right  * view.scale - margin;
  const maxTx = -               worldRect.left   * view.scale + margin;
  const minTy = canvas.height - worldRect.bottom * view.scale - margin;
  const maxTy = -               worldRect.top    * view.scale + margin;

  if (contentScrW >= canvas.width){
    view.tx = clamp(view.tx, minTx, maxTx);
  } else {
    const cx = (worldRect.left + worldRect.right) / 2;
    view.tx = canvas.width/2 - cx*view.scale;
  }

  if (contentScrH >= canvas.height){
    view.ty = clamp(view.ty, minTy, maxTy);
  } else {
    const cy = (worldRect.top + worldRect.bottom) / 2;
    view.ty = canvas.height/2 - cy*view.scale;
  }
}

export function ensureZoomToggle(onClick){
  let btn = document.getElementById('zoom-toggle');
  if (!btn){
    btn = document.createElement('button');
    btn.id = 'zoom-toggle';
    Object.assign(btn.style, {
      position:'fixed',
      left:'16px', top:'16px',
      zIndex:'2147483647',
      background:'rgba(0,0,0,0.70)', color:'#fff',
      border:'1px solid rgba(255,255,255,0.35)',
      padding:'8px 12px', borderRadius:'10px',
      font:'12px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP",sans-serif',
      cursor:'pointer', boxShadow:'0 2px 10px rgba(0,0,0,.35)'
    });
    document.body.appendChild(btn);
  }
  btn.onclick = onClick;
  return btn;
}

// === 追加: コンテンツ矩形に基づく初期フィット（必要最小限のエクスポート） ===
 export function fitContent(view, canvas, contentRect, margin=24){
   if (!contentRect || !contentRect.width || !contentRect.height) return;
   const vw = Math.max(1, canvas.width  || 1);
   const vh = Math.max(1, canvas.height || 1);
   const cw = Math.max(1, contentRect.width  + margin*2);
   const ch = Math.max(1, contentRect.height + margin*2);
   const sx = vw / cw, sy = vh / ch;
   const target = Math.min(sx, sy);
   const minS = (view.minScale ?? 0.1), maxS = (view.maxScale ?? 16);
   view.scale = Math.max(minS, Math.min(maxS, target));
   // 中心合わせ（contentRect中心 → 画面中心）
   const cx = (contentRect.left + contentRect.right) / 2;
   const cy = (contentRect.top  + contentRect.bottom) / 2;
   view.tx = vw/2 - cx * view.scale;
   view.ty = vh/2 - cy * view.scale;
   return { scale: view.scale, tx: view.tx, ty: view.ty };
 }