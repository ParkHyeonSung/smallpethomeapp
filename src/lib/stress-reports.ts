import { StressDiagnosisInput, StressDiagnosisReport } from '@/src/lib/stress-diagnosis';
import { supabase } from '@/src/lib/supabase';

export type StressReportResultSnapshot = {
  durationSec: number;
  suitabilityStatus: string;
  summary: string;
  noise: {
    samples: { timestampMs: number; value: number }[];
    averageDb: number;
    maxDb: number;
    cautionValue: number;
    warningValue: number;
    interpretation: string;
  };
  frequency: {
    peakFrequencyHz: number;
    dominantBand: string;
    highFrequencyLevel: string;
    lowFrequencyMarkerLevel: string;
    lowBandRatio: number;
    midBandRatio: number;
    highBandRatio: number;
    summary: string;
    interpretation: string;
  };
  vibration: {
    samples: { timestampMs: number; value: number }[];
    averageState: string;
    peakState: string;
    cautionValue: number;
    warningValue: number;
    interpretation: string;
  };
};

export type StressReportItem = {
  id: string;
  user_id: string;
  species: string;
  cage_width_cm: number | null;
  cage_depth_cm: number | null;
  ambient_noise_db: number;
  vibration_level: number;
  traffic_level: StressDiagnosisInput['trafficLevel'];
  checklist: {
    hideoutReady: boolean;
    ventilationReady: boolean;
    directSunlight: boolean;
    nearSpeaker: boolean;
    unstableFloor: boolean;
    resultSnapshot?: StressReportResultSnapshot;
  };
  score: number;
  level: StressDiagnosisReport['level'];
  noise_band_label: string;
  summary: string;
  highlights: string[];
  recommendations: string[];
  measurement_notice: string;
  created_at: string;
};

type SaveStressReportInput = {
  diagnosisInput: StressDiagnosisInput;
  report: StressDiagnosisReport;
  resultSnapshot?: StressReportResultSnapshot;
};

function normalizeStressReport(row: any): StressReportItem {
  return {
    id: row.id,
    user_id: row.user_id,
    species: row.species,
    cage_width_cm: row.cage_width_cm === null ? null : Number(row.cage_width_cm),
    cage_depth_cm: row.cage_depth_cm === null ? null : Number(row.cage_depth_cm),
    ambient_noise_db: Number(row.ambient_noise_db),
    vibration_level: Number(row.vibration_level),
    traffic_level: row.traffic_level,
    checklist: row.checklist,
    score: Number(row.score),
    level: row.level,
    noise_band_label: row.noise_band_label,
    summary: row.summary,
    highlights: row.highlights ?? [],
    recommendations: row.recommendations ?? [],
    measurement_notice: row.measurement_notice,
    created_at: row.created_at,
  };
}

export async function saveStressReport({ diagnosisInput, report, resultSnapshot }: SaveStressReportInput) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }

  const species = diagnosisInput.species.trim();

  if (!species) {
    throw new Error('동물 종류를 입력해 주세요.');
  }

  const { data, error } = await supabase
    .from('stress_reports')
    .insert({
      user_id: user.id,
      species,
      cage_width_cm: diagnosisInput.cageWidthCm,
      cage_depth_cm: diagnosisInput.cageDepthCm,
      ambient_noise_db: diagnosisInput.ambientNoiseDb,
      vibration_level: diagnosisInput.vibrationLevel,
      traffic_level: diagnosisInput.trafficLevel,
      checklist: {
        hideoutReady: diagnosisInput.hideoutReady,
        ventilationReady: diagnosisInput.ventilationReady,
        directSunlight: diagnosisInput.directSunlight,
        nearSpeaker: diagnosisInput.nearSpeaker,
        unstableFloor: diagnosisInput.unstableFloor,
        resultSnapshot,
      },
      score: report.score,
      level: report.level,
      noise_band_label: report.noiseBandLabel,
      summary: report.summary,
      highlights: report.highlights,
      recommendations: report.recommendations,
      measurement_notice: report.measurementNotice,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return normalizeStressReport(data);
}

export async function getMyStressReports() {
  const { data, error } = await supabase
    .from('stress_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeStressReport);
}

export async function getMyStressReportById(reportId: string) {
  const { data, error } = await supabase
    .from('stress_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error) {
    throw error;
  }

  return normalizeStressReport(data);
}

export async function deleteStressReport(reportId: string) {
  const { error } = await supabase.from('stress_reports').delete().eq('id', reportId);

  if (error) {
    throw error;
  }
}
