export function Eyebrow({ children }) {
  return (
    <p className="eyebrow">
      <span />
      {children}
    </p>
  );
}

export function StatusBadge({ active, children }) {
  return (
    <span className={`status ${active ? 'status-active' : 'status-disabled'}`}>
      {children || (active ? 'Active' : 'Disabled')}
    </span>
  );
}

export function EmptyState({ eyebrow, title }) {
  return (
    <div className="empty-state">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2>{title}</h2>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export function MetricCard({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
