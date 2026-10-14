export default function WorkspaceLoading({ loading, error, onRetry }) {
  return <main className="workspace-loading" aria-busy={loading}>
    <div className="workspace-loader-card">
      <div className={`workspace-loader-mark ${loading ? "is-loading" : ""}`} aria-hidden="true"><span /><i /></div>
      <h1>{loading ? "Loading your workspace" : "Unable to load guest details"}</h1>
      <p role={error ? "alert" : "status"}>{error || "Loading the hospitality workspace…"}</p>
      {!loading && <button type="button" onClick={onRetry}>Try again</button>}
    </div>
  </main>;
}
