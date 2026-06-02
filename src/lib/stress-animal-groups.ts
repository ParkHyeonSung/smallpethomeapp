export const STRESS_ANIMAL_CATEGORY_DEFINITIONS = [
  { category: 'rodent', label: '설치류' },
  { category: 'reptile', label: '파충류' },
  { category: 'small_mammal', label: '소형 포유류' },
] as const;

export type StressAnimalCategory =
  (typeof STRESS_ANIMAL_CATEGORY_DEFINITIONS)[number]['category'];

type StressAnimalProfileDefinition = {
  category: StressAnimalCategory;
  profileId: string;
  label: string;
  aliases: readonly string[];
  screeningGuidance: {
    noiseFocus: string;
    vibrationFocus: string;
    frequencyFocus: string;
  };
  guidance: string;
  noiseCorrection: number;
  vibrationCorrection: number;
  highFrequencyCorrection: number;
  suddenNoiseCorrection: number;
  repeatedExposureCorrection: number;
  noiseCautionDb: number;
  noiseWarningDb: number | null;
  vibrationCautionLevel: number;
  vibrationWarningLevel: number;
  frequencyGuidance: string;
  directSunlightCorrection: number;
  directSunlightNote: string;
};

/*
 * 동물군 추가/수정은 이 배열만 고치면 됩니다.
 *
 * 새 동물 추가 예시:
 * {
 *   category: 'rodent',
 *   profileId: 'rodent_hamster',
 *   label: '햄스터',
 *   aliases: ['햄스터', '골든햄스터', '드워프햄스터'],
 *   screeningGuidance: {
 *     noiseFocus: '갑작스럽게 커지는 소리와 반복 소음을 더 보수적으로 봅니다.',
 *     vibrationFocus: '반복되는 흔들림과 순간 피크를 함께 확인합니다.',
 *     frequencyFocus: '낮은 대역과 높은 대역의 반복 변화를 함께 확인합니다.',
 *   },
 *   noiseCautionDb: 75,
 *   noiseWarningDb: 85,
 *   vibrationCautionLevel: 3,
 *   vibrationWarningLevel: 6,
 *   ...해석/보정 문구와 보정값
 * }
 *
 * 새 대분류가 필요하면 STRESS_ANIMAL_CATEGORY_DEFINITIONS에 먼저 추가한 뒤
 * category에 그 값을 사용하면 선택 UI와 판정/AI 페이로드에 함께 반영됩니다.
 */
