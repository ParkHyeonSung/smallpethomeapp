type StressAiPayload = {
  animal: {
    userInput: string;
    categoryLabel: string;
    groupLabel: string;
  };
  measurement: {
    mode: 'current' | 'peak';
    durationSec: number;
    ambientNoiseDb: number;
    averageDb?: number;
    maxDb?: number;
    p95Db?: number;
    noiseBand: string;
    vibrationLevel: number;
    averageVibrationLevel?: number;
    maxVibrationLevel?: number;
    p95VibrationLevel?: number;
    vibrationBand: string;
    directSunlight: boolean;
  };
  vibrationSummary?: {
    averageState: string;
    peakState: string;
    pattern: string;
    meaning: string;
    guidance: string;
  };
  frequencyAnalysis?: {
    peakFrequencyHz: number;
    dominantBand: string;
    highFrequencyLevel: string;
    lowFrequencyMarkerLevel: string;
    lowBandRatio?: number;
    midBandRatio?: number;
    highBandRatio?: number;
    summary: string;
  };
  noisePatternSummary?: {
    average?: number;
    max?: number;
    p95?: number;
    peakGap?: number;
    spikeCount: number;
    spikeDurationSec: number;
    longestSpikeSec: number;
    activeRatio: number;
    pattern: string;
    userMeaning: string;
  };
  vibrationPatternSummary?: {
    average?: number;
    max?: number;
    p95?: number;
    peakGap?: number;
    spikeCount: number;
    spikeDurationSec: number;
    longestSpikeSec: number;
    activeRatio: number;
    pattern: string;
    userMeaning: string;
  };
  diagnosis: {
    score: number;
    level: string;
    label: string;
  };
  interpretationRules: {
    priorityFactors: ('noise' | 'vibration' | 'direct_sunlight')[];
    groupGuidance: string;
    noiseCautionDb: number;
    noiseWarningDb: number | null;
    vibrationCautionLevel: number;
    vibrationWarningLevel: number;
    frequencyGuidance: string;
    doNotChangeVerdict: true;
  };
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type StressAiResult = {
  suitabilityStatus: string;
  noiseStatus: string;
  vibrationStatus: string;
  noiseInterpretation: string;
  frequencyInterpretation?: string;
  vibrationInterpretation: string;
  why: string;
  improvements: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getPrompt(payload: StressAiPayload) {
  return `
너는 소동물 입주 전 환경 적합성 진단 결과를 설명하는 도우미다.
앱이 이미 계산한 판정은 절대 바꾸지 말고, 입력된 측정 지표를 비교해서 사용자가 이해할 수 있게 해석한다.

절대 규칙:
- suitabilityStatus는 diagnosis.label을 그대로 사용한다.
- noiseStatus는 measurement.noiseBand를 그대로 사용한다.
- vibrationStatus는 measurement.vibrationBand를 그대로 사용한다.
- 새 점수나 새 등급을 계산하지 않는다.
- 평균값만 보고 안정적이라고 단정하지 않는다.
- 피크, 반복 횟수, 피크 지속시간, 대부분 구간의 높은 값, 평균 대비 최대값 차이가 있으면 반드시 함께 고려한다.
- 의학적 진단이나 확정적 원인처럼 말하지 않는다.
- 반드시 JSON만 반환한다.
- 사용자에게 통계 용어, 내부 필드명, 분석용 변수명을 그대로 말하지 않는다.
- 각 해석 문장은 너무 짧게 끝내지 말고, 측정값이 의미하는 점과 확인할 원인 후보를 함께 포함한다.

해석에 사용할 큰 틀:
- averageDb: 전체 측정 시간의 평균 소음이다.
- maxDb: 측정 중 가장 크게 들어온 순간 소음이다.
- p95Db: 측정값 대부분이 어느 수준까지 올라갔는지 보는 소음 값이다.
- averageVibrationLevel: 전체 측정 시간의 평균 진동 값이다.
- maxVibrationLevel: 측정 중 가장 크게 튄 진동 값이다.
- p95VibrationLevel: 대부분의 진동 구간이 어느 수준까지 올라갔는지 보는 값이다.
- noisePatternSummary.p95: 대부분의 측정 구간에서 어느 정도까지 올라갔는지 보는 값이다.
- noisePatternSummary.peakGap: 평균과 최대의 차이다. 차이가 크면 평균이 낮아도 갑작스러운 소리 변화가 있었다고 해석한다.
- noisePatternSummary.spikeCount: 큰 소리 변화가 반복되었는지 보는 값이다.
- noisePatternSummary.spikeDurationSec: 높은 소리 구간이 전체 중 얼마나 이어졌는지 보는 값이다.
- vibrationSummary와 vibrationPatternSummary는 진동 그래프의 형태를 사용자용 표현으로 요약한 정보다.
- vibrationPatternSummary.spikeCount, spikeDurationSec, longestSpikeSec가 있으면 평균 상태보다 피크 패턴을 함께 고려한다.
- frequencyAnalysis는 주파수 분석 결과다. peakFrequencyHz, dominantBand, lowBandRatio, midBandRatio, highBandRatio, lowFrequencyMarkerLevel, highFrequencyLevel을 모두 참고한다.
- interpretationRules.frequencyGuidance는 선택된 동물군의 주파수 해석 기준이다. 같은 주파수 값이라도 동물군에 따라 의미가 달라질 수 있으므로 반드시 반영한다.
- interpretationRules.noiseCautionDb, noiseWarningDb, vibrationCautionLevel, vibrationWarningLevel은 현재 동물군 기준이다. 새 생물이 추가되면 이 기준값에 맞춰 해석이 달라져야 한다.

판단 방식:
- 평균은 낮지만 최대값, peakGap, spikeCount가 크면 "평소에는 비교적 조용하지만 순간적인 변화가 크다"는 취지로 설명한다.
- 평균과 p95가 모두 높으면 "측정 시간 전반에 걸쳐 소음이 깔려 있다"는 취지로 설명한다.
- spikeCount가 적고 max만 높으면 "한두 번의 순간 소음일 가능성"으로 설명한다.
- spikeCount가 많으면 "반복되는 소음/진동 원인이 있을 수 있다"는 취지로 설명한다.
- 진동은 averageVibrationLevel보다 maxVibrationLevel, p95VibrationLevel, vibrationPatternSummary를 더 중요하게 본다.
- 진동은 숫자 점수로 말하지 말고, 안정/약한 흔들림/뚜렷한 흔들림/강한 흔들림 같은 상태 표현과 패턴 표현으로 설명한다.
- frequencyInterpretation은 주파수 수치와 동물군 기준을 함께 보고 작성한다.
- 주파수는 확정 원인이 아니라 "가능성이 있어 확인해 볼 수 있습니다"처럼 표현한다.
- 개선 제안은 TV, 스피커, 문 여닫힘, 환풍기, 냉장고, 흔들리는 선반, 책상 흔들림처럼 확인 가능한 원인 후보를 중심으로 쓴다.

사용자용 표현 규칙:
- p95, 95퍼센타일, percentile이라는 말을 절대 쓰지 않는다.
- peakGap, spikeCount, activeRatio, longestSpikeSec 같은 내부 필드명을 절대 쓰지 않는다.
- "대부분 구간의 값", "상위 구간", "피크", "패턴" 같은 분석 표현도 가능하면 쉬운 말로 바꾼다.
- p95Db나 noisePatternSummary.p95는 "대부분의 시간대에서 어느 정도까지 소리가 올라갔는지" 정도로만 풀어쓴다.
- spikeCount는 "큰 변화가 몇 번 반복됐다"가 아니라 "큰 변화가 여러 번 보였다"처럼 자연스럽게 말한다.
- spikeDurationSec는 "큰 변화가 잠깐인지, 어느 정도 이어졌는지"로 풀어쓴다.
- activeRatio는 말하지 말고, "전체 측정 중 일부 구간" 또는 "여러 구간"처럼 표현한다.
- vibration level 숫자는 사용자에게 말하지 말고, "짧게 강하게 흔들림", "흔들림이 여러 번 반복됨", "대부분은 조용하지만 순간 변화가 큼"처럼 설명한다.
- 소음 dB는 평균과 최대만 숫자로 보여줘도 된다. 그 외 분석값은 숫자로 말하지 않는다.
- "안정적이었다"라고 말하려면 평균, 최대, 반복 패턴이 모두 낮을 때만 사용한다.
- 평균이 낮아도 최대값이나 반복 변화가 크면 "평소에는 조용했지만 갑자기 커지는 구간이 있었다"처럼 쓴다.

출력 필드:
- suitabilityStatus: 앱 판정 그대로
- noiseStatus: 앱 소음 상태 그대로
- vibrationStatus: 앱 진동 상태 그대로
- noiseInterpretation: 평균, 최대, 피크/반복 패턴을 함께 해석한 문장
- frequencyInterpretation: 주요 주파수, 낮은/중간/높은 대역 비율, 동물군별 주파수 기준을 쉬운 말로 해석한 문장
- vibrationInterpretation: 진동 상태와 피크/반복 패턴을 해석한 문장
- why: 앱 판정이 왜 그렇게 보이는지 2~3문장
- improvements: 위치나 주변 환경을 어떻게 조정하면 좋을지 2~4문장
- noiseInterpretation, frequencyInterpretation, vibrationInterpretation은 각각 2문장 안팎으로 쓴다.

금지 표현:
- 환경 위험도
- 근거 수준
- 가중치
- 보정값
- 스트레스가 높습니다
- 질병 위험
- AI가 판단했습니다
- p95
- 95퍼센타일
- percentile
- peakGap
- spikeCount
- activeRatio
- longestSpikeSec
- p95Db
- p95VibrationLevel
- 진동 점수
- 0~10
- 1/10
- 3/10
- 7/10
- 10/10
- 평균 진동 1
- 최대 진동 10
- 치료가 필요합니다
- 확정적으로 위험합니다

반환 JSON 형태:
{
  "suitabilityStatus": "",
  "noiseStatus": "",
  "vibrationStatus": "",
  "noiseInterpretation": "",
  "frequencyInterpretation": "",
  "vibrationInterpretation": "",
  "why": "",
  "improvements": ""
}

입력:
${JSON.stringify(payload, null, 2)}
`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not configured.' }, 500);
  }

  const payload = (await request.json()) as StressAiPayload;
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: getPrompt(payload) }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    return jsonResponse({ error: message }, response.status);
  }

  const geminiResult = await response.json();
  const text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return jsonResponse({ error: 'Empty Gemini response.' }, 502);
  }

  try {
    const result = JSON.parse(text) as StressAiResult;
    return jsonResponse(result);
  } catch {
    return jsonResponse({ error: 'Gemini response was not valid JSON.', raw: text }, 502);
  }
});
