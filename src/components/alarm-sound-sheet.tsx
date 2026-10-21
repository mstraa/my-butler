import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { alarmSounds, previewAlarmSound, setAlarmSound, stopAlarmSoundPreview } from '@/lib/notifications';
import { colors } from '@/theme/tokens';

/**
 * Choix de la sonnerie des alarmes, parmi les sonneries d'alarme du téléphone : toucher une ligne
 * la choisit et la fait écouter quelques secondes. `value` : URI choisie, null = celle du téléphone.
 */
export function AlarmSoundSheet({ value, onClose }: { value: string | null; onClose: () => void }) {
  const [picked, setPicked] = useState(value);
  const options = useMemo(() => [{ uri: null as string | null, title: 'Celle du réveil du téléphone' }, ...alarmSounds()], []);
  useEffect(() => stopAlarmSoundPreview, []);

  return (
    <Sheet inline onClosed={onClose} label="Sonnerie des alarmes" style={{ maxHeight: '70%', gap: 8, paddingHorizontal: 12 }}>
      {() => (
        <>
          <AppText variant="title" style={{ paddingHorizontal: 8 }}>
            Sonnerie des alarmes
          </AppText>
          <AppText variant="caption" style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
            Touche une sonnerie pour l&apos;écouter, au volume des alarmes.
          </AppText>
          <FlatList
            data={options}
            keyExtractor={(o) => o.uri ?? 'defaut'}
            renderItem={({ item }) => {
              const on = item.uri === picked;
              return (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPicked(item.uri);
                    setAlarmSound(item.uri);
                    previewAlarmSound(item.uri);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => [styles.option, (on || pressed) && { backgroundColor: colors.row }]}>
                  <AppText variant="bodyMedium" style={{ flex: 1, fontSize: 15 }}>
                    {item.title}
                  </AppText>
                  {on && <Icon name="check" size={18} strokeWidth={2.2} />}
                </Pressable>
              );
            }}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 14 },
});
