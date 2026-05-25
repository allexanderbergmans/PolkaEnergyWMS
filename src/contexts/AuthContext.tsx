import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { mapSupabaseUser } from '@/lib/auth';
import { AuthUser, EmployeeSettings } from '@/types';

interface AuthContextType {
  user: AuthUser | null;
  employeeSettings: EmployeeSettings | null;
  loading: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employeeSettings, setEmployeeSettings] = useState<EmployeeSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async (userId: string) => {
    const { data } = await supabase
      .from('employee_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    setEmployeeSettings(data || null);
  };

  const syncProfile = async (authUser: AuthUser) => {
    await supabase.from('user_profiles').upsert(
      {
        id: authUser.id,
        username: authUser.username,
        email: authUser.email,
      },
      { onConflict: 'id' }
    );
  };

  const login = async (authUser: AuthUser) => {
    setUser(authUser);
    await syncProfile(authUser);
    await fetchSettings(authUser.id);
  };

  const logout = () => {
    setUser(null);
    setEmployeeSettings(null);
  };

  const refreshSettings = async () => {
    if (user) {
      await fetchSettings(user.id);
    }
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (mounted && session?.user) {
        const authUser = mapSupabaseUser(session.user);
        setUser(authUser);
        await syncProfile(authUser);
        await fetchSettings(authUser.id);
      }
      if (mounted) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        const authUser = mapSupabaseUser(session.user);
        void login(authUser);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        logout();
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        void login(mapSupabaseUser(session.user));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, employeeSettings, loading, login, logout, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