export const STRESS_ANIMAL_PROFILES = [
  {
    category: 'rodent',
    profileId: 'rodent_mouse_rat',
    label: '마우스·랫',
    aliases: ['마우스', '랫', '랫드', '쥐', '마우스·랫'],
    screeningGuidance: {
      noiseFocus:
        '갑작스럽게 커지는 소리, 반복 소음, 평균보다 크게 튀는 순간 소리를 더 보수적으로 봅니다.',
      vibrationFocus:
        '반복되는 흔들림, 순간적으로 강한 흔들림, 일정 시간 이어지는 진동 구간을 함께 확인합니다.',
      frequencyFocus:
        '32.5Hz와 125Hz 근처 저주파 표지, 높은 대역의 반복 변화를 주의 요인으로 봅니다.',
    },
    guidance:
      '마우스·랫은 갑작스럽게 커지는 소리, 반복 소음, 높은 대역의 소리 변화에 주의가 필요합니다.',
    noiseCorrection: 1.25,
    vibrationCorrection: 1,
    highFrequencyCorrection: 1.3,
    suddenNoiseCorrection: 1.25,
    repeatedExposureCorrection: 1.2,
    noiseCautionDb: 80,
    noiseWarningDb: 85,
    vibrationCautionLevel: 3,
    vibrationWarningLevel: 6,
    frequencyGuidance:
      '설치류는 갑작스러운 소리 변화와 높은 대역의 반복 소리에 더 보수적으로 해석합니다.',
    directSunlightCorrection: 8,
    directSunlightNote:
      '설치류는 피할 공간 없는 직사광선 노출 시 열부하와 과도한 밝기 자극 위험이 있어 보수적으로 해석합니다.',
  },
  {
    category: 'rodent',
    profileId: 'rodent_guinea_pig',
    label: '기니피그',
    aliases: ['기니피그'],
    screeningGuidance: {
      noiseFocus:
        '갑작스럽게 커지는 소리와 짧은 피크 소음을 더 민감하게 해석합니다.',
      vibrationFocus:
        '소음과 흔들림이 같은 측정에서 함께 나타나는지 확인합니다.',
      frequencyFocus:
        '중간 대역의 생활 소음과 반복적인 소리 변화를 함께 확인합니다.',
    },
    guidance:
      '기니피그는 갑작스러운 소리와 소음·진동이 동시에 나타나는 환경에 주의가 필요합니다.',
    noiseCorrection: 1.2,
    vibrationCorrection: 1.1,
    highFrequencyCorrection: 1,
    suddenNoiseCorrection: 1.25,
    repeatedExposureCorrection: 1.15,
    noiseCautionDb: 75,
    noiseWarningDb: 85,
    vibrationCautionLevel: 3,
    vibrationWarningLevel: 6,
    frequencyGuidance:
      '기니피그는 갑작스러운 생활 소음과 중간 대역의 반복 소리를 함께 확인합니다.',
    directSunlightCorrection: 8,
    directSunlightNote:
      '기니피그는 피할 공간 없는 직사광선 노출이 열부하와 회피 스트레스로 이어질 수 있어 보수적으로 해석합니다.',
  },
  {
    category: 'rodent',
    profileId: 'rodent_other',
    label: '기타 설치류',
    aliases: ['햄스터', '저빌', '친칠라', '데구', '다람쥐', '설치류', '기타 설치류'],
    screeningGuidance: {
      noiseFocus:
        '설치류 공통 기준으로 갑작스러운 소리 변화와 반복 소음을 보수적으로 봅니다.',
      vibrationFocus:
        '반복되는 흔들림과 순간 피크가 함께 나타나는지 확인합니다.',
      frequencyFocus:
        '32.5Hz와 125Hz 근처 저주파 표지, 높은 대역의 반복 변화를 주의 요인으로 봅니다.',
    },
    guidance:
      '기타 설치류는 개별 종별 기준을 단정하지 않고, 설치류 공통 기준으로 소리 변화와 반복 소음을 보수적으로 해석합니다.',
    noiseCorrection: 1.15,
    vibrationCorrection: 1,
    highFrequencyCorrection: 1.15,
    suddenNoiseCorrection: 1.2,
    repeatedExposureCorrection: 1.15,
    noiseCautionDb: 80,
    noiseWarningDb: 85,
    vibrationCautionLevel: 3,
    vibrationWarningLevel: 6,
    frequencyGuidance:
      '기타 설치류는 높은 대역과 반복적인 소리 변화를 보수적으로 확인합니다.',
    directSunlightCorrection: 8,
    directSunlightNote:
      '설치류는 피할 공간 없는 직사광선 노출 시 열부하와 과도한 밝기 자극 위험이 있어 보수적으로 해석합니다.',
  },
  {
    category: 'reptile',
    profileId: 'reptile_gecko',
    label: '게코류',
    aliases: ['게코', '게코류', '레오파드게코', '크레스티드게코'],
    screeningGuidance: {
      noiseFocus:
        '공기 중 소음만으로 강하게 단정하지 않고, 반복되는 소리 변화가 있는지 확인합니다.',
      vibrationFocus:
        '바닥이나 선반을 타고 전달되는 흔들림, 반복 진동, 순간 피크를 우선적으로 봅니다.',
      frequencyFocus:
        '낮은 대역의 울림과 중·높은 대역의 뚜렷한 소리 변화를 함께 확인합니다.',
    },
    guidance:
      '게코류는 공기 중 소음보다 짧은 진동, 반복 진동, 선반·바닥을 통해 전달되는 흔들림을 중심으로 해석합니다.',
    noiseCorrection: 0.85,
    vibrationCorrection: 1.35,
    highFrequencyCorrection: 0.7,
    suddenNoiseCorrection: 1,
    repeatedExposureCorrection: 1.1,
    noiseCautionDb: 90,
    noiseWarningDb: null,
    vibrationCautionLevel: 2,
    vibrationWarningLevel: 5,
    frequencyGuidance:
      '게코류는 공기 중 소리보다 바닥이나 선반을 타고 전달되는 낮은 대역의 울림과 진동을 더 중요하게 봅니다.',
    directSunlightCorrection: 0,
    directSunlightNote:
      '파충류는 종에 따라 빛과 열 요구가 달라 공통 벌점을 적용하지 않고, 해석 단계에서만 주의 문구로 다룹니다.',
  },
  {
    category: 'reptile',
    profileId: 'reptile_other',
    label: '기타 파충류',
    aliases: [
      '도마뱀',
      '이구아나',
      '거북',
      '육지거북',
      '수생거북',
      '뱀',
      '카멜레온',
      '파충류',
      '기타 파충류',
    ],
    screeningGuidance: {
      noiseFocus:
        '공기 중 소음만으로 강하게 단정하지 않고, 소리 변화가 반복되는지 확인합니다.',
      vibrationFocus:
        '바닥, 선반, 받침대를 통해 전달되는 흔들림과 반복 진동을 우선적으로 봅니다.',
      frequencyFocus:
        '낮은 대역의 울림과 공기 중 소리가 함께 나타나는지 조심스럽게 확인합니다.',
    },
    guidance:
      '기타 파충류는 종별 차이가 크므로 단일 기준으로 단정하지 않고, 진동원과 받침대 흔들림을 중심으로 해석합니다.',
    noiseCorrection: 0.8,
    vibrationCorrection: 1.2,
    highFrequencyCorrection: 0.7,
    suddenNoiseCorrection: 0.95,
    repeatedExposureCorrection: 1.05,
    noiseCautionDb: 90,
    noiseWarningDb: null,
    vibrationCautionLevel: 2,
    vibrationWarningLevel: 5,
    frequencyGuidance:
      '파충류는 종별 차이가 커 소리 자체보다 낮은 대역의 울림과 반복 진동을 중심으로 조심스럽게 해석합니다.',
    directSunlightCorrection: 0,
    directSunlightNote:
      '파충류는 종에 따라 빛과 열 요구가 달라 공통 벌점을 적용하지 않고, 해석 단계에서만 주의 문구로 다룹니다.',
  },
  {
    category: 'small_mammal',
    profileId: 'small_mammal_other',
    label: '기타 소형 포유류',
    aliases: [
      '고슴도치',
      '슈가글라이더',
      '페럿',
      '토끼',
      '기타 소형 포유류',
      '소형 포유류',
    ],
    screeningGuidance: {
      noiseFocus:
        '종별 차이를 단정하지 않고 갑작스러운 생활 소음과 반복 소음을 중심으로 봅니다.',
      vibrationFocus:
        '반복되는 흔들림, 순간 피크, 소음과 함께 나타나는 진동을 확인합니다.',
      frequencyFocus:
        '높은 대역의 날카로운 소리와 반복적인 대역 변화를 참고 요인으로 봅니다.',
    },
    guidance:
      '기타 소형 포유류는 특정 종을 단정하지 않고, 소음 또는 진동 변화가 장시간 사육 위치에 부담이 되는지 확인합니다.',
    noiseCorrection: 1.05,
    vibrationCorrection: 1,
    highFrequencyCorrection: 1,
    suddenNoiseCorrection: 1.15,
    repeatedExposureCorrection: 1.1,
    noiseCautionDb: 80,
    noiseWarningDb: 90,
    vibrationCautionLevel: 3,
    vibrationWarningLevel: 6,
    frequencyGuidance:
      '소형 포유류는 갑작스러운 생활 소음, 높은 대역의 날카로운 소리, 반복 진동을 함께 확인합니다.',
    directSunlightCorrection: 8,
    directSunlightNote:
      '소형 포유류는 피할 공간 없는 직사광선 노출이 열부하나 회피 스트레스로 이어질 수 있어 보수적으로 해석합니다.',
  },
] as const satisfies readonly StressAnimalProfileDefinition[];

