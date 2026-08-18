import { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme';

interface GradientScreenProps {
  children: ReactNode;
}

export function GradientScreen({ children }: GradientScreenProps) {
  return (
    <LinearGradient colors={colors.screenGradient} style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
