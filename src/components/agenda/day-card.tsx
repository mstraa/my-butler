import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight, LinearTransition } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import type { AgendaDay, AgendaItem, DayStats } from '@/db/agenda';
import { shortDayLabel } from '@/lib/dates';
import { colors, withAlpha } from '@/theme/tokens';

type Props = {
  day: AgendaDay;
  isToday: boolean;
  open: boolean;
  stats?: DayStats;
  onToggle: () => void;
  onItemPress?: (item: AgendaItem) => void;
};

const layout = LinearTransition.springify().damping(22).stiffness(220);

/** Une carte par jour : gros chiffre fin ; ouverte, elle liste tout le jour. */
export function DayCard({ day, isToday, open, stats, onToggle, onItemPress }: Props) {
  const n = Number(day.day.slice(8, 10));
  const label = isToday ? `${shortDayLabel(day.day)} · aujourd'hui` : shortDayLabel(day.day);

  if (!open) {
    const summary = day.items.slice(0, 2);
    return (
      <Animated.View layout={layout}>
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          accessibilityLabel={`Déplier ${label}`}
          style={({ pressed }) => [styles.closed, pressed && { opacity: 0.85 }]}>
          <AppText variant="hero" style={styles.closedNumber}>
            {n}
          </AppText>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            {summary.length === 0 ? (
              <SummaryLine label="Rien de prévu" dot={colors.pill} color={colors.textMuted} />
            ) : (
              summary.map((it) => (
                <SummaryLine key={it.key} label={it.title} dot={withAlpha(it.color, 0.33)} color={colors.textSecondary} />
              ))
            )}
            {day.items.length > 2 && (
              <AppText variant="caption" color={colors.textMuted}>
                +{day.items.length - 2} autre{day.items.length > 3 ? 's' : ''}
              </AppText>
            )}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  const statLines = stats
    ? [
        stats.wokeAt ? `Levé ${stats.wokeAt}` : null,
        stats.goalsTotal ? `Objectifs ${stats.goalsMet}/${stats.goalsTotal}` : null,
        stats.eliquidMl !== null ? `E-liquide ${formatMl(stats.eliquidMl)}` : null,
      ].filter(Boolean)
    : [`${day.items.length} élément${day.items.length > 1 ? 's' : ''}`];

  return (
    <Animated.View layout={layout} entering={FadeIn.duration(250)} style={styles.open}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel={`Replier ${label}`}
        style={styles.openLeft}>
        <AppText variant="hero">{n}</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
          {label}
        </AppText>
        <View style={{ marginTop: 10, gap: 2 }}>
          {statLines.map((s) => (
            <AppText key={s} variant="caption" style={{ fontSize: 11 }}>
              {s}
            </AppText>
          ))}
        </View>
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        {day.items.length === 0 && (
          <View style={[styles.row, styles.rowEmpty]}>
            <AppText variant="body" color={colors.textMuted}>
              Rien de prévu
            </AppText>
          </View>
        )}
        {day.items.map((it, i) => (
          <Animated.View key={it.key} entering={FadeInRight.delay(80 + i * 60).duration(350)}>
            <ItemRow item={it} onPress={onItemPress} />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

export function ItemRow({ item, onPress }: { item: AgendaItem; onPress?: (i: AgendaItem) => void }) {
  const muted = item.cancelled || item.done;
  const iconColor = muted ? colors.textFaint : item.color;
  const a11y =
    item.kind === 'task'
      ? `${item.title}, tâche ${item.done ? 'faite' : 'à faire'}${item.time ? `, ${item.time}` : ''}`
      : `${item.title}${item.time ? `, ${item.time}` : ''}${item.cancelled ? ', annulé' : ''}`;
  return (
    <Pressable
      onPress={() => onPress?.(item)}
      disabled={!onPress || item.kind === 'birthday'}
      accessibilityRole={item.kind === 'task' ? 'checkbox' : item.kind === 'event' ? 'button' : 'text'}
      accessibilityState={item.kind === 'task' ? { checked: item.done } : undefined}
      accessibilityLabel={a11y}
      style={[styles.row, item.cancelled && styles.rowCancelled]}>
      <View style={[styles.iconBox, { backgroundColor: muted ? '#1B1B1F' : withAlpha(item.color, 0.13) }]}>
        <Icon name={item.done ? 'check' : item.icon} size={16} color={iconColor} strokeWidth={item.done ? 2.4 : 1.8} />
      </View>
      <AppText
        variant="bodyMedium"
        numberOfLines={1}
        style={[{ flex: 1 }, muted && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
        {item.title}
      </AppText>
      {!!item.time && <AppText variant="number">{item.time}</AppText>}
    </Pressable>
  );
}

function SummaryLine({ label, dot, color }: { label: string; dot: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: dot }} />
      <AppText variant="body" color={color} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

const formatMl = (ml: number) => `${String(ml).replace('.', ',')} ml`;

const styles = StyleSheet.create({
  closed: {
    height: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 24,
  },
  closedNumber: { width: 104, fontSize: 64, lineHeight: 70, color: colors.textMuted },
  open: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
  },
  openLeft: { width: 104 },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 14,
    backgroundColor: colors.row,
  },
  rowCancelled: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderDashed },
  rowEmpty: { backgroundColor: 'transparent', paddingLeft: 12 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});

