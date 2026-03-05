# Pixel Agent Desk v3.0 — 종합 아키텍처 & 구현 가이드

**작성일:** 2026-03-05  
**작성자:** Antigravity (Architecture Review)  
**목적:** Sonnet/GLM 등 구현 모델이 바로 작업 가능한 수준의 설계 문서

**진행 상태 (2026-03-06 업데이트):**
- ✅ **Phase 3A:** 데이터 파이프라인 정비 완료 (2026-03-05)
- ✅ **Phase 3B-1:** 대시보드 서버 고도화(SSE, API) 완료 (2026-03-05)
- ✅ **Phase 3B-2:** REST API 확장 완료 (2026-03-05)
- ✅ **Phase 3B-3:** 대시보드 UI 리디자인 완료 (2026-03-05)
- ✅ **리팩토링:** src/ 폴더 구조, main.js→7개 모듈, renderer.js→7개 모듈 분할 (2026-03-06)
- ✅ **Virtual Office:** 대시보드에 2D 픽셀 아트 가상 오피스 탭 추가 (2026-03-06)
  - 9개 JS 모듈 (`src/office/*`): config, layers, coords, pathfinder, sprite, character, renderer, ui, init
  - A* 패스파인딩 (collision.webp 기반 32px 그리드)
  - 상태→존 매핑 (working→desk, idle→break area), 좌석 배정, Y-sort 렌더링
  - 스프라이트 애니메이션 (sit/walk/dance/idle), 말풍선, 이름태그, 이펙트 (confetti/warning/focus)
  - 태스크바 펫 ↔ 오피스 아바타 동기화 (결정적 해시 `avatarIndexFromId()`)
- ✅ **레거시 코드 정리** (2026-03-06)
  - Dead code 제거 (utils.js, dashboardAdapter.js, errorConstants.js, dashboardPreload.js)
  - MODEL_PRICING 통합 (`src/pricing.js`), install.js ↔ hookRegistration.js 중복 제거
  - hooks.jsonl 레거시 코드 제거 (hook.js, sessionPersistence.js)
  - Office 모듈 var→const/let 전환, pixel_office/ 디렉토리 삭제

---

## 1. 프로젝트 개요

### 1.1 현재 상태 (As-Is)

Pixel Agent Desk는 **Electron 기반 데스크톱 앱**으로, Claude Code CLI의 상태를 실시간으로 픽셀 아바타로 시각화한다.

**핵심 구성요소:**

| 컴포넌트 | 파일 | 역할 |
|---------|------|------|
| Main Orchestrator | `src/main.js` (~230줄) | 모듈 초기화, 이벤트 연결, 앱 생명주기 |
| Hook Registration | `src/main/hookRegistration.js` | Claude CLI 설정 읽기/쓰기/훅 등록 |
| Hook Server | `src/main/hookServer.js` | HTTP 훅 서버 (스키마, AJV) |
| Hook Processor | `src/main/hookProcessor.js` | processHookEvent() switch + 헬퍼 |
| Liveness Checker | `src/main/livenessChecker.js` | PID 탐지, 2초 주기 체크 |
| Session Persistence | `src/main/sessionPersistence.js` | state.json 저장/복구 |
| Window Manager | `src/main/windowManager.js` | 메인/대시보드 윈도우 관리 |
| IPC Handlers | `src/main/ipcHandlers.js` | 모든 IPC 핸들러 |
| Renderer (7 modules) | `src/renderer/*.js` | 픽셀 아바타, 그리드, 키보드, 에러 UI |
| Hook Script | `src/hook.js` | Claude CLI stdin → HTTP POST 브릿지 (command 타입 폴백용) |
| Agent Manager | `src/agentManager.js` (218줄) | 에이전트 상태 관리, 이벤트 에밋 |
| Dashboard Server | `src/dashboard-server.js` (497줄) | REST API + WebSocket 대시보드 |
| Dashboard UI | `dashboard.html` (18KB) | 웹 대시보드 (단순 HTML) |
| Virtual Office | `src/office/*.js` (9개) | 2D 픽셀 아트 가상 오피스 (Canvas) |

**현재 상태 흐름:**
```
Claude CLI ──HTTP hook──▶ POST(:47821) ──▶ hookProcessor.processHookEvent()
                                                    │
                                    ┌────────────────┤
                                    ▼                ▼
                            agentManager       dashboard-server
                                │                    │
                                ▼                    ▼
                          renderer/*           dashboard.html
                        (픽셀 아바타)        (웹 대시보드 + Office 뷰)
```

