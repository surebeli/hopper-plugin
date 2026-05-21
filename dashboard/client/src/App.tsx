import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Activity, Circle, Clock3 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CostRoute from '@/routes/CostRoute';
import QueueRoute from '@/routes/QueueRoute';
import VendorsRoute from '@/routes/VendorsRoute';

const navItems = [
  { to: '/', label: 'Queue' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/cost', label: 'Cost' },
];

export default function App() {
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
            <Route path="/task/:id" element={<QueueRoute />} />
            <Route path="/vendors" element={<VendorsRoute />} />
            <Route path="/cost" element={<CostRoute />} />
          </Routes>
          <StatusPanel />
        </section>
      </div>
    </main>
  );
}

function StatusPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-sm">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-muted-foreground">state</span>
          <Badge variant="outline">
            <Circle className="h-2 w-2 fill-primary text-primary" />
            live
          </Badge>
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
