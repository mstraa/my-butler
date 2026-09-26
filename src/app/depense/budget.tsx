import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { showDialog } from '@/components/dialog';
import { TextField } from '@/components/form/fields';
import { Sheet } from '@/components/sheet';
import { formatCents, getMonthSummary, type MonthKey, setBudget } from '@/db/expenses';
import { parseEuros } from '@/db/tasks';
import { useDbMutation, useDbQuery } from '@/db/use-query';
import { monthLabel } from '@/lib/expense-format';
import { useExpenseView } from '@/lib/expense-view';
import { colors, fonts } from '@/theme/tokens';

/** Budget facultatif du mois affiché dans l'onglet Dépenses. */
export default function ExpenseBudgetSheet() {
  const { month } = useExpenseView();
  const { data } = useDbQuery((db) => getMonthSummary(db, month), month);
  if (!data) return null;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <BudgetSheet month={month} budget={data.budget} />
    </KeyboardAvoidingView>
  );
}

function BudgetSheet({ month, budget }: { month: MonthKey; budget: number | null }) {
  const mutate = useDbMutation();
  const [text, setText] = useState(budget != null ? formatCents(budget, { euro: false }).replace(',00', '').replace(/ /g, '') : '');
  const [error, setError] = useState(false);
  return (
    <Sheet label="Budget du mois">
      {(close) => (
        <>
          <View style={{ gap: 4, paddingHorizontal: 4 }}>
            <AppText variant="title">Budget de {monthLabel(month).toLowerCase()}</AppText>
            <AppText variant="caption">Facultatif : une barre montre ce qu&apos;il reste à dépenser.</AppText>
          </View>
          <TextField
            label="Montant (€)"
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(false);
            }}
            keyboardType="decimal-pad"
            placeholder="Ex. 500"
            autoFocus
            style={{ fontFamily: fonts.displayMedium, fontSize: 18 }}
          />
          {error && (
            <AppText variant="caption" color="#FF6B6B">
              Montant illisible.
            </AppText>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {budget != null && (
              <Pressable
                onPress={() =>
                  showDialog('Retirer le budget ?', undefined, [
                    { text: 'Garder', style: 'cancel' },
                    {
                      text: 'Retirer',
                      style: 'destructive',
                      onPress: async () => {
                        await mutate((db) => setBudget(db, month, null));
                        close();
                      },
                    },
                  ])
                }
                accessibilityRole="button"
                style={[styles.sheetBtn, { backgroundColor: '#232327' }]}>
                <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color="#D4D4D8">
                  Retirer
                </AppText>
              </Pressable>
            )}
            <Pressable
              onPress={async () => {
                const cents = parseEuros(text);
                if (!cents) return setError(true);
                await mutate((db) => setBudget(db, month, cents));
                close();
              }}
              accessibilityRole="button"
              style={[styles.sheetBtn, { backgroundColor: colors.text }]}>
              <AppText style={{ fontFamily: fonts.bodySemiBold, fontSize: 15 }} color={colors.onLight}>
                Enregistrer
              </AppText>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheetBtn: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
