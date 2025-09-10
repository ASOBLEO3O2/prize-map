// === src/input.js ===
import { zoomAtScreen, clampPan } from './view.js';
import { hideTip, showTip, formatTip } from './tooltip.js';
import { initHUD } from './hud.js';

// ラベル別回転角
function getRotationDegFor(label){
  if (!label) return 0;
  try{
    const map = (window.ASOBLE?.rotationMap)
      || JSON.parse(localStorage.getItem('asoble:rotations')||'{}');
    const v = map?.[label];
    const n = Number(v) || 0; return ((n%360)+360)%360;
  }catch{ return 0; }
}
function getGroupCenter(label){
  const gb = window.ASOBLE?.groupBounds?.[label];
  if (!gb) return null;
  return { cx: gb.x + gb.w/2, cy: gb.y + gb.h/2 };
}
function unrotatePointAroundLabel(x,y,label){
  const deg = getRotationDegFor(label); if (!deg) return {x,y};
  const c = getGroupCenter(label); if (!c) return {x,y};
  const rad = -deg * Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
  const dx = x - c.cx, dy = y - c.cy;
  return { x: c.cx + dx*cos - dy*sin, y: c.cy + dx*sin + dy*cos };
}

// オフセット保存
const LS_OFF = 'asoble:offsets';
function loadOffsets(){ try{ const o=JSON.parse(localStorage.getItem(LS_OFF)||'{}'); return (o&&typeof o==='object')?o:{}; }catch{return{};} }
function saveOffsets(obj){ localStorage.setItem(LS_OFF, JSON.stringify(obj||{})); }

