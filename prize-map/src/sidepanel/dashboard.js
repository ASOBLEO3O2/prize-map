// === src/sidepanel/dashboard.js ===
// 左サイド「ダッシュボード」：ドロワー（左=グラフ、右=一覧）


import * as dashlib from './dashlib.js';
import { ensureHost, ensureSubplotInsideLeft, tuneHeaderLayout, initSettingsToggle, ensureHandle, setPanelWidth } from './dashboard.ui.js';
import { buildMachineChips, renderTable } from './dashboard.list.js';

  export function initDashboardPanel(rows) {
  const host = ensureHost();
  const sel = host.querySelector('#db-graph-type');
  const inner = host.querySelector('.db-inner');
  const canvas = host.querySelector('#db-canvas');
   // ヘッダの被り回避など最小レイアウト調整
  tuneHeaderLayout(host);
  // 左ドロワーの幅とハンドル／設定パネルの初期開閉を初期化
  const LS_VIEW = 'asoble:view';
  let viewState; try { viewState = JSON.parse(localStorage.getItem(LS_VIEW) || '{}'); } catch { viewState = {}; }
     // 初回は閉じる。保存値（dashboardOpen）が boolean ならそれを優先して復元
   const initialOpen = (typeof viewState?.dashboardOpen === 'boolean')
     ? !!viewState.dashboardOpen
     : false;
  setPanelWidth(host);               // 幅を先に適用
  ensureHandle(host, { LS_VIEW, viewState, initialOpen });  // ハンドル設置＋開閉状態の保存
  initSettingsToggle(host, viewState);                      // 「設定」トグルの動作を有効化
  
  // 下段サブプロット（左カラム内に縦積み）と拡大トグルを後付け（冪等）
  ensureSubplotInsideLeft(host);
  const subplotCanvas = host.querySelector('#db-subplot');
  const table = host.querySelector('#db-table');
  
  // 一覧操作用のUI参照
  const sortSel = host.querySelector('#db-sort');
  const machSel = host.querySelector('#db-machine');
  const chipBox = host.querySelector('#db-machine-chips');
  const rateMin = host.querySelector('#db-rate-min');
  const rateMax = host.querySelector('#db-rate-max');
  // 既存DOMでも必ず複数選択化＆サイズ付与
  if (machSel){
    if (!machSel.multiple) machSel.multiple = true;
    if (!machSel.size || machSel.size < 6) machSel.size = 8; // 視認性のため
    machSel.setAttribute('aria-multiselectable','true');
  }
  
  // 一覧操作の状態
  const state = {
    type: sel?.value || 'composition',
    sort: 'sales_desc', machines: null, rmin: 0, rmax: 100,
    subplot: 'hist' // 下段は既定ヒスト
  }; 

  const rerender = () => {
       const data = dashlib.recompute(rows, state);
   // 初回にチップUIを構築
   if (chipBox && !chipBox.dataset.filled) buildMachineChips(chipBox, data, state);
   // 初回のみ：マシン選択肢を充填
  if (machSel && machSel.options.length === 0) {
      // 値は生の機種名、表示だけエスケープ（比較一致を保証）
      machSel.appendChild(new Option('全て', 'ALL'));
      for (const m of (data.machines||[])) {
        const opt = new Option(m.name, m.name);
        machSel.appendChild(opt);
      // 既存DOMの差異を吸収：必ず multiple+size を付与
      if (!machSel.multiple) machSel.multiple = true;
      if (!machSel.size || machSel.size < 6) machSel.size = 8;
      machSel.setAttribute('aria-multiselectable','true');
      // 既定は「全て」単独選択
      const allOpt = Array.from(machSel.options).find(o=>o.value==='ALL'); if (allOpt) allOpt.selected = true;
        
          }
      // ボタン式へ移行するためselectは非表示（互換のため残す）
      machSel.style.display = 'none';
    }
      dashlib.renderGraph(canvas, data, state.type);
    // 下段（左カラム内）を描画
    dashlib.renderSubplot(subplotCanvas, data, state);
    renderTable(table, data.topList);
  };

  sel?.addEventListener('change', () => { state.type = sel.value; rerender(); });
  sortSel?.addEventListener('change', ()=>{ state.sort = sortSel.value; rerender(); });
    // 複数選択ハンドラ（ALLと他の同時選択を自動調整）
  machSel?.addEventListener('change', ()=>{
    const opts = Array.from(machSel.options||[]);
    const selected = Array.from(machSel.selectedOptions||[]).map(o=>o.value);
    if (selected.length > 1 && selected.includes('ALL')){
      const allOpt = opts.find(o=>o.value==='ALL'); if (allOpt) allOpt.selected = false;
    }
    const vals = Array.from(machSel.selectedOptions||[]).map(o=>o.value);
    state.machines = (vals.length===0 || vals.includes('ALL')) ? null : new Set(vals);
    rerender();
  });  
  rateMin?.addEventListener('input', ()=>{ state.rmin = clampPct(rateMin.value); syncRange(); rerender(); });
  rateMax?.addEventListener('input', ()=>{ state.rmax = clampPct(rateMax.value); syncRange(); rerender(); });
  // 入力の相互補正
  function clampPct(v){ const n = Math.max(0, Math.min(100, Number(v)||0)); return n; }
  function syncRange(){
    if (state.rmin > state.rmax) { const t = state.rmin; state.rmin = state.rmax; state.rmax = t; }
    if (rateMin) rateMin.value = String(state.rmin);
    if (rateMax) rateMax.value = String(state.rmax);
  }
    [rateMin, rateMax].forEach(el=> el && el.addEventListener('change', syncRange));
  // 初期表示で入力値とstateを同期（初期ズレ防止）
  (function initControls(){
    if (sortSel && sortSel.value) state.sort = sortSel.value;
    if (rateMin) state.rmin = clampPct(rateMin.value);
    if (rateMax) state.rmax = clampPct(rateMax.value);
    if (rateMin || rateMax) syncRange();
  })();

   // 左パネルは独立運用：外部イベント(asoble:*)には追随しない
  window.addEventListener('resize', rerender); // パネル幅変更時に再描画

  // 初回
  rerender();

  // --- 可視ロックCSSを有効化（panel-navの有無に関わらず適用）---
  ensureGlobalModeCss();
  if (!document.body.dataset.pmode) document.body.dataset.pmode = 'graph';
}

