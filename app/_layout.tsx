import { Stack } from 'expo-router';
import { wrap } from '../src/diagnostics';
import { colors } from '../src/ui/tokens';

function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

// Sends nothing until crash reports are configured in this build and opted in to.
export default wrap(RootLayout);
