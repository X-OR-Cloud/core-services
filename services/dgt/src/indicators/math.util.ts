/**
 * Technical indicator computation functions.
 * All functions expect price arrays ordered oldest → newest (index 0 = oldest).
 */

/** Simple Moving Average */
export function sma(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/** Exponential Moving Average */
export function ema(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const k = 2 / (period + 1);
  let result = sma(values.slice(0, period), period)!;
  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

/** EMA series - returns array of EMA values for each point after initial SMA */
function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

/** RSI (Relative Strength Index) */
export function rsi(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothed
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (Moving Average Convergence Divergence) */
export function macd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { line: number; signal: number; histogram: number } | undefined {
  if (closes.length < slowPeriod + signalPeriod) return undefined;

  const fastEma = emaSeries(closes, fastPeriod);
  const slowEma = emaSeries(closes, slowPeriod);

  // Align: slowEma starts later
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }

  if (macdLine.length < signalPeriod) return undefined;

  const signalLine = emaSeries(macdLine, signalPeriod);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];

  return {
    line: lastMacd,
    signal: lastSignal,
    histogram: lastMacd - lastSignal,
  };
}

/** Bollinger Bands */
export function bollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): { upper: number; middle: number; lower: number } | undefined {
  if (closes.length < period) return undefined;

  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;

  const variance = slice.reduce((s, v) => s + Math.pow(v - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: middle + stdDevMultiplier * stdDev,
    middle,
    lower: middle - stdDevMultiplier * stdDev,
  };
}

/** ATR (Average True Range) */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | undefined {
  if (highs.length < period + 1) return undefined;

  const trueRanges: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trueRanges.push(tr);
  }

  // Initial ATR = simple average
  let result = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;

  // Smoothed
  for (let i = period; i < trueRanges.length; i++) {
    result = (result * (period - 1) + trueRanges[i]) / period;
  }

  return result;
}

/** Historical Volatility (annualized) */
export function historicalVolatility(closes: number[], period = 30): number | undefined {
  if (closes.length < period + 1) return undefined;

  const returns: number[] = [];
  const slice = closes.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }

  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (returns.length - 1);
  const dailyVol = Math.sqrt(variance);

  // Annualize (252 trading days)
  return dailyVol * Math.sqrt(252) * 100;
}

/** Volume Ratio (current volume / average volume) */
export function volumeRatio(volumes: number[], period = 20): number | undefined {
  if (volumes.length < period + 1) return undefined;
  const avgVolume = volumes.slice(-(period + 1), -1).reduce((s, v) => s + v, 0) / period;
  if (avgVolume === 0) return undefined;
  return volumes[volumes.length - 1] / avgVolume;
}
