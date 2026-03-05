/**
 * Universal hook script for all Claude CLI events.
 * Receives JSON from stdin and forwards to the local HTTP hook server.
 * PID 탐지는 main.js에서 PowerShell로 수행 (process.ppid는 셸 PID라 부정확).
 */
const http = require('http');
const PORT = 47821;

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
    try {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        // process.ppid는 셸(cmd.exe) PID이므로 사용하지 않음
        // 실제 Claude PID는 main.js에서 PowerShell로 탐지
        data._timestamp = Date.now();

        const body = Buffer.from(JSON.stringify(data), 'utf-8');

        // HTTP 전송
        const req = http.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/hook',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
        }, () => process.exit(0));

        req.on('error', () => process.exit(0));
        req.setTimeout(3000, () => { req.destroy(); process.exit(0); });
        req.write(body);
        req.end();
    } catch (e) {
        process.exit(0);
    }
});
