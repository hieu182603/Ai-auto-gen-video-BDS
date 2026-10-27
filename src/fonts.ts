import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

// Load Vietnamese Noto Serif for titles & luxury typography
// We load both normal (400) and bold (700) weights so all components render crisp Vietnamese typography
export const loadMapFonts = () => {
  return Promise.all([
    loadFont({
      family: 'Map Serif',
      url: staticFile('fonts/NotoSerif.ttf'),
      weight: '400',
    }),
    loadFont({
      family: 'Map Serif',
      url: staticFile('fonts/NotoSerif.ttf'),
      weight: '700',
    }),
  ]);
};

// Synchronously register delayRender on module import to pause Remotion before any frame/still renders
void loadMapFonts();
