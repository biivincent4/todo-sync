const IS_DEV = process.env.APP_VARIANT === 'development';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: IS_DEV ? 'todo-sync (dev)' : 'todo-sync',
  owner: 'vincentbii',
  slug: 'todo-sync',
  scheme: 'todosync',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#3E63DD' },
  android: {
    // Must match the Android app registered in Firebase (google-services.json).
    package: process.env.ANDROID_PACKAGE ?? 'com.todosync.app',
    // Downloaded from the Firebase console; never committed (see README).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    '@react-native-google-signin/google-signin',
    [
      'expo-build-properties',
      {
        android: {
          // React Native Firebase 27's Firebase BoM ships Kotlin 2.4 metadata; older compilers can't read it.
          kotlinVersion: '2.4.0',
          extraMavenRepos: ['../../node_modules/@notifee/react-native/android/libs'],
        },
      },
    ],
    ['expo-image-picker', { cameraPermission: 'Allow todo-sync to take photos for your tasks and ideas.', photosPermission: 'Allow todo-sync to attach photos to your tasks and ideas.' }],
    ['expo-contacts', { contactsPermission: 'Allow todo-sync to attach contacts to your tasks and ideas.' }],
    ['expo-location', { locationWhenInUsePermission: 'Allow todo-sync to attach your current location to a task or idea.' }],
    ['expo-audio', { microphonePermission: 'Allow todo-sync to record voice notes.' }],
    'expo-document-picker',
  ],
  experiments: { typedRoutes: false },
  extra: {
    // Web OAuth client ID from the Firebase/Google Cloud console. Not a secret, but kept out of git.
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    eas: { projectId: process.env.EAS_PROJECT_ID ?? '2d129914-b258-4b13-acd1-3b18bbbbfb02' },
  },
};
