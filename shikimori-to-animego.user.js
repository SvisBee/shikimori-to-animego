// ==UserScript==
// @name         Shikimori to AnimeGO Importer
// @name:ru      Перенос Shikimori в AnimeGO
// @namespace    shiki-to-animego
// @version      0.6.1
// @updateURL    https://raw.githubusercontent.com/SvisBee/shikimori-to-animego/main/shikimori-to-animego.user.js
// @downloadURL  https://raw.githubusercontent.com/SvisBee/shikimori-to-animego/main/shikimori-to-animego.user.js
// @description  Import Shikimori anime into anime-go.org with preview and safety checks
// @description:ru Перенос аниме из Shikimori на anime-go.org с проверкой совпадений
// @match        https://anime-go.org/*
// @match        https://www.anime-go.org/*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  const statuses = { watching: "watching", completed: "completed", on_hold: "onhold", dropped: "dropped", planned: "planned", rewatching: null };
  const names = { watching: "Смотрю", completed: "Просмотрено", on_hold: "Отложено",
    dropped: "Брошено", planned: "Запланировано", rewatching: "Пересматриваю" };
  // RU: «Просмотрено» переносится как отдельный статус. Оценка не устанавливает его.
  // EN: Completed is an independent list status, not a side effect of rating.
  const eligible = item => Boolean(statuses[item.status]);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = v => String(v || "").normalize("NFKC").toLowerCase().replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  function statusOf(s) {
    const key = clean(s).replace(/ /g, "_");
    const lookup = { watching:"watching", completed:"completed", on_hold:"on_hold", onhold:"on_hold",
      dropped:"dropped", planned:"planned", plan_to_watch:"planned", rewatching:"rewatching",
      смотрю:"watching", просмотрено:"completed", отложено:"on_hold", брошено:"dropped",
      запланировано:"planned", пересматриваю:"rewatching" };
    return lookup[key] || null;
  }
  function parseList(text) {
    const raw = typeof text === "string" ? JSON.parse(text.replace(/^\uFEFF/, "")) : text;
    const list = Array.isArray(raw) ? raw : (raw.anime || raw.user_rates);
    if (!Array.isArray(list)) throw new Error("Нужен JSON с массивом аниме Shikimori");
    const skipped = [], items = [];
    list.forEach((r, index) => {
      if (!r || typeof r !== "object") { skipped.push(index); return; }
      if (String(r.target_type || "Anime").toLowerCase() !== "anime") return;
      const a = r.anime || {};
      const title = String(r.target_title || r.title || r.name || a.name || "").trim();
      const russian = String(r.russian || a.russian || "").trim();
      const status = statusOf(r.status);
      if (!status || (!title && !russian)) { skipped.push(index); return; }
      const score = Number(r.score) || 0;
      items.push({ sourceIndex:index, title, russian, status, episodes:Number(r.episodes) || 0,
        score:Math.max(0,Math.min(10,Math.trunc(score))), candidates:[], chosen:"", note:"", result:"pending" });
    });
    return { items, skipped };
  }
  function parseCandidates(html) {
    const dom = new DOMParser().parseFromString(html, "text/html");
    const found = new Map();
    dom.querySelectorAll("article.short").forEach(card => {
      const a = card.querySelector(".short__title a[href^='/anime/']");
      const href = a?.getAttribute("href") || "";
      const m = href.match(/\/anime\/[^/?#]*-(\d+)(?:[?#]|$)/);
      if (!m) return;
      const title = a.textContent.trim();
      const original = card.querySelector(".short__label")?.textContent?.trim() || "";
      const details = card.querySelector(".short__links")?.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!found.has(m[1])) found.set(m[1], { id:m[1], title, original, details, href });
    });
    return [...found.values()];
  }
  // RU: !, ?, ×× и др. могут отличать сезоны.
  // EN: Season-defining punctuation must not be ignored (e.g. ! vs !!).
  function exactName(value) {
    return String(value || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function confidence(item, candidate) {
    const a = [clean(item.title),clean(item.russian)].filter(Boolean);
    const b = [clean(candidate.title),clean(candidate.original)].filter(Boolean);
    const originals = [item.title, item.russian].filter(Boolean).map(exactName);
    const destinations = [candidate.original, candidate.title].filter(Boolean).map(exactName);
    if (originals.some(x => destinations.includes(x))) return 1;
    // RU: Не выбираем автоматически при отличающейся пунктуации.
    // EN: Never auto-select when punctuation differs.
    if (a.some(x => b.includes(x))) return 0.84;
    let result = 0;
    a.forEach(x => b.forEach(y => {
      const xs = new Set(x.split(" ")), ys = new Set(y.split(" "));
      const hit = [...xs].filter(z => ys.has(z)).length;
      result = Math.max(result, 0.8 * hit / new Set([...xs,...ys]).size);
    }));
    return result;
  }
  function choose(item, candidates) {
    const ranked = candidates.map(c => ({...c, confidence:confidence(item,c)}))
      .sort((a,b)=>b.confidence-a.confidence);
    // RU: Выбираем только уникальное точное совпадение, не смешиваем сезоны.
    // EN: Auto-select only a unique exact title match; do not mix seasons.
    const chosen = ranked[0]?.confidence === 1 && ranked.filter(c=>c.confidence===1).length===1
      ? ranked[0].id : "";
    return { ranked, chosen };
  }
  function parseReport(raw) {
    const obj = typeof raw === "string" ? JSON.parse(raw.replace(/^\uFEFF/, "")) : raw;
    if (!obj || obj.version !== 1 || !Array.isArray(obj.items) || obj.items.length > 10000)
      throw new Error("Ожидается JSON-отчёт версии 1 от этого импортёра");
    const items = obj.items.map((entry, index) => {
      if (!entry || typeof entry !== "object" ||
          !Object.hasOwn(statuses, entry.status) ||
          typeof entry.title !== "string" ||
          typeof entry.sourceIndex !== "number" ||
          !Array.isArray(entry.candidates) || entry.candidates.length > 250)
        throw new Error("Некорректная запись отчёта №" + (index + 1));
      const candidates = entry.candidates.map(c => {
        if (!c || !/^\d+$/.test(String(c.id)) ||
            typeof c.href !== "string" || !/^\/anime\/[\w-]+-\d+$/.test(c.href) ||
            typeof c.title !== "string" || typeof c.original !== "string")
          throw new Error("Некорректная ссылка на тайтл в отчёте, строка №" + (index + 1));
        return {id:String(c.id), href:c.href, title:c.title, original:c.original,
          details:String(c.details || "")};
      });
      const item = {
        sourceIndex: entry.sourceIndex, title:entry.title,
        russian: String(entry.russian || ""), status:entry.status,
        episodes: Math.max(0, Math.trunc(Number(entry.episodes) || 0)),
        score: Math.max(0, Math.min(10, Math.trunc(Number(entry.score) || 0))),
        candidates:[], chosen:"", note:"", result:"pending"
      };
      const evaluated = choose(item, candidates);
      item.candidates = evaluated.ranked;
      const explicit = String(entry.chosen || "");
      item.chosen = eligible(item) ?
        (explicit && item.candidates.some(c=>c.id===explicit) ? explicit : evaluated.chosen) : "";
      // RU: Ошибки старой версии не блокируют повторную попытку после проверки.
      // EN: Previously failed entries may be retried after reviewing the report.
      item.result = entry.result === "imported" ? "imported" : "pending";
      item.note = entry.result === "verify_failed"
        ? "Предыдущая попытка не подтверждена. Проверьте и повторите при необходимости"
        : item.result === "imported" ? String(entry.note || "Перенесено ранее")
        : !eligible(item) ? "Статус пока не поддерживается"
        : item.chosen ? "Точное совпадение, проверьте" : "Требует проверки";
      return item;
    });
    return {items, skipped:Array.isArray(obj.skipped) ? obj.skipped : []};
  }
  const exported = { clean, exactName, statusOf, parseList, parseCandidates, confidence, choose, parseReport, statuses, eligible, animePathMatches: (path,id)=>{const m=String(path||"").match(/^\/anime\/[^/?#]*-(\d+)(?:[?#]|$)/);return Boolean(m)&&m[1]===String(id);} };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof document === "undefined") return;
  if (!["anime-go.org", "www.anime-go.org"].includes(location.hostname)) return;
  if (window.top !== window.self || document.getElementById("shiki-ag-open")) return;
  const style = document.createElement("style");
  style.textContent = String.raw`
#shiki-ag-open{position:fixed;right:20px;bottom:20px;z-index:2147483640;display:flex;align-items:center;gap:10px;min-height:45px;padding:10px 16px;border:1px solid #a09aff55;border-radius:13px;background:#3437a5;color:#fff;font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 35px #0007,0 0 0 3px #8c87f51a;cursor:pointer;transition:transform .18s,background .18s}
#shiki-ag-open:hover{transform:translateY(-2px);background:#5054c7}
#shiki-ag-open:focus-visible,#shiki-ag-modal button:focus-visible,#shiki-ag-modal select:focus-visible,#shiki-ag-modal input:focus-visible{outline:2px solid #ada8ff;outline-offset:3px}
#shiki-ag-modal{--ag-bg:#10151f;--ag-panel:#171e2b;--ag-panel2:#1b2433;--ag-border:#303b4e;--ag-ink:#edf0fa;--ag-muted:#a5b0c4;--ag-accent:#9e95ff;--ag-good:#74dcb4;--ag-warn:#ffc98c;position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:18px;background:#050812d9;color:var(--ag-ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left}
#shiki-ag-modal *{box-sizing:border-box}
#shiki-ag-modal .ag-shell{position:relative;display:flex;flex-direction:column;width:min(1220px,100%);height:min(900px,95vh);min-height:340px;overflow:hidden;border:1px solid #394457;border-radius:20px;background:var(--ag-bg);box-shadow:0 34px 110px #000b}
#shiki-ag-modal .ag-head{position:relative;padding:24px 28px 20px;background:radial-gradient(700px 210px at 100% 0%,#5d5ac02b,transparent 80%),linear-gradient(160deg,#1b2231,#131a25);border-bottom:1px solid var(--ag-border);flex-shrink:0}
#shiki-ag-modal .ag-head-row{display:flex;justify-content:space-between;gap:12px;align-items:start}
#shiki-ag-modal .ag-brand{display:flex;align-items:center;gap:13px;min-width:0}
#shiki-ag-modal .ag-brand-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border:1px solid #8b83ec66;border-radius:12px;background:#6f66da22;color:#b9b4ff;font-size:24px;font-weight:700}
#shiki-ag-modal .ag-eyebrow{font-size:10px;letter-spacing:.13em;text-transform:uppercase;font-weight:800;color:#aba3ff;margin-bottom:2px}
#shiki-ag-modal h2{margin:0;color:#f4f6ff;font-weight:730;font-size:clamp(18px,2.5vw,25px);letter-spacing:-.03em;line-height:1.25}
#shiki-ag-modal .ag-intro{margin:11px 0 0;max-width:760px;color:var(--ag-muted);font-size:12px}
#shiki-ag-modal .ag-scroll{padding:22px 28px 28px;overflow-y:auto;overflow-x:hidden;flex:1;scrollbar-width:thin;scrollbar-color:#5a6880 transparent}
#shiki-ag-modal .ag-section-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
#shiki-ag-modal h3{margin:0;color:#f3f4ff;font-size:14px;font-weight:720}
#shiki-ag-modal .ag-step{display:inline-grid;place-items:center;min-width:24px;height:24px;border:1px solid #7975d766;border-radius:8px;background:#685fda23;color:#beb7ff;font-weight:800;font-size:11px}
#shiki-ag-modal .ag-heading{display:flex;align-items:center;gap:9px}
#shiki-ag-modal .ag-muted{color:var(--ag-muted);font-size:12px}
#shiki-ag-modal .ag-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(290px,1fr);gap:15px;margin:18px 0}
#shiki-ag-modal .ag-card{min-width:0;padding:17px;background:var(--ag-panel);border:1px solid var(--ag-border);border-radius:13px}
#shiki-ag-modal .ag-divider{height:1px;background:var(--ag-border);margin:14px 0}
#shiki-ag-modal .ag-file{display:flex;flex-direction:column;gap:7px}
#shiki-ag-modal .ag-file-title{color:#e7eafd;font-weight:650;font-size:12px}
#shiki-ag-modal input[type=file]{display:block;width:100%;max-width:100%;color:#c4cce0;font-size:12px;background:#111925;border:1px dashed #4d5a70;border-radius:9px;padding:9px;cursor:pointer}
#shiki-ag-modal input[type=file]::file-selector-button{border:0;border-radius:7px;background:#333e57;padding:7px 10px;margin-right:9px;color:#eaefff;font:600 11px system-ui;cursor:pointer}
#shiki-ag-modal input[type=text],#shiki-ag-modal input[type=search],#shiki-ag-modal input[type=number],#shiki-ag-modal select{min-width:0;max-width:100%;background:#0f1723;color:#eff2ff;border:1px solid #46536a;border-radius:9px;padding:9px 11px;font:inherit;font-size:12px}
#shiki-ag-modal select{min-height:40px;width:100%;cursor:pointer;color-scheme:dark}
#shiki-ag-modal input[type=checkbox]{accent-color:#9b91f9;width:16px;height:16px;margin:0;cursor:pointer}
#shiki-ag-modal button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #445167;border-radius:9px;background:#283346;color:#ecf0ff;padding:9px 13px;min-height:39px;font:650 12px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
#shiki-ag-modal button:hover:not(:disabled){background:#37455c;border-color:#7183a0}
#shiki-ag-modal button:active:not(:disabled){transform:translateY(1px)}
#shiki-ag-modal button:disabled{opacity:.48;cursor:not-allowed}
#shiki-ag-modal button.ag-primary{border-color:#978bff;background:#7b72e8;color:#fff}
#shiki-ag-modal button.ag-primary:hover:not(:disabled){background:#9087f9}
#shiki-ag-modal button.ag-quiet{border-color:transparent;background:transparent;color:#b7c3da}
#shiki-ag-modal button.ag-danger-quiet{border-color:#765354;background:#422b31;color:#ffd6d9}
#shiki-ag-modal .ag-close{flex-shrink:0;width:36px;height:36px;padding:0;font-size:19px;border-radius:10px}
#shiki-ag-modal .ag-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}
#shiki-ag-modal .ag-setting{display:flex;flex-direction:column;gap:6px;min-width:95px;font-size:12px;color:var(--ag-muted)}
#shiki-ag-modal .ag-check{display:flex;align-items:flex-start;gap:10px;color:#e0e7f6;font-size:12px;line-height:1.45;margin-top:14px;cursor:pointer}
#shiki-ag-modal .ag-figure{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 18px}
#shiki-ag-modal .ag-stat{appearance:none!important;text-align:left!important;display:flex!important;align-items:start!important;flex-direction:column;gap:3px;min-width:0;min-height:82px;border:1px solid var(--ag-border);border-radius:12px;background:var(--ag-panel);padding:13px 14px;cursor:pointer;color:var(--ag-ink)}
#shiki-ag-modal .ag-stat[aria-pressed=true]{border-color:#9086ff;background:linear-gradient(160deg,#332d5b,#1e2637)}
#shiki-ag-modal .ag-stat-count{font-size:23px;line-height:1.2;font-weight:780;letter-spacing:-.035em;font-variant-numeric:tabular-nums}
#shiki-ag-modal .ag-stat-name{font-size:11px;color:#afb9cb;font-weight:560}
#shiki-ag-modal .ag-status{display:flex;align-items:center;gap:11px;border:1px solid #48506a;border-radius:10px;background:#24293c;padding:11px 13px;margin:0 0 16px;min-height:44px;color:#dfe5f9;font-size:12px}
#shiki-ag-modal .ag-status:before{content:"";width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:#b6aaff;box-shadow:0 0 0 4px #b6aaff17}
#shiki-ag-modal .ag-status[data-kind=error]{border-color:#945359;background:#3a222b;color:#ffdfe2}
#shiki-ag-modal .ag-status[data-kind=error]:before{background:#ff8d9b}
#shiki-ag-modal .ag-status[data-kind=success]{border-color:#376a60;background:#1b3532;color:#bdffdf}
#shiki-ag-modal .ag-status[data-kind=success]:before{background:#74dcb4}
#shiki-ag-modal .ag-progress{height:4px;background:#29344b;overflow:hidden;border-radius:999px;margin-top:-13px;margin-bottom:15px}
#shiki-ag-modal #ag-progressbar{height:100%;width:0%;background:linear-gradient(90deg,#6fd9c5,#a49aff);transition:width .2s}
#shiki-ag-modal .ag-preview{border:1px solid var(--ag-border);border-radius:13px;background:var(--ag-panel);overflow:hidden}
#shiki-ag-modal .ag-preview-tools{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid var(--ag-border)}
#shiki-ag-modal .ag-search{display:flex;align-items:center;gap:8px;background:#101824;border:1px solid #455268;border-radius:9px;padding:0 10px;min-width:210px;flex:1;max-width:350px}
#shiki-ag-modal .ag-search input{width:100%;border:0;background:transparent;padding:10px 2px;outline:none;color:#f6f7ff}
#shiki-ag-modal .ag-filters{display:flex;gap:5px;flex-wrap:wrap}
#shiki-ag-modal button.ag-filter{min-height:31px;padding:6px 9px;border-color:transparent;background:transparent;color:#b1bed1;font-size:11px}
#shiki-ag-modal button.ag-filter[aria-pressed=true]{background:#393365;border-color:#766bd3;color:#f5f2ff}
#shiki-ag-modal .ag-table-wrap{overflow-x:auto;max-width:100%}
#shiki-ag-modal table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:720px;font-size:12px}
#shiki-ag-modal thead th{padding:12px 15px;font-size:10px;letter-spacing:.065em;text-transform:uppercase;color:#8f9eb4;background:#151d2a;text-align:left;font-weight:750;border-bottom:1px solid var(--ag-border)}
#shiki-ag-modal th:nth-child(1){width:29%}
#shiki-ag-modal th:nth-child(2){width:16%}
#shiki-ag-modal th:nth-child(3){width:39%}
#shiki-ag-modal th:nth-child(4){width:16%}
#shiki-ag-modal td{vertical-align:middle;padding:12px 15px;border-bottom:1px solid #293445;color:#e4e9f6;overflow-wrap:anywhere}
#shiki-ag-modal tbody tr:hover{background:#242f3e}
#shiki-ag-modal .ag-title-name{display:block;font-size:12px;color:#f4f5ff;font-weight:670;line-height:1.48}
#shiki-ag-modal .ag-sub{display:block;font-size:11px;color:var(--ag-muted);margin-top:3px}
#shiki-ag-modal .ag-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border:1px solid #4d5870;border-radius:6px;background:#242f43;font-size:11px;color:#c9d5ec;white-space:nowrap}
#shiki-ag-modal .ag-pill[data-status=completed]{color:#a5e7d1;border-color:#3b736a;background:#1d3a37}
#shiki-ag-modal .ag-pill[data-status=dropped]{color:#ffc4c7;border-color:#734550;background:#3b2934}
#shiki-ag-modal .ag-pill[data-status=watching]{color:#b8afff;border-color:#55508d;background:#2d294d}
#shiki-ag-modal .ag-feedback{font-size:11px;line-height:1.45;color:#b0bdd0}
#shiki-ag-modal .ag-feedback[data-status=imported]{color:#81e1b7}
#shiki-ag-modal .ag-feedback[data-status=error],#shiki-ag-modal .ag-feedback[data-status=verify_failed]{color:#ffbac3}
#shiki-ag-modal .ag-feedback[data-status=needs-review]{color:#ffe3a1}
#shiki-ag-modal .ag-link{display:inline-block;color:#ada8ff;font-size:11px;text-decoration:underline;text-decoration-color:#ada8ff66;margin-top:5px}
#shiki-ag-modal .ag-preview-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 15px;color:#a5b1c5;font-size:11px}
#shiki-ag-modal .ag-hint{margin-top:10px;font-size:11px;color:#9ba9be}
#shiki-ag-modal .ag-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:15px;padding:12px 0;border-top:1px solid var(--ag-border);font-size:11px;color:#9ba9be}
#shiki-ag-modal .ag-empty{padding:35px 18px;text-align:center;color:#9facc1;font-size:12px}
#shiki-ag-modal .ag-kbd{font-size:10px;border:1px solid #455066;padding:2px 5px;border-radius:5px;color:#cad2e1}
@media(max-width:800px){#shiki-ag-modal{padding:7px}#shiki-ag-modal .ag-shell{width:100%;height:99vh;border-radius:14px}#shiki-ag-modal .ag-head{padding:18px}#shiki-ag-modal .ag-scroll{padding:15px}#shiki-ag-modal .ag-grid{grid-template-columns:1fr;gap:10px}#shiki-ag-modal .ag-figure{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}#shiki-ag-modal .ag-stat{min-height:76px;padding:10px}#shiki-ag-modal .ag-stat-count{font-size:20px}#shiki-ag-modal .ag-preview-tools{align-items:stretch}#shiki-ag-modal .ag-search{max-width:none;flex-basis:100%}#shiki-ag-modal .ag-footer{align-items:flex-start;flex-direction:column}}
@media(max-width:420px){#shiki-ag-modal .ag-figure{grid-template-columns:repeat(2,minmax(0,1fr))}#shiki-ag-modal .ag-head{padding:16px}#shiki-ag-modal .ag-scroll{padding:12px}#shiki-ag-modal .ag-brand-icon{width:34px;height:34px}#shiki-ag-modal .ag-card{padding:13px}#shiki-ag-modal .ag-actions button{flex:1}#shiki-ag-modal .ag-stat{min-height:66px}}

@media(max-width:640px){
#shiki-ag-modal .ag-table-wrap{overflow:visible}
#shiki-ag-modal table,#shiki-ag-modal tbody{display:block;width:100%;min-width:0}
#shiki-ag-modal thead{display:none}
#shiki-ag-modal tbody tr{display:grid;grid-template-columns:1fr;gap:8px;padding:14px;border-bottom:1px solid var(--ag-border)}
#shiki-ag-modal tbody tr>td{display:block;width:100%;border:0;padding:0;min-width:0}
#shiki-ag-modal tbody tr>td:nth-child(1){grid-row:1}
#shiki-ag-modal tbody tr>td:nth-child(2){grid-row:2}
#shiki-ag-modal tbody tr>td:nth-child(3){grid-row:3}
#shiki-ag-modal tbody tr>td:nth-child(4){grid-row:4}
#shiki-ag-modal tbody tr>td:nth-child(4):before{content:"Результат";display:block;color:#8495ad;text-transform:uppercase;font-size:10px;letter-spacing:.06em;margin-top:4px}
#shiki-ag-modal tbody tr .ag-title-name{font-size:13px}
#shiki-ag-modal tbody tr select{min-height:44px}
#shiki-ag-modal .ag-preview-bottom{align-items:flex-start;flex-direction:column}
#shiki-ag-modal .ag-preview-bottom button{align-self:stretch}
#shiki-ag-modal .ag-empty{padding:18px!important}
}

#shiki-ag-modal .ag-livebar{flex:0 0 auto;background:#181f2e;padding:10px 26px 12px;border-bottom:1px solid var(--ag-border);z-index:2}
#shiki-ag-modal .ag-live-top{display:flex;align-items:center;gap:12px}
#shiki-ag-modal .ag-livebar .ag-status{margin:0;padding:5px 0;min-height:0;flex:1;border:0;background:transparent;overflow-wrap:anywhere}
#shiki-ag-modal .ag-live-actions{display:flex;gap:6px;flex:0 0 auto}
#shiki-ag-modal .ag-live-actions button{min-height:29px;padding:5px 9px;font-size:11px}
#shiki-ag-modal .ag-live-meta{font-size:11px;color:#aab8d0;line-height:1.4;margin:3px 0 7px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#shiki-ag-modal .ag-livebar .ag-progress{height:5px;margin:0;border-radius:10px}
#shiki-ag-modal .ag-live-error{margin-top:8px;padding:8px 11px;border-radius:8px;background:#422631;border:1px solid #a65c66;color:#ffe0e5;font-size:11px;line-height:1.5;max-height:90px;overflow:auto}
#shiki-ag-modal .ag-live-error[hidden]{display:none}
@media(max-width:800px){#shiki-ag-modal .ag-livebar{padding:9px 15px}}
@media(max-width:480px){#shiki-ag-modal .ag-live-top{align-items:flex-start;flex-direction:column;gap:3px}
#shiki-ag-modal .ag-live-actions{align-self:flex-end}#shiki-ag-modal .ag-live-meta{white-space:normal;max-height:36px;overflow:hidden}}
@media(prefers-reduced-motion:reduce){#shiki-ag-open,#shiki-ag-modal button,#shiki-ag-modal #ag-progressbar{transition:none!important}}
`;
  document.head.append(style);
  const btn = document.createElement("button");
  btn.id = "shiki-ag-open";
  btn.type = "button";
  btn.textContent = "↗ Импорт Shikimori";
  document.body.append(btn);
  const modal = document.createElement("div");
  modal.id = "shiki-ag-modal";
  modal.innerHTML = String.raw`
<div class="ag-shell" role="dialog" aria-modal="true" aria-labelledby="ag-dialog-title">
  <header class="ag-head">
    <div class="ag-head-row">
      <div class="ag-brand">
        <div class="ag-brand-icon" aria-hidden="true">↗</div>
        <div>
          <div class="ag-eyebrow">Shikimori / AnimeGO • Import Studio</div>
          <h2 id="ag-dialog-title">Перенос списка аниме</h2>
        </div>
      </div>
      <button type="button" id="ag-close" class="ag-quiet ag-close" aria-label="Закрыть окно" title="Закрыть">×</button>
    </div>
    <p class="ag-intro">Перенеси список со своими статусами и оценками. Сначала проверь совпадения и сезоны, только потом подтверждай изменения аккаунта.</p>
  </header>
  <div class="ag-livebar" aria-label="Ход работы импортёра">
    <div class="ag-live-top">
      <div class="ag-status" id="ag-status-wrap" data-kind="info">
        <span id="ag-status" role="status" aria-live="polite">Загрузи экспорт Shikimori или сохранённый отчёт.</span>
      </div>
      <div class="ag-live-actions">
        <button type="button" id="ag-dock-report" disabled>⇩ Отчёт</button>
        <button type="button" id="ag-dock-stop" class="ag-danger-quiet" disabled>■ Стоп</button>
      </div>
    </div>
    <div class="ag-live-meta" id="ag-live-meta" aria-live="off">Нет активных операций</div>
    <div class="ag-progress" role="progressbar" aria-label="Прогресс операции" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="ag-progress">
      <div id="ag-progressbar"></div>
    </div>
    <div id="ag-last-error" class="ag-live-error" role="alert" hidden></div>
  </div>
  <div class="ag-scroll">
    <div class="ag-figure" id="ag-stats" aria-label="Статистика импорта"></div>
    <div class="ag-grid">
      <section class="ag-card" aria-labelledby="ag-source-head">
        <div class="ag-section-top"><div class="ag-heading"><span class="ag-step">1</span><h3 id="ag-source-head">Источник данных</h3></div><span class="ag-muted">JSON • Shikimori</span></div>
        <label class="ag-file" for="ag-file">
          <span class="ag-file-title">Новый экспорт из Shikimori</span>
          <input type="file" id="ag-file" accept=".json,application/json">
        </label>
        <div class="ag-actions">
          <button type="button" id="ag-scan" class="ag-primary">⌕ Найти совпадения</button>
          <button type="button" id="ag-stop" class="ag-danger-quiet">■ Остановить</button>
        </div>
        <div class="ag-divider"></div>
        <label class="ag-file" for="ag-report-file">
          <span class="ag-file-title">Уже есть отчёт? Без повторного поиска</span>
          <input type="file" id="ag-report-file" accept=".json,application/json">
        </label>
        <div class="ag-actions"><button type="button" id="ag-restore">↺ Восстановить отчёт</button>
          <button type="button" id="ag-clear-progress" class="ag-quiet">Очистить автосохранение</button></div>
        <p class="ag-hint">Статусы и ошибки автоматически сохраняются локально в этом браузере после каждой записи. Для продолжения открой прежний JSON-отчёт.</p>
      </section>
      <section class="ag-card" aria-labelledby="ag-settings-head">
        <div class="ag-section-top"><div class="ag-heading"><span class="ag-step">2</span><h3 id="ag-settings-head">Настройки переноса</h3></div><span class="ag-muted">Безопасный режим</span></div>
        <div class="ag-actions">
          <label class="ag-setting" for="ag-profile-id">ID профиля AnimeGO
            <input id="ag-profile-id" type="text" inputmode="numeric" placeholder="12345" maxlength="12" autocomplete="off">
          </label>
          <label class="ag-setting" for="ag-limit">Аниме за один запуск
            <input type="number" id="ag-limit" min="1" max="10000" value="2">
          </label>
        </div>
        <label class="ag-check" for="ag-vote">
          <input type="checkbox" id="ag-vote">
          <span>Дополнительно переносить оценки <span class="ag-muted">(отдельная экспериментальная операция)</span></span>
        </label>
        <p class="ag-hint">Оценка не определяет статус «Просмотрено». В первом запуске оставь галочку выключенной, а лимит поставь на 1–2 аниме. Фильтры и поиск влияют только на отображение, не на порядок импорта.</p>
        <div class="ag-actions">
          <button type="button" id="ag-import" class="ag-primary">✓ Импортировать выбранные</button>
          <button type="button" id="ag-report">⇩ Сохранить отчёт JSON</button>
        </div>
      </section>
    </div>
    <section aria-labelledby="ag-preview-head">
      <div class="ag-section-top">
        <div class="ag-heading"><span class="ag-step">3</span><h3 id="ag-preview-head">Проверка совпадений</h3></div>
        <span class="ag-muted" id="ag-preview-count">Нет загруженных записей</span>
      </div>
      <div class="ag-preview">
        <div class="ag-preview-tools">
          <label class="ag-search">
            <span aria-hidden="true">⌕</span>
            <input id="ag-find" type="search" placeholder="Поиск по названию или ID…" aria-label="Поиск по названию аниме">
          </label>
          <div class="ag-filters" id="ag-filters" role="group" aria-label="Фильтр записей"></div>
        </div>
        <div class="ag-table-wrap">
          <table aria-label="Сопоставление списков Shikimori и AnimeGO">
            <thead><tr>
              <th scope="col">Аниме Shikimori</th>
              <th scope="col">Статус</th>
              <th scope="col">Совпадение на AnimeGO</th>
              <th scope="col">Результат</th>
            </tr></thead>
            <tbody id="ag-body"></tbody>
          </table>
        </div>
        <div class="ag-preview-bottom">
          <span id="ag-table-count">Данные ещё не загружены</span>
          <button type="button" id="ag-more" style="display:none">Показать ещё 50 ↓</button>
        </div>
      </div>
    </section>
    <footer class="ag-footer">
      <span>Не закрывай вкладку во время импорта. Неподтверждённые совпадения не переносятся.</span>
      <span>v0.6.1 beta · RU / EN</span>
    </footer>
  </div>
</div>
`;
  document.body.append(modal);
  const openModal = () => { modal.style.display = "flex"; modal.querySelector("#ag-close").focus(); };
  const closeModal = () => { if (busy) return; modal.style.display = "none"; btn.focus(); };
  btn.addEventListener("click", openModal);
  const profileMatch = location.pathname.match(/^\/user\/(\d+)(?:\/|$)/);
  if (profileMatch) modal.querySelector("#ag-profile-id").value = profileMatch[1];
  const el = id => modal.querySelector("#"+id);
  let items = [], skipped = [], busy = false, stopped = false, searched = false;
  // RU: Локальный checkpoint хранит только результаты; исходный экспорт не записываем.
  // EN: Local checkpoint stores only per-title results, not the full export.
  const CHECKPOINT_PREFIX = "shiki-animego:checkpoint:v1:";
  const profileId = () => el("ag-profile-id").value.trim();
  const rowKey = row => [row.sourceIndex, row.title, row.status, row.chosen].join("|");
  const checkpointKey = () => CHECKPOINT_PREFIX + profileId();
  function getCheckpoint() {
    if (!/^\d{1,12}$/.test(profileId())) return null;
    try {
      const raw = window.localStorage.getItem(checkpointKey());
      const obj = raw && JSON.parse(raw);
      return obj?.version === 1 && obj?.profile === profileId() &&
        typeof obj?.entries === "object" ? obj : {version:1,profile:profileId(),entries:{}};
    } catch (_) { return null; }
  }
  function ensureCheckpoint() {
    if (!/^\d{1,12}$/.test(profileId()))
      throw new Error("Укажите ID своего профиля, чтобы обеспечить автосохранение.");
    try {
      const key=checkpointKey();
      const prior=window.localStorage.getItem(key);
      window.localStorage.setItem(key,prior || JSON.stringify({version:1,profile:profileId(),entries:{}}));
    } catch (_) {
      throw new Error("Браузер запретил локальное сохранение. Импорт не запущен, чтобы не потерять прогресс.");
    }
  }
  function saveCheckpoint(row) {
    const saved=getCheckpoint();
    if (!saved) throw new Error("Не удалось прочитать локальное автосохранение.");
    saved.entries[rowKey(row)]={result:row.result,note:String(row.note||"").slice(0,350)};
    saved.updatedAt=new Date().toISOString();
    try {window.localStorage.setItem(checkpointKey(),JSON.stringify(saved));}
    catch (_) {throw new Error("Автосохранение не удалось. Остановите импорт и скачайте отчёт.");}
  }
  function restoreCheckpoint() {
    const saved=getCheckpoint();
    if (!saved) return 0;
    let restored=0;
    items.forEach(row=>{
      const state=saved.entries[rowKey(row)];
      if (!state || row.result === "imported" || !["imported","error","verify_failed"].includes(state.result)) return;
      row.result=state.result;
      row.note=state.note || "";
      restored++;
    });
    return restored;
  }

  let activeFilter = "all", visibleCount = 50;
  const FILTERS = [
    ["all", "Все"], ["ready", "Готово к импорту"], ["review", "Проверить"],
    ["missing", "Не найдено"], ["unsupported", "Недоступно"],
    ["done", "Перенесено"], ["error", "Ошибки"]
  ];
  const groupOf = r => {
    if (r.result === "imported") return "done";
    if (r.result === "error" || r.result === "verify_failed") return "error";
    if (!eligible(r)) return "unsupported";
    if (!r.candidates.length) return "missing";
    return r.chosen ? "ready" : "review";
  };
  function setInfo(message, kind = "info") {
    el("ag-status").textContent = message;
    el("ag-status-wrap").dataset.kind =
      kind === "error" || /^Ошибка|^Не удалось|^Не найден/.test(message) ? "error"
        : kind === "success" ? "success" : "info";
  }
  const info = setInfo;
  function live(text,failed="") {
    el("ag-live-meta").textContent=text;
    const target=el("ag-last-error");
    target.hidden=!failed;
    if (failed) target.textContent=failed;
  }
  function clearError() {
    el("ag-last-error").hidden=true;
    el("ag-last-error").textContent="";
  }
  function setProgress(done, total) {
    const p = total ? Math.min(100, Math.round(done * 100 / total)) : 0;
    el("ag-progressbar").style.width = p + "%";
    el("ag-progress").setAttribute("aria-valuenow", String(p));
  }
  function counts() {
    const counters = {all: items.length, ready:0, review:0, missing:0, unsupported:0, done:0, error:0};
    items.forEach(r => counters[groupOf(r)]++);
    return counters;
  }
  function filtered() {
    const needle = clean(el("ag-find").value);
    return items.filter(r => {
      if (activeFilter !== "all" && groupOf(r) !== activeFilter) return false;
      if (!needle) return true;
      const text = [r.title, r.russian, String(r.chosen),
        ...r.candidates.slice(0,5).flatMap(c=>[c.title,c.original,c.id])].join(" ");
      return clean(text).includes(needle);
    });
  }
  function setFilter(filter) {
    activeFilter = filter;
    visibleCount = 50;
    render();
  }
  function renderStats(totals) {
    const labels = [
      ["all","Всего в списке"],
      ["ready","Готово к переносу"],
      ["review","Проверить вручную"],
      ["done","Уже перенесено"],
      ["missing","Не найдено"]
    ];
    const root = el("ag-stats");
    root.replaceChildren();
    labels.forEach(([key,label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ag-stat";
      button.dataset.filter = key;
      button.setAttribute("aria-pressed", String(activeFilter === key));
      const number = document.createElement("span");
      number.className = "ag-stat-count";
      number.textContent = String(totals[key]);
      const hint = document.createElement("span");
      hint.className = "ag-stat-name";
      hint.textContent = label;
      button.append(number,hint);
      button.addEventListener("click", () => setFilter(key));
      root.append(button);
    });
  }
  function renderFilters(totals) {
    const root = el("ag-filters");
    root.replaceChildren();
    FILTERS.forEach(([key,label])=>{
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ag-filter";
      button.setAttribute("aria-pressed", String(key === activeFilter));
      button.textContent = label + (key === "all" ? "" : " " + totals[key]);
      button.addEventListener("click",()=>setFilter(key));
      root.append(button);
    });
  }
  function render() {
    const totals = counts();
    renderStats(totals);
    renderFilters(totals);
    const shown = filtered();
    const list = shown.slice(0, visibleCount);
    const fragment = document.createDocumentFragment();
    list.forEach((r,i)=>{
      const tr = document.createElement("tr");
      const group = groupOf(r);
      const title = document.createElement("td");
      const strong = document.createElement("span");
      strong.className = "ag-title-name";
      strong.textContent = r.title || r.russian;
      title.append(strong);
      if (r.russian && r.russian !== r.title) {
        const ru = document.createElement("span");
        ru.className = "ag-sub"; ru.textContent = r.russian;
        title.append(ru);
      }
      const status = document.createElement("td");
      const pill = document.createElement("span");
      pill.className = "ag-pill"; pill.dataset.status = r.status;
      pill.textContent = names[r.status] || r.status;
      const progress = document.createElement("span");
      progress.className = "ag-sub";
      progress.textContent = (r.episodes ? r.episodes + " сер." : "0 сер.") +
        (r.score ? " · " + r.score + "/10" : "");
      status.append(pill,progress);
      const mapping = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("aria-label","Совпадение для " + (r.title || r.russian));
      select.add(new Option(r.candidates.length ? "Не импортировать / выберите тайтл" : "Не найдено / пропустить", ""));
      r.candidates.forEach(c => select.add(new Option(
        (c.title || c.original) +
        (c.original && c.original !== c.title ? " · " + c.original : "") +
        " • " + Math.round(c.confidence*100) + "% · #" + c.id,
        c.id)));
      select.value = r.chosen;
      select.disabled = r.result === "imported" || !eligible(r);
      select.addEventListener("change", () => {
        r.chosen = select.value;
        if (!r.chosen && r.result === "error") r.result = "pending";
        render();
      });
      mapping.append(select);
      const chosen = r.candidates.find(c=>c.id===r.chosen);
      if (chosen && /^\/anime\/[\w-]+-\d+$/.test(chosen.href)) {
        const link = document.createElement("a");
        link.className="ag-link";link.href=chosen.href;link.target="_blank";link.rel="noopener noreferrer";
        link.textContent = "Проверить страницу ↗";
        mapping.append(link);
      }
      const result = document.createElement("td");
      const feedback = document.createElement("span");
      feedback.className = "ag-feedback";
      feedback.dataset.status = r.result === "imported" ? "imported" :
        group === "error" ? "error" : group === "review" || group === "unsupported" ? "needs-review" : "pending";
      const note = r.result === "imported" ? (r.note || "Перенесено") :
        group === "unsupported" ? "Статус пока недоступен" :
        group === "missing" ? "Нет совпадений" :
        group === "review" ? "Нужен ручной выбор" :
        group === "ready" ? (r.note || "Можно импортировать") : (r.note || "Нужна проверка");
      feedback.textContent = note;
      result.append(feedback);
      tr.append(title,status,mapping,result);
      fragment.append(tr);
    });
    if (!list.length) {
      const emptyRow = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan=4;
      td.className="ag-empty";
      td.textContent = !items.length ? "Выбери файл выше, чтобы увидеть список аниме." :
        "По заданным условиям ничего не найдено. Измени фильтр или строку поиска.";
      emptyRow.append(td); fragment.append(emptyRow);
    }
    el("ag-body").replaceChildren(fragment);
    el("ag-table-count").textContent = items.length ?
      "Показано " + list.length + " из " + shown.length +
      " · Не поддерживаются: " + totals.unsupported + " · Ошибки: " + totals.error :
      "Данные ещё не загружены";
    el("ag-preview-count").textContent = items.length ?
      totals.ready + " готовы · " + (totals.review + totals.missing) + " требуют внимания" :
      "Нет загруженных записей";
    el("ag-more").style.display = shown.length > list.length ? "" : "none";
    el("ag-more").disabled = !shown.length;
    el("ag-import").disabled = busy || !searched || !totals.ready;
    el("ag-scan").disabled = busy;
    el("ag-restore").disabled = busy;
    el("ag-report").disabled = !items.length;
    el("ag-stop").disabled = !busy;
    el("ag-dock-stop").disabled = !busy;
    el("ag-dock-report").disabled = !items.length;
  }
  function csrf() {
    return document.querySelector("[data-csrf-token]")?.getAttribute("data-csrf-token") ||
      document.querySelector('meta[name="csrf-token"]')?.content || "";
  }
  async function apiSearch(name) {
    const response = await fetch("/search?q=" + encodeURIComponent(name), {credentials:"same-origin"});
    if (!response.ok) throw new Error("Поиск AnimeGO: HTTP " + response.status);
    const text = await response.text();
    if (text.includes('action="/login"') && response.url.includes("/login"))
      throw new Error("Необходимо войти в AnimeGO");
    if (!text.includes("short__") && !text.includes("search")) throw new Error("Формат страницы поиска изменился");
    return parseCandidates(text);
  }
  async function restoreReport() {
    if (busy) return;
    const file = el("ag-report-file").files[0];
    if (!file) return info("Выберите сохранённый JSON-отчёт.");
    if (file.size > 20 * 1024 * 1024) return info("Отчёт превышает 20 МБ.");
    try {
      const restored = parseReport(await file.text());
      items = restored.items;
      skipped = restored.skipped;
      activeFilter="all"; visibleCount=50; el("ag-find").value="";
      setProgress(items.length,items.length);
      stopped = false;
      searched = true;
      const resumed=restoreCheckpoint();
      render();
      live("Восстановлено записей: " + items.length + " · результатов автосохранения: " + resumed);
      info("Восстановлено: " + items.length + " записей, точно выбрано: " +
        items.filter(x=>x.chosen).length + ". Поиск НЕ запускался.");
    } catch (error) {
      info("Не удалось восстановить отчёт: " + error.message);
    }
  }
  async function scan() {
    if (busy) return;
    const file=el("ag-file").files[0];
    if (!file) return info("Выберите файл JSON.");
    if (file.size>15*1024*1024) return info("Файл больше 15 МБ, проверьте экспорт.");
    busy=true; stopped=false; searched=false;
    try {
      ({items,skipped}=parseList(await file.text()));
      activeFilter="all"; visibleCount=50; el("ag-find").value="";
      setProgress(0,items.length); render();
      if (!items.length) throw new Error("В файле не обнаружено аниме с названиями и статусами");
      for (let i=0;i<items.length && !stopped;i++) {
        const r=items[i], seen=new Map();
        for (const q of [r.title,r.russian].filter(Boolean)) {
          (await apiSearch(q)).forEach(c=>seen.set(c.id,c));
          if ([...seen.values()].some(c=>confidence(r,c)===1)) break;
          if(stopped)break;
          await wait(400);
        }
        const result=choose(r,[...seen.values()]);
        r.candidates=result.ranked;r.chosen=eligible(r) ? result.chosen : "";
        r.note=!eligible(r) ? "Статус пока не поддерживается" : r.chosen?"Найдено точно, проверьте":"Нужна проверка";
        if(i%10===0||i===items.length-1)render();
        setProgress(i+1,items.length);
        info("Поиск "+(i+1)+"/"+items.length+"; выбрано точно "+items.filter(x=>x.chosen).length);
        await wait(450);
      }
      searched=true;
      const resumed=restoreCheckpoint();
      render();
      live("Поиск завершён · результатов автосохранения: " + resumed);
      if (stopped) info("Поиск остановлен. Уже найденные совпадения доступны.");
    } catch(e){info("Ошибка: "+e.message);}
    finally {busy=false;render();}
  }
  async function currentWatchStatus(id) {
    const res = await fetch("/api/watchlist/" + id, {credentials:"same-origin", cache:"no-store"});
    if (!res.ok) throw new Error("Список: HTTP " + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const buttons = [...doc.querySelectorAll("[data-fav-list]")];
    if (!buttons.length) throw new Error("AnimeGO изменил интерфейс списков");
    const active = buttons.filter(btn => btn.classList.contains("active")).map(btn => btn.dataset.favList);
    if (active.length > 1) throw new Error("Неоднозначный текущий статус, пропущено");
    return {available:buttons.map(b => b.dataset.favList), active:active[0] || null};
  }
  async function postStatus(r) {
    const desired = statuses[r.status];
    if (!desired) throw new Error("Этот статус пока нельзя безопасно импортировать");
    const before = await currentWatchStatus(r.chosen);
    if (!before.available.includes(desired)) throw new Error("Статус отсутствует на AnimeGO");
    if (before.active === desired) return "Уже в нужном списке";
    const body = new URLSearchParams({anime_id:r.chosen, list:desired});
    const res = await fetch("/fav/set", {
      method:"POST", credentials:"same-origin",
      headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8",Accept:"application/json"},
      body
    });
    if (!res.ok) throw new Error("Сохранение статуса: HTTP " + res.status);
    if (!(res.headers.get("content-type") || "").includes("json")) throw new Error("AnimeGO вернул не JSON");
    const data = await res.json();
    if (!data.ok) throw new Error("AnimeGO отклонил изменение статуса");
    let after = await currentWatchStatus(r.chosen);
    for (let i = 0; i < 2 && after.active !== desired; i++) {
      await wait(350);
      after = await currentWatchStatus(r.chosen);
    }
    if (after.active !== desired) throw new Error("Статус не подтвердился при проверке");
    return "Статус перенесён";
  }
  async function postVote(r) {
    if (!r.score) return "Оценка отсутствует";
    const card = r.candidates.find(c => c.id === r.chosen);
    if (!card) throw new Error("Страница аниме не найдена");
    const page = await fetch(card.href, {credentials:"same-origin"});
    if (!page.ok) throw new Error("Страница оценки: HTTP " + page.status);
    const doc = new DOMParser().parseFromString(await page.text(), "text/html");
    const rating = doc.querySelector('[data-rate][data-anime-id]');
    if (!rating || rating.dataset.animeId !== String(r.chosen)) throw new Error("Неверная страница оценки");
    if (Number(rating.dataset.myScore) === r.score) return "Оценка уже установлена";
    const body = new URLSearchParams({anime_id:r.chosen, score:String(r.score)});
    const res = await fetch("/rate", {
      method:"POST", credentials:"same-origin",
      headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8",Accept:"application/json"},
      body
    });
    if (!res.ok) throw new Error("Оценка: HTTP " + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error("Сервер отклонил оценку");
    return "Оценка перенесена";
  }
  function animePathMatches(path, animeId) {
    const matched = String(path || "").match(/^\/anime\/[^/?#]*-(\d+)(?:[?#]|$)/);
    return Boolean(matched) && matched[1] === String(animeId);
  }
  async function completedState(animeId) {
    const id = el("ag-profile-id").value.trim();
    if (!/^\d{1,12}$/.test(id))
      throw new Error("Для переноса просмотренных укажите свой ID профиля AnimeGO");
    const res = await fetch("/user/" + id, {credentials:"same-origin",cache:"no-store"});
    if (!res.ok) throw new Error("Страница профиля: HTTP " + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const section = doc.querySelector('[data-tabs-content="completed"]');
    if (!section) throw new Error("Не найден раздел «Просмотрено» на странице профиля");
    const row = [...section.querySelectorAll(".fav-row")].find(row =>
      [...row.querySelectorAll('a[href^="/anime/"]')]
        .some(a => animePathMatches(a.getAttribute("href"), animeId)));
    if (!row) return {present:false, score:null};
    const scoreRaw = row.querySelector(".fav-row__score")?.textContent || "";
    const match = scoreRaw.match(/\d+/);
    return {present:true, score:match ? Number(match[0]) : null};
  }
  async function apply() {
    if(busy)return;
    if(!searched)return info("Сначала сделайте поиск и проверьте совпадения.");
    const batchSize=Math.max(1,Math.min(10000,Number(el("ag-limit").value)||2));
    const selected = items.filter(x=>x.chosen && eligible(x) && x.result!=="imported" && x.result!=="verify_failed").slice(0,batchSize);
    if (selected.some(x => x.status === "completed") &&
        !/^\d{1,12}$/.test(el("ag-profile-id").value.trim()))
      return info("Для проверки «Просмотрено» укажите ID своего профиля AnimeGO");
    const allSelected = items.filter(x=>x.chosen && eligible(x));
    const seenIds = new Set();
    for (const row of allSelected) {
      if (seenIds.has(row.chosen)) return info("Несколько записей Shikimori соответствуют одному ID AnimeGO. Исправьте совпадения.");
      seenIds.add(row.chosen);
    }
    if(!selected.length)return info("Нет выбранных аниме для переноса.");
    try { ensureCheckpoint(); } catch(e) { return info("Ошибка: " + e.message,"error"); }
    // RU: Фильтры только для просмотра. Показываем реальные цели перед записью.
    // EN: Filters affect display only; explicitly confirm actual write targets.
    const preview = selected.slice(0,5).map(x => " - " + (x.title || x.russian)).join("\n");
    if (!confirm("Импортировать " + selected.length + " аниме в AnimeGO?\n" +
      preview + (selected.length > 5 ? "\n - ..." : "") +
      "\n\nФильтры и поиск не меняют очередь. Проверьте сезоны и выбранные названия."))
      return;
    busy=true;stopped=false;let success=0,failed=0;
    clearError();
    setProgress(0,selected.length);
    info("Запущен импорт " + selected.length + " аниме · 0 успешно · 0 ошибок");
    live("Подготовка... · сохранение после каждого тайтла");
    render();
    for(const [index,r] of selected.entries()) {
      if(stopped)break;
      const title=r.title || r.russian;
      live("Обработка " + (index+1) + "/" + selected.length + " · " + title +
        " · успешно " + success + " · ошибок " + failed);
      try {
        if (r.status === "completed") {
          // RU: Переносим сам статус отдельно от оценки, потом сверяем раздел профиля.
          // EN: Set Completed independently of rating, then verify the profile section.
          r.note = await postStatus(r);
          const profile = await completedState(r.chosen);
          if (!profile.present) {
            const failure = new Error("Аниме не появилось в разделе «Просмотрено». Проверьте профиль");
            failure.needsVerification = true;
            throw failure;
          }
          if (el("ag-vote").checked && r.score) {
            r.note += "; " + await postVote(r);
            const rechecked = await completedState(r.chosen);
            if (!rechecked.present || rechecked.score !== r.score) {
              const failure = new Error("Не удалось подтвердить оценку/статус в профиле");
              failure.needsVerification = true;
              throw failure;
            }
          }
          r.note += "; статус подтверждён в профиле";
        } else {
          // RU: Оценки могут влиять на «Любимые», поэтому статус ставится последним.
          // EN: Ratings may affect Favorites, so apply the requested status last.
          if (el("ag-vote").checked && r.score) {
            const result = await postVote(r);
            r.note = result + "; ";
          } else r.note = "";
          r.note += await postStatus(r);
        }
        r.result="imported"; success++;
      }catch(e){
        r.result=e.needsVerification ? "verify_failed" : "error";
        r.note=e.message;failed++;
        if (e.needsVerification || /HTTP 401|HTTP 403|HTTP 429|Не JSON/.test(e.message))
          stopped=true;
      }
      if (r.result === "error" || r.result === "verify_failed")
        live("Остановлено на «" + title + "» · успешно " + success + " · ошибок " + failed,
          title + ": " + r.note);
      try {saveCheckpoint(r);}
      catch(e) {stopped=true;live("Автосохранение не удалось",e.message);}
      render();setProgress(success+failed,selected.length);
      info("Импорт " + (success+failed) + "/" + selected.length +
        " · успешно " + success + " · ошибок " + failed,
        failed ? "error" : "info");
      await wait(900);
    }
    busy=false;render();
    const remaining=selected.length-success-failed;
    const message=(stopped ? "Остановлено" : "Готово") + ": " + success +
      " успешно, " + failed + " ошибок" + (remaining ? ", не обработано " + remaining : "") +
      ". Прогресс сохранён в браузере.";
    info(message,stopped || failed ? "error" : "success");
    if (!failed) live(message);
  }
  function report() {
    const contents=JSON.stringify({version:1,createdAt:new Date().toISOString(),items,skipped},null,2);
    const url=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="shiki-to-animego-report.json";
    link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  el("ag-close").onclick=closeModal;
  const requestStop=()=>{stopped=true;info("Остановка после текущего запроса...");};
  el("ag-stop").onclick=requestStop;
  el("ag-dock-stop").onclick=requestStop;
  el("ag-scan").onclick=scan;el("ag-restore").onclick=restoreReport;
  el("ag-import").onclick=apply;el("ag-report").onclick=report;
  el("ag-dock-report").onclick=report;
  el("ag-clear-progress").onclick=()=>{
    if (busy) return info("Нельзя очищать автосохранение во время импорта.");
    if (!/^\d{1,12}$/.test(profileId())) return info("Сначала укажи ID своего профиля.");
    if (!confirm("Удалить локальный прогресс для этого профиля?\nИсходный JSON-отчёт не изменится.")) return;
    try {
      window.localStorage.removeItem(checkpointKey());
      info("Локальный прогресс очищен. Для обновления таблицы снова открой JSON-отчёт.");
      live("Автосохранение очищено");
    } catch(e) {info("Ошибка очистки: "+e.message,"error");}
  };
  el("ag-find").addEventListener("input",()=>{visibleCount=50;render();});
  el("ag-more").addEventListener("click",()=>{visibleCount+=50;render();});
  modal.addEventListener("keydown",(event)=>{
    if (event.key==="Escape" && !busy) {event.preventDefault();closeModal();}
    if (event.key!=="Tab") return;
    const focusable = [...modal.querySelectorAll("button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]")].filter(x => x.getClientRects().length);
    if (!focusable.length) return;
    const first=focusable[0], last=focusable[focusable.length-1];
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  });
  render();
})();