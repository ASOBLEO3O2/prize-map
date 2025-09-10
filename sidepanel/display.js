// === src/sidepanel/display.js ===
// サイドパネル内の UI：背景の濃さ / ラベル表示 / 売上の基準値 / 機種チェック / 移動モード
// 値は localStorage('asoble:view') と window.ASOBLE に同期し、変更時は requestRedraw() を呼ぶ。

const LS_VIEW = 'asoble:view';      // { bgOpacity, showLabel, salesThreshold, moveMode? }
const LS_MACH = 'asoble:machines';  // string[] 選択済み機種名
const LS_ROT  = 'asoble:rotations'; // { [label]: deg }
const LS_TAB  = 'asoble:panelTab';  // 最後に開いたタブ
// 追加：配置オフセットとスナップショット
const LS_OFF  = 'asoble:offsets';
const LS_SNAP = 'asoble:offsets:snapshots'; // { [name]: { savedAt:number, offsets:object } }

const DEFAULTS = {
    bgOpacity: 0.35,
    dimOpacity: 0.35,
    showLabel: true,
    salesThreshold: 0,
    moveMode: false,
    rotationDeg: 0,
    highlightStyle: 'color',     // 'none' | 'color' | 'blink'（新規：強調方式）
    // 追加：売上モード系の既定値（クロス基準は撤去）
    salesMode: 'threshold',     // 'threshold' | 'average' | 'rank'
    salesQuantile: 4,
    blinkEnabled: false,
    // 点滅方式の既定は blink 選択時に「highlight-only」
    blinkRule: 'highlight-only',
    // 原価率しきい値（独立セクション用、%を0-1で保持）
    rateBlinkLTE: 0.10,
    rateBlinkGTE: 0.33
  };

// 売上しきい値レンジ
const THRESH_MIN = 1000, THRESH_MAX = 100000, THRESH_STEP = 1000;

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; } }
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ---- タブ生成 ----
function createTabs(host, tabs){
  const wrap=document.createElement('div');
  const bar =document.createElement('div');
  const body=document.createElement('div');
  wrap.append(bar,body); host.appendChild(wrap);
  bar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:6px 0;';
  const content={}; const btns={}; let current=null;
  function mkBtn(k,label){
    const b=document.createElement('button'); b.type='button'; b.textContent=label; applyDarkBtn(b);
    b.addEventListener('click',()=>activate(k)); return b;
  }
  for(const [k,label] of tabs){
    const b=mkBtn(k,label); const pane=document.createElement('div'); pane.style.display='none';
    bar.appendChild(b); body.appendChild(pane); content[k]=pane; btns[k]=b;
  }
  function activate(k){
    if(!(k in content))return;
    for(const kk in content){
      content[kk].style.display=(kk===k)?'block':'none';
      btns[kk].style.opacity=(kk===k)?'1':'0.65';
      btns[kk].setAttribute('aria-pressed',kk===k?'true':'false');
    }
    current=k; try{localStorage.setItem(LS_TAB,k);}catch{}
  }
  const saved=(()=>{try{return localStorage.getItem(LS_TAB)||'';}catch{return'';}})();
  setTimeout(()=>activate(saved&&content[saved]?saved:tabs[0][0]),0);
  return {content,activate};
}

// ---- 共通：黒ベースのボタン ----
function applyDarkBtn(btn){
  btn.style.cssText = [
    'padding:6px 10px',
    'border-radius:8px',
    'background:#111',
    'color:#fff',
    'border:1px solid #444',
    'box-shadow:none',
    'cursor:pointer'
  ].join(';');
}

// ---- 背景の濃さ ----
function renderDimOpacityControl(container, initial) {
  const wrap = document.createElement('div'); wrap.style.cssText = 'margin:8px 0;';
  const label = document.createElement('label'); label.textContent = '背景の濃さ'; label.style.display='block';
  const input = document.createElement('input'); input.type='range'; input.min='0'; input.max='1'; input.step='0.01'; input.value=String(initial);
  const span = document.createElement('span'); span.textContent = String(initial);
  const apply = (val) => {
    const v = clamp(Number(val), 0, 1); span.textContent = v.toFixed(2);
    saveJSON(LS_VIEW, { ...loadJSON(LS_VIEW, {}), bgOpacity:v });
    window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.bgOpacity = v;
    window.ASOBLE.requestRedraw?.();
  };
  apply(initial);
  input.addEventListener('input', ()=>apply(input.value));
  input.addEventListener('change',()=>apply(input.value));
  wrap.append(label, input, span); container.appendChild(wrap);
}

// ---- 表示（枠線／塗りつぶし／マシン名）トグル（最上段）→ すべてボタンに統一 ----
function renderDisplayToggles(container, initShowLabel){
    const st = loadJSON(LS_VIEW, {});
    const initial = {
      strokeEnabled: ('strokeEnabled' in st) ? !!st.strokeEnabled : true,
      fillEnabled:   ('fillEnabled'   in st) ? !!st.fillEnabled   : true,
      showLabel: (typeof initShowLabel === 'boolean') ? initShowLabel
                : ('showLabel' in st ? !!st.showLabel : true),
    };
    const row = document.createElement('div'); row.style.cssText = 'display:flex; gap:8px; align-items:center; margin:10px 0;';
    function mkBtn(text, key, val){
      const btn = document.createElement('button'); btn.type='button'; btn.textContent=text;
      applyDarkBtn(btn);
      const sync = (on)=>{ btn.setAttribute('aria-pressed', on?'true':'false'); btn.style.opacity = on? '1':'0.65'; };
      let state = !!val; sync(state);
      btn.addEventListener('click', ()=>{
        state = !state;
        const now = loadJSON(LS_VIEW, {});
        const next = { ...now, [key]: state };
        saveJSON(LS_VIEW, next);
        window.ASOBLE = window.ASOBLE || {};
        window.ASOBLE[key] = state;
        sync(state);
        window.ASOBLE.requestRedraw?.();
      });
      return btn;
    }
   row.append(
      mkBtn('枠線 ON/OFF', 'strokeEnabled', initial.strokeEnabled),
      mkBtn('塗り ON/OFF', 'fillEnabled',   initial.fillEnabled),
      mkBtn('ラベル ON/OFF', 'showLabel',  initial.showLabel),
    );
    container.appendChild(row);
  }
  
  
