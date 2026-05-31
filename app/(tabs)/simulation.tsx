import { useEffect, useState } from 'react';

import { ActivityIndicator, StyleSheet, View } from 'react-native';

type SimulationScreenComponent = typeof import('@/src/screens/simulation/SimulationScreen').default;

export default function SimulationPage() {
  const [ScreenComponent, setScreenComponent] = useState<SimulationScreenComponent | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadScreen = async () => {
      const module = await import('@/src/screens/simulation/SimulationScreen');
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
