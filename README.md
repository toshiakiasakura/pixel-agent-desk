# Pixel Agent Desk v2.0 👾

Claude CLI의 JSONL 로그 파일을 실시간으로 감시하여 여러 에이전트의 상태를 픽셀 아트로 시각화하는 데스크톱 대시보드입니다.

## 🌟 주요 기능

- **Log-Only 아키텍처**: Hook, 로컬 웹서버, 프로세스 스캔 없이 오직 JSONL 로그 파일만 감시 (Read-Only). 
- **멀티 에이전트 및 서브에이전트 지원**: 메인 에이전트 외에도 `subagents/` 폴더 내 서브에이전트를 동시 감지하여 분리된 아바타(보라색)로 표시.
- **실시간 상태 시각화**: 
  - ⚙️ **Working**: 진행 중 (일하는 포즈)
  - ✅ **Done**: 대화 턴 종료 (춤추는 포즈)
  - 💤 **Waiting**: 활성 에이전트가 없을 때 대기 포즈 (의자에 앉아있음)
- **부드러운 에이전트 생명주기**:
  - 활성 에이전트가 하나도 없으면 투명창 대신 대기 픽셀 아바타 한 명을 노출합니다.
  - 로그 파일 수정을 감지하여 자동으로 새 에이전트를 화면에 띄웁니다.
  - 30분 동안 로그 변경이 없으면 자동으로 에이전트를 화면에서 제거합니다.
- **최상단 유지 (Always on Top)**: 화면 최상단에 고정 (`focusable: false`로 포커스 뺏김 방지).

## 🚀 시작하기

### 1. 설치
```bash
npm install
```

### 2. 실행
```bash
npm start
```

### 3. 사용
Claude Code를 터미널에서 실행하면 `~/.claude/projects/`에 JSONL 로그가 자동 생성됩니다. Pixel Agent Desk가 실시간으로 이를 감지하여 화면에 픽셀 캐릭터로 상태를 시각화합니다. 서브에이전트를 생성하는 복잡한 태스크를 요청하면 서브에이전트 아바타도 추가로 등장합니다.

## 📁 프로젝트 구조

```
pixel-agent-desk/
├── main.js           # Electron 메인 프로세스, 동적 윈도우 리사이징, 30분 수명 관리
├── logMonitor.js     # JSONL 파일 감시 (fs.watch, 서브에이전트 식별 추가)
├── jsonlParser.js    # JSONL 파싱 엔진, 역방향 tail 읽기, 30분 내 활성 파일 찾기
├── agentManager.js   # 멀티 에이전트 데이터 관리 (EventEmitter)
├── renderer.js       # 애니메이션 엔진, 에이전트 0개일 때 빈 컨테이너 표출 로직
├── preload.js        # IPC 통신 브릿지
├── index.html        # UI 뼈대 구조
├── styles.css        # 디자인 시스템 (서브에이전트용 보라색 점선 및 크기 스타일 등)
└── package.json      # 의존성 관리
```

## 📋 향후 계획 / 미구현 기능
- **서브에이전트/세션 즉시 종료 훅**: HTTP 서버 대신, CLI 설정에서 JSONL 파일로 `SessionEnd` 이벤트를 직접 append 기록하는 방식의 SessionEnd Hook 적용 가능성 열어둠.
- 터미널 포커스 기능 (현재 Windows Terminal CWD 감지 이슈로 제거됨).
