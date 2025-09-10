// 左サイド：モード切替シェル（グラフ／売上カード／入替指示／ピックアップ）
import { mountGraphMode }   from './modes/graph.js';
import { mountCardsMode }   from './modes/cards.js';
import { mountReplaceMode } from './modes/replace.js';
import { mountPickupMode }  from './modes/pickup.js';

export function initSidePanelNav(rows){
  // 既存のダッシュボードとは独立に“モードバー”を作成
  let bar = document.getElementById('panel-modebar');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'panel-modebar';
    bar.style.cssText = [
      'position:fixed','left:8px','top:8px','z-index:9998',
      'display:flex','gap:6px','flex-wrap:wrap',
      'background:rgba(0,0,0,.5)','backdrop-filter:blur(6px)',
      'padding:6px','border-radius:10px','border:1px solid rgba(255,255,255,.2)'
    ].join(';');
    bar.innerHTML = `
      <button data-mode="graph"   class="pmode active">グラフ</button>
      <button data-mode="cards"   class="pmode">売上カード</button>
      <button data-mode="replace" class="pmode">入替指示</button>
      <button data-mode="pickup"  class="pmode">ピックアップ</button>
      <button id="pmode-full"     class="pmode ctrl" title="サイドパネル全画面">全画面</button>
    `;
    document.body.appendChild(bar);
    // ボタン共通スタイル（最低限）
    const cssBtn = el => el.style.cssText = [
      'font:12px/1.2 system-ui','color:#fff','background:rgba(255,255,255,.12)',
      'border:1px solid rgba(255,255,255,.25)','border-radius:8px','padding:6px 10px','cursor:pointer'
    ].join(';');
    bar.querySelectorAll('button').forEach(cssBtn);
    bar.querySelectorAll('.pmode').forEach(b=>{
      if (!b.classList.contains('ctrl')) b.classList.add('toggleable');
    });
     // 旧ダッシュボードの表示をモードに連動させるグローバルCSSを注入（1回だけ）
     ensureGlobalModeCss();
}

  // 各モードのコンテナ（同一領域で切替）
  const ensureBox = (id)=>{
    let el=document.getElementById(id);
    if(!el){
      el=document.createElement('div');
      el.id=id;
      el.style.cssText='position:fixed;left:0;top:0;height:100%;z-index:9990;';
      document.body.appendChild(el);
    }
    return el;
  };
  const graphBox   = ensureBox('panel-graph');
  const cardsBox   = ensureBox('panel-cards');
  const replaceBox = ensureBox('panel-replace');
  const pickupBox  = ensureBox('panel-pickup');

    // 上部の固定/スティッキー要素（売上サマリー等）を避けるための配置
  const placeBar = ()=>{
    try{
      const top = calcTopSafeOffset();
      bar.style.top = `${top}px`;
       // 左位置：Graphモードかつ #dashboard-panel が開いている時はドロワー幅＋16px、それ以外は8px
     const pmode = (document.body && document.body.dataset && document.body.dataset.pmode) || 'graph';
      let left = 8;
      if (pmode === 'graph'){
        const dash = document.getElementById('dashboard-panel');
        if (dash && !dash.classList.contains('is-closed')){
          const rect = dash.getBoundingClientRect();
          if (rect && rect.width) left = Math.max(8, Math.round(rect.width + 16));
        }
      }
      bar.style.left = `${left}px`;
       }catch{}
  };

  // 共通の幅制御（左ドロワー想定：可変幅／全画面）
  const applyWidth = (isFull)=>{
    const W = isFull ? window.innerWidth : Math.min(1020, Math.max(720, Math.round((window.innerWidth||1200)*0.40)));
    [graphBox, cardsBox, replaceBox, pickupBox].forEach(b=>{
      b.style.width = (isFull? `${window.innerWidth}px` : `${W}px`);
      b.style.background = 'transparent';
    });
  };
    let isFull = false; applyWidth(false); placeBar();
  window.addEventListener('resize', ()=>{ applyWidth(isFull); placeBar(); });
  // スクロールでも安全余白を再計算（rAFでスロットル）
  let __scrollTick = 0;
  const onScroll = ()=> {
    if (__scrollTick) return;
    __scrollTick = requestAnimationFrame(()=>{ __scrollTick = 0; placeBar(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });

    // ハンドルのクリックやパネル状態の変化でも再配置
  const h = document.getElementById('dashboard-handle');
  if (h){ h.addEventListener('click', ()=> setTimeout(placeBar, 0)); }
  const dash = document.getElementById('dashboard-panel');
  if (dash){
    try{
      const mo = new MutationObserver(()=> placeBar());
      mo.observe(dash, { attributes:true, attributeFilter:['class','style'] });
    }catch{}
  }

  // モード切替
  const show = (mode)=>{
    graphBox.style.display   = (mode==='graph')   ? 'block':'none';
    cardsBox.style.display   = (mode==='cards')   ? 'block':'none';
    replaceBox.style.display = (mode==='replace') ? 'block':'none';
    pickupBox.style.display  = (mode==='pickup')  ? 'block':'none';
    bar.querySelectorAll('button.toggleable').forEach(b=> b.classList.toggle('active', b.dataset.mode===mode));
    // 既存のダッシュボード本体（#dashboard-panel）は Graph 以外では隠す
    const dash = document.getElementById('dashboard-panel');
    if (dash) dash.style.display = (mode === 'graph' ? 'block' : 'none');
      // ハンドル/ズームトグルも Graph 以外では隠す
    const dh = document.getElementById('dashboard-handle');
    if (dh) dh.style.display = (mode === 'graph' ? '' : 'none');
    const zt = document.getElementById('zoom-toggle');
    if (zt) zt.style.display = (mode === 'graph' ? '' : 'none');
    // body 属性にモードを刻み、CSSで最終ロック（!important）を効かせる
    try{ document.body.setAttribute('data-pmode', mode); }catch{}
    // 幅や配置の再計算（ズームボタン位置など）
    try{ window.dispatchEvent(new Event('resize')); }catch{}
    placeBar();  
  };

  // 初回マウント
  mountGraphMode(graphBox, rows);
  mountCardsMode(cardsBox, rows);
  mountReplaceMode(replaceBox, rows);
  mountPickupMode(pickupBox, rows);
  show('graph');
  try{ document.body.setAttribute('data-pmode','graph'); }catch{}
  


  // クリック配線
  bar.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
     if (t.id === 'pmode-full'){
      isFull = !isFull; applyWidth(isFull); placeBar();
      try{ window.dispatchEvent(new Event('resize')); }catch{}
      t.textContent = isFull ? '通常' : '全画面';
      return;
    }
    const m = t.dataset.mode; if (!m) return;
    show(m);
  });
}


