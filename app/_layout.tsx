import { Stack } from 'expo-router';
import { wrap } from '../src/diagnostics';
import { PurchasesProvider } from '../src/purchases';
import { colors } from '../src/ui/tokens';

function RootLayout() {
  return (
    <PurchasesProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          // The native stack's own rise and fade. A custom curve would need a
          // JavaScript stack and gesture handler, which this build does not add.
          animation: 'fade_from_bottom',
        }}
      />
    </PurchasesProvider>
  );
}

// Sends nothing until crash reports are configured in this build and opted in to.
export default wrap(RootLayout);