// ---- ラベル表示 ----
function renderLabelToggle(container, initial) {
  const label = document.createElement('label'); label.style.display='block';
  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=initial; cb.style.accentColor='#1e90ff';
  cb.addEventListener('change',()=>{
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE.showLabel = cb.checked;
    saveJSON(LS_VIEW, { ...loadJSON(LS_VIEW, {}), showLabel:cb.checked });
    window.ASOBLE.requestRedraw?.();
  });
  label.append(cb, document.createTextNode('ラベルIDを表示'));
  container.appendChild(label);
  return cb; // ← 回転ボタンの活性/非活性同期に使う
}
// ---- 回転（選択中ラベルがあるとき有効）----
function renderRotationControlForActiveLabel(container){
  const row = document.createElement('div'); row.style.cssText='display:flex; gap:8px; align-items:center; margin:6px 0 10px;';
  const btn = document.createElement('button'); btn.type='button'; btn.textContent='選択ラベルを回転 +90°';
  const btnReset = document.createElement('button'); btnReset.type='button'; btnReset.textContent='リセット(0°)';
  applyDarkBtn(btn); applyDarkBtn(btnReset);
  const degLabel = document.createElement('span'); degLabel.style.cssText='min-width:3em;';
  const getMap = ()=>{ try{ return JSON.parse(localStorage.getItem(LS_ROT)||'{}')||{}; }catch{ return {}; } };
  const saveMap = (m)=>localStorage.setItem(LS_ROT, JSON.stringify(m||{}));
  const getActive = ()=> window.ASOBLE?.activeLabel || null;
  const getDeg = (label)=>{ const m=getMap(); const v=m?.[label]; return ((Number(v)||0)%360+360)%360; };
  const setUI = (label)=>{
    const moveOn = !!(window.ASOBLE && window.ASOBLE.moveMode);
    const ready  = !!label && moveOn; // ← 移動モード ON かつ 選択あり のときだけ有効
    btn.disabled = !ready; btnReset.disabled = !ready;
    row.style.opacity = ready ? '1' : '.5';
    degLabel.textContent = label ? (getDeg(label) + '°') : '—';
  };
  btn.addEventListener('click', ()=>{
    if (!window.ASOBLE?.moveMode) return; // ガード：移動モード外は無視
    const label = getActive(); if (!label) return;
    const m = getMap(); const next = (getDeg(label)+90)%360; m[label]=next; saveMap(m);
    window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.rotationMap = m;
    setUI(label); window.ASOBLE.requestRedraw?.();
  });
  
  btnReset.addEventListener('click', ()=>{
    if (!window.ASOBLE?.moveMode) return; // ガード
    const label = getActive(); if (!label) return;
    const m = getMap(); m[label]=0; saveMap(m);
    window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.rotationMap = m;
    setUI(label); window.ASOBLE.requestRedraw?.();
  });

    // activeLabel / moveMode の変化を反映
  window.addEventListener('asoble:activeLabel', (ev)=> setUI(ev.detail?.label || null));
  window.addEventListener('asoble:moveMode',     ()=> setUI(getActive()));
  row.append(btn, btnReset, degLabel); container.appendChild(row);
  
  // 初期表示
  setUI(getActive());
}

