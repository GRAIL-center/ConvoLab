# App Check setup for the phone app (#243)

On the website, guests tick a reCAPTCHA box before a practice conversation
starts. reCAPTCHA does not work inside the installed app. So the app uses
**Firebase App Check** instead. The phone itself vouches that the request comes
from our real app: **App Attest** on iPhone, **Play Integrity** on Android.

**Status (24 Nov 2026).** Done for iPhone: the App Check API is on for
`convolab-490517`; the iOS app is registered in Firebase as "ConvoLab iOS"
(`1:633459139926:ios:dd786326684746538a22f7`, bundle id
`edu.harvard.ethics.convolab`, Apple Team ID `UHX83HR959`); App Attest is
registered for it; and `GoogleService-Info.plist` is committed at
`packages/app/ios/App/App/` (not yet added to the App target in Xcode). Nothing
is enforced in Firebase. Still to do: everything for Android (needs the app in
Play Console first), and the native wiring in Part 2.

How it works:

1. The app asks the App Check plugin for a token.
2. The app sends the token in the `X-Firebase-AppCheck` header of
   `practice.start`.
3. The API checks the token with the Firebase Admin SDK
   (`packages/api/src/lib/appCheck.ts`).

Rules on the server:

- A request with `X-ConvoLab-Client: native` must carry a valid App Check
  token. A reCAPTCHA token does not count for it. No token, or a bad token,
  means "Captcha verification failed".
- A request without that header (the website) uses reCAPTCHA, as before.
- Signed-in accounts skip both checks, as before.
- `/pilot`, `/study` and `study.enter` do not use either check.
- Refusals are logged at warn level as `app_check_rejected` (never the token).

Project: `convolab-490517` (project number `633459139926`).
App id on both platforms: `edu.harvard.ethics.convolab`.

## Part 1: console steps (PI)

Do these in order. None of them change the website.

### 1. Enable the App Check API

Google Cloud console > APIs & Services > Library > "Firebase App Check API" >
Enable. Or:

```bash
gcloud services enable firebaseappcheck.googleapis.com --project=convolab-490517
```

The phones talk to this API to get their tokens.

### 2. Register the iPhone app in Firebase

Firebase console > Project settings > General > Add app > iOS.

- Bundle ID: `edu.harvard.ethics.convolab`
- App nickname: `ConvoLab iOS`
- App Store ID: leave empty for now.
- Then open the new app's settings and fill in the **Team ID**. It is the
  10-character id of Harvard's Apple developer team. Find it at
  developer.apple.com > Account > Membership details.
- Download **`GoogleService-Info.plist`**.

### 3. Register the Android app in Firebase

Firebase console > Project settings > General > Add app > Android.

- Package name: `edu.harvard.ethics.convolab`
- App nickname: `ConvoLab Android`
- Add the **SHA-256** fingerprint of the **app signing key**. Find it in Play
  Console > the app > Test and release > App integrity > App signing > "App
  signing key certificate". (Not the upload key. Google re-signs the app with
  the app signing key.)
- Download **`google-services.json`**.

### 4. Register the App Check providers

Firebase console > App Check > Apps.

- iOS app: choose **App Attest**. Save.
- Android app: choose **Play Integrity**. Paste the same SHA-256 if asked. Save.

### 5. Link Play Console to the Cloud project

Play Integrity only works when Play Console knows our Cloud project.

Play Console > the app > Test and release > App integrity > Play Integrity API >
**Link a Cloud project** > choose `convolab-490517`.

### 6. Hand over the two config files

Give both files to the developer who wires up the app (Part 2). They are not
secrets: the key inside only identifies the project. You may restrict that key
to the iOS and Android apps in Cloud console > APIs & Services > Credentials.

| File | Goes to |
| --- | --- |
| `GoogleService-Info.plist` | `packages/app/ios/App/App/` and must be added to the App target in Xcode |
| `google-services.json` | `packages/app/android/app/` |

### 7. Debug tokens for the simulator and emulator

App Attest does not run in the iOS simulator. Play Integrity fails on an
emulator or a sideloaded build. For those, the app uses the **debug provider**.

1. Build the app with `VITE_APP_CHECK_DEBUG=1` (see Part 2).
2. Run it and start a guest conversation once.
3. Copy the debug token from the log:
   - iOS: Xcode console, line "Firebase App Check debug token: ...".
   - Android: Logcat, line "Enter this debug secret into the allow list ...".
4. Firebase console > App Check > Apps > the app > three-dot menu >
   **Manage debug tokens** > Add. Paste it. Give it a name, e.g. "Lab iPhone
   simulator".

A debug token is as good as a real phone. Never put one in a store build. Delete
tokens you no longer use.

### 8. Enforcement

