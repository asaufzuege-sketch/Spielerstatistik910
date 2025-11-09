// season_map_momentum.js
// Option B (periods run from 20 down to 0 inside each period); full-width 0..60 timeline.
// Update: first plotted bucket is exactly at 0, last at 60 (so the chart spans the full time).
// Major ticks at 0 / 20 / 40 / 60 are longer and labels are larger & bold white under the white line.
// Keeps localStorage-first reading, DOM fallback, reset clearing, smoothing, etc.

(function () {
  const SVG_W = 900;
  const SVG_H = 220;
  const MARGIN = { left: 32, right: 32, top: 20, bottom: 36 };
  const TOP_GUIDE_Y = 28;    // white labeled line (labels will be drawn below this line)
  const MIDLINE_Y = 120;     // baseline (momentum = 0)
  const BOTTOM_GUIDE_Y = 196;
  const MAX_DISPLAY = 6;

  // NEW: place the 12 UI buckets exactly spanning 0..60
  // UI order per period: [19-15, 14-10, 9-5, 4-0]
  // Map them left->right across the whole 0..60 span so first maps to 0 and last to 60
  // 12 values -> we use these minute positions (0..60) so first peak is exactly at 0, last at 60
  const BUCKET_MINUTES = [0,5,10,15, 20,25,30,35, 40,45,50,60];

  function getSeasonMapRoot() { return document.getElementById('seasonMapPage') || document.body; }
  function getTimeBoxElement() {
    const candidates = ['seasonMapTimeTrackingBox','seasonTimeTrackingBox','timeTrackingBox'];
    for (const id of candidates) {
      const el = document.getElementById(id);
      if (el) return el;
    }
    return null;
  }
  function hideTimeBox() { const tb = getTimeBoxElement(); if (tb) tb.style.display = 'none'; }

  // Read localStorage export fallback (supports array and object shapes)
  function readFromLocalStorageFallback() {
    try {
      const raw = localStorage.getItem('seasonMapTimeData') || localStorage.getItem('timeData') || null;
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      const keys = Object.keys(obj).sort();
      const periods = [];
      for (let k = 0; k < keys.length && periods.length < 3; k++) {
        const val = obj[keys[k]];
        let scored = [], conceded = [];
        if (Array.isArray(val)) {
          const arr = val;
          if (arr.length >= 8) {
            scored = arr.slice(0,4).map(v => Number(v||0)||0);
            conceded = arr.slice(4,8).map(v => Number(v||0)||0);
          } else if (arr.length >= 4) {
            scored = arr.slice(0,4).map(v => Number(v||0)||0);
            conceded = [0,0,0,0];
          } else {
            scored = [0,0,0,0]; conceded = [0,0,0,0];
          }
        } else if (val && typeof val === 'object') {
          // map-like: numeric keys possibly 0..7
          const flat = [];
          for (let i = 0; i < 8; i++) flat.push(Number(val[String(i)] || 0));
          scored = flat.slice(0,4);
          conceded = flat.slice(4,8);
        } else {
          scored = [0,0,0,0]; conceded = [0,0,0,0];
        }
        // keep UI order as read (19-15,14-10,9-5,4-0)
        periods.push({ scored: scored.slice(), conceded: conceded.slice() });
      }
      while (periods.length < 3) periods.push({ scored: [0,0,0,0], conceded: [0,0,0,0] });
      return periods.slice(0,3);
    } catch (e) {
      console.warn('[momentum] readFromLocalStorageFallback parse error', e);
      return null;
    }
  }

  // Read from DOM timebox (returns arrays in UI order per period: [19-15,14-10,9-5,4-0])
  function readPeriodsFromDOM() {
    const box = getTimeBoxElement();
    if (!box) return null;
    const periodEls = Array.from(box.querySelectorAll('.period'));
    if (!periodEls.length) return null;
    const periods = [];
    for (let i = 0; i < periodEls.length && periods.length < 3; i++) {
      const pEl = periodEls[i];
      const topBtns = Array.from(pEl.querySelectorAll('.period-buttons.top-row .time-btn'));
      const bottomBtns = Array.from(pEl.querySelectorAll('.period-buttons.bottom-row .time-btn'));
      let scored = [], conceded = [];
      if (topBtns.length >= 4 && bottomBtns.length >= 4) {
        scored = topBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
        conceded = bottomBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
      } else {
        const allBtns = Array.from(pEl.querySelectorAll('.time-btn'));
        if (allBtns.length >= 8) {
          scored = allBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
          conceded = allBtns.slice(4,8).map(b => Number(b.textContent || 0) || 0);
        } else if (allBtns.length >= 4) {
          scored = allBtns.slice(0,4).map(b => Number(b.textContent || 0) || 0);
          conceded = [0,0,0,0];
        } else {
          scored = [0,0,0,0]; conceded = [0,0,0,0];
        }
      }
      periods.push({ scored: scored.slice(), conceded: conceded.slice() });
    }
    while (periods.length < 3) periods.push({ scored: [0,0,0,0], conceded: [0,0,0,0] });
    return periods.slice(0,3);
  }

  function hasNonZero(periods) {
    try { return periods.some(p => (p.scored.concat(p.conceded)).some(v => Number(v) !== 0)); } catch(e) { return false; }
  }

  // Prefer localStorage if it contains non-zero values (export case), otherwise DOM
  function readPeriods() {
    const ls = readFromLocalStorageFallback();
    if (ls && hasNonZero(ls)) { console.debug('[momentum] using localStorage periods'); return ls; }
    const dom = readPeriodsFromDOM();
    if (dom && hasNonZero(dom)) { console.debug('[momentum] using DOM periods'); return dom; }
    if (dom) { console.debug('[momentum] DOM present but zero; using DOM'); return dom; }
    if (ls) { console.debug('[momentum] localStorage present but DOM absent; using localStorage'); return ls; }
    console.debug('[momentum] no periods found; returning zeros');
    return [{ scored:[0,0,0,0], conceded:[0,0,0,0] },{ scored:[0,0,0,0], conceded:[0,0,0,0] },{ scored:[0,0,0,0], conceded:[0,0,0,0] }];
  }

  // Build 12 values in UI order (index 0..11 corresponds to UI bucket sequence P1: 19-15..4-0, P2..., P3...)
  function build12Values(periods) {
    const vals = [];
    for (let p = 0; p < 3; p++) {
      const period = periods[p] || { scored:[0,0,0,0], conceded:[0,0,0,0] };
      for (let b = 0; b < 4; b++) {
        const s = Number(period.scored[b] || 0) || 0;
        const c = Number(period.conceded[b] || 0) || 0;
        vals.push(s - c);
      }
    }
    return vals;
  }

  function catmullRom2bezier(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
    const p = [];
    p.push(points[0]);
    for (let i=0;i<points.length;i++) p.push(points[i]);
    p.push(points[points.length-1]);
    let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let i=1;i<p.length-2;i++) {
      const p0 = p[i-1], p1 = p[i], p2 = p[i+1], p3 = p[i+2];
      const b1x = p1.x + (p2.x - p0.x)/6;
      const b1y = p1.y + (p2.y - p0.y)/6;
      const b2x = p2.x - (p3.x - p1.x)/6;
      const b2y = p2.y - (p3.y - p1.y)/6;
      d += ` C ${b1x.toFixed(2)} ${b1y.toFixed(2)}, ${b2x.toFixed(2)} ${b2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function minuteToX(minute) {
    const usableW = SVG_W - MARGIN.left - MARGIN.right;
    const m = Math.max(0, Math.min(60, minute));
    return MARGIN.left + (m/60) * usableW;
  }
  function valueToY(v, maxScale) {
    const t = v / maxScale;
    const topSpace = MIDLINE_Y - TOP_GUIDE_Y;
    return MIDLINE_Y - t * topSpace;
  }

  function renderSeasonMomentumGraphic() {
    const root = getSeasonMapRoot();
    if (!root) return;
    hideTimeBox();

    let container = root.querySelector('#seasonMapMomentumContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'seasonMapMomentumContainer';
      container.style.marginTop = '12px';
      container.style.padding = '8px 12px';
      container.style.boxSizing = 'border-box';
      container.style.position = 'relative';
      root.appendChild(container);
    }
    container.innerHTML = '';

    const periods = readPeriods();
    const values12 = build12Values(periods);
    console.debug('[momentum] periods used for rendering:', periods);
    console.debug('[momentum] computed values12:', values12);

    const absMax = Math.max(1, ...values12.map(v => Math.abs(v)));
    const maxScale = Math.max(absMax, MAX_DISPLAY);

    // map each UI bucket index to minute using BUCKET_MINUTES, then build chronological list
    const pts = values12.map((v,i) => {
      const minute = BUCKET_MINUTES[i];
      const x = minuteToX(minute);
      const y = valueToY(v, maxScale);
      return { idx: i, minute, x, y, v };
    });

    // chronological order left->right (by minute)
    const chron = pts.slice().sort((a,b) => a.minute - b.minute);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS,'svg');
    svg.setAttribute('width','100%');
    svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    svg.style.display = 'block';

    // top white guide-line and labels 0..60 every 5 minutes (labels UNDER the white line, centered)
    const topLineX1 = minuteToX(0);
    const topLineX2 = minuteToX(60);
    const topLine = document.createElementNS(svgNS,'line');
    topLine.setAttribute('x1', topLineX1);
    topLine.setAttribute('x2', topLineX2);
    topLine.setAttribute('y1', TOP_GUIDE_Y);
    topLine.setAttribute('y2', TOP_GUIDE_Y);
    topLine.setAttribute('stroke', '#ffffff');
    topLine.setAttribute('stroke-width', '3');
    svg.appendChild(topLine);

    // tick lengths
    const majorTickLen = 18; // for 0,20,40,60 (bigger)
    const minorTickLen = 8;  // for other 5-min ticks
    const majorSet = new Set([0,20,40,60]);

    for (let t=0;t<=60;t+=5) {
      const x = minuteToX(t);
      const isMajor = majorSet.has(t);
      const topY = TOP_GUIDE_Y - (isMajor ? majorTickLen : minorTickLen);
      const botY = TOP_GUIDE_Y + (isMajor ? majorTickLen : minorTickLen);
      const tick = document.createElementNS(svgNS,'line');
      tick.setAttribute('x1', x); tick.setAttribute('x2', x);
      tick.setAttribute('y1', topY); tick.setAttribute('y2', botY);
      tick.setAttribute('stroke', '#cccccc'); tick.setAttribute('stroke-width', isMajor ? '1.6' : '1.0');
      svg.appendChild(tick);
      // numeric label placed UNDER the white line (so the number appears below the line)
      const txt = document.createElementNS(svgNS,'text');
      txt.setAttribute('x', x);
      // y = TOP_GUIDE_Y + offset -> placed under the white line; increase offset for major ticks a bit to avoid overlap
      txt.setAttribute('y', TOP_GUIDE_Y + (isMajor ? 22 : 14));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-family', 'Segoe UI, Roboto, Arial');
      txt.setAttribute('font-size', isMajor ? '13' : '11');
      txt.setAttribute('fill', '#ffffff'); // white numbers
      txt.setAttribute('font-weight', isMajor ? '800' : '700');
      txt.textContent = String(t);
      svg.appendChild(txt);
    }

    // baseline and bottom guide (span exact 0..60)
    const midLine = document.createElementNS(svgNS,'line');
    midLine.setAttribute('x1', minuteToX(0)); midLine.setAttribute('x2', minuteToX(60));
    midLine.setAttribute('y1', MIDLINE_Y); midLine.setAttribute('y2', MIDLINE_Y);
    midLine.setAttribute('stroke', '#7a7a7a'); midLine.setAttribute('stroke-width', '3');
    svg.appendChild(midLine);

    const bottomLine = document.createElementNS(svgNS,'line');
    bottomLine.setAttribute('x1', minuteToX(0)); bottomLine.setAttribute('x2', minuteToX(60));
    bottomLine.setAttribute('y1', BOTTOM_GUIDE_Y); bottomLine.setAttribute('y2', BOTTOM_GUIDE_Y);
    bottomLine.setAttribute('stroke', '#d6d6d6'); bottomLine.setAttribute('stroke-width', '2');
    svg.appendChild(bottomLine);

    // Build pos/neg arrays and area paths using chronological points
    const posPts = chron.map(p => ({ x: p.x, y: p.v > 0 ? p.y : MIDLINE_Y }));
    const negPts = chron.map(p => ({ x: p.x, y: p.v < 0 ? p.y : MIDLINE_Y }));

    const posD = catmullRom2bezier(posPts);
    const negD = catmullRom2bezier(negPts);

    if (values12.some(v => v > 0)) {
      const closed = posD + ` L ${chron[chron.length-1].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} L ${chron[0].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} Z`;
      const pathPos = document.createElementNS(svgNS,'path');
      pathPos.setAttribute('d', closed);
      pathPos.setAttribute('fill', '#1fb256');
      pathPos.setAttribute('stroke', '#7a7a7a');
      pathPos.setAttribute('stroke-width', '0.9');
      pathPos.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pathPos);
    }
    if (values12.some(v => v < 0)) {
      const closed = negD + ` L ${chron[chron.length-1].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} L ${chron[0].x.toFixed(2)} ${MIDLINE_Y.toFixed(2)} Z`;
      const pathNeg = document.createElementNS(svgNS,'path');
      pathNeg.setAttribute('d', closed);
      pathNeg.setAttribute('fill', '#f07d7d');
      pathNeg.setAttribute('stroke', '#7a7a7a');
      pathNeg.setAttribute('stroke-width', '0.9');
      pathNeg.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(pathNeg);
    }

    // Outline curve using chronological points' x,y
    const outlineD = catmullRom2bezier(chron.map(p => ({ x: p.x, y: p.y })));
    const outline = document.createElementNS(svgNS,'path');
    outline.setAttribute('d', outlineD);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', '#666');
    outline.setAttribute('stroke-width', '2.2');
    outline.setAttribute('stroke-linejoin', 'round');
    outline.setAttribute('stroke-linecap', 'round');
    svg.appendChild(outline);

    // Small markers for each point (visibility) - can be removed later
    chron.forEach(p => {
      const c = document.createElementNS(svgNS,'circle');
      c.setAttribute('cx', p.x.toFixed(2));
      c.setAttribute('cy', valueToY(p.v, maxScale).toFixed(2));
      c.setAttribute('r', '3');
      c.setAttribute('fill', p.v >= 0 ? '#0a8f45' : '#c84b4b');
      c.setAttribute('opacity', '0.95');
      svg.appendChild(c);
    });

    container.appendChild(svg);

    console.info('[momentum] rendered chart; mapping (UI bucket -> minute):', BUCKET_MINUTES, 'values12:', values12, 'maxScale:', maxScale);
  }

  // On reset: clear the seasonMapTimeData/seasonMapMarkers keys (so chart really clears),
  // then re-render. Also listen to storage events.
  function setupAutoUpdate() {
    const clearLSOnReset = () => {
      try {
        localStorage.removeItem('seasonMapTimeData');
        localStorage.removeItem('seasonMapMarkers');
      } catch (e) {}
      setTimeout(() => renderSeasonMomentumGraphic(), 140);
    };

    ['resetSeasonMapBtn','resetTorbildBtn','resetBtn'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', clearLSOnReset);
    });
    document.addEventListener('click', (e) => {
      const id = e?.target?.id;
      if (id === 'resetSeasonMapBtn' || id === 'resetTorbildBtn' || id === 'resetBtn') clearLSOnReset();
    }, true);

    window.addEventListener('storage', (e) => {
      if (!e) return;
      if (e.key && /seasonMapTimeData|timeData|seasonMapMarkers/i.test(e.key)) {
        setTimeout(() => renderSeasonMomentumGraphic(), 100);
      }
    });

    const tb = getTimeBoxElement();
    if (!tb) {
      const root = getSeasonMapRoot();
      const mo = new MutationObserver(() => {
        if (getTimeBoxElement()) {
          mo.disconnect();
          setupAutoUpdate();
          renderSeasonMomentumGraphic();
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      return;
    }

    hideTimeBox();
    renderSeasonMomentumGraphic();

    const mo2 = new MutationObserver((muts) => {
      let changed = false;
      for (const m of muts) {
        if (m.type === 'characterData' || m.type === 'childList' || m.type === 'attributes') { changed = true; break; }
      }
      if (changed) {
        if (setupAutoUpdate._timer) clearTimeout(setupAutoUpdate._timer);
        setupAutoUpdate._timer = setTimeout(() => renderSeasonMomentumGraphic(), 120);
      }
    });
    mo2.observe(tb, { subtree: true, characterData: true, childList: true, attributes: true });

    tb.addEventListener('click', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('time-btn')) {
        setTimeout(() => renderSeasonMomentumGraphic(), 120);
      }
    }, true);
  }

  // expose helpers
  window.renderSeasonMomentumGraphic = renderSeasonMomentumGraphic;
  window._seasonMomentum_readPeriods = readPeriods;
  window._seasonMomentum_build12 = build12Values;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAutoUpdate);
  } else {
    setupAutoUpdate();
  }
})();
