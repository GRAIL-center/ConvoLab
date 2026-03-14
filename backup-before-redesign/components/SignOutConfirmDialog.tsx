interface SignOutConfirmDialogProps {
  hasUsage: boolean;
  onSignOut: (unclaim?: boolean) => void;
  onCancel: () => void;
}

export function SignOutConfirmDialog({ hasUsage, onSignOut, onCancel }: SignOutConfirmDialogProps) {
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop for click-outside-to-close */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: escape handled by dialog */}
      <div className="fixed inset-0 z-30 bg-black bg-opacity-50" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-40 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl">
        {hasUsage ? (
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
                onClick={() => onSignOut(false)}
                className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Sign out anyway
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-semibold text-gray-900">Sign out?</h3>
            <p className="mt-2 text-sm text-gray-600">
              The invitation link will still work after you sign out.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => onSignOut(true)}
                className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Sign out
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
