import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';

interface Challenge {
  id: string;
  title: string;
  type: string;
  difficulty: number;
  activeFrom: string;
  activeUntil: string;
}

const TYPE_COLORS: Record<string, string> = {
  BLOCK_BREAK: 'bg-orange-200 text-orange-800',
  KILL_MOB: 'bg-red-200 text-red-800',
  CRAFT_ITEM: 'bg-green-200 text-green-800',
  TRAVEL: 'bg-blue-200 text-blue-800',
  CUSTOM: 'bg-gray-200 text-gray-700',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function challengesForDay(challenges: Challenge[], day: Date): Challenge[] {
  const ts = startOfDay(day).getTime();
  const nextDay = ts + 86_400_000;
  return challenges.filter((c) => {
    const from = new Date(c.activeFrom).getTime();
    const until = new Date(c.activeUntil).getTime();
    return from < nextDay && until > ts;
  });
}

export function ChallengesCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [popover, setPopover] = useState<{ challenge: Challenge; x: number; y: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['challenges-all'],
    queryFn: () => api.get('/challenges', { params: { limit: 100, status: 'all' } }).then((r) => r.data.data as Challenge[]),
  });

  const challenges: Challenge[] = data ?? [];

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const today = startOfDay(now).getTime();

  return (
    <div onClick={() => setPopover(null)}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Challenge Calendar</h1>
        <Link to="/challenges" className="text-sm px-4 py-2 border rounded hover:bg-gray-50 text-gray-700">
          ← List
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <button onClick={prevMonth} className="px-3 py-1 border rounded hover:bg-gray-50 text-sm">‹</button>
          <span className="font-semibold text-gray-800">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="px-3 py-1 border rounded hover:bg-gray-50 text-sm">›</button>
        </div>

        <div className="p-3">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-gray-400">Loading…</div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-xs text-center text-gray-400 font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {Array.from({ length: rows * 7 }, (_, i) => {
                  const dayNum = i - startOffset + 1;
                  if (dayNum < 1 || dayNum > lastDay.getDate()) {
                    return <div key={i} className="bg-gray-50 min-h-[80px]" />;
                  }
                  const day = new Date(year, month, dayNum);
                  const dayChallenges = challengesForDay(challenges, day);
                  const hardCount = dayChallenges.filter((c) => (c.difficulty ?? 1) >= 4).length;
                  const isConflict = hardCount >= 3;
                  const isToday = startOfDay(day).getTime() === today;

                  return (
                    <div
                      key={i}
                      className={`bg-white min-h-[80px] p-1 ${isConflict ? 'bg-orange-50' : ''}`}
                    >
                      <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-blue-600 text-white' : 'text-gray-600'}
                        ${isConflict ? 'text-orange-700' : ''}`}>
                        {dayNum}
                      </div>
                      {isConflict && (
                        <div className="text-xs text-orange-600 font-medium mb-0.5">⚠ {hardCount} hard</div>
                      )}
                      <div className="space-y-0.5">
                        {dayChallenges.slice(0, 3).map((c) => (
                          <button
                            key={c.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              setPopover({ challenge: c, x: rect.left, y: rect.bottom + 4 });
                            }}
                            className={`w-full text-left text-xs px-1 py-0.5 rounded truncate ${TYPE_COLORS[c.type] ?? 'bg-gray-100'}`}
                            title={c.title}
                          >
                            {c.title}
                          </button>
                        ))}
                        {dayChallenges.length > 3 && (
                          <div className="text-xs text-gray-400">+{dayChallenges.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t text-xs text-gray-500">
                {Object.entries(TYPE_COLORS).map(([type, cls]) => (
                  <span key={type} className={`px-2 py-0.5 rounded ${cls}`}>{type.replace('_', ' ')}</span>
                ))}
                <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                  ⚠ 3+ hard challenges (difficulty ≥ 4)
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {popover && (
        <div
          className="fixed z-50 bg-white border rounded shadow-lg p-3 text-sm w-64"
          style={{ top: popover.y, left: Math.min(popover.x, window.innerWidth - 280) }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-semibold text-gray-800 mb-1">{popover.challenge.title}</p>
          <p className="text-gray-500 text-xs mb-1">
            {popover.challenge.type.replace('_', ' ')} · {'★'.repeat(popover.challenge.difficulty ?? 1)}
          </p>
          <p className="text-gray-400 text-xs">
            {new Date(popover.challenge.activeFrom).toLocaleDateString()} – {new Date(popover.challenge.activeUntil).toLocaleDateString()}
          </p>
          <Link
            to={`/challenges/${popover.challenge.id}`}
            className="mt-2 inline-block text-blue-600 hover:underline text-xs"
          >
            View details →
          </Link>
        </div>
      )}
    </div>
  );
}