### 1.2 참고 프로젝트: Mission Control (삭제됨)

> Mission Control (reffer/ 디렉토리)은 참고 후 삭제되었습니다. 아래는 참고한 핵심 기능 목록입니다.

| 기능 | Mission Control 구현 | 우리 프로젝트 적용 현황 |
|------|---------------------|----------------------|
| **Claude 세션 스캔** | `claude-sessions.ts` — JSONL 파싱 | ✅ `sessionScanner.js` 구현 완료 |
| **실시간 이벤트** | SSE (`/api/events`) + EventBus | ✅ SSE 스트림 구현 완료 |
| **오피스 시각화** | `office-panel.tsx` — 2D 타일맵, A* | ✅ `src/office/*` 9개 모듈 구현 완료 |
| **토큰/비용 추적** | `token_usage` 테이블 | ✅ PostToolUse + JSONL 스캔 이중 추적 |
| **상태 관리** | Zustand store | ✅ EventEmitter + SSE 기반 동기화 |

### 1.3 Claude Code Hooks 최신 사양 (공식 문서 기반)

**공통 입력 필드 (모든 훅 이벤트):**
```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

**새로 추가/확인된 필드:**
- `source` (SessionStart): `"startup"`, `"resume"`, `"clear"`, `"compact"`
- `model` (SessionStart): 사용 중인 모델명
- `agent_type` (SessionStart): `--agent` 사용 시 에이전트 타입
- `agent_id`: `--agent` 모드에서의 에이전트 식별자

**훅 타입 4가지:**
1. `command` — 셸 명령 (기존 우리 방식)
2. `http` — HTTP POST (우리가 하이브리드로 사용 중)
3. `prompt` — LLM 평가 (신규)
4. `agent` — 서브에이전트 생성 (신규)

---

## 2. 이전 코드 문제점 & 해결 현황

> 아래 항목들은 Phase 3A/3B 작업에서 모두 해결되었습니다.

### 2.1 훅 데이터 처리 — ✅ 해결
- 스키마가 `hookServer.js`에서 올바른 필드명(`hook_event_name`, `session_id`, `tool_name` 등)으로 수정됨
- `additionalProperties: true` 유지 (Claude가 새 필드 추가할 수 있으므로)

### 2.2 transcript_path 활용 — ✅ 해결
- `hookProcessor.js`에서 `data.transcript_path`를 `jsonlPath`로 저장
- `sessionScanner.js`가 60초 주기로 JSONL 파싱하여 토큰/비용 보완

### 2.3 이중 sessionId — ✅ 해결
- `session_id` (Claude CLI, snake_case) 우선 사용, `sessionId` (JSONL, camelCase) 폴백
- `const sessionId = data.session_id || data.sessionId;` 패턴으로 통일

---

## 3. 최종 제품 아키텍처 (To-Be)

### 3.1 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                      Claude Code CLI                             │
│  (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStart...) │
└──────────┬──────────────────────────────────────┬────────────────┘
           │ hook.js (command)                     │ ~/.claude/projects/
           │ stdin → HTTP POST                     │ JSONL 세션 로그
           ▼                                       ▼
┌──────────────────────┐              ┌────────────────────────┐
│  Hook HTTP Server    │              │  Session Scanner       │
│  :47821/hook         │              │  (60초 주기 폴링)       │
│  실시간 이벤트 수신    │              │  transcript_path 파싱   │
└──────────┬───────────┘              └────────────┬───────────┘
           │                                       │
           ▼                                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    State Manager (통합)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ AgentState   │  │ SessionData  │  │ TokenUsage          │ │
│  │ Map<id,agent>│  │ JSONL 분석   │  │ 입력/출력/비용 추적  │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼─────────────────────┼────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Pixel Avatar    │ │  Web Dashboard   │ │  SSE Event       │
│  (Electron)      │ │  (localhost:3000) │ │  Stream          │
│  renderer.js     │ │  dashboard.html   │ │  /api/events     │
│  스프라이트 애니   │ │  차트/통계/타임라인│ │  실시간 푸시      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 3.2 상태 생명주기 (State Lifecycle)

```
                    ┌──────────────────────────────────────────┐
                    │           SessionStart                    │
                    │  source: startup/resume/clear/compact     │
                    └──────────────┬───────────────────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │         Waiting               │
                    │  (세션 시작, 사용자 입력 대기)   │
                    └──────────────┬───────────────┘
                                   │ UserPromptSubmit
                                   ▼
                    ┌──────────────────────────────┐
              ┌────▶│         Thinking              │◀────────┐
              │     │  (사용자 입력 받음, 응답 생성중) │         │
              │     └──────────────┬───────────────┘         │
              │                    │ PreToolUse (2번째부터)    │
              │                    ▼                          │
              │     ┌──────────────────────────────┐         │
              │     │         Working               │         │
              │     │  (도구 실행 중)                 │         │
              │     └──────────────┬───────────────┘         │
              │                    │ PostToolUse              │
              │                    ├─────────────────────────┘
              │                    │ (2.5초 idle → Done)
              │                    ▼
              │     ┌──────────────────────────────┐
              │     │         Done                  │
              │     │  (Stop/TaskCompleted)          │
              │     └──────────────┬───────────────┘
              │                    │ UserPromptSubmit
              │                    │ (다음 턴)
              └────────────────────┘

  ※ PostToolUseFailure/Notification/PermissionRequest → Help
  ※ SubagentStart → 자식 에이전트 생성 (Working)
  ※ SubagentStop → 자식 에이전트 제거
  ※ TeammateIdle → Waiting (팀 멤버)
  ※ SessionEnd → 에이전트 제거
