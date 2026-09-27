import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, size, space, stroke, type } from './tokens';

export type Tab = 'home' | 'history' | 'settings';

const TABS: { key: Tab; label: string; href: Href }[] = [
  { key: 'home', label: 'Home', href: '/' },
  { key: 'history', label: 'History', href: '/history' },
  { key: 'settings', label: 'Settings', href: '/settings' },
];

/**
 * How a tab is reached from the one on screen, on a plain stack. Home is the
 * root, so going Home unwinds to it; from Home the others are pushed on top;
 * between the other two one replaces the other, so the stack never grows.
 */
export function tabMove(from: Tab, to: Tab): 'none' | 'home' | 'push' | 'replace' {
  if (from === to) return 'none';
  if (to === 'home') return 'home';
  return from === 'home' ? 'push' : 'replace';
}

/**
 * Home, History and Settings, labelled, along the foot of those three screens
 * and no others. The one on screen says so to a screen reader as well as by
 * its colour and the rule above it.
 */
export function TabBar({ current }: { current: Tab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const go = (tab: (typeof TABS)[number]) => {
    switch (tabMove(current, tab.key)) {
      case 'home':
        router.dismissTo('/');
        return;
      case 'push':
        router.push(tab.href);
        return;
      case 'replace':
        router.replace(tab.href);
        return;
      case 'none':
        return;
    }
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const on = tab.key === current;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => go(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.rule, on && styles.ruleOn]} />
            <Text style={[styles.label, on && styles.labelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  tab: { flex: 1, height: size.tabBar, alignItems: 'center', justifyContent: 'center' },
  // A short rule over the tab on screen: the place, marked, not decorated.
  rule: {
    position: 'absolute',
    top: stroke.hairline,
    width: space.xl,
    height: stroke.medium,
    backgroundColor: 'transparent',
  },
  ruleOn: { backgroundColor: colors.text },
  label: { ...type.caption, color: colors.muted },
  labelOn: { color: colors.text, fontWeight: '700' },
});
