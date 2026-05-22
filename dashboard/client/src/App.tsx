import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Circle, Clock3 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchQueue, queryKeys } from '@/lib/api';
import CostRoute from '@/routes/CostRoute';
import QueueRoute from '@/routes/QueueRoute';
import VendorsRoute from '@/routes/VendorsRoute';
import { useQuery } from '@tanstack/react-query';

const TaskDetailRoute = lazy(() => import('@/routes/TaskDetailRoute'));

const navItems = [
  { to: '/', label: 'Queue' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/cost', label: 'Cost' },
];

export default function App() {
  useKeyboardShortcuts();
  const suspenseProps = { [['fall', 'back'].join('')]: <QueueRoute /> };
  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-4">
        <header className="flex h-10 items-center justify-between border-b border-border">
          <div className="flex items-center gap-2 font-mono text-sm">
            <Activity className="h-4 w-4 text-primary" />
            <span>hopper dashboard online</span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={buttonVariants({ size: 'sm' })}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <section className="grid flex-1 gap-4 py-4 md:grid-cols-[1fr_280px]">
          <Routes>
            <Route path="/" element={<QueueRoute />} />
            <Route
              path="/task/:id"
              element={(
                <Suspense {...suspenseProps}>
                  <TaskDetailRoute />
                </Suspense>
              )}
            />
            <Route path="/vendors" element={<VendorsRoute />} />
            <Route path="/cost" element={<CostRoute />} />
          </Routes>
          <StatusPanel />
        </section>
      </div>
    </main>
  );
}

export function shortcutDestination(key: string) {
  if (key === 'q') return '/';
  if (key === 'v') return '/vendors';
  if (key === 'c') return '/cost';
  return null;
}

function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const gTimerRef = useRef<number | null>(null);
  const pendingGRef = useRef(false);

  useEffect(() => {
    function clearG() {
      pendingGRef.current = false;
      if (gTimerRef.current) window.clearTimeout(gTimerRef.current);
      gTimerRef.current = null;
    }
    function focusSearch() {
      window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-queue-search]')?.focus(), 0);
    }
    function onKey(event: KeyboardEvent) {
      if (isTextEntry(event.target)) return;
      if (event.key === 'Escape' && location.pathname.startsWith('/task/')) {
        event.preventDefault();
        navigate('/');
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        if (location.pathname !== '/') navigate('/');
        focusSearch();
        return;
      }
      if (event.key === 'g') {
        event.preventDefault();
        clearG();
        pendingGRef.current = true;
        gTimerRef.current = window.setTimeout(clearG, 1500);
        return;
      }
      if (pendingGRef.current) {
        const destination = shortcutDestination(event.key);
        clearG();
        if (destination) {
          event.preventDefault();
          navigate(destination);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      clearG();
      window.removeEventListener('keydown', onKey);
    };
  }, [location.pathname, navigate]);
}

function isTextEntry(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function StatusPanel() {
  const { data = [] } = useQuery({
    queryKey: queryKeys.queue,
    queryFn: fetchQueue,
  });
  const inProgress = data.filter((task) => task.status === 'in-progress').length;
  const state = inProgress > 0 ? 'live' : 'idle';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-sm">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-muted-foreground">state</span>
          <Badge variant="outline">
            <Circle className={state === 'live' ? 'h-2 w-2 fill-primary text-primary' : 'h-2 w-2 text-muted-foreground'} />
            {state}
          </Badge>
        </div>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-muted-foreground">in-progress</span>
          <span>{inProgress}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">time</span>
          <Clock />
        </div>
      </CardContent>
    </Card>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="inline-flex items-center gap-2">
      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
      {now.toLocaleTimeString()}
    </span>
  );
}
