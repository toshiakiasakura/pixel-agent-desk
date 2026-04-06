const state = {
  agents: new Map(),
  agentHistory: new Map(),
  stats: { total: 0, active: 0, completed: 0, totalTokens: 0, totalCost: 0, errorCount: 0 },
  connected: false,
  currentView: localStorage.getItem('mc-view') || 'office',
  settings: null,
};

const DOM = {
  statusIndicator: document.getElementById('statusIndicator'),
  connectionStatus: document.getElementById('connectionStatus'),
  agentPanel: document.getElementById('agentPanel'),
  standbyMessage: document.getElementById('standbyMessage'),
  kpiActiveAgents: document.getElementById('kpiActiveAgents'),
  kpiTotalAgents: document.getElementById('kpiTotalAgents'),
  kpiTokens: document.getElementById('kpiTokens'),
  kpiCost: document.getElementById('kpiCost'),
  kpiErrors: document.getElementById('kpiErrors')
};

// ─── SSE CONNECTION ───
let sseDelay = 1000;
let sseSource = null;

function connectSSE() {
  if (sseSource) { sseSource.close(); sseSource = null; }
  const es = new EventSource('/api/events');
  sseSource = es;

  es.onopen = () => {
    sseDelay = 1000;
    state.connected = true;
    updateConnectionStatus(true);
  };

  es.onerror = () => {
    state.connected = false;
    updateConnectionStatus(false);
    es.close();
    sseSource = null;
    setTimeout(connectSSE, sseDelay);
    sseDelay = Math.min(sseDelay * 2, 30000);
  };

  es.addEventListener('connected', () => fetchInitialData());
  es.addEventListener('agent.created', e => { const d = JSON.parse(e.data).data; updateAgent(d); if (typeof officeOnAgentCreated === 'function') officeOnAgentCreated(d); });
  es.addEventListener('agent.updated', e => { const d = JSON.parse(e.data).data; updateAgent(d); if (typeof officeOnAgentUpdated === 'function') officeOnAgentUpdated(d); });
  es.addEventListener('agent.removed', e => { const d = JSON.parse(e.data).data; removeAgent(d.id); if (typeof officeOnAgentRemoved === 'function') officeOnAgentRemoved(d); });
}

async function fetchInitialData() {
  try {
    const res = await fetch('/api/agents');
    const ags = await res.json();
    for (const a of ags) {
      state.agents.set(a.id, a);
      // Seed timeline history
      if (!state.agentHistory.has(a.id)) {
        state.agentHistory.set(a.id, [{ state: a.status, ts: Date.now() }]);
      }
    }
    recalcStats();
    renderAgentList();
  } catch (e) {
    console.error('Data fetch error:', e);
  }
}

function updateAgent(ag) {
  if (ag.status === 'error') state.stats.errorCount++;
  state.agents.set(ag.id, ag);

  // Track state history for timeline
  const hist = state.agentHistory.get(ag.id) || [];
  const last = hist.length > 0 ? hist[hist.length - 1] : null;
  if (!last || last.state !== ag.status) {
    hist.push({ state: ag.status, ts: Date.now() });
    state.agentHistory.set(ag.id, hist);
  }

  recalcStats();
  updateAgentUI(ag);
}

function removeAgent(id) {
  state.agents.delete(id);
  state.agentHistory.delete(id);
  recalcStats();
  const el = DOM.agentPanel.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  if (state.agents.size === 0) DOM.standbyMessage.style.display = 'block';
}

// ─── UTILS ───
const formatNum = n => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
};

function recalcStats() {
  const arr = Array.from(state.agents.values());
  state.stats.total = arr.length;
  state.stats.active = arr.filter(a => ['working', 'thinking'].includes(a.status)).length;
  state.stats.totalTokens = arr.reduce((s, a) => s + ((a.tokenUsage?.inputTokens || 0) + (a.tokenUsage?.outputTokens || 0)), 0);
  state.stats.totalCost = arr.reduce((s, a) => s + (a.tokenUsage?.estimatedCost || 0), 0);

  DOM.kpiActiveAgents.innerHTML = `${state.stats.active} <span style="font-size:0.8rem;color:var(--color-text-dark)">/ ${state.stats.total}</span>`;
  DOM.kpiTokens.textContent = formatNum(state.stats.totalTokens);
  DOM.kpiCost.textContent = `$${state.stats.totalCost.toFixed(2)}`;
  DOM.kpiErrors.textContent = state.stats.errorCount.toString();
  if (state.stats.errorCount > 0) DOM.kpiErrors.className = 'kpi-value error';
}

