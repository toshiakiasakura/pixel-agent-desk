/**
 * HTTP Hook Server
 * Claude CLI가 직접 POST하는 HTTP 훅 서버 (스키마 검증 포함)
 */

const http = require('http');
const Ajv = require('ajv');

function startHookServer({ processHookEvent, debugLog, HOOK_SERVER_PORT, errorHandler }) {
  // P1-3: JSON Schema for hook validation (Task 3A-1: 실제 Claude 훅 필드 기반으로 수정)
  const hookSchema = {
    type: 'object',
    required: ['hook_event_name'],
    properties: {
      hook_event_name: {
        type: 'string',
        enum: [
          'SessionStart', 'SessionEnd', 'UserPromptSubmit',
          'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
          'Stop', 'TaskCompleted', 'PermissionRequest', 'Notification',
          'SubagentStart', 'SubagentStop', 'TeammateIdle',
          'ConfigChange', 'WorktreeCreate', 'WorktreeRemove', 'PreCompact',
          'InstructionsLoaded'  // 새 이벤트
        ]
      },
      session_id: { type: 'string' },
      transcript_path: { type: 'string' },
      cwd: { type: 'string' },
      permission_mode: { type: 'string' },
      tool_name: { type: 'string' },
      tool_input: { type: 'object' },
      tool_response: { type: 'object' },
      source: { type: 'string' },
      model: { type: 'string' },
      agent_type: { type: 'string' },
      agent_id: { type: 'string' },
      notification_type: { type: 'string' },
      last_assistant_message: { type: 'string' },
      reason: { type: 'string' },
      teammate_name: { type: 'string' },
      team_name: { type: 'string' },
      task_id: { type: 'string' },
      task_subject: { type: 'string' },
      trigger: { type: 'string' },
      agent_transcript_path: { type: 'string' },
      _pid: { type: 'number' },
      _timestamp: { type: 'number' }
    },
    additionalProperties: true  // Claude가 새 필드 추가할 수 있으므로 유지
  };

  const ajv = new Ajv();
  const validateHook = ajv.compile(hookSchema);

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/hook') {
      res.writeHead(404); res.end(); return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      try {
        const data = JSON.parse(body);
        debugLog(`[Hook] ← ${data.hook_event_name || '?'} session=${(data.session_id || '').slice(0, 8) || '?'} _pid=${data._pid} _timestamp=${data._timestamp}`);

        // P1-3: Validate JSON schema
        const isValid = validateHook(data);
        if (!isValid) {
          errorHandler.capture(new Error('Invalid hook data'), {
            code: 'E010',
            category: 'VALIDATION',
            severity: 'WARNING',
            details: validateHook.errors
          });
          debugLog(`[Hook] Validation FAILED for ${data.hook_event_name}: ${JSON.stringify(validateHook.errors)}`);
          return;
        }

        processHookEvent(data);
      } catch (e) {
        errorHandler.capture(e, {
          code: 'E010',
          category: 'PARSE',
          severity: 'WARNING'
        });
        debugLog(`[Hook] Parse error: ${e.message}`);
      }
    });
  });

  server.on('error', (e) => debugLog(`[Hook] Server error: ${e.message}`));
  server.listen(HOOK_SERVER_PORT, '127.0.0.1', () => {
    debugLog(`[Hook] HTTP hook server listening on port ${HOOK_SERVER_PORT}`);
  });

  return server;
}

module.exports = { startHookServer };
