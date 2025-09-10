export function ensureCanvas(){
  let canvas=document.getElementById('mapCanvas');
  if (!canvas){
    canvas=document.createElement('canvas'); canvas.id='mapCanvas';
    (document.getElementById('stage')||document.body||document.documentElement).appendChild(canvas);
  }
  const fit=()=>{
    const w=Math.max(1024, window.innerWidth);
    const h=Math.max(768,  window.innerHeight);
    if (canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
  };
  window.addEventListener('resize', fit, {passive:true});
  fit();
  return { canvas, ctx: canvas.getContext('2d') };
}
