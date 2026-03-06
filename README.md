# Pixel Agent Desk

Claude Code CLI의 훅 이벤트를 실시간으로 수신하여 에이전트 상태를 픽셀 아바타로 시각화하는 Electron 데스크톱 앱입니다.

## Features

- **Pixel Avatar** — 에이전트 상태(Waiting / Thinking / Working / Done / Help / Error)를 스프라이트 애니메이션으로 표시
- **Virtual Office** — 2D 픽셀 아트 가상 오피스에서 캐릭터가 걸어다니며 상태 변화를 시각화 (A* 패스파인딩)
- **Activity Heatmap** — GitHub 잔디 스타일 일별 활동 히트맵
- **Dashboard** — 웹 대시보드로 전체 현황 모니터링 (REST API + SSE)
- **Terminal Focus** — 아바타 클릭 시 해당 Claude 세션의 터미널 창을 최상단으로 활성화
- **Auto Recovery** — 앱 재시작 시 실행 중인 Claude 세션을 자동 복구
- **Sub-agent & Team** — 서브에이전트·팀 모드 지원, 에이전트 수 제한 없음

## Tech Stack

- **Runtime:** Electron 32+ / Node.js
- **Language:** JavaScript (no TypeScript, no framework)
- **Rendering:** Canvas sprite animation (requestAnimationFrame)
- **Validation:** AJV (JSON Schema)
- **Test:** Jest 30

## Quick Start

```bash
npm install   # 의존성 설치 + Claude CLI 훅 자동 등록
npm start     # Electron 앱 실행
```

> `npm install` 시 `~/.claude/settings.json`에 HTTP 훅이 자동 등록됩니다.
> 앱 시작 시에도 미등록 상태면 재등록합니다 (이중 보장).

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Electron 앱 실행 |
| `npm run dev` | 개발 모드 (DevTools 포함) |
| `npm run dashboard` | 대시보드 서버만 실행 (http://localhost:3000) |
| `npm test` | 테스트 실행 |
| `npm run test:coverage` | 커버리지 리포트 |

## Architecture

```
Claude CLI ──HTTP hook──> POST(:47821) ──hookProcessor
                                            │
                              ┌─────────────┤
                              v             v
                        AgentManager   Dashboard Server
                          (SSoT)       (:3000, SSE/REST)
                            │               │
                  ┌─────────┼─────────┐     ├── Office Tab (Canvas 2D)
                  v         v         v     ├── Dashboard Tab
            renderer/*  dashboard  scanner  └── Tokens Tab
           (pixel avatar) (web UI) (JSONL)
```

## Project Structure

```
src/
├── main.js                    # 앱 오케스트레이터
├── main/
│   ├── hookServer.js          # HTTP 훅 서버 (:47821)
│   ├── hookProcessor.js       # 이벤트 처리 로직
│   ├── hookRegistration.js    # Claude CLI 훅 자동 등록
│   ├── livenessChecker.js     # PID 기반 생존 체크
│   ├── windowManager.js       # Electron 윈도우 관리
│   ├── ipcHandlers.js         # IPC 핸들러
│   └── sessionPersistence.js  # 상태 영속화
├── renderer/                  # 픽셀 아바타 UI (7 modules)
├── office/                    # 가상 오피스 뷰 (9 modules)
├── agentManager.js            # 에이전트 상태 관리 (SSoT)
├── sessionScanner.js          # JSONL 토큰/비용 분석
├── heatmapScanner.js          # 일별 활동 히트맵 집계
├── dashboard-server.js        # 대시보드 웹 서버
└── pricing.js                 # 모델별 토큰 가격
```

## State Model

```
SessionStart       → Waiting
UserPromptSubmit   → Thinking
PreToolUse (2nd+)  → Working
PostToolUse        → Thinking (2.5s idle → Done)
Stop/TaskCompleted → Done
Notification       → Help
SessionEnd         → Remove
```

## Hook Registration

훅은 `~/.claude/settings.json`에 HTTP 타입으로 등록됩니다:

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }]
  }
}
```

자동 등록이 실패할 경우 위 형식으로 수동 등록할 수 있습니다.

## License

MIT
