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

  if (normalized.includes('guinea') || normalized.includes('기니')) {
    return area < 7000 ? 10 : area < 9000 ? 5 : 0;
  }

  return area < 3600 ? 8 : area < 4800 ? 4 : 0;
}

function getNoiseBand(noiseDb: number) {
  if (noiseDb >= 90) {
    return {
      label: '90 dB 이상',
      penalty: 36,
      highlight: '90 dB 이상의 소음은 급성 스트레스 반응 위험이 높은 구간으로 판단했습니다.',
      recommendation: '즉시 더 조용한 위치로 옮기거나 소음원을 차단한 뒤 다시 측정해주세요.',
    };
  }

  if (noiseDb >= 85) {
    return {
      label: '85~89 dB',
      penalty: 28,
      highlight: '85 dB 이상의 지속 소음은 동물복지와 청각 건강 측면에서 피해야 할 고소음 구간입니다.',
      recommendation: '장시간 노출을 피하고, 스피커·가전·작업 소음과 거리를 두는 것이 좋습니다.',
    };
  }

  if (noiseDb >= 80) {
    return {
      label: '80~84 dB',
      penalty: 20,
      highlight: '80 dB 수준의 소음은 설치류의 각성 및 스트레스 반응 가능성이 커지는 구간으로 보았습니다.',
      recommendation: '케이지 위치를 조용한 구역으로 조정하고, 반복적으로 발생하는 소음을 줄여주세요.',
    };
  }

  if (noiseDb >= 65) {
    return {
      label: '65~79 dB',
      penalty: 10,
      highlight: '65 dB 이상의 만성 소음은 장기적으로 생리·행동 변화에 영향을 줄 가능성이 있습니다.',
      recommendation: '입주 전에는 65 dB 미만의 비교적 안정적인 배경 소음을 목표로 점검해주세요.',
    };
  }

  return {
    label: '65 dB 미만',
    penalty: 0,
    highlight: '현재 소음 수준은 비교적 안정적인 배경 소음 구간으로 판단했습니다.',
    recommendation: '입주 후에도 동일한 시간대의 소음을 다시 한 번 측정해 변화가 없는지 확인해주세요.',
  };
}

export function buildStressDiagnosisReport(
  input: StressDiagnosisInput
): StressDiagnosisReport {
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
    highlights.push('케이지 바닥 면적이 현재 종 기준으로 다소 좁게 평가되었습니다.');
    recommendations.push('바닥 면적을 넓히거나 내부 배치를 단순화해 이동 공간을 확보해주세요.');
  }

  const vibrationPenalty = clamp(input.vibrationLevel, 0, 10) * 1.8;
  score += vibrationPenalty;
  if (input.vibrationLevel >= 7) {
    highlights.push('진동 체감이 높아 예민한 개체에게 불안 요소가 될 수 있습니다.');
    recommendations.push('스마트폰 가속도 센서 측정을 병행하고, 흔들림이 적은 받침대로 바꿔주세요.');
  }

  const trafficPenalty = getTrafficPenalty(input.trafficLevel);
  score += trafficPenalty;
  if (input.trafficLevel !== 'low') {
    highlights.push('사람 이동량이 잦은 위치로 판단되었습니다.');
    recommendations.push('복도, 출입문 근처보다 시선과 동선이 덜 겹치는 위치가 유리합니다.');
  }

  if (!input.hideoutReady) {
    score += 12;
    highlights.push('숨을 수 있는 은신처가 준비되지 않았습니다.');
    recommendations.push('입주 전 은신처를 최소 1개 이상 배치해주세요.');
  }

  if (!input.ventilationReady) {
    score += 8;
    highlights.push('환기 상태가 충분하지 않을 가능성이 있습니다.');
    recommendations.push('통풍이 막히지 않도록 케이지 주변 여유 공간을 확보해주세요.');
  }

  if (input.directSunlight) {
    score += 8;
    highlights.push('직사광선 노출 가능성이 있습니다.');
    recommendations.push('직사광선이 바로 닿지 않는 위치로 조정해주세요.');
  }

  if (input.nearSpeaker) {
    score += 10;
    highlights.push('스피커 또는 TV와 가까운 위치입니다.');
    recommendations.push('갑작스러운 저음 진동과 큰 소리를 피할 수 있도록 거리를 두는 것이 좋습니다.');
  }

  if (input.unstableFloor) {
    score += 10;
    highlights.push('케이지를 둔 바닥 또는 선반의 흔들림 가능성이 있습니다.');
    recommendations.push('수평이 맞고 흔들림이 적은 바닥이나 가구 위로 재배치해주세요.');
  }

  const roundedScore = Math.round(score);
  let level: StressDiagnosisReport['level'] = 'stable';
  let summary =
    '현재 환경은 비교적 안정적으로 보이며, 입주 전 기본 조건이 잘 갖춰져 있습니다.';

  if (roundedScore >= 55) {
    level = 'warning';
    summary = '논문 기반 소음 기준과 환경 체크를 종합했을 때, 입주 전 스트레스 위험이 높은 편입니다.';
  } else if (roundedScore >= 28) {
    level = 'caution';
    summary = '일부 스트레스 요인이 보여 보완 후 입주시키는 것이 더 안전한 환경으로 판단됩니다.';
  }

  return {
    score: roundedScore,
    level,
    summary,
    highlights,
    recommendations,
    noiseBandLabel: noiseBand.label,
  };
}
