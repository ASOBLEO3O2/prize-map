// 一覧・チップUI（dashboard.js から分離）

export function buildMachineChips(box, data, state){
  box.innerHTML = '';
  const machines = (data?.machines||[]).map(m=>m.name);
  const mk = (label, val, cls='chip')=>{
    const b=document.createElement('button'); b.type='button'; b.className=cls; b.textContent=label; b.dataset.value=val; return b;
  };
  const allBtn = mk('全選択','__all','chip ctrl');
  const clrBtn = mk('選択解除','__clear','chip ctrl');
  box.append(allBtn, clrBtn);
  machines.forEach(n=> box.appendChild(mk(n, n, 'chip')));
  updateChipActive(box, state);
  box.addEventListener('click', (ev)=>{
    const t = ev.target; if (!(t instanceof HTMLElement) || !t.classList.contains('chip')) return;
    const v = t.dataset.value||'';
    if (v==='__all'){ state.machines = null; }
    else if (v==='__clear'){ state.machines = new Set(); }
    else{
      if (!(state.machines instanceof Set)) state.machines = new Set();
      state.machines.has(v) ? state.machines.delete(v) : state.machines.add(v);
    }
    updateChipActive(box, state);
    syncHiddenSelect(document.querySelector('#db-machine'), state);
    const e = new Event('change'); (document.querySelector('#db-machine')||box).dispatchEvent(e);
  }, { once:false });
  box.dataset.filled = '1';
}

export function updateChipActive(box, state){
  const sel = (state.machines instanceof Set) ? state.machines : null;
  box.querySelectorAll('.chip').forEach(el=>{
    const v = el.dataset.value;
    if (el.classList.contains('ctrl')){
      el.classList.toggle('active', (v==='__all' && !sel) || (v==='__clear' && sel && sel.size===0));
    }else{
      el.classList.toggle('active', !!(sel && sel.has(v)));
    }
  });
}

export function syncHiddenSelect(sel, state){
  if (!sel) return;
  Array.from(sel.options).forEach(o=> o.selected=false);
  if (!(state.machines instanceof Set) || state.machines.size===0){
    const all = Array.from(sel.options).find(o=>o.value==='ALL'); if (all) all.selected = true;
  }else{
    Array.from(sel.options).forEach(o=>{ if (state.machines.has(o.value)) o.selected = true; });
  }
}

export function renderTable(host, rows){
  if (!host) return;
  const html = (rows||[]).map((r,i)=>`
    <div class="db-row">
      <div class="rank">#${i+1}</div>
       <div class="kvs">
      <div class="kv-key">景品名</div><div class="kv-val">${esc(r.prize||'-')}</div>
        <div class="kv-key">ラベルID</div><div class="kv-val">${esc(r.label||'-')}</div>
        <div class="kv-key">売上</div><div class="kv-val">¥${fmt(r.sales||0)}</div>
        <div class="kv-key">原価率</div><div class="kv-val">${((r.rate||0)*100).toFixed(1)}%</div>
      </div>
    </div>`).join('');
  host.innerHTML = html || '<div class="muted">データがありません</div>';
}

// --- local utils ---
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt = n => Number(n||0).toLocaleString('ja-JP');