// ---- 売上ハイライト設定（モード＋各種入力＋強調方式ボタン）----
function renderSalesHighlightControl(container, initial) {
    const st = { 
      salesMode: (initial?.salesMode)||'threshold',
      salesThreshold: Number(initial?.salesThreshold)||0,
      salesRankTop: Math.max(1, Number(initial?.salesRankTop)||10),
      salesQuantile: Math.max(2, Math.min(10, Number(initial?.salesQuantile)||4)),
      // ↓ 強調方式と互換
      highlightStyle: (initial?.highlightStyle)
        || ((initial?.blinkEnabled) ? 'blink' : (DEFAULTS.highlightStyle || 'color')),
      blinkEnabled: !!initial?.blinkEnabled,   // 内部互換用（保存時に同期）
      blinkRule: (initial?.blinkRule)||'mode-based', // 値は温存（UI非表示）
       // 追加：柔軟設定（rank旧フィールド互換 → 新フィールドへ集約）
      salesRankBottom: Math.max(1, Number(initial?.salesRankBottom)||10),
      // しきい値/平均の比較向き（以上/以下）
      salesThresholdDir: (initial?.salesThresholdDir === 'lte') ? 'lte' : 'gte',
      salesAverageDir:   (initial?.salesAverageDir   === 'lte') ? 'lte' : 'gte',
      // 順位：単一数値 + 向き（互換：top→lte, bottom→gte）
      salesRankValue: Number.isFinite(Number(initial?.salesRankValue))
                      ? Number(initial.salesRankValue)
                      : (Number(initial?.salesRankTop) || Number(initial?.salesRankBottom) || 10),
      salesRankDir: initial?.salesRankDir
                    || (Number(initial?.salesRankTop)    ? 'lte'
                        : (Number(initial?.salesRankBottom) ? 'gte' : 'lte')),
      // 原価率レンジ（%を0-1で保持）：min(以上)=GTE, max(以下)=LTE
      rateBlinkLTE: (Number.isFinite(Number(initial?.rateBlinkLTE)) ? Number(initial.rateBlinkLTE) : 0.33),
      rateBlinkGTE: (Number.isFinite(Number(initial?.rateBlinkGTE)) ? Number(initial.rateBlinkGTE) : 0.10)
    };
    const wrap = document.createElement('div'); wrap.style.cssText='margin:10px 0;';
    const title = document.createElement('div'); title.textContent='売上ハイライト設定'; title.style.cssText='font-weight:600; margin-bottom:4px;';
      // 旧 'quantile' はUIから撤去
    if (st.salesMode === 'quantile') st.salesMode = 'rank';
    // === 売上モード（しきい値 / 順位 / 平均） ===
    const modeRow = document.createElement('div'); modeRow.style.cssText='display:flex; gap:8px; align-items:center; margin:6px 0;';
    const bThr = document.createElement('button'); bThr.type='button'; bThr.textContent='しきい値';
    const bRank = document.createElement('button'); bRank.type='button'; bRank.textContent='順位';
    const bAvg = document.createElement('button');  bAvg.type='button';  bAvg.textContent='平均';
    [bThr,bRank,bAvg].forEach(applyDarkBtn);
    function syncModeBtns(){
      const m = st.salesMode;
      const set=(btn,on)=>{ btn.setAttribute('aria-pressed', on?'true':'false'); btn.style.opacity = on?'1':'0.65'; };
      set(bThr, m==='threshold'); set(bRank, m==='rank'); set(bAvg, m==='average');
    }
     // rank×blink のとき blinkRule を rank-top / rank-bottom に自動同期
    function updateBlinkRuleForRank(){
      if (st.highlightStyle === 'blink' && st.salesMode === 'rank') {
        st.blinkRule = (st.salesRankDir === 'lte') ? 'rank-top' : 'rank-bottom';
      }
    }
    function setMode(m){ st.salesMode = m; syncModeBtns(); renderSub(); updateBlinkRuleForRank(); persist(); }
    bThr.addEventListener('click', ()=> setMode('threshold'));
    bRank.addEventListener('click', ()=> setMode('rank'));
    bAvg .addEventListener('click', ()=> setMode('average'));
    syncModeBtns(); modeRow.append(document.createTextNode('売上モード'), bThr, bRank, bAvg);

    // --- サブUI（モード別の入力行を差し込む場所） ---
    const sub = document.createElement('div'); sub.style.cssText='margin:4px 0;';
    // threshold: slider + number + 「以上/以下」
        const makeThreshold = ()=>{
      // 親は縦積み、1段目=スライダー＋数値、2段目=以上/以下ボタン（横並び）
      const row  = document.createElement('div'); row.style.cssText='display:flex; flex-direction:column; gap:6px; align-items:flex-start; width:100%;';
      const line = document.createElement('div'); line.style.cssText='display:flex; gap:8px; align-items:center; flex-wrap:wrap; width:100%;';
      const slider = Object.assign(document.createElement('input'), {type:'range', min:String(THRESH_MIN), max:String(THRESH_MAX), step:String(THRESH_STEP)});
      const number = Object.assign(document.createElement('input'), {type:'number', min:'0', max:String(THRESH_MAX), step:String(THRESH_STEP)});
      const init = st.salesThreshold; slider.value = String(init===0?THRESH_MIN:init); number.value=String(init);
      const note = document.createElement('div'); note.style.cssText='opacity:.75; font-size:11px;'; 
      const setNote=(v)=>{ note.textContent=(v===0)?'0 で無効（基準値を使わない）':`範囲：${THRESH_MIN.toLocaleString()}〜${THRESH_MAX.toLocaleString()}（${THRESH_STEP.toLocaleString()}刻み）`; };
      const apply = (val)=>{ 
        let v=Math.floor(Number(val)||0);
        if(v===0){ slider.value=String(THRESH_MIN); number.value='0'; } else { v=clamp(v,THRESH_MIN,THRESH_MAX); slider.value=String(v); number.value=String(v); }
      st.salesThreshold=v; persist();
        setNote(v);
      };
      // 「以上/以下」トグル
      const bGte = document.createElement('button'); bGte.type='button'; bGte.textContent='以上';
      const bLte = document.createElement('button'); bLte.type='button'; bLte.textContent='以下';
      // ボタンは別行の横並びへ
      const dirRow = document.createElement('div'); dirRow.style.cssText='display:flex; gap:8px; align-items:center;';
      [bGte,bLte].forEach(applyDarkBtn);
      const syncDir=()=>{ const isGte = (st.salesThresholdDir==='gte'); bGte.style.opacity=isGte?'1':'0.65'; bLte.style.opacity=isGte?'0.65':'1';
        bGte.setAttribute('aria-pressed', isGte?'true':'false'); bLte.setAttribute('aria-pressed', !isGte?'true':'false'); };
      bGte.addEventListener('click', ()=>{ st.salesThresholdDir='gte'; persist(); syncDir(); });
      bLte.addEventListener('click', ()=>{ st.salesThresholdDir='lte'; persist(); syncDir(); });
      syncDir();
      slider.addEventListener('input', ()=>apply(slider.value));
      slider.addEventListener('change',()=>apply(slider.value));
      number.addEventListener('input', ()=>apply(number.value));
      number.addEventListener('change',()=>apply(number.value));
      setNote(init); apply(init);
      // 構成：1段目 line(スライダー＋数値)、2段目 dirRow(以上/以下)
      line.append(slider, number);
      dirRow.append(bGte, bLte);
      row.append(line, dirRow);
      return [row, note];
    };
     // average: 平均との比較（以上／以下）のみを切り替え
    const makeAverage = ()=>{
      const row = document.createElement('div'); row.style.cssText='display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
      const lab = document.createElement('span'); lab.textContent = '平均と比較';
      const bGte = document.createElement('button'); bGte.type='button'; bGte.textContent='以上';
      const bLte = document.createElement('button'); bLte.type='button'; bLte.textContent='以下';
      [bGte, bLte].forEach(applyDarkBtn);
      const syncDir = ()=>{
        const isGte = (st.salesAverageDir === 'gte');
        bGte.style.opacity = isGte ? '1' : '0.65';
        bLte.style.opacity = isGte ? '0.65' : '1';
        bGte.setAttribute('aria-pressed', isGte ? 'true' : 'false');
        bLte.setAttribute('aria-pressed', !isGte ? 'true' : 'false');
      };
      bGte.addEventListener('click', ()=>{ st.salesAverageDir='gte'; persist(); syncDir(); });
      bLte.addEventListener('click', ()=>{ st.salesAverageDir='lte'; persist(); syncDir(); });
      syncDir();
      row.append(lab, bGte, bLte);
      return [row];
    };

    // rank: 上位N / 下位N
     const makeRank = ()=>{
      const row = document.createElement('div'); row.style.cssText='display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
      const lab = document.createElement('span'); lab.textContent='順位';
      const num = Object.assign(document.createElement('input'), {type:'number', min:'1', max:'999', step:'1',
        value:String(st.salesRankValue||10), style:'width:6em;'});
      const bTop = document.createElement('button'); bTop.type='button'; bTop.textContent='1位から';
      const bBtm = document.createElement('button'); bBtm.type='button'; bBtm.textContent='最下位から';
      [bTop,bBtm].forEach(applyDarkBtn);
      const sync=()=>{
        const isBottom = (st.salesRankDir==='gte');
        bTop.style.opacity = isBottom? '0.65':'1';
        bBtm.style.opacity = isBottom? '1':'0.65';
        bTop.setAttribute('aria-pressed', !isBottom?'true':'false');
        bBtm.setAttribute('aria-pressed', isBottom?'true':'false');
      };
      const onChange=()=>{
        st.salesRankValue = Math.max(1, Number(num.value)||10);
        st.salesRankDir   = bBtm.getAttribute('aria-pressed')==='true' ? 'gte' : 'lte';
        updateBlinkRuleForRank(); persist(); sync();
      };
      bTop.addEventListener('click', ()=>{ st.salesRankDir='lte'; onChange(); });
      bBtm.addEventListener('click', ()=>{ st.salesRankDir='gte'; onChange(); });
      num.addEventListener('change', onChange);
      sync(); row.append(lab, num, bTop, bBtm); return [row];
    };
     // quantile: UI撤去（互換用：関数は残さない）
    
     // === 強調方式（ボタン3択）：なし / 色で強調 / 点滅で強調 ===
    const styleRow = document.createElement('div'); styleRow.style.cssText='display:flex; gap:8px; align-items:center; margin-top:6px;';
    const bNone  = document.createElement('button'); bNone.type='button';  bNone.textContent='強調なし';
    const bColor = document.createElement('button'); bColor.type='button'; bColor.textContent='色で強調';
    const bBlink = document.createElement('button'); bBlink.type='button'; bBlink.textContent='点滅で強調';
    [bNone,bColor,bBlink].forEach(applyDarkBtn);
     // --- dimOpacity の周期変調は禁止（非選択まで脈打つため）---
    //     点滅は render.js の per-ID ロジックに一任する
    function ensureBlinkTimer(on){
      // 既存タイマーがあれば停止し、常に基準値へ復帰
      if (window.ASOBLE?._blinkTimerId){
        try{ clearInterval(window.ASOBLE._blinkTimerId); }catch{}
        window.ASOBLE._blinkTimerId = 0;
      }
      const base = Number(loadJSON(LS_VIEW, {}).dimOpacity ?? DEFAULTS.dimOpacity) || DEFAULTS.dimOpacity;
      window.ASOBLE.dimOpacity = base;
      try {
        window.dispatchEvent(new CustomEvent('asoble:blink', { detail:{ phase:false, low:base, high:base } }));
      } catch {}
      window.ASOBLE.requestRedraw?.();
    }    
    function syncStyleBtns(){
      const s = st.highlightStyle;
      const on = (k)=> s===k ? '1' : '0.65';
      bNone.style.opacity  = on('none');
      bColor.style.opacity = on('color');
      bBlink.style.opacity = on('blink');
      bNone.setAttribute('aria-pressed',  s==='none'  ?'true':'false');
      bColor.setAttribute('aria-pressed', s==='color' ?'true':'false');
      bBlink.setAttribute('aria-pressed', s==='blink' ?'true':'false');
    }
       // --- モード別サブUIの描画 ---
    // 後半の rank UI 定義は名前を変えて重複を避ける
    // 順位モードUI：1位からN台 / 最下位からN台
    function makeRankRadio(){
      const row = document.createElement('div');
      row.style.cssText='display:grid; gap:6px;';
      // N台入力
      const numWrap = document.createElement('label');
      numWrap.style.cssText='display:flex; align-items:center; gap:8px;';
      const num = Object.assign(document.createElement('input'), { type:'number', min:'1', step:'1' });
      num.value = String(Math.max(1, Number(st.salesRankValue||10)));
      num.style.cssText='width:80px; padding:2px 6px;';
      numWrap.append(document.createTextNode('台数'), num);
      // 上位/下位の向き（top=lte, bottom=gte）
      const dirWrap = document.createElement('div');
      dirWrap.style.cssText='display:flex; gap:10px; align-items:center;';
      function mkRadio(id,label,val){
        const r = Object.assign(document.createElement('input'), { type:'radio', name:'rankDir' });
        r.id = id; r.value = val; r.checked = (st.salesRankDir === val);
        const lb = document.createElement('label'); lb.htmlFor = id; lb.textContent = label;
        return [r, lb];
      }
      const [rTop, lbTop]     = mkRadio('rankDirTop', '1位から', 'lte');
      const [rBottom, lbBtm]  = mkRadio('rankDirBtm', '最下位から', 'gte');
      dirWrap.append(rTop, lbTop, rBottom, lbBtm);
      // 変更ハンドラ（保存→rank互換フィールド→blinkRule同期）
      const onChange = ()=>{
        st.salesRankValue = Math.max(1, Number(num.value||10));
        st.salesRankDir   = (rBottom.checked ? 'gte' : 'lte');
        // 互換：旧フィールドも更新（persist内でも更新されるが即時反映しておく）
        if (st.salesRankDir === 'lte') {
          st.salesRankTop = st.salesRankValue;
        } else {
          st.salesRankBottom = st.salesRankValue;
        }
        updateBlinkRuleForRank();
        persist();
      };
      num.addEventListener('change', onChange);
      rTop.addEventListener('change', onChange);
      rBottom.addEventListener('change', onChange);
      row.append(dirWrap, numWrap);
      return [row];
    }
      
    // rank時のblinkRuleを自動同期
    function updateBlinkRuleForRank(){
      if (st.highlightStyle === 'blink' && st.salesMode === 'rank') {
        st.blinkRule = (st.salesRankDir === 'lte') ? 'rank-top' : 'rank-bottom';
      }
    }
    function renderSub(){
      sub.innerHTML = '';
      if (st.salesMode === 'threshold'){ const [r,n] = makeThreshold(); sub.append(r,n); }
      else if (st.salesMode === 'rank'){ const [r] = makeRankRadio(); sub.append(r); updateBlinkRuleForRank(); persist(); }
      else if (st.salesMode === 'average'){ const [r] = makeAverage(); sub.append(r); }
    };
  
    renderSub();

     function forceFlagsForStyle(k){
      // 強調の“見た目”と描画フラグを一致させる
      const now = loadJSON(LS_VIEW, {});
      if (k === 'none') {
        st.blinkEnabled = false;
        saveJSON(LS_VIEW, { ...now, fillEnabled:false, strokeEnabled:false });
        window.ASOBLE.fillEnabled = false;
        window.ASOBLE.strokeEnabled = false;
        ensureBlinkTimer(false);
      } else if (k === 'color') {
        st.blinkEnabled = false;
        saveJSON(LS_VIEW, { ...now, fillEnabled:true, strokeEnabled:true });
        window.ASOBLE.fillEnabled = true;
        window.ASOBLE.strokeEnabled = true;
        ensureBlinkTimer(false);
      } else { // 'blink'
         // 点滅は描画側の per-ID に一任。非ハイライト点滅を避けるため rule を明示固定
          st.blinkEnabled = true;
          st.blinkRule = 'highlight-only';
          saveJSON(LS_VIEW, { ...now, fillEnabled:true, strokeEnabled:true, blinkRule: st.blinkRule });
          window.ASOBLE.fillEnabled = true;
          window.ASOBLE.strokeEnabled = true;
         ensureBlinkTimer(false); // 全体の明滅は禁止
       }
     }
    function setStyle(k){ st.highlightStyle = k; forceFlagsForStyle(k); persist(); syncStyleBtns(); }
    bNone .addEventListener('click', ()=> setStyle('none'));
    bColor.addEventListener('click', ()=> setStyle('color'));
    bBlink.addEventListener('click', ()=> setStyle('blink'));
    syncStyleBtns();
    styleRow.append(document.createTextNode('強調方式'), bNone, bColor, bBlink);

  // 機種選択変更イベントでも即時再描画（念のため）
  window.addEventListener('asoble:selectedMachines', ()=> window.ASOBLE?.requestRedraw?.());
    

  // 保存と反映（% → 0–1 に正規化）
      function persist(){
      const prev = loadJSON(LS_VIEW, {}) || {};
      const next = {
        ...prev,
      salesMode: st.salesMode,
        salesThreshold: Number(st.salesThreshold||0),
        // 追加：比較向き
        salesThresholdDir: (st.salesThresholdDir==='lte') ? 'lte' : 'gte',
        salesAverageDir:   (st.salesAverageDir==='lte')   ? 'lte' : 'gte',
        // 追加：順位の新フォーマット
        salesRankValue: Math.max(1, Number(st.salesRankValue|| (st.salesRankTop||st.salesRankBottom||10))),
        salesRankDir:   (st.salesRankDir==='gte' || st.salesRankDir==='lte') ? st.salesRankDir
                         : (Number(st.salesRankTop) ? 'lte' : 'gte'),
        // 互換：旧フィールドも更新
        salesRankTop:     (st.salesRankDir==='lte') ? Math.max(1, Number(st.salesRankValue||10))
                                                    : Math.max(1, Number(prev.salesRankTop||10)),
        salesRankBottom:  (st.salesRankDir==='gte') ? Math.max(1, Number(st.salesRankValue||10))
                                                    : Math.max(1, Number(prev.salesRankBottom||10)),
        // 点滅ルール（レンジ）
        blinkEnabled: st.blinkEnabled, blinkRule: st.blinkRule,
        rateBlinkLTE: Math.max(0, Math.min(1, Number(st.rateBlinkLTE||0.33))), // max(以下)
        rateBlinkGTE: Math.max(0, Math.min(1, Number(st.rateBlinkGTE||0.10)))  // min(以上)
      };
      saveJSON(LS_VIEW, next);
     window.ASOBLE = window.ASOBLE || {};
       // 既存の selectedMachines は保持
      const keepSelected = window.ASOBLE.selectedMachines;
      Object.assign(window.ASOBLE, next);
      if (keepSelected) window.ASOBLE.selectedMachines = keepSelected;
      window.ASOBLE.requestRedraw?.();
    }
    // 初期反映
    persist();
    // 強調方式（色/点滅）も初期同期
    try { if (typeof forceFlagsForStyle === 'function') forceFlagsForStyle(st.highlightStyle); } catch {}
    try { if (typeof syncStyleBtns === 'function') syncStyleBtns(); } catch {}
    // まとめて追加：売上モード + サブUI → 強調方式 → 原価率セクション
    const rateRow = document.createElement('div'); rateRow.style.cssText='display:flex; gap:8px; align-items:center; margin-top:6px;';
    const rateLab = document.createElement('span'); rateLab.textContent='原価率 (%)';
    const inMin = Object.assign(document.createElement('input'), { type:'number', min:'0', max:'100', step:'1', value:String(Math.round((st.rateBlinkGTE||0)*100)), style:'width:6em;' });
    const inMax = Object.assign(document.createElement('input'), { type:'number', min:'0', max:'100', step:'1', value:String(Math.round((st.rateBlinkLTE||0)*100)), style:'width:6em;' });
    inMin.addEventListener('change', ()=>{ st.rateBlinkGTE = (Number(inMin.value)||0)/100; persist(); });
    inMax.addEventListener('change', ()=>{ st.rateBlinkLTE = (Number(inMax.value)||0)/100; persist(); });
    rateRow.append(rateLab, inMin, document.createTextNode('以上'), inMax, document.createTextNode('以下'));
    wrap.append(title, modeRow, sub, styleRow, rateRow); container.appendChild(wrap);
}
// ---- 移動モード ----
function renderMoveModeToggle(container, initial){
  const row = document.createElement('div'); row.style.cssText='margin:10px 0 2px;';
  const btn = document.createElement('button'); btn.type='button';
  applyDarkBtn(btn);
  function setUI(v){ btn.textContent = v ? '移動モード：ON' : '移動モード：OFF'; btn.setAttribute('aria-pressed', v?'true':'false'); btn.style.opacity = v? '1':'0.8'; }
  let current = !!initial; setUI(current);
  btn.addEventListener('click', ()=>{
    const v = !current; current = v; setUI(v);
    const now = { ...loadJSON(LS_VIEW, {}), moveMode: v };
    // 移動モードON時は 自動で塗り/枠をOFF にする
    if (v) {
     now.fillEnabled = false;
     now.strokeEnabled = false;
    }
    saveJSON(LS_VIEW, now);
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE.moveMode = v;
    if (v) {
      window.ASOBLE.fillEnabled = false;
      window.ASOBLE.strokeEnabled = false;
    }
    // === 画面スクロールの切替（モード中は allow） ===
    // グローバルCSSは overflow:hidden のままにし、ここで一時的に上書き
    try {
      document.documentElement.style.overflow = v ? 'auto' : 'hidden';
      document.body.style.overflow = v ? 'auto' : 'hidden';
    } catch {}
    
    // 反映
    window.ASOBLE.requestRedraw?.();
    // 追加：リスナーへ通知（回転UIなどが反応）
    try { window.dispatchEvent(new CustomEvent('asoble:moveMode', { detail:{ on:v } })); } catch {}

    });
  const hint = document.createElement('div'); hint.style.cssText='opacity:.75; font-size:11px; margin-top:4px;';
  hint.textContent = 'ON中：ラベル（グループ）単位でドラッグ移動 / OFF：通常のパン＆ズーム。';
  row.append(btn); container.append(row, hint);
  return btn;
}

