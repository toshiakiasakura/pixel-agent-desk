/**
 * Heatmap Scanner
 * ~/.claude/projects/ 하위 JSONL 트랜스크립트를 스캔하여
 * 일별 활동 통계(세션, 메시지, 도구사용, 토큰, 비용)를 집계한다.
 * GitHub 잔디 스타일 히트맵 데이터 제공용.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { MODEL_PRICING, DEFAULT_PRICING, roundCost } = require('./pricing');

/** 보존 기한 (일) */
const MAX_AGE_DAYS = 400;

class HeatmapScanner {
  /**
   * @param {(msg: string) => void} [debugLog]
   */
  constructor(debugLog = () => {}) {
    this.debugLog = debugLog;
    this.scanInterval = null;

    /** 영속화 경로 (인스턴스 생성 시점의 homedir 사용) */
    this.persistDir = path.join(os.homedir(), '.pixel-agent-desk');
    this.persistFile = path.join(this.persistDir, 'heatmap.json');

    /** @type {Record<string, DayStats>} "YYYY-MM-DD" → 통계 */
    this.days = {};
    /** 마지막 스캔 timestamp */
    this.lastScan = 0;
    /** 파일별 증분 오프셋 @type {Record<string, FileOffset>} */
    this.fileOffsets = {};

    // 영속화 데이터 복원
    this._loadPersisted();
  }

  /**
   * 주기적 스캔 시작
   * @param {number} intervalMs (기본 5분)
   */
  start(intervalMs = 300_000) {
    this.debugLog('[HeatmapScanner] Started');
    this.scanAll();
    this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this._savePersisted();
    this.debugLog('[HeatmapScanner] Stopped');
  }

  /**
   * 전체 스캔 — ~/.claude/projects/ 하위 모든 JSONL 탐색
   */
  async scanAll() {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(claudeDir)) {
      this.debugLog('[HeatmapScanner] No ~/.claude/projects/ directory');
      return;
    }

    const jsonlFiles = this._findJsonlFiles(claudeDir);
    let newEntries = 0;

    for (const filePath of jsonlFiles) {
      try {
        newEntries += this._scanFile(filePath);
      } catch (e) {
        this.debugLog(`[HeatmapScanner] Error scanning ${filePath}: ${e.message}`);
      }
    }

    this.lastScan = Date.now();
    this._pruneOldDays();

