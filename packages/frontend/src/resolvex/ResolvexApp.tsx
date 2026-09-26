/** ResolveX owns a sibling router so incident routes do not conflict with the chat shell. */
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { IncidentDetail, IncidentsPage } from './pages/IncidentsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

interface ResolveXRoute {
  path: string;
  title: string;
  detail: string;
}

/** Single source of truth for the command-center navigation and routes. */
export const RESOLVEX_ROUTES: ResolveXRoute[] = [
  { path: '/', title: 'Dashboard', detail: 'Fleet health, open incidents and verification status. Phase 12.' },
  { path: '/incidents', title: 'Incidents', detail: 'Live incident list.' },
  {
    path: '/investigation',
    title: 'Investigation',
    detail: 'Evidence collection, hypotheses and root-cause reasoning. Phase 5.',
  },
  { path: '/remediation', title: 'Remediation', detail: 'Plans, risk classification and human approval. Phase 7.' },
  { path: '/services', title: 'Services', detail: 'Service inventory reported by integrations. Phase 4.' },
  { path: '/tools', title: 'Tools', detail: 'Registered DevOps tools and their availability. Phase 6.' },
  { path: '/audit', title: 'Audit', detail: 'Append-only record of every autonomous action. Phase 11.' },
  { path: '/settings', title: 'Settings', detail: 'ResolveX configuration and approval policy. Phase 12.' },
];

export function ResolvexApp({ basename }: { basename: string }) {
  return (
    <div className="app-root">
      <BrowserRouter basename={basename}>
        <div className="flex h-full bg-zinc-950 text-zinc-100">
          <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-800/80 px-3 py-4">
            <div className="px-2 pb-3 text-xs font-semibold tracking-widest text-zinc-500 uppercase">ResolveX</div>
            {RESOLVEX_ROUTES.map(route => (
              <NavLink
                key={route.path}
                to={route.path}
                end={route.path === '/'}
                className={({ isActive }) =>
                  `rounded px-2 py-1.5 text-sm transition-colors ${
                    isActive ? 'bg-zinc-900 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200'
                  }`
                }
              >
                {route.title}
              </NavLink>
            ))}
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Routes>
              {RESOLVEX_ROUTES.map(route => (
                <Route
                  key={route.path}
                  path={route.path}
                  element={
                    route.path === '/incidents' ? (
                      <IncidentsPage />
                    ) : (
                      <PlaceholderPage title={route.title} detail={route.detail} />
                    )
                  }
                />
              ))}
              <Route path="/incidents/:incidentId" element={<IncidentDetail />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </div>
  );
}
