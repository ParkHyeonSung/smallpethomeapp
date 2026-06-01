import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export type AndroidAudioAnalyzerSnapshot = {
  sampleRate: number;
  fftSize: number;
  rmsDb: number;
  peakFrequencyHz: number;
  lowBandLevel: number;
  midBandLevel: number;
  highBandLevel: number;
  marker32HzLevel: number;
  marker125HzLevel: number;
};

type AndroidAudioAnalyzerNativeModule = {
  start: (sampleRate: number, fftSize: number) => Promise<AndroidAudioAnalyzerSnapshot>;
  stop: () => Promise<AndroidAudioAnalyzerSnapshot>;
  getSnapshot: () => Promise<AndroidAudioAnalyzerSnapshot>;
};

const NativeAndroidAudioAnalyzer = NativeModules.AndroidAudioAnalyzer as
  | AndroidAudioAnalyzerNativeModule
  | undefined;

export function isAndroidAudioAnalyzerAvailable() {
  return Platform.OS === 'android' && Boolean(NativeAndroidAudioAnalyzer);
}

export async function startAndroidAudioAnalyzer(sampleRate = 44100, fftSize = 2048) {
  if (!NativeAndroidAudioAnalyzer) {
    throw new Error('Android audio analyzer native module is not available.');
  }

  return NativeAndroidAudioAnalyzer.start(sampleRate, fftSize);
}

export async function stopAndroidAudioAnalyzer() {
  if (!NativeAndroidAudioAnalyzer) {
    return null;
  }

  return NativeAndroidAudioAnalyzer.stop();
}

export async function getAndroidAudioAnalyzerSnapshot() {
  if (!NativeAndroidAudioAnalyzer) {
    return null;
  }

  return NativeAndroidAudioAnalyzer.getSnapshot();
}

export function addAndroidAudioAnalyzerListener(
  listener: (snapshot: AndroidAudioAnalyzerSnapshot) => void
) {
  return DeviceEventEmitter.addListener('AndroidAudioAnalyzerData', listener);
}

export function mapRmsDbToApproxDisplayDb(rmsDb: number) {
  return Math.round(Math.min(Math.max(rmsDb + 100, 35), 100));
}
