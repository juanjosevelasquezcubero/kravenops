import { StyleSheet, Text, View } from 'react-native';

import { ZONE_STATUS_COLOR, ZONE_STATUS_LABEL } from '@/services/geo';
import type { ZoneStatus } from '@/types/analysis';

export function ZoneBadge({ status, compact = false }: { status: ZoneStatus; compact?: boolean }) {
  const color = ZONE_STATUS_COLOR[status];
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A`, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]} numberOfLines={compact ? 1 : 2}>
        {compact ? status.toUpperCase() : ZONE_STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontWeight: '700', fontSize: 13 },
});