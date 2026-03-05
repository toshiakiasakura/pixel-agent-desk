# CLAUDE.md — Pixel Agent Desk

## 현재 진행 상태 (2026-03-06 기준)
- ✅ **Phase 3A:** 데이터 파이프라인 정비 (JSONL 스캐너, 훅 메타데이터 저장) 완료
- ✅ **Phase 3B-1:** SSE 이벤트 스트림 완료
- ✅ **Phase 3B-2:** REST API 확장 완료
- ✅ **Phase 3B-3:** 대시보드 UI 리디자인 완료
- ✅ **Phase 3 전체 완료** — 백엔드 파이프라인 및 대시보드 UI 모두 구현 완료
- ✅ **훅 최적화:** HTTP 훅 전환 (hook.js 프로세스 스폰 제거), tool_name/notification_type/team 필드 추출
- ✅ **PID 정확도:** transcript_path 기반 lsof PID 탐지, 크로스플랫폼 지원 (Windows PowerShell + Linux/macOS pgrep/lsof)
- ✅ **Liveness 간소화:** 타이머 기반 정리 제거, PID 기반 즉시 판단 (2초 주기)
- ✅ **리팩토링:** src/ 폴더 구조 정리, main.js→7개 모듈 분할, renderer.js→7개 모듈 분할
- ✅ **Virtual Office:** 대시보드에 2D 픽셀 아트 가상 오피스 탭 추가 (9개 JS 모듈, A* 패스파인딩, 상태→존 매핑)
- ✅ **레거시 코드 정리:** dead code 제거, MODEL_PRICING 통합(pricing.js), install.js 중복 제거, hooks.jsonl 레거시 코드 제거, office 모듈 var→const/let 전환

## TODO
- **회사 홈페이지 링크 추가:** About 다이얼로그, 트레이 메뉴, 대시보드 푸터 등에 회사 홈페이지 링크 삽입 (광고 아님, 제작자 정보 수준)
- **오피스 폴리시:** 카메라 줌/패닝, 미니맵, 추가 이펙트 개선

## Known Issues
- **ESC 중단 시 Thinking 상태 유지:** 사용자가 ESC로 Claude 응답을 중단하면 Stop 훅이 발생하지 않아 아바타가 Thinking 상태에 머무름. CLI 프로세스는 살아있으므로 PID 기반 Liveness Checker로도 감지 불가.
- **터미널 포커스 순서 꼬임:** 다중 Claude 인스턴스 실행 시 아바타 클릭 → 터미널 포커스가 엉뚱한 터미널로 갈 수 있음. HTTP 훅 전환 후 Claude CLI가 `_pid`를 payload에 포함하지 않아 `detectClaudePidByTranscript()` → 폴백(`detectClaudePidsFallback`)에서 미등록 PID 중 첫 번째를 할당하므로 PID↔세션 매핑이 비결정적. `find-file-owner.ps1`(Restart Manager) 성공 시에는 정확하나 실패 시 꼬임. Claude CLI가 자기 PID를 훅 payload에 넣어주지 않는 한 완벽한 해결 어려움.

## 프로젝트 개요

Claude Code CLI의 상태를 실시간으로 픽셀 아바타로 시각화하는 **Electron 데스크톱 앱**.
Claude CLI 훅 이벤트를 HTTP POST로 수신하고, 에이전트별 상태(Waiting/Thinking/Working/Done/Help/Error)를 스프라이트 애니메이션으로 렌더링한다.

## 기술 스택

- **런타임:** Electron 32+ / Node.js
- **언어:** JavaScript (순수 — TypeScript 없음, 프레임워크 없음)
- **렌더링:** Canvas 기반 스프라이트 애니메이션 (requestAnimationFrame)
- **대시보드:** 순수 HTML/CSS/JS (dashboard.html)
- **검증:** AJV (JSON Schema)
- **테스트:** Jest 30
- **OS:** Windows 전용 (PowerShell 명령 사용)

## 핵심 아키텍처

```
Claude CLI ──HTTP hook──▶ POST(:47821) ──hookProcessor.processHookEvent()
                                                    │
                                    ┌────────────────┤
                                    ▼                ▼
                            AgentManager       Dashboard Server
                             (SSoT)           (:3000, SSE/REST)
                                │                    │
                    ┌───────────┼───────────┐        ├── dashboard.html
                    ▼           ▼           ▼        │    ├── Office 탭 (Canvas 2D)
              renderer/*    dashboard   sessionScanner│    ├── Dashboard 탭
             (픽셀 아바타)   (웹 UI)    (JSONL 분석)  │    └── Tokens 탭
                                                     └── src/office/* (9 모듈)
```