```

### 3.3 아바타 ↔ 대시보드 상태 동기화

**동기화 전략: 단일 진실 소스 (Single Source of Truth)**

```
AgentManager (SSoT)
    │
    ├── emit('agent-added')    ──▶ renderer.js (IPC)  ──▶ 아바타 생성
    ├── emit('agent-updated')  ──▶ renderer.js (IPC)  ──▶ 애니메이션 변경
    ├── emit('agent-removed')  ──▶ renderer.js (IPC)  ──▶ 아바타 제거
    │
    ├── broadcastUpdate()      ──▶ SSE stream          ──▶ 대시보드 실시간
    └── REST API (/api/agents) ──▶ 대시보드 폴링 폴백
```

**상태 매핑 (아바타 ↔ 대시보드):**

| AgentManager 상태 | 아바타 애니메이션 | 대시보드 표시 | 색상 |
|-------------------|-----------------|-------------|------|
| `Waiting` | idle_blink | 🟡 Waiting | `#f59e0b` |
| `Thinking` | thinking_dots | 💭 Thinking | `#8b5cf6` |
| `Working` | typing_fast | 💻 Working | `#3b82f6` |
| `Done` | celebration | ✅ Done | `#22c55e` |
| `Help` | alert_bounce | ⚠️ Help | `#ef4444` |
| `Error` | error_shake | 🔴 Error | `#dc2626` |

### 3.4 실시간성 확보 전략

**하이브리드 접근: 훅(Push) + 로그 스캔(Poll)**

| 채널 | 방식 | 지연 | 용도 |
|------|------|------|------|
| HTTP Hook | Push (즉시) | <100ms | 상태 전환 (Working, Done, Help) |
| JSONL 스캔 | Poll (60초) | ~60초 | 토큰 사용량, 세션 메타데이터, 비용 |
| PID Liveness | Poll (10초) | ~10초 | 프로세스 생존 확인, 유령 에이전트 제거 |
| SSE Stream | Push (즉시) | <50ms | 대시보드 UI 실시간 업데이트 |

```javascript
// 실시간 계층 구조
// Layer 1: HTTP Hook (즉시) — 상태 변경의 주 채널
processHookEvent(data) → agentManager.updateAgent() → emit events

// Layer 2: JSONL Scanner (60초) — 보조 데이터 보강
scanTranscripts() → 토큰 사용량, 대화 통계, 비용 계산

// Layer 3: Liveness Checker (10초) — 안정성 보장
checkLiveness() → 프로세스 종료 감지, 유령 에이전트 정리

// Layer 4: SSE/WebSocket (즉시) — UI 전파
agentManager.on('*') → SSE broadcast → 대시보드 갱신
```

---

## 4. 구현 로드맵

### Phase 3A: 데이터 파이프라인 정비 (완료 ✅)

