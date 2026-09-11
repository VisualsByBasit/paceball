import { Stack } from 'expo-router';
import { colors } from '../src/ui/tokens';
import { wrap } from '../src/diagnostics';

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

export default wrap(RootLayout);
