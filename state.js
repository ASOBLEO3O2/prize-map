// 状態と永続化（既存stateがあればこのAPIに揃えてください）
export const LS_VIEW = 'asoble:view';
export const LS_MACH = 'asoble:machines';

const saveTimers = new Map();
const debounceSave = (key, val, ms=120)=>{
  const json = JSON.stringify(val);
  const prev = saveTimers.get(key);
  prev && ((window.cancelIdleCallback||clearTimeout)(prev));
  const run = ()=>{ try{localStorage.setItem(key,json);}catch{} saveTimers.delete(key); };
  const id = (window.requestIdleCallback)
    ? requestIdleCallback(()=>run(),{timeout:ms})
    : setTimeout(run, ms);
  saveTimers.set(key, id);
};

export const clamp01 = v => Math.max(0, Math.min(1, Number(v)||0));
const load = (k,f)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):f; }catch{ return f; } };

// 表示設定
export function getViewState(){
  const v = load(LS_VIEW, {})||{};
  const show = ('showLabel'in v)?!!v.showLabel:('showMachineLabel'in v)?!!v.showMachineLabel:true;
  return { bgOpacity:(typeof v.bgOpacity==='number')?clamp01(v.bgOpacity):1, showLabel:show };
}
export function setViewState(next){
  const cur=getViewState();
  const out={
    bgOpacity: clamp01(next?.bgOpacity ?? cur.bgOpacity),
    showLabel: !!(next?.showLabel ?? cur.showLabel),
    showMachineLabel: !!(next?.showLabel ?? cur.showLabel) // 互換保存
  };
  debounceSave(LS_VIEW, out);
  return out;
}

// 機種
export function getSelectedMachines(allNames=[]){
  const saved = load(LS_MACH,null);
  const arr = (Array.isArray(saved)&&saved.length>0)?saved:allNames;
  return new Set(arr.map(String));
}
export function setSelectedMachines(sel){
  const arr = Array.from(sel).map(String);
  debounceSave(LS_MACH, arr);
  return new Set(arr);
}

const defaultState = {
    bgOpacity: 0.45,
    showLabel: true,
    dimOpacity: 0.3,   // ← 選択外の機種の透明度（新規）
  };