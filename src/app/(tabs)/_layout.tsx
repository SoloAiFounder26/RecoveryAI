import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="ai" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
