import { useColorScheme } from 'react-native';

import { DeliverableStatus, IdeaStage, Priority } from './lib/types';

export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  warning: string;
  priority: Record<Priority, string>;
  stage: Record<IdeaStage, string>;
  deliverable: Record<DeliverableStatus, string>;
}

const shared = {
  priority: { high: '#E5484D', medium: '#F5A524', low: '#8B8D98' },
  stage: { raw: '#8B8D98', developing: '#30A46C', ready: '#3E63DD' },
  deliverable: { not_started: '#8B8D98', in_progress: '#3E63DD', done: '#30A46C', at_risk: '#E5484D' },
};

export const light: Palette = {
  dark: false,
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF0F3',
  border: '#DFE3E8',
  text: '#11181C',
  textMuted: '#687076',
  primary: '#3E63DD',
  primaryText: '#FFFFFF',
  danger: '#E5484D',
  success: '#30A46C',
  warning: '#F5A524',
  ...shared,
};

export const dark: Palette = {
  dark: true,
  bg: '#111113',
  surface: '#1C1D21',
  surfaceAlt: '#26282D',
  border: '#33363C',
  text: '#EDEEF0',
  textMuted: '#9BA1A6',
  primary: '#7B93FF',
  primaryText: '#0B0D12',
  danger: '#FF6369',
  success: '#3DD68C',
  warning: '#FFCA16',
  ...shared,
};

/** Light/dark palette that follows the system setting. */
export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
