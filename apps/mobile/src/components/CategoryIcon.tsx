import { MaterialCommunityIcons } from '@expo/vector-icons';

const MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car-side',
  motorcycle: 'motorbike',
  scooter: 'moped',
  apartment: 'office-building',
};

export function CategoryIcon({ icon, size = 28, color }: { icon: string; size?: number; color: string }) {
  return <MaterialCommunityIcons name={MAP[icon] ?? 'tag-outline'} size={size} color={color} />;
}