#### Task 3A-1: 훅 스키마 수정 (완료 ✅)
**파일:** `main.js:startHookServer()` (491-580줄)

```javascript
// 수정 대상: hookSchema 객체
const hookSchema = {
  type: 'object',
  required: ['hook_event_name'],
  properties: {
    hook_event_name: {
      type: 'string',
      enum: [
        'SessionStart', 'SessionEnd', 'UserPromptSubmit',
        'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
        'Stop', 'TaskCompleted', 'PermissionRequest', 'Notification',
        'SubagentStart', 'SubagentStop', 'TeammateIdle',
        'ConfigChange', 'WorktreeCreate', 'WorktreeRemove',
        'PreCompact', 'InstructionsLoaded'
      ]
    },
    session_id: { type: 'string' },
    transcript_path: { type: 'string' },
    cwd: { type: 'string' },
    permission_mode: { type: 'string' },
    tool_name: { type: 'string' },
    tool_input: { type: 'object' },
    tool_response: { type: 'object' },
    source: { type: 'string' },
    model: { type: 'string' },
    agent_type: { type: 'string' },
    agent_id: { type: 'string' },
    _pid: { type: 'number' },
    _timestamp: { type: 'number' }
  },
  additionalProperties: true  // Claude가 새 필드 추가할 수 있으므로 유지
};
```

#### Task 3A-2: transcript_path 활용 (완료 ✅)
**파일:** `main.js:processHookEvent()` (369-489줄), `agentManager.js`

```javascript
// main.js — SessionStart 핸들러 수정
case 'SessionStart':
  handleSessionStart(sessionId, data.cwd || '', data._pid || 0);
  // 추가: 메타데이터 저장
  if (agentManager) {
    agentManager.updateAgent({
      sessionId,
      projectPath: data.cwd,
      jsonlPath: data.transcript_path,     // ★ 핵심 추가
      model: data.model,                    // ★ 모델 정보
      permissionMode: data.permission_mode,  // ★ 권한 모드
      source: data.source,                   // ★ startup/resume
      agentType: data.agent_type,            // ★ 에이전트 타입
      state: 'Waiting'
    }, 'hook');
  }
  break;
```

```javascript
// agentManager.js — 새 필드 추가
const agentData = {
  // ... 기존 필드
  model: entry.model || (existingAgent ? existingAgent.model : null),
  permissionMode: entry.permissionMode || (existingAgent ? existingAgent.permissionMode : null),
  source: entry.source || (existingAgent ? existingAgent.source : null),
  agentType: entry.agentType || (existingAgent ? existingAgent.agentType : null),
  // 토큰 사용량 추적
  tokenUsage: {
    inputTokens: existingAgent?.tokenUsage?.inputTokens || 0,
    outputTokens: existingAgent?.tokenUsage?.outputTokens || 0,
    estimatedCost: existingAgent?.tokenUsage?.estimatedCost || 0,
  },
};
```

#### Task 3A-3: 토큰 사용량 추출 (완료 ✅)
**파일:** `main.js:processHookEvent()` — PostToolUse 핸들러

```javascript
case 'PostToolUse': {
  if (agentManager && firstPreToolUseDone.has(sessionId)) {
    const agent = agentManager.getAgent(sessionId);
    if (agent) {
      // ★ 토큰 사용량 추출
      const tokenUsage = data.tool_response?.token_usage;
      if (tokenUsage) {
        const currentUsage = agent.tokenUsage || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
        const inputTokens = currentUsage.inputTokens + (tokenUsage.input_tokens || 0);
        const outputTokens = currentUsage.outputTokens + (tokenUsage.output_tokens || 0);
        const pricing = MODEL_PRICING[agent.model] || DEFAULT_PRICING;
        const estimatedCost = inputTokens * pricing.input + outputTokens * pricing.output;
        
        agentManager.updateAgent({
          ...agent, sessionId,
          state: 'Thinking',
          tokenUsage: { inputTokens, outputTokens, estimatedCost }
        }, 'hook');
      } else {
        agentManager.updateAgent({ ...agent, sessionId, state: 'Thinking' }, 'hook');
      }
    }
  }
  scheduleIdleDone(sessionId);
  break;
}
```

#### Task 3A-4: JSONL 세션 스캐너 (완료 ✅)
**새 파일:** `sessionScanner.js`

