/**
 * Office Init — Entry point: agent sync, render loop start
 * SSE events are received from dashboard's connectSSE() — no separate connection needed.
 */

/* eslint-disable no-unused-vars */

var officeInitialized = false;

async function initOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
    return;
  }

  const canvas = document.getElementById('office-canvas');
  if (!canvas) return;

  try {
    await officeRenderer.init(canvas);
  } catch (e) {
    console.error('[Office] Init failed:', e);
    return;
  }

  // Load existing agents
  try {
    const res = await fetch('/api/agents');
    const agents = await res.json();
    agents.forEach(function (a) {
      officeCharacters.addCharacter(a);
    });
    console.log('[Office] Loaded', agents.length, 'agents');
  } catch (e) {
    console.error('[Office] Failed to fetch agents:', e);
  }

  officeInitialized = true;
  console.log('[Office] Ready');
}

/** Called from dashboard SSE agent.created handler */
function officeOnAgentCreated(data) {
  if (officeInitialized) officeCharacters.addCharacter(data);
}

/** Called from dashboard SSE agent.updated handler */
function officeOnAgentUpdated(data) {
  if (officeInitialized) officeCharacters.updateCharacter(data);
}

/** Called from dashboard SSE agent.removed handler */
function officeOnAgentRemoved(data) {
  if (officeInitialized) officeCharacters.removeCharacter(data.id);
}

function stopOffice() {
  officeRenderer.stop();
}

function resumeOffice() {
  if (officeInitialized) {
    officeRenderer.resume();
  }
}
