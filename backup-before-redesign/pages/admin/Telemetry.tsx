import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTRPC } from '../../api/trpc';

type DateRange = '7d' | '30d' | '90d' | 'custom';

function getDateRange(range: DateRange): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (range) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return { startDate, endDate };
}

function useDateRange(range: DateRange) {
  return useMemo(() => getDateRange(range), [range]);
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

export function Telemetry() {
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [eventType, setEventType] = useState<string>('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const { startDate, endDate } = useDateRange(dateRange);
  const trpc = useTRPC();

  const { data: eventTypes } = useQuery(trpc.telemetry.eventTypes.queryOptions());

  const { data: summary, isLoading: loadingSummary } = useQuery(
    trpc.telemetry.summary.queryOptions({ startDate, endDate })
  );

  const { data: eventsData, isLoading: loadingEvents } = useQuery(
    trpc.telemetry.list.queryOptions({
      startDate,
      endDate,
      eventType: eventType || undefined,
      limit: 50,
    })
  );

  const { data: topScenarios } = useQuery(
    trpc.telemetry.topScenarios.queryOptions({ startDate, endDate, limit: 5 })
  );

  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Telemetry Dashboard</h2>
        <p className="text-sm text-gray-500">Event tracking and analytics</p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <div>
          <label htmlFor="date-range" className="block text-xs text-gray-500 mb-1">
            Date Range
          </label>
          <select
            id="date-range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="rounded border-gray-300 text-sm px-3 py-1.5"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
        <div>
          <label htmlFor="event-type" className="block text-xs text-gray-500 mb-1">
            Event Type
          </label>
          <select
            id="event-type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded border-gray-300 text-sm px-3 py-1.5"
          >
            <option value="">All events</option>
            {eventTypes?.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Events"
          value={loadingSummary ? '...' : formatNumber(summary?.totalEvents ?? 0)}
        />
        <MetricCard
          label="Conversations"
          value={loadingSummary ? '...' : `${summary?.conversationsStarted ?? 0}`}
          subtext={
            summary && summary.conversationsStarted > 0
              ? `${Math.round(summary.completionRate * 100)}% completed`
              : undefined
          }
        />
        <MetricCard
          label="Avg Duration"
          value={loadingSummary ? '...' : formatDuration(summary?.avgDurationMs ?? 0)}
        />
        <MetricCard
          label="Tokens Used"
          value={loadingSummary ? '...' : formatNumber(summary?.totalTokens ?? 0)}
        />
      </div>

      {/* Top Scenarios */}
      {topScenarios && topScenarios.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Top Scenarios</h3>
          <div className="flex flex-wrap gap-2">
            {topScenarios.map((s) => (
              <span
                key={s.scenario}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700"
              >
                {s.scenario}: {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Events Table */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Events</h3>
        {loadingEvents ? (
          <p className="text-sm text-gray-500">Loading events...</p>
        ) : !eventsData?.events.length ? (
          <p className="text-sm text-gray-500">No events found in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Event
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Properties
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {eventsData.events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        {event.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {event.user ? (
                        <span className="flex items-center gap-1">
                          {event.user.avatarUrl && (
                            <img
                              src={event.user.avatarUrl}
                              alt=""
                              className="w-4 h-4 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          {event.user.name || event.user.id.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-gray-400">Anonymous</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEventId(expandedEventId === event.id ? null : event.id)
                        }
                        className="text-indigo-600 hover:text-indigo-800"
                      >
                        {expandedEventId === event.id ? 'Hide' : 'Show'}
                      </button>
                      {expandedEventId === event.id && (
                        <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-w-md">
                          {JSON.stringify(event.properties, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
