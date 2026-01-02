import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../api/trpc';
import { HamburgerIcon } from './HamburgerIcon';

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
      if (!response.ok) {
        throw new Error(`Logout failed with status ${response.status}`);
      }
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
        className="flex items-center gap-2 rounded-md p-2 hover:bg-gray-100"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <HamburgerIcon />
        )}
      </button>

      {isOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop for click-outside-to-close */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
            role="presentation"
          />
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
            <div className="p-4">
              {mergedFrom && (
                <div className="mb-3 rounded bg-blue-100 p-2 text-sm text-blue-800">
                  Session merged into this account.
                </div>
              )}

              {isLoading ? (
                <p className="text-gray-500">Loading...</p>
              ) : user ? (
                <div>
                  {isGuest ? (
                    // Guest user - encourage sign-in
                    <>
                      <div className="border-b pb-3">
                        <p className="font-medium text-gray-900">Guest Session</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Sign in to save your conversations
                        </p>
                      </div>
                      <a
                        href="/api/auth/google"
                        className="mt-3 block rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
                      >
                        Sign in with Google
                      </a>
                      <button
                        type="button"
                        onClick={handleLogoutClick}
                        className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600"
                      >
                        or sign out
                      </button>
                    </>
                  ) : (
                    // Authenticated user
                    <>
                      <div className="flex items-center gap-3 border-b pb-3">
                        {user.avatarUrl && (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="h-10 w-10 rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{user.name}</p>
                          <p className="truncate text-sm text-gray-500">
                            {user.externalIdentities?.[0]?.email}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-gray-400">
                        <p>Role: {user.role}</p>
                        <p>ID: {user.id}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleLogout()}
                        className="mt-3 w-full rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
                      >
                        Sign out
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-gray-600">Not signed in</p>
                  <a
                    href="/api/auth/google"
                    className="block rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
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
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop for click-outside-to-close */}
          <div
            className="fixed inset-0 z-30 bg-black bg-opacity-50"
            onClick={() => setShowLogoutConfirm(false)}
            onKeyDown={(e) => e.key === 'Escape' && setShowLogoutConfirm(false)}
            role="presentation"
          />
          <div className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
            {hasUsage ? (
              // Guest with conversations - warn about data loss
              <>
                <h3 className="font-semibold text-gray-900">You have conversations</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Signing out will lose your conversation history. Sign in with Google to keep it.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href="/api/auth/google"
                    className="rounded bg-blue-600 px-4 py-2 text-center text-sm text-white hover:bg-blue-700"
                  >
                    Sign in with Google
                  </a>
                  <button
                    type="button"
                    onClick={() => handleLogout(false)}
                    className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    Sign out anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              // Guest with no usage - offer to unclaim invitation
              <>
                <h3 className="font-semibold text-gray-900">Sign out?</h3>
                <p className="mt-2 text-sm text-gray-600">
                  You haven't started any conversations yet. The invitation link will still work
                  after you sign out.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleLogout(true)}
                    className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    Sign out
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
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
