export function Brand({ title = 'Rate Limit Console', href = '/' }) {
  return (
    <a className="brand" href={href} aria-label={title}>
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-dot brand-dot-red" />
        <span className="brand-dot brand-dot-yellow" />
      </span>
      <span className="brand-text">{title}</span>
    </a>
  );
}
