/**
 * Pixel Agent Desk - Auto Installation Script
 *
 * Claude CLI 설정에 HTTP 훅을 자동 등록합니다.
 * npm install 시 자동으로 실행됩니다.
 *
 * 실제 등록 로직은 hookRegistration.js에 위임합니다.
 */

const { registerClaudeHooks } = require('./main/hookRegistration');

/**
 * 메인 실행
 */
function main() {
  console.log('=================================');
  console.log('Pixel Agent Desk - 설치 스크립트');
  console.log('=================================\n');

  const debugLog = (msg) => console.log(msg);
  const success = registerClaudeHooks(debugLog);

  if (success) {
    console.log('\n=================================');
    console.log('설치 완료!');
    console.log('=================================\n');
    console.log('다음 명령어로 앱을 실행하세요:');
    console.log('  npm start\n');
  } else {
    console.log('\n⚠️  훅 등록에 실패했습니다.');
    console.log('수동으로 ~/.claude/settings.json을 수정하세요.');
    process.exit(1);
  }
}

// 실행
main();