    if (newEntries > 0) {
      this.debugLog(`[HeatmapScanner] Scanned ${jsonlFiles.length} files, ${newEntries} new entries`);
      this._savePersisted();
    }
  }

  /**
   * 일별 통계 반환
   * @returns {{ days: Record<string, DayStats>, lastScan: number }}
   */
  getDailyStats() {
    return { days: this.days, lastScan: this.lastScan };
  }

  /**
   * 범위 조회
   * @param {string} startDate "YYYY-MM-DD"
   * @param {string} endDate "YYYY-MM-DD"
   * @returns {Record<string, DayStats>}
   */
  getRange(startDate, endDate) {
    const result = {};
    for (const [date, stats] of Object.entries(this.days)) {
      if (date >= startDate && date <= endDate) {
        result[date] = stats;
      }
    }
    return result;
  }

  // ─── 내부 구현 ───

  /**
   * 디렉토리를 재귀 탐색하여 .jsonl 파일 목록 반환
   * @param {string} dir
   * @returns {string[]}
   */
  _findJsonlFiles(dir) {
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this._findJsonlFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          results.push(fullPath);
        }
      }
    } catch {
      // 권한 문제 등 무시
    }
    return results;
  }

  /**
   * 단일 파일 증분 스캔
   * @param {string} filePath
   * @returns {number} 새로 처리한 엔트리 수
   */
  _scanFile(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return 0;
    }

    const offset = this.fileOffsets[filePath];

    // 변경이 없으면 스킵
    if (offset && offset.size === stat.size && offset.mtimeMs === stat.mtimeMs) {
      return 0;
    }

    const startByte = offset ? offset.bytesRead : 0;
    if (startByte >= stat.size) {
      // 파일이 줄어든 경우 (truncated/rotated) → 처음부터 다시 읽기
      if (startByte > stat.size) {
        this.fileOffsets[filePath] = { bytesRead: 0, size: 0, mtimeMs: 0 };
        return this._scanFile(filePath);
      }
      return 0;
    }

    // 프로젝트 이름 추출 — ~/.claude/projects/{project-hash}/ 구조
    const projectName = this._extractProjectName(filePath);

    // 증분 읽기
    const fd = fs.openSync(filePath, 'r');
    let buf;
    try {
      buf = Buffer.alloc(stat.size - startByte);
      fs.readSync(fd, buf, 0, buf.length, startByte);
    } finally {
      fs.closeSync(fd);
    }

    const chunk = buf.toString('utf-8');
    const lines = chunk.split('\n').filter(Boolean);
    let count = 0;

    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (!entry.timestamp) continue;
      // sidechain(compact 내부) 무시
      if (entry.isSidechain) continue;

      const dateKey = entry.timestamp.slice(0, 10); // "YYYY-MM-DD"
      if (!dateKey || dateKey.length !== 10) continue;

      this._ensureDay(dateKey);
      const day = this.days[dateKey];

      // 세션 카운트 (sessionId 기반 유니크)
      const sessionId = entry.sessionId || null;

      if (entry.type === 'user') {
        day.userMessages++;
        if (sessionId && !day._sessions.has(sessionId)) {
          day._sessions.add(sessionId);
          day.sessions++;
        }
      }

      if (entry.type === 'assistant' && entry.message) {
        day.assistantMessages++;

        // 토큰 집계
        const usage = entry.message.usage;
        if (usage) {
          const input = usage.input_tokens || 0;
          const cacheRead = usage.cache_read_input_tokens || 0;
          const cacheCreate = usage.cache_creation_input_tokens || 0;
          const output = usage.output_tokens || 0;

          day.inputTokens += input + cacheRead + cacheCreate;
          day.outputTokens += output;

          // 비용 계산
          const model = entry.message.model || null;
          const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
          day.estimatedCost += roundCost(
            input * pricing.input +
            cacheRead * pricing.input * 0.1 +
            cacheCreate * pricing.input * 1.25 +
            output * pricing.output
          );
        }

        // tool_use 블록 수
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') day.toolUses++;
          }
        }
      }

      // 프로젝트 추가
      if (projectName && !day._projects.has(projectName)) {
        day._projects.add(projectName);
        day.projects.push(projectName);
      }

      count++;
    }

    // 오프셋 업데이트
    this.fileOffsets[filePath] = {
      bytesRead: stat.size,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };

    return count;
  }

  /**
   * 날짜 키의 일별 통계 초기화
   * @param {string} dateKey "YYYY-MM-DD"
   */
  _ensureDay(dateKey) {
    if (!this.days[dateKey]) {
      this.days[dateKey] = {
        sessions: 0,
        userMessages: 0,
        assistantMessages: 0,
        toolUses: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        projects: [],
        // 내부 추적용 (직렬화 시 제거)
        _sessions: new Set(),
        _projects: new Set(),
      };
    }
  }

  /**
   * 파일 경로에서 프로젝트 이름 추출
   * ~/.claude/projects/{encoded-project-path}/... → 디코딩 시도
   * @param {string} filePath
   * @returns {string|null}
   */
  _extractProjectName(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const match = normalizedPath.match(/\.claude\/projects\/([^/]+)/);
    if (!match) return null;

    const encoded = match[1];
    // Claude CLI는 프로젝트 경로를 인코딩하여 디렉토리명으로 사용
    // 마지막 세그먼트가 의미있는 프로젝트명
    const parts = encoded.split('-');
    // 너무 짧으면 그대로 반환
    if (parts.length <= 1) return encoded;
    return parts[parts.length - 1] || encoded;
  }

  /**
   * MAX_AGE_DAYS 이상 된 데이터 정리
   */
  _pruneOldDays() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const dateKey of Object.keys(this.days)) {
      if (dateKey < cutoffStr) {
        delete this.days[dateKey];
      }
    }
  }

  /**
   * 영속화 저장
   */
  _savePersisted() {
    try {
      if (!fs.existsSync(this.persistDir)) {
        fs.mkdirSync(this.persistDir, { recursive: true });
      }

      // _sessions, _projects Set은 직렬화에서 제외
      const serialDays = {};
      for (const [date, stats] of Object.entries(this.days)) {
        const { _sessions, _projects, ...rest } = stats;
        rest.estimatedCost = roundCost(rest.estimatedCost);
        serialDays[date] = rest;
      }

      const data = {
        days: serialDays,
        lastScan: this.lastScan,
        fileOffsets: this.fileOffsets,
      };

      fs.writeFileSync(this.persistFile, JSON.stringify(data), 'utf-8');
    } catch (e) {
      this.debugLog(`[HeatmapScanner] Failed to save: ${e.message}`);
    }
  }

  /**
   * 영속화 복원
   */
  _loadPersisted() {
    try {
      if (!fs.existsSync(this.persistFile)) return;
      const raw = fs.readFileSync(this.persistFile, 'utf-8');
      const data = JSON.parse(raw);

      if (data.days) {
        for (const [date, stats] of Object.entries(data.days)) {
          this.days[date] = {
            ...stats,
            _sessions: new Set(),
            _projects: new Set(stats.projects || []),
          };
        }
      }
      if (data.lastScan) this.lastScan = data.lastScan;
      if (data.fileOffsets) this.fileOffsets = data.fileOffsets;

      this.debugLog(`[HeatmapScanner] Loaded ${Object.keys(this.days).length} days from cache`);
    } catch (e) {
      this.debugLog(`[HeatmapScanner] Failed to load cache: ${e.message}`);
    }
  }
}

/**
 * @typedef {Object} DayStats
 * @property {number} sessions
 * @property {number} userMessages
 * @property {number} assistantMessages
 * @property {number} toolUses
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} estimatedCost
 * @property {string[]} projects
 */

/**
 * @typedef {Object} FileOffset
 * @property {number} bytesRead
 * @property {number} size
 * @property {number} mtimeMs
 */

module.exports = HeatmapScanner;
