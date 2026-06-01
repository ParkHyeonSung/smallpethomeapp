export type StressPatternKind =
  | 'insufficient'
  | 'quiet'
  | 'continuous'
  | 'intermittent'
  | 'repeated'
  | 'impact'
  | 'low_frequency';

export type StressPatternAnalysis = {
  kind: StressPatternKind;
  label: string;
  detail: string;
  tags: string[];
  confidence: number;
};

export type NoisePatternSample = {
  timestampMs: number;
  approxDb: number;
  peakFrequencyHz: number;
  lowBandLevel: number;
  midBandLevel: number;
  highBandLevel: number;
  marker32HzLevel: number;
  marker125HzLevel: number;
};

export type VibrationPatternSample = {
  timestampMs: number;
  value: number;
};

const WINDOW_MS = 10_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

function getRecent<T extends { timestampMs: number }>(samples: T[], nowMs: number, windowMs = WINDOW_MS) {
  return samples.filter((sample) => sample.timestampMs >= nowMs - windowMs);
}

function countPeakEvents(values: number[], threshold: number) {
  let count = 0;
  const peakIndexes: number[] = [];

  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] >= threshold && values[index] > values[index - 1] && values[index] >= values[index + 1]) {
      count += 1;
      peakIndexes.push(index);
    }
  }

  return { count, peakIndexes };
}

function hasRegularIntervals(timestamps: number[]) {
  if (timestamps.length < 3) return false;
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]);
  const avg = mean(intervals);
  if (avg <= 0) return false;
  return stdDev(intervals) / avg < 0.45;
}

export function analyzeNoisePattern(
  samples: NoisePatternSample[],
  nowMs = Date.now()
): StressPatternAnalysis {
  const recent = getRecent(samples, nowMs);

  if (recent.length < 8) {
    return {
      kind: 'insufficient',
      label: '소음 패턴 분석 중',
      detail: '측정값을 조금 더 모으고 있어요.',
      tags: [],
      confidence: 0.2,
    };
  }

  const dbValues = recent.map((sample) => sample.approxDb);
  const avgDb = mean(dbValues);
  const peakDb = Math.max(...dbValues);
  const dbSpread = stdDev(dbValues);
  const activeRatio = recent.filter((sample) => sample.approxDb >= 65).length / recent.length;
  const peakThreshold = Math.max(72, avgDb + Math.max(6, dbSpread * 1.4));
  const peakResult = countPeakEvents(dbValues, peakThreshold);
  const peakTimes = peakResult.peakIndexes.map((index) => recent[index].timestampMs);
  const lowFrequencyDominant =
    mean(recent.map((sample) => sample.lowBandLevel)) >
      mean(recent.map((sample) => Math.max(sample.midBandLevel, sample.highBandLevel))) * 1.15 ||
    mean(recent.map((sample) => Math.max(sample.marker32HzLevel, sample.marker125HzLevel))) >= 0.35 ||
    recent.filter((sample) => sample.peakFrequencyHz > 0 && sample.peakFrequencyHz <= 250).length / recent.length >=
      0.35;

  if (lowFrequencyDominant && activeRatio >= 0.25) {
    return {
      kind: 'low_frequency',
      label: '저주파성 소음 패턴',
      detail: '저주파 대역 또는 32.5Hz/125Hz 참고 마커가 반복적으로 감지됩니다.',
      tags: ['noise_low_frequency', 'marker_32_125hz'],
      confidence: clamp(0.55 + activeRatio * 0.35, 0, 0.95),
    };
  }

  if (activeRatio >= 0.75 && dbSpread < 8) {
    return {
      kind: 'continuous',
      label: '지속 소음 패턴',
      detail: `최근 구간 평균 소음이 약 ${Math.round(avgDb)} dB로 일정하게 유지됩니다.`,
      tags: ['noise_continuous'],
      confidence: clamp(0.55 + activeRatio * 0.35, 0, 0.95),
    };
  }

  if (peakResult.count >= 3 && hasRegularIntervals(peakTimes)) {
    return {
      kind: 'repeated',
      label: '반복 소음 패턴',
      detail: '비슷한 간격의 소음 피크가 반복적으로 감지됩니다.',
      tags: ['noise_repeated'],
      confidence: 0.75,
    };
  }

  if (peakResult.count >= 2 || peakDb - avgDb >= 12) {
    return {
      kind: 'intermittent',
      label: '간헐 소음 패턴',
      detail: '조용한 구간 사이에 튀는 소음 피크가 감지됩니다.',
      tags: ['noise_intermittent', 'noise_peak_event'],
      confidence: 0.68,
    };
  }

  return {
    kind: 'quiet',
    label: '큰 소음 패턴 없음',
    detail: '최근 구간에서 뚜렷한 반복 또는 지속 소음은 감지되지 않았습니다.',
    tags: ['noise_stable'],
    confidence: 0.6,
  };
}

export function analyzeVibrationPattern(
  samples: VibrationPatternSample[],
  nowMs = Date.now()
): StressPatternAnalysis {
  const recent = getRecent(samples, nowMs);

  if (recent.length < 16) {
    return {
      kind: 'insufficient',
      label: '진동 패턴 분석 중',
      detail: '측정값을 조금 더 모으고 있어요.',
      tags: [],
      confidence: 0.2,
    };
  }

  const values = recent.map((sample) => sample.value);
  const avg = mean(values);
  const peak = Math.max(...values);
  const spread = stdDev(values);
  const activeThreshold = Math.max(0.018, avg + spread * 0.45);
  const peakThreshold = Math.max(0.05, avg + Math.max(spread * 1.8, 0.035));
  const activeRatio = values.filter((value) => value >= activeThreshold).length / values.length;
  const peakResult = countPeakEvents(values, peakThreshold);
  const peakTimes = peakResult.peakIndexes.map((index) => recent[index].timestampMs);

  if (peak >= 0.18) {
    return {
      kind: 'impact',
      label: '충격성 진동 패턴',
      detail: '짧고 강한 진동 피크가 감지됩니다.',
      tags: ['vibration_impact', 'vibration_peak_event'],
      confidence: 0.76,
    };
  }

  if (activeRatio >= 0.65 && spread < 0.04) {
    return {
      kind: 'continuous',
      label: '지속 진동 패턴',
      detail: '약한 진동이 일정하게 유지되는 패턴입니다.',
      tags: ['vibration_continuous'],
      confidence: clamp(0.55 + activeRatio * 0.35, 0, 0.95),
    };
  }

  if (peakResult.count >= 3 && hasRegularIntervals(peakTimes)) {
    return {
      kind: 'repeated',
      label: '반복 진동 패턴',
      detail: '비슷한 간격의 진동 피크가 반복적으로 감지됩니다.',
      tags: ['vibration_repeated'],
      confidence: 0.75,
    };
  }

  if (peakResult.count >= 2 || peak - avg >= 0.07) {
    return {
      kind: 'intermittent',
      label: '간헐 진동 패턴',
      detail: '조용한 구간 사이에 튀는 진동이 감지됩니다.',
      tags: ['vibration_intermittent'],
      confidence: 0.65,
    };
  }

  return {
    kind: 'quiet',
    label: '큰 진동 패턴 없음',
    detail: '최근 구간에서 뚜렷한 반복 또는 지속 진동은 감지되지 않았습니다.',
    tags: ['vibration_stable'],
    confidence: 0.6,
  };
}
