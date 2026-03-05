/**
 * Session Scanner — Task 3A-4
 * Mission Control의 claude-sessions.ts 패턴을 Node.js로 구현.
 * transcript_path(JSONL) 파일을 60초마다 파싱해 토큰/비용/세션 통계를 추출하고
 * agentManager에 보완적으로 반영한다.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// 모델별 토큰 가격 (per token)
const MODEL_PRICING = {
    'claude-opus-4-5': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
    'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4-6': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};
const DEFAULT_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

class SessionScanner {
    /**
     * @param {import('./agentManager')} agentManager
     * @param {(msg: string) => void} [debugLog]
     */
    constructor(agentManager, debugLog = () => { }) {
        this.agentManager = agentManager;
        this.debugLog = debugLog;
        this.scanInterval = null;
        /** @type {Map<string, SessionStats>} agentId → 마지막 스캔 결과 */
        this.lastScanResults = new Map();
    }

    /**
     * 주기적 스캔 시작
     * @param {number} intervalMs 스캔 주기 (기본 60초)
     */
    start(intervalMs = 60_000) {
        this.debugLog('[SessionScanner] Started');
        this.scanAll(); // 즉시 1회 실행
        this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
    }

    stop() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.debugLog('[SessionScanner] Stopped');
    }

    /** 모든 에이전트의 JSONL을 스캔해 통계 갱신 */
    scanAll() {
        if (!this.agentManager) return;
        const agents = this.agentManager.getAllAgents();
        let updated = 0;

        for (const agent of agents) {
            if (!agent.jsonlPath) continue;

            try {
                const stats = this.parseSessionFile(agent.jsonlPath);
                if (!stats) continue;

                this.lastScanResults.set(agent.id, stats);

                // 훅에서 수집된 토큰보다 JSONL 파싱 값이 더 많으면 보완
                const cur = agent.tokenUsage || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
                if (stats.inputTokens > cur.inputTokens || stats.outputTokens > cur.outputTokens) {
                    this.agentManager.updateAgent({
                        ...agent,
                        tokenUsage: {
                            inputTokens: stats.inputTokens,
                            outputTokens: stats.outputTokens,
                            estimatedCost: stats.estimatedCost,
                        },
                        // 모델 정보가 누락된 경우 JSONL에서 보충
                        model: agent.model || stats.model || null,
                    }, 'scanner');
                    updated++;
                }
            } catch (e) {
                this.debugLog(`[SessionScanner] Error scanning ${agent.jsonlPath}: ${e.message}`);
            }
        }

        if (updated > 0) {
            this.debugLog(`[SessionScanner] Updated ${updated} agent(s) from JSONL scan`);
        }
    }

    /**
     * 단일 JSONL 파일 파싱
     * @param {string} filePath transcript_path 값 (~/... 형식 포함)
     * @returns {SessionStats | null}
     */
    parseSessionFile(filePath) {
        // Windows: ~ → os.homedir() 치환
        const resolvedPath = filePath.startsWith('~')
            ? path.join(os.homedir(), filePath.slice(1))
            : filePath;

        if (!fs.existsSync(resolvedPath)) return null;

        let content;
        try {
            content = fs.readFileSync(resolvedPath, 'utf-8');
        } catch {
            return null;
        }

        const lines = content.split('\n').filter(Boolean);
        if (lines.length === 0) return null;

        let model = null;
        let userMessages = 0;
        let assistantMessages = 0;
        let toolUses = 0;
        let inputTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let cacheCreationTokens = 0;
        let firstMessageAt = null;
        let lastMessageAt = null;
        let lastActivity = null;

        for (const line of lines) {
            let entry;
            try { entry = JSON.parse(line); } catch { continue; }

            // 타임스탬프 추적
            if (entry.timestamp) {
                if (!firstMessageAt) firstMessageAt = entry.timestamp;
                lastMessageAt = entry.timestamp;
            }

            // 사이드체인(compact 내부) 무시
            if (entry.isSidechain) continue;

            // 마지막 활동 시간
            if (entry.timestamp) lastActivity = entry.timestamp;

            if (entry.type === 'user') {
                userMessages++;
            }

            if (entry.type === 'assistant' && entry.message) {
                assistantMessages++;

                // 모델 추출
                if (entry.message.model) model = entry.message.model;

                // 토큰 usage 추출 (캐시 포함)
                const usage = entry.message.usage;
                if (usage) {
                    inputTokens += usage.input_tokens || 0;
                    cacheReadTokens += usage.cache_read_input_tokens || 0;
                    cacheCreationTokens += usage.cache_creation_input_tokens || 0;
                    outputTokens += usage.output_tokens || 0;
                }

                // tool_use 블록 수 계산
                if (Array.isArray(entry.message.content)) {
                    for (const block of entry.message.content) {
                        if (block.type === 'tool_use') toolUses++;
                    }
                }
            }
        }

        // 비용 계산 (캐시 할인/프리미엄 적용)
        const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
        const totalInputTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
        const estimatedCost =
            inputTokens * pricing.input +
            cacheReadTokens * pricing.input * 0.1 +  // 캐시 읽기 10% 할인
            cacheCreationTokens * pricing.input * 1.25 +  // 캐시 쓰기 25% 프리미엄
            outputTokens * pricing.output;

        return {
            model,
            userMessages,
            assistantMessages,
            toolUses,
            inputTokens: totalInputTokens,
            outputTokens,
            estimatedCost: Math.round(estimatedCost * 100000) / 100000,
            firstMessageAt,
            lastMessageAt,
            lastActivity,
        };
    }

    /**
     * 특정 에이전트의 스캔 통계 반환
     * @param {string} agentId
     * @returns {SessionStats | null}
     */
    getSessionStats(agentId) {
        return this.lastScanResults.get(agentId) || null;
    }

    /**
     * 전체 스캔 결과 반환 (대시보드 API용)
     * @returns {Record<string, SessionStats>}
     */
    getAllStats() {
        return Object.fromEntries(this.lastScanResults);
    }
}

/**
 * @typedef {Object} SessionStats
 * @property {string|null} model
 * @property {number} userMessages
 * @property {number} assistantMessages
 * @property {number} toolUses
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} estimatedCost
 * @property {string|null} firstMessageAt
 * @property {string|null} lastMessageAt
 * @property {string|null} lastActivity
 */

module.exports = SessionScanner;