function updateConnectionStatus(up) {
  const b = document.getElementById('disconnectBanner');
  if (up) {
    DOM.statusIndicator.className = 'status-dot connected';
    DOM.connectionStatus.textContent = 'Gateway Online';
    if (b) b.style.display = 'none';
  } else {
    DOM.statusIndicator.className = 'status-dot disconnected';
    DOM.connectionStatus.textContent = 'Disconnected';
    if (b) b.style.display = 'block';
  }
}

// ─── RENDER AGENTS ───
function renderAgentList() {
  if (state.agents.size === 0) {
    DOM.standbyMessage.style.display = 'block';
    return;
  }
  DOM.standbyMessage.style.display = 'none';
  for (const [id, ag] of state.agents) updateAgentUI(ag);
}

function updateAgentUI(ag) {
  DOM.standbyMessage.style.display = 'none';
  const existing = DOM.agentPanel.querySelector(`[data-id="${ag.id}"]`);

  const stClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(ag.status) ? ag.status : 'waiting';
  const stText = ag.status.toUpperCase();
  const typeHtml = ag.metadata?.isSubagent ? '<span class="mc-type-badge">SUB</span>' : '<span class="mc-type-badge main">MAIN</span>';

  const isAct = ['working', 'thinking'].includes(stClass);
  const actText = ag.currentTool ? `<span class="hl">${ag.currentTool}</span>` : (isAct ? stText : 'Idling...');

  const tokens = formatNum((ag.tokenUsage?.inputTokens || 0) + (ag.tokenUsage?.outputTokens || 0));
  const cost = (ag.tokenUsage?.estimatedCost || 0).toFixed(4);

  const ctxPct = ag.tokenUsage?.contextPercent;
  const hasCtx = ctxPct != null;
  const ctxColor = !hasCtx ? '' : ctxPct > 85 ? 'ctx-high' : ctxPct > 60 ? 'ctx-mid' : 'ctx-low';
  const ctxValText = hasCtx ? `~${ctxPct}%` : '--';

  // Build timeline segments
  const hist = state.agentHistory.get(ag.id) || [];
  let timelineHtml = '';
  if (hist.length > 0) {
    const now = Date.now();
    const segs = hist.map((h, i) => {
      const end = (i + 1 < hist.length) ? hist[i + 1].ts : now;
      const dur = Math.max(end - h.ts, 1);
      return { state: h.state, dur };
    });
    const segHtml = segs.map(s =>
      `<div class="mc-timeline-seg" style="flex-grow:${s.dur};background:${getStateColor(s.state)}" title="${s.state}"></div>`
    ).join('');
    timelineHtml = `<div class="mc-timeline">${segHtml}</div>`;
  }

  const html = `
    <div class="mc-agent-header">
      <div class="mc-agent-name">${ag.name || 'Agent'} ${typeHtml}</div>
      <div class="mc-agent-status ${stClass}">${stText}</div>
    </div>
    <div class="mc-agent-activity">CMD> ${actText}</div>
    ${timelineHtml}
    <div class="mc-agent-metrics">
      <span>TX: <span class="mc-metric-val">${tokens}</span> tok</span>
      <span>$<span class="mc-metric-val">${cost}</span></span>
    </div>
    <div class="mc-context-gauge" title="Approximate context window usage (estimated from input tokens)">
      <span class="ctx-label">~ctx</span>
      <div class="ctx-track"><div class="ctx-fill ${ctxColor}" style="width:${hasCtx ? ctxPct : 0}%"></div></div>
      <span class="ctx-val">${ctxValText}</span>
    </div>
  `;

  if (existing) {
    existing.innerHTML = html;
  } else {
    const div = document.createElement('div');
    div.className = 'mc-agent-card';
    div.dataset.id = ag.id;
    div.innerHTML = html;
    DOM.agentPanel.appendChild(div);
  }
}

// ─── TIMELINE STATE COLORS ───
function getStateColor(status) {
  const map = {
    working: 'var(--color-state-working)',
    thinking: 'var(--color-state-thinking)',
    waiting: 'var(--color-state-waiting)',
    done: 'var(--color-state-done)',
    completed: 'var(--color-state-done)',
    error: 'var(--color-state-error)',
  };
  return map[status] || 'var(--color-state-waiting)';
}

