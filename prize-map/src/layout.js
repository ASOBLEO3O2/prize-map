import { DATA_SCALE, COLS, startX, startY, gapX, gapY, cellGap } from './constants.js';
import { toNumberLoose } from './utils.js';

// 2→左右、4→2×2、1→1
export function layoutItemsEqualSplit(items){
  const n=Math.min(items.length,4);
  let cols=1,rows=1;
  if (n===2){ cols=2; rows=1; }
  else if (n>=3){ cols=2; rows=2; }

  const wcm_total=toNumberLoose(items[0]['幅']);
  const hcm_total=toNumberLoose(items[0]['奥行き']??items[0]['奥行']);
  if (!isFinite(wcm_total)||!isFinite(hcm_total)) return { groupW:0, groupH:0, placements:[], n:0 };

  const wcm_cell=(cols===2)?(wcm_total/2):wcm_total;
  const hcm_cell=(rows===2)?(hcm_total/2):hcm_total;

  const cellW=Math.max(3, Math.round(wcm_cell*DATA_SCALE));
  const cellH=Math.max(3, Math.round(hcm_cell*DATA_SCALE));

  const groupW=cellW*cols+(cols-1)*cellGap;
  const groupH=cellH*rows+(rows-1)*cellGap;

  const placements=[];
  for (let i=0;i<n;i++){
    const c=(n===2)?i:(i%2);
    const r=(n===2)?0:Math.floor(i/2);
    placements.push({ x:c*(cellW+cellGap), y:r*(cellH+cellGap), w:cellW, h:cellH });
  }
  return { groupW, groupH, placements, n };
}

export function measureContentRect(labels, byLabel, colsOverride){
  let x=startX, y=startY, col=0, rowMaxH=0;
  let right=startX, bottom=startY;
  const C = Math.max(1, Number(colsOverride)||COLS);
  for (const label of labels){
    const items=byLabel.get(label)||[]; if (!items.length) continue;
    const { groupW:W, groupH:H } = layoutItemsEqualSplit(items);
    if (col>=C){ col=0; x=startX; y+=rowMaxH+gapY; rowMaxH=0; }
    right=Math.max(right, x+W); bottom=Math.max(bottom, y+H);
    x+=W+gapX; col+=1; rowMaxH=Math.max(rowMaxH,H);
  }
  return { left:startX, top:startY, right, bottom,
           width:Math.max(0,right-startX), height:Math.max(0,bottom-startY) };
}
