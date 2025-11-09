// app.js
// Vollständige Datei. Ersetzt die bestehende app.js 1:1.
// Diese Version enthält UI- und Layout-Fixes: linksausrichtete Season- & GoalValue-Tabellen,
// horizontale Scroll-Wrapper, Shots%-Spalte, Mapping der Bild-Rendering-Eigenschaften zwischen Goal Map und Season Map,
// defensive Fallbacks sowie aktualisierte exportSeasonMapPagePDF, die html2canvas nutzt (falls vorhanden)
// um die Momentum-Grafik als Bild in den Export einzubetten.

document.addEventListener("DOMContentLoaded", () => {
  // force stronger left-align styles for season & goalvalue tables (injected CSS)
  (function forceStrongerLeftAlign(){
    const existing = document.getElementById('season-goalvalue-left-align');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'season-goalvalue-left-align';
    style.textContent = `
      /* Container: am linken Rand ausrichten, kein innerer Abstand */
      #seasonContainer, #goalValueContainer {
        display: flex !important;
        justify-content: flex-start !important;
        align-items: flex-start !important;
        padding-left: 0 !important;
        margin-left: 0 !important;
        box-sizing: border-box !important;
        width: 100% !important;
      }

      /* Scroll wrapper für Tabellen: horizontales Scrollen ermöglichen */
      #seasonContainer .table-scroll, #goalValueContainer .table-scroll {
        overflow-x: auto !important;
        overflow-y: hidden !important;
        -webkit-overflow-scrolling: touch !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      /* Tabellen: nicht umbrechen, so entstehen horizontale Scrollbars statt abgeschnittene Spalten */
      #seasonContainer table, #goalValueContainer table {
        white-space: nowrap !important;
        margin-left: 0 !important;
        margin-right: auto !important;
        width: auto !important;
        max-width: none !important;
        box-sizing: border-box !important;
      }

      /* ggf. vorhandenen Innenabstand des übergeordneten Elements neutralisieren */
      #seasonContainer, #seasonPage, #goalValueContainer, #goalValuePage {
        padding-left: 0 !important;
        margin-left: 0 !important;
      }

      /* Zellen links ausrichten, für bessere Lesbarkeit bei vielen Spalten */
      #seasonContainer table th, #seasonContainer table td,
      #goalValueContainer table th, #goalValueContainer table td {
        text-align: left !important;
        padding-left: 8px !important;
      }

      /* Falls die Seite einen globalen content-wrapper hat, der Zentrierung erzwingt,
         entferne dessen horizontale padding/margin innerhalb der beiden Seiten */
      #seasonPage .content-wrapper, #goalValuePage .content-wrapper {
        padding-left: 0 !important;
        margin-left: 0 !important;
      }

      /* Optional: kleine Pfeile für sichtbarere Scrollbar auf Desktop */
      #seasonContainer .table-scroll::-webkit-scrollbar, #goalValueContainer .table-scroll::-webkit-scrollbar {
        height: 12px;
      }
      #seasonContainer .table-scroll::-webkit-scrollbar-thumb, #goalValueContainer .table-scroll::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.2);
        border-radius: 6px;
      }

      /* Desktop: full-width tables without horizontal scroll (truncate with ellipsis) */
      @media (min-width: 1200px) {
        #seasonContainer, #goalValueContainer {
          width: 100vw !important;
          overflow: visible !important;
        }
        #seasonContainer .table-scroll, #goalValueContainer .table-scroll {
          overflow-x: hidden !important;
        }
        #seasonContainer table, #goalValueContainer table {
          width: calc(100vw - 24px) !important;
          table-layout: fixed !important;
          white-space: nowrap !important;
          font-size: 13px !important;
        }
        #seasonContainer table th, #seasonContainer table td,
        #goalValueContainer table th, #goalValueContainer table td {
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
      }
    `;
    document.head.appendChild(style);
  })();

  // --- Elements (buttons remain in DOM per page) ---
  const pages = {
    selection: document.getElementById("playerSelectionPage"),
    stats: document.getElementById("statsPage"),
    torbild: document.getElementById("torbildPage"),
    goalValue: document.getElementById("goalValuePage"),
    season: document.getElementById("seasonPage"),
    seasonMap: document.getElementById("seasonMapPage")
  };

  function showPage(page) {
    try {
      Object.values(pages).forEach(p => { if (p) p.style.display = "none"; });
      if (pages[page]) pages[page].style.display = "block";
      localStorage.setItem("currentPage", page);
      let title = "Spielerstatistik";
      if (page === "selection") title = "Spielerauswahl";
      else if (page === "stats") title = "Statistiken";
      else if (page === "torbild") title = "Goal Map";
      else if (page === "goalValue") title = "Goal Value";
      else if (page === "season") title = "Season";
      else if (page === "seasonMap") title = "Season Map";
      document.title = title;
    } catch (err) { console.warn("showPage failed:", err); }
  }
  window.showPage = showPage;

  // Query elements / buttons / containers
  const playerListContainer = document.getElementById("playerList");
  const confirmSelectionBtn = document.getElementById("confirmSelection");
  const statsContainer = document.getElementById("statsContainer");
  const torbildBtn = document.getElementById("torbildBtn");
  const goalValueBtn = document.getElementById("goalValueBtn");
  const backToStatsBtn = document.getElementById("backToStatsBtn");
  const backFromGoalValueBtn = document.getElementById("backFromGoalValueBtn");
  const timerBtn = document.getElementById("timerBtn");
  const selectPlayersBtn = document.getElementById("selectPlayersBtn");
  const exportBtn = document.getElementById("exportBtn");
  const resetBtn = document.getElementById("resetBtn");
  const seasonBtn = document.getElementById("seasonBtn");
  const seasonMapBtn = document.getElementById("seasonMapBtn");
  const backToStatsFromSeasonBtn = document.getElementById("backToStatsFromSeasonBtn");
  const backToStatsFromSeasonMapBtn = document.getElementById("backToStatsFromSeasonMapBtn");
  const seasonContainer = document.getElementById("seasonContainer");
  const statsScrollContainer = document.getElementById("statsScrollContainer");

  const exportSeasonFromStatsBtn = document.getElementById("exportSeasonFromStatsBtn");
  const exportSeasonMapBtn = document.getElementById("exportSeasonMapBtn");
  const exportSeasonBtn = document.getElementById("exportSeasonBtn");
  const exportSeasonMapPageBtn = document.getElementById("exportSeasonMapPageBtn");

  const torbildBoxesSelector = "#torbildPage .field-box, #torbildPage .goal-img-box";
  const seasonMapBoxesSelector = "#seasonMapPage .field-box, #seasonMapPage .goal-img-box";

  const torbildTimeTrackingBox = document.getElementById("timeTrackingBox");
  const seasonMapTimeTrackingBox = document.getElementById("seasonMapTimeTrackingBox");

  const goalValueContainer = document.getElementById("goalValueContainer");
  const resetGoalValueBtn = document.getElementById("resetGoalValueBtn");

  // Dark/Light Mode
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  // Data
  const players = [
    { num: 4, name: "Ondrej Kastner" }, { num: 5, name: "Raphael Oehninger" },
    { num: 6, name: "Nuno Meier" }, { num: 7, name: "Silas Teuber" },
    { num: 8, name: "Diego Warth" }, { num: 9, name: "Mattia Crameri" },
    { num: 10, name: "Mael Bernath" }, { num: 11, name: "Sean Nef" },
    { num: 12, name: "Rafael Burri" }, { num: 13, name: "Lenny Schwarz" },
    { num: 14, name: "David Lienert" }, { num: 15, name: "Neven Severini" },
    { num: 16, name: "Nils Koubek" }, { num: 17, name: "Lio Kundert" },
    { num: 18, name: "Livio Berner" }, { num: 19, name: "Robin Strasser" },
    { num: 21, name: "Marlon Kreyenbühl" }, { num: 22, name: "Martin Lana" },
    { num: 23, name: "Manuel Isler" }, { num: 24, name: "Moris Hürlimann" },
    { num: "", name: "Levi Baumann" }, { num: "", name: "Corsin Blapp" },
    { num: "", name: "Lenny Zimmermann" }, { num: "", name: "Luke Böhmichen" },
    { num: "", name: "Livio Weissen" }, { num: "", name: "Raul Wütrich" },
    { num: "", name: "Marco Senn" }
  ];

  const categories = ["Shot", "Goals", "Assist", "+/-", "FaceOffs", "FaceOffs Won", "Penaltys"];

  // persistent state
  let selectedPlayers = JSON.parse(localStorage.getItem("selectedPlayers")) || [];
  let statsData = JSON.parse(localStorage.getItem("statsData")) || {};
  let playerTimes = JSON.parse(localStorage.getItem("playerTimes")) || {};
  let activeTimers = {}; // playerName -> intervalId
  let timerSeconds = Number(localStorage.getItem("timerSeconds")) || 0;
  let timerInterval = null;
  let timerRunning = false;

  // season aggregated data (persistent)
  let seasonData = JSON.parse(localStorage.getItem("seasonData")) || {}; // keyed by player name

  // --- Helpers ---
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }

  function formatTimeMMSS(sec) {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // --- Render player selection ---
  function renderPlayerSelection() {
    if (!playerListContainer) {
      console.error("playerList container not found");
      return;
    }
    playerListContainer.innerHTML = "";

    players.slice()
      .sort((a,b) => {
        const na = Number(a.num) || 999;
        const nb = Number(b.num) || 999;
        return na - nb;
      })
      .forEach((p, idx) => {
        const li = document.createElement("li");
        const checkboxId = `player-chk-${idx}`;
        const checkboxName = `player-${idx}`;
        const checked = selectedPlayers.find(sp => sp.name === p.name) ? "checked" : "";

        let numAreaHtml = "";
        if (p.num !== "" && p.num !== null && p.num !== undefined && String(p.num).trim() !== "") {
          numAreaHtml = `<div class="num" style="flex:0 0 48px;text-align:center;"><strong>${escapeHtml(p.num)}</strong></div>`;
        } else {
          numAreaHtml = `<div style="flex:0 0 64px;text-align:center;">
                           <input class="num-input" type="text" inputmode="numeric" maxlength="3" placeholder="Nr." value="" style="width:56px;padding:6px;border-radius:6px;border:1px solid #444;">
                         </div>`;
        }

        li.innerHTML = `
          <label class="player-line" style="display:flex;align-items:center;gap:8px;width:100%;" for="${checkboxId}">
            <input id="${checkboxId}" name="${checkboxName}" type="checkbox" value="${escapeHtml(p.name)}" ${checked} style="flex:0 0 auto">
            ${numAreaHtml}
            <div class="name" style="flex:1;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>${escapeHtml(p.name)}</strong></div>
          </label>`;
        playerListContainer.appendChild(li);
      });

    const customSelected = selectedPlayers.filter(sp => !players.some(bp => bp.name === sp.name));
    for (let i = 0; i < 5; i++) {
      const pre = customSelected[i];
      const li = document.createElement("li");
      const chkId = `custom-chk-${i}`;
      const numId = `custom-num-${i}`;
      const nameId = `custom-name-${i}`;
      li.innerHTML = `
        <label class="custom-line" style="display:flex;align-items:center;gap:8px;width:100%;" for="${chkId}">
          <input id="${chkId}" name="${chkId}" type="checkbox" class="custom-checkbox" ${pre ? "checked" : ""} style="flex:0 0 auto">
          <input id="${numId}" name="${numId}" type="text" class="custom-num" inputmode="numeric" maxlength="3" placeholder="Nr." value="${escapeHtml(pre?.num || "")}" style="width:56px;flex:0 0 auto;padding:6px;border-radius:6px;border:1px solid #444;">
          <input id="${nameId}" name="${nameId}" type="text" class="custom-name" placeholder="Eigener Spielername" value="${escapeHtml(pre?.name || "")}" style="flex:1;min-width:0;border-radius:6px;padding:6px;border:1px solid #444;">
        </label>`;
      playerListContainer.appendChild(li);
    }
  }

  // --- Confirm selection handler ---
  if (confirmSelectionBtn) {
    confirmSelectionBtn.addEventListener("click", () => {
      try {
        const checkedBoxes = Array.from(playerListContainer.querySelectorAll("input[type='checkbox']:not(.custom-checkbox)")).filter(chk => chk.checked);
        selectedPlayers = checkedBoxes.map(chk => {
          const li = chk.closest("li");
          const name = chk.value;
          let num = "";
          if (li) {
            const numInput = li.querySelector(".num-input");
            if (numInput) num = numInput.value.trim();
            else {
              const numDiv = li.querySelector(".num");
              if (numDiv) num = numDiv.textContent.trim();
            }
          }
          return { num: num || "", name };
        });

        const allLis = Array.from(playerListContainer.querySelectorAll("li"));
        const customLis = allLis.slice(players.length);
        customLis.forEach((li) => {
          const chk = li.querySelector(".custom-checkbox");
          const numInput = li.querySelector(".custom-num");
          const nameInput = li.querySelector(".custom-name");
          if (chk && chk.checked && nameInput && nameInput.value.trim() !== "") {
            selectedPlayers.push({ num: numInput ? (numInput.value.trim() || "") : "", name: nameInput.value.trim() });
          }
        });

        localStorage.setItem("selectedPlayers", JSON.stringify(selectedPlayers));

        selectedPlayers.forEach(p => {
          if (!statsData[p.name]) statsData[p.name] = {};
          categories.forEach(c => { if (statsData[p.name][c] === undefined) statsData[p.name][c] = 0; });
        });
        localStorage.setItem("statsData", JSON.stringify(statsData));

        showPage("stats");
        renderStatsTable();
      } catch (err) {
        console.error("Error in confirmSelection handler:", err);
        alert("Fehler beim Bestätigen (siehe Konsole): " + (err && err.message ? err.message : err));
      }
    });
  }

  // --- small helpers for CSV import/export ---
  function splitCsvLines(text) {
    return text.split(/\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
  }
  function parseCsvLine(line) {
    return line.split(";").map(s => s.trim());
  }

  function parseTimeToSeconds(str) {
    if (!str) return 0;
    const m = str.split(":");
    if (m.length >= 2) {
      const mm = Number(m[0]) || 0;
      const ss = Number(m[1]) || 0;
      return mm*60 + ss;
    }
    return Number(str) || 0;
  }

  // --- CSV export/import buttons setup (import input element) ---
  (function setupImportFileInput() {
    const csvFileInput = document.createElement("input");
    csvFileInput.type = "file";
    csvFileInput.accept = ".csv,text/csv";
    csvFileInput.style.display = "none";
    document.body.appendChild(csvFileInput);

    csvFileInput.addEventListener("change", (ev) => {
      const file = csvFileInput.files && csvFileInput.files[0];
      if (!file) return;
      const target = csvFileInput.dataset.target || "";
      const reader = new FileReader();
      reader.onload = (e) => {
        const txt = String(e.target.result || "");
        if (target === "stats") importStatsCSVFromText(txt);
        else if (target === "season") importSeasonCSVFromText(txt);
        csvFileInput.value = "";
        delete csvFileInput.dataset.target;
      };
      reader.readAsText(file, "utf-8");
    });

    // attach import buttons if appropriate anchors exist near export buttons
    if (exportBtn && resetBtn) {
      const importStatsBtn = document.getElementById("importCsvStatsBtn");
      if (!importStatsBtn) {
        const b = document.createElement("button");
        b.id = "importCsvStatsBtn";
        b.type = "button";
        b.textContent = "Import CSV";
        b.className = "top-btn import-csv-btn";
        b.style.margin = "0 6px";
        b.style.backgroundColor = "#010741";
        b.style.color = "#fff";
        resetBtn.parentNode && resetBtn.parentNode.insertBefore(b, resetBtn);
        b.addEventListener("click", () => {
          csvFileInput.dataset.target = "stats";
          csvFileInput.click();
        });
      }
    }
    if (exportSeasonBtn) {
      const importSeasonBtn = document.getElementById("importCsvSeasonBtn");
      if (!importSeasonBtn) {
        const b = document.createElement("button");
        b.id = "importCsvSeasonBtn";
        b.type = "button";
        b.textContent = "Import CSV";
        b.className = "top-btn import-csv-btn";
        b.style.margin = "0 6px";
        b.style.backgroundColor = "#010741";
        b.style.color = "#fff";
        exportSeasonBtn.parentNode && exportSeasonBtn.parentNode.insertBefore(b, exportSeasonBtn);
        b.addEventListener("click", () => {
          csvFileInput.dataset.target = "season";
          csvFileInput.click();
        });
      }
    }
  })();

  // --- Import: Stats CSV ---
  function importStatsCSVFromText(txt) {
    try {
      const lines = splitCsvLines(txt);
      if (lines.length === 0) { alert("Leere CSV"); return; }
      const header = parseCsvLine(lines[0]);
      const nameIdx = header.findIndex(h => /spieler/i.test(h) || h.toLowerCase() === "spieler");
      const timeIdx = header.findIndex(h => /time/i.test(h) || /zeit/i.test(h));
      const categoryIdxMap = {};
      categories.forEach(cat => {
        const idx = header.findIndex(h => h.toLowerCase() === cat.toLowerCase());
        if (idx !== -1) categoryIdxMap[cat] = idx;
      });
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = cols[nameIdx] || "";
        if (!name) continue;
        if (!statsData[name]) statsData[name] = {};
        Object.keys(categoryIdxMap).forEach(cat => {
          const v = Number(cols[categoryIdxMap[cat]] || 0) || 0;
          statsData[name][cat] = v;
        });
        if (timeIdx !== -1) {
          const t = parseTimeToSeconds(cols[timeIdx]);
          playerTimes[name] = t;
        }
      }
      localStorage.setItem("statsData", JSON.stringify(statsData));
      localStorage.setItem("playerTimes", JSON.stringify(playerTimes));
      renderStatsTable();
      alert("Stats-CSV importiert.");
    } catch (e) {
      console.error("Import Stats CSV failed:", e);
      alert("Fehler beim Importieren (siehe Konsole).");
    }
  }

  // --- Import: Season CSV (additive) ---
  function importSeasonCSVFromText(txt) {
    try {
      const lines = splitCsvLines(txt);
      if (lines.length === 0) { alert("Leere CSV"); return; }
      const header = parseCsvLine(lines[0]);

      const idxNr = header.findIndex(h => /^nr$/i.test(h) || /^nr\./i.test(h) || /nr/i.test(h));
      const idxSpieler = header.findIndex(h => /spieler/i.test(h) || /player/i.test(h));
      const idxGames = header.findIndex(h => /^games$/i.test(h) || /games/i.test(h));
      const idxGoals = header.findIndex(h => /^goals$/i.test(h) || /goals/i.test(h));
      const idxAssists = header.findIndex(h => /^assists$/i.test(h) || /assists/i.test(h));
      const idxPlusMinus = header.findIndex(h => /^\+\/-$/i.test(h) || /plus-?minus/i.test(h) || /\+\/-/i.test(h));
      const idxShots = header.findIndex(h => /^shots$/i.test(h) || /shots/i.test(h));
      const idxPenalty = header.findIndex(h => /^penalty$/i.test(h) || /^penaltys$/i.test(h) || /penalty/i.test(h));
      const idxFaceOffs = header.findIndex(h => /^faceoffs$/i.test(h) || /faceoffs/i.test(h));
      const idxFaceOffsWon = header.findIndex(h => /^faceoffs won$/i.test(h) || /^faceoffswon$/i.test(h) || /faceoffs won/i.test(h));
      const idxGoalValue = header.findIndex(h => /goal value/i.test(h) || /gv/i.test(h));
      const idxTime = header.findIndex(h => /time/i.test(h) || /zeit/i.test(h));

      function parseTimeToSecondsLocal(str) {
        if (!str) return 0;
        const s = String(str).trim();
        if (s.match(/^\d+:\d{2}$/)) {
          const [mm, ss] = s.split(":").map(Number);
          return (Number(mm) || 0) * 60 + (Number(ss) || 0);
        }
        const n = Number(s.replace(/[^0-9.-]/g, ""));
        return isNaN(n) ? 0 : n;
      }

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = (idxSpieler !== -1) ? (cols[idxSpieler] || "").trim() : "";
        if (!name) continue;

        const parsed = {
          num: (idxNr !== -1) ? (cols[idxNr] || "") : "",
          goals: (idxGoals !== -1) ? (Number(cols[idxGoals] || 0) || 0) : 0,
          assists: (idxAssists !== -1) ? (Number(cols[idxAssists] || 0) || 0) : 0,
          plusMinus: (idxPlusMinus !== -1) ? (Number(cols[idxPlusMinus] || 0) || 0) : 0,
          shots: (idxShots !== -1) ? (Number(cols[idxShots] || 0) || 0) : 0,
          penaltys: (idxPenalty !== -1) ? (Number(cols[idxPenalty] || 0) || 0) : 0,
          faceOffs: (idxFaceOffs !== -1) ? (Number(cols[idxFaceOffs] || 0) || 0) : 0,
          faceOffsWon: (idxFaceOffsWon !== -1) ? (Number(cols[idxFaceOffsWon] || 0) || 0) : 0,
          timeSeconds: (idxTime !== -1) ? parseTimeToSecondsLocal(cols[idxTime]) : 0,
          goalValue: (idxGoalValue !== -1) ? (Number(cols[idxGoalValue] || 0) || 0) : 0
        };

        if (!seasonData[name]) {
          seasonData[name] = {
            num: parsed.num || "",
            name: name,
            games: 0,
            goals: parsed.goals,
            assists: parsed.assists,
            plusMinus: parsed.plusMinus,
            shots: parsed.shots,
            penaltys: parsed.penaltys,
            faceOffs: parsed.faceOffs,
            faceOffsWon: parsed.faceOffsWon,
            timeSeconds: parsed.timeSeconds,
            goalValue: parsed.goalValue
          };
        } else {
          const existing = seasonData[name];
          existing.num = existing.num || parsed.num || existing.num || "";
          existing.goals = (Number(existing.goals || 0) || 0) + parsed.goals;
          existing.assists = (Number(existing.assists || 0) || 0) + parsed.assists;
          existing.plusMinus = (Number(existing.plusMinus || 0) || 0) + parsed.plusMinus;
          existing.shots = (Number(existing.shots || 0) || 0) + parsed.shots;
          existing.penaltys = (Number(existing.penaltys || 0) || 0) + parsed.penaltys;
          existing.faceOffs = (Number(existing.faceOffs || 0) || 0) + parsed.faceOffs;
          existing.faceOffsWon = (Number(existing.faceOffsWon || 0) || 0) + parsed.faceOffsWon;
          existing.timeSeconds = (Number(existing.timeSeconds || 0) || 0) + parsed.timeSeconds;
          existing.goalValue = (Number(existing.goalValue || 0) || 0) + parsed.goalValue;
        }
      }

      localStorage.setItem("seasonData", JSON.stringify(seasonData));
      renderSeasonTable();
      alert("Season-CSV importiert und Zahlen zu bestehenden Daten addiert. 'games' wurden nicht verändert.");
    } catch (e) {
      console.error("Import Season CSV failed:", e);
      alert("Fehler beim Importieren der Season-CSV (siehe Konsole).");
    }
  }

  // --- Marker & image sampling helpers ---
  const LONG_MARK_MS_INTERNAL = 600;
  const samplerCache = new WeakMap();
  function clampPct(v) { return Math.max(0, Math.min(100, v)); }

  function createImageSampler(imgEl) {
    if (!imgEl) return null;
    if (samplerCache.has(imgEl)) return samplerCache.get(imgEl);
    const sampler = { valid:false, canvas:null, ctx:null };
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      sampler.canvas = canvas;
      sampler.ctx = ctx;
      function draw() {
        try {
          const w = imgEl.naturalWidth || imgEl.width || 1;
          const h = imgEl.naturalHeight || imgEl.height || 1;
          canvas.width = w;
          canvas.height = h;
          ctx.clearRect(0,0,w,h);
          ctx.drawImage(imgEl, 0, 0, w, h);
          sampler.valid = true;
        } catch (e) {
          sampler.valid = false;
        }
      }
      if (imgEl.complete) draw();
      else {
        imgEl.addEventListener("load", draw);
        imgEl.addEventListener("error", () => { sampler.valid = false; });
      }

      function getPixel(xPct, yPct) {
        if (!sampler.valid) return null;
        const px = Math.round((xPct/100) * (canvas.width - 1));
        const py = Math.round((yPct/100) * (canvas.height - 1));
        try {
          const d = ctx.getImageData(px, py, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2], a: d[3] };
        } catch (e) {
          sampler.valid = false;
          return null;
        }
      }

      sampler.isWhiteAt = (xPct, yPct, threshold = 220) => {
        const p = getPixel(xPct, yPct);
        if (!p) return false;
        if (p.a === 0) return false;
        return p.r >= threshold && p.g >= threshold && p.b >= threshold;
      };
      sampler.isNeutralWhiteAt = (xPct, yPct, threshold = 235, maxChannelDiff = 12) => {
        const p = getPixel(xPct, yPct);
        if (!p) return false;
        if (p.a === 0) return false;
        const maxC = Math.max(p.r, p.g, p.b);
        const minC = Math.min(p.r, p.g, p.b);
        const diff = maxC - minC;
        return maxC >= threshold && diff <= maxChannelDiff;
      };
      sampler.isGreenAt = (xPct, yPct, gThreshold = 110, diff = 30) => {
        const p = getPixel(xPct, yPct);
        if (!p) return false;
        if (p.a === 0) return false;
        return (p.g >= gThreshold) && ((p.g - p.r) >= diff) && ((p.g - p.b) >= diff);
      };
      sampler.isRedAt = (xPct, yPct, rThreshold = 95, diff = 22) => {
        const p = getPixel(xPct, yPct);
        if (!p) return false;
        if (p.a === 0) return false;
        return (p.r >= rThreshold) && ((p.r - p.g) >= diff) && ((p.r - p.b) >= diff);
      };

      samplerCache.set(imgEl, sampler);
      return sampler;
    } catch (err) {
      samplerCache.set(imgEl, { valid:false, isWhiteAt: ()=>false, isNeutralWhiteAt: ()=>false, isGreenAt: ()=>false, isRedAt: ()=>false });
      return samplerCache.get(imgEl);
    }
  }

  function createMarkerPercent(xPctContainer, yPctContainer, color, container, interactive = true) {
    xPctContainer = clampPct(xPctContainer);
    yPctContainer = clampPct(yPctContainer);
    const dot = document.createElement("div");
    dot.className = "marker-dot";
    dot.style.backgroundColor = color;
    dot.style.left = `${xPctContainer}%`;
    dot.style.top = `${yPctContainer}%`;
    dot.style.position = "absolute";
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.transform = "translate(-50%,-50%)";
    if (interactive) {
      dot.addEventListener("click", (ev) => { ev.stopPropagation(); dot.remove(); });
    }
    container.style.position = container.style.position || "relative";
    container.appendChild(dot);
  }

  function createMarkerBasedOn(pos, boxEl, longPress, forceGrey=false) {
    if (!boxEl) return;

    // FIELD BOX
    if (boxEl.classList.contains("field-box")) {
      const img = boxEl.querySelector("img");
      if (img) {
        if (!pos.insideImage) {
          return;
        }
        const sampler = createImageSampler(img);
        if (longPress || forceGrey) {
          createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#444", boxEl, true);
          return;
        }
        if (sampler && sampler.valid) {
          const ix = pos.xPctImage;
          const iy = pos.yPctImage;
          const isGreen = sampler.isGreenAt(ix, iy, 110, 30);
          const isRed = sampler.isRedAt(ix, iy, 95, 22);
          if (isGreen) {
            createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#00ff66", boxEl, true);
            return;
          }
          if (isRed) {
            createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#ff0000", boxEl, true);
            return;
          }
          return;
        } else {
          const color = pos.yPctImage > 50 ? "#ff0000" : "#00ff66";
          createMarkerPercent(pos.xPctContainer, pos.yPctContainer, color, boxEl, true);
          return;
        }
      } else {
        return;
      }
    }

    // GOAL BOXES
    if (boxEl.classList.contains("goal-img-box") || boxEl.id === "goalGreenBox" || boxEl.id === "goalRedBox") {
      const img = boxEl.querySelector("img");
      if (!img) return;
      const sampler = createImageSampler(img);
      if (!sampler || !sampler.valid) {
        return;
      }
      if (boxEl.id === "goalGreenBox") {
        const ok = sampler.isWhiteAt(pos.xPctContainer, pos.yPctContainer, 220);
        if (!ok) return;
        createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#444", boxEl, true);
        return;
      }
      if (boxEl.id === "goalRedBox") {
        const ok = sampler.isNeutralWhiteAt(pos.xPctContainer, pos.yPctContainer, 235, 12);
        if (!ok) return;
        createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#444", boxEl, true);
        return;
      }
      const ok = sampler.isWhiteAt(pos.xPctContainer, pos.yPctContainer, 220);
      if (!ok) return;
      createMarkerPercent(pos.xPctContainer, pos.yPctContainer, "#444", boxEl, true);
      return;
    }

    return;
  }

  function clearAllMarkers() {
    document.querySelectorAll(".marker-dot").forEach(d => d.remove());
  }

  // Helper: compute rendered size & offset for an <img> within its container, honoring object-fit
  function computeRenderedImageRect(imgEl) {
    try {
      const boxRect = imgEl.getBoundingClientRect();
      const naturalW = imgEl.naturalWidth || imgEl.width || 1;
      const naturalH = imgEl.naturalHeight || imgEl.height || 1;
      const boxW = boxRect.width || 1;
      const boxH = boxRect.height || 1;
      const cs = getComputedStyle(imgEl);
      const objectFit = (cs && cs.getPropertyValue('object-fit')) ? cs.getPropertyValue('object-fit').trim() : 'contain';

      let scale;
      if (objectFit === 'cover') {
        scale = Math.max(boxW / naturalW, boxH / naturalH);
      } else if (objectFit === 'fill') {
        const scaleX = boxW / naturalW;
        const scaleY = boxH / naturalH;
        return {
          x: boxRect.left,
          y: boxRect.top,
          width: naturalW * scaleX,
          height: naturalH * scaleY
        };
      } else if (objectFit === 'none') {
        scale = 1;
      } else {
        // default to 'contain'
        scale = Math.min(boxW / naturalW, boxH / naturalH);
      }

      const renderedW = naturalW * scale;
      const renderedH = naturalH * scale;
      const offsetX = boxRect.left + (boxW - renderedW) / 2;
      const offsetY = boxRect.top + (boxH - renderedH) / 2;
      return {
        x: offsetX,
        y: offsetY,
        width: renderedW,
        height: renderedH
      };
    } catch (e) {
      return null;
    }
  }

  function attachMarkerHandlersToBoxes(rootSelector) {
    document.querySelectorAll(rootSelector).forEach(box => {
      const img = box.querySelector("img");
      if (!img) return;
      box.style.position = box.style.position || "relative";

      createImageSampler(img);

      let mouseHoldTimer = null;
      let isLong = false;
      let lastMouseUp = 0;
      let lastTouchEnd = 0;

      function getPosFromEvent(e) {
        // Accept either MouseEvent or a Touch-like object with clientX/clientY
        const boxRect = img.getBoundingClientRect();
        const clientX = (e.clientX !== undefined) ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
        const clientY = (e.clientY !== undefined) ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY);

        // percent within container (box)
        const xPctContainer = Math.max(0, Math.min(1, (clientX - boxRect.left) / (boxRect.width || 1))) * 100;
        const yPctContainer = Math.max(0, Math.min(1, (clientY - boxRect.top) / (boxRect.height || 1))) * 100;

        // compute rendered image rect to map into the image coordinates (honoring object-fit)
        const rendered = computeRenderedImageRect(img);
        let insideImage = false;
        let xPctImage = 0;
        let yPctImage = 0;

        if (rendered) {
          insideImage = (clientX >= rendered.x && clientX <= rendered.x + rendered.width && clientY >= rendered.y && clientY <= rendered.y + rendered.height);
          if (insideImage) {
            xPctImage = Math.max(0, Math.min(1, (clientX - rendered.x) / (rendered.width || 1))) * 100;
            yPctImage = Math.max(0, Math.min(1, (clientY - rendered.y) / (rendered.height || 1))) * 100;
          }
        } else {
          // fallback: assume full box is image
          insideImage = true;
          xPctImage = xPctContainer;
          yPctImage = yPctContainer;
        }

        return { xPctContainer, yPctContainer, xPctImage, yPctImage, insideImage };
      }

      img.addEventListener("mousedown", (ev) => {
        isLong = false;
        if (mouseHoldTimer) clearTimeout(mouseHoldTimer);
        mouseHoldTimer = setTimeout(() => {
          isLong = true;
          const pos = getPosFromEvent(ev);
          createMarkerBasedOn(pos, box, true);
        }, LONG_MARK_MS_INTERNAL);
      });

      img.addEventListener("mouseup", (ev) => {
        if (mouseHoldTimer) { clearTimeout(mouseHoldTimer); mouseHoldTimer = null; }
        const now = Date.now();
        const pos = getPosFromEvent(ev);

        if (now - lastMouseUp < 300) {
          createMarkerBasedOn(pos, box, true, true);
          lastMouseUp = 0;
        } else {
          if (!isLong) createMarkerBasedOn(pos, box, false);
          lastMouseUp = now;
        }
        isLong = false;
      });

      img.addEventListener("mouseleave", () => {
        if (mouseHoldTimer) { clearTimeout(mouseHoldTimer); mouseHoldTimer = null; }
        isLong = false;
      });

      img.addEventListener("touchstart", (ev) => {
        isLong = false;
        if (mouseHoldTimer) { clearTimeout(mouseHoldTimer); mouseHoldTimer = null; }
        mouseHoldTimer = setTimeout(() => {
          isLong = true;
          const pos = getPosFromEvent(ev.touches[0]);
          createMarkerBasedOn(pos, box, true);
        }, LONG_MARK_MS_INTERNAL);
      }, { passive: true });

      img.addEventListener("touchend", (ev) => {
        if (mouseHoldTimer) { clearTimeout(mouseHoldTimer); mouseHoldTimer = null; }
        const now = Date.now();
        const pos = getPosFromEvent(ev.changedTouches[0]);

        if (now - lastTouchEnd < 300) {
          createMarkerBasedOn(pos, box, true, true);
          lastTouchEnd = 0;
        } else {
          if (!isLong) createMarkerBasedOn(pos, box, false);
          lastTouchEnd = now;
        }
        isLong = false;
      }, { passive: true });

      img.addEventListener("touchcancel", () => {
        if (mouseHoldTimer) { clearTimeout(mouseHoldTimer); mouseHoldTimer = null; }
        isLong = false;
      }, { passive: true });
    });
  }

  attachMarkerHandlersToBoxes(torbildBoxesSelector);

  // --- Time tracking helpers ---
  function initTimeTrackingBox(box, storageKey = "timeData", readOnly = false) {
    if (!box) return;
    let timeDataAll = JSON.parse(localStorage.getItem(storageKey)) || {};

    box.querySelectorAll(".period").forEach(period => {
      const periodNum = period.dataset.period || Math.random().toString(36).slice(2,6);
      const buttons = period.querySelectorAll(".time-btn");

      buttons.forEach((btn, idx) => {
        const hasStored = (timeDataAll[periodNum] && typeof timeDataAll[periodNum][idx] !== "undefined");
        const stored = hasStored ? Number(timeDataAll[periodNum][idx]) : Number(btn.textContent) || 0;
        btn.textContent = stored;

        if (readOnly) {
          btn.disabled = true;
          btn.classList.add("disabled-readonly");
          return;
        }

        let lastTap = 0;
        let clickTimeout = null;
        let touchStart = 0;

        const updateValue = (delta) => {
          const current = Number(btn.textContent) || 0;
          const newVal = Math.max(0, current + delta);
          btn.textContent = newVal;
          if (!timeDataAll[periodNum]) timeDataAll[periodNum] = {};
          timeDataAll[periodNum][idx] = newVal;
          localStorage.setItem(storageKey, JSON.stringify(timeDataAll));
        };

        btn.addEventListener("click", () => {
          const now = Date.now();
          const diff = now - lastTap;
          if (diff < 300) {
            if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
            updateValue(-1);
            lastTap = 0;
          } else {
            clickTimeout = setTimeout(() => { updateValue(+1); clickTimeout = null; }, 300);
            lastTap = now;
          }
        });

        btn.addEventListener("touchstart", (e) => {
          const now = Date.now();
          const diff = now - touchStart;
          if (diff < 300) {
            e.preventDefault();
            if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
            updateValue(-1);
            touchStart = 0;
          } else {
            touchStart = now;
            setTimeout(() => {
              if (touchStart !== 0) {
                updateValue(+1);
                touchStart = 0;
              }
            }, 300);
          }
        }, { passive: true });
      });
    });
  }

  initTimeTrackingBox(torbildTimeTrackingBox, "timeData", false);
  initTimeTrackingBox(seasonMapTimeTrackingBox, "seasonMapTimeData", true);

  // --- Season map export/import & PDF export (uses DOM info to position markers accurately) ---
  function readTimeTrackingFromBox(box) {
    const result = {};
    if (!box) return result;
    box.querySelectorAll(".period").forEach((period, pIdx) => {
      const key = period.dataset.period || (`p${pIdx}`);
      result[key] = [];
      period.querySelectorAll(".time-btn").forEach(btn => {
        result[key].push(Number(btn.textContent) || 0);
      });
    });
    return result;
  }

  function writeTimeTrackingToBox(box, data) {
    if (!box || !data) return;
    const periods = Array.from(box.querySelectorAll(".period"));
    periods.forEach((period, pIdx) => {
      const key = period.dataset.period || (`p${pIdx}`);
      const arr = data[key] || data[Object.keys(data)[pIdx]] || [];
      period.querySelectorAll(".time-btn").forEach((btn, idx) => {
        btn.textContent = (typeof arr[idx] !== "undefined") ? arr[idx] : btn.textContent;
      });
    });
  }

  function exportSeasonMapFromTorbild() {
    const proceed = confirm("In Season Map exportieren?");
    if (!proceed) return;

    const boxes = Array.from(document.querySelectorAll(torbildBoxesSelector));
    const allMarkers = boxes.map(box => {
      const markers = [];
      box.querySelectorAll(".marker-dot").forEach(dot => {
        const left = dot.style.left || "";
        const top = dot.style.top || "";
        const bg = dot.style.backgroundColor || "";
        const xPct = parseFloat(left.replace("%","")) || 0;
        const yPct = parseFloat(top.replace("%","")) || 0;
        markers.push({ xPct, yPct, color: bg });
      });
      return markers;
    });
    localStorage.setItem("seasonMapMarkers", JSON.stringify(allMarkers));

    const timeData = readTimeTrackingFromBox(torbildTimeTrackingBox);
    localStorage.setItem("seasonMapTimeData", JSON.stringify(timeData));

    const keep = confirm("Spiel wurde in Season Map exportiert, Daten in Goal Map beibehalten? (OK = Ja, Abbrechen = Nein)");
    if (!keep) {
      document.querySelectorAll("#torbildPage .marker-dot").forEach(d => d.remove());
      document.querySelectorAll("#torbildPage .time-btn").forEach(btn => btn.textContent = "0");
      localStorage.removeItem("timeData");
    }

    showPage("seasonMap");
    renderSeasonMapPage();
  }

  if (exportSeasonMapBtn) {
    exportSeasonMapBtn.addEventListener("click", () => {
      exportSeasonMapFromTorbild();
    });
  }

  if (exportSeasonMapPageBtn) {
    exportSeasonMapPageBtn.addEventListener("click", () => {
      const choice = confirm('OK = PNG herunterladen\nAbbrechen = PDF via jsPDF (direkter Download)');
      if (choice) {
        (async () => {
          try {
            await exportSeasonMapPagePDF();
          } catch (e) {
            console.error(e);
            alert('Fehler beim Export. Sieh die Konsole an.');
          }
        })();
      } else {
        exportSeasonMapPagePDF();
      }
    });
  }

  function exportSeasonMapPage() {
    try {
      const markersRaw = localStorage.getItem("seasonMapMarkers") || "[]";
      const timeRaw = localStorage.getItem("seasonMapTimeData") || "{}";
      const payload = {
        exportedAt: new Date().toISOString(),
        markers: JSON.parse(markersRaw),
        timeData: JSON.parse(timeRaw)
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "season_map_export.json";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("Export season map failed:", e);
      alert("Export fehlgeschlagen (siehe Konsole).");
    }
  }

  // --- UPDATED: exportSeasonMapPagePDF with momentum-graphic capture (html2canvas preferred, fallbacks) ---
  async function exportSeasonMapPagePDF() {
    try {
      const CANVAS_W = 2480;
      const CANVAS_H = 3508;
      const MARGIN = Math.round(CANVAS_W * 0.04);

      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      const usableW = CANVAS_W - 2 * MARGIN;
      const usableH = CANVAS_H - 2 * MARGIN;
      const fieldColW = Math.round(usableW * 0.65);
      const goalColW = usableW - fieldColW - Math.round(MARGIN * 0.5);

      const fieldRect = { x: MARGIN, y: MARGIN, w: fieldColW, h: usableH };
      const goalRect = { x: MARGIN + fieldColW + Math.round(MARGIN * 0.5), y: MARGIN, w: goalColW, h: usableH };

      const goalBoxes = [];
      const goalBoxCount = 3;
      const perGoalH = Math.floor(goalRect.h / goalBoxCount);
      for (let i = 0; i < goalBoxCount; i++) {
        goalBoxes.push({ x: goalRect.x, y: goalRect.y + i * perGoalH, w: goalRect.w, h: perGoalH });
      }

      let boxesDom = Array.from(document.querySelectorAll('#seasonMapPage .field-box, #seasonMapPage .goal-img-box'));
      if (!boxesDom.length) {
        boxesDom = Array.from(document.querySelectorAll('#torbildPage .field-box, #torbildPage .goal-img-box'));
      }

      const destRects = [];
      if (boxesDom.length > 0) {
        destRects.push(fieldRect);
        for (let i = 1; i < boxesDom.length && i <= goalBoxCount; i++) destRects.push(goalBoxes[i - 1]);
      }

      function loadImgFromImgEl(imgEl) {
        return new Promise((resolve) => {
          if (!imgEl) return resolve(null);
          if (imgEl.complete && imgEl.naturalWidth) return resolve(imgEl);
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = imgEl.src;
        });
      }

      let markersAll = [];
      try {
        const raw = localStorage.getItem('seasonMapMarkers');
        if (raw) markersAll = JSON.parse(raw);
      } catch (e) { markersAll = []; }

      if ((!markersAll || !markersAll.length) && boxesDom.length) {
        markersAll = boxesDom.map(box => {
          return Array.from(box.querySelectorAll('.marker-dot')).map(dot => {
            const left = dot.style.left || '0%';
            const top = dot.style.top || '0%';
            const color = dot.style.backgroundColor || '#444';
            return { xPct: parseFloat(String(left).replace('%','')) || 0, yPct: parseFloat(String(top).replace('%','')) || 0, color };
          });
        });
      }

      let timeData = {};
      try {
        const rawTime = localStorage.getItem('seasonMapTimeData');
        if (rawTime) timeData = JSON.parse(rawTime);
      } catch (e) { timeData = {}; }

      const drawTasks = (boxesDom.slice(0, destRects.length)).map(async (boxEl, idx) => {
        const imgEl = boxEl.querySelector('img');
        const dest = destRects[idx];
        const img = await loadImgFromImgEl(imgEl);
        if (img) {
          const sw = img.naturalWidth || img.width || dest.w;
          const sh = img.naturalHeight || img.height || dest.h;
          const scale = Math.min(dest.w / sw, dest.h / sh);
          const drawW = Math.round(sw * scale);
          const drawH = Math.round(sh * scale);
          const offX = dest.x + Math.round((dest.w - drawW) / 2);
          const offY = dest.y + Math.round((dest.h - drawH) / 2);
          ctx.drawImage(img, offX, offY, drawW, drawH);

          // compute DOM-rendered rect for this image (honoring object-fit), if possible
          let domBoxRect = null;
          try { domBoxRect = imgEl.getBoundingClientRect(); } catch (e) { domBoxRect = null; }
          let domNaturalW = img.naturalWidth || img.width || drawW;
          let domNaturalH = img.naturalHeight || img.height || drawH;
          let renderedW_dom = drawW;
          let renderedH_dom = drawH;
          let offsetX_dom = 0;
          let offsetY_dom = 0;
          if (domBoxRect && domNaturalW && domNaturalH) {
            const rendered = computeRenderedImageRect(imgEl);
            if (rendered) {
              offsetX_dom = rendered.x - domBoxRect.left;
              offsetY_dom = rendered.y - domBoxRect.top;
              renderedW_dom = rendered.width;
              renderedH_dom = rendered.height;
            } else {
              const boxW = domBoxRect.width || 1;
              const boxH = domBoxRect.height || 1;
              const scaleDom = Math.min(boxW / domNaturalW, boxH / domNaturalH);
              renderedW_dom = domNaturalW * scaleDom;
              renderedH_dom = domNaturalH * scaleDom;
              offsetX_dom = (boxW - renderedW_dom) / 2;
              offsetY_dom = (boxH - renderedH_dom) / 2;
            }
          }

          const markers = markersAll[idx] || [];
          markers.forEach(m => {
            let x = dest.x + (m.xPct / 100) * dest.w;
            let y = dest.y + (m.yPct / 100) * dest.h;

            if (domBoxRect) {
              const px_dom = (m.xPct / 100) * domBoxRect.width;
              const py_dom = (m.yPct / 100) * domBoxRect.height;

              const rx = (px_dom - offsetX_dom) / (renderedW_dom || 1);
              const ry = (py_dom - offsetY_dom) / (renderedH_dom || 1);
              const rxClamped = Math.max(0, Math.min(1, isFinite(rx) ? rx : 0));
              const ryClamped = Math.max(0, Math.min(1, isFinite(ry) ? ry : 0));

              x = offX + rxClamped * drawW;
              y = offY + ryClamped * drawH;
            } else {
              x = dest.x + (m.xPct / 100) * dest.w;
              y = dest.y + (m.yPct / 100) * dest.h;
            }

            const r = Math.max(6, Math.round(Math.min(CANVAS_W, CANVAS_H) * 0.004));
            ctx.beginPath();
            ctx.fillStyle = m.color || '#444';
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = Math.max(1, Math.round(r * 0.28));
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.stroke();
          });

          const markersCount = (markers && markers.length) ? markers.length : 0;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.font = `${Math.max(10, Math.round(dest.h * 0.035))}px Arial`;
          ctx.fillText(`Markers: ${markersCount}`, dest.x + 8, dest.y + 24);
        } else {
          ctx.fillStyle = '#f4f4f4';
          ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
          ctx.strokeStyle = '#ccc';
          ctx.strokeRect(dest.x, dest.y, dest.w, dest.h);
          ctx.fillStyle = '#777';
          ctx.font = '18px Arial';
          ctx.fillText('Bild nicht verfügbar', dest.x + 10, dest.y + 30);
        }
      });

      await Promise.all(drawTasks);

      // ---- NEW: try to render the momentum graphic as image (html2canvas preferred, canvas/img/svg/foreignObject fallback) ----
      const momentumEl = document.querySelector('#momentumTable, .momentum-table, #seasonMapMomentum, .season-map-momentum');
      const labelX = MARGIN;
      let labelY = CANVAS_H - MARGIN - 140;
      ctx.fillStyle = '#000';
      ctx.font = '16px Arial';

      async function captureElementWithHtml2Canvas(el) {
        if (!window.html2canvas) return null;
        try {
          // ensure element visible and has size
          const orig = { display: el.style.display || '', visibility: el.style.visibility || '', position: el.style.position || '' };
          const needsTempUnhide = (getComputedStyle(el).display === 'none');
          if (needsTempUnhide) {
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.position = 'relative';
          }

          const canvasCaptured = await window.html2canvas(el, { backgroundColor: null, useCORS: true, scale: 2 });

          if (needsTempUnhide) {
            el.style.display = orig.display;
            el.style.visibility = orig.visibility;
            el.style.position = orig.position;
          }
          return canvasCaptured;
        } catch (err) {
          console.warn('html2canvas capture failed:', err);
          return null;
        }
      }

      if (momentumEl) {
        try {
          // try html2canvas first (most robust)
          let mCanvas = null;
          try { mCanvas = await captureElementWithHtml2Canvas(momentumEl); } catch (e) { mCanvas = null; }

          if (mCanvas && mCanvas.width > 0 && mCanvas.height > 0) {
            const maxW = usableW;
            const maxH = Math.round(usableH * 0.18);
            const aspect = (mCanvas.width && mCanvas.height) ? (mCanvas.width / mCanvas.height) : (maxW / maxH);
            let drawW = Math.min(maxW, mCanvas.width);
            let drawH = drawW / aspect;
            if (drawH > maxH) { drawH = maxH; drawW = Math.round(drawH * aspect); }
            ctx.drawImage(mCanvas, labelX, labelY, drawW, drawH);
            labelY += drawH + 10;
          } else {
            // fallback to finding inner canvas/img/svg
            let drawn = false;
            try {
              const innerCanvas = momentumEl.querySelector('canvas');
              if (innerCanvas) {
                ctx.drawImage(innerCanvas, labelX, labelY, Math.min(usableW, innerCanvas.width), Math.round(innerCanvas.height * (Math.min(usableW, innerCanvas.width) / innerCanvas.width)));
                drawn = true;
              } else {
                const innerImg = momentumEl.querySelector('img');
                if (innerImg && innerImg.src) {
                  const img = new Image();
                  img.crossOrigin = 'anonymous';
                  await new Promise(r => { img.onload = r; img.onerror = r; img.src = innerImg.src; });
                  const maxW = usableW;
                  const maxH = Math.round(usableH * 0.18);
                  const aspect = (img.width && img.height) ? (img.width / img.height) : (maxW / maxH);
                  let drawW = Math.min(maxW, img.width || maxW);
                  let drawH = drawW / aspect;
                  if (drawH > maxH) { drawH = maxH; drawW = Math.round(drawH * aspect); }
                  ctx.drawImage(img, labelX, labelY, drawW, drawH);
                  labelY += drawH + 10;
                  drawn = true;
                } else {
                  const svgEl = momentumEl.querySelector('svg');
                  if (svgEl) {
                    const xml = new XMLSerializer().serializeToString(svgEl);
                    const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    await new Promise(r => { img.onload = r; img.onerror = r; img.src = svg64; });
                    const maxW = usableW;
                    const maxH = Math.round(usableH * 0.18);
                    const aspect = (img.width && img.height) ? (img.width / img.height) : (maxW / maxH);
                    let drawW = Math.min(maxW, img.width || maxW);
                    let drawH = drawW / aspect;
                    if (drawH > maxH) { drawH = maxH; drawW = Math.round(drawH * aspect); }
                    ctx.drawImage(img, labelX, labelY, drawW, drawH);
                    labelY += drawH + 10;
                    drawn = true;
                  }
                }
              }
            } catch (e) {
              console.warn('fallback momentum draw failed:', e);
              drawn = false;
            }

            if (!drawn) {
              // last fallback: render table/text as before
              const rows = Array.from(momentumEl.querySelectorAll('tr'));
              if (rows.length) {
                ctx.fillText('Momentum:', labelX, labelY);
                labelY += 20;
                ctx.font = '13px Arial';
                rows.slice(0, 12).forEach((tr) => {
                  const texts = Array.from(tr.querySelectorAll('th,td')).map(td => td.textContent.trim());
                  const line = texts.join('  ');
                  ctx.fillText(line, labelX, labelY);
                  labelY += 16;
                });
              } else {
                ctx.fillText('Momentum (keine Grafik gefunden)', labelX, labelY);
                labelY += 18;
                ctx.font = '14px Arial';
                const periods = Object.keys(timeData || {});
                if (!periods.length) {
                  ctx.fillText('(keine Time-Data)', labelX, labelY);
                } else {
                  periods.forEach(k => {
                    ctx.fillText(`${k}: ${JSON.stringify(timeData[k])}`, labelX, labelY);
                    labelY += 14;
                  });
                }
              }
            }
          }
        } catch (e) {
          // best-effort fallback
          ctx.fillText('Momentum (konnte nicht als Bild exportiert werden):', labelX, labelY);
          labelY += 18;
          ctx.font = '14px Arial';
          const periods = Object.keys(timeData || {});
          if (!periods.length) {
            ctx.fillText('(keine Time-Data)', labelX, labelY);
          } else {
            periods.forEach(k => {
              ctx.fillText(`${k}: ${JSON.stringify(timeData[k])}`, labelX, labelY);
              labelY += 14;
            });
          }
        }
      } else {
        // no momentum element present -> fallback: render timeData as before
        ctx.fillText('Time Tracking (Season Map):', labelX, labelY);
        labelY += 22;
        const periods = Object.keys(timeData || {});
        if (!periods.length) {
          ctx.fillText('(keine Time-Data)', labelX, labelY);
        } else {
          ctx.font = '14px Arial';
          periods.forEach(k => {
            ctx.fillText(`${k}: ${JSON.stringify(timeData[k])}`, labelX, labelY);
            labelY += 18;
          });
        }
      }

      const imgData = canvas.toDataURL('image/png');

      let jsPDFCtor = null;
      if (window.jspdf && window.jspdf.jsPDF) jsPDFCtor = window.jspdf.jsPDF;
      else if (window.jspdf && window.jspdf.default) jsPDFCtor = window.jspdf.default;
      else if (window.jsPDF) jsPDFCtor = window.jsPDF;
      else if (window.jspdf) jsPDFCtor = window.jspdf;
      if (!jsPDFCtor) {
        alert('jsPDF wurde nicht gefunden. PDF-Export nicht möglich. Führe stattdessen den PNG-Export aus.');
        const a = document.createElement('a');
        a.href = imgData;
        a.download = 'season_map_a4.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const pdf = new jsPDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const marginMm = 10; // 10 mm margins
      const drawWidthMm = pageWidthMm - 2 * marginMm;
      const canvasAspect = canvas.height / canvas.width;
      let drawHeightMm = drawWidthMm * canvasAspect;
      let finalDrawWidthMm = drawWidthMm;
      let finalDrawHeightMm = drawHeightMm;
      if (finalDrawHeightMm > pageHeightMm - 2 * marginMm) {
        finalDrawHeightMm = pageHeightMm - 2 * marginMm;
        finalDrawWidthMm = finalDrawHeightMm / canvasAspect;
      }
      const xMm = (pageWidthMm - finalDrawWidthMm) / 2;
      const yMm = (pageHeightMm - finalDrawHeightMm) / 2;

      pdf.addImage(imgData, 'PNG', xMm, yMm, finalDrawWidthMm, finalDrawHeightMm);
      pdf.save('season_map_a4.pdf');

    } catch (e) {
      console.error('PDF Export fehlgeschlagen:', e);
      alert('Fehler beim PDF-Export. Sieh die Konsole an.');
    }
  }

  // --- Goal area overlays and season map rendering ---
  function renderGoalAreaStats() {
    const seasonMapRoot = document.getElementById("seasonMapPage");
    if (!seasonMapRoot) return;

    const goalBoxIds = ["goalGreenBox", "goalRedBox"];
    goalBoxIds.forEach(id => {
      const box = seasonMapRoot.querySelector(`#${id}`);
      if (!box) return;
      box.querySelectorAll(".goal-area-label").forEach(el => el.remove());

      const markers = Array.from(box.querySelectorAll(".marker-dot"));
      const total = markers.length;

      const counts = { tl: 0, tr: 0, bl: 0, bm: 0, br: 0 };
      markers.forEach(m => {
        const left = parseFloat(m.style.left) || 0;
        const top = parseFloat(m.style.top) || 0;
        if (top < 50) {
          if (left < 50) counts.tl++;
          else counts.tr++;
        } else {
          if (left < 33.3333) counts.bl++;
          else if (left < 66.6667) counts.bm++;
          else counts.br++;
        }
      });

      const areas = [
        { key: "tl", x: 25, y: 22 },
        { key: "tr", x: 75, y: 22 },
        { key: "bl", x: 16, y: 75 },
        { key: "bm", x: 50, y: 75 },
        { key: "br", x: 84, y: 75 }
      ];

      areas.forEach(a => {
        const cnt = counts[a.key] || 0;
        const pct = total ? Math.round((cnt / total) * 100) : 0;
        const div = document.createElement("div");
        div.className = "goal-area-label";
        div.style.position = "absolute";
        div.style.left = `${a.x}%`;
        div.style.top = `${a.y}%`;
        div.style.transform = "translate(-50%,-50%)";
        div.style.pointerEvents = "none";
        div.style.fontWeight = "800";
        div.style.opacity = "0.45";
        div.style.fontSize = "36px";
        div.style.color = "#000000";
        div.style.textShadow = "0 1px 2px rgba(255,255,255,0.06)";
        div.style.lineHeight = "1";
        div.style.userSelect = "none";
        div.style.whiteSpace = "nowrap";
        div.textContent = `${cnt} (${pct}%)`;
        box.appendChild(div);
      });
    });

    const unnamedGoalBoxes = Array.from(seasonMapRoot.querySelectorAll(".goal-img-box")).filter(b => !["goalGreenBox","goalRedBox"].includes(b.id));
    unnamedGoalBoxes.forEach(box => {
      box.querySelectorAll(".goal-area-label").forEach(el => el.remove());
      const markers = Array.from(box.querySelectorAll(".marker-dot"));
      const total = markers.length;
      const counts = { tl: 0, tr: 0, bl: 0, bm: 0, br: 0 };
      markers.forEach(m => {
        const left = parseFloat(m.style.left) || 0;
        const top = parseFloat(m.style.top) || 0;
        if (top < 50) {
          if (left < 50) counts.tl++;
          else counts.tr++;
        } else {
          if (left < 33.3333) counts.bl++;
          else if (left < 66.6667) counts.bm++;
          else counts.br++;
        }
      });
      const areas = [
        { key: "tl", x: 25, y: 22 },
        { key: "tr", x: 75, y: 22 },
        { key: "bl", x: 16, y: 75 },
        { key: "bm", x: 50, y: 75 },
        { key: "br", x: 84, y: 75 }
      ];
      areas.forEach(a => {
        const cnt = counts[a.key] || 0;
        const pct = total ? Math.round((cnt / total) * 100) : 0;
        const div = document.createElement("div");
        div.className = "goal-area-label";
        div.style.position = "absolute";
        div.style.left = `${a.x}%`;
        div.style.top = `${a.y}%`;
        div.style.transform = "translate(-50%,-50%)";
        div.style.pointerEvents = "none";
        div.style.fontWeight = "800";
        div.style.opacity = "0.45";
        div.style.fontSize = "36px";
        div.style.color = "#000000";
        div.style.textShadow = "0 1px 2px rgba(255,255,255,0.06)";
        div.style.lineHeight = "1";
        div.style.userSelect = "none";
        div.style.whiteSpace = "nowrap";
        div.textContent = `${cnt} (${pct}%)`;
        box.appendChild(div);
      });
    });
  }

  function renderSeasonMapPage() {
    const boxes = Array.from(document.querySelectorAll(seasonMapBoxesSelector));
    boxes.forEach(box => box.querySelectorAll(".marker-dot").forEach(d => d.remove()));

    // Align season-map box images to match exactly the appearance of the Goal Map (torbild)
    try {
      const torBoxes = Array.from(document.querySelectorAll(torbildBoxesSelector));
      boxes.forEach((seasonBox, idx) => {
        const seasonImg = seasonBox.querySelector('img');
        // find corresponding torbild box (by index) and copy relevant render properties
        const torBox = torBoxes[idx];
        if (seasonImg && torBox) {
          const torImg = torBox.querySelector('img');
          if (torImg) {
            try {
              // copy object-fit from torbild image so rendering/covering is identical
              const torCS = getComputedStyle(torImg);
              const torObjectFit = torCS.getPropertyValue('object-fit') || 'contain';
              seasonImg.style.objectFit = torObjectFit;
              // copy width/height as computed sizes to ensure visual parity (use pixel values)
              const torRect = torImg.getBoundingClientRect();
              if (torRect && torRect.width && torRect.height) {
                // Apply same client size to season image and its container so they appear identical
                seasonImg.style.width = `${Math.round(torRect.width)}px`;
                seasonImg.style.height = `${Math.round(torRect.height)}px`;
                seasonBox.style.width = `${Math.round(torRect.width)}px`;
                seasonBox.style.height = `${Math.round(torRect.height)}px`;
                seasonBox.style.overflow = 'hidden';
              } else {
                // fallback to 100% so it still fills the box
                seasonImg.style.width = seasonImg.style.width || '100%';
                seasonImg.style.height = seasonImg.style.height || '100%';
                seasonBox.style.overflow = 'hidden';
              }
            } catch (e) {
              seasonImg.style.objectFit = seasonImg.style.objectFit || 'contain';
              seasonImg.style.width = seasonImg.style.width || '100%';
              seasonImg.style.height = seasonImg.style.height || '100%';
              seasonBox.style.overflow = seasonBox.style.overflow || 'hidden';
            }
          }
        } else {
          // fallback: keep season images contained to their box
          const img = seasonBox.querySelector('img');
          if (img) {
            img.style.objectFit = img.style.objectFit || 'contain';
            img.style.width = img.style.width || '100%';
            img.style.height = img.style.height || '100%';
            seasonBox.style.overflow = seasonBox.style.overflow || 'hidden';
          }
        }
      });
    } catch (e) {
      // ignore layout copy errors
    }

    const raw = localStorage.getItem("seasonMapMarkers");
    if (raw) {
      try {
        const allMarkers = JSON.parse(raw);
        allMarkers.forEach((markersForBox, idx) => {
          const box = boxes[idx];
          if (!box || !Array.isArray(markersForBox)) return;
          markersForBox.forEach(m => {
            createMarkerPercent(m.xPct, m.yPct, m.color || "#444", box, false);
          });
        });
      } catch (e) {
        console.warn("Invalid seasonMapMarkers", e);
      }
    }
    const rawTime = localStorage.getItem("seasonMapTimeData");
    if (rawTime) {
      try {
        const tdata = JSON.parse(rawTime);
        writeTimeTrackingToBox(seasonMapTimeTrackingBox, tdata);
        seasonMapTimeTrackingBox.querySelectorAll(".time-btn").forEach(btn => {
          btn.disabled = true;
          btn.classList.add("disabled-readonly");
        });
      } catch (e) {
        console.warn("Invalid seasonMapTimeData", e);
      }
    }

    renderGoalAreaStats();
  }

  function resetSeasonMap() {
    if (!confirm("⚠️ Season Map zurücksetzen (Marker + Timeboxen)?")) return;
    document.querySelectorAll("#seasonMapPage .marker-dot").forEach(d => d.remove());
    document.querySelectorAll("#seasonMapPage .time-btn").forEach(btn => btn.textContent = "0");
    localStorage.removeItem("seasonMapMarkers");
    localStorage.removeItem("seasonMapTimeData");
    alert("Season Map zurückgesetzt.");
  }

  document.getElementById("resetSeasonMapBtn")?.addEventListener("click", resetSeasonMap);

  // --- Season export (Stats -> Season) ---
  const exportSeasonHandler = () => {
    const proceed = confirm("Spiel zu Season exportieren?");
    if (!proceed) return;

    if (!selectedPlayers || selectedPlayers.length === 0) {
      alert("Keine Spieler ausgewählt, nichts zu exportieren.");
      return;
    }

    selectedPlayers.forEach(p => {
      const name = p.name;
      const stats = statsData[name] || {};
      const timeSeconds = Number(playerTimes[name] || 0);

      if (!seasonData[name]) {
        seasonData[name] = {
          num: p.num || "",
          name: name,
          games: 0,
          goals: 0,
          assists: 0,
          plusMinus: 0,
          shots: 0,
          penaltys: 0,
          faceOffs: 0,
          faceOffsWon: 0,
          timeSeconds: 0,
          goalValue: 0
        };
      }

      seasonData[name].games = Number(seasonData[name].games || 0) + 1;
      seasonData[name].goals = Number(seasonData[name].goals || 0) + Number(stats.Goals || 0);
      seasonData[name].assists = Number(seasonData[name].assists || 0) + Number(stats.Assist || 0);
      seasonData[name].plusMinus = Number(seasonData[name].plusMinus || 0) + Number(stats["+/-"] || 0);
      seasonData[name].shots = Number(seasonData[name].shots || 0) + Number(stats.Shot || 0);
      seasonData[name].penaltys = Number(seasonData[name].penaltys || 0) + Number(stats.Penaltys || 0);
      seasonData[name].faceOffs = Number(seasonData[name].faceOffs || 0) + Number(stats.FaceOffs || 0);
      seasonData[name].faceOffsWon = Number(seasonData[name].faceOffsWon || 0) + Number(stats["FaceOffs Won"] || 0);
      seasonData[name].timeSeconds = Number(seasonData[name].timeSeconds || 0) + Number(timeSeconds || 0);
      seasonData[name].num = p.num || seasonData[name].num || "";
      seasonData[name].name = name;

      try {
        if (typeof computeValueForPlayer === "function") {
          seasonData[name].goalValue = computeValueForPlayer(name);
        } else {
          seasonData[name].goalValue = seasonData[name].goalValue || 0;
        }
      } catch (e) {
        seasonData[name].goalValue = seasonData[name].goalValue || 0;
      }
    });

    localStorage.setItem("seasonData", JSON.stringify(seasonData));

    const keep = confirm("Spiel wurde in Season exportiert, Daten in Game Data beibehalten? (OK = Ja, Abbrechen = Nein)");
    if (!keep) {
      selectedPlayers.forEach(p => {
        const name = p.name;
        if (!statsData[name]) statsData[name] = {};
        categories.forEach(c => { statsData[name][c] = 0; });
        playerTimes[name] = 0;
      });
      localStorage.setItem("statsData", JSON.stringify(statsData));
      localStorage.setItem("playerTimes", JSON.stringify(playerTimes));
      renderStatsTable();
    }

    showPage("season");
    renderSeasonTable();
  };

  if (exportSeasonFromStatsBtn) {
    exportSeasonFromStatsBtn.addEventListener("click", exportSeasonHandler);
  }

  // --- Export current game data (stats) to CSV ---
  function exportStatsCSV() {
    try {
      if (!selectedPlayers || selectedPlayers.length === 0) {
        alert("Keine Spieler ausgewählt, nichts zu exportieren.");
        return;
      }
      const header = ["Nr", "Spieler", ...categories, "Time"];
      const rows = [header];

      selectedPlayers.forEach(p => {
        const name = p.name;
        const row = [];
        row.push(p.num || "");
        row.push(name);
        categories.forEach(cat => {
          row.push(String(Number(statsData[name]?.[cat] || 0)));
        });
        row.push(formatTimeMMSS(Number(playerTimes[name] || 0)));
        rows.push(row);
      });

      const totals = {};
      categories.forEach(c => totals[c] = 0);
      let totalSeconds = 0;
      selectedPlayers.forEach(p => {
        categories.forEach(c => { totals[c] += (Number(statsData[p.name]?.[c]) || 0); });
        totalSeconds += (playerTimes[p.name] || 0);
      });

      const totalRow = new Array(header.length).fill("");
      totalRow[1] = `Total (${selectedPlayers.length})`;
      categories.forEach((c, idx) => {
        const colIndex = 2 + idx;
        if (c === "+/-") {
          const vals = selectedPlayers.map(p => Number(statsData[p.name]?.[c] || 0));
          const avg = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
          totalRow[colIndex] = `Ø ${avg}`;
        } else if (c === "FaceOffs Won") {
          const totalFace = totals["FaceOffs"] || 0;
          const percent = totalFace ? Math.round((totals["FaceOffs Won"]/totalFace)*100) : 0;
          totalRow[colIndex] = `${totals["FaceOffs Won"]} (${percent}%)`;
        } else {
          totalRow[colIndex] = String(totals[c] || 0);
        }
      });
      totalRow[header.length - 1] = formatTimeMMSS(totalSeconds);
      rows.push(totalRow);

      const timerRow = new Array(header.length).fill("");
      timerRow[1] = "TIMER";
      timerRow[header.length - 1] = formatTimeMMSS(timerSeconds || 0);
      rows.push(timerRow);

      const csv = rows.map(r => r.join(";")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stats.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("Export Stats CSV failed:", e);
      alert("Fehler beim Exportieren (siehe Konsole).");
    }
  }

  document.getElementById("exportBtn")?.addEventListener("click", exportStatsCSV);

  // --- Season table rendering ---
  function parseForSort(val) {
    if (val === null || val === undefined) return "";
    const v = String(val).trim();
    if (v === "") return "";
    if (/^\d{1,2}:\d{2}$/.test(v)) {
      const [mm, ss] = v.split(":").map(Number);
      return mm*60 + ss;
    }
    if (/%$/.test(v)) {
      return Number(v.replace("%","")) || 0;
    }
    const n = Number(v.toString().replace(/[^0-9.-]/g,""));
    if (!isNaN(n) && v.match(/[0-9]/)) return n;
    return v.toLowerCase();
  }

  let seasonSort = { index: null, asc: true };

  function ensureGoalValueDataForSeason() {
    // minimal stub: ensure structures exist
    const opponents = getGoalValueOpponents();
    const all = getGoalValueData();
    Object.keys(seasonData).forEach(name => {
      if (!all[name] || !Array.isArray(all[name])) {
        all[name] = opponents.map(()=>0);
      } else {
        while (all[name].length < opponents.length) all[name].push(0);
        if (all[name].length > opponents.length) all[name] = all[name].slice(0, opponents.length);
      }
    });
    setGoalValueData(all);
  }

  function renderSeasonTable() {
    const container = document.getElementById("seasonContainer");
    if (!container) return;
    container.innerHTML = "";

    // Stronger left alignment: use flex container and left justify
    container.style.display = 'flex';
    container.style.justifyContent = 'flex-start';
    container.style.alignItems = 'flex-start';
    container.style.paddingLeft = container.style.paddingLeft || '8px';

    const headerCols = [
      "Nr", "Spieler", "Games",
      "Goals", "Assists", "Points", "+/-", "Ø +/-",
      "Shots", "Shots/Game", "Shots %", "Goals/Game", "Points/Game",
      "Penalty", "Goal Value", "FaceOffs", "FaceOffs Won", "FaceOffs %", "Time",
      "MVP", "MVP Points"
    ];

    const table = document.createElement("table");
    table.className = "stats-table";
    table.style.width = table.style.width || "auto";
    table.style.margin = "0"; // remove margin so it sits left
    table.style.borderRadius = "8px";
    table.style.overflow = "hidden";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerCols.forEach((h, idx) => {
      const th = document.createElement("th");
      th.textContent = h;
      th.dataset.colIndex = idx;
      th.className = "sortable";
      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.style.marginLeft = "6px";
      th.appendChild(arrow);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    try { ensureGoalValueDataForSeason(); } catch (e) {}

    const rows = Object.keys(seasonData).map(name => {
      const d = seasonData[name];
      const games = Number(d.games || 0);
      const goals = Number(d.goals || 0);
      const assists = Number(d.assists || 0);
      const points = goals + assists;
      const plusMinus = Number(d.plusMinus || 0);
      const shots = Number(d.shots || 0);
      const penalty = Number(d.penaltys || 0);
      const faceOffs = Number(d.faceOffs || 0);
      const faceOffsWon = Number(d.faceOffsWon || 0);
      const faceOffPercent = faceOffs ? Math.round((faceOffsWon / faceOffs) * 100) : 0;
      const timeSeconds = Number(d.timeSeconds || 0);

      const avgPlusMinus = games ? (plusMinus / games) : 0;
      const shotsPerGame = games ? (shots / games) : 0;
      const goalsPerGame = games ? (goals / games) : 0;
      const pointsPerGame = games ? (points / games) : 0;

      // Shots %: goals to shots ratio, in percent
      const shotsPercent = shots ? Math.round((goals / shots) * 100) : 0;

      let goalValue = "";
      try {
        if (typeof computeValueForPlayer === "function") {
          goalValue = computeValueForPlayer(d.name);
        } else {
          goalValue = Number(d.goalValue || 0);
        }
      } catch (e) {
        goalValue = Number(d.goalValue || 0);
      }

      const gamesSafe = games || 0;
      const assistsPerGame = gamesSafe ? (assists / gamesSafe) : 0;
      const penaltyPerGame = gamesSafe ? (penalty / gamesSafe) : 0;
      const gvNum = Number(goalValue || 0);
      const mvpPointsNum = (
        (assistsPerGame * 8) +
        (avgPlusMinus * 0.5) +
        (shotsPerGame * 0.5) +
        (goalsPerGame + (gamesSafe ? (gvNum / gamesSafe) * 10 : 0)) -
        (penaltyPerGame * 1.2)
      );

      const mvpPointsRounded = Number(Number(mvpPointsNum).toFixed(1));

      const cells = [
        d.num || "",
        d.name,
        games,
        goals,
        assists,
        points,
        plusMinus,
        Number(avgPlusMinus.toFixed(1)),
        shots,
        Number(shotsPerGame.toFixed(1)),
        `${shotsPercent}%`,
        Number(goalsPerGame.toFixed(1)),
        Number(pointsPerGame.toFixed(1)),
        penalty,
        goalValue,
        faceOffs,
        faceOffsWon,
        `${faceOffPercent}%`,
        formatTimeMMSS(timeSeconds),
        "", // MVP placeholder
        ""  // MVP Points placeholder
      ];

      return {
        name: d.name,
        num: d.num || "",
        cells,
        raw: { games, goals, assists, points, plusMinus, shots, penalty, faceOffs, faceOffsWon, faceOffPercent, timeSeconds, goalValue },
        mvpPointsRounded
      };
    });

    const sortedByMvp = rows.slice().sort((a,b) => (b.mvpPointsRounded || 0) - (a.mvpPointsRounded || 0));
    const uniqueScores = [...new Set(sortedByMvp.map(r => r.mvpPointsRounded))];
    const scoreToRank = {};
    uniqueScores.forEach((s, idx) => { scoreToRank[s] = idx + 1; });

    rows.forEach(r => {
      const displayPoints = (typeof r.mvpPointsRounded === "number" && isFinite(r.mvpPointsRounded)) ? Number(r.mvpPointsRounded.toFixed(1)) : "";
      const rank = (typeof r.mvpPointsRounded !== "undefined" && r.mvpPointsRounded !== "" && scoreToRank.hasOwnProperty(r.mvpPointsRounded)) ? scoreToRank[r.mvpPointsRounded] : "";
      const mvpIdx = headerCols.length - 2;
      const mvpPointsIdx = headerCols.length - 1;
      r.cells[mvpIdx] = rank;
      r.cells[mvpPointsIdx] = displayPoints;
    });

    let displayRows = rows.slice();
    if (seasonSort.index === null) {
      displayRows.sort((a,b) => (b.raw.points || 0) - (a.raw.points || 0));
    } else {
      const idx = seasonSort.index;
      displayRows.sort((a,b) => {
        const va = parseForSort(a.cells[idx]);
        const vb = parseForSort(b.cells[idx]);
        if (typeof va === "number" && typeof vb === "number") return seasonSort.asc ? va - vb : vb - va;
        if (va < vb) return seasonSort.asc ? -1 : 1;
        if (va > vb) return seasonSort.asc ? 1 : -1;
        return 0;
      });
    }

    displayRows.forEach(r => {
      const tr = document.createElement("tr");
      r.cells.forEach((c, cellIdx) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (cellIdx === 1) {
          td.style.textAlign = "left";
          td.style.fontWeight = "700";
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    const count = rows.length || 0;
    const headerBgColor = getComputedStyle(document.documentElement).getPropertyValue('--header-bg') || "#1E1E1E";
    const headerTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color') || "#fff";
    headerRow.querySelectorAll("th").forEach(th => {
      th.style.background = headerBgColor;
      th.style.color = headerTextColor;
      th.style.fontWeight = "700";
      th.style.padding = "8px";
    });

    if (count > 0) {
      const sums = {
        games: 0, goals: 0, assists: 0, points: 0, plusMinus: 0,
        shots: 0, penalty: 0, faceOffs: 0, faceOffsWon: 0, timeSeconds: 0
      };
      rows.forEach(r => {
        const rs = r.raw;
        sums.games += rs.games;
        sums.goals += rs.goals;
        sums.assists += rs.assists;
        sums.points += rs.points;
        sums.plusMinus += rs.plusMinus;
        sums.shots += rs.shots;
        sums.penalty += rs.penalty;
        sums.faceOffs += rs.faceOffs;
        sums.faceOffsWon += rs.faceOffsWon;
        sums.timeSeconds += rs.timeSeconds;
      });

      const avgGames = sums.games / count;
      const avgGoals = sums.goals / count;
      const avgAssists = sums.assists / count;
      const avgPoints = sums.points / count;
      const avgPlusMinus = sums.plusMinus / count;
      const avgShots = sums.shots / count;
      const avgPenalty = sums.penalty / count;
      const avgFaceOffs = sums.faceOffs / count;
      const avgFaceOffsWon = sums.faceOffsWon / count;
      const avgFaceOffPercent = avgFaceOffs ? Math.round((avgFaceOffsWon / avgFaceOffs) * 100) : 0;
      const avgTimeSeconds = Math.round(sums.timeSeconds / count);

      // Overall shots->goals percentage
      const overallShotsPercent = sums.shots ? Math.round((sums.goals / sums.shots) * 100) : 0;

      const totalCells = new Array(headerCols.length).fill("");
      totalCells[1] = "Total Ø";
      totalCells[2] = Number((avgGames).toFixed(1));
      totalCells[3] = Number((avgGoals).toFixed(1));
      totalCells[4] = Number((avgAssists).toFixed(1));
      totalCells[5] = Number((avgPoints).toFixed(1));
      totalCells[6] = Number((avgPlusMinus).toFixed(1));
      totalCells[7] = Number((avgPlusMinus).toFixed(1));
      totalCells[8] = Number((avgShots).toFixed(1)); // Shots
      totalCells[9] = Number((avgShots / (avgGames || 1)).toFixed(1)); // Shots/Game
      totalCells[10] = `${overallShotsPercent}%`; // Shots %
      totalCells[11] = Number((avgGoals / (avgGames || 1)).toFixed(1)); // Goals/Game
      totalCells[12] = Number((avgPoints / (avgGames || 1)).toFixed(1)); // Points/Game
      totalCells[13] = Number((avgPenalty).toFixed(1));
      totalCells[14] = "";
      totalCells[15] = Number((avgFaceOffs).toFixed(1));
      totalCells[16] = Number((avgFaceOffsWon).toFixed(1));
      totalCells[17] = `${avgFaceOffPercent}%`;
      totalCells[18] = formatTimeMMSS(avgTimeSeconds);

      const trTotal = document.createElement("tr");
      trTotal.className = "total-row";
      totalCells.forEach((c, idx) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (idx === 1) {
          td.style.textAlign = "left";
          td.style.fontWeight = "700";
        }
        td.style.background = headerBgColor;
        td.style.color = headerTextColor;
        td.style.fontWeight = "700";
        td.style.padding = "8px";
        trTotal.appendChild(td);
      });
      tbody.appendChild(trTotal);
    } else {
      const trTotal = document.createElement("tr");
      trTotal.className = "total-row";
      const emptyCells = new Array(headerCols.length).fill("");
      emptyCells[1] = "Total Ø";
      emptyCells.forEach((c, idx) => {
        const td = document.createElement("td");
        td.textContent = c;
        if (idx === 1) {
          td.style.textAlign = "left";
          td.style.fontWeight = "700";
        }
        td.style.background = headerBgColor;
        td.style.color = headerTextColor;
        td.style.fontWeight = "700";
        td.style.padding = "8px";
        trTotal.appendChild(td);
      });
      tbody.appendChild(trTotal);
    }

    table.appendChild(tbody);

    // Wrap the table in a horizontal scroll wrapper so all columns remain accessible
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.style.width = '100%';
    wrapper.style.boxSizing = 'border-box';
    wrapper.appendChild(table);

    container.appendChild(wrapper);

    function updateSortUI() {
      const ths = table.querySelectorAll("th.sortable");
      ths.forEach(th => {
        const arrow = th.querySelector(".sort-arrow");
        if (!arrow) return;
        const idx = Number(th.dataset.colIndex);
        if (seasonSort.index === idx) {
          arrow.textContent = seasonSort.asc ? "▴" : "▾";
        } else {
          arrow.textContent = "";
        }
      });
    }
    updateSortUI();

    table.querySelectorAll("th.sortable").forEach(th => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const idx = Number(th.dataset.colIndex);
        if (seasonSort.index === idx) seasonSort.asc = !seasonSort.asc;
        else { seasonSort.index = idx; seasonSort.asc = true; }
        seasonSort.index = idx;
        renderSeasonTable();
      });
    });
  }

  // --- Render stats table ---
  function updateIceTimeColors() {
    const iceTimes = selectedPlayers.map(p => ({ name: p.name, seconds: playerTimes[p.name] || 0 }));
    const sortedDesc = iceTimes.slice().sort((a,b) => b.seconds - a.seconds);
    const top5 = new Set(sortedDesc.slice(0,5).map(x => x.name));
    const sortedAsc = iceTimes.slice().sort((a,b) => a.seconds - b.seconds);
    const bottom5 = new Set(sortedAsc.slice(0,5).map(x => x.name));

    if (!statsContainer) return;
    statsContainer.querySelectorAll(".ice-time-cell").forEach(cell => {
      const player = cell.dataset.player;
      if (top5.has(player)) cell.style.color = getComputedStyle(document.documentElement).getPropertyValue('--ice-top')?.trim() || "#00c06f";
      else if (bottom5.has(player)) cell.style.color = getComputedStyle(document.documentElement).getPropertyValue('--ice-bottom')?.trim() || "#ff4c4c";
      else cell.style.color = getComputedStyle(document.documentElement).getPropertyValue('--cell-zero-color')?.trim() || "#ffffff";
    });
  }

  function renderStatsTable() {
    if (!statsContainer) return;
    statsContainer.innerHTML = "";

    const table = document.createElement("table");
    table.className = "stats-table";

    table.style.borderRadius = "8px";
    table.style.overflow = "hidden";
    table.style.borderCollapse = "separate";
    table.style.borderSpacing = "0";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>#</th><th>Spieler</th>` + categories.map(c => `<th>${escapeHtml(c)}</th>`).join("") + `<th>Time</th>`;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const headerBgColor = getComputedStyle(document.documentElement).getPropertyValue('--header-bg') || "#1E1E1E";
    const headerTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color') || "#fff";
    headerRow.querySelectorAll("th").forEach(th => {
      th.style.background = headerBgColor;
      th.style.color = headerTextColor;
      th.style.fontWeight = "700";
      th.style.padding = "8px";
    });

    const tbody = document.createElement("tbody");
    tbody.addEventListener("dragover", (e) => { e.preventDefault(); });
    tbody.addEventListener("drop", (e) => {
      e.preventDefault();
      try {
        const playerName = e.dataTransfer.getData("text/plain");
        if (!playerName) return;
        const draggedIndex = selectedPlayers.findIndex(p => p.name === playerName);
        if (draggedIndex === -1) return;
        const targetTr = e.target.closest("tr");
        const isTotal = targetTr && targetTr.classList.contains("total-row");
        let dropIndex;
        if (!targetTr || isTotal) {
          dropIndex = selectedPlayers.length - 1;
        } else {
          dropIndex = Number(targetTr.dataset.index);
          if (isNaN(dropIndex)) dropIndex = selectedPlayers.length - 1;
        }
        if (draggedIndex === dropIndex) return;
        const [item] = selectedPlayers.splice(draggedIndex, 1);
        const adjustedIndex = (draggedIndex < dropIndex) ? dropIndex : dropIndex;
        selectedPlayers.splice(adjustedIndex, 0, item);
        localStorage.setItem("selectedPlayers", JSON.stringify(selectedPlayers));
        renderStatsTable();
      } catch (err) {
        console.warn("Drop failed:", err);
      }
    });

    selectedPlayers.forEach((p, idx) => {
      const tr = document.createElement("tr");
      tr.classList.add(idx % 2 === 0 ? "even-row" : "odd-row");
      tr.dataset.index = String(idx);
      tr.dataset.player = p.name;
      tr.style.userSelect = "none";

      tr.addEventListener("dragstart", (ev) => {
        try {
          ev.dataTransfer.setData("text/plain", p.name);
          ev.dataTransfer.effectAllowed = "move";
          tr.classList.add("dragging");
        } catch (e) {}
      });
      tr.addEventListener("dragend", () => {
        tr.draggable = false;
        tr.classList.remove("dragging");
        tr.classList.remove("drag-enabled");
        tr.style.cursor = "";
        tr.style.outline = "";
      });

      const numTd = document.createElement("td");
      numTd.innerHTML = `<strong>${escapeHtml(p.num || "-")}</strong>`;
      tr.appendChild(numTd);

      const nameTd = document.createElement("td");
      nameTd.style.cssText = "text-align:left;padding-left:12px;cursor:pointer;white-space:nowrap;";
      nameTd.innerHTML = `<strong>${escapeHtml(p.name)}</strong>`;
      tr.appendChild(nameTd);

      categories.forEach(c => {
        const td = document.createElement("td");
        const val = statsData[p.name]?.[c] ?? 0;
        const posColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-pos-color')?.trim() || "#00ff80";
        const negColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-neg-color')?.trim() || "#ff4c4c";
        const zeroColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-zero-color')?.trim() || "#ffffff";
        const color = val > 0 ? posColor : val < 0 ? negColor : zeroColor;
        td.dataset.player = p.name;
        td.dataset.cat = c;
        td.style.color = color;
        td.textContent = val;
        tr.appendChild(td);
      });

      const iceTd = document.createElement("td");
      iceTd.className = "ice-time-cell";
      iceTd.dataset.player = p.name;
      const seconds = playerTimes[p.name] || 0;
      const m = String(Math.floor(seconds / 60)).padStart(2,"0");
      const s = String(seconds % 60).padStart(2,"0");
      iceTd.textContent = `${m}:${s}`;
      tr.appendChild(iceTd);

      (function(nameCell, playerName, rowEl) {
        const LONG_DRAG_MS = 500;
        let holdTimer = null;
        let suppressClick = false;

        function enableDragVisual() {
          rowEl.draggable = true;
          rowEl.classList.add("drag-enabled");
          rowEl.style.cursor = "grabbing";
          rowEl.style.outline = "2px dashed rgba(0,0,0,0.08)";
        }

        nameCell.addEventListener("mousedown", (ev) => {
          if (holdTimer) clearTimeout(holdTimer);
          holdTimer = setTimeout(() => {
            suppressClick = true;
            enableDragVisual();
          }, LONG_DRAG_MS);
        });
        nameCell.addEventListener("mouseup", () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });
        nameCell.addEventListener("mouseleave", () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } });

        nameCell.addEventListener("touchstart", (ev) => {
          if (holdTimer) clearTimeout(holdTimer);
          holdTimer = setTimeout(() => {
            suppressClick = true;
            enableDragVisual();
          }, LONG_DRAG_MS);
        }, { passive: true });
        nameCell.addEventListener("touchend", () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } }, { passive: true });

        nameCell.addEventListener("click", (ev) => {
          if (suppressClick) { suppressClick = false; return; }
          if (activeTimers[playerName]) {
            clearInterval(activeTimers[playerName]);
            delete activeTimers[playerName];
            nameCell.style.backgroundColor = "";
            rowEl.style.backgroundColor = "";
          } else {
            activeTimers[playerName] = setInterval(() => {
              playerTimes[playerName] = (playerTimes[playerName] || 0) + 1;
              localStorage.setItem("playerTimes", JSON.stringify(playerTimes));
              const sec = playerTimes[playerName];
              const mm = String(Math.floor(sec / 60)).padStart(2,"0");
              const ss = String(sec % 60).padStart(2,"0");
              const cell = statsContainer.querySelector(`.ice-time-cell[data-player="${playerName}"]`);
              if (cell) cell.textContent = `${mm}:${ss}`;
              updateIceTimeColors();
            }, 1000);
            nameCell.style.backgroundColor = "#005c2f";
            rowEl.style.backgroundColor = "#005c2f";
          }
        });
      })(nameTd, p.name, tr);

      tbody.appendChild(tr);
    });

    // totals row
    const totalsRow = document.createElement("tr");
    totalsRow.id = "totalsRow";
    const tdEmpty = document.createElement("td"); tdEmpty.textContent = "";
    const tdTotalLabel = document.createElement("td"); tdTotalLabel.textContent = `Total (${selectedPlayers.length})`;
    tdTotalLabel.style.textAlign = "left";
    tdTotalLabel.style.fontWeight = "700";
    totalsRow.appendChild(tdEmpty);
    totalsRow.appendChild(tdTotalLabel);
    categories.forEach(c => {
      const td = document.createElement("td");
      td.className = "total-cell";
      td.dataset.cat = c;
      td.textContent = "0";
      totalsRow.appendChild(td);
    });
    const tdTimeTotal = document.createElement("td");
    tdTimeTotal.className = "total-cell";
    tdTimeTotal.dataset.cat = "Time";
    tdTimeTotal.textContent = "";
    totalsRow.appendChild(tdTimeTotal);

    const headerBg = headerBgColor;
    const headerColor = headerTextColor;
    Array.from(totalsRow.children).forEach(td => {
      td.style.background = headerBg;
      td.style.color = headerColor;
      td.style.fontWeight = "700";
      td.style.padding = "8px";
    });

    tbody.appendChild(totalsRow);

    table.appendChild(tbody);
    statsContainer.appendChild(table);

    statsContainer.querySelectorAll("td[data-player]").forEach(td => {
      let clickTimeout = null;
      td.addEventListener("click", (e) => {
        if (clickTimeout) clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          changeValue(td, 1);
          clickTimeout = null;
        }, 200);
      });
      td.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
        changeValue(td, -1);
      });
    });

    updateIceTimeColors();
    updateTotals();
  }

  // --- change value helper ---
  function changeValue(td, delta) {
    const player = td.dataset.player;
    const cat = td.dataset.cat;
    if (!statsData[player]) statsData[player] = {};
    statsData[player][cat] = (statsData[player][cat] || 0) + delta;
    statsData[player][cat] = Math.trunc(statsData[player][cat]);
    localStorage.setItem("statsData", JSON.stringify(statsData));
    td.textContent = statsData[player][cat];

    const val = statsData[player][cat];
    const posColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-pos-color')?.trim() || "#00ff80";
    const negColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-neg-color')?.trim() || "#ff4c4c";
    const zeroColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-zero-color')?.trim() || "#ffffff";
    td.style.color = val > 0 ? posColor : val < 0 ? negColor : zeroColor;

    updateTotals();
  }

  // --- update totals ---
  function updateTotals() {
    const totals = {};
    categories.forEach(c => totals[c] = 0);
    let totalSeconds = 0;
    selectedPlayers.forEach(p => {
      categories.forEach(c => { totals[c] += (Number(statsData[p.name]?.[c]) || 0); });
      totalSeconds += (playerTimes[p.name] || 0);
    });

    document.querySelectorAll(".total-cell").forEach(tc => {
      const cat = tc.dataset.cat;
      if (cat === "+/-") {
        const vals = selectedPlayers.map(p => Number(statsData[p.name]?.[cat] || 0));
        const avg = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;
        tc.textContent = `Ø ${avg}`;
        tc.style.color = "#ffffff";
      } else if (cat === "FaceOffs Won") {
        const totalFace = totals["FaceOffs"] || 0;
        const percent = totalFace ? Math.round((totals["FaceOffs Won"]/totalFace)*100) : 0;
        const percentColor = percent > 50 ? "#00ff80" : percent < 50 ? "#ff4c4c" : "#ffffff";
        tc.innerHTML = `<span style="color:white">${totals["FaceOffs Won"]}</span> (<span style="color:${percentColor}">${percent}%</span>)`;
      } else if (cat === "FaceOffs" || ["Goal","Assist","Penaltys"].includes(cat)) {
        tc.textContent = totals[cat] || 0;
        tc.style.color = "#ffffff";
      } else if (cat === "Shot") {
        if (!tc.dataset.opp) tc.dataset.opp = 0;
        const own = totals["Shot"] || 0;
        const opp = Number(tc.dataset.opp) || 0;
        let ownColor = "#ffffff", oppColor = "#ffffff";
        if (own > opp) { ownColor = "#00ff80"; oppColor = "#ff4c4c"; }
        else if (opp > own) { ownColor = "#ff4c4c"; oppColor = "#00ff80"; }
        tc.innerHTML = `<span style="color:${ownColor}">${own}</span> <span style="color:white">vs</span> <span style="color:${oppColor}">${opp}</span>`;
        tc.onclick = () => {
          tc.dataset.opp = Number(tc.dataset.opp || 0) + 1;
          updateTotals();
        };
      } else if (cat === "Time") {
        const mm = String(Math.floor(totalSeconds / 60)).padStart(2,"0");
        const ss = String(totalSeconds % 60).padStart(2,"0");
        tc.textContent = `${mm}:${ss}`;
      } else {
        tc.textContent = totals[cat] || 0;
        const posColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-pos-color')?.trim() || "#00ff80";
        const negColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-neg-color')?.trim() || "#ff4c4c";
        const zeroColor = getComputedStyle(document.documentElement).getPropertyValue('--cell-zero-color')?.trim() || "#ffffff";
        tc.style.color = totals[cat] > 0 ? posColor : totals[cat] < 0 ? negColor : zeroColor;
      }
    });
  }

  // --- timer helpers ---
  function updateTimerDisplay(){
    const m = String(Math.floor(timerSeconds / 60)).padStart(2,"0");
    const s = String(timerSeconds % 60).padStart(2,"0");
    if (timerBtn) timerBtn.textContent = `${m}:${s}`;
    localStorage.setItem("timerSeconds", timerSeconds.toString());
  }
  function startTimer(){
    if (!timerInterval) {
      timerInterval = setInterval(() => { timerSeconds++; updateTimerDisplay(); }, 1000);
      timerRunning = true;
      if (timerBtn) { timerBtn.classList.remove("stopped","reset"); timerBtn.classList.add("running"); }
    }
  }
  function stopTimer(){
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerRunning = false;
    if (timerBtn) { timerBtn.classList.remove("running","reset"); timerBtn.classList.add("stopped"); }
  }
  function resetTimerOnlyClock(){
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    timerSeconds = 0; timerRunning = false;
    updateTimerDisplay();
    if (timerBtn) { timerBtn.classList.remove("running","stopped"); timerBtn.classList.add("reset"); }
  }

  let holdTimer = null, longPress = false;
  const LONG_MS = 800;
  if (timerBtn) {
    timerBtn.addEventListener("mousedown", () => { longPress=false; holdTimer = setTimeout(()=>{ resetTimerOnlyClock(); longPress=true; }, LONG_MS); });
    timerBtn.addEventListener("mouseup", () => { if (holdTimer) clearTimeout(holdTimer); });
    timerBtn.addEventListener("mouseleave", () => { if (holdTimer) clearTimeout(holdTimer); });
    timerBtn.addEventListener("touchstart", () => { longPress=false; holdTimer = setTimeout(()=>{ resetTimerOnlyClock(); longPress=true; }, LONG_MS); }, {passive:true});
    timerBtn.addEventListener("touchend", () => { if (holdTimer) clearTimeout(holdTimer); });
    timerBtn.addEventListener("touchcancel", () => { if (holdTimer) clearTimeout(holdTimer); }, {passive:true});
    timerBtn.addEventListener("click", () => { if (longPress) { longPress=false; return; } if (timerInterval) stopTimer(); else startTimer(); });
  }

  // --- Reset functions ---
  function resetStatsPage() {
    const sicher = confirm("⚠️ Spieldaten zurücksetzen?");
    if (!sicher) return;
    localStorage.removeItem("statsData");
    localStorage.removeItem("playerTimes");
    statsData = {};
    playerTimes = {};
    renderStatsTable();
    alert("Spieldaten zurückgesetzt.");
  }

  function resetTorbildPage() {
    const sicher = confirm("⚠️ Goal Map (Marker & Timeboxen) zurücksetzen?");
    if (!sicher) return;
    document.querySelectorAll("#torbildPage .marker-dot").forEach(d => d.remove());
    document.querySelectorAll("#torbildPage .time-btn").forEach(btn => btn.textContent = "0");
    localStorage.removeItem("timeData");
    alert("Goal Map zurückgesetzt.");
  }

  function resetSeasonPage() {
    const sicher = confirm("⚠️ Season-Daten löschen?");
    if (!sicher) return;
    seasonData = {};
    localStorage.removeItem("seasonData");
    renderSeasonTable();
    alert("Season-Daten gelöscht.");
  }

  document.getElementById("resetBtn")?.addEventListener("click", resetStatsPage);
  document.getElementById("resetTorbildBtn")?.addEventListener("click", resetTorbildPage);
  document.getElementById("resetSeasonBtn")?.addEventListener("click", resetSeasonPage);

  // --- Pages navigation --- (use showPageRef to keep previous API)
  function showPageFull(page) {
    Object.values(pages).forEach(p => { if (p) p.style.display = "none"; });
    if (pages[page]) pages[page].style.display = "block";
    localStorage.setItem("currentPage", page);

    let title = "Spielerstatistik";
    if (page === "selection") title = "Spielerauswahl";
    else if (page === "stats") title = "Statistiken";
    else if (page === "torbild") title = "Goal Map";
    else if (page === "goalValue") title = "Goal Value";
    else if (page === "season") title = "Season";
    else if (page === "seasonMap") title = "Season Map";
    document.title = title;

    setTimeout(updateTimerDisplay, 20);
    setTimeout(() => {
      if (page === "season") renderSeasonTable();
      if (page === "goalValue") renderGoalValuePage();
      if (page === "seasonMap") renderSeasonMapPage();
    }, 60);
  }
  window.showPage = showPageFull;
  const showPageRef = window.showPage;

  selectPlayersBtn?.addEventListener("click", () => showPageRef("selection"));
  backToStatsBtn?.addEventListener("click", () => showPageRef("stats"));
  backToStatsFromSeasonBtn?.addEventListener("click", () => showPageRef("stats"));
  seasonBtn?.addEventListener("click", () => { showPageRef("season"); renderSeasonTable(); });
  goalValueBtn?.addEventListener("click", () => showPageRef("goalValue"));
  backFromGoalValueBtn?.addEventListener("click", () => showPageRef("stats"));
  resetGoalValueBtn?.addEventListener("click", resetGoalValuePage);

  // --- Fix: missing navigation handlers ---
  torbildBtn?.addEventListener("click", () => {
    try {
      showPageRef("torbild");
      setTimeout(() => {}, 60);
    } catch (e) {
      console.warn("torbildBtn handler failed:", e);
      document.getElementById("torbildPage")?.style && (document.getElementById("torbildPage").style.display = "block");
    }
  });

  seasonMapBtn?.addEventListener("click", () => {
    try {
      showPageRef("seasonMap");
      renderSeasonMapPage();
    } catch (e) {
      console.warn("seasonMapBtn handler failed:", e);
      const el = document.getElementById("seasonMapPage");
      if (el) el.style.display = "block";
    }
  });

  // --- Goal Value helpers (kept minimal and stable) ---
  function getGoalValueOpponents() {
    try {
      const raw = localStorage.getItem("goalValueOpponents");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const defaults = [];
    for (let i=1;i<=19;i++) defaults.push(`Gegner ${i}`);
    return defaults;
  }
  function setGoalValueOpponents(arr) { localStorage.setItem("goalValueOpponents", JSON.stringify(arr)); }
  function getGoalValueData() {
    try {
      const raw = localStorage.getItem("goalValueData");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }
  function setGoalValueData(obj) { localStorage.setItem("goalValueData", JSON.stringify(obj)); }
  function getGoalValueBottom() {
    try {
      const raw = localStorage.getItem("goalValueBottom");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const opps = getGoalValueOpponents();
    return opps.map(()=>0);
  }
  function setGoalValueBottom(arr) { localStorage.setItem("goalValueBottom", JSON.stringify(arr)); }

  function computeValueForPlayer(name) {
    const data = getGoalValueData();
    const bottom = getGoalValueBottom();
    const vals = (data[name] && Array.isArray(data[name])) ? data[name] : [];
    let sum = 0;
    for (let i = 0; i < bottom.length; i++) {
      const cell = Number(vals[i] || 0);
      const w = Number(bottom[i] || 0);
      sum += cell * w;
    }
    return sum;
  }

  function formatValueNumber(v) {
    if (Math.abs(v - Math.round(v)) < 0.0001) return String(Math.round(v));
    return String(Number(v.toFixed(1)));
  }

  function renderGoalValuePage() {
    if (!goalValueContainer) return;
    goalValueContainer.innerHTML = "";
    const opponents = getGoalValueOpponents();
    ensureGoalValueDataForSeason();
    const goalData = getGoalValueData();
    const bottom = getGoalValueBottom();
    const playerNames = Object.keys(seasonData).length ? Object.keys(seasonData).sort() : selectedPlayers.map(p=>p.name);

    // Strong left alignment for goal value
    try {
      goalValueContainer.style.display = 'flex';
      goalValueContainer.style.justifyContent = 'flex-start';
      goalValueContainer.style.paddingLeft = goalValueContainer.style.paddingLeft || '8px';
    } catch (e) {}

    const table = document.createElement("table");
    table.className = "goalvalue-table";
    table.style.width = table.style.width || "auto";
    table.style.margin = "0";
    table.style.borderCollapse = "collapse";
    table.style.borderRadius = "8px";
    table.style.overflow = "hidden";
    table.style.tableLayout = "auto";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const thPlayer = document.createElement("th");
    thPlayer.style.textAlign = "center";
    thPlayer.style.padding = "8px 6px";
    thPlayer.style.borderBottom = "2px solid #333";
    thPlayer.style.minWidth = "160px";
    thPlayer.style.whiteSpace = "nowrap";
    thPlayer.textContent = "Spieler";
    headerRow.appendChild(thPlayer);

    opponents.forEach((op, idx) => {
      const th = document.createElement("th");
      th.style.padding = "6px";
      th.style.borderBottom = "2px solid #333";
      th.style.textAlign = "center";
      const input = document.createElement("input");
      input.type = "text";
      input.value = op || `Gegner ${idx+1}`;
      input.className = "goalvalue-title-input";
      input.style.width = "100%";
      input.style.boxSizing = "border-box";
      input.style.textAlign = "center";
      input.addEventListener("change", () => {
        const arr = getGoalValueOpponents();
        arr[idx] = input.value || `Gegner ${idx+1}`;
        setGoalValueOpponents(arr);
        ensureGoalValueDataForSeason();
        renderGoalValuePage();
      });
      th.appendChild(input);
      headerRow.appendChild(th);
    });

    const thValue = document.createElement("th");
    thValue.style.padding = "6px";
    thValue.style.borderBottom = "2px solid #333";
    thValue.style.textAlign = "center";
    thValue.textContent = "Value";
    headerRow.appendChild(thValue);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const valueCellMap = {};
    const posColorGlobal = getComputedStyle(document.documentElement).getPropertyValue('--cell-pos-color')?.trim() || "#00ff80";
    const negColorGlobal = getComputedStyle(document.documentElement).getPropertyValue('--cell-neg-color')?.trim() || "#ff4c4c";
    const zeroColorGlobal = getComputedStyle(document.documentElement).getPropertyValue('--cell-zero-color')?.trim() || "#ffffff";

    playerNames.forEach((name, rowIndex) => {
      const row = document.createElement("tr");
      row.classList.add(rowIndex % 2 === 0 ? "even-row" : "odd-row");
      row.style.borderBottom = "1px solid #333";

      const tdName = document.createElement("td");
      tdName.textContent = name;
      tdName.style.textAlign = "left";
      tdName.style.padding = "6px";
      tdName.style.fontWeight = "700";
      tdName.style.minWidth = "160px";
      tdName.style.whiteSpace = "nowrap";
      tdName.style.overflow = "visible";
      tdName.style.textOverflow = "clip";
      row.appendChild(tdName);

      const playerVals = (goalData[name] && Array.isArray(goalData[name])) ? goalData[name] : opponents.map(()=>0);
      while (playerVals.length < opponents.length) playerVals.push(0);

      opponents.forEach((op, idx) => {
        const td = document.createElement("td");
        td.style.padding = "6px";
        td.style.textAlign = "center";
        td.style.cursor = "pointer";
        td.dataset.player = name;
        td.dataset.opp = String(idx);
        const cellVal = Number(playerVals[idx] || 0);
        td.textContent = String(cellVal);

        if (cellVal > 0) {
          td.style.color = posColorGlobal;
          td.style.fontWeight = "700";
        } else if (cellVal < 0) {
          td.style.color = negColorGlobal;
          td.style.fontWeight = "400";
        } else {
          td.style.color = zeroColorGlobal;
          td.style.fontWeight = "400";
        }

        let clickTimeout = null;
        td.addEventListener("click", () => {
          if (clickTimeout) clearTimeout(clickTimeout);
          clickTimeout = setTimeout(() => {
            const all = getGoalValueData();
            if (!all[name]) all[name] = opponents.map(()=>0);
            all[name][idx] = Math.max(0, (Number(all[name][idx]||0) + 1));
            setGoalValueData(all);
            td.textContent = String(all[name][idx]);
            const nv = Number(all[name][idx] || 0);
            if (nv > 0) { td.style.color = posColorGlobal; td.style.fontWeight = "700"; }
            else if (nv < 0) { td.style.color = negColorGlobal; td.style.fontWeight = "400"; }
            else { td.style.color = zeroColorGlobal; td.style.fontWeight = "400"; }

            const valCell = valueCellMap[name];
            if (valCell) {
              const comp = computeValueForPlayer(name);
              valCell.textContent = formatValueNumber(comp);
              if (comp > 0) { valCell.style.color = posColorGlobal; valCell.style.fontWeight = "700"; }
              else if (comp < 0) { valCell.style.color = negColorGlobal; valCell.style.fontWeight = "400"; }
              else { valCell.style.color = zeroColorGlobal; valCell.style.fontWeight = "400"; }
            }
            clickTimeout = null;
          }, 200);
        });
        td.addEventListener("dblclick", (e) => {
          e.preventDefault();
          if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
          const all = getGoalValueData();
          if (!all[name]) all[name] = opponents.map(()=>0);
          all[name][idx] = Math.max(0, (Number(all[name][idx]||0) - 1));
          setGoalValueData(all);
          td.textContent = String(all[name][idx]);
          const nv = Number(all[name][idx] || 0);
          if (nv > 0) { td.style.color = posColorGlobal; td.style.fontWeight = "700"; }
          else if (nv < 0) { td.style.color = negColorGlobal; td.style.fontWeight = "400"; }
          else { td.style.color = zeroColorGlobal; td.style.fontWeight = "400"; }

          const valCell = valueCellMap[name];
          if (valCell) {
            const comp = computeValueForPlayer(name);
            valCell.textContent = formatValueNumber(comp);
            if (comp > 0) { valCell.style.color = posColorGlobal; valCell.style.fontWeight = "700"; }
            else if (comp < 0) { valCell.style.color = negColorGlobal; valCell.style.fontWeight = "400"; }
            else { valCell.style.color = zeroColorGlobal; valCell.style.fontWeight = "400"; }
          }
        });

        let lastTap = 0;
        td.addEventListener("touchstart", (e) => {
          const now = Date.now();
          const diff = now - lastTap;
          if (diff < 300) {
            e.preventDefault();
            if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
            const all = getGoalValueData();
            if (!all[name]) all[name] = opponents.map(()=>0);
            all[name][idx] = Math.max(0, (Number(all[name][idx]||0) - 1));
            setGoalValueData(all);
            td.textContent = String(all[name][idx]);
            const nv = Number(all[name][idx] || 0);
            if (nv > 0) { td.style.color = posColorGlobal; td.style.fontWeight = "700"; }
            else if (nv < 0) { td.style.color = negColorGlobal; td.style.fontWeight = "400"; }
            else { td.style.color = zeroColorGlobal; td.style.fontWeight = "400"; }

            const valCell = valueCellMap[name];
            if (valCell) {
              const comp = computeValueForPlayer(name);
              valCell.textContent = formatValueNumber(comp);
              if (comp > 0) { valCell.style.color = posColorGlobal; valCell.style.fontWeight = "700"; }
              else if (comp < 0) { valCell.style.color = negColorGlobal; valCell.style.fontWeight = "400"; }
              else { valCell.style.color = zeroColorGlobal; valCell.style.fontWeight = "400"; }
            }
            lastTap = 0;
          } else {
            lastTap = now;
            setTimeout(() => {
              if (lastTap !== 0) {
                const all = getGoalValueData();
                if (!all[name]) all[name] = opponents.map(()=>0);
                all[name][idx] = Math.max(0, (Number(all[name][idx]||0) + 1));
                setGoalValueData(all);
                td.textContent = String(all[name][idx]);
                const nv = Number(all[name][idx] || 0);
                if (nv > 0) { td.style.color = posColorGlobal; td.style.fontWeight = "700"; }
                else if (nv < 0) { td.style.color = negColorGlobal; td.style.fontWeight = "400"; }
                else { td.style.color = zeroColorGlobal; td.style.fontWeight = "400"; }

                const valCell = valueCellMap[name];
                if (valCell) { 
                  const comp = computeValueForPlayer(name);
                  valCell.textContent = formatValueNumber(comp);
                  if (comp > 0) { valCell.style.color = posColorGlobal; valCell.style.fontWeight = "700"; }
                  else if (comp < 0) { valCell.style.color = negColorGlobal; valCell.style.fontWeight = "400"; }
                  else { valCell.style.color = zeroColorGlobal; valCell.style.fontWeight = "400"; }
                }
                lastTap = 0;
              }
            }, 300);
          }
        }, { passive: true });

        row.appendChild(td);
      });

      const tdValue = document.createElement("td");
      tdValue.style.padding = "6px";
      tdValue.style.textAlign = "center";
      const computed = computeValueForPlayer(name);
      tdValue.textContent = formatValueNumber(computed);
      if (computed > 0) { tdValue.style.color = posColorGlobal; tdValue.style.fontWeight = "700"; }
      else if (computed < 0) { tdValue.style.color = negColorGlobal; tdValue.style.fontWeight = "400"; }
      else { tdValue.style.color = zeroColorGlobal; tdValue.style.fontWeight = "400"; }
      row.appendChild(tdValue);
      valueCellMap[name] = tdValue;

      tbody.appendChild(row);
    });

    const bottomRow = document.createElement("tr");
    bottomRow.classList.add(playerNames.length % 2 === 0 ? "even-row" : "odd-row");
    bottomRow.style.background = "rgba(0,0,0,0.03)";
    const bottomLabel = document.createElement("td");
    bottomLabel.style.padding = "6px";
    bottomLabel.style.fontWeight = "700";
    bottomLabel.style.textAlign = "center";
    bottomLabel.textContent = "GegNER";
    bottomRow.appendChild(bottomLabel);

    const goalValueOptions = [];
    for (let v=0; v<=10; v++) goalValueOptions.push((v*0.5).toFixed(1));

    const bottomStored = getGoalValueBottom();
    while (bottomStored.length < opponents.length) bottomStored.push(0);
    if (bottomStored.length > opponents.length) bottomStored.length = opponents.length;
    setGoalValueBottom(bottomStored);

    opponents.forEach((op, idx) => {
      const td = document.createElement("td");
      td.style.padding = "6px";
      td.style.textAlign = "center";
      const sel = document.createElement("select");
      sel.style.width = "80px";
      goalValueOptions.forEach(opt => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      const b = getGoalValueBottom();
      if (b && typeof b[idx] !== "undefined") sel.value = String(b[idx]);
      sel.addEventListener("change", () => {
        const arr = getGoalValueBottom();
        arr[idx] = Number(sel.value);
        setGoalValueBottom(arr);
        Object.keys(valueCellMap).forEach(playerName => {
          const el = valueCellMap[playerName];
          if (el) { 
            const comp = computeValueForPlayer(playerName);
            el.textContent = formatValueNumber(comp);
            if (comp > 0) { el.style.color = posColorGlobal; el.style.fontWeight = "700"; }
            else if (comp < 0) { el.style.color = negColorGlobal; el.style.fontWeight = "400"; }
            else { el.style.color = zeroColorGlobal; el.style.fontWeight = "400"; }
          }
        });
      });
      td.appendChild(sel);
      bottomRow.appendChild(td);
    });

    const tdEmptyForValue = document.createElement("td");
    tdEmptyForValue.style.padding = "6px";
    tdEmptyForValue.textContent = "";
    bottomRow.appendChild(tdEmptyForValue);

    tbody.appendChild(bottomRow);
    table.appendChild(tbody);

    // Wrap goalvalue table in scroll wrapper so all columns are accessible
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.style.width = '100%';
    wrapper.style.boxSizing = 'border-box';
    wrapper.appendChild(table);

    goalValueContainer.appendChild(wrapper);
  }

  function resetGoalValuePage() {
    if (!confirm("⚠️ Goal Value zurücksetzen? Alle Spielerwerte auf 0 und Skalen auf 0 setzen.")) return;
    const opponents = getGoalValueOpponents();
    const playerNames = Object.keys(seasonData).length ? Object.keys(seasonData) : selectedPlayers.map(p=>p.name);
    const newData = {};
    playerNames.forEach(n => newData[n] = opponents.map(()=>0));
    setGoalValueData(newData);
    setGoalValueBottom(opponents.map(()=>0));
    renderGoalValuePage();
    alert("Goal Value zurückgezet.");
  }

  // --- Final init and restore state on load ---
  seasonData = JSON.parse(localStorage.getItem("seasonData")) || seasonData || {};

  renderPlayerSelection();

  const lastPage = localStorage.getItem("currentPage") || (selectedPlayers.length ? "stats" : "selection");
  if (lastPage === "stats") {
    showPageRef("stats");
    renderStatsTable();
    updateIceTimeColors();
  } else if (lastPage === "season") {
    showPageRef("season");
    renderSeasonTable();
  } else if (lastPage === "seasonMap") {
    showPageRef("seasonMap");
    renderSeasonMapPage();
  } else if (lastPage === "goalValue") {
    showPageRef("goalValue");
    renderGoalValuePage();
  } else {
    showPageRef("selection");
  }

  updateTimerDisplay();

  // Save to localStorage on unload
  window.addEventListener("beforeunload", () => {
    try {
      localStorage.setItem("statsData", JSON.stringify(statsData));
      localStorage.setItem("selectedPlayers", JSON.stringify(selectedPlayers));
      localStorage.setItem("playerTimes", JSON.stringify(playerTimes));
      localStorage.setItem("timerSeconds", String(timerSeconds));
      localStorage.setItem("seasonData", JSON.stringify(seasonData));
      localStorage.setItem("goalValueOpponents", JSON.stringify(getGoalValueOpponents()));
      localStorage.setItem("goalValueData", JSON.stringify(getGoalValueData()));
      localStorage.setItem("goalValueBottom", JSON.stringify(getGoalValueBottom()));
    } catch (e) {
      // ignore
    }
  });

  // Robust: zentrale Delegation für alle Back-Buttons (registriert sofort)
  document.addEventListener('click', function (e) {
    try {
      const btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      const id = btn.id || '';

      const backButtonIds = new Set([
        'backToStatsBtn',
        'backToStatsFromSeasonBtn',
        'backToStatsFromSeasonMapBtn',
        'backFromGoalValueBtn'
      ]);

      if (backButtonIds.has(id)) {
        if (typeof window.showPage === 'function') {
          window.showPage('stats');
        } else if (typeof showPageRef === 'function') {
          showPageRef('stats');
        } else if (typeof showPage === 'function') {
          showPage('stats');
        } else {
          document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
          const statsP = document.getElementById('statsPage');
          if (statsP) statsP.style.display = 'block';
        }
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (err) {
      console.warn('Back button delegation failed:', err);
    }
  }, true);

});
