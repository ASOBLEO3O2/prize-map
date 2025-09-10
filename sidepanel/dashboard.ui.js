// UI生成・レイアウト・パネル制御（dashboard.js から分離）

// 下段サブプロットと拡大トグルを左カラム内に後付け（冪等）
// onModeChange(mode:string) を受け取り、切替時に呼ぶ
export function ensureSubplotInsideLeft(host, onModeChange){
  const left = host?.querySelector('.db-graph');
  if (!left) return;
  // 拡大トグル（主グラフヘッダ）
  if (!left.querySelector('#db-zoom-graph')){
    const bar = document.createElement('div');
    bar.className = 'db-graph-head';
    bar.style.display = 'flex'; bar.style.justifyContent = 'flex-end';
    bar.style.alignItems = 'center'; bar.style.gap = '6px';
    bar.style.margin = '0 0 6px';
    bar.innerHTML = `<button id="db-zoom-graph" class="chip ctrl" type="button">拡大</button>`;
    left.insertBefore(bar, left.firstChild);
    const btn = bar.querySelector('#db-zoom-graph');
    btn.addEventListener('click', ()=>{
      const inner = host.querySelector('.db-inner');
      const mainCanvas = host.querySelector('#db-canvas');
      const zoomed = btn.classList.toggle('active');
      btn.textContent = zoomed ? '縮小' : '拡大';
      if (inner){
        inner.style.gridTemplateColumns = zoomed ? '1fr 0px' : '1.6fr 1fr';
      }
      if (mainCanvas){
        try{ mainCanvas.style.height = zoomed ? '420px' : '260px'; }catch{}
      }
      // 再描画
      window.dispatchEvent(new Event('resize'));
    });
  }
  // サブプロット・ヘッダ＋キャンバス（左カラム内に縦積み）
  if (!left.querySelector('#db-subplot-head')){
    const head = document.createElement('div');
    head.id = 'db-subplot-head';
    head.style.display = 'flex'; head.style.alignItems = 'center';
    head.style.justifyContent = 'space-between'; head.style.margin = '6px 0 4px';
    head.innerHTML = `
      <div id="subplot-title" class="muted" style="font-size:12px;">下段：原価率ヒストグラム（ビン幅:5%）</div>
      <div class="subplot-switch">
        <button type="button" id="subplot-btn-hist" class="chip active">ヒスト</button>
        <button type="button" id="subplot-btn-scatter" class="chip">散布</button>
      </div>`;
    left.appendChild(head);
    const applyMode = (mode)=>{
      head.querySelector('#subplot-btn-hist')  .classList.toggle('active', mode==='hist');
      head.querySelector('#subplot-btn-scatter').classList.toggle('active', mode==='scatter');
      const t = head.querySelector('#subplot-title');
      if (t) t.textContent = (mode==='hist') ? '下段：原価率ヒストグラム（ビン幅:5%）' : '下段：売上×原価率 散布図';
      left.dataset.mode = mode;
      if (typeof onModeChange === 'function'){
        try{ onModeChange(mode); }catch{}
      }
    };
    head.querySelector('#subplot-btn-hist')  .addEventListener('click', ()=> applyMode('hist'));
    head.querySelector('#subplot-btn-scatter').addEventListener('click', ()=> applyMode('scatter'));
    applyMode(left.dataset.mode || 'hist');
  }
  if (!left.querySelector('#db-subplot')){
    const c = document.createElement('canvas');
    c.id = 'db-subplot';
    c.style.display='block'; c.style.height='160px';
    left.appendChild(c);
  }
}

// 既存DOMに後付けで .db-header / .db-controls を挿入（なければ作る）
export function ensureHeaderAndControls(el){
  if (!el) return;
  let header = el.querySelector('.db-header');
  if (!header){
    header = document.createElement('div');
    header.className = 'db-header';
    header.innerHTML = `
      <label>グラフ種別：
        <select id="db-graph-type">
         <option value="composition">機種構成比</option>
          <option value="topn">機種別売上TopN</option>
          <option value="hist">原価率ヒストグラム</option>
          <option value="scatter">売上×原価率</option>
        </select>
      </label>`;
    el.insertBefore(header, el.firstChild);
  }
  if (!header.querySelector('.db-controls')){
    const box = document.createElement('div');
    box.className = 'db-controls';
    box.id = 'db-controls';
    box.innerHTML = `
      <label>並び順：
        <select id="db-sort">
          <option value="sales_desc">売上↓</option>
          <option value="sales_asc">売上↑</option>
          <option value="rate_asc">原価率↑</option>
          <option value="rate_desc">原価率↓</option>
        </select>
      </label>
      <label class="sr-only">マシン</label>
      <select id="db-machine" multiple style="display:none"></select>
      <div id="db-machine-chips" class="chip-group"></div>
      <label>原価率：
        <input id="db-rate-min" type="number" min="0" max="100" value="0" style="width:56px">％〜
        <input id="db-rate-max" type="number" min="0" max="100" value="100" style="width:56px">％
      </label>`;
    header.appendChild(box);
  }
  // 設定トグルボタン（未設置時のみ）
  if (!header.querySelector('#db-settings-toggle')){
    const btn = document.createElement('button');
    btn.id = 'db-settings-toggle';
    btn.className = 'db-gear';
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', 'db-controls');
    btn.textContent = '設定';
    const firstLabel = header.querySelector('label');
    if (firstLabel && firstLabel.nextSibling){
      header.insertBefore(btn, firstLabel.nextSibling);
    } else {
      header.appendChild(btn);
    }
  }
}

