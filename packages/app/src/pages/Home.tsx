import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../api/trpc';
import { LappFramework } from '../components/LappFramework';
import { ScenarioList } from '../components/ScenarioList';
import { SetupGuide } from '../components/SetupGuide';
import { YourSessions } from '../components/YourSessions';
import { apiUrl } from '../lib/apiUrl';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-73px)] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-[#EBEBEB]">Conversation Coach</h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-[#A0A0A0]">
          Practice difficult conversations with AI
        </p>
      </div>

      {/* Sign-in card. There is deliberately no email/password form: the only
          sign-in that exists is Google, and the old fields silently ignored
          whatever was typed into them (mobile audit, issue #135). */}
      <div
        className="w-full max-w-[520px]
                      rounded-2xl px-8 py-7
                      bg-white dark:bg-[rgba(32,32,32,0.95)]
                      border border-gray-200 dark:border-[rgba(255,255,255,0.07)]
                      shadow-sm"
      >
        <a
          href={apiUrl('/api/auth/google')}
          className="flex items-center justify-center gap-3 w-full py-3 rounded-xl
                     text-base font-medium
                     bg-white dark:bg-[rgba(50,50,50,0.8)]
                     border border-gray-200 dark:border-[rgba(255,255,255,0.1)]
                     text-gray-700 dark:text-[#EBEBEB]
                     hover:bg-gray-50 dark:hover:bg-[rgba(60,60,60,0.9)]
                     hover:border-gray-300 dark:hover:border-[rgba(255,255,255,0.2)]
                     transition-all duration-200 shadow-sm"
        >
          <GoogleLogo />
          Sign in with Google
        </a>
        <p className="mt-4 text-center text-sm text-gray-500 dark:text-[#707070]">
          New here? Signing in with Google creates your account.
        </p>
      </div>

      {/* What the product actually is — a visitor deciding whether to sign in
          otherwise sees only a login card. */}
      <LappFramework
        className="mt-10 w-full max-w-2xl"
        heading="What you'll practise"
        intro="Talk with an AI partner who genuinely disagrees with you, while a coach helps you stay in the conversation. The goal is not to win the argument."
      />
    </div>
  );
}

function AuthenticatedHome() {
  /*
   * ── HOME PAGE SIDE PADDING ───────────────────────────────────────────────
   * px-6 / px-10 / px-16 = side padding at sm/lg breakpoints
   * py-10 = top/bottom padding              (try py-12 for more space)
   */
  return (
    <div className="w-full py-10 px-6 sm:px-10 lg:px-16">
      <SetupGuide />
      <YourSessions />
      <LappFramework className="mb-10" />

      <>
        {/* SECTION HEADING SIZE → text-2xl, try text-3xl to go bigger */}
        <h2 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-[#EBEBEB]">
          Start a New Conversation
        </h2>
        <ScenarioList />
      </>
    </div>
  );
}

export function Home() {
  const trpc = useTRPC();
  const { data: authData, isLoading } = useQuery(trpc.auth.me.queryOptions());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-73px)]">
        <div
          className="w-9 h-9 rounded-full border-2
                        border-[rgba(130,167,161,0.3)] border-t-[rgba(130,167,161,0.9)]
                        animate-spin"
        />
      </div>
    );
  }

  if (!authData?.user) return <LandingPage />;
  return <AuthenticatedHome />;
}
