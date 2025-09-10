export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const fmt0  = (n)=>Number(Math.round(n)).toLocaleString('ja-JP');
export const yen0  = (n)=>isFinite(n)?'¥'+fmt0(n):'-';
export const int0  = (n)=>isFinite(n)?fmt0(n):'-';
export const pct1  = (v)=>isFinite(v)?(v*100).toFixed(1)+'%':'-';
export function toHalfWidth(s){ return String(s).replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)); }
export function normalizeHeader(h){
  let s = String(h||'').replace(/\uFEFF/g,'');
  s = toHalfWidth(s).replace(/\s+/g,'');
  if (s==='奥行') s='奥行き';
  if (s==='ラベルId'||s==='ラベルid') s='ラベルID';
  if (s==='ブースId'||s==='ブースid') s='ブースID';
  return s;
}
export function toNumberLoose(v){
  if (v==null) return NaN;
  const s=String(v); let out='', seenDot=false, seenSign=false;
  for (let i=0;i<s.length;i++){
    const ch=s[i], code=ch.codePointAt(0);
    if (code>=0xFF10&&code<=0xFF19){ out+=String(code-0xFF10); continue; }
    if (code===0xFF0E){ if(!seenDot&&out){ out+='.'; seenDot=true; } continue; }
    if (code===0xFF0D){ if(!seenSign&&out.length===0){ out+='-'; seenSign=true; } continue; }
    if (ch>='0'&&ch<='9'){ out+=ch; continue; }
    if (ch==='.'&&!seenDot&&out){ out+='.'; seenDot=true; continue; }
    if (ch==='-'&&!seenSign&&out.length===0){ out+='-'; seenSign=true; continue; }
  }
  if (!out||out==='-'||out==='.'||out==='-.') return NaN;
  const n=Number(out); return Number.isFinite(n)?n:NaN;
}

// 色（原価率→枠色）
function hexToRgb(hex){hex=hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function lerpColor(c1,c2,t){const a=hexToRgb(c1),b=hexToRgb(c2); const r=Math.round(a.r+(b.r-a.r)*t), g=Math.round(a.g+(b.g-a.g)*t), bb=Math.round(a.b+(b.b-a.b)*t); return `rgb(${r},${g},${bb})`;}
export function strokeFromRate(rate, fallback='#9ca3af'){
  if(!isFinite(rate)) return fallback;
  const cBlue='#3b82f6', cWhite='#ffffff', cRed='#ef4444';
  if (rate<=0.30){ const t=clamp(rate/0.30,0,1); return lerpColor(cBlue,cWhite,t); }
  const t=clamp((rate-0.30)/0.08,0,1); return lerpColor(cWhite,cRed,t);
}

// 色（売上→塗りつぶし色）
export function fillFromSalesFunc(sales, min, max){
  if (!isFinite(sales) || sales<=0) return '#f9fafb'; // fallback: 薄い灰色
  if (max<=min) return '#f9fafb';

    const cLow   = '#2563eb';    // 青
  const cMid   = 'rgba(0,0,0,0)'; // 中間は透明
  const cHigh  = '#dc2626';    // 赤

  const t = (sales - min) / (max - min);
  if (t <= 0.5){
    // 青→透明
    return lerpColor(cLow, cMid, t/0.5);
  }else{
    // 透明→赤
    return lerpColor(cMid, cHigh, (t-0.5)/0.5);
  }
}