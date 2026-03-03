# 📋 PRD: Pixel Agent Desk v2

## 목표
Claude CLI 사용 중인 세션을 픽셀 캐릭터로 시각화

## 핵심 기능
1. **JSONL 파일 감시**: `~/.claude/projects/*/` 폴더의 `.jsonl` 파일 실시간 모니터링
2. **멀티 에이전트**: 여러 Claude CLI 세션 동시 표시
3. **상태 시각화**: Working/Done/Waiting/Error 상태에 따른 애니메이션
4. **터미널 포커스**: 에이전트 클릭 시 해당 터미널로 포커스
5. **서브에이전트**: `subagents/agent-*.jsonl` 파일 감지 → 별도 아바타 (보라색 작은 캐릭터)

## 상태 정의
| 상태 | 조건 | 애니메이션 |
|------|------|-----------|
| Working | `stop_reason` 없음 | 일하는 포즈 (frames 1-4) |
| Done | `stop_reason: "end_turn"` | 춤추는 포즈 (frames 20-27) |
| Waiting | 초기 상태 (에이전트 없을 때) | 앉아 있는 포즈 (frame 32) |
| Error | 에러 발생 | 경고 포즈 (frames 0, 31) |

## 에이전트 생명주기
- **표시 조건**: JSONL 파일이 30분 이내 변경된 경우
- **초기 표시**: 앱 시작 시 `Waiting...` 대기 아바타 표시 (에이전트 없을 때)
- **자동 제거**: JSONL mtime 기준 30분 이상 변화 없으면 제거 (5분마다 체크)
- **즉시 제거**: 로그에 `subtype: "SessionEnd"` 감지 시 (현재 Claude CLI가 실제로 안 씀)

## 아키텍처
```
JSONL 파일 (fs.watch)
    ↓
jsonlParser (상태 파싱)
    ↓
agentManager (에이전트 관리)
    ↓
IPC → renderer (UI 표시)
```

## 파일 구조
- `main.js`: Electron 메인 프로세스
- `logMonitor.js`: JSONL 파일 감시
- `jsonlParser.js`: 로그 파싱
- `agentManager.js`: 에이전트 상태 관리
- `renderer.js`: UI 렌더링
- `preload.js`: IPC 브릿지
- `styles.css`: 스타일

## 구현 현황
- ✅ JSONL 파일 감시 (30분 윈도우)
- ✅ 상태 파싱
- ✅ 멀티 에이전트 UI
- ✅ 애니메이션
- ✅ 서브에이전트 시각 구분 (보라색 점선 + Sub 배지)
- ✅ 에이전트 없을 때 대기 아바타 표시
- ✅ 30분 비활성 에이전트 자동 제거

## 미구현 / 고려 중

### Offline 상태 (흐림 표시)
JSONL mtime가 5~30분 사이이면 아바타를 흑백+반투명으로 표시해
"터미널이 닫혔을 수 있다"는 신호를 줌. 30분 초과 시 제거.
- `state-offline` CSS 클래스 (흑백, 점선, opacity 0.5)
- `agentManager.setOffline(id)` 메서드
- 5분마다 mtime 체크

### SessionEnd 훅 → JSONL 직접 기록 방식
HTTP 서버 없이 훅만으로 세션 종료를 즉시 감지하는 방법:

Claude CLI 훅은 실행 시 stdin으로 아래 데이터를 줌:
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/xxx/abc123.jsonl"
}
```

`SessionEnd` 훅 스크립트가 `transcript_path`에 직접 한 줄을 append:
```js
// sessionend_hook.js
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const { transcript_path, session_id } = JSON.parse(Buffer.concat(chunks).toString());
  const fs = require('fs');
  fs.appendFileSync(transcript_path, JSON.stringify({
    type: 'system',
    subtype: 'SessionEnd',
    sessionId: session_id,
    timestamp: new Date().toISOString()
  }) + '\n');
});
```

`logMonitor`의 `fs.watch`가 변경을 즉시 감지 → `SessionEnd` 파싱 → 에이전트 제거.
**HTTP 서버 불필요** — 과거 사용하던 `server.js`도 더 이상 필요 없습니다.

`.claude/settings.json` 훅 등록:
```json
{
  "hooks": {
    "SessionEnd": [{
      "type": "command",
      "command": "node /path/to/sessionend_hook.js"
    }]
  }
}
```

## 실행 방법
```bash
npm install
npm start
```

## 테스트 방법
1. 터미널에서 `claude` 실행
2. 아무 말이나 입력
3. 에이전트 카드 표시 확인
