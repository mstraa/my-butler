import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { categoryColors } from '@/theme/tokens';

export default function ObjectifsScreen() {
  return (
    <Screen>
      <View style={{ height: 64, justifyContent: 'center', paddingHorizontal: 20 }}>
        <AppText variant="display" accessibilityRole="header">
          Objectifs
        </AppText>
      </View>
      <ComingSoon
        icon="target"
        color={categoryColors.health}
        title="Prochaine étape"
        text="Objectifs du jour, de la semaine et du mois : compteur, valeur, durée ou oui/non."
      />
    </Screen>
  );
}
