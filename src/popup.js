// === src/popup.js ===
console.log("[popup] loaded", import.meta.url);

/**
 * 必須: containerId
 * 省略可: closeBtnId（指定なければ自動生成）
 */
export function initPopup({ containerId = "popup", closeBtnId = "popup-close" } = {}) {
  let el = document.getElementById(containerId);

  // 無ければ自動生成
  if (!el) {
    console.warn("[popup] container not found:", containerId, "=> creating automatically");
    el = document.createElement("div");
    el.id = containerId;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.style.cssText = [
      "position:fixed","inset:0","display:none","z-index:9999",
      "align-items:center","justify-content:center",
      "background:rgba(0,0,0,0.45)"
    ].join(";");
    el.innerHTML = `
      <div id="${containerId}-content" style="
        min-width: 320px; max-width: 90vw;
        background:#fff; color:#111; border-radius:12px;
        box-shadow:0 10px 40px rgba(0,0,0,.35);
        padding:16px 16px 12px; position:relative;
      ">
        <button id="${closeBtnId}" type="button" aria-label="Close" style="
          position:absolute; top:8px; right:8px; border:0; outline:0;
          background:#eee; width:32px; height:32px; border-radius:8px; cursor:pointer;
        ">×</button>
        <div style="font-weight:700; font-size:18px; margin-bottom:8px;">ブース情報</div>
        <div id="${containerId}-body" style="font-size:14px; line-height:1.6;"></div>
      </div>`;
    document.body.appendChild(el);
  }

  const btnClose = document.getElementById(closeBtnId) || el.querySelector("button[id]");
  const body = document.getElementById(`${containerId}-body`) || el;

  // 閉じる
  const close = () => { el.style.display = "none"; };
  if (btnClose) btnClose.onclick = close;
  el.addEventListener("click", (e) => { if (e.target === el) close(); });

  // 開く（CSVの列名は「原価率」を前提）
  const open = (data = {}) => {
    const sales     = num(data["総売上"] ?? data["売上"]);
    const count     = num(data["消化数"]);
    const cost      = num(data["消化額"]);
    const unitPrice = Number.isFinite(sales) && Number.isFinite(count) && count > 0
      ? sales / count
      : num(data["単価"]);
    const genkaritsu = num(data["原価率"]);   // ← ここを「原価率」で固定

    body.innerHTML = `
      <table style="width:100%; border-collapse:separate; border-spacing:0 6px;">
        ${row("ラベルID", safe(data["ラベルID"]))}
        ${row("ブースID", safe(data["ブースID"]))}
        ${row("景品名",  safe(data["景品名"]))}
        ${row("総売上",  yen(sales))}
        ${row("平均単価", yen(unitPrice))}
        ${row("消化数",  int(count))}
        ${row("消化額",  yen(cost))}
        ${row("原価率",  pct(genkaritsu))}
      </table>
    `;
    el.style.display = "flex";
  };

  return { open, close };
}

// --- ユーティリティ ---
function row(label, value) {
  if (value == null || value === "") value = "-";
  return `
    <tr>
      <th style="text-align:left; font-weight:600; width:7em;">${escapeHtml(label)}</th>
      <td>${escapeHtml(String(value))}</td>
    </tr>`;
}

function num(v){ const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function yen(v){ const n = num(v); return Number.isFinite(n) ? `¥${Math.round(n).toLocaleString()}` : "-"; }
function int(v){ const n = num(v); return Number.isFinite(n) ? Math.round(n).toLocaleString() : "-"; }
function pct(v){
  const n = num(v);
  if (!Number.isFinite(n)) return "-";
  const p = n > 1 ? n : n * 100;
  return `${p.toFixed(1)}%`;
}
function safe(s){ return s == null ? "-" : s; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]
  ));
}