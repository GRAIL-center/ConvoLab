import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../api/trpc';

export function ScenarioList() {
  const trpc = useTRPC();
  const { data: scenarios, isLoading } = useQuery(trpc.scenario.list.queryOptions());

  if (isLoading) {
    return <p className="text-gray-500">Loading scenarios...</p>;
  }

  if (!scenarios?.length) {
    return <p className="text-gray-500">No scenarios available.</p>;
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {scenarios.map((scenario) => (
        <div
          key={scenario.id}
          className="rounded-lg bg-white p-6 shadow hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold text-gray-900">{scenario.name}</h2>
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">{scenario.description}</p>
          <div className="mt-4 rounded bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">You'll talk with:</p>
            <p className="text-sm text-gray-700">{scenario.partnerPersona}</p>
          </div>
          <button
            type="button"
            disabled
            className="mt-4 w-full rounded bg-gray-200 px-4 py-2 text-sm text-gray-500 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>
      ))}
    </div>
  );
}
