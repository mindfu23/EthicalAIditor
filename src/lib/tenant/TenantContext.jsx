/**
 * Tenant Context for EthicalAIditor
 *
 * Provides anonymous multi-tenant session management.
 * Every user (signed in or not) gets a tenant_id for data isolation.
 * This enables:
 * - Tenant-scoped rate limiting
 * - Tenant-isolated RAG/embeddings
 * - Inference provenance logging
 * - Privacy-preserving usage tracking
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_CLOUDFLARE_WORKER_URL || '';
const TENANT_STORAGE_KEY = 'ethicalaiditor_tenant';

export const TenantContext = createContext(undefined);

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize tenant session on mount
  useEffect(() => {
    initializeTenant();
  }, []);

  /**
   * Initialize or restore tenant session
   */
  const initializeTenant = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check for existing session in storage
      const stored = localStorage.getItem(TENANT_STORAGE_KEY);
      let existingToken = null;

      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          existingToken = parsed.token;

          // Check if token is expired locally first
          if (parsed.expires_at && new Date(parsed.expires_at) < new Date()) {
            console.log('[Tenant] Stored session expired, creating new one');
            localStorage.removeItem(TENANT_STORAGE_KEY);
            existingToken = null;
          }
        } catch (e) {
          console.error('[Tenant] Failed to parse stored session:', e);
          localStorage.removeItem(TENANT_STORAGE_KEY);
        }
      }

      // Call session endpoint to create or refresh
      if (API_BASE) {
        const response = await fetch(`${API_BASE}/api/session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(existingToken ? { 'Authorization': `Bearer ${existingToken}` } : {})
          },
          body: JSON.stringify({ token: existingToken })
        });

        if (response.ok) {
          const data = await response.json();
          const tenantData = {
            tenant_id: data.tenant_id,
            token: data.token,
            quota_tier: data.quota_tier,
            quota_limit: data.quota_limit,
            expires_at: data.expires_at,
            refreshed: data.refreshed
          };

          localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenantData));
          setTenant(tenantData);

          if (data.refreshed) {
            console.log('[Tenant] Session refreshed:', data.tenant_id);
          } else {
            console.log('[Tenant] New session created:', data.tenant_id);
          }
        } else {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to create tenant session');
        }
      } else {
        // No API configured - create local-only tenant ID
        const localTenant = {
          tenant_id: generateLocalUUID(),
          token: null,
          quota_tier: 'local',
          quota_limit: Infinity,
          expires_at: null,
          refreshed: false
        };
        localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(localTenant));
        setTenant(localTenant);
        console.log('[Tenant] Local-only session created:', localTenant.tenant_id);
      }
    } catch (err) {
      console.error('[Tenant] Initialization error:', err);
      setError(err.message);

      // Fallback to local-only session on error
      const fallbackTenant = {
        tenant_id: generateLocalUUID(),
        token: null,
        quota_tier: 'anonymous',
        quota_limit: 5,
        expires_at: null,
        refreshed: false
      };
      localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(fallbackTenant));
      setTenant(fallbackTenant);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get current tenant session info from server
   */
  const getSessionInfo = useCallback(async () => {
    if (!API_BASE || !tenant?.token) return null;

    try {
      const response = await fetch(`${API_BASE}/api/session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tenant.token}`
        }
      });

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (err) {
      console.error('[Tenant] Failed to get session info:', err);
      return null;
    }
  }, [tenant]);

  /**
   * Get auth headers for API requests
   */
  const getTenantHeaders = useCallback(() => {
    if (!tenant?.token) return {};
    return {
      'Authorization': `Bearer ${tenant.token}`,
      'X-Tenant-Id': tenant.tenant_id
    };
  }, [tenant]);

  /**
   * Link tenant session to authenticated user
   * Call this after user signs in to upgrade quota
   */
  const linkToUser = useCallback(async (userToken) => {
    if (!API_BASE || !tenant?.token) return { success: false, error: 'No tenant session' };

    try {
      const response = await fetch(`${API_BASE}/api/session/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tenant.token}`
        },
        body: JSON.stringify({ user_token: userToken })
      });

      const data = await response.json();

      if (response.ok) {
        // Refresh tenant info after linking
        await initializeTenant();
        return { success: true };
      }

      return { success: false, error: data.error || 'Failed to link session' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [tenant, initializeTenant]);

  /**
   * Clear tenant session (for debugging/reset)
   */
  const clearSession = useCallback(() => {
    localStorage.removeItem(TENANT_STORAGE_KEY);
    setTenant(null);
    initializeTenant();
  }, [initializeTenant]);

  const value = {
    tenant,
    tenantId: tenant?.tenant_id,
    token: tenant?.token,
    quotaTier: tenant?.quota_tier,
    quotaLimit: tenant?.quota_limit,
    isLoading,
    error,
    getTenantHeaders,
    getSessionInfo,
    linkToUser,
    clearSession,
    refresh: initializeTenant
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Generate a UUID v4 for local-only sessions
 */
function generateLocalUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
