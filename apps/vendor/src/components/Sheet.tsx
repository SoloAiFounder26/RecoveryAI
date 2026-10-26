import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Dark, content-sized bottom sheet used for every quick action. Open with ref.current?.present(). */
export const Sheet = forwardRef<BottomSheetModal, Props>(function Sheet({ title, subtitle, children }, ref) {
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.65} pressBehavior="close" />,
    [],
  );
  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={backdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: colors.abyss, borderWidth: 1, borderColor: colors.line, borderRadius: 28 }}
      handleIndicatorStyle={{ backgroundColor: colors.faint, width: 40 }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        <View className="mb-4 mt-1">
          <Text className="text-[20px] font-extrabold text-ink">{title}</Text>
          {subtitle ? <Text className="mt-1 text-[13px] leading-5 text-mute">{subtitle}</Text> : null}
        </View>
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
