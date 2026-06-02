import { useEffect, useState } from 'react';

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type SimulationDetailScreenComponent =
  typeof import('@/src/screens/simulation/SimulationDetailScreen').default;

export default function SimulationDetailPage() {
  const [ScreenComponent, setScreenComponent] = useState<SimulationDetailScreenComponent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadScreen = async () => {
      try {
        const module = await import('@/src/screens/simulation/SimulationDetailScreen');
        if (isMounted) {
          setScreenComponent(() => module.default);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : '시뮬레이션 상세 화면을 불러오지 못했습니다.');
        }
      }
    };

    void loadScreen();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loadError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>시뮬레이션을 열 수 없습니다</Text>
        <Text style={styles.errorText}>{loadError}</Text>
      </View>
    );
  }

  if (!ScreenComponent) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4A7C59" />
      </View>
    );
  }

  return <ScreenComponent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAF7',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  errorText: {
    marginTop: 8,
    paddingHorizontal: 24,
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
  },
});
