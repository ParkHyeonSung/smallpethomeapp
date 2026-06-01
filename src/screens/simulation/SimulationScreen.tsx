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
  deleteCageSimulation,
  getMyCageSimulations,
} from '@/src/lib/cage-simulations';

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
  const [deletingSimulationId, setDeletingSimulationId] = useState<string | null>(null);

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

      router.push({
        pathname: '/simulation/[id]',
        params: { id: nextSimulation.id, draft: '1' },
      });
    } catch (error) {
      Alert.alert(
        '시뮬레이션 시작 실패',
        error instanceof Error ? error.message : '케이지 시뮬레이션을 시작하지 못했습니다.'
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleDeleteSimulation = (simulationId: string) => {
    const runDelete = async () => {
      try {
        setDeletingSimulationId(simulationId);
        await deleteCageSimulation(simulationId);
        await loadSimulations();
      } catch (error) {
        Alert.alert(
          '시뮬레이션 삭제 실패',
          error instanceof Error ? error.message : '저장된 시뮬레이션을 삭제하지 못했습니다.'
        );
      } finally {
        setDeletingSimulationId(null);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' ? window.confirm('이 시뮬레이션을 삭제할까요?') : false;
      if (confirmed) {
        void runDelete();
      }
      return;
    }

    Alert.alert('시뮬레이션 삭제', '이 시뮬레이션을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void runDelete() },
    ]);
  };

  return (
    <ScreenContainer scroll contentStyle={[styles.content, isDesktopWeb && styles.contentDesktop]}>
      <AppHeader
        title="3D 시뮬레이션"
        subtitle="3D 시뮬레이션을 통해 미리 케이지를 꾸며봐요"
      />

      <View style={[styles.startCard, isDesktopWeb && styles.startCardDesktop]}>
        <View style={styles.heroIcon}>
          <Ionicons name="cube-outline" size={28} color={colors.primaryStrong} />
        </View>
        <Text style={styles.heroTitle}>케이지 크기 입력</Text>

        <View style={[styles.dimensionRow, !isDesktopWeb && styles.dimensionRowMobile]}>
          <DimensionInput label="가로 (cm)" value={cageWidthCm} onChange={setCageWidthCm} />
          <DimensionInput label="세로 (cm)" value={cageDepthCm} onChange={setCageDepthCm} />
          <DimensionInput label="높이 (cm)" value={cageHeightCm} onChange={setCageHeightCm} />
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
            <Text style={styles.stateText}>위에서 케이지 크기를 입력하고 시작해보세요.</Text>
          </View>
        ) : null}

        {!isLoading && simulations.length > 0 ? (
          <View style={styles.simulationList}>
            {simulations.map((simulation) => (
              <View key={simulation.id} style={styles.simulationItem}>
                <Pressable
                  style={styles.simulationMain}
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

                <Pressable
                  style={[
                    styles.simulationDeleteButton,
                    deletingSimulationId === simulation.id && styles.disabled,
                  ]}
                  onPress={() => handleDeleteSimulation(simulation.id)}
                  disabled={deletingSimulationId === simulation.id}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
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
    borderRadius: 14,
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  heroTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text,
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
    fontWeight: '700',
    color: colors.text,
  },
  input: {
    minHeight: 48,
    borderRadius: 10,
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
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  savedCard: {
    gap: 16,
    padding: 18,
    borderRadius: 14,
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
    fontWeight: '700',
    color: colors.text,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
  },
  refreshButtonText: {
    fontSize: 12,
    fontWeight: '600',
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
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    gap: 10,
  },
  simulationMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  simulationIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  simulationMeta: {
    flex: 1,
    gap: 4,
  },
  simulationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  simulationSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  simulationDeleteButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F2B7B7',
  },
  disabled: {
    opacity: 0.7,
  },
});
