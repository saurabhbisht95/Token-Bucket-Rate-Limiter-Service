import { useEffect, useState } from 'react';

import { Brand } from '../components/Brand.jsx';
import { EmptyState, Eyebrow, MetricCard, StatusBadge, Toast } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatDate, formatNumber } from '../lib/format.js';

function publicError(err) {
  return err?.message || 'Something went wrong';
}

export function SuperadminConsole() {
  const [owner, setOwner] = useState(null);
  const [summary, setSummary] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [companyDetails, setCompanyDetails] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 3600);
  }

  async function loadSelectedCompany(companyId) {
    if (!companyId) {
      setCompanyDetails(null);
      return;
    }

    const details = await api(`/v1/superadmin/companies/${companyId}`);
    setCompanyDetails(details);
  }

  async function loadDashboard(nextCompanyId = selectedCompanyId) {
    const data = await api('/v1/superadmin/summary');
    const validSelectedCompany = data.companies.some((company) => company.id === nextCompanyId);
    const companyId = validSelectedCompany ? nextCompanyId : data.companies[0]?.id || null;

    setSummary(data);
    setOwner(data.owner);
    setSelectedCompanyId(companyId);
    await loadSelectedCompany(companyId);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const session = await api('/v1/superadmin/auth/me');
        if (cancelled) return;
        setOwner(session.owner);
        await loadDashboard();
      } catch {
        if (!cancelled) setOwner(null);
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
      const session = await api('/v1/superadmin/auth/login', {
        method: 'POST',
        body: {
          adminApiKey: form.get('adminApiKey')
        }
      });
      event.currentTarget.reset();
      setOwner(session.owner);
      await loadDashboard();
      notify('Superadmin signed in');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await api('/v1/superadmin/auth/logout', { method: 'POST' }).catch(() => {});
    setOwner(null);
    setSummary(null);
    setSelectedCompanyId(null);
    setCompanyDetails(null);
  }

  async function handleCompanyStatusToggle() {
    if (!companyDetails?.company) return;

    const nextStatus = companyDetails.company.status === 'active' ? 'suspended' : 'active';
    setBusy(true);

    try {
      await api(`/v1/superadmin/companies/${companyDetails.company.id}/status`, {
        method: 'PATCH',
        body: {
          status: nextStatus
        }
      });
      await loadDashboard(companyDetails.company.id);
      notify(nextStatus === 'active' ? 'Company reactivated' : 'Company suspended');
    } catch (err) {
      notify(publicError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <>
        <OwnerTopbar owner={owner} onLogout={handleLogout} />
        <main>
          <EmptyState eyebrow="Loading" title="Opening superadmin console." />
        </main>
      </>
    );
  }

  if (!owner) {
    return (
      <>
        <OwnerTopbar />
        <main>
          <section className="auth-shell owner-auth">
            <div className="auth-copy">
              <Eyebrow>Owner access</Eyebrow>
              <h1>Your product control room.</h1>
              <p>
                Monitor companies, inspect project usage, suspend unsafe tenants, and review owner-level keys and audit activity.
              </p>
            </div>

            <div className="auth-panel">
              <form className="stack" onSubmit={handleLogin}>
                <label>
                  Owner admin API key
                  <input name="adminApiKey" type="password" autoComplete="off" required />
                </label>
                <button className="button button-primary" type="submit" disabled={busy}>
                  Enter superadmin
                </button>
              </form>
            </div>
          </section>
        </main>
        <Toast message={toast} />
      </>
    );
  }

  return (
    <>
      <OwnerTopbar owner={owner} onLogout={handleLogout} />
      <main>
        <section className="dashboard">
          <section className="summary-band owner-summary" aria-label="Superadmin metrics">
            <MetricCard label="Companies" value={formatNumber(summary?.metrics?.companies)} />
            <MetricCard label="Active" value={formatNumber(summary?.metrics?.activeCompanies)} />
            <MetricCard label="Projects" value={formatNumber(summary?.metrics?.projects)} />
            <MetricCard label="Runtime keys" value={formatNumber(summary?.metrics?.activeRuntimeKeys)} />
          </section>

          <section className="workspace owner-workspace">
            <aside className="project-rail">
              <div className="section-head">
                <div>
                  <Eyebrow>Companies</Eyebrow>
                  <h2>Tenants</h2>
                </div>
              </div>

              <div className="project-list">
                {(summary?.companies || []).length === 0 ? (
                  <p className="muted">No companies have signed up yet.</p>
                ) : (
                  summary.companies.map((company) => (
                    <button
                      className={`project-item ${company.id === selectedCompanyId ? 'is-active' : ''}`}
                      type="button"
                      key={company.id}
                      onClick={async () => {
                        setSelectedCompanyId(company.id);
                        await loadSelectedCompany(company.id);
                      }}
                    >
                      <strong>{company.name}</strong>
                      <span>
                        {company.status} - {company.projectCount} projects - {company.activeRuntimeKeyCount} keys
                      </span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="console">
              {!companyDetails ? (
                <EmptyState eyebrow="No company selected" title="Select a company to inspect." />
              ) : (
                <CompanyInspector
                  busy={busy}
                  details={companyDetails}
                  onCompanyStatusToggle={handleCompanyStatusToggle}
                />
              )}
            </section>
          </section>

          <section className="two-column owner-lower">
            <OwnerKeys keys={summary?.ownerKeys || []} />
            <GlobalAudit logs={summary?.auditLogs || []} />
          </section>
        </section>
      </main>
      <Toast message={toast} />
    </>
  );
}

function OwnerTopbar({ owner, onLogout }) {
  return (
    <header className="topbar">
      <Brand title="Superadmin Console" href="/superadmin" />
      {owner ? (
        <div className="session-strip">
          <a className="button button-ghost" href="/">
            Admin dashboard
          </a>
          <span className="session-company">
            {owner.name} - {owner.keyPrefix}
          </span>
          <button className="button button-ghost" type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}

function CompanyInspector({ busy, details, onCompanyStatusToggle }) {
  const { company, admins, projects } = details;
  const clientCount = projects.reduce((sum, item) => sum + item.clients.length, 0);
  const runtimeKeyCount = projects.reduce((sum, item) => sum + item.runtimeKeys.length, 0);
  const isActive = company.status === 'active';

  return (
    <>
      <div className="console-head">
        <div>
          <Eyebrow>Selected company</Eyebrow>
          <h2>{company.name}</h2>
          <p className="muted">{company.slug}</p>
        </div>
        <button
          className={`button button-secondary ${isActive ? 'button-danger' : ''}`}
          type="button"
          disabled={busy}
          onClick={onCompanyStatusToggle}
        >
          {isActive ? 'Suspend company' : 'Reactivate company'}
        </button>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="section-head">
            <div>
              <Eyebrow>Company admins</Eyebrow>
              <h3>People</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {admins.length === 0 ? (
                  <tr>
                    <td colSpan="4">No admins found.</td>
                  </tr>
                ) : (
                  admins.map((admin) => (
                    <tr key={admin.id}>
                      <td>{admin.name}</td>
                      <td>{admin.email}</td>
                      <td>{admin.role}</td>
                      <td>
                        <StatusBadge active={admin.isActive} />
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
              <Eyebrow>Company totals</Eyebrow>
              <h3>Footprint</h3>
            </div>
          </div>
          <div className="stats-grid">
            <MetricCard label="Projects" value={formatNumber(projects.length)} />
            <MetricCard label="Limits" value={formatNumber(clientCount)} />
            <MetricCard label="Runtime keys" value={formatNumber(runtimeKeyCount)} />
            <MetricCard label="Status" value={isActive ? 'Active' : 'Suspended'} />
          </div>
        </section>
      </div>

      <section className="panel limits-panel">
        <div className="section-head">
          <div>
            <Eyebrow>Projects</Eyebrow>
            <h3>Tenant resources</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Slug</th>
                <th>Limits</th>
                <th>Runtime keys</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan="5">No projects found.</td>
                </tr>
              ) : (
                projects.map(({ project, clients, runtimeKeys }) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.slug}</td>
                    <td>{formatNumber(clients.length)}</td>
                    <td>{formatNumber(runtimeKeys.length)}</td>
                    <td>
                      <StatusBadge active={project.isActive} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function OwnerKeys({ keys }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Eyebrow>Owner keys</Eyebrow>
          <h3>Superadmin access</h3>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Status</th>
              <th>Last used</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan="4">No owner keys found.</td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>
                    <code>{key.keyPrefix}</code>
                  </td>
                  <td>
                    <StatusBadge active={key.isActive} />
                  </td>
                  <td>{formatDate(key.lastUsedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GlobalAudit({ logs }) {
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <Eyebrow>Audit</Eyebrow>
          <h3>Global activity</h3>
        </div>
      </div>
      <div className="audit-list">
        {logs.length === 0 ? (
          <p className="muted">No audit entries yet.</p>
        ) : (
          logs.slice(0, 14).map((log) => {
            const actor =
              log.actor_key_name ||
              log.actor_admin_email ||
              log.actor_admin_name ||
              log.actor_key_prefix ||
              'System';

            return (
              <article className="audit-item" key={log.id}>
                <div>
                  <strong>{String(log.action || '').replaceAll('_', ' ')}</strong>
                  <span>{actor}</span>
                </div>
                <span>{formatDate(log.created_at)}</span>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
