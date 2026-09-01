import { Stack } from 'expo-router';
import { colors } from '../src/ui/tokens';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}