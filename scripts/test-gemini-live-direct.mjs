import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: 'AIzaSyAd21Q3wcQFUc6A6XV_oR1hSWqy3FMIyYg' });

console.log('Connecting to Gemini Live...');

try {
  const session = await ai.live.connect({
    model: 'gemini-2.0-flash-live-001',
    callbacks: {
      onmessage: (msg) => {
        console.log('[message]', JSON.stringify(msg).slice(0, 200));
        if (msg.setupComplete) {
          console.log('[✓] setupComplete — session ready');
          session.close();
          process.exit(0);
        }
      },
      onerror: (e) => {
        console.error('[onerror] message:', e.message, '| error:', e.error);
      },
      onclose: (e) => {
        console.log('[onclose] code:', e.code, '| reason:', e.reason, '| wasClean:', e.wasClean);
        process.exit(e.code === 1000 ? 0 : 1);
      },
    },
    config: {
      systemInstruction: 'You are a helpful assistant.',
      responseModalities: [Modality.AUDIO],
    },
  });

  console.log('[✓] connect() returned session');

  // Timeout
  setTimeout(() => {
    console.log('[timeout] no setupComplete in 10s');
    session.close();
    process.exit(1);
  }, 10000);
} catch (err) {
  console.error('[✗] connect() threw:', err.message);
  process.exit(1);
}