// ─── OFFICE CHARACTER CLICK POPOVER ───
const popoverEl = document.getElementById('officePopover');

function hitTestOfficeCharacter(canvas, event) {
  if (typeof officeCharacters === 'undefined') return null;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  // Convert screen → canvas pixels, then undo the zoom transform
  const rawX = (event.clientX - rect.left) * scaleX;
  const rawY = (event.clientY - rect.top) * scaleY;
  const zoom = (typeof officeRenderer !== 'undefined' && officeRenderer.zoom) || 1.0;
  const panX = (typeof officeRenderer !== 'undefined' && officeRenderer.panX) || 0;
  const panY = (typeof officeRenderer !== 'undefined' && officeRenderer.panY) || 0;
  const originX = canvas.width / 2;
  const originY = canvas.height / 2;
  const cx = originX + (rawX - panX - originX) / zoom;
  const cy = originY + (rawY - panY - originY) / zoom;

  const chars = officeCharacters.getCharacterArray();
  // Reverse Y-sort: topmost (highest y) rendered last, so check first
  const sorted = [...chars].sort((a, b) => b.y - a.y);

  const FW = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_W) || 48;
  const FH = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_H) || 64;

  for (const ch of sorted) {
    const left = ch.x - FW / 2;
    const top = ch.y - FH;
    if (cx >= left && cx <= left + FW && cy >= top && cy <= top + FH) {
      return ch;
    }
  }
  return null;
}

function showOfficePopover(canvas, char) {
  const ag = state.agents.get(char.id);
  const name = char.role || (ag && ag.name) || 'Agent';
  const status = (ag && ag.status) || char.agentState || 'idle';
  const stClass = ['working', 'thinking', 'error', 'done', 'completed'].includes(status) ? status : 'waiting';
  const project = (ag && ag.metadata && ag.metadata.projectSlug) || char.metadata?.project || '-';
  const tool = (ag && ag.currentTool) || char.metadata?.tool || '-';
  const model = (ag && ag.model) || '-';
  const inputTok = (ag && ag.tokenUsage?.inputTokens) || 0;
  const outputTok = (ag && ag.tokenUsage?.outputTokens) || 0;
  const cost = (ag && ag.tokenUsage?.estimatedCost) || 0;
  const ctxPct = (ag && ag.tokenUsage?.contextPercent);
  const ctxText = ctxPct != null ? `~${ctxPct}%` : '-';

  popoverEl.innerHTML = `
    <div class="pop-header">
      <span class="pop-name">${name}</span>
      <div class="mc-agent-status ${stClass}" style="font-size:0.6rem">${status.toUpperCase()}</div>
    </div>
    <div class="pop-row"><span>Project</span><span class="pop-val">${project}</span></div>
    <div class="pop-row"><span>Tool</span><span class="pop-val">${tool}</span></div>
    <div class="pop-row"><span>Model</span><span class="pop-val">${model}</span></div>
    <div class="pop-row"><span>Tokens</span><span class="pop-val">${formatNum(inputTok + outputTok)}</span></div>
    <div class="pop-row"><span>Cost</span><span class="pop-val">$${cost.toFixed(4)}</span></div>
    <div class="pop-row"><span>Context</span><span class="pop-val">${ctxText}</span></div>
  `;
  popoverEl.style.display = 'block';

  // Position near the character, accounting for zoom transform
  const rect = canvas.getBoundingClientRect();
  const FW = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_W) || 48;
  const FH = (typeof OFFICE !== 'undefined' && OFFICE.FRAME_H) || 64;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  const zoom = (typeof officeRenderer !== 'undefined' && officeRenderer.zoom) || 1.0;
  const panX = (typeof officeRenderer !== 'undefined' && officeRenderer.panX) || 0;
  const panY = (typeof officeRenderer !== 'undefined' && officeRenderer.panY) || 0;
  const originX = canvas.width / 2;
  const originY = canvas.height / 2;
  // World → zoomed+panned canvas pixel → screen
  const canvasX = originX + (char.x - FW / 2 - originX) * zoom + panX;
  const canvasY = originY + (char.y - FH - originY) * zoom + panY;
  const screenX = rect.left + canvasX * scaleX;
  const screenY = rect.top + canvasY * scaleY;

  // Try to position above the character, fall back to below
  const popW = popoverEl.offsetWidth;
  const popH = popoverEl.offsetHeight;
  let left = screenX + (FW * scaleX) / 2 - popW / 2;
  let top = screenY - popH - 8;
  if (top < 4) top = screenY + FH * scaleY + 8;
  left = Math.max(4, Math.min(window.innerWidth - popW - 4, left));
  top = Math.max(4, Math.min(window.innerHeight - popH - 4, top));

  popoverEl.style.left = left + 'px';
  popoverEl.style.top = top + 'px';
}

