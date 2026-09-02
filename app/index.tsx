import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../src/ui/Screen';
import { colors, radius, space, type } from '../src/ui/tokens';

export default function Index() {
  return (
    <Screen style={styles.screen}>
      <View>
        <Text style={styles.title}>Paceball</Text>
        <Text style={styles.sub}>Bowling speed, measured off the pitch.</Text>
      </View>

      <Link href="/capture" style={styles.cta}>
        <Text style={styles.ctaText}>Record a delivery</Text>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingVertical: space.xxl },
  title: { ...type.h1, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    textAlign: 'center',
  },
  ctaText: { ...type.body, color: colors.bg, fontWeight: '800' },
});
