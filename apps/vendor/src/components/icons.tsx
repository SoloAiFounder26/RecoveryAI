import Svg, { Circle, Path, Rect } from "react-native-svg";

interface IconProps {
  color: string;
  size?: number;
}

const stroke = (color: string) => ({ stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" });

export function VaultIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3.5} y={4.5} width={17} height={15} rx={3} {...stroke(color)} />
      <Circle cx={12} cy={12} r={3.2} {...stroke(color)} />
      <Path d="M12 8.8V7M12 17v-1.8M15.2 12H17M7 12h1.8" {...stroke(color)} />
    </Svg>
  );
}

export function DebtorsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 6.5h14M5 12h14M5 17.5h9" {...stroke(color)} />
      <Circle cx={18.5} cy={17.5} r={1.6} fill={color} />
    </Svg>
  );
}

export function DispatchIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3.5 12h3l2.5-6 4 12 2.5-6h5" {...stroke(color)} />
    </Svg>
  );
}

export function AccountIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8.5} r={3.5} {...stroke(color)} />
      <Path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" {...stroke(color)} />
    </Svg>
  );
}

export function BackIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 5l-7 7 7 7" {...stroke(color)} />
    </Svg>
  );
}

export function PlusIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" {...stroke(color)} strokeWidth={2.4} />
    </Svg>
  );
}

export function PlayIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 5l12 7-12 7z" fill={color} />
    </Svg>
  );
}

export function PauseIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={6} y={5} width={4} height={14} rx={1} fill={color} />
      <Rect x={14} y={5} width={4} height={14} rx={1} fill={color} />
    </Svg>
  );
}
