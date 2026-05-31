import { resolveStressAnimalGroup } from '@/src/lib/stress-animal-groups';

export type TrafficLevel = 'low' | 'medium' | 'high';

export type StressMeasurementMode = 'current' | 'peak';

export type StressDiagnosisInput = {
  species: string;
  cageWidthCm: number | null;
  cageDepthCm: number | null;
  ambientNoiseDb: number;
  vibrationLevel: number;
  trafficLevel: TrafficLevel;
  hideoutReady: boolean;
  ventilationReady: boolean;
  directSunlight: boolean;
  nearSpeaker: boolean;
  unstableFloor: boolean;
  measurementMode?: StressMeasurementMode;
};

export type StressDiagnosisLevel = 'stable' | 'caution' | 'warning';

export type StressDiagnosisSignalCode =
  | 'noise_stable'
  | 'noise_watch'
  | 'noise_caution'
  | 'noise_high'
  | 'noise_very_high'
  | 'vibration_low'
  | 'vibration_medium'
  | 'vibration_high'
  | 'direct_sunlight';

export type StressDiagnosisSignal = {
  code: StressDiagnosisSignalCode;
  severity: 'info' | 'caution' | 'warning';
  title: string;
  detail: string;
};

export type StressDiagnosisReport = {
  score: number;
  level: StressDiagnosisLevel;
  summary: string;
  highlights: string[];
  recommendations: string[];
  noiseBandLabel: string;
  measurementNotice: string;
};

export type StressAiSummaryInput = {
  status: {
    level: StressDiagnosisLevel;
    label: string;
    score: number;
  };
  measurement: {
    mode: StressMeasurementMode;
    modeLabel: string;
    ambientNoiseDb: number;
    noiseBandLabel: string;
    vibrationLevel: number;
    trafficLevel: TrafficLevel;
  };
  signals: StressDiagnosisSignal[];
  strengths: string[];
  focusRecommendations: string[];
  caveats: string[];
};

