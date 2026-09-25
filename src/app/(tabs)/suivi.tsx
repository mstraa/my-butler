import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { categoryColors } from '@/theme/tokens';

export default function SuiviScreen() {
  return (
    <Screen>
      <View style={{ height: 64, justifyContent: 'center', paddingHorizontal: 20 }}>
        <AppText variant="display" accessibilityRole="header">
          Suivi
        </AppText>
      </View>
      <ComingSoon
        icon="pulse"
        color={categoryColors.sport}
        title="Prochaine étape"
        text="Lever et coucher, e-liquide par pas de 0,5 ml, graphiques sur 7 jours."
      />
    </Screen>
  );
}
