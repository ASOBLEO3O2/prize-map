export const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYAO0VSIbTG2fa-9W2Jl1NuG9smC4BOfqNZWiwsb5IHEIYWgcUWgCe_SZTWBPrnFiodfIGdxvKe7Up/pub?gid=1317014562&single=true&output=csv';

// 先頭スラッシュ禁止（相対パスで）
export const BG_URL = './plan_overlay.png';

// 実寸(cm)→px換算（縮尺1/4000）
export const CM_TO_PX = 37.795;
export const SCALE_DENOM = 4000;
export const DATA_SCALE = CM_TO_PX / SCALE_DENOM;

// レイアウト
export const COLS = 3;
export const startX = 0, startY = 0;
export const gapX = 28, gapY = 28;
export const cellGap = 0;

// 見た目
export const boxStroke = 'rgba(255,255,255,0.85)';
export const cellStrokeFallback = '#9ca3af';
export const labelColor = '#ffffff';

// ビュー初期値（全体スタート）
export const viewInit = {
  scale: 4, tx: 0, ty: 0,
  minScale: 0.25, maxScale: 16,
  mode: 'fit', // 'fit' | 'x3' | 'free'
};