type NoiseBand = {
  label: string;
  penalty: number;
  signal: StressDiagnosisSignal;
  recommendation: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getLevelLabel(level: StressDiagnosisLevel) {
  if (level === 'warning') return '부적합';
  if (level === 'caution') return '주의';
  return '적합';
}

function getMeasurementModeLabel(mode: StressMeasurementMode) {
  return mode === 'peak' ? '피크 시간 측정' : '현재 환경 측정';
}

function getNoiseBand(noiseDb: number): NoiseBand {
  if (noiseDb >= 90) {
    return {
      label: '매우 높음',
      penalty: 36,
      signal: {
        code: 'noise_very_high',
        severity: 'warning',
        title: '소음이 매우 높게 측정됨',
        detail: '짧은 측정에서도 매우 큰 소음 피크가 확인되어 입주 전 위치 재검토가 필요합니다.',
      },
      recommendation:
        'TV, 스피커, 청소기, 출입문 주변처럼 큰 소음이 반복되는 위치는 피하는 것이 좋습니다.',
    };
  }

  if (noiseDb >= 85) {
    return {
      label: '높음',
      penalty: 28,
      signal: {
        code: 'noise_high',
        severity: 'warning',
        title: '소음이 높은 편임',
        detail: '생활 소음이 반복될 경우 스트레스 요인으로 작용할 가능성이 높습니다.',
      },
      recommendation:
        '가장 시끄러운 시간대에도 비슷한 수준이 반복되는지 한 번 더 확인해 보세요.',
    };
  }

  if (noiseDb >= 80) {
    return {
      label: '주의 필요',
      penalty: 20,
      signal: {
        code: 'noise_caution',
        severity: 'caution',
        title: '소음 주의 구간',
        detail: '현재 위치가 일상적인 생활 소음 영향을 받을 수 있는 구간으로 보입니다.',
      },
      recommendation: '문, 창문, 복도, 가전제품과의 거리를 다시 확인해 주세요.',
    };
  }

  if (noiseDb >= 65) {
    return {
      label: '관찰 필요',
      penalty: 10,
      signal: {
        code: 'noise_watch',
        severity: 'caution',
        title: '배경 소음이 감지됨',
        detail: '즉시 큰 문제는 아니지만 시간대에 따라 체감이 달라질 수 있습니다.',
      },
      recommendation: '가능하다면 더 조용한 위치와 비교 측정을 해보세요.',
    };
  }

  return {
    label: '안정',
    penalty: 0,
    signal: {
      code: 'noise_stable',
      severity: 'info',
      title: '소음은 비교적 안정적임',
      detail: '현재 측정 기준으로는 주변 소음이 크게 두드러지지 않습니다.',
    },
    recommendation:
      '현재 환경은 무난해 보이지만, 생활 소음이 많은 시간대에 추가 측정하면 더 정확합니다.',
  };
}

function buildSignals(input: StressDiagnosisInput) {
  const signals: StressDiagnosisSignal[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];
  const animalGroup = resolveStressAnimalGroup(input.species);

  const noiseBand = getNoiseBand(clamp(input.ambientNoiseDb, 0, 140));
  signals.push(noiseBand.signal);
  recommendations.push(noiseBand.recommendation);

  if (input.vibrationLevel >= 7) {
    signals.push({
      code: 'vibration_high',
      severity: 'warning',
      title: '진동이 높게 측정됨',
      detail: '바닥 충격이나 주변 기기 진동이 지속적으로 전달될 가능성이 있습니다.',
    });
    recommendations.push('책상, 선반, 흔들리는 바닥처럼 진동이 전달되는 위치인지 다시 확인해 주세요.');
  } else if (input.vibrationLevel >= 4) {
    signals.push({
      code: 'vibration_medium',
      severity: 'caution',
      title: '진동이 다소 감지됨',
      detail: '현재 위치가 미세한 흔들림에 노출될 가능성이 있습니다.',
    });
    recommendations.push('받침대나 바닥이 흔들린다면 더 안정적인 위치를 고려해 주세요.');
  } else {
    strengths.push('진동은 비교적 안정적으로 측정됐습니다.');
    signals.push({
      code: 'vibration_low',
      severity: 'info',
      title: '진동은 안정적임',
      detail: '현재 측정 기준으로는 큰 흔들림이 감지되지 않았습니다.',
    });
  }

  if (input.directSunlight) {
    signals.push({
      code: 'direct_sunlight',
      severity: animalGroup.group === 'reptile' ? 'caution' : 'warning',
      title:
        animalGroup.group === 'reptile'
          ? '직사광선 환경은 종별 확인 필요'
          : '피할 공간 없는 직사광선 노출 가능성',
      detail: animalGroup.directSunlightNote,
    });
    recommendations.push(
      animalGroup.group === 'reptile'
        ? '파충류는 종에 따라 빛과 열 요구가 다르므로, 은신처와 온도 구배가 충분한지 함께 확인해 주세요.'
        : '직사광선이 직접 닿지 않거나 회피 공간이 확보되는 위치인지 다시 확인해 주세요.'
    );
  }

  return {
    animalGroup,
    noiseBand,
    signals,
    strengths,
    recommendations: Array.from(new Set(recommendations)),
  };
}

export function buildStressDiagnosisReport(input: StressDiagnosisInput): StressDiagnosisReport {
  const measurementMode = input.measurementMode ?? 'current';
  const { animalGroup, noiseBand, signals, recommendations } = buildSignals(input);
  const hasWarningSignal = signals.some((signal) => signal.severity === 'warning');
  const vibrationLevel = clamp(input.vibrationLevel, 0, 10);

  let score = 0;
  score += noiseBand.penalty * animalGroup.noiseWeight;
  score += vibrationLevel * animalGroup.vibrationWeight;
  if (input.directSunlight) score += animalGroup.directSunlightPenalty;

  let roundedScore = clamp(Math.round(score), 0, 100);
  if (vibrationLevel >= 10) {
    roundedScore = Math.max(roundedScore, 70);
  } else if (vibrationLevel >= 8) {
    roundedScore = Math.max(roundedScore, 55);
  }

  let level: StressDiagnosisLevel = 'stable';
  let summary =
    measurementMode === 'peak'
      ? '피크 시간 기준으로는 현재 위치가 비교적 안정적으로 보입니다.'
      : '현재 측정 기준으로는 비교적 안정적인 환경으로 보입니다.';

  if (roundedScore >= 55) {
    level = 'warning';
    summary =
      measurementMode === 'peak'
        ? '피크 시간 기준으로 스트레스 위험 신호가 뚜렷해 입주 전 위치 조정을 권장합니다.'
        : '현재 측정만으로도 스트레스 위험 신호가 보여 위치 조정이나 환경 보완이 필요합니다.';
  } else if (roundedScore >= 28) {
    level = 'caution';
    summary =
      measurementMode === 'peak'
        ? '피크 시간 기준으로 몇 가지 주의 요인이 확인되어 입주 전 보완을 권장합니다.'
        : '현재 환경은 바로 부적합하다고 보긴 어렵지만, 보완하면 더 안정적인 배치가 가능합니다.';
  }

  if (vibrationLevel >= 8) {
    level = 'warning';
    summary =
      measurementMode === 'peak'
        ? '피크 시간 기준으로 강한 진동이 감지되어 현재 위치는 입주 전 재검토가 필요합니다.'
        : '현재 측정에서 강한 진동이 감지되어 위치 조정이나 재측정 확인이 필요합니다.';

    if (vibrationLevel >= 10) {
      recommendations.push(
        '진동이 10/10으로 측정되었습니다. 측정 중 휴대폰을 손으로 들거나 흔들었다면, 바닥에 내려놓고 다시 측정해 주세요.'
      );
    }
  } else if (level === 'stable' && hasWarningSignal) {
    level = 'caution';
    summary =
      measurementMode === 'peak'
        ? '피크 시간 기준으로 강한 자극 신호가 감지되어 주의가 필요합니다.'
        : '현재 측정에서 강한 자극 신호가 감지되어 주의가 필요합니다.';
  }

  const highlights = signals
    .filter((signal) => signal.severity !== 'info')
    .map((signal) => `${signal.title}: ${signal.detail}`);

  if (highlights.length === 0) {
    highlights.push('현재 측정 기준으로는 큰 위험 신호가 확인되지 않았습니다.');
  }

  const measurementNotice =
    measurementMode === 'peak'
      ? '이 결과는 소음, 진동, 직사광선 여부를 바탕으로 한 피크 시간 기준 스마트폰 센서 기반 사전 평가입니다. 임상 진단이 아니라 입주 전 위험을 비교하는 용도로 해석해 주세요.'
      : '이 결과는 소음, 진동, 직사광선 여부를 바탕으로 한 현재 시점 스마트폰 센서 기반 사전 평가입니다. 더 정확한 비교를 원하면 생활 소음이나 진동이 큰 시간대에 추가 측정을 권장합니다.';

  return {
    score: roundedScore,
    level,
    summary,
    highlights,
    recommendations,
    noiseBandLabel: noiseBand.label,
    measurementNotice,
  };
}

export function buildStressAiSummaryInput(
  input: StressDiagnosisInput,
  report = buildStressDiagnosisReport(input)
): StressAiSummaryInput {
  const measurementMode = input.measurementMode ?? 'current';
  const { signals, strengths, recommendations } = buildSignals(input);

  return {
    status: {
      level: report.level,
      label: getLevelLabel(report.level),
      score: report.score,
    },
    measurement: {
      mode: measurementMode,
      modeLabel: getMeasurementModeLabel(measurementMode),
      ambientNoiseDb: clamp(input.ambientNoiseDb, 0, 140),
      noiseBandLabel: report.noiseBandLabel,
      vibrationLevel: clamp(input.vibrationLevel, 0, 10),
      trafficLevel: input.trafficLevel,
    },
    signals,
    strengths,
    focusRecommendations: recommendations.slice(0, 3),
    caveats: [
      '스마트폰 센서 기반 간이 측정이며 공인 계측기나 수의학적 진단을 대체하지 않습니다.',
      measurementMode === 'current'
        ? '현재 시점 결과이므로 생활 소음과 시간대에 따라 결과가 달라질 수 있습니다.'
        : '피크 시간 기준 결과이므로 일상 평균 환경보다 보수적으로 해석될 수 있습니다.',
    ],
  };
}
