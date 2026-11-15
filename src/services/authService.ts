import { GoogleAuthProvider, signInWithCredential, signOut as fbSignOut } from '@react-native-firebase/auth';
import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import Constants from 'expo-constants';

import { auth } from './firebase';

let configured = false;

export function googleWebClientId(): string | undefined {
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const fromConfig = (Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined)
    ?.googleWebClientId;
  return fromEnv || fromConfig || undefined;
}

export function configureGoogleSignIn(): void {
  if (configured) return;
  const webClientId = googleWebClientId();
  if (!webClientId) {
    console.warn(
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set. Google Sign-In will fail until it is configured (see README).',
    );
  }
  GoogleSignin.configure({ webClientId });
  configured = true;
}

export class SignInCancelled extends Error {}

export async function signInWithGoogle(): Promise<void> {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new SignInCancelled('Sign-in cancelled');
    const idToken = res.data.idToken;
    if (!idToken) throw new Error('Google did not return an ID token. Check the web client ID.');
    await signInWithCredential(auth(), GoogleAuthProvider.credential(idToken));
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new SignInCancelled('Sign-in cancelled');
    }
    throw e;
  }
}

export async function signOut(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google on this device; Firebase sign-out still applies.
  }
  await fbSignOut(auth());
}
