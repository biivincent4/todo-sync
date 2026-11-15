import { onAuthStateChanged } from '@react-native-firebase/auth';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { configureGoogleSignIn, signInWithGoogle, signOut } from '../services/authService';
import { auth } from '../services/firebase';
import { SessionUser } from '../services/workspaces';

interface AuthState {
  user: SessionUser | null;
  initializing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    configureGoogleSignIn();
    // Firebase Auth persists the session natively, so this fires with the
    // signed-in user after an app restart.
    return onAuthStateChanged(auth(), (u) => {
      setUser(
        u
          ? { uid: u.uid, displayName: u.displayName, email: u.email, photoURL: u.photoURL }
          : null,
      );
      setInitializing(false);
    });
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, initializing, signIn: signInWithGoogle, signOut }),
    [user, initializing],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The signed-in user; only call below the auth gate. */
export function useUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error('No signed-in user');
  return user;
}
