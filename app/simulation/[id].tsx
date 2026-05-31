import { useEffect, useState } from 'react';

import { ActivityIndicator, StyleSheet, View } from 'react-native';

type SimulationDetailScreenComponent =
  typeof import('@/src/screens/simulation/SimulationDetailScreen').default;

export default function SimulationDetailPage() {
  const [ScreenComponent, setScreenComponent] = useState<SimulationDetailScreenComponent | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadScreen = async () => {
      const module = await import('@/src/screens/simulation/SimulationDetailScreen');
      if (isMounted) {
        setScreenComponent(() => module.default);
      }
    };

    void loadScreen();

    return () => {
      isMounted = false;
    };
  }, []);

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
});
