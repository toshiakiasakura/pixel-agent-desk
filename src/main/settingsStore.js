/**
 * Settings Store
 * Persists window sizing settings to a JSON file in userData directory.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  singleAgentWidth: 150,
  singleAgentHeight: 175,
  cardW: 80,
  gap: 10,
  outer: 100,
  baseH: 170,
  maxCols: 10,
  minWidth: 220,
  satsPerRow: 3,
  satRowH: 34,
};

let _settings = null;
let _filePath = null;

function init(userDataPath) {
  _filePath = path.join(userDataPath, 'window-settings.json');
  try {
    if (fs.existsSync(_filePath)) {
      const raw = fs.readFileSync(_filePath, 'utf8');
      const parsed = JSON.parse(raw);
      _settings = Object.assign({}, DEFAULTS, parsed);
    } else {
      _settings = Object.assign({}, DEFAULTS);
      fs.writeFileSync(_filePath, JSON.stringify(_settings, null, 2), 'utf8');
    }
  } catch (e) {
    _settings = Object.assign({}, DEFAULTS);
  }
}

function get() {
  if (!_settings) return Object.assign({}, DEFAULTS);
  return Object.assign({}, _settings);
}

function set(partial) {
  if (!_settings) throw new Error('settingsStore not initialized');
  const merged = Object.assign({}, _settings);
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in DEFAULTS)) continue; // ignore unknown keys
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      const err = new Error(`Invalid value for "${key}": must be a positive number`);
      err.name = 'SettingsValidationError';
      throw err;
    }
    if ((key === 'maxCols' || key === 'satsPerRow') && num < 1) {
      const err = new Error(`Invalid value for "${key}": must be >= 1`);
      err.name = 'SettingsValidationError';
      throw err;
    }
    merged[key] = Math.round(num);
  }
  _settings = merged;
  try {
    fs.writeFileSync(_filePath, JSON.stringify(_settings, null, 2), 'utf8');
  } catch (e) {
    // persist failure is non-fatal — in-memory settings still updated
  }
}

function reset() {
  if (!_settings) throw new Error('settingsStore not initialized');
  _settings = Object.assign({}, DEFAULTS);
  try {
    fs.writeFileSync(_filePath, JSON.stringify(_settings, null, 2), 'utf8');
  } catch (e) {
    // persist failure is non-fatal
  }
}

function getPath() {
  return _filePath;
}

function getDefaults() {
  return Object.assign({}, DEFAULTS);
}

module.exports = { init, get, set, reset, getPath, getDefaults };
