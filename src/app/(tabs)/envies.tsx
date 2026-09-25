import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ComingSoon } from '@/components/coming-soon';
import { Screen } from '@/components/screen';
import { categoryColors } from '@/theme/tokens';

export default function EnviesScreen() {
  return (
    <Screen>
      <View style={{ height: 64, justifyContent: 'center', paddingHorizontal: 20 }}>
        <AppText variant="display" accessibilityRole="header">
          Envies
        </AppText>
      </View>
      <ComingSoon
        icon="heart"
        color={categoryColors.family}
        title="Prochaine étape"
        text="Envies d'achat avec lien, photo et prix, créées aussi depuis le bouton Partager d'Android."
      />
    </Screen>
  );
}
