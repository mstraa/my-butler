import * as Haptics from 'expo-haptics';
import { useState } from 'react';

import { DayView } from '@/components/agenda/day-view';
import { ListView } from '@/components/agenda/list-view';
import { MonthView } from '@/components/agenda/month-view';
import { type AgendaView, ViewSwitcher } from '@/components/agenda/view-switcher';
import { WeekView } from '@/components/agenda/week-view';
import { Screen } from '@/components/screen';
import { shiftDay, shiftMonth, todayKey } from '@/lib/dates';

/**
 * Onglet Agenda : quatre vues (Liste, Jour, Semaine, Mois) qui partagent un jour « en focus ».
 * Choisir un jour dans Semaine ou Mois puis passer en Jour garde ce jour.
 */
export default function AgendaScreen() {
  const today = todayKey();
  const [view, setView] = useState<AgendaView>('liste');
  const [focus, setFocus] = useState(today);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);

  const shift = (dir: -1 | 1) => {
    Haptics.selectionAsync();
    setDirection(dir);
    setFocus((f) => (view === 'jour' ? shiftDay(f, dir) : view === 'semaine' ? shiftDay(f, 7 * dir) : shiftMonth(f, dir)));
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
  const pickInDay = (day: string) => {
    if (day === focus) return;
    setDirection(day > focus ? 1 : -1);
    setFocus(day);
  };
  const changeView = (v: AgendaView) => {
    setDirection(0);
    setView(v);
  };

  const switcher = <ViewSwitcher value={view} onChange={changeView} />;

  return (
    <Screen>
      {view === 'liste' && <ListView switcher={switcher} />}
      {view === 'jour' && (
        <DayView focus={focus} direction={direction} onShift={shift} onPickDay={pickInDay} onToday={goToday} switcher={switcher} />
      )}
      {view === 'semaine' && (
        <WeekView focus={focus} direction={direction} onShift={shift} onPickDay={openDay} onToday={goToday} switcher={switcher} />
      )}
      {view === 'mois' && (
        <MonthView
          focus={focus}
          direction={direction}
          onShift={shift}
          onSelect={(d) => {
            setDirection(0);
            setFocus(d);
          }}
          onOpenDay={openDay}
          onToday={goToday}
          switcher={switcher}
        />
      )}
    </Screen>
  );
}
