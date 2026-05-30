import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import AppHeader from '@/src/components/common/AppHeader';
import ScreenContainer from '@/src/components/common/ScreenContainer';
import { colors } from '@/src/constants/colors';
import {
  CageSimulationItem,
  createCageSimulation,
  getMyCageSimulations,
} from '@/src/lib/cage-simulations';

const CAGE_PRESETS = [
  { label: '소형 케이지', width: 45, depth: 30, height: 30 },
  { label: '기본 케이지', width: 60, depth: 40, height: 35 },
  { label: '넓은 케이지', width: 80, depth: 50, height: 45 },
];

export default function SimulationScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === 'web' && width >= 980;

  const [cageWidthCm, setCageWidthCm] = useState('60');
  const [cageDepthCm, setCageDepthCm] = useState('40');
  const [cageHeightCm, setCageHeightCm] = useState('35');
  const [simulations, setSimulations] = useState<CageSimulationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const loadSimulations = async () => {
    try {
      setIsLoading(true);
      setSimulations(await getMyCageSimulations());
    } catch (error) {
      Alert.alert(
        '시뮬레이션 불러오기 실패',
        error instanceof Error ? error.message : '저장된 시뮬레이션을 불러오지 못했습니다.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    void loadSimulations();
  }, [isFocused]);

  const applyPreset = (preset: (typeof CAGE_PRESETS)[number]) => {
    setCageWidthCm(String(preset.width));
    setCageDepthCm(String(preset.depth));
    setCageHeightCm(String(preset.height));
  };

  const startSimulation = async () => {
    try {
      setIsStarting(true);
      const widthCm = Number(cageWidthCm);
      const depthCm = Number(cageDepthCm);
      const heightCm = Number(cageHeightCm);
      const nextSimulation = await createCageSimulation({
        title: `${widthCm}x${depthCm} 케이지 배치`,
        cageWidthCm: widthCm,
        cageDepthCm: depthCm,
        cageHeightCm: heightCm,
        objects: [],
        isPublic: false,
      });

      router.push({ pathname: '/simulation/[id]', params: { id: nextSimulation.id } });
    } catch (error) {
      Alert.alert(
        '시뮬레이션 시작 실패',
        error instanceof Error ? error.message : '케이지 시뮬레이션을 시작하지 못했습니다.'
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <ScreenContainer
      scroll
      contentStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}>
      <AppHeader
        title="3D 시뮬레이션"
        subtitle="케이지 크기만 정하면 바로 큰 작업 화면에서 배치물을 놓고 크기를 조정할 수 있어요."
      />

      <View style={[styles.startCard, isDesktopWeb && styles.startCardDesktop]}>
        <View style={styles.heroIcon}>
          <Ionicons name="cube-outline" size={28} color={colors.primaryStrong} />
        </View>
        <Text style={styles.heroTitle}>케이지 크기를 먼저 선택해 주세요</Text>
        <Text style={styles.heroText}>
          동물 종류는 받지 않고, 입력한 공간을 기준으로 바로 3D 배치 화면을 엽니다.
        </Text>

        <View style={styles.presetRow}>
          {CAGE_PRESETS.map((preset) => (
            <Pressable key={preset.label} style={styles.presetButton} onPress={() => applyPreset(preset)}>
              <Text style={styles.presetTitle}>{preset.label}</Text>
              <Text style={styles.presetText}>
                {preset.width} x {preset.depth} x {preset.height}cm
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.dimensionRow, !isDesktopWeb && styles.dimensionRowMobile]}>
          <DimensionInput label="가로(cm)" value={cageWidthCm} onChange={setCageWidthCm} />
          <DimensionInput label="세로(cm)" value={cageDepthCm} onChange={setCageDepthCm} />
          <DimensionInput label="높이(cm)" value={cageHeightCm} onChange={setCageHeightCm} />
        </View>

        <Pressable
          style={[styles.startButton, isStarting && styles.disabled]}
          onPress={() => void startSimulation()}
          disabled={isStarting}>
          {isStarting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.startButtonText}>시뮬레이션 화면으로 이동</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>

      <View style={[styles.savedCard, isDesktopWeb && styles.savedCardDesktop]}>
        <View style={styles.savedHeader}>
          <Text style={styles.sectionTitle}>이전에 만든 시뮬레이션</Text>
          <Pressable style={styles.refreshButton} onPress={() => void loadSimulations()}>
            <Ionicons name="refresh" size={16} color={colors.primaryStrong} />
            <Text style={styles.refreshButtonText}>새로고침</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.stateBlock}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stateText}>저장된 시뮬레이션을 불러오는 중입니다...</Text>
          </View>
        ) : null}

        {!isLoading && simulations.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>아직 저장된 시뮬레이션이 없어요.</Text>
            <Text style={styles.stateText}>위에서 케이지 크기를 선택하고 첫 배치를 시작해 보세요.</Text>
          </View>
        ) : null}

        {!isLoading && simulations.length > 0 ? (
          <View style={styles.simulationList}>
            {simulations.map((simulation) => (
              <Pressable
                key={simulation.id}
                style={styles.simulationItem}
                onPress={() =>
                  router.push({ pathname: '/simulation/[id]', params: { id: simulation.id } })
                }>
                <View style={styles.simulationIcon}>
                  <Ionicons name="cube-outline" size={18} color={colors.primaryStrong} />
                </View>
                <View style={styles.simulationMeta}>
                  <Text style={styles.simulationTitle}>{simulation.title}</Text>
                  <Text style={styles.simulationSubtitle}>
                    {simulation.cage_width_cm} x {simulation.cage_depth_cm} x{' '}
                    {simulation.cage_height_cm} cm
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.dimensionInputWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  contentDesktop: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    paddingTop: 28,
  },
  startCard: {
    gap: 16,
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startCardDesktop: {
    padding: 26,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  heroTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '900',
    color: colors.text,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetButton: {
    flexGrow: 1,
    minWidth: 140,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  presetText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryStrong,
  },
  dimensionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dimensionRowMobile: {
    flexDirection: 'column',
  },
  dimensionInputWrap: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  savedCard: {
    gap: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savedCardDesktop: {
    padding: 22,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryStrong,
  },
  stateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyBlock: {
    gap: 8,
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  stateText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
  simulationList: {
    gap: 10,
  },
  simulationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  simulationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  simulationMeta: {
    flex: 1,
    gap: 4,
  },
  simulationTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  simulationSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  disabled: {
    opacity: 0.7,
  },
});
