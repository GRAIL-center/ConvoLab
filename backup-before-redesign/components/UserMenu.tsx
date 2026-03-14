import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTRPC } from '../api/trpc';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const trpc = useTRPC();

  const { data, isLoading, refetch } = useQuery(trpc.auth.me.queryOptions());

  const { user, mergedFrom } = data || {};
  const isGuest = user?.role === 'GUEST';
  const hasUsage = (user?.sessionCount ?? 0) > 0;

  const handleLogout = async (unclaim = false) => {
    const url = unclaim ? '/api/auth/logout?unclaim=true' : '/api/auth/logout';
    try {
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error(`Logout failed with status ${response.status}`);
      setIsOpen(false);
      setShowLogoutConfirm(false);
      refetch();
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const handleLogoutClick = () => {
    if (isGuest) {
      setShowLogoutConfirm(true);
    } else {
      handleLogout();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
        className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden
                   border border-[rgba(130,167,161,0.3)] dark:border-[rgba(212,232,229,0.15)]
                   bg-white dark:bg-[rgba(40,40,40,0.9)]
                   hover:bg-[rgba(130,167,161,0.1)] dark:hover:bg-[rgba(212,232,229,0.08)]
                   text-gray-500 dark:text-[#A0A0A0]
                   transition-colors duration-200"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-[18px] h-[18px]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
            role="presentation"
          />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl
                          bg-white dark:bg-[rgba(40,40,40,0.98)]
                          border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]
                          shadow-xl backdrop-blur-sm">
            <div className="p-4">
              {mergedFrom && (
                <div className="mb-3 rounded-lg bg-[rgba(130,167,161,0.15)] dark:bg-[rgba(212,232,229,0.08)] p-2 text-sm text-[rgba(60,120,110,1)] dark:text-[rgba(134,199,194,0.9)]">
                  Session merged into this account.
                </div>
              )}

              {isLoading ? (
                <p className="text-[#A0A0A0]">Loading...</p>
              ) : user ? (
                <div>
                  {isGuest ? (
                    <>
                      <div className="border-b border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)] pb-3">
                        <p className="font-medium text-gray-900 dark:text-[#EBEBEB]">Guest Session</p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-[#A0A0A0]">
                          Sign in to save your conversations
                        </p>
                      </div>
                      <a
                        href="/api/auth/google"
                        className="mt-3 block rounded-lg bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                                   px-4 py-2 text-center text-sm font-medium
                                   text-[rgba(50,100,90,1)] dark:text-[#EBEBEB]
                                   hover:bg-[rgba(130,167,161,0.35)] dark:hover:bg-[rgba(212,232,229,0.2)]
                                   transition-colors"
                      >
                        Sign in with Google
                      </a>
                      <button
                        type="button"
                        onClick={handleLogoutClick}
                        className="mt-2 w-full text-center text-xs text-gray-400 dark:text-[#6B6B6B] hover:text-gray-600 dark:hover:text-[#A0A0A0]"
                      >
                        or sign out
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 border-b border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)] pb-3">
                        {user.avatarUrl && (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="h-10 w-10 rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-900 dark:text-[#EBEBEB]">{user.name}</p>
                          <p className="truncate text-sm text-gray-500 dark:text-[#A0A0A0]">
                            {user.externalIdentities?.[0]?.email}
                          </p>
                        </div>
                      </div>

                      <Link
                        to="/"
                        onClick={() => setIsOpen(false)}
                        className="mt-3 block rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                   p-3 hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                   transition-colors"
                      >
                        <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">Home</div>
                        <div className="text-xs text-gray-500 dark:text-[#A0A0A0]">conversations</div>
                      </Link>

                      {(user.role === 'ADMIN' || user.role === 'STAFF') && (
                        <Link
                          to="/research"
                          onClick={() => setIsOpen(false)}
                          className="mt-2 block rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                     p-3 hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                     transition-colors"
                        >
                          <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">Research</div>
                          <div className="text-xs text-gray-500 dark:text-[#A0A0A0]">invitations, sessions</div>
                        </Link>
                      )}

                      {user.role === 'ADMIN' && (
                        <Link
                          to="/admin"
                          onClick={() => setIsOpen(false)}
                          className="mt-2 block rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                     p-3 hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                     transition-colors"
                        >
                          <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">Admin</div>
                          <div className="text-xs text-gray-500 dark:text-[#A0A0A0]">users, telemetry</div>
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={() => handleLogout()}
                        className="mt-3 w-full rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                   px-3 py-2 text-sm text-gray-600 dark:text-[#A0A0A0]
                                   hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                   transition-colors"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-gray-600 dark:text-[#A0A0A0]">Not signed in</p>
                  <a
                    href="/api/auth/google"
                    className="block rounded-lg bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                               px-4 py-2 text-center text-sm font-medium
                               text-[rgba(50,100,90,1)] dark:text-[#EBEBEB]
                               hover:bg-[rgba(130,167,161,0.35)] dark:hover:bg-[rgba(212,232,229,0.2)]
                               transition-colors"
                  >
                    Sign in with Google
                  </a>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Guest logout confirmation dialog */}
      {showLogoutConfirm && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowLogoutConfirm(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowLogoutConfirm(false)}
            role="presentation"
          />
          <div className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2
                          rounded-2xl p-6 shadow-2xl
                          bg-white dark:bg-[rgba(40,40,40,0.98)]
                          border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]">
            {hasUsage ? (
              <>
                <h3 className="font-semibold text-gray-900 dark:text-[#EBEBEB]">You have conversations</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-[#A0A0A0]">
                  Signing out will lose your conversation history. Sign in with Google to keep it.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href="/api/auth/google"
                    className="rounded-lg bg-[rgba(130,167,161,0.25)] dark:bg-[rgba(212,232,229,0.15)]
                               px-4 py-2 text-center text-sm font-medium
                               text-[rgba(50,100,90,1)] dark:text-[#EBEBEB]
                               hover:bg-[rgba(130,167,161,0.35)] transition-colors"
                  >
                    Sign in with Google
                  </a>
                  <button
                    type="button"
                    onClick={() => handleLogout(false)}
                    className="rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                               px-4 py-2 text-sm text-gray-600 dark:text-[#A0A0A0]
                               hover:bg-[rgba(130,167,161,0.08)] transition-colors"
                  >
                    Sign out anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="text-sm text-gray-400 dark:text-[#6B6B6B] hover:text-gray-600 dark:hover:text-[#A0A0A0]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-semibold text-gray-900 dark:text-[#EBEBEB]">Sign out?</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-[#A0A0A0]">
                  The invitation link will still work after you sign out.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleLogout(true)}
                    className="rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                               px-4 py-2 text-sm text-gray-600 dark:text-[#A0A0A0]
                               hover:bg-[rgba(130,167,161,0.08)] transition-colors"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="text-sm text-gray-400 dark:text-[#6B6B6B] hover:text-gray-600 dark:hover:text-[#A0A0A0]"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}