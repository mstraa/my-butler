import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayView } from '@/components/agenda/day-view';
import { ListView } from '@/components/agenda/list-view';
import { MonthView } from '@/components/agenda/month-view';
import { type AgendaView, SWITCHER_H, ViewSwitcher } from '@/components/agenda/view-switcher';
import { WeekView } from '@/components/agenda/week-view';
import { Screen } from '@/components/screen';
import { BottomExtraContext, tabBarTop } from '@/components/tab-bar';
import { shiftDay, shiftMonth, todayKey } from '@/lib/dates';
import { setSelectedDay } from '@/lib/selected-day';

/**
 * Onglet Agenda : quatre vues (Liste, Jour, Semaine, Mois) qui partagent un jour « en focus ».
 * Choisir un jour dans Semaine ou Mois puis passer en Jour garde ce jour.
 */
export default function AgendaScreen() {
  const today = todayKey();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<AgendaView>('liste');
  const [focus, setFocus] = useState(today);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);

  const shift = (dir: -1 | 1) => {
    Haptics.selectionAsync();
    setDirection(dir);
    setFocus((f) =>
      view === 'jour' ? shiftDay(f, dir) : view === 'semaine' ? shiftDay(f, 7 * dir) : shiftMonth(f, dir),
    );
  };
  const goToday = () => {
    setDirection(focus < today ? 1 : -1);
    setFocus(today);
  };
  const openDay = (day: string) => {
    setDirection(0);
    setFocus(day);
    setView('jour');
  };
  const shiftWeek = (dir: -1 | 1) => {
    Haptics.selectionAsync();
    setDirection(dir);
    setFocus((f) => shiftDay(f, 7 * dir));
  };
  const pickInDay = (day: string) => {
    if (day === focus) return;
    setDirection(day > focus ? 1 : -1);
    setFocus(day);
  };
  // Le bouton + crée au jour choisi en vue Jour ou Mois.
  useEffect(() => {
    setSelectedDay(view === 'jour' || view === 'mois' ? focus : null);
  }, [view, focus]);

  const changeView = (v: AgendaView) => {
    setDirection(0);
    setView(v);
  };

  return (
    <BottomExtraContext value={SWITCHER_H + 10}>
      <Screen>
        {view === 'liste' && <ListView />}
        {view === 'jour' && (
          <DayView
            focus={focus}
            direction={direction}
            onShift={shift}
            onShiftWeek={shiftWeek}
            onPickDay={pickInDay}
            onToday={goToday}
          />
        )}
        {view === 'semaine' && <WeekView focus={focus} onShift={shift} onPickDay={openDay} onToday={goToday} />}
        {view === 'mois' && (
          <MonthView
            focus={focus}
            onShift={shift}
            onSelect={(d) => {
              setDirection(0);
              setFocus(d);
            }}
            onOpenDay={openDay}
            onToday={goToday}
          />
        )}

        {/* Sélecteur de vue, en bas, juste au-dessus de la barre d'onglets. */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: tabBarTop(insets.bottom) + 10,
          }}>
          <ViewSwitcher value={view} onChange={changeView} />
        </View>
      </Screen>
    </BottomExtraContext>
  );
}