// 設定（db-controls）の開閉初期化
export function initSettingsToggle(host, viewState){
  const btn = host.querySelector('#db-settings-toggle');
  const pane = host.querySelector('.db-controls');
  if (!btn || !pane) return;
  const open = (viewState?.dashboardSettingsOpen ?? true) === true;
  apply(open);
  btn.addEventListener('click', ()=> apply(!(btn.getAttribute('aria-expanded')==='true')));
  function apply(isOpen){
    pane.classList.toggle('is-collapsed', !isOpen);
    btn.setAttribute('aria-expanded', String(!!isOpen));
    try{
      const v = JSON.parse(localStorage.getItem('asoble:view')||'{}');
      v.dashboardSettingsOpen = !!isOpen;
      localStorage.setItem('asoble:view', JSON.stringify(v));
    }catch{}
  }
}

// ヘッダUIがカードに被らないように最低限のレイアウト/余白をJSで強制
export function tuneHeaderLayout(host){
  if (!host) return;
  const header = host.querySelector('.db-header');
  const controls = header?.querySelector('.db-controls');
  if (header){
    header.style.margin = '0 0 8px';
    header.style.padding = header.style.padding || '8px 8px';
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '3';
    header.style.background = 'rgba(0,0,0,0.9)';
  }
  if (controls){
    controls.style.display = 'flex';
    controls.style.flexWrap = 'wrap';
    controls.style.gap = '10px';
    controls.style.maxWidth = '100%';
    const ms = controls.querySelector('#db-machine');
    if (ms){ if (!ms.multiple) ms.multiple = true; if (!ms.size || ms.size < 6) ms.size = 8; }
  }
}

export function ensureHandle(host, ctx){
  const { LS_VIEW, viewState, initialOpen } = ctx || {};
  let h = document.getElementById('dashboard-handle');
  if (!h){
    h = document.createElement('div');
    h.id = 'dashboard-handle';
    h.title = 'ダッシュボード';
    document.body.appendChild(h);
  } else if (h.parentElement !== document.body){
    document.body.appendChild(h); // 念のため body 直下へ
  }
  const applyOpen = (open)=>{
    host.classList.toggle('is-closed', !open);
    if (viewState && LS_VIEW){
      viewState.dashboardOpen = !!open;
      try { localStorage.setItem(LS_VIEW, JSON.stringify(viewState)); } catch {}
    }
    h.setAttribute('aria-pressed', String(!!open));
    h.setAttribute('aria-label', open ? 'ダッシュボードを閉じる' : 'ダッシュボードを開く');
    h.textContent = open ? '‹' : '›';
  };
  const placeHandle = (open)=>{
    const w = setPanelWidth(host);
    h.style.left = open ? `${w}px` : '0';
    h.style.right = ''; // 念のため右位置は解除
    moveZoomToggle(host, open, w); // ← ズームボタンの位置も同期
  };
  const applyOpenAndPlace = (open)=>{ applyOpen(open); placeHandle(open); };
  applyOpenAndPlace(initialOpen !== false);
  h.onclick = ()=> applyOpenAndPlace(host.classList.contains('is-closed'));
  window.addEventListener('resize', ()=> applyOpenAndPlace(!host.classList.contains('is-closed')));
}

// ズームボタン（#zoom-toggle）の重なり回避：左ドロワー幅に応じて left を可変
export function moveZoomToggle(host, open, panelWidth){
  const z = document.getElementById('zoom-toggle');
  if (!z) return;
  const left = open ? Math.max(16, (panelWidth|0) + 16) : 16;
  try{ z.style.setProperty('left', `${left}px`, 'important'); }catch{ z.style.left = `${left}px`; }
}

// パネル幅を画面幅から動的決定し、!importantで強制反映
export function setPanelWidth(host){
  const vw = Math.max(320, window.innerWidth || 0);
  // 画面幅の40%を基準に、下限420px〜上限720pxで可変（グラフを広めに確保）
  const w = Math.min(1020, Math.max(720, Math.round(vw * 0.40)));
  try { host.style.setProperty('width', `${w}px`, 'important'); }
  catch { host.style.width = `${w}px`; }
  return Math.round(w);
}

// ダッシュボードのホスト要素を保証（未存在なら骨格ごと生成）
export function ensureHost(){
  let el = document.getElementById('dashboard-panel');
  if (!el){
    el = document.createElement('div');
    el.id = 'dashboard-panel';
    // ヘッダ＋操作UI＋メイン/テーブルの骨格
    el.innerHTML = `
      <div class="db-header">
        <label>グラフ種別：
          <select id="db-graph-type">
           <option value="composition">機種構成比</option>
            <option value="topn">機種別売上TopN</option>
            <option value="hist">原価率ヒストグラム</option>
            <option value="scatter">売上×原価率</option>
          </select>
        </label>
        <button id="db-settings-toggle" class="db-gear" type="button"
                aria-expanded="true" aria-controls="db-controls">設定</button>
        <div class="db-controls" id="db-controls">
          <label>並び順：
            <select id="db-sort">
              <option value="sales_desc">売上↓</option>
              <option value="sales_asc">売上↑</option>
              <option value="rate_asc">原価率↑</option>
              <option value="rate_desc">原価率↓</option>
            </select>
          </label>
          <label>マシン：</label>
          <select id="db-machine" multiple size="8" aria-multiselectable="true"></select>
          <label>原価率：
            <input id="db-rate-min" type="number" min="0" max="100" value="0" style="width:56px">％〜
            <input id="db-rate-max" type="number" min="0" max="100" value="100" style="width:56px">％
          </label>
        </div>
      </div>
      <div class="db-inner">
        <div class="db-graph"><canvas id="db-canvas"></canvas></div>
        <div class="db-stats"><div class="db-table" id="db-table"></div></div>
      </div>`;
    document.body.appendChild(el);
  }
  // 既存DOMでもヘッダ/操作UIが揃うよう後付け
  ensureHeaderAndControls(el);
  return el;
}
