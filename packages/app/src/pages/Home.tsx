import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../api/trpc';
import { AdminPanel } from '../components/AdminPanel';
import { ScenarioList } from '../components/ScenarioList';

export function Home() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.auth.me.queryOptions());
  const isAdmin = data?.user?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      {isAdmin && <AdminPanel />}
      <h2 className="text-lg font-medium text-gray-900 mb-6">
        Select a scenario to begin practicing
      </h2>
      <ScenarioList />
    </div>
  );
}
