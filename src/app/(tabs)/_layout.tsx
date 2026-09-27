import { usePathname } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useEffect } from 'react';

import { FloatingTabBar, TabIconButton } from '@/components/tab-bar';
import { lockExpenses } from '@/lib/expense-lock';

const TAB_PATHS = new Set(['/', '/objectifs', '/suivi', '/envies']);

/**
 * Barre du bas en pilule (Agenda, Objectifs, Suivi, Envies, Dépenses) + bouton « + ».
 * La TabList cachée déclare les routes ; les boutons visibles sont dans FloatingTabBar.
 */
export default function TabsLayout() {
  // Passer à un autre onglet referme le verrou des Dépenses.
  const pathname = usePathname();
  useEffect(() => {
    if (TAB_PATHS.has(pathname)) lockExpenses();
  }, [pathname]);

  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot />
      <FloatingTabBar>
        <TabTrigger name="agenda" asChild>
          <TabIconButton icon="calendar" label="Agenda" />
        </TabTrigger>
        <TabTrigger name="objectifs" asChild>
          <TabIconButton icon="target" label="Objectifs" />
        </TabTrigger>
        <TabTrigger name="suivi" asChild>
          <TabIconButton icon="pulse" label="Suivi" />
        </TabTrigger>
        <TabTrigger name="envies" asChild>
          <TabIconButton icon="heart" label="Envies" />
        </TabTrigger>
        <TabTrigger name="depenses" asChild>
          <TabIconButton icon="wallet" label="Dépenses" />
        </TabTrigger>
      </FloatingTabBar>
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="agenda" href="/" />
        <TabTrigger name="objectifs" href="/objectifs" />
        <TabTrigger name="suivi" href="/suivi" />
        <TabTrigger name="envies" href="/envies" />
        <TabTrigger name="depenses" href="/depenses" />
      </TabList>
    </Tabs>
  );
}
