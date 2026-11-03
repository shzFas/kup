import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/theme';

/** ✓ sent, ✓✓ read by the peer (peer_read_at ≥ message time). */
export function ReadTicks({ at, peerReadAt, size = 15, light }: { at: string; peerReadAt: string | null; size?: number; light?: boolean }) {
  const c = useColors();
  const read = !!peerReadAt && new Date(peerReadAt).getTime() >= new Date(at).getTime();
  const color = light ? (read ? '#fff' : 'rgba(255,255,255,0.7)') : read ? c.accent : c.textTertiary;
  return <Ionicons name={read ? 'checkmark-done' : 'checkmark'} size={size} color={color} />;
}
