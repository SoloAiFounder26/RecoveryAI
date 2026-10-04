import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { colors, radius, shadow, spacing, typography } from '@/theme';

export default function SplashScreen() {
  const enterApp = () => router.replace('/home');

  return (
    <LinearGradient colors={[colors.heroStart, colors.night]} style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Ionicons name="trending-up" size={44} color={colors.accent} />
          </View>
          <Text style={styles.wordmark}>
            Recover<Text style={{ color: colors.accent }}>AI</Text>
          </Text>
          <Text style={styles.tagline}>Your AI Recovery Assistant</Text>
          <Text style={styles.subTagline}>Get paid faster. Focus on what matters.</Text>
        </View>

        <HeroIllustration />

        <View style={styles.footer}>
          <Button label="Get Started" size="lg" onPress={enterApp} style={styles.cta} />
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account?</Text>
            <Pressable onPress={enterApp} hitSlop={8}>
              <Text style={styles.loginLink}>Log In</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** Phone + AI chip illustration built from primitives (no image assets yet). */
function HeroIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={[styles.orbit, { width: 260, height: 120 }]} />
      <View style={[styles.orbit, { width: 200, height: 90, opacity: 0.6 }]} />
      <View style={styles.glow} />

      <View style={styles.phone}>
        <View style={styles.phoneNotch} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.phoneRow}>
            <View style={styles.phoneAvatar} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={[styles.phoneLine, { width: '80%' }]} />
              <View style={[styles.phoneLine, { width: '50%', opacity: 0.6 }]} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.aiChip}>
        <Text style={styles.aiChipText}>AI</Text>
        <Ionicons name="sparkles" size={12} color={colors.accent} style={styles.aiChipSparkle} />
      </View>
      <View style={styles.check}>
        <Ionicons name="checkmark" size={22} color="#FFFFFF" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'space-between' },
  brand: { alignItems: 'center', marginTop: spacing.xxxl * 2 },
  logoMark: { marginBottom: spacing.sm },
  wordmark: { ...typography.display, color: colors.textOnDark },
  tagline: { ...typography.h3, color: colors.textOnDark, marginTop: spacing.lg, fontWeight: '600' },
  subTagline: { ...typography.body, color: colors.textOnDarkMuted, marginTop: spacing.xs },

  illustration: { height: 260, alignItems: 'center', justifyContent: 'center' },
  orbit: {
    position: 'absolute',
    borderRadius: 200,
    borderWidth: 1.5,
    borderColor: 'rgba(34,197,94,0.45)',
    transform: [{ rotate: '-12deg' }],
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.nightGlow,
    opacity: 0.35,
  },
  phone: {
    width: 110,
    height: 190,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#5FD38D',
    backgroundColor: '#EAF6EF',
    padding: spacing.sm,
    paddingTop: spacing.lg,
    gap: spacing.sm,
    transform: [{ rotate: '-10deg' }],
    ...shadow.glow,
  },
  phoneNotch: {
    position: 'absolute',
    top: 5,
    alignSelf: 'center',
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#B8D9C5',
  },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 6, padding: 5 },
  phoneAvatar: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#9FC9B0' },
  phoneLine: { height: 4, borderRadius: 2, backgroundColor: '#CFE3D7' },
  aiChip: {
    position: 'absolute',
    top: 40,
    right: '24%',
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryDeep,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
  },
  aiChipText: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  aiChipSparkle: { position: 'absolute', top: -16, right: -6 },
  check: {
    position: 'absolute',
    top: 118,
    right: '35%',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#EAF6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: { marginBottom: spacing.xxl, gap: spacing.lg },
  cta: { borderRadius: radius.xl, backgroundColor: colors.accent, borderColor: colors.accent },
  loginRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  loginText: { ...typography.caption, color: colors.textOnDarkMuted },
  loginLink: { ...typography.captionStrong, color: colors.accent },
});
