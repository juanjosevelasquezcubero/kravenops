import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

function tabIcon(emoji: string) {
  const Icon = ({ size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Text style={{ fontSize: size - 4 }}>{emoji}</Text>
  );
  Icon.displayName = `TabIcon(${emoji})`;
  return Icon;
}

export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1565C0',
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Radar', tabBarIcon: tabIcon('📡') }} />
      <Tabs.Screen name="chat" options={{ title: 'Engenheiro', tabBarIcon: tabIcon('🤖') }} />
      <Tabs.Screen name="camera" options={{ title: 'Câmera', tabBarIcon: tabIcon('📷') }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico', tabBarIcon: tabIcon('📜') }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: tabIcon('⚙️') }} />
    </Tabs>
  );
}