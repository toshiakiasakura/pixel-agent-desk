/**
 * P0-3: Error Recovery System - Error Constants
 * 에러 코드, 카테고리, 심각도, 복구 액션 타입 정의
 */

// 에러 카테고리
const ErrorCategory = {
  FILE_IO: 'FILE_IO',
  NETWORK: 'NETWORK',
  PARSE: 'PARSE',
  PERMISSION: 'PERMISSION',
  AGENT_LIFECYCLE: 'AGENT_LIFECYCLE',
  UI_RENDER: 'UI_RENDER',
  HOOK_SERVER: 'HOOK_SERVER',
  UNKNOWN: 'UNKNOWN'
};

// 에러 심각도
const ErrorSeverity = {
  FATAL: 'fatal',      // 앱 계속 실행 불가
  ERROR: 'error',      // 기능 작동하지 않음
  WARNING: 'warning',  // 기능 제한적 작동
  INFO: 'info'         // 정보성
};

module.exports = {
  ErrorCategory,
  ErrorSeverity
};
