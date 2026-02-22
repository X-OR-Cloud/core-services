/**
 * Audio conversion: slin16 (signed linear 16-bit LE, 8kHz) ↔ G.711 µ-law
 * Ported from P001-voip-callbot/src/lib/audio-convert.js
 */

const BIAS = 0x84; // 132
const CLIP = 32635;
const SEG_END = [0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF, 0x3FFF, 0x7FFF];

function linearToUlaw(sample: number): number {
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let seg = 0;
  for (; seg < 8; seg++) {
    if (sample <= SEG_END[seg]) break;
  }
  if (seg >= 8) return 0x7F ^ sign;

  const uval = (seg << 4) | ((sample >> (seg + 3)) & 0x0F);
  return uval ^ sign ^ 0xFF;
}

// Pre-built decode table
const ULAW_DECODE_TABLE = new Int16Array(256);
(function buildDecodeTable() {
  for (let i = 0; i < 256; i++) {
    const v = ~i;
    const sign = v & 0x80;
    const exponent = (v >> 4) & 0x07;
    const mantissa = v & 0x0F;
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    ULAW_DECODE_TABLE[i] = sign !== 0 ? -sample : sample;
  }
})();

/** Buffer slin16 (LE) → Buffer µ-law */
export function slin16ToUlaw(slinBuf: Buffer): Buffer {
  const numSamples = slinBuf.length >> 1;
  const out = Buffer.allocUnsafe(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sample = slinBuf.readInt16LE(i * 2);
    out[i] = linearToUlaw(sample);
  }
  return out;
}

/** Buffer µ-law → Buffer slin16 (LE) */
export function ulawToSlin16(ulawBuf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(ulawBuf.length * 2);
  for (let i = 0; i < ulawBuf.length; i++) {
    out.writeInt16LE(ULAW_DECODE_TABLE[ulawBuf[i]], i * 2);
  }
  return out;
}
