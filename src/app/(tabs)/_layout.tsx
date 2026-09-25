import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';

import { FloatingTabBar, TabIconButton } from '@/components/tab-bar';

/**
 * Barre du bas en pilule (Agenda, Objectifs, Dépenses, Suivi, Envies) + bouton « + ».
 * La TabList cachée déclare les routes ; les boutons visibles sont dans FloatingTabBar.
 */
export default function TabsLayout() {
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
        <TabTrigger name="depenses" asChild>
          <TabIconButton icon="wallet" label="Dépenses" />
        </TabTrigger>
        <TabTrigger name="suivi" asChild>
          <TabIconButton icon="pulse" label="Suivi" />
        </TabTrigger>
        <TabTrigger name="envies" asChild>
          <TabIconButton icon="heart" label="Envies" />
        </TabTrigger>
      </FloatingTabBar>
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="agenda" href="/" />
        <TabTrigger name="objectifs" href="/objectifs" />
        <TabTrigger name="depenses" href="/depenses" />
        <TabTrigger name="suivi" href="/suivi" />
        <TabTrigger name="envies" href="/envies" />
      </TabList>
    </Tabs>
  );
}
