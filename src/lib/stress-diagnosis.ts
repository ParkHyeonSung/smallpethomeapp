export type TrafficLevel = 'low' | 'medium' | 'high';

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
};

export type StressDiagnosisReport = {
  score: number;
  level: 'stable' | 'caution' | 'warning';
  summary: string;
  highlights: string[];
  recommendations: string[];
  noiseBandLabel: string;
  measurementNotice: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTrafficPenalty(level: TrafficLevel) {
  if (level === 'high') return 12;
  if (level === 'medium') return 6;
  return 0;
}

function getCageSizePenalty(species: string, width: number | null, depth: number | null) {
  if (!width || !depth) return 4;

  const area = width * depth;
  const normalized = species.trim().toLowerCase();

  if (normalized.includes('hamster') || normalized.includes('햄스터')) {
    return area < 4000 ? 10 : area < 5000 ? 5 : 0;
  }

  if (normalized.includes('hedgehog') || normalized.includes('고슴도치')) {
    return area < 4500 ? 10 : area < 5600 ? 5 : 0;
  }

  if (normalized.includes('guinea') || normalized.includes('기니피그')) {
    return area < 7000 ? 10 : area < 9000 ? 5 : 0;
  }

  return area < 3600 ? 8 : area < 4800 ? 4 : 0;
}

function getNoiseBand(noiseDb: number) {
  if (noiseDb >= 90) {
    return {
      label: '매우 높음',
      penalty: 36,
      highlight: '스마트폰 기준으로 매우 큰 소음이 감지되었습니다. 문헌상 급성 스트레스 위험 구간에 가깝습니다.',
      recommendation: '즉시 소음원을 줄이고 더 조용한 위치로 케이지를 옮기는 것을 권장합니다.',
    };
  }

  if (noiseDb >= 85) {
    return {
      label: '높음',
      penalty: 28,
      highlight: '고소음 구간에 가까운 환경으로 보입니다. 장시간 유지되면 복지 측면에서 부담이 될 수 있습니다.',
      recommendation: 'TV, 스피커, 청소기, 환풍기 같은 반복 소음원을 먼저 줄여주세요.',
    };
  }

  if (noiseDb >= 80) {
    return {
      label: '주의 필요',
      penalty: 20,
      highlight: '상대적으로 높은 소음이 감지되었습니다. 반복 노출 시 스트레스 가능성이 커질 수 있습니다.',
      recommendation: '조용한 위치로 옮기고, 소음이 큰 시간대가 반복되는지 확인해 주세요.',
    };
  }

  if (noiseDb >= 65) {
    return {
      label: '관찰 필요',
      penalty: 10,
      highlight: '배경 소음이 아주 낮은 편은 아닙니다. 누적 스트레스 관찰이 필요한 구간입니다.',
      recommendation: '가능하면 65 dB 미만의 더 조용한 환경을 유지해 주세요.',
    };
  }

  return {
    label: '안정',
    penalty: 0,
    highlight: '현재 소음은 비교적 안정적인 편으로 보입니다.',
    recommendation: '현재 환경을 유지하면서 특정 시간대의 일시적 소음만 추가 점검해 주세요.',
  };
}

export function buildStressDiagnosisReport(input: StressDiagnosisInput): StressDiagnosisReport {
  const highlights: string[] = [];
  const recommendations: string[] = [];

  let score = 0;

  const noiseBand = getNoiseBand(clamp(input.ambientNoiseDb, 0, 140));
  score += noiseBand.penalty;
  highlights.push(noiseBand.highlight);
  recommendations.push(noiseBand.recommendation);

  const cagePenalty = getCageSizePenalty(input.species, input.cageWidthCm, input.cageDepthCm);
  score += cagePenalty;
  if (cagePenalty >= 8) {
    highlights.push('케이지 바닥 면적이 현재 사육 환경 기준에서 다소 좁을 가능성이 있습니다.');
    recommendations.push('동물 종에 맞는 최소 활동 공간과 은신 공간이 확보되는지 다시 점검해 주세요.');
  }

  const vibrationPenalty = clamp(input.vibrationLevel, 0, 10) * 1.8;
  score += vibrationPenalty;
  if (input.vibrationLevel >= 7) {
    highlights.push('진동 수준이 높아 바닥 충격이나 주변 기기 흔들림이 스트레스 요인이 될 수 있습니다.');
    recommendations.push('단단하고 평평한 바닥으로 옮기고, 진동이 전달되는 가전제품 근처는 피해주세요.');
  } else if (input.vibrationLevel >= 4) {
    highlights.push('약한 진동이 계속 전달될 가능성이 있습니다. 설치 위치를 한 번 더 확인하면 좋습니다.');
    recommendations.push('선반 흔들림이나 문 여닫이 진동이 전달되지 않는지 확인해 주세요.');
  }

  const trafficPenalty = getTrafficPenalty(input.trafficLevel);
  score += trafficPenalty;
  if (input.trafficLevel !== 'low') {
    highlights.push('사람 동선이 잦아 휴식 시간에도 외부 자극이 계속 들어올 수 있습니다.');
    recommendations.push('지나가는 사람이 적고 갑작스러운 움직임이 덜한 위치를 우선 고려해 주세요.');
  }

  if (!input.hideoutReady) {
    score += 12;
    highlights.push('은신처가 없어 불안 상황에서 숨을 수 있는 공간이 부족합니다.');
    recommendations.push('최소 1개 이상의 은신처를 넣고 내부가 너무 밝지 않도록 조정해 주세요.');
  }

  if (!input.ventilationReady) {
    score += 8;
    highlights.push('환기 흐름이 답답하면 열과 냄새가 축적되어 환경 부담이 커질 수 있습니다.');
    recommendations.push('직접적인 찬바람은 피하되 공기 순환이 되는 위치인지 확인해 주세요.');
  }

  if (input.directSunlight) {
    score += 8;
    highlights.push('직사광선 노출은 온도 상승과 과도한 자극으로 이어질 수 있습니다.');
    recommendations.push('직사광선이 직접 닿지 않는 위치로 옮기거나 차광을 고려해 주세요.');
  }

  if (input.nearSpeaker) {
    score += 10;
    highlights.push('스피커, TV, 게임기 근처는 고주파와 반복 소음 노출 위험이 큽니다.');
    recommendations.push('전자기기와 거리를 두고, 진동과 소음이 적은 장소를 우선 선택해 주세요.');
  }

  if (input.unstableFloor) {
    score += 10;
    highlights.push('케이지가 흔들리는 바닥이나 선반 위에 있으면 지속 진동이 전달될 수 있습니다.');
    recommendations.push('더 단단하고 평평한 바닥으로 옮기고 받침대 흔들림을 줄여주세요.');
  }

  const roundedScore = clamp(Math.round(score), 0, 100);
  let level: StressDiagnosisReport['level'] = 'stable';
  let summary =
    '현재 환경은 비교적 안정적으로 보입니다. 다만 시간대별 소음과 진동 변화를 한 번 더 점검하면 좋습니다.';

  if (roundedScore >= 55) {
    level = 'warning';
    summary =
      '현재 환경은 입주 전에 우선 조정이 필요한 항목이 많습니다. 소음, 진동, 배치 조건을 먼저 손보는 편이 좋습니다.';
  } else if (roundedScore >= 28) {
    level = 'caution';
    summary =
      '몇 가지 스트레스 위험 요소가 보입니다. 바로 위험하다고 단정할 수는 없지만, 입주 전 보완을 권장합니다.';
  }

  return {
    score: roundedScore,
    level,
    summary,
    highlights,
    recommendations,
    noiseBandLabel: noiseBand.label,
    measurementNotice:
      '이 결과는 스마트폰 마이크와 센서를 이용한 간이 측정 기반입니다. 절대값보다는 환경 비교와 사전 점검용으로 해석해 주세요.',
  };
}
