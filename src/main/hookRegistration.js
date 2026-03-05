/**
 * Claude CLI Hook Registration
 * Claude CLI 설정 파일에서 HTTP 훅을 읽기/쓰기/등록
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const HOOK_SERVER_PORT = 47821;

function getClaudeConfigPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function readClaudeConfig(debugLog) {
  try {
    const configPath = getClaudeConfigPath();
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    debugLog(`[Hook] Claude 설정 읽기 실패: ${error.message}`);
  }
  return {};
}

function writeClaudeConfig(config, debugLog) {
  try {
    const configPath = getClaudeConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    debugLog('[Hook] Claude 설정 파일 업데이트 완료');
    return true;
  } catch (error) {
    debugLog(`[Hook] Claude 설정 쓰기 실패: ${error.message}`);
    return false;
  }
}

function isHookRegistered(debugLog) {
  const config = readClaudeConfig(debugLog);
  const HTTP_HOOK_URL = `http://localhost:${HOOK_SERVER_PORT}/hook`;

  if (!config.hooks) {
    return false;
  }

  const hookEvents = ['SessionStart', 'PreToolUse', 'PostToolUse'];
  for (const event of hookEvents) {
    if (config.hooks[event]) {
      if (!Array.isArray(config.hooks[event])) return false;
      const hookStr = JSON.stringify(config.hooks[event]);
      if (hookStr.includes(HTTP_HOOK_URL) && hookStr.includes('"type":"http"')) {
        return true;
      }
    }
  }

  return false;
}

function registerClaudeHooks(debugLog) {
  debugLog('[Hook] Claude CLI 훅 등록 상태 확인...');

  if (isHookRegistered(debugLog)) {
    debugLog('[Hook] ✓ 훅이 이미 등록되어 있습니다.');
    return true;
  }

  debugLog('[Hook] 훅 등록 시작...');

  const config = readClaudeConfig(debugLog);

  config.hooks = config.hooks || {};

  const HTTP_HOOK_URL = `http://localhost:${HOOK_SERVER_PORT}/hook`;
  const hookEvents = [
    'SessionStart', 'SessionEnd', 'UserPromptSubmit',
    'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
    'Stop', 'TaskCompleted', 'PermissionRequest', 'Notification',
    'SubagentStart', 'SubagentStop', 'TeammateIdle',
    'ConfigChange', 'WorktreeCreate', 'WorktreeRemove',
    'PreCompact'
  ];

  for (const event of hookEvents) {
    config.hooks[event] = [
      {
        matcher: "*",
        hooks: [
          {
            type: "http",
            url: HTTP_HOOK_URL
          }
        ]
      }
    ];
  }

  if (writeClaudeConfig(config, debugLog)) {
    debugLog('[Hook] ✅ Claude CLI 훅 등록 완료!');
    console.log('\n✅ Claude CLI 훅이 자동 등록되었습니다.');
    console.log('이제 Claude Code를 사용하면 자동으로 연결됩니다.\n');
    return true;
  }

  debugLog('[Hook] ❌ 훅 등록 실패');
  return false;
}

module.exports = { HOOK_SERVER_PORT, registerClaudeHooks };
