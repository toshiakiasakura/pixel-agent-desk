# CLAUDE.md — Pixel Agent Desk

Claude Code CLI 상태를 픽셀 아바타로 시각화하는 Electron 앱. 순수 JS, Canvas 렌더링, HTTP 훅(:47821) 수신.
IPC 채널명·hookSchema `additionalProperties: true`·AVATAR_FILES 양쪽 동기화(`renderer/config.js` ↔ `office/office-config.js`) 변경 금지.
`docs/v3-architecture.md` 참조. 테스트: `npm test`. 실행: `npm start`.
