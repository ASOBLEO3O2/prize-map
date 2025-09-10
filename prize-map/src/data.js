import { normalizeHeader, toNumberLoose } from './utils.js';

export async function ensurePapa(){
  if (window.Papa?.parse) return;
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js';
    s.onload=resolve; s.onerror=()=>reject(new Error('Papa CDN load failed'));
    (document.head||document.documentElement).appendChild(s);
  });
}

export function loadCSV(url){
  return new Promise(async (resolve,reject)=>{
    try{
      await ensurePapa();
      window.Papa.parse(url, {
        download:true, header:true, skipEmptyLines:true,
        transformHeader: normalizeHeader,
         complete:(res)=>{
          const rows = Array.isArray(res?.data) ? res.data : [];
          // --- 公開＆通知（HUD連動用） ---
          try{
            window.ASOBLE = window.ASOBLE || {};
            window.ASOBLE.data = window.ASOBLE.data || {};
            window.ASOBLE.data.rows = rows;
            window.ASOBLE.rows = rows; // 互換用
            window.dispatchEvent(new CustomEvent('asoble:rows', { detail: rows }));
          }catch{}
          resolve(rows);
        },
        error: reject
      });
    }catch(e){ reject(e); }
  });
}

export function computeSalesRange(rows){
  const vals = rows.map(r=>toNumberLoose(r['総売上'])).filter(v=>isFinite(v)&&v>0);
  return { salesMin: vals.length?Math.min(...vals):0, salesMax: vals.length?Math.max(...vals):0 };
}

export function groupByLabel(rows){
  const byLabel=new Map(); const s=new Set();
  
    // ラベル列キーを堅牢に解決（normalizeHeader の影響を吸収）
    const resolveLabelKey = (row)=>{
      if (!row || typeof row!=='object') return null;
      const directKeys = ['ラベルID','label_id','ラベルid','ﾗﾍﾞﾙID'];
      for (const key of directKeys){ if (key in row) return key; }
      // 動的探索：ラベル/label と id を含むキーを拾う（例: "label id", "ラベル Id" 等）
      const zws = /\u200B|\u200C|\u200D|\uFEFF/g; // ゼロ幅/ BOM など
      for (const k of Object.keys(row)){
        const norm = String(k).replace(zws,'').toLowerCase();
        if ((/ラベル|label/).test(norm) && /id/.test(norm)) return k;
      }
      return null;
    };
  
    const zwsVal = /\u200B|\u200C|\u200D|\uFEFF/g;
    for (const r of rows){
      const key = resolveLabelKey(r);
      const raw = key ? r[key] : '';
      const k = String(raw ?? '').replace(zwsVal,'').trim();
      if (k === '') continue; // 空だけ除外（"0" は通す）
      if (!byLabel.has(k)) byLabel.set(k,[]);
      byLabel.get(k).push(r); s.add(k);
    }
  const labels=[...s].sort((a,b)=>a.localeCompare(b,'ja'));
  return { byLabel, labels };
}
