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
  // Native plugins that `cap sync` (part of `pnpm app:build`) wires into
  // ios/ and android/. Empty for now ON PURPOSE (#243): the Firebase App Check
  // plugin is installed for its JavaScript side, but its native side needs
  // GoogleService-Info.plist / google-services.json, which do not exist yet.
  // Without them iOS crashes as soon as a token is requested, and the iOS
  // build would pull in the whole Firebase SDK. When the config files are in
  // place, add '@capacitor-firebase/app-check' here (see
  // docs/app-check-setup.md). Any other native plugin must be listed here too,
  // or `cap sync` leaves it out: '@capacitor/share' from PR #280 (#249) as soon
  // as both are on main, and whatever #237 adds.
  includePlugins: [],
  experimental: {
    ios: {
      spm: {
        // The plugin's own advice for Swift Package Manager builds, to avoid a
        // package identity clash with firebase-ios-sdk. Has no effect until the
        // plugin is in includePlugins above.
        packageOptions: {
          '@capacitor-firebase/app-check': { symlink: true },
        },
      },
    },
  },
};

export default config;