## 파일 구조 & 역할

모든 소스 파일은 `src/` 아래에 위치. HTML/CSS/에셋은 루트에 유지.

### 메인 프로세스 (`src/main/`)

| 파일 | 역할 | 수정 시 주의사항 |
|------|------|----------------|
| `src/main.js` | 오케스트레이터 (~230줄) — 모듈 초기화, 이벤트 연결, 앱 생명주기 | 각 모듈의 팩토리/init 호출 순서 유지 |
| `src/main/hookRegistration.js` | Claude CLI 설정 읽기/쓰기/훅 등록 | Node builtins만 의존 |
| `src/main/hookServer.js` | HTTP 훅 서버 (스키마, AJV, listen) | `additionalProperties: true` 유지 |
| `src/main/hookProcessor.js` | processHookEvent() switch + 헬퍼 | case 순서와 firstPreToolUseDone 로직 유지 |
| `src/main/livenessChecker.js` | PID 탐지, transcript 기반, 2초 주기 체크 | sessionPids Map 소유 |
| `src/main/sessionPersistence.js` | state.json 저장/복구 | agentManager, sessionPids 주입받음 |
| `src/main/windowManager.js` | 메인윈도우, 대시보드윈도우, keep-alive | 대시보드는 `loadURL('http://localhost:3000/')` 사용 (file:// 불가) |
| `src/main/ipcHandlers.js` | 모든 ipcMain.on/handle 등록, focusTerminalByPid | 채널명 변경 금지 |

### 렌더러 (`src/renderer/`) — 브라우저 `<script>` 태그 순서 로드

| 파일 | 역할 | 수정 시 주의사항 |
|------|------|----------------|
| `src/renderer/config.js` | 상수, 스프라이트 설정, 상태 맵, AVATAR_FILES | 글로벌 스코프, AVATAR_FILES는 office-config.js와 동기화 필수 |
| `src/renderer/animationManager.js` | rAF 루프, drawFrame, playAnimation | SHEET, ANIM_SEQUENCES 참조 |
| `src/renderer/agentCard.js` | createAgentCard, updateAgentState | stateConfig, playAnimation 참조 |
| `src/renderer/agentGrid.js` | add/update/remove/layout/resize | agentGrid, updateAgentState 참조 |
| `src/renderer/uiComponents.js` | 대시보드 버튼, 키보드, 컨텍스트 메뉴 | electronAPI 사용 |
| `src/renderer/errorUI.js` | 에러 토스트 UI | electronAPI.executeRecoveryAction 사용 |
| `src/renderer/init.js` | 초기화, visibility 핸들링, 앱 진입점 | 모든 renderer 모듈이 먼저 로드되어야 함 |

### 오피스 뷰 (`src/office/`) — dashboard.html `<script>` 태그 순서 로드

| 파일 | 역할 | 수정 시 주의사항 |
|------|------|----------------|
| `src/office/office-config.js` | 상수, 프레임맵, 좌석설정, 상태매핑, AVATAR_FILES | 글로벌 스코프, AVATAR_FILES는 renderer/config.js와 동기화 필수 |
| `src/office/office-layers.js` | 배경/전경 이미지 로드 (buildOfficeLayers) | loadOfficeImage 재사용 |
| `src/office/office-coords.js` | office_xy/laptop.webp 파싱 → 좌석/idle 좌표 | officeCoords 글로벌 객체 |
| `src/office/office-pathfinder.js` | A* 패스파인딩 (collision.webp 기반) | officePathfinder 글로벌 객체 |
| `src/office/office-sprite.js` | 스프라이트 시트 로드/드로잉/애니메이션 | officeSkinImages 글로벌 배열 |
| `src/office/office-character.js` | 캐릭터 관리, 상태→존 매핑, 좌석배정 | officeCharacters 글로벌 객체 |
| `src/office/office-renderer.js` | Canvas 렌더 루프, 레이어 합성, 이펙트 | officeRenderer 글로벌 객체 |
| `src/office/office-ui.js` | 이름태그, 말풍선, 상태뱃지 | STATE_COLORS 참조 |
| `src/office/office-init.js` | 초기화, SSE 연동, 진입점 | initOffice() 최초 1회만 실행 |

### 오피스 에셋 (`public/office/`)

```
public/office/
  map/
    office_bg_32.webp      # 배경 이미지 (타일맵)
    office_fg_32.webp      # 전경 이미지 (기둥 등, 캐릭터 위에 그려짐)
    office_collision.webp  # 충돌맵 (투명=이동가능, 불투명=벽, 32px 그리드)
    office_xy.webp         # 좌표맵 (초록=idle, 파랑=desk, 노랑=meeting)
  ojects/
    office_laptop.webp             # 랩탑 좌표맵 (색상별 방향)
    office_laptop_{dir}_{state}.webp  # 4방향(front/back/left/right) x 2상태(open/close)
public/characters/
  avatar_0.webp ~ avatar_22.webp   # 24종 캐릭터 (432x256, 9cols x 4rows, 48x64px/frame)
  avatar_09.webp                   # 별도 변형 (0번과 다름)
```

### 공유 모듈 (`src/`)

| 파일 | 역할 | 수정 시 주의사항 |
|------|------|----------------|
| `src/agentManager.js` | 에이전트 상태 관리 (SSoT) | 이벤트명 변경 금지: `agent-added`, `agent-updated`, `agent-removed` |
| `src/sessionScanner.js` | JSONL 파싱 → 토큰/비용 보완 (60초 주기) | 비동기 I/O 필수, 메인 스레드 차단 금지 |
| `src/errorHandler.js` | 에러 캡처 & 분류 | 에러 코드 E001~E010 체계 사용 |
| `src/dashboardAdapter.js` | AgentManager → Dashboard 포맷 변환 | STATE_MAP 변경 시 dashboard.html과 동기화 |
| `src/dashboard-server.js` | REST API + WebSocket 대시보드 서버 | 포트 3000 |
| `src/pricing.js` | MODEL_PRICING, DEFAULT_PRICING, roundCost | hookProcessor.js와 sessionScanner.js에서 공유 |
| `src/utils.js` | 유틸리티 함수 | 순수 함수 모듈 |
| `src/preload.js` | Electron IPC 브릿지 | 채널명 변경 시 renderer와 동기화 필수 |
| `src/dashboardPreload.js` | 대시보드 IPC 브릿지 | |
| `src/hook.js` | Claude CLI stdin → HTTP POST 브릿지 (command 타입 폴백용) | HTTP 훅이 주 경로, 이 스크립트는 command 훅 폴백 |
| `src/sessionend_hook.js` | SessionEnd JSONL 직접 기록 | transcript_path에서 sessionId 파싱 |
| `src/install.js` | npm install 시 훅 자동 등록 | hookRegistration.js에 위임, postinstall 스크립트 |

## 상태 모델

에이전트의 6가지 상태와 전환 규칙:

```
SessionStart → Waiting
UserPromptSubmit → Thinking
PreToolUse (2번째부터) → Working
PostToolUse → Thinking (2.5초 idle → Done)
Stop/TaskCompleted → Done
PostToolUseFailure/Notification/PermissionRequest → Help
SubagentStart → 자식 에이전트 생성 (Working)
SubagentStop → 자식 에이전트 제거
TeammateIdle → Waiting (팀 멤버)
SessionEnd → 에이전트 제거
```

**중요:** 첫 번째 `PreToolUse`는 세션 초기화 탐색이므로 무시해야 한다 (`firstPreToolUseDone` 플래그).

## 코딩 규칙

### 반드시 지켜야 할 것

1. **IPC 채널명 변경 금지** — `agent-added`, `agent-updated`, `agent-removed`, `renderer-ready` 등은 preload.js에 하드코딩되어 있음
2. **session_id 사용** — Claude CLI 훅은 항상 `session_id` (snake_case). JSONL 내부는 `sessionId` (camelCase). 두 형식 모두 대응:
   ```javascript
   const sessionId = data.session_id || data.sessionId;
   ```
3. **Windows 경로 처리** — `transcript_path`에 `~` 포함 가능:
   ```javascript
   const resolved = filePath.startsWith('~')
     ? path.join(os.homedir(), filePath.slice(1))
     : filePath;
   ```
4. **에이전트 수 제한 없음** — 서브에이전트/팀 모드로 50개 이상도 가능. 하드 리밋 추가하지 말 것
5. **processHookEvent() 수정 시** — `src/main/hookProcessor.js`의 switch 문 case 순서와 firstPreToolUseDone 로직 유지
6. **문서 업데이트 규칙** — 개발 진행 후(새로운 기능 구현, 아키텍처 변경 등) 반드시 `CLAUDE.md`의 상단 진행 상태와 `docs/v3-architecture.md` 문서를 동기화/업데이트해야 함
7. **AVATAR_FILES 동기화** — `src/renderer/config.js`와 `src/office/office-config.js`의 `AVATAR_FILES` 배열은 반드시 동일해야 함. 아바타 추가/삭제 시 양쪽 모두 업데이트. `avatarFromAgentId()`/`avatarIndexFromId()` 해시 함수도 동일 알고리즘 유지

### 피해야 할 것

- `fs.readFileSync`를 메인 이벤트 루프에서 큰 파일에 사용하지 말 것 (sessionScanner는 별도 주기)
- `additionalProperties: false`를 hookSchema에 설정하지 말 것 (Claude가 새 필드 추가할 수 있음)
- `src/renderer/` 파일에서 DOM 직접 조작 시 `requestAnimationFrame` 바깥에서 하지 말 것
- 에러 발생 시 `return null` 대신 `errorHandler.capture()` 사용

## 훅 이벤트 필드 (Claude CLI 공식)

**훅 방식: HTTP 훅** (type: "http") — Claude가 직접 localhost:47821/hook으로 POST. hook.js 프로세스 스폰 불필요.

모든 훅 이벤트의 공통 입력:
```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" }
}
```

### 이벤트별 활용 필드

| 이벤트 | 주요 필드 | 용도 |
|--------|----------|------|
| SessionStart | `source` (startup/resume/clear/compact), `model`, `agent_type` | compact 시 중복 에이전트 방지 |
| PreToolUse/PostToolUse | `tool_name` | 아바타 버블에 현재 도구 표시 |
| Notification | `notification_type` (permission_prompt/idle_prompt/auth_success) | Waiting vs Help 구분 |
| Stop/TaskCompleted | `last_assistant_message`, `task_id`, `task_subject` | 마지막 메시지 표시, 팀 작업 추적 |
| SessionEnd | `reason` | 종료 사유 로깅 |
| SubagentStart/Stop | `agent_id`, `agent_type`, `agent_transcript_path` | 서브에이전트 타입 배지 |
| TeammateIdle | `teammate_name`, `team_name` | 팀원 이름/팀명 표시 |
| PreCompact | `trigger` (manual/auto) | 컨텍스트 윈도우 건강 모니터링 |

## 테스트

```bash
npm test                    # 전체 테스트
npm run test:coverage       # 커버리지
npm test -- --testPathPattern="agentManager"  # 특정 파일
```

테스트 파일은 `__tests__/` 디렉토리. 모킹은 `__mocks__/`.

## 실행

```bash
npm install        # 의존성 설치 + 훅 자동 등록
npm start          # Electron 앱 실행
npm run dev        # 개발 모드 (DevTools 포함)
npm run dashboard  # 대시보드 서버만 (포트 3000)
```

## 자동 훅 등록

훅 등록은 **이중으로 자동화**되어 있습니다:

1. **`npm install` 시** - `install.js`가 자동 실행
2. **`npm start` 시** - 앱 시작 시 훅 등록 상태 체크, 미등록 시 자동 등록

### 동작 방식

- **설정 파일:** `~/.claude/settings.json` (Windows/Linux/macOS)
- **등록 내용:** 모든 Claude CLI 훅 이벤트에 HTTP 훅 자동 등록 (type: "http")
- **수동 등록:** 자동 등록이 실패할 경우 `~/.claude/settings.json`을 직접 수정

**수동 등록 예시:**
```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }]
  }
}
```

## 참고 문서

- `docs/v3-architecture.md` — 전체 아키텍처 설계 및 구현 로드맵
- `PRD.md` — 제품 요구사항 (Phase 1~5)

## reffer/ 폴더

Mission Control 참고 프로젝트 (Next.js + SQLite). **레퍼런스 전용 — 코드 수정하지 말 것.** 추후 삭제 예정.
