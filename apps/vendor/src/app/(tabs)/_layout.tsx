import { Tabs } from "expo-router/js-tabs";
import { TabBar } from "@/components/TabBar";
import { colors } from "@/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.obsidian } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="debtors" options={{ title: "Customers" }} />
      <Tabs.Screen name="dispatch" options={{ title: "Reminders" }} />
      <Tabs.Screen name="account" options={{ title: "Settings" }} />
    </Tabs>
  );
}
