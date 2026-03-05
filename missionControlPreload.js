/**
 * Mission Control Dashboard Preload Script
 * Provides secure IPC bridge for Mission Control window
 */

const { contextBridge, ipcRenderer } = require('electron');

// Parse URL parameters to get initial data
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get('token'),
    agents: params.get('agents'),
    source: params.get('source')
  };
}

// Get initial agents from URL
function getInitialAgents() {
  try {
    const params = getUrlParams();
    const agentsParam = params.agents;
    if (agentsParam) {
      return JSON.parse(decodeURIComponent(agentsParam));
    }
    return [];
  } catch (error) {
    console.error('[MissionControlPreload] Failed to parse initial agents:', error);
    return [];
  }
}

// Get auth token from URL
function getAuthToken() {
  const params = getUrlParams();
  return params.token || '';
}

// Clean up URL (remove sensitive data from address bar)
function cleanUrl() {
  if (window.history && window.history.replaceState) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

// Clean URL on page load
cleanUrl();

// Expose secure API to Mission Control window
contextBridge.exposeInMainWorld('missionControlAPI', {
  // Get initial data
  getInitialAgents,
  getAuthToken,
  getSource: () => getUrlParams().source || 'unknown',

  // Agent event listeners
  onAgentAdded: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('mission-agent-added', listener);
    return () => ipcRenderer.removeListener('mission-agent-added', listener);
  },

  onAgentUpdated: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('mission-agent-updated', listener);
    return () => ipcRenderer.removeListener('mission-agent-updated', listener);
  },

  onAgentRemoved: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('mission-agent-removed', listener);
    return () => ipcRenderer.removeListener('mission-agent-removed', listener);
  },

  // Send commands to Pixel Agent Desk
  focusAgent: (agentId) => {
    console.log('[MissionControlAPI] Focusing agent:', agentId);
    ipcRenderer.send('mission-focus-agent', agentId);
  },

  dismissAgent: (agentId) => {
    console.log('[MissionControlAPI] Dismissing agent:', agentId);
    ipcRenderer.send('mission-dismiss-agent', agentId);
  }
});

console.log('[MissionControlPreload] Initialized with token:', getAuthToken().slice(0, 8) + '...');
