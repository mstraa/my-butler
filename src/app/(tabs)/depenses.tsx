import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { categoryColors } from '@/theme/tokens';

export default function DepensesScreen() {
  return (
    <Screen>
      <View style={{ height: 64, justifyContent: 'center', paddingHorizontal: 20 }}>
        <AppText variant="display" accessibilityRole="header">
          Dépenses
        </AppText>
      </View>
      <ComingSoon
        icon="wallet"
        color={categoryColors.groceries}
        title="Prochaine étape"
        text="Total du mois comparé au mois précédent, répartition par catégorie, pavé de saisie et « glisser pour valider »."
      />
    </Screen>
  );
}