function hideOfficePopover() {
  popoverEl.style.display = 'none';
}

function setupOfficeClickHandler() {
  const canvas = document.getElementById('office-canvas');
  if (!canvas) return;

  // Zoom controls
  document.getElementById('officeZoomIn')?.addEventListener('click', () => {
    if (typeof officeRenderer !== 'undefined') officeRenderer.zoomIn();
  });
  document.getElementById('officeZoomOut')?.addEventListener('click', () => {
    if (typeof officeRenderer !== 'undefined') officeRenderer.zoomOut();
  });
  document.getElementById('officeZoomReset')?.addEventListener('click', () => {
    if (typeof officeRenderer !== 'undefined') officeRenderer.resetZoom();
  });

  // Mouse-wheel zoom on the canvas
  canvas.addEventListener('wheel', (e) => {
    if (typeof officeRenderer === 'undefined') return;
    e.preventDefault();
    if (e.deltaY < 0) officeRenderer.zoomIn();
    else officeRenderer.zoomOut();
  }, { passive: false });

  // Click-drag panning
  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isPanning || typeof officeRenderer === 'undefined') return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    officeRenderer.pan(
      (e.clientX - panStart.x) * scaleX,
      (e.clientY - panStart.y) * scaleY
    );
    panStart = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    isPanning = false;
    canvas.style.cursor = 'grab';
  });

  canvas.style.cursor = 'grab';

  canvas.addEventListener('click', (e) => {
    const char = hitTestOfficeCharacter(canvas, e);
    if (char) {
      showOfficePopover(canvas, char);
    } else {
      hideOfficePopover();
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popoverEl.contains(e.target) && e.target.id !== 'office-canvas') {
      hideOfficePopover();
    }
  });

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideOfficePopover();
  });
}

// ─── MODEL BREAKDOWN (Feature 3 Frontend) ───
const MODEL_COLORS = {
  opus: '#e879a0',
  sonnet: '#2f81f7',
  haiku: '#3fb950',
};

function getModelFamily(modelName) {
  if (!modelName) return null;
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return null;
}

function getModelColor(modelName) {
  const fam = getModelFamily(modelName);
  return (fam && MODEL_COLORS[fam]) || '#8b949e';
}