```javascript
/**
 * Session Scanner — Mission Control의 claude-sessions.ts를 참고한 구현
 * transcript_path로 JSONL 파일을 읽어 세션 통계를 추출
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};
const DEFAULT_PRICING = { input: 3 / 1_000_000, output: 15 / 1_000_000 };

class SessionScanner {
  constructor(agentManager) {
    this.agentManager = agentManager;
    this.scanInterval = null;
    this.lastScanResults = new Map(); // sessionId → stats
  }

  start(intervalMs = 60000) {
    this.scanInterval = setInterval(() => this.scanAll(), intervalMs);
    this.scanAll(); // 즉시 1회 실행
  }

  stop() {
    if (this.scanInterval) clearInterval(this.scanInterval);
  }

  scanAll() {
    const agents = this.agentManager.getAllAgents();
    for (const agent of agents) {
      if (agent.jsonlPath) {
        try {
          const stats = this.parseSessionFile(agent.jsonlPath);
          if (stats) {
            this.lastScanResults.set(agent.id, stats);
            // 토큰 사용량 업데이트 (훅에서 못 잡은 것 보완)
            if (stats.inputTokens > (agent.tokenUsage?.inputTokens || 0)) {
              this.agentManager.updateAgent({
                ...agent,
                tokenUsage: {
                  inputTokens: stats.inputTokens,
                  outputTokens: stats.outputTokens,
                  estimatedCost: stats.estimatedCost,
                }
              }, 'scanner');
            }
          }
        } catch (e) { /* 로그 */}
      }
    }
  }

  parseSessionFile(filePath) {
    // Mission Control의 parseSessionFile() 패턴 참고
    const resolvedPath = filePath.replace(/^~/, os.homedir());
    if (!fs.existsSync(resolvedPath)) return null;
    
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    
    let model = null, userMessages = 0, assistantMessages = 0;
    let toolUses = 0, inputTokens = 0, outputTokens = 0;
    let cacheReadTokens = 0, cacheCreationTokens = 0;
    let firstMessageAt = null, lastMessageAt = null;
    
    for (const line of lines) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      
      if (entry.timestamp) {
        if (!firstMessageAt) firstMessageAt = entry.timestamp;
        lastMessageAt = entry.timestamp;
      }
      if (entry.isSidechain) continue;
      
      if (entry.type === 'user') userMessages++;
      if (entry.type === 'assistant' && entry.message) {
        assistantMessages++;
        if (entry.message.model) model = entry.message.model;
        const usage = entry.message.usage;
        if (usage) {
          inputTokens += (usage.input_tokens || 0);
          cacheReadTokens += (usage.cache_read_input_tokens || 0);
          cacheCreationTokens += (usage.cache_creation_input_tokens || 0);
          outputTokens += (usage.output_tokens || 0);
        }
        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'tool_use') toolUses++;
          }
        }
      }
    }
    
    const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
    const totalInputTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    const estimatedCost =
      inputTokens * pricing.input +
      cacheReadTokens * pricing.input * 0.1 +
      cacheCreationTokens * pricing.input * 1.25 +
      outputTokens * pricing.output;
    
    return {
      model, userMessages, assistantMessages, toolUses,
      inputTokens: totalInputTokens, outputTokens,
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
      firstMessageAt, lastMessageAt,
    };
  }

  getSessionStats(agentId) {
    return this.lastScanResults.get(agentId) || null;
  }

  getAllStats() {
    return Object.fromEntries(this.lastScanResults);
  }
}

module.exports = SessionScanner;
```

### Phase 3B: 대시보드 고도화 (완료 ✅)

#### Task 3B-1: SSE 이벤트 스트림 추가 (완료 ✅)
**파일:** `dashboard-server.js` — SSE 엔드포인트 추가

