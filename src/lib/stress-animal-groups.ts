export type StressAnimalCategory = 'rodent' | 'reptile' | 'small_mammal';

export type StressAnimalProfileId =
  | 'rodent_mouse_rat'
  | 'rodent_guinea_pig'
  | 'rodent_other'
  | 'reptile_gecko'
  | 'reptile_other'
  | 'small_mammal_other';

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

export const STRESS_ANIMAL_CATEGORY_OPTIONS: {
  category: StressAnimalCategory;
  label: string;
  options: StressAnimalProfileOption[];
}[] = [
  {
    category: 'rodent',
    label: '설치류',
    options: [
      {
        category: 'rodent',
        categoryLabel: '설치류',
        profileId: 'rodent_mouse_rat',
        label: '마우스·랫',
      },
      {
        category: 'rodent',
        categoryLabel: '설치류',
        profileId: 'rodent_guinea_pig',
        label: '기니피그',
      },
      {
        category: 'rodent',
        categoryLabel: '설치류',
        profileId: 'rodent_other',
        label: '기타 설치류',
      },
    ],
  },
  {
    category: 'reptile',
    label: '파충류',
    options: [
      {
        category: 'reptile',
        categoryLabel: '파충류',
        profileId: 'reptile_gecko',
        label: '게코류',
      },
      {
        category: 'reptile',
        categoryLabel: '파충류',
        profileId: 'reptile_other',
        label: '기타 파충류',
      },
    ],
  },
  {
    category: 'small_mammal',
    label: '소형 포유류',
    options: [
      {
        category: 'small_mammal',
        categoryLabel: '소형 포유류',
        profileId: 'small_mammal_other',
        label: '기타 소형 포유류',
      },
    ],
  },
];

const PROFILE_OPTIONS = STRESS_ANIMAL_CATEGORY_OPTIONS.flatMap((category) => category.options);

const PROFILE_BY_ID = Object.fromEntries(
  PROFILE_OPTIONS.map((option) => [option.profileId, option])
) as Record<StressAnimalProfileId, StressAnimalProfileOption>;

/*
 * 보정값은 사용자에게 노출하지 않는 내부 계산값입니다.
 * 전문적인 연구자료나 발표 기준이 바뀌면 이 표만 조정할 수 있도록 프로필별로 분리합니다.
 */
const PROFILE_CORRECTIONS: Record<
  StressAnimalProfileId,
  Omit<StressAnimalGroupInfo, keyof StressAnimalProfileOption | 'group'>
> = {
  rodent_mouse_rat: {
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
  rodent_guinea_pig: {
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
  rodent_other: {
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
  reptile_gecko: {
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
  reptile_other: {
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
  small_mammal_other: {
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
};

const PROFILE_ALIAS_TO_ID: Record<string, StressAnimalProfileId> = {
  마우스: 'rodent_mouse_rat',
  랫: 'rodent_mouse_rat',
  랫드: 'rodent_mouse_rat',
  쥐: 'rodent_mouse_rat',
  '마우스·랫': 'rodent_mouse_rat',
  기니피그: 'rodent_guinea_pig',
  햄스터: 'rodent_other',
  저빌: 'rodent_other',
  친칠라: 'rodent_other',
  데구: 'rodent_other',
  다람쥐: 'rodent_other',
  설치류: 'rodent_other',
  '기타 설치류': 'rodent_other',
  게코: 'reptile_gecko',
  게코류: 'reptile_gecko',
  레오파드게코: 'reptile_gecko',
  크레스티드게코: 'reptile_gecko',
  도마뱀: 'reptile_other',
  이구아나: 'reptile_other',
  거북: 'reptile_other',
  육지거북: 'reptile_other',
  수생거북: 'reptile_other',
  뱀: 'reptile_other',
  카멜레온: 'reptile_other',
  파충류: 'reptile_other',
  '기타 파충류': 'reptile_other',
  고슴도치: 'small_mammal_other',
  슈가글라이더: 'small_mammal_other',
  페럿: 'small_mammal_other',
  토끼: 'small_mammal_other',
  '기타 소형 포유류': 'small_mammal_other',
  '소형 포유류': 'small_mammal_other',
};

function buildStressAnimalGroupInfo(profileId: StressAnimalProfileId): StressAnimalGroupInfo {
  return {
    group: profileId,
    ...PROFILE_BY_ID[profileId],
    ...PROFILE_CORRECTIONS[profileId],
  };
}

export function resolveStressAnimalGroup(species: string): StressAnimalGroupInfo {
  const normalized = species.trim().toLowerCase();

  if (normalized in PROFILE_BY_ID) {
    return buildStressAnimalGroupInfo(normalized as StressAnimalProfileId);
  }

  for (const [keyword, profileId] of Object.entries(PROFILE_ALIAS_TO_ID)) {
    if (normalized.includes(keyword.toLowerCase())) {
      return buildStressAnimalGroupInfo(profileId);
    }
  }

  return buildStressAnimalGroupInfo('rodent_other');
}