// モード切替のローカル表示更新（ヘッダのactiveと領域の表示）
function updateLocalModes(root){
  try{
    const m = (document.body && document.body.dataset && document.body.dataset.pmode) || 'graph';
    const bar = root.querySelector('#db-modes');
    if (bar) bar.querySelectorAll('.pmode').forEach(b=> b.classList.toggle('active', b.dataset.mode===m));
    // CSSは ensureGlobalModeCss により強制されるため、ここでは初期同期だけでOK
  }catch{}
}

// ====== ここからフォールバック（CSSロック＋簡易モードバー）======
function ensureGlobalModeCss(){
  if (document.getElementById('pmode-global-css')) return;
  const el = document.createElement('style');
  el.id = 'pmode-global-css';
  el.textContent = `
  /* Graph以外では旧ダッシュボード一式を完全に隠す */
  body[data-pmode="cards"]  #dashboard-panel,
  body[data-pmode="replace"]#dashboard-panel,
  body[data-pmode="pickup"] #dashboard-panel { display:none !important; visibility:hidden !important; }
  body[data-pmode="cards"]  #dashboard-handle,
  body[data-pmode="replace"]#dashboard-handle,
  body[data-pmode="pickup"] #dashboard-handle,
  body[data-pmode="cards"]  #zoom-toggle,
  body[data-pmode="replace"]#zoom-toggle,
  body[data-pmode="pickup"] #zoom-toggle { display:none !important; visibility:hidden !important; }
  /* Graphは通常表示 */
  body[data-pmode="graph"] #dashboard-panel { display:block !important; visibility:visible !important; }
    /* パネル内部の表示切替（ヘッダ常設、コンテンツはモード依存） */
  body[data-pmode="graph"]   #dashboard-panel .db-inner{ display:grid !important; }
  body[data-pmode="graph"]   #dashboard-panel .db-alt{ display:none !important; }
  body[data-pmode="cards"]   #dashboard-panel .db-inner{ display:none !important; }
  body[data-pmode="cards"]   #db-mode-cards{ display:block !important; }
  body[data-pmode="replace"] #dashboard-panel .db-inner{ display:none !important; }
  body[data-pmode="replace"] #db-mode-replace{ display:block !important; }
  body[data-pmode="pickup"]  #dashboard-panel .db-inner{ display:none !important; }
  body[data-pmode="pickup"]  #db-mode-pickup{ display:block !important; }
  
  `;
  document.head.appendChild(el);
}

function ensureModebarFallback(){
  // panel-nav が作ったバーが既にあれば何もしない
  if (document.getElementById('panel-modebar')) return;
  const bar = document.createElement('div');
  bar.id = 'panel-modebar';
  bar.style.cssText = [
    'position:fixed','left:8px','top:8px','z-index:9998',
    'display:flex','gap:6px','flex-wrap:wrap',
    'background:rgba(0,0,0,.5)','backdrop-filter:blur(6px)',
    'padding:6px','border-radius:10px','border:1px solid rgba(255,255,255,.2)'
  ].join(';');
  bar.innerHTML = `
    <button class="chip pm" data-mode="graph">グラフ</button>
    <button class="chip pm" data-mode="cards">売上カード</button>
    <button class="chip pm" data-mode="replace">入替指示</button>
    <button class="chip pm" data-mode="pickup">ピックアップ</button>
  `;
  document.body.appendChild(bar);
  bar.addEventListener('click', (ev)=>{
    const t = ev.target; if (!(t instanceof HTMLElement)) return;
    const m = t.dataset.mode; if (!m) return;
    document.body.dataset.pmode = m;
    // 表示の再計算（ズームボタン等）
    try{ window.dispatchEvent(new Event('resize')); }catch{}
  });
}

