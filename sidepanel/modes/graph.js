// Graphモード：既存の dashboard.js をそのまま利用
import { initDashboardPanel } from '../dashboard.js';

export function mountGraphMode(host, rows){
  // 既存は自前で #dashboard-panel を生成する仕様のため、
  // ここではホスト枠の幅だけ当て、呼び出すに留める。
  if (host){ host.style.pointerEvents = 'none'; }
  try{ initDashboardPanel(rows); }
  catch(e){ console.error('[graph] init failed:', e); }
}