// === 追加：移動タブ内の「配置操作」（保存／呼び出し／全リセット） ===
function renderMoveLayoutOps(container){
  const box = document.createElement('div');
  box.style.cssText = 'margin:10px 0; display:grid; gap:8px;';

  // 1) 保存（命名）
  const saveRow = document.createElement('div');
  saveRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  const inName = Object.assign(document.createElement('input'), {
    type:'text', placeholder:'スナップショット名（例：朝配置）'
  });
  inName.style.cssText='flex:1 1 180px; padding:4px 6px; border:1px solid #444; background:#111; color:#fff; border-radius:6px;';
  const btnSave = document.createElement('button'); btnSave.type='button'; btnSave.textContent='配置を保存';
  applyDarkBtn(btnSave);
  btnSave.addEventListener('click', ()=>{
    const name = (inName.value||'').trim();
    if (!name){ inName.focus(); return; }
    const current = (function(){ try{ return JSON.parse(localStorage.getItem(LS_OFF)||'{}')||{}; }catch{ return {}; } })();
    const snaps = (function(){ try{ return JSON.parse(localStorage.getItem(LS_SNAP)||'{}')||{}; }catch{ return {}; } })();
    snaps[name] = { savedAt: Date.now(), offsets: current };
    localStorage.setItem(LS_SNAP, JSON.stringify(snaps));
    // 即時フィードバック（選択肢反映）
    refreshLoadOptions();
  });
  saveRow.append(inName, btnSave);

  // 2) 呼び出し（選択 → 適用）
  const loadRow = document.createElement('div');
  loadRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  const sel = document.createElement('select');
  sel.style.cssText = 'min-width:180px; padding:4px 6px; background:#111; color:#fff; border:1px solid #444; border-radius:6px;';
  const btnLoad = document.createElement('button'); btnLoad.type='button'; btnLoad.textContent='呼び出して適用';
  applyDarkBtn(btnLoad);
  function refreshLoadOptions(){
    sel.innerHTML = '';
    let snaps = {};
    try{ snaps = JSON.parse(localStorage.getItem(LS_SNAP)||'{}')||{}; }catch{}
    const names = Object.keys(snaps);
    if (!names.length){
      const opt = document.createElement('option'); opt.textContent='（保存なし）'; opt.value='';
      sel.appendChild(opt);
    } else {
      // 新しい順
      names.sort((a,b)=>(snaps[b].savedAt||0)-(snaps[a].savedAt||0));
      for (const n of names){
        const opt = document.createElement('option');
        const t = snaps[n] && snaps[n].savedAt ? new Date(snaps[n].savedAt).toLocaleString() : '';
        opt.value = n; opt.textContent = t ? `${n}（${t}）` : n;
        sel.appendChild(opt);
      }
    }
  }
  btnLoad.addEventListener('click', ()=>{
    const name = sel.value;
    if (!name) return;
    let snap = null;
    try{
      const snaps = JSON.parse(localStorage.getItem(LS_SNAP)||'{}')||{};
      snap = snaps[name] || null;
    }catch{}
    if (!snap || !snap.offsets) return;
    try{
      localStorage.setItem(LS_OFF, JSON.stringify(snap.offsets));
      window.ASOBLE = window.ASOBLE || {};
      window.ASOBLE.offsets = snap.offsets;
    }catch{}
    try{ window.ASOBLE.requestRedraw?.(); }catch{}
  });
  loadRow.append(sel, btnLoad);

  // 3) 全配置リセット（2段階確認）
  const resetRow = document.createElement('div');
  resetRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  const btnReset = document.createElement('button'); btnReset.type='button'; btnReset.textContent='全配置リセット';
  applyDarkBtn(btnReset);
  let confirmPhase = 0, timerId = 0;
  function resetConfirmOff(){
    confirmPhase = 0;
    btnReset.textContent = '全配置リセット';
    if (timerId){ clearTimeout(timerId); timerId = 0; }
  }
  btnReset.addEventListener('click', ()=>{
    if (confirmPhase === 0){
      confirmPhase = 1;
      btnReset.textContent = '本当に全リセット？（もう一度押す）';
      if (timerId){ clearTimeout(timerId); }
      timerId = setTimeout(resetConfirmOff, 5000); // 5秒で自動キャンセル
      return;
    }
    // 二段階目：実行
    resetConfirmOff();
    try{ localStorage.removeItem(LS_OFF); }catch{}
    try{
      window.ASOBLE = window.ASOBLE || {};
      delete window.ASOBLE.offsets;
      // 複数選択も念のため解除
      window.ASOBLE.selectedLabels = [];
    }catch{}
    try{ window.ASOBLE.requestRedraw?.(); }catch{}
  });
  resetRow.append(btnReset);

  // 初期化
  refreshLoadOptions();
  // レイアウト
  const caption = document.createElement('div');
  caption.textContent = '配置操作（保存／呼び出し／全リセット）';
  caption.style.cssText='font-weight:600; margin-top:4px;';
  box.append(caption, saveRow, loadRow, resetRow);
  container.appendChild(box);
}


