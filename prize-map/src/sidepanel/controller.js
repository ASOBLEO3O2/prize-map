// === src/sidepanel/controller.js ===
// サイドパネル（表示設定 + マシンチェック）だけを担当。
// 他の描画・計算コードには一切干渉しません。

import { initDisplayPanel } from './display.js';
import { initSidePanelNav } from './panel-nav.js';

// rows（CSV行配列） or 文字列配列 → 機種名 string[] に正規化
function normalizeMachineNames(input) {
  if (!Array.isArray(input)) return [];
  if (typeof input[0] === 'string') {
    return [...new Set(input)].sort((a,b)=>a.localeCompare(b,'ja'));
  }
  const set = new Set();
  const SPLIT = /[,\u3001\u3000\s/／・|]+/g;
  for (const r of input) {
    const cell = r && (r['対応マシン名'] ?? r['機種名'] ?? r['マシン名']);
    if (!cell) continue;
    for (const raw of String(cell).split(SPLIT)) {
      const s = raw.trim(); if (s) set.add(s);
    }
  }
  return [...set].sort((a,b)=>a.localeCompare(b,'ja'));
}

export function initMachinePanel(rowsOrNames) {
  const allMachines = normalizeMachineNames(rowsOrNames);

  // 既存パネルを再利用 or 新規作成
  let panel = document.getElementById('sidepanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'sidepanel';
    panel.style.cssText = `
      position:fixed; top:0; right:0; bottom:0; width:280px;
      background:rgba(0,0,0,0.85); color:#fff; padding:12px;
      overflow:visible; z-index:2147483647;
      font:12px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans JP",sans-serif;
    `;
    document.body.appendChild(panel);
   }
  // === 開閉状態の復元（先に読み出しておく） ===
  const LS_VIEW = 'asoble:view';
  let viewState;
  try { viewState = JSON.parse(localStorage.getItem(LS_VIEW) || '{}'); } catch { viewState = {}; }
     // 初回は閉じる。保存値（panelOpen）が boolean ならそれを優先
   const initialOpen = (typeof viewState?.panelOpen === 'boolean')
     ? !!viewState.panelOpen
     : false;
   
     // 見出し（※ この直前で一度クリアするので、handle は後で追加する）
  panel.innerHTML = '';
  
  // ヘッダ
  const header = document.createElement('div');
  header.textContent = '表示設定';
  header.style.cssText = 'font-weight:700; margin:4px 0 8px;';
  panel.appendChild(header);
  
  // === 表示オプション（塗り/枠/塗りモード） ===
  const opt = document.createElement('div');
  opt.style.cssText = 'display:grid; grid-template-columns:1fr; gap:8px; margin:6px 0 10px;';
  // 既存 state から初期値
  const getBool = (k, def)=> (typeof viewState[k] === 'boolean') ? !!viewState[k] : def;
  const fillEnabled   = getBool('fillEnabled',   true);
  const strokeEnabled = getBool('strokeEnabled', true);
  const fillMode      = (viewState.fillMode === 'average') ? 'average' : 'threshold';
    // 初期同期：描画側が window.ASOBLE を優先参照する場合に備える
    window.ASOBLE = Object.assign(window.ASOBLE || {}, {
      fillEnabled,
      strokeEnabled,
      fillMode
    });

  // UIパーツ
  const row1 = document.createElement('label');
  row1.style.cssText = 'display:flex; align-items:center; gap:8px;';
  const chkFill = Object.assign(document.createElement('input'), {type:'checkbox', checked:fillEnabled});
  row1.append(chkFill, document.createTextNode('塗りつぶしを表示'));
  const row2 = document.createElement('label');
  row2.style.cssText = 'display:flex; align-items:center; gap:8px;';
  const chkStroke = Object.assign(document.createElement('input'), {type:'checkbox', checked:strokeEnabled});
  row2.append(chkStroke, document.createTextNode('枠線を表示'));
  const row3 = document.createElement('label');
  row3.style.cssText = 'display:flex; align-items:center; gap:8px; justify-content:space-between;';
  row3.append(document.createTextNode('塗りモード'));
  const selMode = document.createElement('select');
  selMode.innerHTML = '<option value="threshold">しきい値</option><option value="average">平均値</option>';
  selMode.value = fillMode;
  row3.append(selMode);
  opt.append(row1, row2, row3);
  panel.appendChild(opt);

  // 変更反映：localStorage と window.ASOBLE を更新し、イベント発火
  function persistView(patch){
    Object.assign(viewState, patch);
    try { localStorage.setItem(LS_VIEW, JSON.stringify(viewState)); } catch {}
    window.ASOBLE = Object.assign(window.ASOBLE || {}, patch);
    try { window.dispatchEvent(new Event('asoble:view-changed')); } catch {}
    // 即時反映：堅牢な再描画トリガ（優先順に試行）
    try {
      if (typeof window.requestRedraw === 'function') {
        window.requestRedraw();
      } else if (window.ASOBLE && typeof window.ASOBLE.requestRedraw === 'function') {
        window.ASOBLE.requestRedraw();
      } else {
        // フォールバック：多くの実装で再描画を誘発
        window.dispatchEvent(new Event('resize'));
      }
    } catch {}
  }

  chkFill.onchange   = ()=> persistView({ fillEnabled: !!chkFill.checked });
  chkStroke.onchange = ()=> persistView({ strokeEnabled: !!chkStroke.checked });
  selMode.onchange   = ()=> persistView({ fillMode: selMode.value });

   // === 矢印ハンドル（innerHTML クリア後に作る） ===
   // === 矢印ハンドル（body直下・fixed配置に変更） ===

  let handle = document.getElementById('panel-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.id = 'panel-handle';
    document.body.appendChild(handle);
  } else if (handle.parentElement !== document.body) {
    document.body.appendChild(handle); // 既存がpanel内なら移設
  }

  const applyOpen = (open)=>{
    panel.classList.toggle('is-closed', !open);
    viewState.panelOpen = !!open;
    try { localStorage.setItem(LS_VIEW, JSON.stringify(viewState)); } catch {}
    handle.setAttribute('aria-pressed', String(!!open));
    handle.setAttribute('aria-label', open ? 'サイドパネルを閉じる' : 'サイドパネルを開く');
    handle.textContent = open ? '‹' : '›';
  };
  const placeHandle = (open)=>{
        const w = Math.round(panel.getBoundingClientRect().width || 280);
        handle.style.right = open ? `${w}px` : '0';
      };
      const applyOpenAndPlace = (open)=>{ applyOpen(open); placeHandle(open); };
      applyOpenAndPlace(initialOpen);
      handle.onclick = ()=> applyOpenAndPlace(panel.classList.contains('is-closed'));

  // ツールバー（全選択／リセット）
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex; gap:8px; margin:4px 0 10px;';
  const btnAll = document.createElement('button'); btnAll.textContent = '全選択';
  const btnReset = document.createElement('button'); btnReset.textContent = 'リセット';
  for (const b of [btnAll, btnReset]) {
    Object.assign(b.style, {
      flex:'1 1 auto', cursor:'pointer',
      background:'rgba(255,255,255,0.08)', color:'#fff',
      border:'1px solid rgba(255,255,255,0.25)',
      borderRadius:'8px', padding:'6px 8px'
    });
  }
  toolbar.append(btnAll, btnReset);
  panel.appendChild(toolbar);

  // UI本体（濃さスライダー／ラベル表示／売上基準値／機種リスト）
  const uiWrap = document.createElement('div');
  panel.appendChild(uiWrap);
  initDisplayPanel(uiWrap, allMachines);

  // === ボタン挙動（既存の処理に委譲） ===
  // display.js 側で機種チェックに data-kind="machine" を付けている前提
  const findMachineCheckboxes = () =>
    uiWrap.querySelectorAll('input[type="checkbox"][data-kind="machine"]');

  btnAll.onclick = () => {
    for (const cb of findMachineCheckboxes()) {
      if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    }
  };
  btnReset.onclick = () => {
    for (const cb of findMachineCheckboxes()) {
      if (cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
    }
  };

  // 白枠強調はここでは何もしません（イベントやクラス付与を発火しない）
}

 // 左サイド（モードバー）を未初期化時のみ起動
  try {
    if (!document.getElementById('panel-modebar')) {
      initSidePanelNav(rowsOrNames);
    }
  } catch {}