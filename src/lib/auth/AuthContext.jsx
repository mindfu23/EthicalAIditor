/**
 * Authentication Context for EthicalAIditor
 * 
 * Provides authentication state and methods throughout the app.
 * Adapted from ValueApe's auth system.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const STORAGE_KEY = 'ethicalaiditor_auth';

export const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [pendingCallback, setPendingCallback] = useState(null);

  const isAuthenticated = !!user;

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Execute pending callback after successful auth
  useEffect(() => {
    if (isAuthenticated && pendingCallback) {
      pendingCallback();
      setPendingCallback(null);
    }
  }, [isAuthenticated, pendingCallback]);

  const getAuthHeaders = useCallback(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return {};
    
    try {
      const { token, user } = JSON.parse(cached);
      return {
        'Authorization': `Bearer ${token}`,
        'X-User-Id': user?.id || '',
      };
    } catch {
      return {};
    }
  }, []);

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      // First check local storage for cached user
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.user) {
            setUser(parsed.user);
          }
        } catch (e) {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Verify with server if API is configured
      if (API_BASE) {
        const headers = getAuthHeaders();
        if (headers['X-User-Id']) {
          const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Content-Type': 'application/json', ...headers },
          });

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else {
            setUser(null);
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [getAuthHeaders]);

  const login = useCallback(async (email, password) => {
    if (!API_BASE) {
      return { success: false, error: 'API not configured' };
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setUser(data.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, token: data.token }));
        localStorage.setItem('ethicalaiditor_user_id', data.user.id);
        localStorage.setItem('ethicalaiditor_auth_token', data.token);
        setShowAuthModal(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    if (!API_BASE) {
      return { success: false, error: 'API not configured' };
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setUser(data.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: data.user, token: data.token }));
        localStorage.setItem('ethicalaiditor_user_id', data.user.id);
        localStorage.setItem('ethicalaiditor_auth_token', data.token);
        setShowAuthModal(false);
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Signup failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('ethicalaiditor_user_id');
    localStorage.removeItem('ethicalaiditor_auth_token');
  }, []);

  const requireAuth = useCallback((callback) => {
    if (isAuthenticated) {
      return true;
    }
    
    if (callback) {
      setPendingCallback(() => callback);
    }
    setAuthModalMode('login');
    setShowAuthModal(true);
    return false;
  }, [isAuthenticated]);

  const openAuth = useCallback((mode = 'login') => {
    setAuthModalMode(mode);
    setShowAuthModal(true);
  }, []);

  const value = {
    user,
    isLoading,
    isAuthenticated,
    login,
    signup,
    logout,
    checkAuth,
    showAuthModal,
    setShowAuthModal,
    authModalMode,
    setAuthModalMode,
    requireAuth,
    openAuth,
    getAuthHeaders,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