export type StressAnimalProfileId =
  (typeof STRESS_ANIMAL_PROFILES)[number]['profileId'];

export type StressAnimalGroup = StressAnimalProfileId;

export type StressAnimalProfileOption = {
  category: StressAnimalCategory;
  categoryLabel: string;
  profileId: StressAnimalProfileId;
  label: string;
};

export type StressAnimalGroupInfo = StressAnimalProfileOption & {
  group: StressAnimalGroup;
  guidance: string;
  screeningGuidance: {
    noiseFocus: string;
    vibrationFocus: string;
    frequencyFocus: string;
  };
  noiseCorrection: number;
  vibrationCorrection: number;
  highFrequencyCorrection: number;
  suddenNoiseCorrection: number;
  repeatedExposureCorrection: number;
  noiseCautionDb: number;
  noiseWarningDb: number | null;
  vibrationCautionLevel: number;
  vibrationWarningLevel: number;
  frequencyGuidance: string;
  directSunlightCorrection: number;
  directSunlightNote: string;
};

const CATEGORY_LABEL_BY_ID = Object.fromEntries(
  STRESS_ANIMAL_CATEGORY_DEFINITIONS.map((definition) => [
    definition.category,
    definition.label,
  ])
) as Record<StressAnimalCategory, string>;

function normalizeSpeciesKeyword(value: string) {
  return value.trim().toLowerCase();
}

