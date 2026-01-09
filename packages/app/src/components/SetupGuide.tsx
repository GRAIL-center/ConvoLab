import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';

// Prose styling for markdown - extended for full documentation rendering
const markdownClasses = `
  prose prose-slate max-w-none
  [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6
  [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h2]:border-b [&_h2]:border-gray-200 [&_h2]:pb-2
  [&_h3]:text-lg [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4
  [&_p]:my-2 [&_p]:leading-relaxed
  [&_strong]:font-semibold
  [&_em]:italic
  [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2
  [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2
  [&_li]:my-1
  [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-pink-600
  [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-3
  [&_pre_code]:bg-transparent [&_pre_code]:text-gray-100 [&_pre_code]:p-0
  [&_blockquote]:border-l-4 [&_blockquote]:border-amber-400 [&_blockquote]:bg-amber-50 [&_blockquote]:pl-4 [&_blockquote]:py-2 [&_blockquote]:pr-2 [&_blockquote]:my-3 [&_blockquote]:rounded-r
  [&_hr]:my-6 [&_hr]:border-gray-200
  [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800
  [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse
  [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left
  [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2
`.trim();

interface CheckItemProps {
  label: string;
  configured: boolean;
  hint?: string;
}

function CheckItem({ label, configured, hint }: CheckItemProps) {
  return (
    <li className="flex items-start gap-2">
      <span className={configured ? 'text-green-600' : 'text-red-500'}>
        {configured ? '✓' : '✗'}
      </span>
      <div>
        <span className={configured ? 'text-gray-700' : 'text-gray-900 font-medium'}>{label}</span>
        {!configured && hint && <span className="text-gray-500 text-sm ml-2">({hint})</span>}
      </div>
    </li>
  );
}

interface SetupStatus {
  complete: boolean;
  checks: {
    googleOAuth: { clientId: boolean; clientSecret: boolean; callbackUrl: boolean };
    aiKeys: { anthropic: boolean; openai: boolean; googleAi: boolean };
    sessionKey: boolean;
    databaseUrl: boolean;
  };
  missing: { googleOAuth: boolean; aiKey: boolean; sessionKey: boolean };
  errors: string[];
  warnings: string[];
  quickstartContent: string | null;
}

async function fetchSetupStatus(): Promise<SetupStatus | null> {
  try {
    const res = await fetch('/api/setup/status');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function SetupGuide() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['setup-status'],
    queryFn: fetchSetupStatus,
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });

  // Don't show anything if loading or error (may be production)
  if (isLoading || error || !data) {
    return null;
  }

  // Don't show if setup is complete
  if (data.complete) {
    return null;
  }

  const { checks, quickstartContent, warnings } = data;
  const hasAnyAiKey = checks.aiKeys.anthropic || checks.aiKeys.openai || checks.aiKeys.googleAi;

  return (
    <div className="mb-8 rounded-lg border-2 border-amber-300 bg-amber-50 overflow-hidden">
      {/* Header */}
      <div className="bg-amber-200 px-4 py-3 border-b border-amber-300">
        <h2 className="text-lg font-semibold text-amber-900">
          Welcome! Let's get you set up
        </h2>
        <p className="text-sm text-amber-800 mt-1">
          Some configuration is missing. Here's what you need:
        </p>
      </div>

      {/* Quick status */}
      <div className="px-4 py-4 border-b border-amber-200 bg-white">
        <h3 className="font-medium text-gray-900 mb-3">Configuration Status</h3>
        <ul className="space-y-2">
          <CheckItem
            label="Google OAuth"
            configured={checks.googleOAuth.clientId && checks.googleOAuth.clientSecret}
            hint="needed for sign-in"
          />
          <CheckItem
            label="AI API Key"
            configured={hasAnyAiKey}
            hint="at least one required"
          />
          {hasAnyAiKey && !checks.aiKeys.anthropic && (
            <li className="ml-6 text-sm text-amber-700">
              Note: Default scenarios use Claude. You have {checks.aiKeys.openai ? 'OpenAI' : ''}{checks.aiKeys.openai && checks.aiKeys.googleAi ? ' and ' : ''}{checks.aiKeys.googleAi ? 'Google AI' : ''} configured.
            </li>
          )}
          <CheckItem
            label="Session Key"
            configured={checks.sessionKey}
            hint="needed for auth"
          />
        </ul>

        {warnings.length > 0 && (
          <div className="mt-4 p-3 bg-amber-100 rounded text-sm text-amber-800">
            <strong>Warnings:</strong>
            <ul className="mt-1 list-disc ml-4">
              {warnings.map((w, i) => (
                <li key={i}>{w.split('\n')[0]}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quick Start Guide */}
      {quickstartContent && (
        <details className="group">
          <summary className="px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors border-b border-amber-200 font-medium text-gray-700 flex items-center gap-2">
            <span className="text-gray-400 group-open:rotate-90 transition-transform">▶</span>
            Show Quick Start Guide
          </summary>
          <div className={`px-6 py-4 bg-white ${markdownClasses}`}>
            <Markdown>{quickstartContent}</Markdown>
          </div>
        </details>
      )}
    </div>
  );
}
