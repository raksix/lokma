// REQ-160 live proof: rows arriving over the socket must carry attachments.
const WebSocket = require('ws');
const TOKEN = process.argv[2];
const SESSION = process.argv[3];
const URL = 'wss://lokma.fermag.com.tr/ws/' + SESSION + '?token=' + TOKEN;
const ws = new WebSocket(URL);
const out = [];
const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);
ws.on('open', () => ws.send(JSON.stringify({ type: 'transcript_get', sessionId: SESSION })));
ws.on('message', (buf) => {
  const f = JSON.parse(buf.toString());
  if (f.type !== 'transcript') return;
  const rows = f.messages || [];
  const withAtt = rows.filter((r) => Array.isArray(r.attachments) && r.attachments.length > 0);
  console.log('rows:', rows.length, '| rows with attachments:', withAtt.length);
  for (const r of withAtt) console.log('  ', r.role, JSON.stringify(r.attachments)[0] !== undefined ? JSON.stringify(r.attachments).slice(0, 150) : '');
  clearTimeout(timer);
  ws.close();
  process.exit(withAtt.length > 0 ? 0 : 1);
});
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
