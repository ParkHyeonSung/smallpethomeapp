export type VibrationAnalyzerSnapshot = {
  sampleRate: number;
  fftSize: number;
  rms: number;
  maxFrequencyHz: number;
  peakFrequencyHz: number;
  lowBandLevel: number;
  midBandLevel: number;
  highBandLevel: number;
};

const DEFAULT_SAMPLE_RATE = 50;

function nextPowerOfTwo(value: number) {
  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function normalizeBand(value: number) {
  if (value <= 0) {
    return 0;
  }

  return Math.min(1, Math.log1p(value) / 5);
}

function fft(real: number[], imag: number[]) {
  const n = real.length;
  let j = 0;

  for (let i = 1; i < n; i += 1) {
    let bit = n >> 1;
    while ((j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;

      for (let k = 0; k < len / 2; k += 1) {
        const evenIndex = i + k;
        const oddIndex = i + k + len / 2;
        const oddReal = real[oddIndex] * wReal - imag[oddIndex] * wImag;
        const oddImag = real[oddIndex] * wImag + imag[oddIndex] * wReal;

        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;

        const nextWReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextWReal;
      }
    }
  }
}

export function analyzeVibrationSamples(
  samples: number[],
  sampleRate: number
): VibrationAnalyzerSnapshot | null {
  if (samples.length < 16) {
    return null;
  }

  const safeSampleRate = sampleRate > 0 ? sampleRate : DEFAULT_SAMPLE_RATE;
  const maxFrequencyHz = safeSampleRate / 2;
  const fftSize = Math.max(32, nextPowerOfTwo(samples.length));
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  const real = Array.from({ length: fftSize }, (_, index) => {
    if (index >= samples.length) {
      return 0;
    }

    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(samples.length - 1, 1));
    return (samples[index] - mean) * window;
  });
  const imag = Array.from({ length: fftSize }, () => 0);

  fft(real, imag);

  const binWidth = safeSampleRate / fftSize;
  let peakMagnitude = 0;
  let peakFrequencyHz = 0;
  let lowBand = 0;
  let midBand = 0;
  let highBand = 0;

  for (let bin = 1; bin < fftSize / 2; bin += 1) {
    const frequency = bin * binWidth;
    const magnitude = Math.hypot(real[bin], imag[bin]);

    if (frequency >= 0.5 && frequency <= maxFrequencyHz && magnitude > peakMagnitude) {
      peakMagnitude = magnitude;
      peakFrequencyHz = frequency;
    }

    if (frequency >= 0.5 && frequency < 3) {
      lowBand += magnitude;
    } else if (frequency >= 3 && frequency < 8) {
      midBand += magnitude;
    } else if (frequency >= 8 && frequency <= maxFrequencyHz) {
      highBand += magnitude;
    }
  }

  return {
    sampleRate: safeSampleRate,
    fftSize,
    rms,
    maxFrequencyHz,
    peakFrequencyHz,
    lowBandLevel: normalizeBand(lowBand),
    midBandLevel: normalizeBand(midBand),
    highBandLevel: normalizeBand(highBand),
  };
}

export function getDominantVibrationBandLabel(snapshot: VibrationAnalyzerSnapshot | null) {
  if (!snapshot) {
    return '분석 대기';
  }

  const bands = [
    { label: '저진동', value: snapshot.lowBandLevel },
    { label: '중진동', value: snapshot.midBandLevel },
    { label: '고진동', value: snapshot.highBandLevel },
  ];

  return bands.sort((a, b) => b.value - a.value)[0]?.label ?? '분석 대기';
}
