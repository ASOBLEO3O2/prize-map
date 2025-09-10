export function mountReplaceMode(host, rows){
  if (!host) return;
  host.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);color:#fff">
      <div style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.15)">
        <strong>入替指示</strong>
        <span style="flex:1"></span>
        <button id="rep-add"  style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer">追加</button>
        <button id="rep-clear"style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer">全削除</button>
      </div>
      <div id="rep-list" style="padding:10px;overflow:auto"></div>
    </div>`;
  const list = host.querySelector('#rep-list');
  const LS='asoble:replace:list';
  const load=()=>{ try{ return JSON.parse(localStorage.getItem(LS)||'[]'); }catch{ return []; } };
  const save=(a)=>{ try{ localStorage.setItem(LS, JSON.stringify(a)); }catch{} };
  const render=()=>{ const a=load(); list.innerHTML = a.length? a.map((x,i)=>`<div style="padding:8px;border-bottom:1px solid rgba(255,255,255,.12)">${i+1}. ${x}</div>`).join('') : '<div class="muted">未登録</div>'; };
  host.querySelector('#rep-add')  .addEventListener('click', ()=>{ const v=prompt('ラベルIDまたは景品名'); if(!v) return; const a=load(); a.push(String(v)); save(a); render(); });
  host.querySelector('#rep-clear').addEventListener('click', ()=>{ if(confirm('全削除しますか？')){ save([]); render(); } });
  render();
}
