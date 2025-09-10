// === src/index.js ===
import { CSV_URL, BG_URL } from './constants.js';
import { loadCSV, computeSalesRange, groupByLabel } from './data.js';
import { loadBackground } from './background.js';
import { initAndFirstDraw } from './draw.js';
import { initMachinePanel } from './sidepanel.js';
import { initDashboardPanel } from './sidepanel/dashboard.js';

(async function boot(){
  try{
    // 並列でロード
    const [rows, bgImg] = await Promise.all([
      loadCSV(CSV_URL),
      loadBackground(BG_URL),
    ]);

    // ← HUDが参照する生データを公開し、読み込み完了を通知
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE.data = window.ASOBLE.data || {};
    window.ASOBLE.data.rows = rows;
    window.ASOBLE.rows = rows;
    window.dispatchEvent(new CustomEvent('asoble:rows', { detail: rows }));

    const { salesMin, salesMax } = computeSalesRange(rows);
    const { byLabel, labels } = groupByLabel(rows);

    // ついでに他モジュールからも参照できるよう公開
    window.ASOBLE.byLabel   = byLabel;
    window.ASOBLE.labels    = labels;
    window.ASOBLE.salesRange= { salesMin, salesMax };

    // サイドパネル（機種リスト）
    initMachinePanel(rows);
     // 左ダッシュボード
    initDashboardPanel(rows);
    
    // HUDの初回更新を明示的にトリガ（保険）
    try{
      window.dispatchEvent(new Event('asoble:update'));
      if (window.ASOBLE.updateTopStats) window.ASOBLE.updateTopStats();
    }catch{}

    // rows を HUD からも見えるように公開して通知
    window.ASOBLE = window.ASOBLE || {};
    window.ASOBLE.rows = rows;
    window.dispatchEvent(new Event('asoble:rows'));


    // 初期描画
    initAndFirstDraw({ labels, byLabel, salesMin, salesMax, bgImg });
  }catch(e){
    console.error('[index] init failed:', e);
    const el = document.createElement('div');
    el.textContent = '初期化に失敗しました: ' + (e?.message || e);
    el.style.cssText = 'position:fixed;top:12px;left:12px;background:#fffa;padding:8px;border-radius:8px;color:#111;z-index:99999;';
    document.body.appendChild(el);
  }
})();