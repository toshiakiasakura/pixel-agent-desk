/**
 * PiP Window Logic
 * - Initializes office canvas (same engine as dashboard)
 * - Connects own SSE for real-time agent updates
 * - "Back to dashboard" button via IPC
 * - Forced render loop resume to counter RAF throttling
 */

(function () {
  'use strict';

  // ─── SSE Connection ───
  var sseSource = null;
  var sseDelay = 1000;

  function connectSSE() {
    if (sseSource) { sseSource.close(); sseSource = null; }
    var es = new EventSource('/api/events');
    sseSource = es;

    es.onopen = function () { sseDelay = 1000; };

    es.onerror = function () {
      es.close();
      sseSource = null;
      setTimeout(connectSSE, sseDelay);
      sseDelay = Math.min(sseDelay * 2, 30000);
    };

    es.addEventListener('connected', function () { fetchAgents(); });

    es.addEventListener('agent.created', function (e) {
      var d = JSON.parse(e.data).data;
      if (typeof officeOnAgentCreated === 'function') officeOnAgentCreated(d);
    });
    es.addEventListener('agent.updated', function (e) {
      var d = JSON.parse(e.data).data;
      if (typeof officeOnAgentUpdated === 'function') officeOnAgentUpdated(d);
    });
    es.addEventListener('agent.removed', function (e) {
      var d = JSON.parse(e.data).data;
      if (typeof officeOnAgentRemoved === 'function') officeOnAgentRemoved(d);
    });
  }

  function fetchAgents() {
    fetch('/api/agents')
      .then(function (res) { return res.json(); })
      .then(function (agents) {
        agents.forEach(function (a) {
          if (typeof officeOnAgentCreated === 'function') officeOnAgentCreated(a);
        });
      })
      .catch(function (e) { console.error('[PiP] Failed to fetch agents:', e); });
  }

  // ─── Back to Dashboard ───
  var backBtn = document.getElementById('pipBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      if (window.pipAPI && window.pipAPI.backToDashboard) {
        window.pipAPI.backToDashboard();
      }
    });
  }

  // ─── Boot ───
  function boot() {
    console.log('[PiP] Booting...');

    if (typeof initOffice !== 'function') {
      console.error('[PiP] initOffice not found — office scripts failed to load');
      return;
    }

    initOffice()
      .then(function () {
        console.log('[PiP] Office initialized, canvas:',
          document.getElementById('office-canvas').width + 'x' +
          document.getElementById('office-canvas').height);

        // Force resume render loop — RAF may have been throttled during load
        ensureRenderLoop();

        connectSSE();
      })
      .catch(function (e) {
        console.error('[PiP] Office init failed:', e);
      });
  }

  // Ensure the render loop is actually running (RAF throttle workaround)
  function ensureRenderLoop() {
    if (typeof officeRenderer === 'undefined') return;

    // Check immediately
    if (!officeRenderer.rafId) {
      console.warn('[PiP] Render loop not running, starting...');
      officeRenderer.resume();
    }

    // Also check after a short delay (RAF might have been cancelled)
    setTimeout(function () {
      if (typeof officeRenderer !== 'undefined' && !officeRenderer.rafId) {
        console.warn('[PiP] Render loop stalled, restarting...');
        officeRenderer.resume();
      }
    }, 500);
  }

  // Also handle window gaining focus (RAF resumes)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      ensureRenderLoop();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
