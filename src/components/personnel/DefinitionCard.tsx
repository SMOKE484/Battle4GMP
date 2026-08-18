import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedRef, SharedValue, useAnimatedRef } from 'react-native-reanimated';

import { colors, font, fontSize, radius, spacing } from '../../theme';
import { CardRefEntry, RoleChip } from './RoleChip';

interface DefinitionCardProps {
  id: string;
  definitionText: string;
  placedTermId: string | null;
  placedLabel: string | null;
  isCorrect: boolean;
  isDraggingPlacedChip: boolean;
  disabled?: boolean;
  onRegisterRef: (id: string, ref: AnimatedRef<View>) => void;
  cardEntries: CardRefEntry[];
  screenRef: AnimatedRef<View>;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  onDragStart: (termId: string, label: string) => void;
  onDragEnd: () => void;
  onDrop: (termId: string, cardId: string | null) => void;
}

export function DefinitionCard({
  id,
  definitionText,
  placedTermId,
  placedLabel,
  isCorrect,
  isDraggingPlacedChip,
  disabled,
  onRegisterRef,
  cardEntries,
  screenRef,
  dragX,
  dragY,
  onDragStart,
  onDragEnd,
  onDrop,
}: DefinitionCardProps) {
  const cardRef = useAnimatedRef<View>();

  // Registered once on mount — the hit-test always re-measures via `measure()` at
  // drop time (see RoleChip's onEnd), so a stale ref reference here is harmless;
  // only the ref identity itself needs to reach the parent.
  useEffect(() => {
    onRegisterRef(id, cardRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isFilled = placedTermId !== null;

  return (
    <View ref={cardRef} style={styles.card}>
      <Text style={styles.definitionText}>{definitionText}</Text>
      {isFilled && placedTermId && placedLabel ? (
        <RoleChip
          termId={placedTermId}
          label={placedLabel}
          variant={isCorrect ? 'placed-correct' : 'placed-incorrect'}
          isDragging={isDraggingPlacedChip}
          disabled={disabled}
          cardEntries={cardEntries}
          screenRef={screenRef}
          dragX={dragX}
          dragY={dragY}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ) : (
        <View style={styles.emptySlot}>
          <Text style={styles.emptySlotText}>Drop role here</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    shadowColor: colors.purple.primary,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  definitionText: {
    fontSize: fontSize.md,
    color: colors.text.body,
    marginBottom: spacing.sm,
  },
  emptySlot: {
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.neutral.inputBorder,
    backgroundColor: colors.neutral.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotText: {
    fontSize: fontSize.base,
    fontWeight: '800',
    color: colors.purple.muted,
    fontFamily: font('bodyExtraBold'),
  },
});