function getModelDisplayName(modelName) {
  if (!modelName) return 'Unknown';
  // "claude-sonnet-4-6" → "Sonnet 4.6"
  const m = modelName.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}`;
  return modelName;
}

function renderModelBreakdown(days) {
  const root = document.getElementById('modelBreakdownRoot');
  const body = document.getElementById('modelBreakdownBody');
  if (!root || !body) return;

  // Aggregate byModel across all days
  const totals = {};
  for (const dayStats of Object.values(days)) {
    if (!dayStats.byModel) continue;
    for (const [model, ms] of Object.entries(dayStats.byModel)) {
      if (!totals[model]) totals[model] = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
      totals[model].inputTokens += ms.inputTokens || 0;
      totals[model].outputTokens += ms.outputTokens || 0;
      totals[model].estimatedCost += ms.estimatedCost || 0;
    }
  }

  const models = Object.keys(totals);
  if (models.length === 0) {
    root.style.display = 'none';
    return;
  }
  root.style.display = 'block';

  const grandCost = models.reduce((s, m) => s + totals[m].estimatedCost, 0);

  // Build proportional bar
  const barSegs = models.map(m => {
    const pct = grandCost > 0 ? (totals[m].estimatedCost / grandCost) : 0;
    return `<div class="model-seg" style="flex-grow:${Math.max(totals[m].estimatedCost, 0.001)};background:${getModelColor(m)}" title="${getModelDisplayName(m)}: $${totals[m].estimatedCost.toFixed(2)}"></div>`;
  }).join('');

  // Build legend
  const legendItems = models
    .sort((a, b) => totals[b].estimatedCost - totals[a].estimatedCost)
    .map(m => {
      const tok = formatNum(totals[m].inputTokens + totals[m].outputTokens);
      const cost = totals[m].estimatedCost.toFixed(2);
      return `<div class="model-legend-item">
        <div class="model-legend-dot" style="background:${getModelColor(m)}"></div>
        <span>${getModelDisplayName(m)}</span>
        <span class="model-legend-val">${tok} tok</span>
        <span class="model-legend-val">$${cost}</span>
      </div>`;
    }).join('');

  body.innerHTML = `
    <div class="model-bar-container">${barSegs}</div>
    <div class="model-legend">${legendItems}</div>
  `;
}

// ─── HEATMAP & USAGE DATA FETCH ───
const historyState = { data: null, mode: 'weeks' };

async function fetchHistory() {
  if (historyState.data) return;
  try {
    const r = await fetch('/api/heatmap?days=365');
    historyState.data = await r.json();
  } catch (e) { historyState.data = { days: {} }; }
}

// ─── HEATMAP RENDERING ───
async function renderHeatmapView() {
  await fetchHistory();
  const daysArr = historyState.data.days || {};

  // Calculate streaks
  let totSes = 0, actDays = 0, bestStk = 0, curStk = 0;
  let dList = Object.keys(daysArr).sort();
  let tmpStk = 0;

  for (const d of dList) {
    let v = daysArr[d].sessions || 0;
    totSes += v;
    if (v > 0) { actDays++; tmpStk++; if (tmpStk > bestStk) bestStk = tmpStk; }
    else tmpStk = 0;
  }

  document.getElementById('hmStatsRoot').innerHTML = `
    <div class="hm-stat"><span class="hm-stat-lbl">Record Sessions</span><span class="hm-stat-val">${formatNum(totSes)}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Active Days</span><span class="hm-stat-val">${actDays}</span></div>
    <div class="hm-stat"><span class="hm-stat-lbl">Longest Streak</span><span class="hm-stat-val">${bestStk} d</span></div>
  `;

  // Build Grid
  const grid = document.getElementById('heatmapGrid');
  grid.innerHTML = '';

  const t = new Date(); t.setHours(0, 0, 0, 0);
  const start = new Date(t); start.setDate(t.getDate() - (52 * 7 + t.getDay()));

  const allVals = [];
  const cells = [];
  let cur = new Date(start);
  while (cur <= t) {
    const ds = cur.toISOString().slice(0, 10);
    const v = daysArr[ds]?.sessions || 0;
    allVals.push(v);
    cells.push({ d: ds, v: v, dow: cur.getDay() });
    cur.setDate(cur.getDate() + 1);
  }

  const nz = allVals.filter(v => v > 0).sort((a, b) => a - b);
  const getLv = v => {
    if (v === 0 || nz.length === 0) return 0;
    if (v <= nz[Math.floor(nz.length * 0.25)] || 1) return 1;
    if (v <= nz[Math.floor(nz.length * 0.5)] || 1) return 2;
    if (v <= nz[Math.floor(nz.length * 0.75)] || 1) return 3;
    return 4;
  };

  const yLbls = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  grid.appendChild(createDiv('hm-month-lbl', ''));
  for (let i = 0; i < 7; i++) grid.appendChild(createDiv('hm-day-lbl', yLbls[i]));

  let lastM = -1;
  const mNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  cells.forEach((c, i) => {
    const cd = new Date(c.d + 'T00:00:00');
    if (c.dow === 0 || i === 0) {
      const m = cd.getMonth();
      const p = createDiv('hm-month-lbl', m !== lastM ? mNames[m] : '');
      grid.appendChild(p);
      lastM = m;
    }
    const d = createDiv(`hm-cell l${getLv(c.v)}`, '');
    d.dataset.ds = c.d;
    d.onmouseenter = e => showTooltip(e.target, c.d, daysArr[c.d]);
    d.onmouseleave = hideTooltip;
    grid.appendChild(d);
  });
}

function createDiv(cls, txt) { const d = document.createElement('div'); d.className = cls; d.textContent = txt; return d; }

const tt = document.getElementById('mcTooltip');
function showTooltip(el, dStr, data) {
  const b = el.getBoundingClientRect();
  tt.innerHTML = `<div class="tt-head">${dStr}</div>`;
  if (data) {
    tt.innerHTML += `<div class="tt-row"><span>Sessions</span><span class="tt-val">${data.sessions}</span></div>
                     <div class="tt-row"><span>Tokens</span><span class="tt-val">${formatNum((data.inputTokens || 0) + (data.outputTokens || 0))}</span></div>
                     <div class="tt-row"><span>Cost</span><span class="tt-val">$${(data.estimatedCost || 0).toFixed(2)}</span></div>`;
  } else {
    tt.innerHTML += `<div style="opacity:0.6;font-style:italic">No activity detected.</div>`;
  }
  tt.style.display = 'block';
  let left = b.left + b.width / 2 - tt.offsetWidth / 2;
  tt.style.left = Math.max(10, Math.min(window.innerWidth - tt.offsetWidth - 10, left)) + 'px';
  tt.style.top = (b.top - tt.offsetHeight - 10) + 'px';
}
function hideTooltip() { tt.style.display = 'none'; }

// ─── USAGE CHARTS RENDERING ───
async function renderUsageView() {
  await fetchHistory();
  const days = historyState.data.days || {};
  const mode = historyState.mode;

  const _win = new Date(); _win.setHours(0, 0, 0, 0);
  if (mode === 'days')       _win.setDate(_win.getDate() - 11);
  else if (mode === 'weeks') _win.setDate(_win.getDate() - 11 * 7);
  else                       _win.setMonth(_win.getMonth() - 11);
  const _startKey = _win.toISOString().slice(0, 10);

  let tTok = 0, tCost = 0, tTool = 0, tSes = 0;
  Object.entries(days).forEach(([k, d]) => {
    if (k >= _startKey) {
      tTok  += (d.inputTokens || 0) + (d.outputTokens || 0);
      tCost += d.estimatedCost || 0;
      tTool += d.toolUses || 0;
      tSes  += d.sessions || 0;
    }
  });

  document.getElementById('uTotalTokens').textContent = formatNum(tTok);
  document.getElementById('uTotalCost').textContent = `$${tCost.toFixed(2)}`;
  document.getElementById('uTotalTools').textContent = formatNum(tTool);
  document.getElementById('uTotalSessions').textContent = formatNum(tSes);

  const tChart = aggChart(days, mode, d => (d.inputTokens || 0) + (d.outputTokens || 0));
  const cChart = aggChart(days, mode, d => d.estimatedCost || 0);

  document.getElementById('chartTokensRoot').innerHTML = buildBars(tChart, 'tokens');
  document.getElementById('chartCostRoot').innerHTML = buildBars(cChart, 'cost', true);

  renderModelBreakdown(days);
}

function aggChart(days, mode, valFn) {
  const res = [];
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (mode === 'weeks') {
    for (let w = 11; w >= 0; w--) {
      let s = 0;
      const we = new Date(t); we.setDate(t.getDate() - w * 7);
      const ws = new Date(we); ws.setDate(we.getDate() - 6);
      let c = new Date(ws);
      while (c <= we) { s += valFn(days[c.toISOString().slice(0, 10)] || {}); c.setDate(c.getDate() + 1); }
      res.push({ lbl: `W${12 - w}`, val: s });
    }
  } else if (mode === 'days') {
    for (let d = 11; d >= 0; d--) {
      const day = new Date(t); day.setDate(t.getDate() - d);
      const key = day.toISOString().slice(0, 10);
      const [, mo, dt] = key.split('-');
      res.push({ lbl: `${parseInt(mo)}/${dt}`, val: valFn(days[key] || {}) });
    }
  } else {
    const mn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 11; m >= 0; m--) {
      const target = new Date(t.getFullYear(), t.getMonth() - m, 1);
      const y = target.getFullYear(), mo = target.getMonth();
      const dMax = new Date(y, mo + 1, 0).getDate();
      let s = 0;
      for (let dx = 1; dx <= dMax; dx++) {
        s += valFn(days[`${y}-${String(mo + 1).padStart(2, '0')}-${String(dx).padStart(2, '0')}`] || {});
      }
      res.push({ lbl: mn[mo], val: s });
    }
  }
  return res;
}

function buildBars(data, colorClass, isMoney = false) {
  const max = Math.max(...data.map(d => d.val), 1);
  const bars = data.map(d => {
    const h = d.val > 0 ? Math.max(4, Math.round((d.val / max) * 100)) : 0;
    const fmt = d.val === 0 ? '' : (isMoney ? '$' + d.val.toFixed(2) : formatNum(d.val));
    return `<div class="chart-col">
              <div class="chart-val">${fmt}</div>
              <div class="chart-bar ${colorClass}" style="height:${h}%"></div>
              <div class="chart-lbl">${d.lbl}</div>
            </div>`;
  }).join('');
  return `<div class="chart-box">${bars}</div>`;
}

// ─── SETTINGS ───
const SETTINGS_FIELDS = [
  { key: 'singleAgentWidth',  label: 'Single-agent Width',  desc: 'Window width when exactly one agent is active (px)',         min: 50,  max: 1000 },
  { key: 'singleAgentHeight', label: 'Single-agent Height', desc: 'Window height when exactly one agent is active (px)',        min: 50,  max: 1000 },
  { key: 'cardW',             label: 'Card Width',           desc: 'Width of each agent card in the overlay grid (px)',         min: 20,  max: 400  },
  { key: 'gap',               label: 'Card Gap',             desc: 'Horizontal gap between agent cards (px)',                   min: 0,   max: 100  },
  { key: 'outer',             label: 'Outer Padding',        desc: 'Total horizontal padding around the card grid (px)',       min: 0,   max: 400  },
  { key: 'baseH',             label: 'Base Height',          desc: 'Window height per row in multi-agent layouts (px)',        min: 50,  max: 1000 },
  { key: 'maxCols',           label: 'Max Columns',          desc: 'Maximum agent cards per row before wrapping to next row',  min: 1,   max: 30   },
  { key: 'minWidth',          label: 'Minimum Width',        desc: 'Hard minimum overlay window width (px)',                   min: 50,  max: 1000 },
  { key: 'satsPerRow',        label: 'Satellites Per Row',   desc: 'Sub-agent / teammate cards per row within a parent card', min: 1,   max: 10   },
  { key: 'satRowH',           label: 'Satellite Row Height', desc: 'Height added per row of satellite agents (px)',            min: 10,  max: 200  },
];

async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    state.settings = await r.json();
    renderSettingsForm();
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

function renderSettingsForm() {
  const form = document.getElementById('settingsForm');
  if (!form || !state.settings) return;
  form.innerHTML = SETTINGS_FIELDS.map(f => `
    <div class="settings-field">
      <label class="settings-label" for="sf-${f.key}">${f.label}</label>
      <div class="settings-input-row">
        <input
          class="settings-input"
          type="number"
          id="sf-${f.key}"
          name="${f.key}"
          value="${state.settings[f.key]}"
          min="${f.min}"
          max="${f.max}"
          step="1"
        >
        <span class="settings-input-unit">px</span>
      </div>
      <div class="settings-desc">${f.desc}</div>
    </div>
  `).join('');

  form.addEventListener('input', updateSettingsPreview);
  updateSettingsPreview();
}

function readFormValues() {
  const values = {};
  for (const f of SETTINGS_FIELDS) {
    const el = document.getElementById(`sf-${f.key}`);
    if (el) values[f.key] = parseInt(el.value, 10);
  }
  return values;
}

function updateSettingsPreview() {
  const preview = document.getElementById('settingsPreview');
  if (!preview) return;
  const v = readFormValues();
  const exampleCounts = [1, 2, 5, 10];
  const rows = exampleCounts.map(n => {
    let w, h;
    if (n <= 1) {
      w = v.singleAgentWidth || 150;
      h = v.singleAgentHeight || 175;
    } else {
      const cols = Math.min(n, v.maxCols || 10);
      w = Math.max(v.minWidth || 220, cols * (v.cardW || 80) + (cols - 1) * (v.gap || 10) + (v.outer || 100));
      h = (v.baseH || 170);
    }
    return `<tr><td class="preview-n">${n} agent${n > 1 ? 's' : ''}</td><td class="preview-dim">${w} × ${h} px</td></tr>`;
  }).join('');
  preview.innerHTML = `
    <div class="panel-header">Live Preview</div>
    <div class="panel-body" style="padding:12px 16px">
      <table class="preview-table"><tbody>${rows}</tbody></table>
      <div class="settings-preview-note">Satellite rows add ${v.satRowH || 34}px per ${v.satsPerRow || 3} sub-agents</div>
    </div>
  `;
}

async function saveSettings() {
  const values = readFormValues();
  const btn = document.getElementById('settingsSaveBtn');
  btn.disabled = true;
  try {
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const data = await r.json();
    if (r.ok) {
      state.settings = data.settings;
      showSettingsStatus('Settings saved. Overlay window will resize on next agent change.', 'success');
    } else {
      showSettingsStatus(`Error: ${data.error}`, 'error');
    }
  } catch (e) {
    showSettingsStatus('Network error saving settings.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function resetSettings() {
  const btn = document.getElementById('settingsResetBtn');
  btn.disabled = true;
  try {
    const r = await fetch('/api/settings/reset', { method: 'POST' });
    const data = await r.json();
    if (r.ok) {
      state.settings = data.settings;
      renderSettingsForm();
      showSettingsStatus('Settings reset to defaults.', 'success');
    } else {
      showSettingsStatus(`Error: ${data.error}`, 'error');
    }
  } catch (e) {
    showSettingsStatus('Network error resetting settings.', 'error');
  } finally {
    btn.disabled = false;
  }
}

function showSettingsStatus(msg, type) {
  const el = document.getElementById('settingsStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = `settings-status ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'settings-status'; }, 4000);
}

