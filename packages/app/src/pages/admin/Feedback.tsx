import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../../api/trpc';

function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((v) => (
        <svg
          key={v}
          viewBox="0 0 24 24"
          fill={v <= rating ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          className={`${dim} ${v <= rating ? 'text-[rgba(245,180,55,1)]' : 'text-gray-300'}`}
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function MetricCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
  );
}

export function Feedback() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const trpc = useTRPC();

  const { data: stats } = useQuery(trpc.feedback.stats.queryOptions());
  const { data, isLoading, isFetching } = useQuery(
    trpc.feedback.list.queryOptions({ cursor, limit: 50 })
  );

  const maxBar = stats ? Math.max(1, ...Object.values(stats.distribution)) : 1;

  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Feedback</h2>
        <p className="text-sm text-gray-500">User-submitted ratings and comments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Total Responses" value={stats ? stats.total.toString() : '...'} />
        <MetricCard
          label="Average Rating"
          value={stats ? stats.average.toFixed(2) : '...'}
          subtext="out of 5"
        />
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Distribution</p>
          {stats ? (
            <div className="space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.distribution[star as 1 | 2 | 3 | 4 | 5];
                const pct = (count / maxBar) * 100;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-gray-500">{star}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-[rgba(245,180,55,0.85)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-gray-500">{count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">...</p>
          )}
        </div>
      </div>

      {/* Feedback list */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Feedback</h3>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading feedback...</p>
        ) : !data?.items.length ? (
          <p className="text-sm text-gray-500">No feedback submitted yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Rating
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Comment
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StarRow rating={item.rating} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {item.user ? (
                        <span className="flex items-center gap-2">
                          {item.user.avatarUrl && (
                            <img
                              src={item.user.avatarUrl}
                              alt=""
                              className="w-5 h-5 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <span>
                            {item.user.name || item.user.id.slice(0, 8)}
                            <span className="ml-1 text-gray-400">({item.user.role})</span>
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Anonymous</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-xl">
                      {item.comment ? (
                        <p className="whitespace-pre-wrap">{item.comment}</p>
                      ) : (
                        <span className="text-gray-400 italic">No comment</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.nextCursor && (
              <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setCursor(data.nextCursor)}
                  disabled={isFetching}
                  className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-50"
                >
                  {isFetching ? 'Loading...' : 'Load more...'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
