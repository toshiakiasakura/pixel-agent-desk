# Pixel Agent Desk v2.0 - Implementation Summary

## Overview
Pixel Agent Desk v2.0는 Claude CLI의 JSONL 로그 파일을 실시간으로 파싱하여 여러 개의 에이전트(서브에이전트 포함)를 픽셀 아바타로 시각화하는 앱입니다. 훅(Hook) 시스템이나 로컬 서버를 사용하지 않고 오직 JSONL 로그 파일 감시(Log Tailing)만으로 동작합니다.

## Core Components

### 1. `jsonlParser.js` - JSONL 파싱 엔진
- `~/.claude/projects/` 폴더를 스캔하여 30분 이내 변경된 메인 세션과 서브에이전트 로그 파일을 찾습니다.
- JSONL 파일에서 에이전트 정보 추출 (`sessionId`, `agentId`, `slug`, `projectPath`, `subagents`)
- 에이전트 상태 결정 엔진:
  - **Working**: `type: "progress"` 또는 `tool_use` 발생 시 작업 중
  - **Done**: `stop_reason: "end_turn"` 시 작업 완료, 대기 중
- 역방향 32KB 읽기(`fs.readSync`) 방식으로 대용량 파일도 빠르게 최근 부분만 읽습니다.

### 2. `agentManager.js` - 멀티 에이전트 데이터 관리자
- `id` (sessionId / agentId) 기반 에이전트 생명주기 관리
- 메인 에이전트, 서브에이전트 구분 (`isSubagent: true/false`) 저장
- EventEmitter 기반 `agent-added`, `agent-updated`, `agent-removed` 이벤트 발송

### 3. `logMonitor.js` - 로그 파일 감시자
- `fs.watch` 기반 실시간 파일 변경 감지
- `pendingBuffer`를 사용하여 JSON 객체가 시스템 I/O에 의해 중간에 잘린 상태로 읽혔을 때 복구하여 처리
- 로그에 `subtype="SessionEnd"`가 기록되었을 경우의 조기 종료를 지원 (현재 Claude CLI에서는 출력하지 않으나 HTTP->JSONL 편법 훅을 적용할 수 있는 여지 마련).

### 4. `main.js` - Electron 메인 프로세스
- **윈도우 관리**: 에이전트 수에 따른 동적 크기 조절 기능 포함
- 투명, 클릭 무시 레이어 처리 및 `focusable: false`로 다른 작업 화면 가림 억제
- **30분 타이머 자동 퇴근**: 5분마다 `fs.statSync()`를 사용하여 `logMonitor`가 바라보는 `.jsonl` 파일 `mtime`이 30분 이상 경과한 경우 에이전트를 `removeAgent` 처리합니다.

### 5. `renderer.js` & `styles.css` - UI 렌더러
- **빈 상태 (0 agents) 표출**: 에이전트 목록이 0명이면 화면이 안 보이는 것을 막기 위해 `Waiting...` 대기 아바타(단일 센터)를 표시. 1명 이상 감지되면 카드 뷰(Grid)로 전환.
- **서브에이전트 스타일링**: `.is-subagent` 클래스를 통해 캐릭터 크기 축소 (80%), 점선 테두리, 보라색 색조, `Sub` 배지를 부착.
- `requestAnimationFrame`을 이용해 CSS sprite 이미지 위치 움직임(프레임 애니메이션)을 최적화.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    main.js                              │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ AgentManager │  │  LogMonitor  │                    │
│  │  (Events)    │  │  (JsonlParser)│                    │
│  └──────┬───────┘  └──────┬───────┘                    │
│         │                 │ (1. fs.watch jsonl files)  │
│         └─────────────────┘ (2. remove 30m idle file)  │
│                           │                            │
│                    IPC (Renderer)                       │
└───────────────────────────┼──────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   renderer.js                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Multi-Agent  │  │ Subagents    │  │ 0-Agent Idle │  │
│  │ (Cards Grid) │  │ (Purple Badge│  │ (Wait Pose)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### 1. No Server & Log-Only 100%
- Claude 설정 파일 변경 없이도 `LogMonitor`가 `.claude/projects/`에 접근하여 모든 세션 동작을 감시
- 로컬 웹서버가 없으므로 보안 경고 없음

### 2. Multi & Subagent Hybrid View
- `subagents/` 디렉토리를 깊게 스캔해서 다른 모양으로 렌더링.

### 3. Idle / Auto Clean UI
- 활성 에이전트가 단 1명도 없어도 화면에 빈의자에 앉아있는 에이전트를 표출하여, 이 프로그램이 꺼지지 않았음을 알림

## Testing

1. **기본 작동 테스트**: 아무 터미널 창에서나 `claude` CLI를 켜면 빈 의자에서 메인 에이전트가 튀어나옵니다.
2. **복합 태스크(서브에이전트) 작동 테스트**: 브라우저나 코딩 태스크를 매우 복잡하게 시키면 서브에이전트 `.jsonl`이 생기면서 💜`Sub` 아바타가 별도로 추가됩니다.
3. **타임아웃 감시**: 마지막 명령어 입력 후 30분이 지나면 에이전트 카드가 서서히 화면에서 제거되고, 모든 에이전트가 다 사라지면 빈의자 모드로 바뀝니다.

---

**Version**: 2.0.0 
**Refactored**: 2026-03-04