Leave **Enforce** off for every Firebase product in the App Check console. That
switch protects Firebase services (Firestore, Storage, and so on). Our check
happens in our own API instead, and it is always on for app requests. The API
reaches Firestore with its service account, which App Check does not affect.

The App Check console shows request metrics only for Firebase products, so it
will not show our API traffic. Look for `app_check_rejected` in the API logs
instead.

## Part 2: wiring the native projects (developer)

This PR adds the plugin `@capacitor-firebase/app-check` and the JavaScript
side, but keeps the native side switched off. `capacitor.config.ts` has
`includePlugins: []`, so `cap sync` (and `pnpm app:build`) leaves `ios/` and
`android/` untouched.

Why: without `GoogleService-Info.plist`, the iOS app crashes the moment it asks
for a token. (The plugin skips `FirebaseApp.configure()` when the file is
missing, and Firebase then raises an exception.) Android logs an error and
leaves the plugin out, without crashing. The iOS build would also pull in the
whole Firebase SDK.

Do all of these in one PR, once the config files exist.

1. Put the two files where the table in step 6 says. In Xcode, drag the plist
   into the `App` group and tick the `App` target.
2. In `packages/app/capacitor.config.ts`, add the plugin:
   `includePlugins: ['@capacitor-firebase/app-check']`. Keep any other plugins
   that are listed. (The `experimental.ios.spm.packageOptions` entry is
   already there. The plugin asks for it to avoid a Swift Package Manager name
   clash.)
3. Run `pnpm app:build`. It runs `cap sync`, which adds the plugin to
   `ios/App/CapApp-SPM/Package.swift` and `android/capacitor.settings.gradle`.
   Commit those changes.
4. **iOS, App Attest capability.** Xcode > App target > Signing &
   Capabilities > + Capability > **App Attest**. This creates
   `App.entitlements` with `com.apple.developer.devicecheck.appattest-environment`.
   Set it to `production` for store and TestFlight builds. Also set the
   development team on the target.
5. **iOS, configure Firebase in `AppDelegate.swift`.** Firebase wants the
   provider chosen *before* `FirebaseApp.configure()`. The plugin configures
   Firebase as soon as it loads, which is too early to pick App Attest. So do
   it in the AppDelegate, which runs first:

   ```swift
   import FirebaseCore
   import FirebaseAppCheck

   class AppCheckFactory: NSObject, AppCheckProviderFactory {
     func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
       #if DEBUG
       return AppCheckDebugProvider(app: app)
       #else
       return AppAttestProvider(app: app)
       #endif
     }
   }

   // in application(_:didFinishLaunchingWithOptions:), before `return true`:
   AppCheck.setAppCheckProviderFactory(AppCheckFactory())
   FirebaseApp.configure()
   ```

   If Xcode cannot find `FirebaseCore` or `FirebaseAppCheck`, add those two
   products of `firebase-ios-sdk` to the App target under General > Frameworks.
6. **Android.** Nothing more to change. `android/app/build.gradle` already
   applies the `google-services` Gradle plugin when `google-services.json` is
   present, and Firebase starts by itself.
7. **Simulator / emulator builds.** Build with the debug provider:

   ```bash
   VITE_APP_CHECK_DEBUG=1 pnpm app:build
   ```

   Then register the debug token (Part 1, step 7). Store builds must be made
   without `VITE_APP_CHECK_DEBUG`.
8. Test: as a guest in the app, pick a partner and tap "Continue as guest". The
   conversation should start. In the API logs there should be no
   `app_check_rejected` line.

## Server settings

| Setting | Where | Notes |
| --- | --- | --- |
| Project | built in as `DEFAULT_APP_CHECK_PROJECT_ID` = `convolab-490517` | Override with `APP_CHECK_PROJECT_ID` on the API |
| Credentials | Application Default Credentials (the Cloud Run service account) | Checking a token needs no extra IAM role. The API fetches Firebase's public keys and checks the signature and project |

Local development: when `NODE_ENV` is not `production` and
`APP_CHECK_PROJECT_ID` is unset, App Check counts as "not configured" and any
non-empty token passes, as reCAPTCHA does locally. The app sends the
placeholder `local-dev` when its build has no App Check plugin, so a simulator
build pointed at a local API still works. Production refuses that placeholder,
and fails closed on every error.

## Timing

Once the server part is deployed, guests in the app can start a conversation
only after Parts 1 and 2 are done and a new app build is installed. Signed-in
accounts and the website are not affected. Deploy outside pilot hours.

## Possible later hardening

- Replay protection: the app could request limited-use tokens and the server
  could call `verifyToken(token, { consume: true })`. That needs an IAM role
  for the service account and adds a network call per start.
- Accept only our two app ids (from `appId` in the verified token).
