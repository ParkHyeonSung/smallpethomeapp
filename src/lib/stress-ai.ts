import {
  resolveStressAnimalGroup,
  StressAnimalGroup,
  StressAnimalGroupInfo,
} from '@/src/lib/stress-animal-groups';
import {
  buildStressDiagnosisReport,
  StressDiagnosisInput,
  StressDiagnosisLevel,
  StressDiagnosisReport,
} from '@/src/lib/stress-diagnosis';

export type StressAiPromptBundle = {
  system: string;
  user: string;
};

export type StressAiPreview = {
  title: string;
  body: string;
};

export type StressAiPayload = {
  animal: {
    userInput: string;
    group: StressAnimalGroup;
    groupLabel: string;
  };
  measurement: {
    mode: 'current' | 'peak';
    durationSec: number;
    ambientNoiseDb: number;
    noiseBand: string;
    vibrationLevel: number;
    vibrationBand: string;
    directSunlight: boolean;
  };
  patternAnalysis?: {
    noisePattern: string;
    noiseDetail: string;
    vibrationPattern: string;
    vibrationDetail: string;
    evidenceTags: string[];
  };
  diagnosis: {
    score: number;
    level: StressDiagnosisLevel;
    label: string;
  };
  interpretationRules: {
    priorityFactors: ('noise' | 'vibration' | 'direct_sunlight')[];
    groupGuidance: string;
    doNotChangeVerdict: true;
  };
  uiContext: {
    screenName: '입주 전 환경 적합성 진단';
    tone: 'short_clear_supportive';
    language: 'ko-KR';
  };
};

function getDiagnosisLabel(level: StressDiagnosisLevel) {
  if (level === 'warning') return '부적합';
  if (level === 'caution') return '주의';
  return '적합';
}

function getVibrationBandLabel(level: number) {
  if (level >= 8) return '매우 높음';
  if (level >= 6) return '높음';
  if (level >= 4) return '보통';
  if (level >= 2) return '낮음';
  return '매우 낮음';
}

function getPriorityFactors(groupInfo: StressAnimalGroupInfo): ('noise' | 'vibration' | 'direct_sunlight')[] {
  if (groupInfo.group === 'reptile') {
    return ['vibration', 'direct_sunlight', 'noise'];
  }

  return ['noise', 'vibration', 'direct_sunlight'];
}

export function buildStressAiPayload(
  input: StressDiagnosisInput,
  options?: {
    measurementDurationSec?: number;
    report?: StressDiagnosisReport;
    patternAnalysis?: StressAiPayload['patternAnalysis'];
  }
): StressAiPayload {
  const report = options?.report ?? buildStressDiagnosisReport(input);
  const measurementMode = input.measurementMode ?? 'current';
  const groupInfo = resolveStressAnimalGroup(input.species);

  return {
    animal: {
      userInput: input.species.trim(),
      group: groupInfo.group,
      groupLabel: groupInfo.label,
    },
    measurement: {
      mode: measurementMode,
      durationSec: options?.measurementDurationSec ?? 8,
      ambientNoiseDb: input.ambientNoiseDb,
      noiseBand: report.noiseBandLabel,
      vibrationLevel: input.vibrationLevel,
      vibrationBand: getVibrationBandLabel(input.vibrationLevel),
      directSunlight: input.directSunlight,
    },
    diagnosis: {
      score: report.score,
      level: report.level,
      label: getDiagnosisLabel(report.level),
    },
    patternAnalysis: options?.patternAnalysis,
    interpretationRules: {
      priorityFactors: getPriorityFactors(groupInfo),
      groupGuidance: groupInfo.guidance,
      doNotChangeVerdict: true,
    },
    uiContext: {
      screenName: '입주 전 환경 적합성 진단',
      tone: 'short_clear_supportive',
      language: 'ko-KR',
    },
  };
}

export function buildStressAiPromptBundle(payload: StressAiPayload): StressAiPromptBundle {
  const system = [
    '당신은 소동물 입주 전 환경 적합성 진단 결과를 설명하는 도우미입니다.',
    '앱이 이미 계산한 score, level, label을 절대 수정하지 마세요.',
    '당신의 역할은 판정을 다시 계산하는 것이 아니라 결과를 짧고 명확한 한국어로 설명하는 것입니다.',
    '동물군별 해석 규칙을 반드시 따르고, 주요 원인 1~2개와 개선 팁 1~2개만 간결하게 제시하세요.',
    '출력은 3문단 이내로 작성하고, 과장하거나 임상 진단처럼 말하지 마세요.',
    '현재 측정 결과라면 필요 시 피크 시간 재측정을 한 문장으로 권하세요.',
  ].join(' ');

  const user = JSON.stringify(payload, null, 2);

  return {
    system,
    user,
  };
}

export function buildStressAiPreview(payload: StressAiPayload): StressAiPreview {
  const { animal, measurement, diagnosis, interpretationRules } = payload;

  const mainFactor =
    interpretationRules.priorityFactors[0] === 'vibration'
      ? `진동은 ${measurement.vibrationBand.toLowerCase()} 수준으로 해석됩니다.`
      : `소음은 ${measurement.noiseBand} 구간으로 해석됩니다.`;

  const sunlightFactor = measurement.directSunlight
    ? '직사광선 가능성도 함께 반영되어 더 보수적으로 판단했습니다.'
    : '직사광선 보정 항목은 현재 큰 위험 요인으로 반영되지 않았습니다.';

  const retestLine =
    measurement.mode === 'current'
      ? '생활 소음이나 진동이 큰 시간대에 다시 측정하면 더 정확한 비교가 가능합니다.'
      : '현재 결과는 피크 시간 기준이므로 평소 환경보다 보수적으로 해석하는 것이 좋습니다.';

  return {
    title: `${animal.groupLabel} 해석`,
    body: `${animal.userInput || animal.groupLabel}은(는) ${diagnosis.label}으로 판정되었습니다. ${mainFactor} ${interpretationRules.groupGuidance} ${sunlightFactor} ${retestLine}`,
  };
}
