import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { formatCents } from '@/db/expenses';
import { FREQUENCIES, listRecurring, monthlyCents, type RecurringExpense } from '@/db/recurring-expenses';
import { useDbQuery } from '@/db/use-query';
import { dateFieldLabel } from '@/lib/dates';
import { colors, fonts, withAlpha } from '@/theme/tokens';

/** Dépenses récurrentes (abonnements, prêt…) : total par mois, prochaine échéance ; toucher pour modifier. */
export default function RecurringExpensesSheet() {
  const { data } = useDbQuery(listRecurring);
  const list = data ?? [];
  const active = list.filter((r) => r.nextOn);
  const perMonth = Math.round(active.reduce((s, r) => s + monthlyCents(r.amountCents, r.frequency), 0));
  return (
    <Sheet label="Dépenses récurrentes" draggable={false} style={{ maxHeight: '80%', gap: 12 }}>
      {(close) => (
        <>
          <View style={{ gap: 4, paddingHorizontal: 4 }}>
            <AppText variant="title">Dépenses récurrentes</AppText>
            <AppText variant="caption">
              {active.length
                ? `${formatCents(perMonth)} par mois · ajoutées d'elles-mêmes à chaque échéance`
                : "Abonnements, prêt, loyer… : ajoutés d'eux-mêmes à chaque échéance."}
            </AppText>
          </View>
          {list.length > 0 && (
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
              {list.map((r, i) => (
                <Item
                  key={r.id}
                  r={r}
                  last={i === list.length - 1}
                  onPress={() => close(() => router.replace({ pathname: '/depense/nouvelle', params: { recurring: String(r.id) } }))}
                />
              ))}
            </ScrollView>
          )}
          <Pressable
            onPress={() => close(() => router.replace({ pathname: '/depense/nouvelle', params: { repeat: 'month' } }))}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
            <Icon name="plus" size={18} color={colors.onLight} strokeWidth={2.4} />
            <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
              Nouvelle dépense récurrente
            </AppText>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}

function Item({ r, last, onPress }: { r: RecurringExpense; last: boolean; onPress: () => void }) {
  const short = FREQUENCIES.find((f) => f.value === r.frequency)?.short ?? '';
  const when = r.nextOn
    ? `Prochaine le ${dateFieldLabel(r.nextOn)}${r.endsOn ? ` · jusqu'au ${dateFieldLabel(r.endsOn)}` : ''}`
    : 'Terminée';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${r.label}, ${formatCents(r.amountCents)} ${short}, ${when}`}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && { opacity: 0.6 }, !r.nextOn && { opacity: 0.5 }]}>
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(r.color, 0.25), borderColor: r.color }]}>
        <Icon name={r.icon} size={18} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {r.label}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {when}
        </AppText>
      </View>
      <AppText style={{ fontFamily: fonts.displayMedium, fontSize: 16 }}>
        {formatCents(r.amountCents)}
        <AppText variant="caption"> {short}</AppText>
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
});
