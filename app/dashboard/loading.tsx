export default function DashboardLoading() {
  return (
    <section
      className="observatory-page dashboard-route-loading"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="eyebrow shell-path">402v /dashboard</p>
      <h1>Loading dashboard data…</h1>
      <div className="dashboard-loading-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