// ---- 回転（移動モード中のみ有効）----
function renderRotationControl(container, initialDeg, moveCheckbox){
  const row = document.createElement('div'); row.style.cssText='display:flex; gap:8px; align-items:center; margin:6px 0 10px;';
  const btn = document.createElement('button'); btn.type='button'; btn.textContent='回転 +90°';
  const degLabel = document.createElement('span'); degLabel.style.cssText='min-width:3em;';
  const setDeg = (v)=>{ degLabel.textContent = String((Number(v)||0)) + '°'; };
  btn.addEventListener('click', ()=>{
    const now = loadJSON(LS_VIEW, {});
    const cur = Number(now.rotationDeg ?? 0) || 0;
    const next = (cur + 90) % 360;
    saveJSON(LS_VIEW, { ...now, rotationDeg: next });
    window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.rotationDeg = next;
    setDeg(next);
    window.ASOBLE.requestRedraw?.();
  });
  row.append(btn, degLabel);
  container.appendChild(row);
  setDeg(initialDeg);
  const syncDisabled = ()=>{
    const on = !!(moveCheckbox && moveCheckbox.checked);
    btn.disabled = !on;
    row.style.opacity = on ? '1' : '.5';
  };
  syncDisabled();
  moveCheckbox && moveCheckbox.addEventListener('change', syncDisabled);
}
// ---- 追加：ポインタツール切替（パン／矩形選択）----
function renderPointerToolToggle(container, initialTool){
  // UI：ボタン二択（押下で状態トグル）
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:8px 0; display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  const title = document.createElement('span'); title.textContent = 'ツール';
  const bPan  = document.createElement('button'); bPan.type='button';  bPan.textContent='パン（移動）';
  const bRect = document.createElement('button'); bRect.type='button'; bRect.textContent='矩形選択';
  [bPan,bRect].forEach(applyDarkBtn);
  function sync(tool){
    const onPan  = (tool === 'pan');
    const onRect = (tool === 'rect');
    bPan.style.opacity  = onPan  ? '1' : '0.65';
    bRect.style.opacity = onRect ? '1' : '0.65';
    bPan.setAttribute('aria-pressed',  onPan  ? 'true':'false');
    bRect.setAttribute('aria-pressed', onRect ? 'true':'false');
  }
  function setTool(tool){
    const t = (tool === 'rect') ? 'rect' : 'pan';
    // 保存（LS_VIEW に混ぜて保存）
    const now = { ...loadJSON(LS_VIEW, {}), pointerTool: t };
    saveJSON(LS_VIEW, now);
    // グローバル同期
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE.pointerTool = t;
    // 必要なら通知（他モジュールが拾えるように）
    try { window.dispatchEvent(new CustomEvent('asoble:pointerTool', { detail:{ tool:t } })); } catch {}
    // 再描画は不要だが、描画側で参照するケースに備えて
    window.ASOBLE.requestRedraw?.();
    sync(t);
  }
  bPan .addEventListener('click', ()=> setTool('pan'));
  bRect.addEventListener('click', ()=> setTool('rect'));
  wrap.append(title, bPan, bRect);
  container.appendChild(wrap);
  // 初期表示
  setTool(initialTool || 'pan');
}

