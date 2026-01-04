import { ScenarioList } from '../components/ScenarioList';
import { YourSessions } from '../components/YourSessions';

export function Home() {
  return (
    <div className="mx-auto max-w-7xl py-6 px-4 sm:px-6 lg:px-8">
      <YourSessions />
      <h2 className="mb-6 text-lg font-medium text-gray-900">
        Select a scenario to begin practicing
      </h2>
      <ScenarioList />
    </div>
  );
}
