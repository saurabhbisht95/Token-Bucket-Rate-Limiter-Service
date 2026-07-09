import { useEffect, useMemo, useState } from 'react';

import { Brand } from '../components/Brand.jsx';
import { EmptyState, Eyebrow, MetricCard, StatusBadge, Toast } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatDate, formatNumber, slugify } from '../lib/format.js';

const initialStats = {
  clientKey: null,
  allowed: 0,
  denied: 0,
  tokenBucketAllowed: 0,
  tokenBucketDenied: 0,
  slidingWindowAllowed: 0,
  slidingWindowDenied: 0
};

function publicError(err) {
  return err?.message || 'Something went wrong';
}

export function CompanyConsole() {
  const [authMode, setAuthMode] = useState('login');
  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetails, setProjectDetails] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedStats, setSelectedStats] = useState(initialStats);
  const [latestRuntimeKey, setLatestRuntimeKey] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const projects = useMemo(
    () => summary?.projects?.map((item) => item.project) || [],
    [summary]
  );

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 3600);
  }

  async function loadStats(projectId, clientKey) {
    if (!projectId || !clientKey) {
      setSelectedStats(initialStats);
      return;
    }

    const { stats } = await api(
      `/v1/dashboard/projects/${projectId}/clients/${encodeURIComponent(clientKey)}/stats`
    );

    setSelectedStats(stats);
  }

  async function loadSelectedProject(projectId, preferredClientKey) {
    if (!projectId) {
      setProjectDetails(null);
      setSelectedStats(initialStats);
      return;
    }

    const details = await api(`/v1/dashboard/projects/${projectId}`);
    setProjectDetails(details);

    const preferredClient =
      details.clients.find((client) => client.clientKey === preferredClientKey) ||
      details.clients[0];

    if (preferredClient) {
      await loadStats(projectId, preferredClient.clientKey);
    } else {
      setSelectedStats(initialStats);
    }
  }

  async function loadDashboard(nextProjectId = selectedProjectId, preferredClientKey) {
    const [data, audit] = await Promise.all([
      api('/v1/dashboard/summary'),
      api('/v1/dashboard/audit-logs')
    ]);
    const nextProjects = data.projects.map((item) => item.project);
    const validSelectedProject = nextProjects.some((project) => project.id === nextProjectId);
    const projectId = validSelectedProject ? nextProjectId : nextProjects[0]?.id || null;

    setSummary(data);
    setAuditLogs(audit.logs || []);
    setSession({
      company: data.company,
      admin: data.admin
    });
    setSelectedProjectId(projectId);
    await loadSelectedProject(projectId, preferredClientKey);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const currentSession = await api('/v1/auth/me');
        if (cancelled) return;
        setSession(currentSession);
        await loadDashboard();
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const currentSession = await api('/v1/auth/login', {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password')
        }
      });
      setSession(currentSession);
      await loadDashboard();
      notify('Signed in');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const currentSession = await api('/v1/auth/signup', {
        method: 'POST',
        body: {
          companyName: form.get('companyName'),
          adminName: form.get('adminName'),
          email: form.get('email'),
          password: form.get('password')
        }
      });
      event.currentTarget.reset();
      setSession(currentSession);
      await loadDashboard();
      notify('Account created');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await api('/v1/auth/logout', { method: 'POST' }).catch(() => {});
    setSession(null);
    setSummary(null);
    setSelectedProjectId(null);
    setProjectDetails(null);
    setSelectedStats(initialStats);
  }

  async function handleProjectCreate(event) {
    event.preventDefault();
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const result = await api('/v1/dashboard/projects', {
        method: 'POST',
        body: {
          name: form.get('name'),
          slug: form.get('slug')
        }
      });
      event.currentTarget.reset();
      await loadDashboard(result.project.id);
      notify('Project created');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRuntimeKeyCreate(event) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const result = await api(`/v1/dashboard/projects/${selectedProjectId}/runtime-keys`, {
        method: 'POST',
        body: {
          name: form.get('name')
        }
      });
      event.currentTarget.reset();
      setLatestRuntimeKey(result.apiKey);
      await loadDashboard(selectedProjectId, selectedStats.clientKey);
      notify('Runtime key generated');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRuntimeKeyRevoke(id) {
    if (!selectedProjectId) return;
    setBusy(true);

    try {
      await api(`/v1/dashboard/projects/${selectedProjectId}/runtime-keys/${id}/revoke`, {
        method: 'POST'
      });
      await loadDashboard(selectedProjectId, selectedStats.clientKey);
      notify('Runtime key revoked');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClientSave(event) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const clientKey = String(form.get('clientKey')).trim();

      await api(`/v1/dashboard/projects/${selectedProjectId}/clients`, {
        method: 'POST',
        body: {
          clientKey,
          algorithm: form.get('algorithm'),
          requestsPerSecond: Number(form.get('requestsPerSecond')),
          burstSize: Number(form.get('burstSize')),
          windowSeconds: Number(form.get('windowSeconds')),
          isActive: form.get('isActive') === 'on'
        }
      });
      await loadDashboard(selectedProjectId, clientKey);
      notify('Limit saved');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClientToggle(client) {
    if (!selectedProjectId) return;
    setBusy(true);

    try {
      await api(
        `/v1/dashboard/projects/${selectedProjectId}/clients/${encodeURIComponent(client.clientKey)}`,
        {
          method: 'PATCH',
          body: {
            isActive: !client.isActive
          }
        }
      );
      await loadDashboard(selectedProjectId, client.clientKey);
      notify('Client status updated');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  function fillClientForm(client) {
    const form = document.querySelector('#clientForm');
    if (!form || !client) return;

    form.elements.clientKey.value = client.clientKey;
    form.elements.algorithm.value = client.algorithm;
    form.elements.requestsPerSecond.value = client.requestsPerSecond;
    form.elements.burstSize.value = client.burstSize;
    form.elements.windowSeconds.value = client.windowSeconds;
    form.elements.isActive.checked = client.isActive;
    form.elements.clientKey.focus();
  }

  async function handleProjectNameInput(event) {
    const form = event.currentTarget.form;
    const slugInput = form.elements.slug;

    if (slugInput.dataset.edited === 'true') return;
    slugInput.value = slugify(event.currentTarget.value);
  }

  if (loading) {
    return (
      <>
        <Topbar session={session} onLogout={handleLogout} />
        <main>
          <EmptyState eyebrow="Loading" title="Opening dashboard." />
        </main>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <Topbar />
        <main>
          <section className="auth-shell">
            <div className="auth-copy">
              <Eyebrow>SaaS console</Eyebrow>
              <h1>Company-owned rate limits, runtime keys, and audit history.</h1>
              <p>
                Create an account, add projects, issue runtime keys, and let customer backends call the limiter with isolated project credentials.
              </p>
            </div>

            <div className="auth-panel">
              <div className="tabs" role="tablist" aria-label="Auth mode">
                <button
                  className={`tab ${authMode === 'login' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'login'}
                  onClick={() => setAuthMode('login')}
                >
                  Log in
                </button>
                <button
                  className={`tab ${authMode === 'signup' ? 'is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'signup'}
                  onClick={() => setAuthMode('signup')}
                >
                  Sign up
                </button>
              </div>

              {authMode === 'login' ? (
                <form className="stack" onSubmit={handleLogin}>
                  <label>
                    Email
                    <input name="email" type="email" autoComplete="email" required />
                  </label>
                  <label>
                    Password
                    <input name="password" type="password" autoComplete="current-password" required />
                  </label>
                  <button className="button button-primary" type="submit" disabled={busy}>
                    Log in
                  </button>
                </form>
              ) : (
                <form className="stack" onSubmit={handleSignup}>
                  <label>
                    Company
                    <input name="companyName" type="text" autoComplete="organization" required minLength="2" />
                  </label>
                  <label>
                    Admin name
                    <input name="adminName" type="text" autoComplete="name" required minLength="2" />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" autoComplete="email" required />
                  </label>
                  <label>
                    Password
                    <input name="password" type="password" autoComplete="new-password" required minLength="12" />
                  </label>
                  <button className="button button-primary" type="submit" disabled={busy}>
                    Create account
                  </button>
                </form>
              )}
            </div>
          </section>
        </main>
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <Topbar session={session} onLogout={handleLogout} />
      <main>
        <section className="dashboard">
          <section className="summary-band" aria-label="Account metrics">
            <MetricCard label="Projects" value={formatNumber(summary?.metrics?.projects)} />
            <MetricCard label="Active limits" value={formatNumber(summary?.metrics?.activeClients)} />
            <MetricCard label="Runtime keys" value={formatNumber(summary?.metrics?.activeRuntimeKeys)} />
            <MetricCard label="Admin" value={summary?.admin?.name || '-'} />
          </section>

          <section className="workspace">
            <aside className="project-rail">
              <div className="section-head">
                <div>
                  <Eyebrow>Projects</Eyebrow>
                  <h2>Workspaces</h2>
                </div>
              </div>

              <form className="compact-form" onSubmit={handleProjectCreate}>
                <label>
                  Name
                  <input name="name" type="text" required minLength="2" placeholder="Payments API" onInput={handleProjectNameInput} />
                </label>
                <label>
                  Slug
                  <input
                    name="slug"
                    type="text"
                    required
                    minLength="2"
                    pattern="[a-z0-9-]+"
                    placeholder="payments-api"
                    onInput={(event) => {
                      event.currentTarget.dataset.edited = 'true';
                      event.currentTarget.value = slugify(event.currentTarget.value);
                    }}
                  />
                </label>
                <button className="button button-primary" type="submit" disabled={busy}>
                  Add project
                </button>
              </form>

              <div className="project-list">
                {projects.length === 0 ? (
                  <p className="muted">No projects yet.</p>
                ) : (
                  projects.map((project) => (
                    <button
                      className={`project-item ${project.id === selectedProjectId ? 'is-active' : ''}`}
                      type="button"
                      key={project.id}
                      onClick={async () => {
                        setSelectedProjectId(project.id);
                        await loadSelectedProject(project.id);
                      }}
                    >
                      <strong>{project.name}</strong>
                      <span>{project.slug}</span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="console">
              {!projectDetails ? (
                <EmptyState eyebrow="No project selected" title="Create or select a project." />
              ) : (
                <ProjectConsole
                  busy={busy}
                  details={projectDetails}
                  latestRuntimeKey={latestRuntimeKey}
                  auditLogs={auditLogs}
                  selectedStats={selectedStats}
                  onRuntimeKeyCreate={handleRuntimeKeyCreate}
                  onRuntimeKeyRevoke={handleRuntimeKeyRevoke}
                  onClientSave={handleClientSave}
                  onClientToggle={handleClientToggle}
                  onClientEdit={fillClientForm}
                  onClientStats={(clientKey) => loadStats(selectedProjectId, clientKey)}
                  onCopyKey={async () => {
                    if (!latestRuntimeKey) return;
                    await navigator.clipboard.writeText(latestRuntimeKey);
                    notify('Runtime key copied');
                  }}
                />
              )}
            </section>
          </section>
        </section>
      </main>
      <Toast message={toast} />
    </>
  );
}

function Topbar({ session, onLogout }) {
  return (
    <header className="topbar">
      <Brand />
      {session ? (
        <div className="session-strip">
          <a className="button button-ghost" href="/superadmin">
            Superadmin
          </a>
          <span className="session-company">{session.company?.name}</span>
          <button className="button button-ghost" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}

function ProjectConsole({
  busy,
  details,
  latestRuntimeKey,
  auditLogs,
  selectedStats,
  onRuntimeKeyCreate,
  onRuntimeKeyRevoke,
  onClientSave,
  onClientToggle,
  onClientEdit,
  onClientStats,
  onCopyKey
}) {
  const { project, runtimeKeys, clients } = details;
  const tokenTotal = selectedStats.tokenBucketAllowed + selectedStats.tokenBucketDenied;
  const slidingTotal = selectedStats.slidingWindowAllowed + selectedStats.slidingWindowDenied;

  return (
    <>
      <div className="console-head">
        <div>
          <Eyebrow>Selected project</Eyebrow>
          <h2>{project.name}</h2>
          <p className="muted">{project.slug}</p>
        </div>
        <div className="endpoint-pill">POST /v1/limit/check-authenticated</div>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-head">
            <div>
              <Eyebrow>Runtime keys</Eyebrow>
              <h3>Backend access</h3>
            </div>
          </div>

          <form className="inline-form" onSubmit={onRuntimeKeyCreate}>
            <label>
              Key name
              <input name="name" type="text" required minLength="2" placeholder="Production backend" />
            </label>
            <button className="button button-secondary" type="submit" disabled={busy}>
              Generate
            </button>
          </form>

          {latestRuntimeKey ? (
            <div className="secret-box">
              <span>One-time key</span>
              <code>{latestRuntimeKey}</code>
              <button className="button button-ghost" type="button" onClick={onCopyKey}>
                Copy
              </button>
            </div>
          ) : null}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Prefix</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runtimeKeys.length === 0 ? (
                  <tr>
                    <td colSpan="4">No runtime keys yet.</td>
                  </tr>
                ) : (
                  runtimeKeys.map((key) => (
                    <tr key={key.id}>
                      <td>{key.name}</td>
                      <td>
                        <code>{key.keyPrefix}</code>
                      </td>
                      <td>
                        <StatusBadge active={key.isActive} />
                      </td>
                      <td className="row-actions">
                        {key.isActive ? (
                          <button
                            className="button button-ghost button-danger"
                            type="button"
                            disabled={busy}
                            onClick={() => onRuntimeKeyRevoke(key.id)}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <Eyebrow>Usage today</Eyebrow>
              <h3>{selectedStats.clientKey || 'No client selected'}</h3>
            </div>
          </div>
          <div className="stats-grid">
            <MetricCard label="Allowed" value={formatNumber(selectedStats.allowed)} />
            <MetricCard label="Denied" value={formatNumber(selectedStats.denied)} />
            <MetricCard label="Token bucket" value={formatNumber(tokenTotal)} />
            <MetricCard label="Sliding window" value={formatNumber(slidingTotal)} />
          </div>
        </section>
      </div>

      <section className="panel limits-panel">
        <div className="section-head">
          <div>
            <Eyebrow>Limits</Eyebrow>
            <h3>Client configs</h3>
          </div>
        </div>

        <form className="limits-form" id="clientForm" onSubmit={onClientSave}>
          <label>
            Client key
            <input name="clientKey" type="text" required placeholder="login-api" />
          </label>
          <label>
            Algorithm
            <select name="algorithm" required defaultValue="TOKEN_BUCKET">
              <option value="TOKEN_BUCKET">Token bucket</option>
              <option value="SLIDING_WINDOW">Sliding window</option>
            </select>
          </label>
          <label>
            RPS
            <input name="requestsPerSecond" type="number" min="0.0001" step="0.0001" required defaultValue="10" />
          </label>
          <label>
            Burst
            <input name="burstSize" type="number" min="1" step="1" required defaultValue="20" />
          </label>
          <label>
            Window
            <input name="windowSeconds" type="number" min="1" step="1" required defaultValue="60" />
          </label>
          <label className="toggle-row">
            <input name="isActive" type="checkbox" defaultChecked />
            Active
          </label>
          <button className="button button-primary" type="submit" disabled={busy}>
            Save limit
          </button>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Algorithm</th>
                <th>RPS</th>
                <th>Burst</th>
                <th>Window</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan="7">No client configs yet.</td>
                </tr>
              ) : (
                clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <code>{client.clientKey}</code>
                    </td>
                    <td>{client.algorithm === 'TOKEN_BUCKET' ? 'Token bucket' : 'Sliding window'}</td>
                    <td>{client.requestsPerSecond}</td>
                    <td>{client.burstSize}</td>
                    <td>{client.windowSeconds}s</td>
                    <td>
                      <StatusBadge active={client.isActive} />
                    </td>
                    <td className="row-actions">
                      <button className="button button-ghost" type="button" onClick={() => onClientStats(client.clientKey)}>
                        Stats
                      </button>
                      <button className="button button-ghost" type="button" onClick={() => onClientEdit(client)}>
                        Edit
                      </button>
                      <button className="button button-ghost" type="button" disabled={busy} onClick={() => onClientToggle(client)}>
                        {client.isActive ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <Eyebrow>Audit</Eyebrow>
            <h3>Recent admin actions</h3>
          </div>
        </div>
        <div className="audit-list">
          {auditLogs.length === 0 ? (
            <p className="muted">No audit entries yet.</p>
          ) : (
            auditLogs.slice(0, 12).map((log) => (
              <article className="audit-item" key={log.id}>
                <div>
                  <strong>{String(log.action || '').replaceAll('_', ' ')}</strong>
                  <span>{log.actor_admin_email || log.actor_admin_name || 'Company admin'}</span>
                </div>
                <span>{formatDate(log.created_at)}</span>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