export function bindPointer({ canvas, view, toContentXY, rectHitAtContent, worldRect, getHitRects, drawAll, onModeChange }){
  // HUDは初回のみ初期化（多重呼び出し防止はhud.js側で担保）
  try { initHUD(); } catch {}

  // ===== 追加: パン一時切替（Space）と右ドラッグパン =====
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.__keySpace = false;
  window.addEventListener('keydown', (e)=>{ if (e.code === 'Space') { window.ASOBLE.__keySpace = true; } }, {passive:true});
  window.addEventListener('keyup',   (e)=>{ if (e.code === 'Space') { window.ASOBLE.__keySpace = false; } }, {passive:true});
  // 右ドラッグパンの有効/無効（既定: 有効）。ASOBLE.rightDragPan=false で無効化可
  const rightPanEnabled = (window.ASOBLE?.rightDragPan !== false);
  // 右ドラッグの“ドラッグした”判定（右クリックメニュー抑止はドラッグ時のみ）
  let rightDrag = false, rightDragMoved = false;
  canvas.addEventListener('contextmenu', (e)=>{
    if (rightPanEnabled && rightDragMoved) {
      // 右ドラッグでパンしていた場合のみメニュー抑止
      e.preventDefault();
    }
    // 通常の右クリック（ドラッグ無し）はメニュー表示を許可
  });

  // ---- ツール状態: 'pan' | 'rect'（既定は pan）
  window.ASOBLE.pointerTool = window.ASOBLE.pointerTool || 'pan';
  function setPointerTool(tool){
    const t = (tool === 'rect') ? 'rect' : 'pan';
    if (window.ASOBLE.pointerTool !== t){
      window.ASOBLE.pointerTool = t;
      window.dispatchEvent(new CustomEvent('asoble:pointerTool', { detail:{ tool:t } }));
    }
  }
  // ショートカット: V=Pan, R=Rect（PowerPoint 風）
  window.addEventListener('keydown', (e)=>{
    if (e.repeat) return;
    if (e.key === 'v' || e.key === 'V') setPointerTool('pan');
    if (e.key === 'r' || e.key === 'R') setPointerTool('rect');
  }, {passive:true});

  // 右クリックのコンテキストメニューは「Panツール時のみ」抑止
  canvas.addEventListener('contextmenu', (e)=>{
    if (window.ASOBLE?.pointerTool === 'pan') e.preventDefault();
  });

    // ========= スマートガイド / スナップ用ヘルパ =========
  // 画面上の8px相当をしきい値に（content座標へ換算）
  const snapTolContent = ()=> 8 / Math.max(1, (view?.scale || 1));
  function collectGuideCandidates(excludeSet){
    const GB = (window.ASOBLE && window.ASOBLE.groupBounds) || {};
    const xs = new Set(); const ys = new Set();
    for (const lab in GB){
      if (excludeSet && excludeSet.has(lab)) continue;
      const g = GB[lab]; if (!g) continue;
      const cx = g.x + g.w/2, cy = g.y + g.h/2;
      xs.add(g.x); xs.add(cx); xs.add(g.x + g.w);
      ys.add(g.y); ys.add(cy); ys.add(g.y + g.h);
    }
    return { xs:[...xs], ys:[...ys] };
  }

  // ※ スナップは今回“完全オフ”にするため、nearestSnapは未使用（残置のみ）

  function dedupGuideLines(lines){
    const key = (g)=> g.type==='v' ? `v:${g.x.toFixed(2)}` : `h:${g.y.toFixed(2)}`;
    const seen = new Set(); const out=[];
    for (const g of lines||[]){
      const k = key(g); if (seen.has(k)) continue;
      seen.add(k); out.push(g);
    }
    return out;
  }


  //========== 共通: 状態公開 ==========
  function setActiveLabel(label){
    window.ASOBLE = window.ASOBLE || {};
    if (window.ASOBLE.activeLabel === label) return;
    window.ASOBLE.activeLabel = label;
    window.dispatchEvent(new CustomEvent('asoble:activeLabel', { detail: { label } }));
  }

  // 回転対応ヒット（2段階）
  function resolveHit(e){
    const pt = toContentXY(e.clientX, e.clientY);
    let h = rectHitAtContent(pt.x, pt.y);
    if (!h || !h.label) return h;
    // ラベル別の逆回転で再判定
    const p2 = unrotatePointAroundLabel(pt.x, pt.y, h.label);
    const h2 = rectHitAtContent(p2.x, p2.y);
    return (h2 && h2.label === h.label) ? h2 : h;
  }

  // --- redraw helper: 再描画 + HUD更新を一括 ---
  function redrawAndUpdate(){
    try{ if (typeof drawAll === 'function') drawAll(); }
    finally{
      try{
        // 互換: hud.js が window.ASOBLE.updateTopStats を提供
        if (window.ASOBLE?.updateTopStats) window.ASOBLE.updateTopStats();
      }catch{}
    }
  }

 // ===== 追加: スマートガイド計算（「最も近い1本」を短いセグメントで） =====
   function computeGuideLines(movingRects, epsilon){
    const GB = (window.ASOBLE && window.ASOBLE.groupBounds) || {};
    if (!movingRects?.length) return [];
    const guides = [];
    const scale = Math.max(1, view?.scale || 1);
    const PAD = 24 / scale;  // ガイド線の上下(左右)に少しはみ出す長さ

    // ビューポート近傍だけ対象（遠方の図形は無視してノイズ削減）
    const vp = {
      x: -view.tx / (view.scale||1),
      y: -view.ty / (view.scale||1),
      w: canvas.width  / (view.scale||1),
      h: canvas.height / (view.scale||1)
    };
    const isNearViewport = (g)=>{
      const M = 200/scale; // 200px ぶん余白
      return !(g.x+g.w < vp.x-M || g.x > vp.x+vp.w+M || g.y+g.h < vp.y-M || g.y > vp.y+vp.h+M);
    };

    // moving は 1 グループ想定：代表だけ見れば十分
    const m = movingRects[0];
    const mx0=m.x, my0=m.y, mx1=m.x+m.w, my1=m.y+m.h;
    const mcx=(mx0+mx1)/2, mcy=(my0+my1)/2;

    // もっとも近い垂直/水平の候補を 1 本だけ選ぶ
    let bestV = null; // {x, y0, y1, hit}
    let bestH = null; // {y, x0, x1, hit}
    let bestVgap = Infinity, bestHgap = Infinity;

    // 等間隔チェック用（横/縦）
    const hGaps = []; // {x0,x1,y,label}
    const vGaps = []; // {y0,y1,x,label}

    for (const lab in GB){
      if (movingRects.some(r=>r.label===lab)) continue;
      const g = GB[lab]; if (!g || !isNearViewport(g)) continue;
      const gx0=g.x, gy0=g.y, gx1=g.x+g.w, gy1=g.y+g.h;
      const gcx=(gx0+gx1)/2, gcy=(gy0+gy1)/2;

      // 垂直：m の左/中/右 と g の左/中/右 を比較
      const vCandidates = [
        {mx:mx0, gx:gx0}, {mx:mcx, gx:gcx}, {mx:mx1, gx:gx1}
      ];
      for (const c of vCandidates){
        const d = Math.abs(c.mx - c.gx);
        if (d < bestVgap){
          bestVgap = d;
          const y0 = Math.max(my0, gy0) - PAD;
          const y1 = Math.min(my1, gy1) + PAD;
          bestV = { type:'v', x:c.gx, y0, y1, hit: d <= epsilon };
        }
      }

      // 水平：m の上/中/下 と g の上/中/下
      const hCandidates = [
        {my:my0, gy:gy0}, {my:mcy, gy:gcy}, {my:my1, gy:gy1}
      ];
      for (const c of hCandidates){
        const d = Math.abs(c.my - c.gy);
        if (d < bestHgap){
          bestHgap = d;
          const x0 = Math.max(mx0, gx0) - PAD;
          const x1 = Math.min(mx1, gx1) + PAD;
          bestH = { type:'h', y:c.gy, x0, x1, hit: d <= epsilon };
        }
      }

      // 等間隔（横）：縦方向が重なっているなら、左右のギャップ候補を保存
      const yOverlap = !(my1 < gy0 || my0 > gy1);
      if (yOverlap){
        const g1 = gx0 - mx1; // [m]右 → [g]左
        const g2 = mx0 - gx1; // [g]右 → [m]左
        if (g1 > 0 && g1 <= epsilon*8) hGaps.push({ x0:mx1, x1:gx0, y:Math.max(my0,gy0)+(Math.min(my1,gy1)-Math.max(my0,gy0))/2, label:Math.round(g1)+'px' });
        if (g2 > 0 && g2 <= epsilon*8) hGaps.push({ x0:gx1, x1:mx0, y:Math.max(my0,gy0)+(Math.min(my1,gy1)-Math.max(my0,gy0))/2, label:Math.round(g2)+'px' });
      }
      // 等間隔（縦）：横方向が重なっているなら、上下のギャップ候補を保存
      const xOverlap = !(mx1 < gx0 || mx0 > gx1);
      if (xOverlap){
        const g1 = gy0 - my1;
        const g2 = my0 - gy1;
        if (g1 > 0 && g1 <= epsilon*8) vGaps.push({ y0:my1, y1:gy0, x:Math.max(mx0,gx0)+(Math.min(mx1,gx1)-Math.max(mx0,gx0))/2, label:Math.round(g1)+'px' });
        if (g2 > 0 && g2 <= epsilon*8) vGaps.push({ y0:gy1, y1:my0, x:Math.max(mx0,gx0)+(Math.min(mx1,gx1)-Math.max(mx0,gx0))/2, label:Math.round(g2)+'px' });
      }
    }

    const COL_DEFAULT = 'rgba(255,63,180,0.95)'; // マゼンタ
    const COL_HIT     = 'rgba(16,247,176,0.95)'; // 揃い=グリーン

    if (bestV){
      guides.push({ type:'v', x:bestV.x, y0:bestV.y0, y1:bestV.y1, color: bestV.hit ? COL_HIT : COL_DEFAULT });
    }
    if (bestH){
      guides.push({ type:'h', y:bestH.y, x0:bestH.x0, x1:bestH.x1, color: bestH.hit ? COL_HIT : COL_DEFAULT });
    }
    // 等間隔メジャーは複数あり得るが、近いもの 1 本だけ出す
    if (hGaps.length){
      const g = hGaps.sort((a,b)=> (Math.abs((a.x1-a.x0)) - Math.abs((b.x1-b.x0))))[0];
      guides.push({ type:'measure-h', x0:g.x0, x1:g.x1, y:g.y, label:g.label });
    }
    if (vGaps.length){
      const g = vGaps.sort((a,b)=> (Math.abs((a.y1-a.y0)) - Math.abs((b.y1-b.y0))))[0];
      guides.push({ type:'measure-v', y0:g.y0, y1:g.y1, x:g.x, label:g.label });
    }
    return guides;
  }

  // ========== マウス: hover / click（移動モード中もツールチップは表示） ==========
  canvas.addEventListener('mousemove', (e)=>{
    const h = resolveHit(e);
    if (h){ canvas.style.cursor = (isMoveMode()? 'move' : 'pointer'); showTip(formatTip(h), e.clientX, e.clientY); }
    else { canvas.style.cursor='default'; hideTip(); }
  });
  canvas.addEventListener('mouseleave', hideTip);
  canvas.addEventListener('click', (e)=>{
    const h = resolveHit(e);
    setActiveLabel(h?.label || null);
    if (h) showTip(formatTip(h), e.clientX, e.clientY);
  });

  // ========== マウス: ドラッグ ==========
  // 仕様：ラベル上で押下 && 移動モード → ラベル移動 / それ以外は常にパン
  let dragging=false,lastX=0,lastY=0, dragButton=0;
  let movingLabel=null;     // 単一ラベル移動用
  let movingGroup=false;    // 複数選択の一括移動フラグ
  // === 追加: 選択矩形と選択集合（ASOBLE 名前空間に保存） ===
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.selectRect = null;
  window.ASOBLE.selectedLabels = window.ASOBLE.selectedLabels || [];
    // ドラッグ状態（描画側が参照）
    // ※ 初期化のみ。実際のON/OFFは mousedown/mouseup で行う
  window.ASOBLE.draggingLabel = null;
  window.ASOBLE.draggingGroup = false;
  window.ASOBLE.isDragging    = false;
    // ガイドライン初期化
  window.ASOBLE.guideLines = [];
  canvas.addEventListener('mousedown',(e)=>{
  dragButton = e.button|0;
  const mv = isMoveMode();   // ← ここで必ず宣言
  const h  = resolveHit(e);
    if (rightPanEnabled && dragButton===2){
      rightDrag = true;
      rightDragMoved = false;
    }
   
    // Space または 右ドラッグは常にパンへ
    const forcePan = (dragButton===2) || !!window.ASOBLE.__keySpace;
    if (mv && !forcePan){

      if (h && h.label){
        // 選択集合の上を掴んだらグループ移動、そうでなければ単一移動
        const sel = new Set(window.ASOBLE?.selectedLabels || []);
        movingGroup = (sel.size>0 && sel.has(String(h.label)));
        movingLabel = movingGroup ? null : h.label;
        setActiveLabel(h.label);
       // 公開ドラッグ状態をON
        window.ASOBLE.draggingLabel = movingGroup ? null : String(h.label);
        window.ASOBLE.draggingGroup = movingGroup;
        window.ASOBLE.isDragging    = true;      
      } else {
        // 空白ドラッグ → ツールに応じて分岐（rect=短形作図 / pan=パン）
        const tool = window.ASOBLE?.pointerTool || 'pan';
        if (tool === 'rect'){
          const c = toContentXY(e.clientX, e.clientY);
          window.ASOBLE.selectRect = { x0:c.x, y0:c.y, x1:c.x, y1:c.y };
          window.ASOBLE.selectedLabels = [];
          movingGroup = false; movingLabel = null;
          // 公開ドラッグ状態（選択ドラッグ中）
          window.ASOBLE.draggingLabel = null;
          window.ASOBLE.draggingGroup = false;
          window.ASOBLE.isDragging    = true;
        } else {
          // Pan ツール
          movingGroup = false; movingLabel = null;
        }
      }
       dragging = true; lastX=e.clientX; lastY=e.clientY; canvas.style.cursor='grabbing';
      // ガイドラインをクリア
      window.ASOBLE.guideLines = [];
    } else {
      // 非移動モードは従来通り：パン開始（ヒットがあればアクティブ更新）
      if (h && h.label) setActiveLabel(h.label);
      movingLabel = null; movingGroup = false;
      dragging = true; lastX=e.clientX; lastY=e.clientY; canvas.style.cursor='grabbing';
      // ガイドラインをクリア
      window.ASOBLE.guideLines = [];
    }
  });
    window.addEventListener('mouseup', ()=>{
    dragging=false; movingLabel=null; movingGroup=false; canvas.style.cursor='default';
    // 右ドラッグ状態をリセット
    rightDrag = false; rightDragMoved = false;
    // 追加：ドラッグ状態の明示リセット
    if (window.ASOBLE){
      window.ASOBLE.isDragging = false;
      window.ASOBLE.draggingLabel = null;
      window.ASOBLE.draggingGroup = false;
    }
     dragButton = 0;
    if (window.ASOBLE) window.ASOBLE.isDragging = false;    
    // ガイドラインをクリア
    window.ASOBLE.guideLines = [];
    // 矩形選択の確定
    const R = window.ASOBLE?.selectRect;
       // ※ ラベル（グループ）単位での交差選択へ変更
    if (R){
      const x0 = Math.min(R.x0, R.x1), x1 = Math.max(R.x0, R.x1);
      const y0 = Math.min(R.y0, R.y1), y1 = Math.max(R.y0, R.y1);
      const GB = (window.ASOBLE && window.ASOBLE.groupBounds) || {};
      const picked = [];
      for (const lab in GB){
        const g = GB[lab]; if (!g) continue;
        const gx0=g.x, gy0=g.y, gx1=g.x+g.w, gy1=g.y+g.h;
        const intersects = (x0 <= gx1 && x1 >= gx0 && y0 <= gy1 && y1 >= gy0);
        if (intersects) picked.push(String(lab));
      }
      window.ASOBLE.selectedLabels = picked;
      window.ASOBLE.selectRect = null;
      redrawAndUpdate();
    }
    // 移動モードが OFF の場合は後始末（短形・選択をクリア）
    if (! (window.ASOBLE && window.ASOBLE.moveMode)) {
    // ここでは isDragging は既に false 済み
      window.ASOBLE.selectRect = null;
      window.ASOBLE.selectedLabels = [];
      redrawAndUpdate();
    }
    // Space パンの取りこぼし解除
    window.ASOBLE.__keySpace = false;
  });
  window.addEventListener('mousemove',(e)=>{
    if (!dragging) return;
    const dx = e.clientX-lastX, dy = e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;

    // Space/右ドラッグ中は常にパン（短形作図中でもOK）
    if ((rightPanEnabled && dragButton===2) || window.ASOBLE.__keySpace){
      if (rightDrag) {
        // 2px 以上動いたら“ドラッグ”とみなす
        if (!rightDragMoved && (Math.abs(dx) + Math.abs(dy) > 2)) rightDragMoved = true;
      }
      view.tx += dx; view.ty += dy; clampPan(view, canvas, worldRect); redrawAndUpdate();
      return;
    }
    if (movingLabel){
     // 単一ラベル移動（スナップ補正なし／ガイドのみ）
       const scale = view.scale || 1;
      let ddx = dx/scale, ddy = dy/scale;
      // Shift で軸ロック
      if (e.shiftKey){
        if (Math.abs(ddx) >= Math.abs(ddy)) ddy = 0;
        else ddx = 0;
      }
     
      // オフセット確定（未定義ケア）
      const off = loadOffsets();
      const sdx = ddx, sdy = ddy;
      const curr = off[movingLabel] || {dx:0,dy:0};
      off[movingLabel] = { dx: curr.dx + sdx, dy: curr.dy + sdy };
      saveOffsets(off);
      window.ASOBLE = window.ASOBLE || {};
      window.ASOBLE.offsets = off;

     // ガイド更新（移動中のみ）
      const GB = (window.ASOBLE && window.ASOBLE.groupBounds) || {};
      const g0 = GB[movingLabel];
      const eps = 6/Math.max(1, view.scale||1);
      const rects = g0
        ? [{ label:movingLabel,
             x:g0.x + (off[movingLabel]?.dx||0),
             y:g0.y + (off[movingLabel]?.dy||0),
             w:g0.w, h:g0.h }]
        : [];
      window.ASOBLE.guideLines = computeGuideLines(rects, eps);
      redrawAndUpdate();
    } else if (movingGroup){

      // 複数ラベルの一括移動（補正なし／ガイドのみ）
      const scale = view.scale || 1;
      let ddx = dx/scale, ddy = dy/scale;
      if (e.shiftKey){
        if (Math.abs(ddx) >= Math.abs(ddy)) ddy = 0;
        else ddx = 0;
      }
      const sel = (window.ASOBLE?.selectedLabels || []).map(String);
      const off = loadOffsets();
      const GB  = (window.ASOBLE && window.ASOBLE.groupBounds) || {};
      const sdx = ddx, sdy = ddy; // ← 補正しない
      for (const lab of sel){
        const key = String(lab);
        const curr = off[key] || {dx:0,dy:0};
        off[key] = { dx: curr.dx + sdx, dy: curr.dy + sdy };
      }
      saveOffsets(off); window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.offsets = off;
      // ガイド更新（選択グループ：代表＋全体）
      const GB2 = GB;
      const rects = [];
     for (const lab of sel){ const g=GB2[lab]; if (g) rects.push({label:lab, x:g.x+(off[lab]?.dx||0), y:g.y+(off[lab]?.dy||0), w:g.w, h:g.h}); }
      window.ASOBLE.guideLines = computeGuideLines(rects, 6/Math.max(1, view.scale||1));
      redrawAndUpdate();
    } else if (window.ASOBLE?.selectRect){
      // 矩形選択を更新
      const c = toContentXY(e.clientX, e.clientY);
      window.ASOBLE.selectRect.x1 = c.x;
      window.ASOBLE.selectRect.y1 = c.y;
      redrawAndUpdate();
    } else {
      // パン（スクリーン→そのままtx/ty、直後にクランプ）
      // ※ ツールが rect のときは空白ドラッグではパンしない
      if ((window.ASOBLE?.pointerTool || 'pan') === 'pan'){
        view.tx += dx; view.ty += dy; clampPan(view, canvas, worldRect); redrawAndUpdate();
      }
      // パン中はガイドラインを消す
      window.ASOBLE.guideLines = [];
    }
  });

  // 追加：キャンバス外へマウスが出た場合の保険
  canvas.addEventListener('mouseleave', ()=>{
    dragging=false; movingLabel=null; movingGroup=false;
    if (window.ASOBLE){
      window.ASOBLE.isDragging = false;
      window.ASOBLE.draggingLabel = null;
      window.ASOBLE.draggingGroup = false;
      window.ASOBLE.guideLines = [];
    }
    canvas.style.cursor='default';
  });

  // ========== マウス: ホイール（常にカーソル位置ズーム） ==========
      canvas.addEventListener('wheel', (ev)=>{
     ev.preventDefault();
     const rect = canvas.getBoundingClientRect();
     const focus = { x: ev.clientX - rect.left, y: ev.clientY - rect.top }; // キャンバス相対
     const delta = -ev.deltaY;
     const factor = Math.exp(delta * 0.0015);
     zoomAtScreen(view, canvas, toContentXY, focus, factor, onModeChange, worldRect);
     clampPan(view, canvas, worldRect);
     redrawAndUpdate();
   }, { passive:false });

  // ========== マウス: ダブルクリック（トグル：ズーム ←→ fit） ==========
  canvas.addEventListener('dblclick', (ev)=>{
    ev.preventDefault();
    // トグル状態（内部フラグ）
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE._dbl = window.ASOBLE._dbl || { zoomed:false };
    const api = window.ASOBLE?.viewApi;

    if (window.ASOBLE._dbl.zoomed){
    // fit に復帰（この瞬間は moveMode のブロックを回避するため一時的に false へ）
    const prevMove = !!(window.ASOBLE?.moveMode);
    if (prevMove) window.ASOBLE.moveMode = false;
    if (api && typeof api.setMode === 'function'){ api.setMode('fit'); }
    if (typeof onModeChange === 'function') onModeChange('fit');
    window.ASOBLE._dbl.zoomed = false;
    redrawAndUpdate();
    // 適用完了を少し待ってから moveMode を復帰（fitブロック再発を回避）
    if (prevMove) setTimeout(()=>{ window.ASOBLE.moveMode = true; }, 60);
    return
    }

    // カーソル位置基準で 3x、かつその場不動
    const sx = ev.clientX, sy = ev.clientY;
    const c = toContentXY(sx, sy); // {x,y} in content
    const factor = 3.0;
    const newScale = (view.scale || 1) * factor;
    view.scale = newScale;
    view.tx = sx - c.x * newScale;
    view.ty = sy - c.y * newScale;
    window.ASOBLE._dbl.zoomed = true;
    redrawAndUpdate();
  }, { passive:false });

  // ========== タッチ（モード共通）：1本=パン / 2本=ピンチ ==========
  let lastDist = 0;
  let lastTouchX = 0, lastTouchY = 0;

  canvas.addEventListener('touchstart', (ev)=>{
    if (ev.touches.length >= 2){
      // 2本指ピンチ準備
      lastDist = hypot(ev.touches[0], ev.touches[1]);
      return;
    }
    if (ev.touches.length === 1){
      // 1本指パンの基準
      const t = ev.touches[0];
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }, { passive:false });

  canvas.addEventListener('touchmove', (ev)=>{
    // 2本指＝ピンチ
    if (ev.touches.length >= 2){
      ev.preventDefault();
      const dist = hypot(ev.touches[0], ev.touches[1]);
      const mid  = midpt(ev.touches[0], ev.touches[1]);
      const factor = dist / (lastDist || dist);
      zoomAtScreen(view, canvas, toContentXY, { x: mid.x, y: mid.y }, factor, onModeChange);
      lastDist = dist;
      redrawAndUpdate();
      // ピンチズーム中はガイドラインを消す
      window.ASOBLE.guideLines = [];
      return;
    }
    // 1本指＝パン
    if (ev.touches.length === 1){
      ev.preventDefault();
      const t = ev.touches[0];
      const dx = t.clientX - lastTouchX;
      const dy = t.clientY - lastTouchY;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      view.tx += dx;
      view.ty += dy;
      redrawAndUpdate();
      window.ASOBLE.guideLines = [];
    }
  }, { passive:false });

  // 指が減った時の取り扱い：ピンチ解除・基準更新
  canvas.addEventListener('touchend', (ev) => {
    lastDist = 0;
    if (ev.touches && ev.touches.length === 1){
      const t = ev.touches[0];
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    }
  }, { passive:false });

  // 予期しないキャンセル（OS ジェスチャ等）
  canvas.addEventListener('touchcancel', () => {
    lastDist = 0;
  }, { passive:false });

  // ドラッグ終了時はガイドをクリア
  window.addEventListener('mouseup', ()=>{
    if (window.ASOBLE) window.ASOBLE.guideLines = [];
    if (window.ASOBLE) window.ASOBLE.isDragging = false;
    dragButton = 0;
  // 念のため右ドラッグ状態もリセット
   rightDrag = false; rightDragMoved = false;
});

// --- HUD用ヘルパ（updateTopStats から使う）---
function num(v){
  if (v==null) return 0;
  const n = Number(String(v).replace(/[^\d.\-]/g,''));
  return isFinite(n) ? n : 0;
}
function pick(obj, keys){
  for(const k of keys){ if (obj && obj[k]!=null) return obj[k]; }
  return undefined;
}

// --- pointer系ヘルパ（マウス/タッチ）---
function isMoveMode(){ return !!(window.ASOBLE?.moveMode); }
function hypot(a,b){ const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
function midpt(a,b){ return { x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2 }; }


// キー名の揺れ吸収（/売上/ など部分一致）
function pickLike(obj, patterns){
  try{
    if(!obj) return undefined;
    for (const k of Object.keys(obj)){
      for (const p of patterns){
        const re = (p instanceof RegExp) ? p : new RegExp(String(p), 'i');
        if (re.test(k)) return obj[k];
      }
    }
  }catch{}
  return undefined;
}
function formatJPY(n){
  try{ return Number(n||0).toLocaleString('ja-JP', { maximumFractionDigits:0 }); }
  catch{ return String(Math.round(n||0)); }
}
function formatPct(x){
  if (!isFinite(x)) return '0%';
  return (x*100).toFixed(1)+'%';
}
function getSelectedMachines(){
  const A = window.ASOBLE || {};
  if (A.selectedMachines instanceof Set) return A.selectedMachines;
  if (Array.isArray(A.selectedMachines)) return new Set(A.selectedMachines.map(String));
  if (A.selectedMachine != null) return new Set([String(A.selectedMachine)]);
  if (Array.isArray(A.activeMachines)) return new Set(A.activeMachines.map(String));
  if (A.activeMachine != null) return new Set([String(A.activeMachine)]);
  try{
    const a = JSON.parse(localStorage.getItem('asoble:machines')||'[]');
    return new Set(Array.isArray(a)? a.map(String):[]);
  }catch{ return new Set(); }
}

function getRows(){
  // 取りうる置き場所を総当り
  let rows =
      window.ASOBLE?.rows
   || window.ASOBLE?.data?.rows
   || window.ASOBLE?.rawRows
   || window.ASOBLE?.csvRows
   || window.ASOBLE?.tableRows
   || window.ASOBLE?.grid?.rows
   || window.ASOBLE?.dataset?.rows
   || [];
  return Array.isArray(rows) ? rows : [];
}
}