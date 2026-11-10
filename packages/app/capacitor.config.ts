import type { CapacitorConfig } from '@capacitor/cli';

// The installed iOS and Android app (#236). The web build in dist/ is bundled
// inside the app, not loaded from convolab.us, so it runs offline-first and
// passes Apple's "not just a website" check (guideline 4.2). The bundle talks
// to the API at VITE_API_URL; build it with `pnpm app:build`, never plain
// `pnpm build`, or it will try to call the app's own local origin.
//
// appId is permanent once the first build is uploaded to either store.
// edu.harvard.ethics.convolab mirrors Harvard's host naming, as suggested by
// HUIT (David LaPorte, 10 Nov 2026).
const config: CapacitorConfig = {
  appId: 'edu.harvard.ethics.convolab',
  appName: 'ConvoLab',
  webDir: 'dist',
};

export default config;
