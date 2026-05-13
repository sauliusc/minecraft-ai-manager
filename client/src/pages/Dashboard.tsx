import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    refetchInterval: 5000,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">API Status</p>
          <p className="text-xl font-bold text-green-600">{data?.status ?? '…'}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Challenges</p>
          <p className="text-xl font-bold text-gray-400">—</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Rewards granted today</p>
          <p className="text-xl font-bold text-gray-400">—</p>
        </div>
      </div>
    </div>
  );
}
