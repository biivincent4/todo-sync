import notifee from '@notifee/react-native';
import 'expo-router/entry';

import { handleNotificationEvent } from './src/services/notifications';

// Notification actions (Mark done / Snooze) pressed while the app is in the background.
notifee.onBackgroundEvent(handleNotificationEvent);
