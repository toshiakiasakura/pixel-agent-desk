/**
 * Shared Utilities for Pixel Agent Desk
 * Eliminates code duplication across modules
 */

/**
 * Format slug to display name
 * @param {string} slug - Slug like "toasty-sparking-lecun"
 * @returns {string} Formatted name like "Toasty Sparking Lecun"
 */
function formatSlugToDisplayName(slug) {
  if (!slug) return 'Agent';
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Format time in milliseconds to MM:SS format
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time string (e.g., "05:30")
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Calculate window size based on agent count
 * @param {number|Array} agentsOrCount - Agent count or array of agents
 * @returns {Object} Window dimensions {width, height}
 */
function getWindowSizeForAgents(agentsOrCount, settings = {}) {
  const {
    singleAgentWidth = 150,
    singleAgentHeight = 175,
    cardW = 80,
    gap = 10,
    outer = 100,
    baseH = 170,
    maxCols = 10,
    minWidth = 220,
    satsPerRow = 3,
    satRowH = 34,
  } = settings;

  let count = 0;
  let agents = [];
  if (Array.isArray(agentsOrCount)) {
    agents = agentsOrCount;
    count = agents.length;
  } else {
    count = agentsOrCount || 0;
  }

  if (count <= 1) return { width: singleAgentWidth, height: singleAgentHeight };

  if (agents.length > 0) {
    // Build a set of active agent IDs for parent lookup
    const agentIds = new Set(agents.map(a => a.id));

    // Satellite children: have parentId and parent exists in the list
    const isSatellite = (a) => {
      return !!(a.parentId && (a.isSubagent || (a.isTeammate && a.parentId)) && agentIds.has(a.parentId));
    };

    // Count only grid-level cards (exclude satellites)
    const gridAgents = agents.filter(a => !isSatellite(a));
    const gridCount = gridAgents.length;

    if (gridCount <= 1 && agents.length <= 1) return { width: singleAgentWidth, height: singleAgentHeight };

    // Count satellite children per parent → calculate extra row height
    const satellitesPerParent = new Map();
    agents.forEach(a => {
      if (isSatellite(a)) {
        satellitesPerParent.set(a.parentId, (satellitesPerParent.get(a.parentId) || 0) + 1);
      }
    });

    let satelliteExtraH = 0;
    satellitesPerParent.forEach(satCount => {
      satelliteExtraH += Math.ceil(satCount / satsPerRow) * satRowH;
    });

    const cols = Math.min(Math.max(gridCount, 1), maxCols);
    const rows = Math.ceil(Math.max(gridCount, 1) / maxCols);

    const width = Math.max(minWidth, cols * cardW + (cols - 1) * gap + outer);
    const height = baseH + Math.max(0, rows - 1) * baseH + satelliteExtraH;

    return { width, height };
  }

  // Fallback (simple count-based calculation when agents array is not available)
  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / maxCols);

  const width = Math.max(minWidth, cols * cardW + (cols - 1) * gap + outer);
  const height = baseH + (rows - 1) * baseH;

  return { width, height };
}

module.exports = {
  formatSlugToDisplayName,
  formatTime,
  getWindowSizeForAgents
};
