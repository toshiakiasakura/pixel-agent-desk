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
function getWindowSizeForAgents(agentsOrCount) {
  let count = 0;
  let agents = [];
  if (Array.isArray(agentsOrCount)) {
    agents = agentsOrCount;
    count = agents.length;
  } else {
    count = agentsOrCount || 0;
  }

  if (count <= 1) return { width: 220, height: 240 };

  const CARD_W = 90;
  const GAP = 10;
  const OUTER = 120 + 20; // 팀 디자인 여백 감안
  const ROW_H = 240;
  const BASE_H = 240;
  const maxCols = 10;

  if (agents.length > 0) {
    const groups = {};
    agents.forEach(a => {
      const p = a.projectPath || 'default';
      if (!groups[p]) groups[p] = [];
      groups[p].push(a);
    });

    let teamRows = 0;
    let soloCount = 0;
    let maxColsInRow = 0;

    for (const group of Object.values(groups)) {
      const isTeam = group.some(a => a.isSubagent || a.isTeammate);
      if (isTeam) {
        teamRows += Math.ceil(group.length / maxCols);
        maxColsInRow = Math.max(maxColsInRow, Math.min(group.length, maxCols));
      } else {
        soloCount += group.length;
      }
    }

    const soloRows = Math.ceil(soloCount / maxCols);
    if (soloCount > 0) {
      maxColsInRow = Math.max(maxColsInRow, Math.min(soloCount, maxCols));
    }

    const totalRows = teamRows + soloRows;
    const width = Math.max(220, maxColsInRow * CARD_W + (maxColsInRow - 1) * GAP + OUTER);
    const height = BASE_H + Math.max(0, totalRows - 1) * ROW_H + (teamRows * 30); // 팀 그룹 여백(padding) 감안

    return { width, height };
  }

  // Fallback (agents 배열이 없는 경우 단순 count로 계산)
  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / maxCols);

  const width = Math.max(220, cols * CARD_W + (cols - 1) * GAP + OUTER);
  const height = BASE_H + (rows - 1) * ROW_H;

  return { width, height };
}

module.exports = {
  formatSlugToDisplayName,
  formatTime,
  getWindowSizeForAgents
};
