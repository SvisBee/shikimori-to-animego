// ==UserScript==
// @name         Shikimori to AnimeGO Importer
// @name:ru      Перенос Shikimori в AnimeGO
// @namespace    shiki-to-animego
// @version      0.3.0
// @updateURL    https://raw.githubusercontent.com/SvisBee/shikimori-to-animego/main/shikimori-to-animego.user.js
// @downloadURL  https://raw.githubusercontent.com/SvisBee/shikimori-to-animego/main/shikimori-to-animego.user.js
// @description  One-time anime-list migration with manual review and dry-run
// @match        https://anime-go.org/*
// @match        https://www.anime-go.org/*
// @grant        none
// ==/UserScript==
(function () {
  "use strict";
  const statuses = { watching: "watching", completed: null, on_hold: "onhold", dropped: "dropped", planned: "planned", rewatching: null };
  const names = { watching: "Смотрю", completed: "Просмотрено", on_hold: "Отложено",
    dropped: "Брошено", planned: "Запланировано", rewatching: "Пересматриваю" };
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
  // Season-defining punctuation matters: ! vs !!, ? vs :, ××, ∬, √A, etc.
  function exactName(value) {
    return String(value || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  }
  function confidence(item, candidate) {
    const a = [clean(item.title),clean(item.russian)].filter(Boolean);
    const b = [clean(candidate.title),clean(candidate.original)].filter(Boolean);
    const originals = [item.title, item.russian].filter(Boolean).map(exactName);
    const destinations = [candidate.original, candidate.title].filter(Boolean).map(exactName);
    if (originals.some(x => destinations.includes(x))) return 1;
    // Different punctuation may distinguish seasons and specials: never auto-select it.
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
    // Exact title must be unique; sequels with same title are never auto-selected.
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
      item.chosen = statuses[item.status] ?
        (explicit && item.candidates.some(c=>c.id===explicit) ? explicit : evaluated.chosen) : "";
      item.result = entry.result === "imported" ? "imported" : "pending";
      item.note = item.result === "imported" ? String(entry.note || "Перенесено ранее")
        : !statuses[item.status] ? "Статус пока не поддерживается"
        : item.chosen ? "Точное совпадение, проверьте" : "Требует проверки";
      return item;
    });
    return {items, skipped:Array.isArray(obj.skipped) ? obj.skipped : []};
  }
  const exported = { clean, exactName, statusOf, parseList, parseCandidates, confidence, choose, parseReport, statuses };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (typeof document === "undefined") return;
  if (!["anime-go.org", "www.anime-go.org"].includes(location.hostname)) return;
  if (window.top !== window.self || document.getElementById("shiki-ag-open")) return;
  const style = document.createElement("style");
  style.textContent = "#shiki-ag-open{position:fixed;bottom:18px;right:18px;z-index:9999999;background:#4143b8;color:#fff;border:0;padding:12px;border-radius:9px;cursor:pointer}"+
    "#shiki-ag-modal{display:none;position:fixed;inset:0;z-index:99999999;background:#000a;align-items:center;justify-content:center;font:14px/1.5 sans-serif;color:#1d2230}"+
    "#shiki-ag-modal *{box-sizing:border-box}#shiki-ag-modal .panel{background:white;border-radius:12px;padding:22px;width:95vw;max-width:1100px;max-height:90vh;overflow:auto}"+
    "#shiki-ag-modal h2{margin:0 0 12px}#shiki-ag-modal button{padding:7px;border:1px solid #bbc1db;cursor:pointer;border-radius:6px}"+
    "#shiki-ag-modal .controls{margin:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}"+
    "#shiki-ag-modal .scroll{max-height:49vh;overflow:auto}#shiki-ag-modal table{width:100%;border-collapse:collapse;font-size:12px}"+
    "#shiki-ag-modal td,#shiki-ag-modal th{padding:8px;border-bottom:1px solid #ddd;text-align:left}"+
    "#shiki-ag-modal select{width:100%;max-width:480px}#shiki-ag-modal .help{color:#566078;font-size:12px}";
  document.head.append(style);
  const btn = document.createElement("button"); btn.id="shiki-ag-open"; btn.textContent="Импорт Shikimori";
  document.body.append(btn);
  const modal = document.createElement("div"); modal.id = "shiki-ag-modal";
  modal.innerHTML = '<section class="panel"><button id="ag-close" style="float:right">Закрыть</button>'+
    '<h2>Shikimori → AnimeGO</h2><p class="help">Загрузите JSON-экспорт Shikimori. Поиск ничего не изменяет. Перед записью проверьте выбранные сезоны.</p>'+
    '<div class="controls"><input type="file" id="ag-file" accept=".json,application/json">'+
    '<button id="ag-scan">1. Поиск и предпросмотр</button><button id="ag-stop">Остановить</button></div>'+
    '<div class="controls"><label>Или загрузите ранее сохранённый отчёт: <input type="file" id="ag-report-file" accept=".json,application/json"></label>'+
    '<button id="ag-restore">Восстановить результаты без поиска</button></div>'+
    '<p id="ag-status">Файл пока не выбран.</p>'+
    '<div class="controls"><label><input type="checkbox" id="ag-vote"> Переносить оценки (экспериментально)</label>'+
    '<label>Максимум за запуск: <input type="number" id="ag-limit" min="1" max="10000" value="2" style="width:75px"></label>'+
    '<button id="ag-import">2. Импортировать выбранные</button><button id="ag-report">Скачать отчёт JSON</button></div>'+
    '<p class="help">Только уникальные точные совпадения выбираются автоматически. Просмотрено и Пересматриваю временно пропускаются: API пока не подтверждён. Прогресс по сериям не переносится.'+
    ' При ошибках 401/403/429 импорт прекращается. Не закрывайте вкладку во время записи.</p>'+
    '<div class="scroll"><table><thead><tr><th>Shikimori</th><th>Статус</th><th>Выберите AnimeGO</th><th>Результат</th></tr></thead>'+
    '<tbody id="ag-body"></tbody></table></div></section>';
  document.body.append(modal); btn.onclick=()=>modal.style.display="flex";
  const el = id => modal.querySelector("#"+id);
  let items = [], skipped = [], busy = false, stopped = false, searched = false;
  const info = s => el("ag-status").textContent=s;
  function render() {
    const fragment = document.createDocumentFragment();
    items.forEach((r,i)=>{
      const tr=document.createElement("tr");
      const t=document.createElement("td"); t.textContent=r.title || r.russian;
      const s=document.createElement("td"); s.textContent=names[r.status]+"; "+r.episodes+" сер.; "+r.score+"/10";
      const c=document.createElement("td");
      const select=document.createElement("select");
      select.add(new Option("Пропустить / не найдено", ""));
      r.candidates.forEach(x=>select.add(new Option(x.title+" / "+x.original+" (ID "+x.id+", "+Math.round(x.confidence*100)+"%)",x.id)));
      select.value=r.chosen; select.disabled=r.result==="imported" || !statuses[r.status];
      select.onchange=()=>r.chosen=select.value;
      c.append(select);
      const state=document.createElement("td"); state.textContent=r.note || "Ожидает";
      tr.append(t,s,c,state); fragment.append(tr);
    });
    el("ag-body").replaceChildren(fragment);
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
      stopped = false;
      searched = true;
      render();
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
      ({items,skipped}=parseList(await file.text())); render();
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
        r.candidates=result.ranked;r.chosen=statuses[r.status] ? result.chosen : "";
        r.note=!statuses[r.status] ? "Статус пока не поддерживается" : r.chosen?"Найдено точно, проверьте":"Нужна проверка";
        if(i%10===0||i===items.length-1)render();
        info("Поиск "+(i+1)+"/"+items.length+"; выбрано точно "+items.filter(x=>x.chosen).length);
        await wait(450);
      }
      searched=true;render();
      if (stopped) info("Поиск остановлен. Уже найденные совпадения доступны.");
    } catch(e){info("Ошибка: "+e.message);}
    finally {busy=false;}
  }
  async function currentWatchStatus(id) {
    const res = await fetch("/api/watchlist/" + id, {credentials:"same-origin"});
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
    const after = await currentWatchStatus(r.chosen);
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
  async function apply() {
    if(busy)return;
    if(!searched)return info("Сначала сделайте поиск и проверьте совпадения.");
    const batchSize=Math.max(1,Math.min(10000,Number(el("ag-limit").value)||2));
    const selected = items.filter(x=>x.chosen && statuses[x.status] && x.result!=="imported").slice(0,batchSize);
    const allSelected = items.filter(x=>x.chosen && statuses[x.status]);
    const seenIds = new Set();
    for (const row of allSelected) {
      if (seenIds.has(row.chosen)) return info("Несколько записей Shikimori соответствуют одному ID AnimeGO. Исправьте совпадения.");
      seenIds.add(row.chosen);
    }
    if(!selected.length)return info("Нет выбранных аниме для переноса.");
    if(!confirm("Изменить список AnimeGO для "+selected.length+" аниме? Вы проверили правильность сезонов?"))return;
    busy=true;stopped=false;let success=0,failed=0;
    for(const r of selected) {
      if(stopped)break;
      try {
        r.note=await postStatus(r);r.result="imported";success++;
        if(el("ag-vote").checked&&r.score) {
          try{r.note+="; "+(await postVote(r));}
          catch(e){r.note+="; ОЦЕНКА НЕ ПЕРЕНЕСЕНА: "+e.message;}
        }
      }catch(e){
        r.result="error";r.note=e.message;failed++;
        if(/HTTP 401|HTTP 403|HTTP 429|Не JSON/.test(e.message))stopped=true;
      }
      render();info("Перенесено "+success+"; ошибок "+failed);
      await wait(900);
    }
    busy=false;info("Готово/остановлено: "+success+" успешно, "+failed+" ошибок. Сохраните отчёт.");
  }
  function report() {
    const contents=JSON.stringify({version:1,createdAt:new Date().toISOString(),items,skipped},null,2);
    const url=URL.createObjectURL(new Blob([contents],{type:"application/json"}));
    const link=document.createElement("a");link.href=url;link.download="shiki-to-animego-report.json";
    link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  el("ag-close").onclick=()=>{if(!busy)modal.style.display="none";};
  el("ag-stop").onclick=()=>{stopped=true;info("Остановка после текущего запроса...");};
  el("ag-scan").onclick=scan;el("ag-restore").onclick=restoreReport;
  el("ag-import").onclick=apply;el("ag-report").onclick=report;
})();