```javascript
// /api/events — SSE 스트림 (Mission Control의 event-bus.ts 패턴)
if (url.pathname === '/api/events') {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  // 초기 연결 확인
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);
  
  // AgentManager 이벤트 리스너
  const onAgentAdded = (agent) =>
    res.write(`data: ${JSON.stringify({ type: 'agent.created', data: adaptAgentToDashboard(agent), timestamp: Date.now() })}\n\n`);
  const onAgentUpdated = (agent) =>
    res.write(`data: ${JSON.stringify({ type: 'agent.updated', data: adaptAgentToDashboard(agent), timestamp: Date.now() })}\n\n`);
  const onAgentRemoved = (data) =>
    res.write(`data: ${JSON.stringify({ type: 'agent.removed', data, timestamp: Date.now() })}\n\n`);
  
  agentManager.on('agent-added', onAgentAdded);
  agentManager.on('agent-updated', onAgentUpdated);
  agentManager.on('agent-removed', onAgentRemoved);
  
  // Keep-alive
  const keepAlive = setInterval(() =>
    res.write(`: keepalive\n\n`), 15000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    agentManager.off('agent-added', onAgentAdded);
    agentManager.off('agent-updated', onAgentUpdated);
    agentManager.off('agent-removed', onAgentRemoved);
  });
  return;
}
```

#### Task 3B-2: REST API 확장 (완료 ✅)
**파일:** `dashboard-server.js`

```javascript
// 추가 API 엔드포인트
// GET /api/agents — 에이전트 목록 (어댑터 적용)
// GET /api/agents/:id — 에이전트 상세 (토큰 사용량 포함)
// GET /api/stats — 전체 통계 (상태별, 프로젝트별, 비용)
// GET /api/timeline — 작업 타임라인 (시간순 상태 변경 이력)
// GET /api/health — 시스템 상태 (업타임, 메모리, 연결 수)
// POST /api/agents/:id/dismiss — 에이전트 수동 제거
// GET /api/sessions — JSONL 스캔 결과 (토큰, 비용, 세션 메타)
```

#### Task 3B-3: 대시보드 UI 리디자인 (완료 ✅)
**파일:** `dashboard.html` (SSE 기반 완전 재작성)

**구현된 기능:**
- EventSource를 사용한 SSE 연결 (`/api/events`)
- 실시간 에이전트 상태 업데이트 (화면 깜빡임 없는 DOM 갱신)
- 3개 뷰: 개요, 에이전트, 토큰
- Stats Grid: 전체 에이전트 수, 활성 에이전트, 완료된 작업, 총 비용
- Agent Cards: 상태 뱃지, 프로젝트명, 모델, 작업 시간, 토큰 사용량
- Token Chart: 에이전트별 토큰 사용량 시각화 (CSS 바 차트)
- Live Feed: 실시간 이벤트 로그 (사이드바)
- 프로젝트별 에이전트 그룹화
- 반응형 디자인 (모바일 지원)

**대시보드 구성:**
```
┌─────────────────────────────────────────────────────────┐
│ 📊 Pixel Agent Desk — Mission Control                    │
├─────────┬───────────────────────────────────────────────┤
│         │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ 사이드   │  │ Active │ │ Total  │ │ Tokens │ │  Cost  │ │
│ 바      │  │   3    │ │   5    │ │  45.2K │ │ $1.23  │ │
│         │  └────────┘ └────────┘ └────────┘ └────────┘ │
│ ● Overview│                                              │
│ ○ Agents │  ┌──────────────────────────────────────────┐ │
│ ○ Timeline│  │         에이전트 카드 그리드              │ │
│ ○ Tokens │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │
│ ○ Settings│  │  │ 🟢 Alice│ │ 💻 Bob  │ │ ⚠️ Carol│    │ │
│          │  │  │ Done    │ │ Working │ │  Help   │    │ │
│          │  │  │ 12.3K ¢ │ │ 8.1K ¢  │ │ 5.2K ¢  │    │ │
│          │  │  └─────────┘ └─────────┘ └─────────┘    │ │
│          │  └──────────────────────────────────────────┘ │
│          │                                               │
│ ● Events │  ┌──────────────────────────────────────────┐ │
│ (Live)   │  │      타임라인 / 토큰 차트 영역             │ │
│  12:01   │  │  ████████████░░░░░░ Working: 60%         │ │
│  12:00   │  │  ████░░░░░░░░░░░░░ Done: 20%             │ │
│  11:59   │  └──────────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────┘
```

**핵심 UI 컴포넌트:**

1. **Stats Grid** — 활성 에이전트 수, 총 토큰, 비용, 에러 수
2. **Agent Cards** — 상태 뱃지, 프로젝트명, 모델, 작업 시간, 토큰 사용량
3. **Timeline** — 시간축 기반 에이전트별 상태 변경 시각화 (CSS bar chart)
4. **Live Feed** — SSE 기반 실시간 이벤트 로그
5. **Token Chart** — 에이전트별/모델별 토큰 사용량 바 차트

