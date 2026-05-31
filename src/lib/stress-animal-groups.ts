export type StressAnimalGroup =
  | 'rodent'
  | 'guinea_pig'
  | 'rabbit'
  | 'reptile'
  | 'other_small_mammal';

export type StressAnimalGroupInfo = {
  group: StressAnimalGroup;
  label: string;
  guidance: string;
  directSunlightPenalty: number;
  directSunlightNote: string;
};

const RODENTS = ['햄스터', '저빌', '마우스', '쥐', '랫드', '친칠라', '데구'];
const GUINEA_PIGS = ['기니피그'];
const RABBITS = ['토끼'];
const REPTILES = ['도마뱀', '게코', '레오파드게코', '이구아나', '거북', '육지거북', '수생거북', '뱀'];
const OTHER_SMALL_MAMMALS = ['고슴도치', '슈가글라이더', '페럿'];

function includesAnySpecies(normalizedSpecies: string, speciesNames: string[]) {
  return speciesNames.some((name) => normalizedSpecies.includes(name.toLowerCase()));
}

export function resolveStressAnimalGroup(species: string): StressAnimalGroupInfo {
  const normalizedSpecies = species.trim().toLowerCase();

  if (includesAnySpecies(normalizedSpecies, GUINEA_PIGS)) {
    return {
      group: 'guinea_pig',
      label: '기니피그류',
      guidance:
        '기니피그류는 소음과 갑작스러운 놀람 자극을 더 민감하게 설명하고, 지속 소음과 경계 반응 가능성을 함께 안내합니다.',
      directSunlightPenalty: 8,
      directSunlightNote:
        '기니피그류는 피할 공간 없는 직사광선 노출이 열부하와 회피 스트레스로 이어질 수 있어 보수적으로 반영합니다.',
    };
  }

  if (includesAnySpecies(normalizedSpecies, RABBITS)) {
    return {
      group: 'rabbit',
      label: '토끼류',
      guidance:
        '토끼류는 갑작스러운 소음과 놀람 반응을 더 크게 해석하고, 패닉이나 도주성 반응 위험을 함께 설명합니다.',
      directSunlightPenalty: 8,
      directSunlightNote:
        '토끼류는 피할 공간 없는 직사광선 노출 시 열 축적과 회피 불가 상황이 문제가 될 수 있어 벌점을 적용합니다.',
    };
  }

  if (includesAnySpecies(normalizedSpecies, REPTILES)) {
    return {
      group: 'reptile',
      label: '파충류',
      guidance:
        '파충류는 소음 자체보다 진동과 직사광선, 열환경 영향을 더 우선적으로 설명하고, 바닥 진동 전달 가능성을 강조합니다.',
      directSunlightPenalty: 0,
      directSunlightNote:
        '파충류는 종에 따라 빛과 열 요구가 달라 공통 벌점을 적용하지 않고, 해석 단계에서만 주의 문구로 반영합니다.',
    };
  }

  if (includesAnySpecies(normalizedSpecies, OTHER_SMALL_MAMMALS)) {
    return {
      group: 'other_small_mammal',
      label: '기타 소형 포유류',
      guidance:
        '기타 소형 포유류는 보수적으로 설치류형 해석을 적용하되, 야행성일 수 있다는 점을 고려해 생활 소음 노출을 조심스럽게 설명합니다.',
      directSunlightPenalty: 8,
      directSunlightNote:
        '기타 소형 포유류는 포유류 기본 규칙에 따라 피할 공간 없는 직사광선을 중간 수준 위험으로 반영합니다.',
    };
  }

  if (includesAnySpecies(normalizedSpecies, RODENTS) || !normalizedSpecies) {
    return {
      group: 'rodent',
      label: '설치류',
      guidance:
        '설치류는 반복 소음과 갑작스러운 생활 소음에 민감할 수 있으므로, 소음 관련 설명을 더 보수적으로 제시합니다.',
      directSunlightPenalty: 8,
      directSunlightNote:
        '설치류는 피할 공간 없는 직사광선 노출 시 열부하와 과도한 밝기 자극 위험이 있어 벌점을 적용합니다.',
    };
  }

  return {
    group: 'other_small_mammal',
    label: '기타 소형 포유류',
    guidance:
      '분류가 명확하지 않은 경우 보수적으로 기타 소형 포유류 해석을 적용하고, 소음과 진동에 대한 주의 문구를 함께 제공합니다.',
    directSunlightPenalty: 8,
    directSunlightNote:
      '분류가 불명확한 소동물은 안전하게 포유류 기준 직사광선 보정을 적용합니다.',
  };
}
