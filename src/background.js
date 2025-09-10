// === src/background.js ===
// 背景画像のロード＆描画（ワールド実寸貼り付け）

export function loadBackground(url){
  return new Promise((resolve)=>{
    if (!url) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null); // 失敗しても先に進む
  });
}

// 先に ctx.translate/ctx.scale 済みの「ワールド座標(0,0)」へ実寸で描く
export function drawBackground(ctx, bgImg){
  if (!bgImg) return;
  const w = bgImg.naturalWidth  || bgImg.width;
  const h = bgImg.naturalHeight || bgImg.height;
  ctx.drawImage(bgImg, 0, 0, w, h);
}