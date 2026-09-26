import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';

interface Evidence {
  id: string;
  kind: string;
  summary: string;
  collector: string;
  observed_at: string;
  data?: Record<string, unknown>;
}
interface Incident {
  id: string;
  title: string;
  description: string;
  service: string;
  severity: string;
  state: string;
  detected_at: string;
  updated_at: string;
  evidence: Evidence[];
  diagnosis: {
    summary: string;
    confidence: number;
    root_cause: string | null;
    hypotheses: { statement: string; confidence: number; refuted: boolean; evidence_ids: string[] }[];
  } | null;
  plan: {
    status: string;
    steps: { tool: string; reason: string; risk: string; expected: string; status: string }[];
  } | null;
  approvals: { decision?: string; reason: string; requested_at: string; decided_at?: string; decided_by?: string }[];
  verification: {
    status: string;
    attempts: number;
    checks: { name: string; target: string; passed: boolean | null; detail: string }[];
  } | null;
  timeline: { at: string; kind: string; message: string; actor: string; data?: Record<string, unknown> }[];
  actions: {
    at: string;
    action: string;
    actor: string;
    tool?: string;
    status: string;
    result?: Record<string, unknown>;
  }[];
}
interface Graph {
  affected_node: { id: string; name: string; kind: string } | null;
  dependencies: { id: string; name: string; kind: string }[];
  dependents: { id: string; name: string; kind: string }[];
  related_nodes: { id: string; name: string; kind: string }[];
  edges: { from: string; to: string; relation: string }[];
}
const API = '/api/v1/resolvex';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? `ResolveX request failed (${response.status})`);
  }
  return (body.data ?? body) as T;
}
function Badge({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={`rounded border border-${tone}-800 bg-${tone}-950/40 px-2 py-0.5 text-xs text-${tone}-300`}>
      {children}
    </span>
  );
}
function GraphView({ graph }: { graph: Graph }) {
  const nodes = [graph.affected_node, ...graph.dependencies, ...graph.dependents, ...graph.related_nodes].filter(
    (node, index, all): node is NonNullable<typeof node> =>
      !!node && all.findIndex(item => item?.id === node.id) === index,
  );
  return (
    <div className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3">
      <svg className="min-h-64 min-w-[720px]" viewBox="0 0 720 280" role="img" aria-label="Incident dependency graph">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#71717a" />
          </marker>
        </defs>
        {graph.edges.map(edge => {
          const from = nodes.find(node => node.id === edge.from);
          const to = nodes.find(node => node.id === edge.to);
          if (!from || !to) {
            return null;
          }
          const a = { x: 110 + nodes.indexOf(from) * 95, y: 110 };
          const b = { x: 110 + nodes.indexOf(to) * 95, y: 210 };
          return (
            <line
              key={`${edge.from}-${edge.to}-${edge.relation}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#52525b"
              markerEnd="url(#arrow)"
            />
          );
        })}
        {nodes.map((node, index) => (
          <g key={node.id}>
            <circle
              cx={110 + index * 95}
              cy={index === 0 ? 110 : 210}
              r="34"
              fill={index === 0 ? '#172554' : '#18181b'}
              stroke={index === 0 ? '#60a5fa' : '#52525b'}
            />
            <text
              x={110 + index * 95}
              y={(index === 0 ? 110 : 210) + 3}
              fill="#e4e4e7"
              textAnchor="middle"
              fontSize="10"
            >
              {node.name.slice(0, 14)}
            </text>
            <text
              x={110 + index * 95}
              y={(index === 0 ? 110 : 210) + 48}
              fill="#71717a"
              textAnchor="middle"
              fontSize="9"
            >
              {node.kind}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-2 text-xs text-zinc-500">
        Edges show relationships only; connectivity is not proof of root cause.
      </div>
    </div>
  );
}
function IncidentDetail() {
  const { id } = useParams();
  const [incident, setIncident] = useState<Incident>();
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    try {
      setError('');
      const [item, topology] = await Promise.all([
        request<Incident>(`/incidents/${id}`),
        request<Graph>(`/incidents/${id}/graph`),
      ]);
      setIncident(item);
      setGraph(topology);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load incident');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const action = async (name: string) => {
    if (!id) {
      return;
    }
    try {
      setBusy(true);
      await request(`/incidents/${id}/${name}`, { method: 'POST', body: '{}' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  if (error && !incident) {
    return <div className="p-8 text-red-300">{error}</div>;
  }
  if (!incident) {
    return <div className="p-8 text-zinc-400">Loading incident…</div>;
  }
  const approval = incident.approvals.at(-1);
  const canInvestigate = incident.state === 'detected' || incident.state === 'investigating';
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm text-blue-400" to="/incidents">
            ← Incidents
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{incident.title}</h1>
          <p className="text-sm text-zinc-500">
            {incident.id} · {incident.service}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge>{incident.state}</Badge>
          <Badge tone={incident.severity === 'critical' ? 'red' : 'amber'}>{incident.severity}</Badge>
        </div>
      </div>
      {error && <div className="rounded border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <div className="flex flex-wrap gap-2">
        {canInvestigate && (
          <button
            disabled={busy}
            onClick={() => void action('investigate')}
            className="rounded bg-blue-600 px-3 py-2 text-sm hover:bg-blue-500 disabled:opacity-50"
          >
            Investigate
          </button>
        )}
        {incident.state === 'approval_required' && (
          <>
            <button
              disabled={busy}
              onClick={() => void action('approve')}
              className="rounded bg-emerald-700 px-3 py-2 text-sm"
            >
              Approve remediation
            </button>
            <button
              disabled={busy}
              onClick={() => void action('reject')}
              className="rounded bg-red-800 px-3 py-2 text-sm"
            >
              Reject remediation
            </button>
          </>
        )}
        {incident.state === 'verifying' && (
          <button
            disabled={busy}
            onClick={() => void action('verify')}
            className="rounded bg-blue-700 px-3 py-2 text-sm"
          >
            Verify recovery
          </button>
        )}
        <button onClick={() => void load()} className="rounded border border-zinc-700 px-3 py-2 text-sm">
          Refresh
        </button>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <Info title="Description">{incident.description}</Info>
        <Info title="Detected">{new Date(incident.detected_at).toLocaleString()}</Info>
        <Info title="Updated">{new Date(incident.updated_at).toLocaleString()}</Info>
      </section>
      <Section title="Dependency graph">
        {graph ? <GraphView graph={graph} /> : <p className="text-zinc-500">No graph context available.</p>}
      </Section>
      <Section title="Evidence">
        <div className="grid gap-2 md:grid-cols-2">
          {incident.evidence.length ? (
            incident.evidence.map(item => (
              <div className="rounded border border-zinc-800 p-3" key={item.id}>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{item.kind}</span>
                  <span>{new Date(item.observed_at).toLocaleString()}</span>
                </div>
                <p className="mt-1">{item.summary}</p>
                <p className="text-xs text-zinc-500">collector: {item.collector}</p>
              </div>
            ))
          ) : (
            <p className="text-zinc-500">No evidence collected.</p>
          )}
        </div>
      </Section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Section title="Diagnosis">
          {incident.diagnosis ? (
            <>
              <p>{incident.diagnosis.summary}</p>
              <p className="mt-2 text-sm text-zinc-400">
                Confidence: {Math.round(incident.diagnosis.confidence * 100)}%
              </p>
              <p className="mt-2 text-sm text-zinc-400">Root cause: {incident.diagnosis.root_cause ?? 'Unconfirmed'}</p>
            </>
          ) : (
            <p className="text-zinc-500">Diagnosis not available.</p>
          )}
        </Section>
        <Section title="Remediation">
          {incident.plan ? (
            <>
              {incident.plan.steps.map(step => (
                <div className="space-y-1" key={step.tool}>
                  <p className="font-medium">
                    {step.tool} <Badge tone="amber">{step.risk}</Badge>
                  </p>
                  <p className="text-sm text-zinc-400">{step.reason}</p>
                  <p className="text-xs text-zinc-500">
                    Expected: {step.expected} · {step.status}
                  </p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-zinc-500">No remediation plan.</p>
          )}
          {approval && (
            <p className="mt-3 text-sm text-amber-300">
              Approval: {approval.decision ?? 'pending'} — {approval.reason}
            </p>
          )}
        </Section>
      </section>
      <Section title="Investigation hypotheses">
        <div className="space-y-2">
          {incident.diagnosis?.hypotheses?.length ? (
            incident.diagnosis.hypotheses.map(hypothesis => (
              <div className="rounded border border-zinc-800 p-3" key={hypothesis.statement}>
                <div className="font-medium">{hypothesis.statement}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {hypothesis.refuted ? 'rejected' : 'supported'} · confidence {Math.round(hypothesis.confidence * 100)}
                  % · evidence {hypothesis.evidence_ids.length}
                </div>
              </div>
            ))
          ) : (
            <p className="text-zinc-500">No hypotheses recorded.</p>
          )}
        </div>
      </Section>
      <Section title="Tool activity">
        <div className="space-y-2">
          {incident.actions.filter(item => item.tool).length ? (
            incident.actions
              .filter(item => item.tool)
              .map((item, index) => (
                <div className="rounded border border-zinc-800 p-3 text-sm" key={`${item.at}-${index}`}>
                  <div className="font-medium">{item.tool}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(item.at).toLocaleString()} · {item.status} · {item.actor}
                  </div>
                </div>
              ))
          ) : (
            <p className="text-zinc-500">No tool activity recorded.</p>
          )}
        </div>
      </Section>
      <Section title="Verification">
        {incident.verification ? (
          <p>
            {incident.verification.status} after {incident.verification.attempts} attempt(s).{' '}
            {incident.verification.checks.map(check => `${check.name}: ${check.detail}`).join(' ')}
          </p>
        ) : (
          <p className="text-zinc-500">Not verified.</p>
        )}
      </Section>
      <Section title="Timeline">
        <Timeline events={incident.timeline} />
      </Section>
      <Section title="Audit">
        <div className="space-y-2">
          {incident.actions.map((item, index) => (
            <div className="rounded border border-zinc-800 p-3 text-sm" key={`${item.at}-${index}`}>
              <span className="text-zinc-500">
                {new Date(item.at).toLocaleString()} · {item.actor}
              </span>
              <div>
                {item.action}
                {item.tool ? ` · ${item.tool}` : ''} · {item.status}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-300 uppercase">{title}</h2>
      {children}
    </section>
  );
}
function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-zinc-800 p-4">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
function Timeline({ events }: { events: Incident['timeline'] }) {
  return (
    <div className="space-y-3">
      {events.length ? (
        events.map((event, index) => (
          <div className="flex gap-3" key={`${event.at}-${index}`}>
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
            <div>
              <div className="text-sm">{event.message}</div>
              <div className="text-xs text-zinc-500">
                {new Date(event.at).toLocaleString()} · {event.kind} · {event.actor}
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-zinc-500">No timeline events.</p>
      )}
    </div>
  );
}
function IncidentList() {
  const [items, setItems] = useState<Incident[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await request<Incident[]>('/incidents'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load incidents');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      items.filter(
        item =>
          (!query || `${item.id} ${item.title} ${item.service}`.toLowerCase().includes(query.toLowerCase())) &&
          (state === 'all' || item.state === state),
      ),
    [items, query, state],
  );
  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Incidents</h1>
          <p className="text-sm text-zinc-500">ResolveX Incident Command Center</p>
        </div>
        <button onClick={() => void load()} className="rounded border border-zinc-700 px-3 py-2 text-sm">
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Search incidents"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        />
        <select
          value={state}
          onChange={event => {
            setState(event.target.value);
          }}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <option value="all">All states</option>
          {[
            'detected',
            'investigating',
            'diagnosed',
            'approval_required',
            'remediating',
            'verifying',
            'resolved',
            'failed',
            'cancelled',
          ].map(value => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {error && <div className="rounded border border-red-900 bg-red-950/30 p-3 text-red-300">{error}</div>}
      <div className="space-y-2">
        {filtered.map(item => (
          <Link className="block rounded border border-zinc-800 p-4 hover:border-zinc-600" to={item.id} key={item.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <b>{item.title}</b>
                <div className="text-sm text-zinc-500">
                  {item.id} · {item.service}
                </div>
              </div>
              <div className="flex gap-2">
                <Badge>{item.state}</Badge>
                <Badge tone="amber">{item.severity}</Badge>
              </div>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Updated {new Date(item.updated_at).toLocaleString()} · diagnosis{' '}
              {item.diagnosis ? 'available' : 'pending'} · verification {item.verification?.status ?? 'pending'}
            </div>
          </Link>
        ))}
        {!error && filtered.length === 0 && (
          <div className="rounded border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
            No incidents match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
export function IncidentsPage() {
  return (
    <Routes>
      <Route path="/:id" element={<IncidentDetail />} />
      <Route path="*" element={<IncidentList />} />
    </Routes>
  );
}
export { IncidentDetail };
