import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { Layout } from './components/Layout.js';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { Players } from './pages/Players.js';
import { PlayerDetail } from './pages/PlayerDetail.js';
import { Challenges } from './pages/Challenges.js';
import { ChallengeDetail } from './pages/ChallengeDetail.js';
import { ChallengesCalendar } from './pages/ChallengesCalendar.js';
import { Rewards } from './pages/Rewards.js';
import { RewardDetail } from './pages/RewardDetail.js';
import { Events } from './pages/Events.js';
import { EventDetail } from './pages/EventDetail.js';
import { Moderation } from './pages/Moderation.js';
import { Analytics } from './pages/Analytics.js';
import { Broadcast } from './pages/Broadcast.js';
import { Npcs } from './pages/Npcs.js';
import { Cosmetics } from './pages/Cosmetics.js';
import { Clans } from './pages/Clans.js';
import { MinecraftServer } from './pages/MinecraftServer.js';
import { AiConfig } from './pages/AiConfig.js';
import { NotFound } from './pages/NotFound.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
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
                <Route path="/challenges/calendar" element={<ChallengesCalendar />} />
                <Route path="/challenges/:id" element={<ChallengeDetail />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/rewards/:id" element={<RewardDetail />} />
                <Route path="/events" element={<Events />} />
                <Route path="/events/:id" element={<EventDetail />} />
                <Route path="/moderation" element={<Moderation />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/broadcast" element={<Broadcast />} />
                <Route path="/npcs" element={<Npcs />} />
                <Route path="/cosmetics" element={<Cosmetics />} />
                <Route path="/clans" element={<Clans />} />
                <Route path="/server" element={<MinecraftServer />} />
                <Route path="/ai" element={<AiConfig />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