// ─── NAV LOGIC ───
document.querySelectorAll('.usage-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.usage-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    historyState.mode = b.dataset.umode;
    renderUsageView();
  }
});

document.querySelectorAll('.nav-item').forEach(b => {
  b.onclick = () => {
    const target = b.dataset.view;
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    b.classList.add('active');

    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`${target}View`);
    if (el) el.classList.add('active');

    state.currentView = target;
    localStorage.setItem('mc-view', target);

    if (target === 'heatmap') renderHeatmapView();
    else if (target === 'usage') renderUsageView();
    else if (target === 'settings') loadSettings();
  };
});

// ─── PiP TOGGLE & STATE ───
(function () {
  var pipBtn = document.getElementById('pipToggleBtn');
  var pipPlaceholder = document.getElementById('pipPlaceholder');
  var pipStopBtn = document.getElementById('pipStopBtn');
  var officeCanvas = document.getElementById('office-canvas');

  function setPipState(isOpen) {
    if (pipBtn) pipBtn.classList.toggle('active', isOpen);
    if (pipPlaceholder) pipPlaceholder.style.display = isOpen ? 'flex' : 'none';
    if (officeCanvas) officeCanvas.style.display = isOpen ? 'none' : 'block';
  }

  if (pipBtn) {
    pipBtn.addEventListener('click', function () {
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.togglePip) {
        dashboardAPI.togglePip();
      }
    });
  }

  if (pipStopBtn) {
    pipStopBtn.addEventListener('click', function () {
      if (typeof dashboardAPI !== 'undefined' && dashboardAPI.togglePip) {
        dashboardAPI.togglePip();
      }
    });
  }

  // Listen for PiP state changes from main process
  if (typeof dashboardAPI !== 'undefined' && dashboardAPI.onPipStateChanged) {
    dashboardAPI.onPipStateChanged(function (isOpen) {
      setPipState(isOpen);
    });
  }
})();

// ─── BOOT ───
function initApp() {
  // Sync startup view
  document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
  let btn = document.querySelector(`[data-view="${state.currentView}"]`);
  if (!btn) btn = document.querySelector(`[data-view="office"]`);
  btn.classList.add('active');
  bClickObj = btn;
  const target = bClickObj.dataset.view;
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const tgtEl = document.getElementById(`${target}View`);
  if (tgtEl) tgtEl.classList.add('active');

  connectSSE();
  if (target === 'heatmap') renderHeatmapView();
  else if (target === 'usage') renderUsageView();
  else if (target === 'settings') loadSettings();

  document.getElementById('settingsSaveBtn')?.addEventListener('click', saveSettings);
  document.getElementById('settingsResetBtn')?.addEventListener('click', resetSettings);

  // We rely on standard office-init.js to boot the canvas logic
  if (typeof initOffice === 'function') setTimeout(() => {
    initOffice();
    setupOfficeClickHandler();
  }, 100);
}

document.addEventListener('DOMContentLoaded', initApp);
