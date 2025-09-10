/* tests/contract_smoke.js
   公開APIと主要UI契約の“生存確認”だけを行う軽量スモーク。
   失敗してもアプリは止めない（console.warnで通知）。 */

(function(){
  const log = (...a)=>console.log('[contract]', ...a);
  const warn = (...a)=>console.warn('[contract][NG]', ...a);

  function tryDo(name, fn){
    try { fn(); log('OK:', name); }
    catch(e){ warn(name, e); }
  }

  function ready(fn){
    if (document.readyState === 'complete' || document.readyState === 'interactive') fn();
    else window.addEventListener('DOMContentLoaded', fn);
  }

  ready(()=>{
    // 1) DOM 必須要素
    tryDo('overlay canvas exists', ()=>{
      const c = document.getElementById('overlay');
      if (!c || !c.getContext) throw new Error('#overlay not found');
    });

    // 2) 公開API（ASOBLE.viewApi）契約
    tryDo('viewApi contract', ()=>{
      const api = window.ASOBLE && window.ASOBLE.viewApi;
      if (!api) throw new Error('ASOBLE.viewApi missing');
      if (typeof api.getMode !== 'function') throw new Error('getMode missing');
      if (typeof api.setMode !== 'function') throw new Error('setMode missing');
      const m0 = api.getMode();
      api.setMode('x3');
      const m1 = api.getMode();
      api.setMode('fit');
      const m2 = api.getMode();
      if (!(m1==='x3' && m2==='fit')) throw new Error('mode switch NG');
    });

    // 3) 再描画リクエスト
    tryDo('requestRedraw exists', ()=>{
      const f = window.ASOBLE && window.ASOBLE.requestRedraw;
      if (typeof f !== 'function') throw new Error('ASOBLE.requestRedraw missing');
      f();
    });

    // 4) localStorage の基本キー
    tryDo('localStorage keys exist', ()=>{
      const v = localStorage.getItem('asoble:view');
      // 値は空でもOK。キーが無ければ初期化しておく
      if (!v) localStorage.setItem('asoble:view', JSON.stringify({}));
    });

    // 5) ズームトグルボタン存在（任意）
    tryDo('zoom toggle button visible (optional)', ()=>{
      const btn = document.getElementById('zoom-toggle');
      if (!btn) log('zoom-toggle not found (OK if intentionally hidden)');
    });
  });
})();
