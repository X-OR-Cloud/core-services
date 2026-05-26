import { io } from 'socket.io-client';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OWE5NzMxZGM3N2JiZjdkYzIxZDZlOGMiLCJ1c2VybmFtZSI6ImR1bmcuaHZAeC1vci5jbG91ZCIsInN0YXR1cyI6ImFjdGl2ZSIsInJvbGVzIjpbIm9yZ2FuaXphdGlvbi5vd25lciJdLCJvcmdJZCI6IjY5MWViOWU2NTE3ZjkxNzk0M2FlMWY5ZCIsImdyb3VwSWQiOiIiLCJhZ2VudElkIjoiIiwiYXBwSWQiOiIiLCJsaWNlbnNlcyI6eyJpYW0iOiJmdWxsIiwiY2JtIjoiZnVsbCIsImFpd20iOiJmdWxsIiwibm90aSI6ImZ1bGwiLCJtb25hIjoiZGlzYWJsZWQifSwiaWF0IjoxNzc5ODA5NjE1LCJleHAiOjE3Nzk4MjQwMTV9.oyXf_eh8a2a2g7yWl2biT0kHw-jK-evIY7XChhtmkxM';
const DEPLOYMENT_ID = '6a15cfcdca4d8fedaf0e591c';
const VWS_URL = 'http://localhost:3410';

console.log('--- VWS Test ---');

const socket = io(VWS_URL, {
  auth: { token: TOKEN },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('[✓] Connected, socket.id =', socket.id);

  console.log('[→] Sending start event...');
  socket.emit('start', {
    deploymentId: DEPLOYMENT_ID,
    toolSchemas: [],
    systemInstruction: 'You are a concise voice assistant. Answer in 1-2 sentences only.',
  }, (ack) => {
    console.log('[start ack]', JSON.stringify(ack));
    if (!ack?.success) {
      console.error('[✗] Start failed:', ack?.error);
      socket.disconnect();
    }
  });
});

socket.on('ready', () => {
  console.log('[✓] Session ready — Gemini Live connected');

  // Send 0.1s of PCM silence (16kHz, 16-bit mono = 3200 bytes zeroed)
  const silence = Buffer.alloc(3200, 0).toString('base64');
  console.log('[→] Sending 100ms silence audio chunk...');
  socket.emit('audio', { data: silence });

  // Wait up to 8s for audio response
  setTimeout(() => {
    console.log('[!] No audio response in 8s — disconnecting');
    socket.disconnect();
    process.exit(0);
  }, 8000);
});

socket.on('audio', (data) => {
  const bytes = Buffer.from(data.data, 'base64').length;
  console.log(`[✓] Received audio response: ${bytes} bytes`);
});

socket.on('transcript', (data) => {
  console.log(`[✓] Transcript [${data.role}]: "${data.text}"`);
});

socket.on('turn_complete', () => {
  console.log('[✓] Turn complete');
  socket.disconnect();
  process.exit(0);
});

socket.on('tool_call', (data) => {
  console.log('[tool_call]', JSON.stringify(data));
});

socket.on('error', (data) => {
  console.error('[✗] Error:', data.message);
  socket.disconnect();
  process.exit(1);
});

socket.on('connect_error', (err) => {
  console.error('[✗] Connect error:', err.message);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('[disconnected]', reason);
});
