// season_table_ui_patch.js
// - Verschiebt "MVP Points" und "MVP" ans Ende der Season-Tabelle (MVP zuletzt).
// - Macht die Goal Value Tabelle gestreift wie andere Tabellen.
// - Entfernt dropdown-only Eingaben: Klick = +1 (cycle bei bottom scale), Doppelklick = Inline-Number-Editor.
// - Schreibt Änderungen zurück in vorhandene app-Helper (getGoalValueData / setGoalValueData / getGoalValueBottom / setGoalValueBottom).
// - Läuft nach DOMContentLoaded und reagiert auf Neurendering (MutationObserver).
(function () {
  'use strict';

  // helpers to safely call app functions (fallback to localStorage)
  function safeGetGoalValueData() {
    if (typeof window.getGoalValueData === 'function') return window.getGoalValueData();
    try { return JSON.parse(localStorage.getItem('goalValueData') || '{}'); } catch(e){ return {}; }
  }
  function safeSetGoalValueData(obj) {
    if (typeof window.setGoalValueData === 'function') { window.setGoalValueData(obj); return; }
    try { localStorage.setItem('goalValueData', JSON.stringify(obj)); } catch(e) {}
  }
  function safeGetGoalValueBottom() {
    if (typeof window.getGoalValueBottom === 'function') return window.getGoalValueBottom();
    try { return JSON.parse(localStorage.getItem('goalValueBottom') || '[]'); } catch(e){ return []; }
  }
  function safeSetGoalValueBottom(arr) {
    if (typeof window.setGoalValueBottom === 'function') { window.setGoalValueBottom(arr); return; }
    try { localStorage.setItem('goalValueBottom', JSON.stringify(arr)); } catch(e) {}
  }
  function safeComputeValueForPlayer(name) {
    if (typeof window.computeValueForPlayer === 'function') return window.computeValueForPlayer(name);
    const data = safeGetGoalValueData(); const bottom = safeGetGoalValueBottom();
    const vals = (data[name] && Array.isArray(data[name])) ? data[name] : [];
    let sum = 0;
    for (let i = 0; i < bottom.length; i++) {
      sum += (Number(vals[i] || 0) || 0) * (Number(bottom[i] || 0) || 0);
    }
    return sum;
  }

  // Move columns MVP Points & MVP to the end (MVP last)
  function moveSeasonColumnsToEnd() {
    const container = document.getElementById('seasonContainer');
    if (!container) return;
    const table = container.querySelector('table.stats-table');
    if (!table) return;
    const thead = table.tHead;
    if (!thead) return;
    const headerRow = thead.rows[0];
    const headerTextArray = Array.from(headerRow.cells).map(h => (h.textContent||'').trim().toLowerCase());

    // find indices by matching substrings
    const findIndex = (token) => {
      token = token.toLowerCase();
      let idx = headerTextArray.indexOf(token);
      if (idx !== -1) return idx;
      idx = headerTextArray.findIndex(h => h.includes(token));
      return idx;
    };

    const idxMvpPoints = findIndex('mvp points');
    const idxMvp = findIndex('mvp');

    // Move by header cell element (handles shifting indices)
    const moveHeaderToEnd = (token) => {
      const th = Array.from(headerRow.cells).find(h => (h.textContent||'').toLowerCase().includes(token.toLowerCase()));
      if (!th) return;
      headerRow.appendChild(th);
    };

    // If both present, move MVP Points first, then MVP
    if (idxMvpPoints !== -1) moveHeaderToEnd('mvp points');
    if (idxMvp !== -1) moveHeaderToEnd('mvp');

    // Now fix every tbody row by moving the corresponding td identified by original snapshot
    const tbody = table.tBodies[0];
    if (!tbody) return;

    // create snapshot of original header texts (before moves) to identify which column to move per row
    // We'll attempt to detect moved header via matching text in the pre-move snapshot; if snapshot isn't available, fallback by counting columns
    const snapshot = headerTextArray.slice();

    const moveColumnByHeaderText = (token) => {
      token = token.toLowerCase();
      // find original index in snapshot
      let origIdx = snapshot.findIndex(h => h.includes(token));
      // if not found, try current header index (last occurrence)
      if (origIdx === -1) {
        const curIdx = Array.from(headerRow.cells).findIndex(h => (h.textContent||'').toLowerCase().includes(token));
        if (curIdx !== -1) origIdx = curIdx;
      }
      if (origIdx === -1) return;
      // For each row, if it has a cell at origIdx, append it (move to end)
      Array.from(tbody.rows).forEach(row => {
        if (row.cells.length > origIdx) {
          row.appendChild(row.cells[origIdx]);
        } else {
          // best-effort: try to find by aria-label / data-col
          const candidate = Array.from(row.cells).find(c => {
            const meta = (c.getAttribute('data-col')||c.getAttribute('aria-label')||'').toLowerCase();
            return meta && meta.includes(token);
          });
          if (candidate) row.appendChild(candidate);
        }
      });
    };

    if (idxMvpPoints !== -1) moveColumnByHeaderText('mvp points');
    if (idxMvp !== -1) moveColumnByHeaderText('mvp');
  }

  // Enhance Goal Value table: striped rows + click/dblclick editing
  function enhanceGoalValueTable() {
    const container = document.getElementById('goalValueContainer');
    if (!container) return;
    const table = container.querySelector('table.goalvalue-table');
    if (!table) return;

    // Add a class for CSS styling if not present
    table.classList.add('goal-value-table');
    // Apply alternating row classes for existing rows
    Array.from(table.tBodies[0].rows).forEach((row, i) => {
      row.classList.remove('odd-row','even-row');
      row.classList.add((i % 2 === 0) ? 'even-row' : 'odd-row');
    });

    // Determine columns: first col is player, last col is computed value, opponent columns are middle
    const thead = table.tHead;
    const headerCells = thead ? Array.from(thead.rows[0].cells) : [];
    const oppCount = Math.max(0, headerCells.length - 2); // subtract Spieler + Value

    // player rows -> for each opponent cell: replace input (if any) with span and attach click/dblclick
    const tbody = table.tBodies[0];
    if (!tbody) return;

    // bottom (scale) row is the last row in tbody (app.js renders bottomRow appended last)
    const rows = Array.from(tbody.rows);
    if (rows.length === 0) return;
    const bottomRow = rows[rows.length - 1];

    // create goalValueOptions from existing selects if present (fallback to 0..5 step 0.5)
    let goalValueOptions = [];
    // try to read from bottomRow selects
    const selectsInBottom = Array.from(bottomRow.querySelectorAll('select'));
    if (selectsInBottom.length) {
      goalValueOptions = Array.from(selectsInBottom[0].options).map(o => o.value);
    } else {
      for (let v = 0; v <= 10; v++) goalValueOptions.push((v*0.5).toFixed(1));
    }

    // Helper to update computed value cell for a player
    const updateComputedCell = (playerName, cellEl) => {
      const val = safeComputeValueForPlayer(playerName);
      if (cellEl) cellEl.textContent = (Math.abs(val - Math.round(val)) < 0.0001) ? String(Math.round(val)) : String(Number(val.toFixed(1)));
    };

    // For each player row (all except bottomRow)
    rows.slice(0, rows.length - 1).forEach(row => {
      const nameCell = row.cells[0];
      const playerName = (nameCell && nameCell.textContent) ? nameCell.textContent.trim() : '';
      // opponent columns cells are 1..(oppCount)
      for (let ci = 1; ci <= oppCount; ci++) {
        const td = row.cells[ci];
        if (!td) continue;
        // If cell contains an <input>, replace with a span that displays the value
        const input = td.querySelector('input');
        const curVal = input ? (input.value || '0') : (td.textContent || '0');
        td.innerHTML = ''; // clear
        const span = document.createElement('span');
        span.className = 'gv-cell';
        span.style.display = 'inline-block';
        span.style.minWidth = '56px';
        span.style.textAlign = 'center';
        span.textContent = String(curVal);
        td.appendChild(span);

        // click => increment by 1 (and save)
        span.addEventListener('click', (ev) => {
          ev.preventDefault();
          let v = Number(span.textContent) || 0;
          v = v + 1;
          span.textContent = String(v);
          // update storage
          const all = safeGetGoalValueData();
          if (!all[playerName]) all[playerName] = Array(oppCount).fill(0);
          all[playerName][ci - 1] = v;
          safeSetGoalValueData(all);
          // update computed value
          const computedCell = row.cells[row.cells.length - 1];
          updateComputedCell(playerName, computedCell);
        });

        // dblclick => open inline number editor
        span.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          if (td.querySelector('input.inline-editor')) return;
          const cur = span.textContent || '0';
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.className = 'inline-editor';
          inp.value = String(cur);
          inp.style.minWidth = '56px';
          td.innerHTML = '';
          td.appendChild(inp);
          inp.focus(); inp.select();
          const commit = () => {
            let nv = inp.value || '0';
            nv = Number(nv) || 0;
            span.textContent = String(nv);
            td.innerHTML = '';
            td.appendChild(span);
            const all = safeGetGoalValueData();
            if (!all[playerName]) all[playerName] = Array(oppCount).fill(0);
            all[playerName][ci - 1] = nv;
            safeSetGoalValueData(all);
            const computedCell = row.cells[row.cells.length - 1];
            updateComputedCell(playerName, computedCell);
          };
          const cancel = () => { td.innerHTML = ''; td.appendChild(span); };
          inp.addEventListener('blur', commit);
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { commit(); }
            else if (e.key === 'Escape') { cancel(); }
          });
        });
      }
    });

    // Replace bottomRow select elements with clickable spans (for scale)
    // bottomRow cells: first cell is label, middle cells are selects, last cell empty
    const bottomCells = Array.from(bottomRow.cells);
    bottomCells.forEach((td, idx) => {
      // skip first label cell and last value cell
      if (idx === 0 || idx === bottomCells.length - 1) return;
      const sel = td.querySelector('select');
      const curVal = sel ? (sel.value || goalValueOptions[0]) : (td.textContent || goalValueOptions[0]);
      td.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'gv-scale';
      span.style.display = 'inline-block';
      span.style.minWidth = '56px';
      span.style.textAlign = 'center';
      span.style.fontWeight = '700';
      span.textContent = String(curVal);
      td.appendChild(span);

      // click: cycle through goalValueOptions
      span.addEventListener('click', () => {
        let i = goalValueOptions.indexOf(String(span.textContent));
        if (i === -1) i = 0;
        i = (i + 1) % goalValueOptions.length;
        const nv = goalValueOptions[i];
        span.textContent = nv;
        // persist in storage bottom array at position (idx-1)
        const bottom = safeGetGoalValueBottom();
        while (bottom.length < oppCount) bottom.push(0);
        bottom[idx - 1] = Number(nv);
        safeSetGoalValueBottom(bottom);
        // update all computed cells
        rows.slice(0, rows.length - 1).forEach(r => {
          const pname = (r.cells[0] && r.cells[0].textContent) ? r.cells[0].textContent.trim() : '';
          const computedCell = r.cells[r.cells.length - 1];
          updateComputedCell(pname, computedCell);
        });
      });

      // dblclick: inline number editor for precise set
      span.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        if (td.querySelector('input.inline-editor')) return;
        const cur = span.textContent || '0';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'inline-editor';
        inp.value = String(cur);
        inp.style.minWidth = '56px';
        td.innerHTML = '';
        td.appendChild(inp);
        inp.focus(); inp.select();
        const commit = () => {
          const nv = Number(inp.value) || 0;
          td.innerHTML = '';
          span.textContent = String(nv);
          td.appendChild(span);
          const bottom = safeGetGoalValueBottom();
          while (bottom.length < oppCount) bottom.push(0);
          bottom[idx - 1] = nv;
          safeSetGoalValueBottom(bottom);
          rows.slice(0, rows.length - 1).forEach(r => {
            const pname = (r.cells[0] && r.cells[0].textContent) ? r.cells[0].textContent.trim() : '';
            const computedCell = r.cells[r.cells.length - 1];
            updateComputedCell(pname, computedCell);
          });
        };
        const cancel = () => { td.innerHTML = ''; td.appendChild(span); };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') cancel();
        });
      });
    });

    // ensure the computed value cells refresh visually right now
    rows.slice(0, rows.length - 1).forEach(r => {
      const pname = (r.cells[0] && r.cells[0].textContent) ? r.cells[0].textContent.trim() : '';
      const computedCell = r.cells[r.cells.length - 1];
      updateComputedCell(pname, computedCell);
    });
  }

  // Observe mutations: when season table or goalValue table are (re)rendered, apply fixes
  function setupObservers() {
    const root = document.body;
    const mo = new MutationObserver((mutations) => {
      // small debounce
      if (setupObservers._timer) clearTimeout(setupObservers._timer);
      setupObservers._timer = setTimeout(() => {
        moveSeasonColumnsToEnd();
        enhanceGoalValueTable();
      }, 120);
    });
    mo.observe(root, { childList: true, subtree: true, attributes: false });
    // ensure initial run
    setTimeout(() => { moveSeasonColumnsToEnd(); enhanceGoalValueTable(); }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObservers);
  } else {
    setupObservers();
  }

  // expose manual API
  window._seasonTablePatch_moveCols = moveSeasonColumnsToEnd;
  window._seasonTablePatch_enhanceGoalValue = enhanceGoalValueTable;
})();
