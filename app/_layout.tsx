import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { wrap } from '../src/diagnostics';
import { PurchasesProvider } from '../src/purchases';
import { LaunchIntro } from '../src/ui/LaunchIntro';
import { colors } from '../src/ui/tokens';

function RootLayout() {
  return (
    <PurchasesProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            // The native stack's own rise and fade. A custom curve would need a
            // JavaScript stack and gesture handler, which this build does not add.
            animation: 'fade_from_bottom',
          }}
        />
        {/* Over the first screen on a cold start only, while it mounts underneath. */}
        <LaunchIntro />
      </View>
    </PurchasesProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});

// Sends nothing until crash reports are configured in this build and opted in to.
export default wrap(RootLayout);