// ---- 機種リスト ----
function saveJSONSafe(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function renderMachineList(container, names, selectedSet) {
    container.innerHTML='';
    // ヘッダ行：全選択／リセット／選択数
    const head = document.createElement('div');
    head.style.cssText='display:flex; align-items:center; gap:8px; margin:10px 0 6px;';
    const btnAll = document.createElement('button'); btnAll.type='button'; btnAll.textContent='全選択';
    const btnClr = document.createElement('button'); btnClr.type='button'; btnClr.textContent='リセット';
    for (const b of [btnAll, btnClr]) applyDarkBtn(b);
    const badge = document.createElement('span'); badge.style.cssText='margin-left:auto; font-size:12px; opacity:.8;';
    function updateBadge(){ badge.textContent = `選択: ${selectedSet.size} / 全: ${names.length}`; }
    function applySelection(arr){
      selectedSet.clear(); for (const n of arr) selectedSet.add(n);
      saveJSONSafe(LS_MACH, [...selectedSet]);
      window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.selectedMachines = selectedSet;
      container.querySelectorAll('input[data-kind="machine"]').forEach((el)=>{
        const name = el.getAttribute('data-name')||''; el.checked = selectedSet.has(name);
      });
      updateBadge();
      try { window.dispatchEvent(new CustomEvent('asoble:selectedMachines', { detail:{ selected:[...selectedSet] } })); } catch {}
      window.ASOBLE.requestRedraw?.();
      }
    btnAll.addEventListener('click', ()=> applySelection(names));
    btnClr.addEventListener('click', ()=> applySelection([]));
    head.append(btnAll, btnClr, badge); container.appendChild(head); updateBadge();
        // === ボタンUIへ置換（押下=選択/解除） ===
    const grid = document.createElement('div');
    grid.style.cssText='display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:6px;';
   function syncBtnEl(btn, on){
      btn.setAttribute('aria-pressed', on?'true':'false');
      btn.style.opacity = on ? '1' : '0.65';
    }
    function syncAllButtons(){
      container.querySelectorAll('button[data-kind="machine"]').forEach((btn)=>{
        const name = btn.getAttribute('data-name') || '';
        syncBtnEl(btn, selectedSet.has(name));
      });
    }
        function makeBtn(name){
      const btn = document.createElement('button'); btn.type='button'; btn.textContent=name;
      applyDarkBtn(btn);
      const sync = ()=> {
        const on = selectedSet.has(name);
        syncBtnEl(btn, on);
      };
      btn.dataset.kind = 'machine'; btn.dataset.name = name;
      btn.addEventListener('click', ()=>{
        
        if (selectedSet.has(name)) selectedSet.delete(name); else selectedSet.add(name);
        saveJSONSafe(LS_MACH, [...selectedSet]);
        window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.selectedMachines = selectedSet;
        updateBadge(); sync();
        try { window.dispatchEvent(new CustomEvent('asoble:selectedMachines', { detail:{ selected:[...selectedSet] } })); } catch {}
        window.ASOBLE.requestRedraw?.();
      });
      sync(); return btn;
    }
    const frag=document.createDocumentFragment();
    for (const name of names) frag.appendChild(makeBtn(name));
    grid.appendChild(frag);
    container.appendChild(grid);
      // 全選択／リセットもボタン見た目まで同期
    function applySelection(arr){
      selectedSet.clear(); for (const n of arr) selectedSet.add(n);
      saveJSONSafe(LS_MACH, [...selectedSet]);
      window.ASOBLE = window.ASOBLE || {}; window.ASOBLE.selectedMachines = selectedSet;
      updateBadge(); syncAllButtons();
      try { window.dispatchEvent(new CustomEvent('asoble:selectedMachines', { detail:{ selected:[...selectedSet] } })); } catch {}
      window.ASOBLE.requestRedraw?.();
    }
    btnAll.addEventListener('click', ()=> applySelection(names));
    btnClr.addEventListener('click', ()=> applySelection([]));
  }

// ---- 公開API ----
export function initDisplayPanel(container, allMachines) {
    // --- 正規化：#sidepanel を親として container だけを残す ---
  const root = (container && container.closest)
    ? (container.closest('#sidepanel') || container)
    : container;

  if (root && root.id === 'sidepanel' && root !== container) {
    // container を識別しやすく（任意）
    if (!container.getAttribute('data-mount')) {
      container.setAttribute('data-mount', 'panel');
    }
    // #sidepanel 直下を container のみに置換
    root.replaceChildren(container);
  }
  // container 自体の中身は毎回クリアして再構築
  container.innerHTML = '';
  const st = loadJSON(LS_VIEW, DEFAULTS);
  const sel = new Set(loadJSON(LS_MACH, []));
   
        // === タブ化 ===
    const {content}=createTabs(container,[
      ['view','表示'],
      ['bg','背景'],
      ['sales','売上'],
      ['mach','機種'],
      ['move','移動']
    ]);

    // 1) 表示
    renderDisplayToggles(content.view, st.showLabel ?? DEFAULTS.showLabel);
    // 2) 背景
    renderDimOpacityControl(content.bg, st.bgOpacity ?? DEFAULTS.bgOpacity);
    // 3) 売上
    renderSalesHighlightControl(content.sales, {

    // 既存互換
    salesMode: st.salesMode ?? 'threshold',
    salesThreshold: st.salesThreshold ?? (DEFAULTS.salesThreshold ?? 0),
    salesRankTop: st.salesRankTop ?? 10,
    salesQuantile: st.salesQuantile ?? 4,
    blinkEnabled: !!st.blinkEnabled,
    blinkRule: st.blinkRule ?? 'mode-based',
    // 追加：強調方式
    highlightStyle: st.highlightStyle ?? (DEFAULTS.highlightStyle ?? 'color'),
    // 追加：関連しきい値（既存描画互換用）
    salesRankBottom: st.salesRankBottom ?? 10,
    rateBlinkLTE: (typeof st.rateBlinkLTE === 'number') ? st.rateBlinkLTE : 0.10,
    rateBlinkGTE: (typeof st.rateBlinkGTE === 'number') ? st.rateBlinkGTE : 0.33
    });
    
    // 4) 機種（スクロール＋フィルタ）
    (()=>{
      const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;gap:6px;';
      const inF=document.createElement('input'); inF.type='text'; inF.placeholder='機種名で絞り込み…';
      inF.style.cssText='padding:4px 6px;border:1px solid #444;background:#111;color:#fff;border-radius:6px;';
      const scroll=document.createElement('div'); scroll.style.cssText='max-height:60vh;overflow:auto;border:1px solid #333;border-radius:8px;padding:4px;';
      wrap.append(inF,scroll); content.mach.appendChild(wrap);
      renderMachineList(scroll,allMachines,sel);
      inF.addEventListener('input',()=>{
        const q=(inF.value||'').trim().toLowerCase();
        const list=q?allMachines.filter(n=>String(n).toLowerCase().includes(q)):allMachines;
        renderMachineList(scroll,list,sel);
      });
    })();
    // 5) 移動
    const moveCB=renderMoveModeToggle(content.move, st.moveMode ?? DEFAULTS.moveMode);
    renderRotationControlForActiveLabel(content.move);
    // 追加：配置操作（保存／呼び出し／全リセット）
    renderMoveLayoutOps(content.move);
    // 追加：ポインタツール切替（パン／矩形）
    renderPointerToolToggle(content.move, st.pointerTool || 'pan');
  
  // 初期グローバル同期
  window.ASOBLE = window.ASOBLE || {};
  window.ASOBLE.bgOpacity = st.bgOpacity ?? DEFAULTS.bgOpacity;
  window.ASOBLE.showLabel = ('showLabel' in st) ? !!st.showLabel : true;
  window.ASOBLE.fillEnabled   = ('fillEnabled'   in st) ? !!st.fillEnabled   : true;
  window.ASOBLE.strokeEnabled = ('strokeEnabled' in st) ? !!st.strokeEnabled : true;
  window.ASOBLE.salesThreshold = st.salesThreshold ?? DEFAULTS.salesThreshold;
  window.ASOBLE.dimOpacity = st.dimOpacity ?? DEFAULTS.dimOpacity;
  window.ASOBLE.moveMode = st.moveMode ?? DEFAULTS.moveMode;
  window.ASOBLE.rotationDeg = st.rotationDeg ?? DEFAULTS.rotationDeg ?? 0;
  // 追加：売上モード系も初期同期しておく
  window.ASOBLE.salesMode     = st.salesMode     ?? DEFAULTS.salesMode;
  window.ASOBLE.salesRankTop  = st.salesRankTop  ?? 10;
  window.ASOBLE.salesQuantile = st.salesQuantile ?? DEFAULTS.salesQuantile;
    // 新フィールド（以上/以下ディレクション）
  window.ASOBLE.salesThresholdDir = (st.salesThresholdDir==='lte') ? 'lte' : 'gte';
  window.ASOBLE.salesAverageDir   = (st.salesAverageDir==='lte')   ? 'lte' : 'gte';
  window.ASOBLE.salesRankValue    = st.salesRankValue ?? (st.salesRankTop ?? st.salesRankBottom ?? 10);
  window.ASOBLE.salesRankDir      = st.salesRankDir || (st.salesRankTop ? 'lte' : (st.salesRankBottom ? 'gte' : 'lte'));
  
  window.ASOBLE.blinkEnabled  = ('blinkEnabled' in st) ? !!st.blinkEnabled : DEFAULTS.blinkEnabled;
  window.ASOBLE.blinkRule     = st.blinkRule     ?? DEFAULTS.blinkRule;
  window.ASOBLE.salesRankBottom = st.salesRankBottom ?? 10;
  // 原価率レンジ（min=以上→GTE / max=以下→LTE）
  window.ASOBLE.rateBlinkGTE    = (typeof st.rateBlinkGTE === 'number') ? st.rateBlinkGTE : 0.10;
  window.ASOBLE.rateBlinkLTE    = (typeof st.rateBlinkLTE === 'number') ? st.rateBlinkLTE : 0.33;
 // --- 強調方式 初期同期（後方互換：blinkEnabledのみ保存されていたケース考慮）
  const hl = st.highlightStyle || ((st.blinkEnabled===true) ? 'blink' : (DEFAULTS.highlightStyle || 'color'));
  window.ASOBLE.highlightStyle = hl;
  window.ASOBLE.blinkEnabled   = (hl === 'blink');
  // dimOpacityはLS値で初期化（blinkは後段のensureBlinkTimerが揺らす）
  window.ASOBLE.dimOpacity = st.dimOpacity ?? DEFAULTS.dimOpacity;
  // ラベル別回転マップを同期
  window.ASOBLE.rotationMap = (function(){ try{ return JSON.parse(localStorage.getItem(LS_ROT)||'{}')||{}; }catch{ return {}; } })();
  window.ASOBLE.selectedMachines = sel;
    // 追加：ポインタツールの初期値（LS→ASOBLE）
  window.ASOBLE.pointerTool = st.pointerTool || 'pan';
  // === 診断用：データ受け口（描画側/他モジュールから配列を注入） ===
  // 使い方（どこからでも）:
  //   window.dispatchEvent(new CustomEvent('asoble:dataset', { detail: yourArray }));
  //   // または yourArray を {booths:[...]} / {nodes:[...]} / {items:[...]} 形式でも可
  window.addEventListener('asoble:dataset', (ev) => {
    const d = ev && ev.detail;
    const arr = (d && (d.booths || d.nodes || d.items || d)) || null;
    if (Array.isArray(arr)) {
      window.ASOBLE.booths = arr;
    }
  });

  // 手動注入用ヘルパ（コンソールから）:
  //   ASOBLE.setBoothData([{id:'A-01', machine:'SLOT', sales:12000, rank:5, costRate:0.28}, ...])
  window.ASOBLE.setBoothData = (arr) => {
    window.ASOBLE.booths = Array.isArray(arr) ? arr : [];
    };

  // 任意：データ提供側に通知（リスナーがあればデータを publish してもらう）
  try { window.dispatchEvent(new CustomEvent('asoble:requestDataset')); } catch {}
 }
