import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AnimatedRef, SharedValue, measure, runOnJS, useAnimatedRef, useSharedValue } from 'react-native-reanimated';

import { colors, font, fontSize, radius, spacing } from '../../theme';

export type RoleChipVariant = 'pool' | 'placed-correct' | 'placed-incorrect';

export interface CardRefEntry {
  id: string;
  ref: AnimatedRef<View>;
}

interface RoleChipProps {
  termId: string;
  label: string;
  variant: RoleChipVariant;
  isDragging: boolean;
  disabled?: boolean;
  // A plain array, not a Map — Reanimated's worklet-closure shareable conversion
  // reliably supports arrays/plain objects; Map is not a safe bet across versions.
  cardEntries: CardRefEntry[];
  screenRef: AnimatedRef<View>;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (termId: string, label: string) => void;
  onDragEnd: () => void;
  onDrop: (termId: string, cardId: string | null) => void;
}

/**
 * A chip's own resting position is used only to seed the shared drag ghost's
 * starting point (see the ghost overlay in app/level2.tsx) — the chip itself
 * never animates in place, it just hides (opacity 0) while `isDragging`, so the
 * flex-wrap pool never reflows mid-drag.
 */
export function RoleChip({
  termId,
  label,
  variant,
  isDragging,
  disabled,
  cardEntries,
  screenRef,
  dragX,
  dragY,
  onDragStart,
  onDragEnd,
  onDrop,
}: RoleChipProps) {
  const chipRef = useAnimatedRef<View>();
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      const chipBox = measure(chipRef);
      const screenBox = measure(screenRef);
      if (!chipBox || !screenBox) return;
      originX.value = chipBox.pageX - screenBox.pageX;
      originY.value = chipBox.pageY - screenBox.pageY;
      dragX.value = originX.value;
      dragY.value = originY.value;
      runOnJS(onDragStart)(termId, label);
    })
    .onUpdate((e) => {
      dragX.value = originX.value + e.translationX;
      dragY.value = originY.value + e.translationY;
    })
    .onEnd(() => {
      const screenBox = measure(screenRef);
      let hitCardId: string | null = null;
      if (screenBox) {
        const pointerX = dragX.value + screenBox.pageX;
        const pointerY = dragY.value + screenBox.pageY;
        for (const entry of cardEntries) {
          const box = measure(entry.ref);
          if (!box) continue;
          if (
            pointerX >= box.pageX &&
            pointerX <= box.pageX + box.width &&
            pointerY >= box.pageY &&
            pointerY <= box.pageY + box.height
          ) {
            hitCardId = entry.id;
            break;
          }
        }
      }
      runOnJS(onDrop)(termId, hitCardId);
      runOnJS(onDragEnd)();
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        ref={chipRef}
        style={[
          styles.chip,
          variant === 'placed-correct' ? styles.correct : null,
          variant === 'placed-incorrect' ? styles.incorrect : null,
          isDragging ? styles.hidden : null,
        ]}
      >
        <Text
          style={[
            styles.label,
            variant === 'placed-correct' ? styles.correctLabel : null,
            variant === 'placed-incorrect' ? styles.incorrectLabel : null,
          ]}
        >
          {label}
        </Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.neutral.white,
    borderWidth: 2,
    borderColor: colors.level2.bg,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.md + 2,
    shadowColor: colors.level2.fg,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  hidden: {
    opacity: 0,
  },
  correct: {
    backgroundColor: colors.success.bg,
    borderColor: colors.success.border,
  },
  incorrect: {
    backgroundColor: colors.error.bg,
    borderColor: colors.error.border,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.level2.fg,
    fontFamily: font('bodyExtraBold'),
  },
  correctLabel: {
    color: colors.success.dark,
  },
  incorrectLabel: {
    color: colors.error.text,
  },
});
