import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTRPC } from '../api/trpc';
import { apiUrl } from '../lib/apiUrl';
import { clearAuthToken, nativeAuthHeaders } from '../lib/authToken';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const trpc = useTRPC();

  const { data, isLoading, refetch } = useQuery(trpc.auth.me.queryOptions());

  const { user, mergedFrom } = data || {};
  const isGuest = user?.role === 'GUEST';
  const hasUsage = (user?.sessionCount ?? 0) > 0;
  // Staff and admin accounts own invitations and notes other people rely on;
  // the server refuses to delete them, so the option is not offered.
  const canDelete = user?.role === 'GUEST' || user?.role === 'USER';

  const deleteAccount = useMutation(
    trpc.auth.deleteAccount.mutationOptions({
      onSuccess: () => {
        clearAuthToken();
        window.location.assign('/');
      },
    })
  );

  const openDeleteConfirm = () => {
    setIsOpen(false);
    deleteAccount.reset();
    setShowDeleteConfirm(true);
  };

  // Escape closes the dialog (unless a delete is already running).
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteAccount.isPending) setShowDeleteConfirm(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showDeleteConfirm, deleteAccount.isPending]);

  const handleLogout = async (unclaim = false) => {
    const url = apiUrl(unclaim ? '/api/auth/logout?unclaim=true' : '/api/auth/logout');
    try {
      // The native app authenticates by bearer, so logout must carry it (the
      // guest unclaim depends on it), and the stored token must go too.
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: nativeAuthHeaders(),
      });
      if (!response.ok) throw new Error(`Logout failed with status ${response.status}`);
      clearAuthToken();
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-[18px] h-[18px]"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
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
          <div
            className="absolute right-0 z-20 mt-2 w-72 rounded-xl
                          bg-white dark:bg-[rgba(40,40,40,0.98)]
                          border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]
                          shadow-xl backdrop-blur-sm"
          >
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
                        <p className="font-medium text-gray-900 dark:text-[#EBEBEB]">
                          Guest Session
                        </p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-[#A0A0A0]">
                          Sign in to save your conversations
                        </p>
                      </div>
                      <a
                        href={apiUrl('/api/auth/google')}
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
                      <button
                        type="button"
                        onClick={openDeleteConfirm}
                        className="mt-1 w-full text-center text-xs text-gray-400 dark:text-[#6B6B6B] hover:text-red-700 dark:hover:text-red-400"
                      >
                        Delete my conversations
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
                          <p className="truncate font-medium text-gray-900 dark:text-[#EBEBEB]">
                            {user.name}
                          </p>
                          <p className="truncate text-sm text-gray-500 dark:text-[#A0A0A0]">
                            {user.externalIdentities?.[0]?.email}
                          </p>
                        </div>
                      </div>

                      <Link
                        to="/home"
                        onClick={() => setIsOpen(false)}
                        className="mt-3 block rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                   p-3 hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                   transition-colors"
                      >
                        <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">Home</div>
                        <div className="text-xs text-gray-500 dark:text-[#A0A0A0]">
                          conversations
                        </div>
                      </Link>

                      {user.role === 'ADMIN' && (
                        <Link
                          to="/admin"
                          onClick={() => setIsOpen(false)}
                          className="mt-2 block rounded-lg border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.1)]
                                     p-3 hover:bg-[rgba(130,167,161,0.08)] dark:hover:bg-[rgba(212,232,229,0.05)]
                                     transition-colors"
                        >
                          <div className="font-medium text-gray-900 dark:text-[#EBEBEB]">Admin</div>
                          <div className="text-xs text-gray-500 dark:text-[#A0A0A0]">
                            users, invitations, feedback
                          </div>
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
                      {canDelete && (
                        <button
                          type="button"
                          onClick={openDeleteConfirm}
                          className="mt-2 w-full text-center text-xs text-gray-400 dark:text-[#6B6B6B] hover:text-red-700 dark:hover:text-red-400"
                        >
                          Delete my account
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-gray-600 dark:text-[#A0A0A0]">Not signed in</p>
                  <a
                    href={apiUrl('/api/auth/google')}
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
          <div
            className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2
                          rounded-2xl p-6 shadow-2xl
                          bg-white dark:bg-[rgba(40,40,40,0.98)]
                          border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]"
          >
            {hasUsage ? (
              <>
                <h3 className="font-semibold text-gray-900 dark:text-[#EBEBEB]">
                  You have conversations
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-[#A0A0A0]">
                  Signing out will lose your conversation history. Sign in with Google to keep it.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <a
                    href={apiUrl('/api/auth/google')}
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

      {/* Account deletion confirmation (#242). Portalled to <body>: the sticky
          header's backdrop-blur makes it the containing block for fixed
          children, which would pin this dialog inside the header. */}
      {showDeleteConfirm &&
        createPortal(
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop */}
            <div
              className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
              onClick={() => !deleteAccount.isPending && setShowDeleteConfirm(false)}
              onKeyDown={(e) =>
                e.key === 'Escape' && !deleteAccount.isPending && setShowDeleteConfirm(false)
              }
              role="presentation"
            />
            <div
              role="alertdialog"
              aria-labelledby="delete-account-title"
              className="fixed left-1/2 top-1/2 z-40 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2
                          rounded-2xl p-6 shadow-2xl
                          bg-white dark:bg-[rgba(40,40,40,0.98)]
                          border border-[rgba(130,167,161,0.2)] dark:border-[rgba(212,232,229,0.12)]"
            >
              <h3
                id="delete-account-title"
                className="font-semibold text-gray-900 dark:text-[#EBEBEB]"
              >
                {isGuest ? 'Delete your conversations?' : 'Delete your account?'}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-[#A0A0A0]">
                {isGuest
                  ? 'This permanently deletes your conversations from ConvoLab, including your questions to the coach and your scores. It cannot be undone.'
                  : 'This permanently deletes your account and all your conversations, including your questions to the coach and your scores. It cannot be undone.'}
              </p>
              {deleteAccount.isError && (
                <p className="mt-3 text-sm text-red-700 dark:text-red-400">
                  Something went wrong before everything was deleted. Please try again, or email
                  hsistek@fas.harvard.edu.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={deleteAccount.isPending}
                  onClick={() => deleteAccount.mutate()}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white
                           hover:bg-red-800 disabled:opacity-60 transition-colors"
                >
                  {deleteAccount.isPending ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button
                  type="button"
                  disabled={deleteAccount.isPending}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm text-gray-400 dark:text-[#6B6B6B] hover:text-gray-600 dark:hover:text-[#A0A0A0]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