function buildStressAnimalGroupInfo(
  profile: (typeof STRESS_ANIMAL_PROFILES)[number]
): StressAnimalGroupInfo {
  return {
    group: profile.profileId,
    category: profile.category,
    categoryLabel: CATEGORY_LABEL_BY_ID[profile.category],
    profileId: profile.profileId,
    label: profile.label,
    guidance: profile.guidance,
    screeningGuidance: profile.screeningGuidance,
    noiseCorrection: profile.noiseCorrection,
    vibrationCorrection: profile.vibrationCorrection,
    highFrequencyCorrection: profile.highFrequencyCorrection,
    suddenNoiseCorrection: profile.suddenNoiseCorrection,
    repeatedExposureCorrection: profile.repeatedExposureCorrection,
    noiseCautionDb: profile.noiseCautionDb,
    noiseWarningDb: profile.noiseWarningDb,
    vibrationCautionLevel: profile.vibrationCautionLevel,
    vibrationWarningLevel: profile.vibrationWarningLevel,
    frequencyGuidance: profile.frequencyGuidance,
    directSunlightCorrection: profile.directSunlightCorrection,
    directSunlightNote: profile.directSunlightNote,
  };
}

const PROFILE_INFO_BY_ID = Object.fromEntries(
  STRESS_ANIMAL_PROFILES.map((profile) => [
    profile.profileId,
    buildStressAnimalGroupInfo(profile),
  ])
) as Record<StressAnimalProfileId, StressAnimalGroupInfo>;

const PROFILE_OPTIONS = STRESS_ANIMAL_PROFILES.map((profile) => ({
  category: profile.category,
  categoryLabel: CATEGORY_LABEL_BY_ID[profile.category],
  profileId: profile.profileId,
  label: profile.label,
})) as StressAnimalProfileOption[];

export const STRESS_ANIMAL_CATEGORY_OPTIONS = STRESS_ANIMAL_CATEGORY_DEFINITIONS.map(
  (categoryDefinition) => ({
    category: categoryDefinition.category,
    label: categoryDefinition.label,
    options: PROFILE_OPTIONS.filter(
      (profile) => profile.category === categoryDefinition.category
    ),
  })
);

const PROFILE_ALIAS_TO_ID = new Map<string, StressAnimalProfileId>();

STRESS_ANIMAL_PROFILES.forEach((profile) => {
  [profile.profileId, profile.label, ...profile.aliases].forEach((alias) => {
    PROFILE_ALIAS_TO_ID.set(normalizeSpeciesKeyword(alias), profile.profileId);
  });
});

export function resolveStressAnimalGroup(species: string): StressAnimalGroupInfo {
  const normalized = normalizeSpeciesKeyword(species);
  const directMatch = PROFILE_ALIAS_TO_ID.get(normalized);

  if (directMatch) {
    return PROFILE_INFO_BY_ID[directMatch];
  }

  for (const [keyword, profileId] of PROFILE_ALIAS_TO_ID) {
    if (keyword && normalized.includes(keyword)) {
      return PROFILE_INFO_BY_ID[profileId];
    }
  }

  return PROFILE_INFO_BY_ID.rodent_other;
}
