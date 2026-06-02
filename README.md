# KEKKU 소동물 사육 환경 공유 앱

소동물용 나만의 집 정보 공유 SNS 졸업 작품 프로젝트입니다. 커뮤니티, 이미지 기반 제품 태그, 3D 케이지 배치 시뮬레이션, 입주 전 환경 적합성 진단을 중심으로 구현하고 있습니다.

## 기술 스택

- Expo, React Native, TypeScript, Expo Router
- Supabase Auth, Postgres, Storage, Edge Functions
- React Three Fiber, Three.js, expo-gl
- expo-audio, expo-sensors, Android AudioRecord 네이티브 분석 모듈
- Gemini API 기반 환경 진단 결과 해석

## 현재 중점 작업

### 입주 전 환경 적합성 진단

- 휴대폰 마이크와 가속도 센서로 케이지가 놓일 위치의 소음, 진동, 주파수 성격을 측정합니다.
- 빠른 측정은 1분, 정밀 측정은 10분 기준입니다.
- 앱 내부 판정은 소음, 진동, 직사광선 조건과 동물군별 기준을 기반으로 계산합니다.
- AI는 앱 판정을 바꾸지 않고, 평균/최대/반복/피크/주파수 대역 데이터를 받아 사용자가 이해하기 쉬운 문장으로 해석합니다.
- 결과 화면과 진단 기록 상세 화면은 같은 결과 패널을 사용해 그래프, 주파수 분석, AI 해석을 일관되게 보여줍니다.

### 동물군별 기준

- 동물군 기준은 `src/lib/stress-animal-groups.ts`에서 관리합니다.
- 새 생물이 추가되면 소음 기준, 진동 기준, 주파수 해석 가이드를 함께 추가해 종별 해석이 달라지도록 구성했습니다.
- 현재 구분은 설치류, 파충류, 소형 포유류 중심입니다.

### AI 해석

- Supabase Edge Function `generate-stress-ai`에서 Gemini API를 호출합니다.
- 반환 필드는 `noiseInterpretation`, `frequencyInterpretation`, `vibrationInterpretation`, `why`, `improvements`입니다.
- `p95`, `spikeCount`, `peakGap` 같은 내부 분석 용어는 사용자에게 직접 노출하지 않고 쉬운 표현으로 풀어 쓰도록 프롬프트를 구성했습니다.

## 개발 실행

```bash
npm install
npx expo start
```

## 검증

```bash
npx tsc --noEmit
npm run lint
```

Android 네이티브 모듈을 수정한 경우에는 Expo Go가 아니라 개발 빌드 재설치가 필요합니다.
