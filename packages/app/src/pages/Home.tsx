import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../api/trpc';
import { ScenarioList } from '../components/ScenarioList';
import { YourSessions } from '../components/YourSessions';

export function Home() {
  const trpc = useTRPC();
  const { data: authData } = useQuery(trpc.auth.me.queryOptions());

  const isStaffOrAdmin = authData?.user?.role === 'STAFF' || authData?.user?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      <YourSessions />
      {isStaffOrAdmin && (
        <>
          <h2 className="mb-6 text-lg font-medium text-gray-900">Start a new conversation</h2>
          <ScenarioList />
        </>
      )}
    </div>
  );
}
