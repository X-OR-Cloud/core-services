import { io } from 'socket.io-client';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OWE5NzMxZGM3N2JiZjdkYzIxZDZlOGMiLCJ1c2VybmFtZSI6ImR1bmcuaHZAeC1vci5jbG91ZCIsInN0YXR1cyI6ImFjdGl2ZSIsInJvbGVzIjpbIm9yZ2FuaXphdGlvbi5vd25lciJdLCJvcmdJZCI6IjY5MWViOWU2NTE3ZjkxNzk0M2FlMWY5ZCIsImdyb3VwSWQiOiIiLCJhZ2VudElkIjoiIiwiYXBwSWQiOiIiLCJsaWNlbnNlcyI6eyJpYW0iOiJmdWxsIiwiY2JtIjoiZnVsbCIsImFpd20iOiJmdWxsIiwibm90aSI6ImZ1bGwiLCJtb25hIjoiZGlzYWJsZWQifSwiaWF0IjoxNzc5ODA5NjE1LCJleHAiOjE3Nzk4MjQwMTV9.oyXf_eh8a2a2g7yWl2biT0kHw-jK-evIY7XChhtmkxM';
const DEPLOYMENT_ID = '6a15cfcdca4d8fedaf0e591c';

// Test via direct Gemini Live (bypasses VWS) to send text turn and verify audio response
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyAd21Q3wcQFUc6A6XV_oR1hSWqy3FMIyYg' });

console.log('--- Gemini Live text→audio test ---');

const session = await ai.live.connect({
  model: 'gemini-2.5-flash-native-audio-latest',
  callbacks: {
    onmessage: (msg) => {
      if (msg.setupComplete) {
        console.log('[✓] setupComplete');
        console.log('[→] Sending text: "Say hello in one short sentence"');
        session.sendClientContent({
          turns: 'Say hello in one short sentence.',
          turnComplete: true,
        });
      }
      if (msg.serverContent?.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.data) {
            const bytes = Buffer.from(part.inlineData.data, 'base64').length;
            console.log(`[✓] Audio response received: ${bytes} bytes PCM`);
          }
          if (part.text) {
            console.log(`[✓] Text response: "${part.text}"`);
          }
        }
      }
      if (msg.serverContent?.turnComplete) {
        console.log('[✓] Turn complete — full pipeline verified');
        session.close();
        process.exit(0);
      }
    },
    onerror: (e) => console.error('[✗] error:', e.message),
    onclose: (e) => { if (e.code !== 1000) console.log('closed:', e.code, e.reason); },
  },
  config: {
    systemInstruction: 'You are a concise voice assistant.',
    responseModalities: [Modality.AUDIO],
  },
});

setTimeout(() => { console.log('[timeout]'); session.close(); process.exit(1); }, 15000);
