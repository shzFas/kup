import { useColorScheme } from 'react-native';

const light = {
  accent: '#1F6FEB',
  accentText: '#FFFFFF',
  accentSoft: '#E6EFFD',
  background: '#F2F3F5',
  card: '#FFFFFF',
  text: '#111317',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E3E5E8',
  fill: '#ECEEF1',
  skeleton: '#E4E6EA',
  danger: '#E5484D',
  success: '#2F9E44',
  overlay: 'rgba(0,0,0,0.4)',
};

export type Colors = typeof light;

const dark: Colors = {
  accent: '#4C8DFF',
  accentText: '#FFFFFF',
  accentSoft: '#16294A',
  background: '#000000',
  card: '#1C1C1E',
  text: '#F4F5F7',
  textSecondary: '#A1A6AE',
  textTertiary: '#6B7079',
  border: '#2C2D31',
  fill: '#2A2B2F',
  skeleton: '#2A2B2F',
  danger: '#FF6369',
  success: '#4CC38A',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

export const radius = { s: 8, m: 12, l: 16 };
