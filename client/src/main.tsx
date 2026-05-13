import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';

import { ProtectedRoute } from './components/ProtectedRoute.js';
import { Layout } from './components/Layout.js';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { Players } from './pages/Players.js';
import { PlayerDetail } from './pages/PlayerDetail.js';
import { Challenges } from './pages/Challenges.js';
import { ChallengeDetail } from './pages/ChallengeDetail.js';
import { Rewards } from './pages/Rewards.js';
import { RewardDetail } from './pages/RewardDetail.js';
import { Events } from './pages/Events.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/players" element={<Players />} />
              <Route path="/players/:id" element={<PlayerDetail />} />
              <Route path="/challenges" element={<Challenges />} />
              <Route path="/challenges/:id" element={<ChallengeDetail />} />
              <Route path="/rewards" element={<Rewards />} />
              <Route path="/rewards/:id" element={<RewardDetail />} />
              <Route path="/events" element={<Events />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