---

## 5. 구현 스택 & 기술 결정

### 5.1 기술 스택

| 계층 | 현재 | 변경/추가 |
|------|------|----------|
| 런타임 | Electron + Node.js | 유지 |
| 아바타 렌더링 | Canvas 스프라이트 | 유지 (requestAnimationFrame) |
| 대시보드 UI | 순수 HTML/CSS/JS | 유지 (프레임워크 불필요) |
| 실시간 통신 | WebSocket (수동) | **SSE 추가** (대시보드용) |
| 상태 관리 | EventEmitter | 유지 + 이벤트 타입 강화 |
| 데이터 저장 | JSON (state.json) | 유지 (소프트 리밋 50, 차단 없음) |
| 세션 분석 | 없음 | **JSONL 스캐너 추가** |
| 검증 | AJV | AJV 스키마 수정 |
| 차트 | 없음 | **CSS-only 바 차트** |

### 5.2 Mission Control에서 가져오지 않는 것

| 기능 | 이유 |
|------|------|
| Next.js/React | 우리 프로젝트는 Electron + 바닐라 JS, 오버킬 |
| SQLite | 일반적인 사용 범위에서는 JSON 충분 (50개 초과 시 재검토) |
| Zustand | Electron IPC 기반 상태 관리로 충분 |
| Auth/RBAC | 로컬 데스크톱 앱, 인증 불필요 |
| Tailwind CSS | 기존 vanilla CSS 유지 |

---

## 6. 파일별 수정 가이드 (구현 모델용)

### 수정 파일 목록

| 파일 | 작업 | 우선순위 | 예상 시간 |
|------|------|---------|----------|
| `main.js` | hookSchema 수정, processHookEvent에 메타데이터 추가 | P0 | 4h |
| `agentManager.js` | 새 필드(model, tokenUsage 등) 추가 | P0 | 3h |
| `hook.js` | JSON 파싱 에러 로깅 추가 | P0 | 1h |
| `dashboardAdapter.js` | 토큰/비용/모델 필드 매핑 추가 | P0 | 2h |
| `dashboard-server.js` | SSE 엔드포인트, API 확장 | P1 | 6h |
| `dashboard.html` | UI 리디자인 (Stats, Cards, Timeline) | P1 | 12h |
| **`sessionScanner.js`** | **신규** — JSONL 세션 분석기 | P1 | 8h |

### 주의사항

1. **`main.js`는 1266줄** — 함수 단위로 정확하게 수정할 것
2. **IPC 채널 호환성** — `preload.js`에 등록된 채널명 변경 금지
3. **renderer.js 상태 매핑** — `updateAgentState()` 함수의 switch 문에 새 상태 추가 시 기존 애니메이션 유지
4. **Windows 경로** — `transcript_path`에 `~` 포함 가능, `os.homedir()`로 변환 필요
5. **비동기 I/O** — JSONL 파일 읽기는 반드시 async, 메인 스레드 차단 금지

---

## 7. 검증 체크리스트

### Phase 3A 완료 기준 (완료 ✅)

- [x] Claude CLI 훅에서 `transcript_path`, `model`, `source` 정상 수신
- [x] `agentManager.getAgent(id).model`로 모델 정보 확인 가능
- [x] `agentManager.getAgent(id).tokenUsage`로 토큰 사용량 확인 가능
- [x] JSONL 스캐너가 60초 주기로 세션 통계 갱신
- [x] `tool_name` 필드명으로 스키마 수정 확인
- [x] `session_id` vs `sessionId` 이중 필드 정리 (컨벤션 통일)

### Phase 3B 완료 기준 (완료 ✅)

- [x] `GET /api/events` SSE 스트림 정상 동작
- [x] 대시보드에서 에이전트 상태 변경 실시간 반영 (<1초)
- [x] 토큰 사용량 및 비용 표시
- [x] 토큰 차트 시각화 정상 렌더링
- [x] 에이전트 카드에 모델명, 프로젝트명, 작업시간 표시

---

> **이 문서는 구현 모델(Sonnet/GLM)이 바로 작업할 수 있도록 설계되었습니다.**  
> 각 Task의 파일명, 줄 번호, 코드 스니펫을 참고하여 순차적으로 구현하세요.
