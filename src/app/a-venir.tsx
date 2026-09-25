import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ComingSoon } from '@/components/coming-soon';
import { BackHeader, Screen } from '@/components/screen';
import { categoryColors } from '@/theme/tokens';

/** Écran temporaire pour les formulaires pas encore construits. */
export default function ComingSoonScreen() {
  const { titre } = useLocalSearchParams<{ titre?: string }>();
  return (
    <Screen>
      <BackHeader title={titre ?? 'Bientôt'} />
      <View style={{ paddingTop: 8 }}>
        <ComingSoon
          icon="plus"
          color={categoryColors.work}
          title="Formulaire à venir"
          text="Ce formulaire fait partie des prochaines étapes. La saisie rapide (fruits, e-liquide, lever) fonctionne déjà."
        />
      </View>
    </Screen>
  );
}
