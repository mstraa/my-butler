import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useItemLongPress } from '@/components/agenda/use-item-press';
import { AppText } from '@/components/app-text';
import { Icon } from '@/components/icon';
import type { AgendaDay, AgendaItem, DayStats } from '@/db/agenda';
import { monthAbbr, shortDayLabel, weekdayAbbr } from '@/lib/dates';
import { colors, fonts, withAlpha } from '@/theme/tokens';

type Props = {
  day: AgendaDay;
  isToday: boolean;
  open: boolean;
  stats?: DayStats;
  onToggle: () => void;
  /** Appui long : ajouter à ce jour. */
  onLongPress?: () => void;
  onItemPress?: (item: AgendaItem) => void;
  /** Animer l'ouverture (seulement après un toucher, pas à l'affichage). */
  animate?: boolean;
  /** Style animé du chiffre d'un jour fermé (ex. éclairci quand il passe sous le repère de la roue). */
  numberStyle?: React.ComponentProps<typeof Animated.Text>['style'];
};

/** Une carte par jour : gros chiffre fin ; ouverte, elle liste tout le jour (simple fondu à l'ouverture). */
export function DayCard({ day, isToday, open, stats, onToggle, onLongPress, onItemPress, animate, numberStyle }: Props) {
  const n = Number(day.day.slice(8, 10));
  const label = isToday ? `${shortDayLabel(day.day)} · aujourd'hui` : shortDayLabel(day.day);
  const month = monthAbbr(day.day);
  const weekday = weekdayAbbr(day.day);

  if (!open) {
    const summary = day.items.slice(0, 2);
    return (
      <View>
        <Pressable
          onPress={onToggle}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          accessibilityLabel={`Déplier ${label}`}
          style={({ pressed }) => [styles.closed, pressed && { opacity: 0.85 }]}>
          <View style={styles.closedLeft}>
            <AppText variant="caption" color={colors.textMuted} style={styles.weekday}>
              {weekday}
            </AppText>
            <Animated.Text style={[styles.closedNumber, numberStyle]}>{n}</Animated.Text>
            <AppText variant="caption" color={colors.textMuted} style={styles.month}>
              {month}
            </AppText>
          </View>
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
      </View>
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
    <Animated.View entering={animate ? FadeIn.duration(160) : undefined} style={styles.open}>
      <Pressable
        onPress={onToggle}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: true }}
        accessibilityLabel={`Replier ${label}`}
        style={styles.openLeft}>
        <AppText variant="caption" color={colors.textSecondary} style={styles.weekday}>
          {weekday}
        </AppText>
        <AppText variant="hero">{n}</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={[styles.month, { marginBottom: 4 }]}>
          {month}
        </AppText>
        {isToday && (
          <AppText variant="caption" color={colors.textSecondary} style={{ fontSize: 13 }}>
            aujourd&apos;hui
          </AppText>
        )}
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
          <View key={it.key}>
            <ItemRow item={it} onPress={onItemPress} />
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export function ItemRow({ item, onPress }: { item: AgendaItem; onPress?: (i: AgendaItem) => void }) {
  const onLongPress = useItemLongPress();
  const muted = item.cancelled || item.done;
  const iconColor = muted ? colors.textFaint : item.color;
  const a11y =
    item.kind === 'task'
      ? `${item.title}, tâche ${item.done ? 'faite' : 'à faire'}${item.time ? `, ${item.time}` : ''}`
      : `${item.title}${item.time ? `, ${item.time}` : ''}${item.cancelled ? ', annulé' : ''}`;
  return (
    <Pressable
      onPress={() => onPress?.(item)}
      onLongPress={() => onLongPress(item)}
      disabled={!onPress}
      accessibilityRole="button"
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
  closedLeft: { width: 104 },
  month: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 0.3, marginTop: -2 },
  weekday: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 0.3, marginBottom: -2 },
  closedNumber: {
    fontFamily: fonts.displayThin,
    fontSize: 54,
    lineHeight: 56,
    letterSpacing: -3,
    color: colors.textMuted,
  },
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

