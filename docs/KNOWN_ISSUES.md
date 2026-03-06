# Known Issues

## 1. 다중 세션 동시 활성화 시 좀비/유령 아바타

**현상**
- Claude CLI를 여러 개 열어둔 상태에서 하나씩 채팅을 시작하면:
  - 좀비 아바타: 다른 세션의 PID를 잘못 할당받아 영구 생존
  - 유령 아바타: PID를 못 잡아 ~20초 후 제거됨 → 다시 채팅하면 재생성 → 반복

**원인**
- PID 탐지 체인의 근본적 한계:
  1. `transcript_path → PID` (lsof/Restart Manager): Windows에서 Claude가 JSONL 파일을 상시 열어두지 않아 탐지 실패
  2. `detectClaudePidsFallback` (모든 claude 프로세스 수집): 다중 세션 시 어떤 PID가 어떤 세션인지 구분 불가 → 오매핑
- PID를 직접 얻을 수 있는 수단이 없음:
  - 훅 `_pid` 필드: 스키마에 정의되어 있으나 **실제로는 전송되지 않음** (2026-03-06 로깅 확인 — 모든 이벤트에서 `_pid=undefined`)
  - JSONL transcript: Claude Code의 대화 기록 파일이지 훅 payload를 기록하지 않아 확인 불가
- 결국 세션↔PID 매핑을 확실히 할 수 있는 방법이 현재 존재하지 않음

**대안 검토**
| 방식 | 문제 |
|------|------|
| `_pid` 훅 필드 | 전송되지 않음 (Claude Code 측 미지원) |
| transcript → lsof | Windows에서 파일 미점유로 탐지 실패 |
| fallback (전체 프로세스) | 다중 세션에서 오매핑 |
| 이벤트 활성도 (`lastActivity`) | 장시간 대기(사용자 입력 대기, 긴 응답)와 실제 종료 구분 불가 |

**근본 해결**
- Claude Code가 훅 payload에 PID를 포함해야 함 — 현재 유일하게 확실한 해법

**재현 조건**
- Claude CLI 인스턴스 3개 이상 열기 (채팅 안 한 상태)
- 하나씩 채팅 시작
- Windows 환경에서 더 잘 재현됨 (transcript→PID 탐지 실패율 높음)

**영향**
- 일반 사용(1~2개 세션)에서는 발생하지 않음
- 발생해도 기능적 문제는 없고 아바타 표시만 불안정
