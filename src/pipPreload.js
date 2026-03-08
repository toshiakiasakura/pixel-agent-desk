/**
 * PiP Preload Script
 * Secure IPC bridge for PiP window
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pipAPI', {
  backToDashboard: function () { ipcRenderer.send('pip-back-to-dashboard'); }
});