// 旧ダッシュボードをモードに合わせて確実に隠すためのグローバルCSS
function ensureGlobalModeCss(){
  if (document.getElementById('pmode-global-css')) return;
  const css = `
  /* graph 以外では旧ダッシュボードを完全に隠す */
  body[data-pmode="cards"]  #dashboard-panel,
  body[data-pmode="replace"]#dashboard-panel,
  body[data-pmode="pickup"] #dashboard-panel { display:none !important; visibility:hidden !important; }
  body[data-pmode="cards"]  #dashboard-handle,
  body[data-pmode="replace"]#dashboard-handle,
  body[data-pmode="pickup"] #dashboard-handle,
  body[data-pmode="cards"]  #zoom-toggle,
  body[data-pmode="replace"]#zoom-toggle,
  body[data-pmode="pickup"] #zoom-toggle { display:none !important; visibility:hidden !important; }
  /* graph のときは通常表示へ */
  body[data-pmode="graph"] #dashboard-panel { display:block !important; visibility:visible !important; }
  `;
  const el = document.createElement('style');
  el.id = 'pmode-global-css';
  el.textContent = css;
  document.head.appendChild(el);
}

// 画面上部にある固定/スティッキーUI（売上サマリー等）の最下端を検出し、その少し下にモードバーを置く
function calcTopSafeOffset(){
  let safe = 8;
  try{
    // 自分自身(#panel-modebar)を除外しつつ、上部の fixed/sticky を軽量走査
    const nodes = Array.from(document.body.querySelectorAll('*')).slice(0, 500);
    let maxBottom = 0;
    for (const el of nodes){
      if (!el || el.id === 'panel-modebar') continue;
      const cs = getComputedStyle(el);
      if (!cs) continue;
      const pos = cs.position;
      if (pos !== 'fixed' && pos !== 'sticky') continue;
      const rect = el.getBoundingClientRect();
      if (rect.height <= 0) continue;
      // 画面上端から80px以内に接している要素を対象（上部バー想定）
      if (rect.top <= 80 && rect.bottom > maxBottom){
        maxBottom = rect.bottom;
      }
    }
    safe = Math.max(8, Math.ceil(maxBottom + 8));
  }catch{}
  return safe;
}