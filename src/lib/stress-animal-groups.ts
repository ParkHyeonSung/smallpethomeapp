export type StressAnimalGroup =
  | 'rodent'
  | 'guinea_pig'
  | 'rabbit'
  | 'reptile'
  | 'hedgehog'
  | 'sugar_glider'
  | 'ferret';

export type StressAnimalGroupInfo = {
  group: StressAnimalGroup;
  label: string;
  guidance: string;
  noiseWeight: number;
  vibrationWeight: number;
  noiseCautionDb: number;
  noiseWarningDb: number | null;
  directSunlightPenalty: number;
  directSunlightNote: string;
};

/**
 * 소음 가중치(noiseWeight)와 진동 가중치(vibrationWeight)는 다음 논문을 근거로 종별 차등 설정.
 *
 * - NRC, Guide for the Care and Use of Laboratory Animals, 8th Ed. (2011): 70 dB / 25 milli-g 참조값
 * - Rabey et al. (2015): 설치류 공진 주파수 및 25 milli-g 상한
 * - NIH guinea pig ACTH/cortisol study: 소음+진동 동시 노출 시 코르티솔 증폭
 * - NIH rabbit noise study: 소음 → 패닉 도주 반응
 * - Chelini et al. (2024): 파충류 saccule 기질 진동 감지
 * - Hedgehog hearing study (Royal Society Publishing): 피크 40 kHz, 야행성
 * - Sugar glider captive welfare observations: 야행성, 진동 민감, 크래빙 반응
 */

const SPECIES_TO_GROUP: Record<string, StressAnimalGroup> = {
  /* 설치류 */
  햄스터: 'rodent',
  저빌: 'rodent',
  마우스: 'rodent',
  쥐: 'rodent',
  랫드: 'rodent',
  친칠라: 'rodent',
  데구: 'rodent',
  다람쥐: 'rodent',

  /* 기니피그 */
  기니피그: 'guinea_pig',

  /* 토끼 */
  토끼: 'rabbit',

  /* 파충류 */
  도마뱀: 'reptile',
  게코: 'reptile',
  레오파드게코: 'reptile',
  이구아나: 'reptile',
  거북: 'reptile',
  육지거북: 'reptile',
  수생거북: 'reptile',
  뱀: 'reptile',
  카멜레온: 'reptile',

  /* 기타 포유류 — 개별 그룹 */
  고슴도치: 'hedgehog',
  슈가글라이더: 'sugar_glider',
  페럿: 'ferret',
};

const GROUP_INFO: Record<StressAnimalGroup, Omit<StressAnimalGroupInfo, 'group'>> = {
  rodent: {
    label: '설치류',
    guidance:
      '설치류는 반복 소음과 갑작스러운 생활 소음에 민감할 수 있으므로, 소음 관련 설명을 보수적으로 제시합니다.',
    noiseWeight: 1.0,
    vibrationWeight: 3.6,
    noiseCautionDb: 80,
    noiseWarningDb: 85,
    directSunlightPenalty: 8,
    directSunlightNote:
      '설치류는 피할 공간 없는 직사광선 노출 시 열부하와 과도한 밝기 자극 위험이 있어 벌점을 적용합니다.',
  },
  guinea_pig: {
    label: '기니피그',
    guidance:
      '기니피그는 소음+진동 동시 노출 시 스트레스 반응이 증폭되며(NIH 연구), 놀람 자극에 민감합니다.',
    noiseWeight: 1.0,
    vibrationWeight: 4.0,
    noiseCautionDb: 75,
    noiseWarningDb: 85,
    directSunlightPenalty: 8,
    directSunlightNote:
      '기니피그는 피할 공간 없는 직사광선 노출이 열부하와 회피 스트레스로 이어질 수 있어 벌점을 적용합니다.',
  },
  rabbit: {
    label: '토끼',
    guidance:
      '토끼는 갑작스러운 소음에 의한 패닉 도주 반응 위험이 높아(NIH 연구), 소음 가중치를 상향 적용합니다.',
    noiseWeight: 1.15,
    vibrationWeight: 3.2,
    noiseCautionDb: 75,
    noiseWarningDb: 85,
    directSunlightPenalty: 8,
    directSunlightNote:
      '토끼는 피할 공간 없는 직사광선 노출 시 열 축적과 회피 불가 상황이 문제가 될 수 있어 벌점을 적용합니다.',
  },
  reptile: {
    label: '파충류',
    guidance:
      '파충류는 공기 전달 소음보다 바닥 진동 전달에 특화되어 있어(Chelini et al. 2024), 진동 가중치를 높이고 소음 가중치를 낮춥니다.',
    noiseWeight: 0.6,
    vibrationWeight: 5.0,
    noiseCautionDb: 90,
    noiseWarningDb: null,
    directSunlightPenalty: 0,
    directSunlightNote:
      '파충류는 종에 따라 빛과 열 요구가 달라 공통 벌점을 적용하지 않고, 해석 단계에서만 주의 문구로 반영합니다.',
  },
  hedgehog: {
    label: '고슴도치',
    guidance:
      '고슴도치는 야행성이며 청각 피크가 40 kHz로 초음파에 민감합니다(Royal Society Publishing). 낮 시간 소음과 빛 노출에 취약합니다.',
    noiseWeight: 1.1,
    vibrationWeight: 3.6,
    noiseCautionDb: 75,
    noiseWarningDb: 85,
    directSunlightPenalty: 10,
    directSunlightNote:
      '고슴도치는 야행성이라 빛 자극에도 민감하여 직사광선 벌점을 상향 적용합니다.',
  },
  sugar_glider: {
    label: '슈가글라이더',
    guidance:
      '슈가글라이더는 야행성이며 진동과 돌발 소음에 크래빙 방어 반응을 보입니다. 진동 가중치를 상향하고 빛 벌점을 높입니다.',
    noiseWeight: 1.0,
    vibrationWeight: 4.0,
    noiseCautionDb: 75,
    noiseWarningDb: 85,
    directSunlightPenalty: 10,
    directSunlightNote:
      '슈가글라이더는 야행성이라 빛 자극에 민감하여 직사광선 벌점을 상향 적용합니다.',
  },
  ferret: {
    label: '페럿',
    guidance:
      '페럿은 청각이 발달했으나 환경 적응력이 비교적 높아, 소음·진동 가중치를 설치류 대비 소폭 완화하여 적용합니다.',
    noiseWeight: 0.9,
    vibrationWeight: 3.2,
    noiseCautionDb: 80,
    noiseWarningDb: 90,
    directSunlightPenalty: 8,
    directSunlightNote:
      '페럿은 포유류 기본 규칙에 따라 피할 공간 없는 직사광선을 중간 수준 위험으로 반영합니다.',
  },
};

export function resolveStressAnimalGroup(species: string): StressAnimalGroupInfo {
  const normalized = species.trim().toLowerCase();

  for (const [keyword, group] of Object.entries(SPECIES_TO_GROUP)) {
    if (normalized.includes(keyword.toLowerCase())) {
      return { group, ...GROUP_INFO[group] };
    }
  }

  // 매칭 실패 시 설치류 기준(가장 보수적) 적용
  return { group: 'rodent', ...GROUP_INFO.rodent };
}
