import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/constants/colors';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
};

export default function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryStrong,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
