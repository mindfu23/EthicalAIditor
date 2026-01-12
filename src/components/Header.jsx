import React from 'react';
import { Settings, User, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function Header({ onSettingsClick }) {
  const { user, isAuthenticated, openAuth, logout } = useAuth();

  return (
    <header className="border-b border-warm-100 bg-cream-50 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="font-serif text-2xl text-ink">
          Ethical Aiditor
        </h1>
        <p className="text-xs text-ink-muted mt-0.5">
          AI writing assistance powered by open-source models
        </p>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-xs text-ink-muted max-w-xs text-right hidden md:block">
          Your writings are saved locally only. No data is used to train models.
        </p>

        <button
          onClick={onSettingsClick}
          className="p-2 hover:bg-cream-200 rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 text-ink-muted" />
        </button>

        {isAuthenticated ? (
          <div className="relative group">
            <div
              className="w-8 h-8 bg-sage text-sage-darker rounded-full flex items-center justify-center text-sm font-medium cursor-pointer"
              title={user?.email || 'Account'}
            >
              {user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="absolute top-full right-0 mt-2 hidden group-hover:block">
              <button
                onClick={logout}
                className="bg-cream-50 border border-warm-100 text-ink-light text-xs px-3 py-2 rounded-lg whitespace-nowrap flex items-center gap-2 shadow-sm hover:bg-cream-200"
              >
                <LogOut size={12} /> Sign Out
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => openAuth('login')}
            className="p-2 hover:bg-cream-200 rounded-lg transition-colors"
            aria-label="Sign In"
          >
            <User className="w-5 h-5 text-ink-muted" />
          </button>
        )}
      </div>
    </header>
  );
}

export default Header;
