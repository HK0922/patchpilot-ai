import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowRight, Bot, BookOpen, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, Clock3, Code2, Copy, FileCode2, FolderGit2,
  GitBranch, GitPullRequest, Layers3, LoaderCircle, LockKeyhole, Play, Plus,
  RotateCcw, Search, ShieldCheck, Sparkles, Square, Terminal, TestTube2,
  Wallet, X, XCircle, Zap, AlertTriangle, ChartNoAxesCombined, ExternalLink,
} from 'lucide-react';
import type { AgentEvent, Config, Project, Report, Run } from './types';
import { diffLines, download, duration, gate, STATUS, TERMINAL, VERIFIED } from './utils';
import RepositoryDesk from './RepositoryDesk';
import { parseEvidence, readText } from './intake';
import type { RepairBundle, RepairDraft } from './intake';

type Page = 'intake' | 'runs' | 'evaluation' | 'architecture' | 'guide';
type Tab = 'diff' | 'tests' | 'activity' | 'plan' | 'review';
const STAGES = ['intake', 'baseline', 'plan', 'patch', 'test', 'review', 'complete'];
const STAGE_LABELS: Record<string, string> = { intake: 'Snapshot', baseline: 'Baseline', plan: 'Plan', patch: 'Patch', test: 'Verify', review: 'Review', complete: 'Handoff' };

function Badge({ status, replay = false }: { status: string; replay?: boolean }) {
  return <span className={`badge ${status}`}><span />{replay ? 'Trace playback' : STATUS[status] || status}</span>;
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><FolderGit2 size={35} /><h3>{title}</h3><p>{children}</p></div>;
}

export default function App() {
  const [page, setPage] = useState<Page>('intake');
  const [tab, setTab] = useState<Tab>('diff');
  const [report, setReport] = useState<Report | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [projectId, setProjectId] = useState('pagination');
  const [issue, setIssue] = useState('');
  const [mode, setMode] = useState<'demo' | 'openai'>('demo');
  const [attempts, setAttempts] = useState(3);
  const [tokenBudget, setTokenBudget] = useState(30000);
  const [offline, setOffline] = useState(true);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'review' | 'token' | null>(null);
  const [note, setNote] = useState('');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [playing, setPlaying] = useState(false);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const playback = useRef<ReturnType<typeof setInterval> | null>(null);
  const evidenceInput = useRef<HTMLInputElement>(null);
  const selectedProject = projects.find(project => project.id === projectId);
  const active = selected && !TERMINAL.has(selected.status);
  const isRecorded = offline || !!selected?.experiment;

  async function api(path: string, options: RequestInit = {}, accessToken = token) {
    const response = await fetch(`/api${path}`, {
      ...options, headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || `Request failed (${response.status})`);
    }
    return response;
  }

  function showToast(message: string) { setToast(message); }
  function stopPlayback() {
    if (playback.current) clearInterval(playback.current);
    playback.current = null; setPlaying(false); setEventCount(null);
  }

  function chooseProject(id: string) {
    stopPlayback(); setProjectId(id); setIssue(projects.find(project => project.id === id)?.issue || '');
    if (offline && report) {
      const example = report.runs.find(run => run.project_id === id && (run.experiment === 'repair-loop' || run.experiment === 'policy-probe'));
      setSelected(example || null); setTab('diff');
    } else if (!offline) {
      setSelected(null); setTab('diff');
      setMode(projects.find(project => project.id === id)?.demo_available ? 'demo' : 'openai');
    }
  }

  async function loadLocal(accessToken = token) {
    const [projectResponse, runResponse] = await Promise.all([api('/projects', {}, accessToken), api('/runs', {}, accessToken)]);
    const projectData: Project[] = await projectResponse.json();
    const runData: Run[] = await runResponse.json();
    setProjects(projectData); setRuns(runData);
    setProjectId(projectData[0]?.id || ''); setIssue(projectData[0]?.issue || '');
    if (runData[0]) setSelected(await (await api(`/runs/${runData[0].id}`, {}, accessToken)).json());
  }

  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const [dataResponse, configResponse] = await Promise.all([
          fetch('./demo-data.json'), fetch('/api/config').catch(() => null),
        ]);
        if (!dataResponse.ok) throw new Error('The recorded evidence could not be loaded.');
        const data: Report = await dataResponse.json();
        if (disposed) return;
        setReport(data);
        const local: Config | null = configResponse?.ok && configResponse.headers.get('content-type')?.includes('application/json')
          ? await configResponse.json() : null;
        if (disposed) return;
        if (local?.kind === 'local-service') {
          setOffline(false); setConfig(local);
          if (local.auth_required) { setModal('token'); setProjects(data.projects); setIssue(data.projects[0].issue); }
          else await loadLocal();
        } else {
          setOffline(true); setProjects(data.projects);
          const displayed = data.runs.filter(run => run.experiment !== 'one-shot' || !VERIFIED.has(run.status));
          setRuns(displayed); setSelected(displayed[0] || null);
          setProjectId(data.projects[0].id); setIssue(data.projects[0].issue);
        }
      } catch (error) { if (!disposed) showToast((error as Error).message); }
      finally { if (!disposed) setBooting(false); }
    }
    void load();
    return () => { disposed = true; if (playback.current) clearInterval(playback.current); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 6000); return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href], [tabindex="0"]') || []);
    focusable()[0]?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && modal !== 'token') setModal(null);
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [modal]);

  useEffect(() => {
    if (offline || !selected || selected.experiment || TERMINAL.has(selected.status)) return;
    const id = selected.id;
    let disposed = false;
    const timer = setInterval(async () => {
      try {
        const detail: Run = await (await api(`/runs/${id}`)).json();
        if (disposed) return;
        setSelected(current => current?.id === id ? detail : current);
        setRuns(current => current.map(run => run.id === id ? detail : run));
      } catch (error) { if (!disposed) showToast((error as Error).message); }
    }, 650);
    return () => { disposed = true; clearInterval(timer); };
  }, [offline, selected?.id, selected?.status, selected?.experiment, token]);

  async function selectRun(run: Run) {
    stopPlayback();
    try {
      const full = offline || run.experiment ? run : await (await api(`/runs/${run.id}`)).json();
      setSelected(full); setProjectId(full.project_id); setIssue(full.issue); setMode(full.mode);
      setTab('diff'); setPage('runs');
    } catch (error) { showToast((error as Error).message); }
  }

  function playEvidence(run: Run) {
      stopPlayback(); setSelected(run); setProjectId(run.project_id); setIssue(run.issue); setPage('runs'); setTab('activity'); setPlaying(true); setEventCount(0);
      let count = 0;
      playback.current = setInterval(() => {
        count += 1; setEventCount(count);
        if (count >= run.events.length) {
          if (playback.current) clearInterval(playback.current);
          playback.current = null; setPlaying(false);
        }
      }, 320);
  }

  function replayWorkflow() {
    const recorded = report?.runs.filter(item => item.experiment === 'repair-loop' || item.experiment === 'policy-probe') || [];
    const run = recorded.find(item => item.project_id === projectId) || recorded[0];
    if (!run) { showToast('No recorded trace exists for this case.'); return; }
    playEvidence(run);
  }

  async function launch() {
    if (offline) { if (selected?.evidence_origin) playEvidence(selected); else replayWorkflow(); return; }
    setBusy(true); stopPlayback();
    try {
      const run: Run = await (await api('/runs', { method: 'POST', body: JSON.stringify({ project_id: projectId, mode, issue: mode === 'demo' ? null : issue, max_attempts: attempts, token_budget: tokenBudget }) })).json();
      setSelected(run); setRuns(current => [run, ...current]); setTab('activity');
    } catch (error) { showToast((error as Error).message); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!selected) return;
    try { setSelected(await (await api(`/runs/${selected.id}/cancel`, { method: 'POST' })).json()); }
    catch (error) { showToast((error as Error).message); }
  }

  async function decision(value: 'approve' | 'reject') {
    if (!selected || isRecorded) return;
    setBusy(true);
    try {
      const run: Run = await (await api(`/runs/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: value, note }) })).json();
      setSelected(run); setRuns(current => current.map(item => item.id === run.id ? run : item)); setModal(null); setNote('');
      showToast(`Review recorded. ${value === 'approve' ? 'Download the patch when you are ready to apply it.' : 'Create a new run to investigate further.'}`);
    } catch (error) { showToast((error as Error).message); }
    finally { setBusy(false); }
  }

  async function exportEvidence() {
    if (!selected) return;
    try {
      if (isRecorded) download(`patchpilot-evidence-${selected.id.slice(0, 8)}.json`, JSON.stringify(selected, null, 2), 'application/json');
      else download(`patchpilot-evidence-${selected.id.slice(0, 8)}.zip`, await (await api(`/runs/${selected.id}/export`)).blob(), 'application/zip');
      showToast('Evidence downloaded.');
    } catch (error) { showToast((error as Error).message); }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); }
    catch { showToast('Clipboard access is unavailable. Use the download button.'); }
  }

  async function registerRequest(request: RepairBundle, draft: RepairDraft) {
    const project: Project = await (await api('/projects/import', { method: 'POST', body: JSON.stringify(request) })).json();
    setProjects(current => [...current.filter(item => item.id !== project.id), project]);
    setProjectId(project.id); setIssue(project.issue); setMode('openai');
    setAttempts(draft.attempts); setTokenBudget(draft.tokens); setSelected(null); setTab('diff'); setPage('runs');
    showToast('Repository registered. Inspect the issue and budgets, then start the live repair when the local service is ready.');
  }

  async function importEvidence(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('Evidence exceeds the 1 MB import limit.');
      const run = parseEvidence(await readText(file));
      setRuns(current => [run, ...current]);
      setProjects(current => current.some(item => item.id === run.project_id) ? current : [...current, {
        id: run.project_id, title: run.project_title, issue: run.issue, tag: 'Imported evidence', category: 'evidence',
        editable_files: [], demo_available: false, language: 'Python',
      }]);
      await selectRun(run);
      showToast('Run evidence imported. Results come from the file and were not re-executed here.');
    } catch (error) { showToast((error as Error).message); }
    finally { if (evidenceInput.current) evidenceInput.current.value = ''; }
  }

  const displayedRuns = runs.filter(run => (filter === 'all' || (filter === 'verified' ? VERIFIED.has(run.status) : run.status === 'needs_attention'))
    && `${run.project_title} ${run.issue}`.toLowerCase().includes(search.toLowerCase()));
  const visibleEvents = selected?.events?.slice(0, eventCount ?? selected.events.length) || [];
  const currentStage = playing ? visibleEvents.at(-1)?.stage || 'intake' : selected?.stage || 'intake';

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to main content</a>
    <aside className="sidebar">
      <a href="#" onClick={event => { event.preventDefault(); setPage('runs'); }} className="brand" aria-label="PatchPilot home">
        <span className="brand-mark"><GitPullRequest size={22} /></span>
        <div>PatchPilot<span> / AI</span><small>THE SOFTWARE REPAIR DESK</small></div>
      </a>
      <div className="workspace-switch"><span className="avatar small">HT</span><div>Harikrishna's workspace<small>Personal project · v0.2</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        {([
          ['intake', FolderGit2, 'Your repository'], ['runs', GitBranch, 'Repair runs'], ['evaluation', ChartNoAxesCombined, 'Evaluation'],
          ['architecture', Layers3, 'Architecture'], ['guide', BookOpen, 'Project guide'],
        ] as const).map(([id, Icon, label]) => <button key={id} onClick={() => setPage(id)} className={page === id ? 'nav-item active' : 'nav-item'} aria-current={page === id ? 'page' : undefined}><Icon size={19} /><span>{label}</span>{id === 'runs' && <span className="nav-count">{runs.length}</span>}</button>)}
      </nav>
      <div className="sidebar-note"><span className="note-number">01 / PRINCIPLE</span><strong>Proof before approval.</strong><p>A patch earns your review through its diff, tests, and execution trail.</p><div><span className="green-dot" />{offline ? 'Recorded evidence available' : 'Local worker connected'}</div></div>
      <div className="sidebar-footer"><span className="avatar">HT</span><div>Harikrishna Trivedi<small>AI engineering portfolio</small></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div><span>Workspace</span><ChevronRight size={13} />{page === 'intake' ? 'Your repository' : page === 'runs' ? 'Repair runs' : page === 'evaluation' ? 'Evaluation' : page === 'architecture' ? 'Architecture' : 'Project guide'}</div><div className="topbar-status"><span className={offline ? 'amber-dot' : 'green-dot'} />{offline ? 'Browser workspace' : 'Local service'}<span className="version-tag">v0.2</span></div></header>
      <main id="main">
        {booting ? <div className="loading"><LoaderCircle className="spin" size={28} /><span>Loading the workspace and recorded evidence…</span></div> : <>
          {page === 'intake' && <RepositoryDesk local={!offline} intakeReady={!!config?.repository_intake} liveReady={!!config?.live_ready} onReplay={replayWorkflow} onGuide={() => setPage('guide')} onRegister={registerRequest} />}
          {page === 'runs' && <>
            <div className="page-heading"><div><div className="eyebrow">02 / REPAIR WORKSPACE</div><h1 aria-label="The repair desk.">The repair desk<span className="title-period">.</span></h1><p>Inspect the change. Read the proof. Make the call.</p></div><div className="heading-actions"><input className="visually-hidden" ref={evidenceInput} type="file" accept=".json" aria-label="Import run evidence file" onChange={event => void importEvidence(event.target.files?.[0])} /><button className="button secondary" onClick={() => evidenceInput.current?.click()}><ArrowDownToLine size={15} />Import evidence</button><button className="button primary" onClick={() => { stopPlayback(); setPage('intake'); }}><Plus size={17} />New request</button></div></div>
            <div className="environment-banner"><div className="environment-icon"><Play size={17} /></div><div><button className="environment-action" onClick={replayWorkflow} disabled={playing}>Explore an executed workflow<ArrowRight size={14} /></button><p>{offline ? 'Replay real fixture runs, inspect the diffs, and download the evidence. Demo repairs use known recipes; no LLM calls run on this page.' : 'Explore a recorded demo, or execute a new repair using your local service.'}</p></div><span className="outline-tag">{offline ? 'RECORDED DEMO' : 'LOCAL EXECUTION'}</span></div>
            <div className="workspace-grid">
              <div className="run-rail">
                <section className="card setup-card"><div className="card-title"><span className="title-icon"><GitBranch size={17} /></span><h2>Start a repair</h2></div>
                  <label className="field-label" htmlFor="project">Repository / case</label>
                  <div className="select-wrap"><FolderGit2 size={16} /><select id="project" value={projectId} onChange={event => chooseProject(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></div>
                  <div className="repo-meta"><span className="python-dot" />Python<span>·</span><span>unittest</span><span>·</span><span>{selectedProject?.category === 'policy' ? 'Policy probe' : 'Module snapshot'}</span></div>
                  <label className="field-label" htmlFor="issue">Issue to resolve</label>
                  <textarea id="issue" value={issue} onChange={event => setIssue(event.target.value)} readOnly={offline || mode === 'demo'} rows={6} maxLength={4000} />
                  <details className="run-config"><summary>Execution settings<ChevronDown size={14} /></summary>
                  <label className="field-label" htmlFor="mode">Provider</label>
                  <select id="mode" value={mode} onChange={event => setMode(event.target.value as 'demo' | 'openai')} disabled={offline}><option value="demo">Scripted demo · no model calls</option><option value="openai" disabled={!config?.live_ready}>OpenAI Responses · live</option></select>
                  {!offline && !config?.live_ready && <p className="field-hint">{config?.live_blocker} <button className="text-button" onClick={() => setPage('guide')}>Setup guide <ArrowRight size={12} /></button></p>}
                  <div className="field-row"><div><label className="field-label" htmlFor="attempts">Max attempts</label><select id="attempts" value={attempts} onChange={event => setAttempts(+event.target.value)} disabled={offline}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value} {value === 1 ? 'attempt' : 'attempts'}</option>)}</select></div><div><label className="field-label" htmlFor="tokens">Token ceiling</label><select id="tokens" value={tokenBudget} onChange={event => setTokenBudget(+event.target.value)} disabled={offline}>{[16000, 30000, 60000].map(value => <option key={value} value={value}>{(value / 1000).toFixed(0)}k tokens</option>)}</select></div></div>
                  </details>
                  <button className="button primary full" onClick={() => void launch()} disabled={busy || playing || (!offline && !!active && !isRecorded) || (!offline && mode === 'demo' && !selectedProject?.demo_available) || (!offline && mode === 'openai' && !config?.live_ready)}>{busy ? <LoaderCircle className="spin" size={16} /> : playing ? <Activity size={16} /> : <Play size={16} />}{playing ? 'Playing recorded trace…' : offline ? 'Replay this workflow' : 'Run PatchPilot'}</button>
                  {playing && <button className="button subtle full" onClick={stopPlayback}><Square size={13} />Stop playback</button>}
                  <div className="setup-footnote"><LockKeyhole size={12} />{offline ? 'Playback does not execute or change code.' : 'Original repository stays untouched.'}</div>
                </section>
                <section className="card history-card"><div className="card-title"><h2>{offline ? 'Recorded runs' : 'Recent runs'}</h2><span className="counter">{runs.length}</span></div>
                  <div className="search-field"><Search size={14} /><input aria-label="Search runs" placeholder="Search runs" value={search} onChange={event => setSearch(event.target.value)} /></div>
                  <div className="filter-tabs" role="group" aria-label="Filter runs">{[['all', 'All'], ['verified', 'Verified'], ['attention', 'Attention']].map(([id, label]) => <button className={filter === id ? 'selected' : ''} key={id} onClick={() => setFilter(id)}>{label}</button>)}</div>
                  <div className="run-list">{displayedRuns.map(run => <button key={run.id} onClick={() => void selectRun(run)} className={`run-list-item ${selected?.id === run.id ? 'selected' : ''}`}><div className={`run-symbol ${VERIFIED.has(run.status) ? 'good' : run.status === 'needs_attention' ? 'warning' : ''}`}>{VERIFIED.has(run.status) ? <Check size={14} /> : run.status === 'needs_attention' ? <AlertTriangle size={13} /> : <Clock3 size={14} />}</div><div><strong>{run.project_title}</strong><small>{run.experiment === 'one-shot' ? 'Single-attempt comparison' : run.experiment === 'policy-probe' ? 'Negative policy test' : `${run.attempt} ${run.attempt === 1 ? 'attempt' : 'attempts'} · ${duration(run.metrics.duration_ms)}`}</small></div><ChevronRight size={13} /></button>)}{!displayedRuns.length && <p className="list-empty">No matching runs.</p>}</div>
                </section>
              </div>

              <div className="run-main">
                {selected ? <>
                  {selected.evidence_origin === 'imported' && <div className="imported-evidence-note" role="status"><FileCode2 size={17} /><div><strong>Imported evidence · not re-executed here</strong><p>Results and approval status are supplied by the uploaded file. Original run: <span className="mono">{selected.original_run_id}</span>.</p></div></div>}
                  <section className="card run-summary"><div className="summary-top"><div><span className="mono overline">SELECTED RUN / {(selected.original_run_id || selected.id).slice(0, 8).toUpperCase()}</span><h2>{selected.project_title}</h2><div className="summary-tags"><span><FolderGit2 size={13} />{selected.project_id}</span><span><Bot size={13} />{selected.mode === 'demo' ? 'Scripted roles' : config?.model || 'OpenAI'}</span>{selected.experiment === 'one-shot' && <span>Single-attempt experiment</span>}</div></div><Badge status={selected.status} replay={playing} /></div>
                    <div className="metrics-strip"><div><Clock3 size={16} /><span>{selected.evidence_origin ? 'Reported duration' : offline ? 'Executed duration' : 'Duration'}<strong>{duration(selected.metrics.duration_ms)}</strong></span></div><div><RotateCcw size={16} /><span>Repair attempts<strong>{selected.attempt}<em> / {selected.max_attempts}</em></strong></span></div><div><Zap size={16} /><span>Model usage<strong>{selected.metrics.total_tokens.toLocaleString()}<em> tokens</em></strong></span></div><div><Wallet size={16} /><span>Estimated API cost<strong>{selected.metrics.estimated_cost_usd == null ? 'Unpriced' : `$${selected.metrics.estimated_cost_usd.toFixed(4)}`}</strong></span></div></div>
                    <div className="stage-track" aria-label="Repair stages">{STAGES.map((stage, index) => {
                      const completed = index < STAGES.indexOf(currentStage) || (stage === 'complete' && VERIFIED.has(selected.status) && !playing);
                      const atStage = stage === currentStage;
                      return <div key={stage} className={`stage ${completed ? 'completed' : ''} ${atStage ? 'current' : ''}`}><span>{completed ? <Check size={12} /> : index + 1}</span><small>{STAGE_LABELS[stage]}</small></div>;
                    })}</div>
                  </section>
                  {selected.error && <div className="run-alert" role="status"><AlertTriangle size={18} /><div><strong>Human investigation needed</strong><p>{selected.error}</p></div></div>}
                  <section className="card evidence-card"><div className="evidence-toolbar"><div className="evidence-tabs" role="tablist" aria-label="Run evidence">{([
                    ['diff', Code2, 'Patch'], ['tests', TestTube2, 'Tests'], ['activity', Activity, 'Activity'], ['plan', BookOpen, 'Plan'], ['review', ShieldCheck, 'Review'],
                  ] as const).map(([id, Icon, label]) => <button role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}><Icon size={15} /><span>{label}</span>{id === 'tests' && <small>{selected.tests.length}</small>}</button>)}</div><button className="icon-button" aria-label="Download run evidence" title="Download run evidence" onClick={() => void exportEvidence()}><ArrowDownToLine size={16} /></button></div>
                    <div role="tabpanel" className="evidence-body">
                      {tab === 'diff' && <DiffPanel run={selected} onCopy={copy} />}
                      {tab === 'tests' && <TestPanel run={selected} />}
                      {tab === 'activity' && <ActivityPanel events={visibleEvents} replay={isRecorded} playing={playing} />}
                      {tab === 'plan' && <PlanPanel run={selected} />}
                      {tab === 'review' && <ReviewPanel run={selected} offline={isRecorded} onReview={() => setModal('review')} />}
                    </div>
                  </section>
                  <section className="handoff-bar"><div className="handoff-icon"><GitPullRequest size={20} /></div><div><strong>{VERIFIED.has(selected.status) ? 'A reviewable patch, with the proof attached.' : active ? 'The agent is collecting evidence.' : 'The run stopped before a verified handoff.'}</strong><p>{VERIFIED.has(selected.status) ? 'Download the diff and PR description. Review before applying it to your repository.' : 'Inspect the activity and test output to see what happened.'}</p></div>{active && !isRecorded ? <button className="button secondary" onClick={() => void cancel()}><Square size={14} />Cancel run</button> : VERIFIED.has(selected.status) ? <button className="button secondary" onClick={() => download(`patchpilot-${selected.id.slice(0, 8)}.patch`, selected.diff)}><ArrowDownToLine size={15} />Get patch</button> : <button className="button secondary" onClick={() => setTab('activity')}><Activity size={15} />View trace</button>}</section>
                </> : <section className="card start-empty"><div className="empty-illustration"><GitBranch size={40} /><Sparkles size={19} /></div><div className="eyebrow">YOUR NEXT REPAIR</div><h2>One issue. A complete trail.</h2><p>Select a case and start a run to see the plan, source changes, test results, and review gate together.</p><div className="empty-steps"><span><Code2 size={16} />Scoped patch</span><span><TestTube2 size={16} />Executed tests</span><span><ShieldCheck size={16} />Human review</span></div></section>}
              </div>
            </div>
          </>}
          {page === 'evaluation' && report && <Evaluation report={report} onRun={selectRun} />}
          {page === 'architecture' && <Architecture />}
          {page === 'guide' && <Guide downloadSource={offline || !!config?.source_archive_available} />}
        </>}
      </main>
      <footer className="main-footer"><span>PatchPilot AI · Built with AI, verified with tools, supervised by people.</span><div className="footer-links"><a href="./v1/">Previous interface</a><button onClick={() => setPage('guide')}>About this project <ArrowRight size={12} /></button></div></footer>
    </div>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16} /></button></div>}
    {modal && <div className="modal-backdrop" onClick={() => modal !== 'token' && setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={event => event.stopPropagation()}>
      {modal !== 'token' && <button className="icon-button modal-close" aria-label="Close review" onClick={() => setModal(null)}><X size={20} /></button>}
      <div className="modal-icon">{modal === 'token' ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}</div>
      <h2 id="modal-title">{modal === 'token' ? 'Connect to your local service' : isRecorded ? 'The human review checkpoint' : 'Review this patch'}</h2>
      {modal === 'token' ? <><p>Enter the access token you configured on your server. It stays in this page's memory and is never included in exports.</p><label className="field-label" htmlFor="access-token">Server access token</label><input autoFocus id="access-token" type="password" value={tokenInput} onChange={event => setTokenInput(event.target.value)} /><button className="button primary full" onClick={async () => { try { await loadLocal(tokenInput); setToken(tokenInput); setTokenInput(''); setModal(null); } catch (error) { showToast((error as Error).message); } }}>Connect <ArrowRight size={16} /></button></> : <>
        <p>Confirm the change fixes the reported behavior and is safe for your codebase.</p><ul className="review-checklist"><li><CheckCircle2 size={17} />Read every changed source line.</li><li><CheckCircle2 size={17} />Check the before-and-after regression evidence.</li><li><CheckCircle2 size={17} />Confirm existing tests and public behavior are preserved.</li><li><CheckCircle2 size={17} />Consider edge cases that this small suite may miss.</li></ul>
        {isRecorded ? <div className="info-box">This page replays completed runs. Review decisions are saved only in the local application. Download the source to run it yourself.</div> : <><label className="field-label" htmlFor="review-note">Review note</label><textarea id="review-note" rows={3} value={note} maxLength={1500} onChange={event => setNote(event.target.value)} placeholder="What did you verify? Any remaining concerns?" /><div className="modal-actions"><button className="button secondary" disabled={busy || selected?.status !== 'awaiting_review'} onClick={() => void decision('reject')}><XCircle size={16} />Reject patch</button><button className="button primary" disabled={busy || selected?.status !== 'awaiting_review'} onClick={() => void decision('approve')}><Check size={16} />Approve patch</button></div><p className="field-hint">Approval records your decision. It does not apply, push, or merge code.</p></>}
      </>}
    </section></div>}
  </div>;
}

function DiffPanel({ run, onCopy }: { run: Run; onCopy: (text: string) => Promise<void> }) {
  const [file, setFile] = useState('all');
  useEffect(() => setFile('all'), [run.id]);
  if (!run.diff) return <Empty title="No patch to display">Source changes appear here after the implementer passes the edit policy.</Empty>;
  const diff = file === 'all' ? run.diff : run.diff.split(/(?=^--- )/m).find(part => part.includes(`+++ b/${file}\n`)) || '';
  const additions = diffLines(run.diff).filter(line => line.kind === 'add').length;
  const deletions = diffLines(run.diff).filter(line => line.kind === 'remove').length;
  return <><div className="diff-heading"><div><strong>{run.files_changed.length} files changed</strong><span className="added">+{additions}</span><span className="removed">−{deletions}</span></div><button className="icon-button" aria-label="Copy patch diff" onClick={() => void onCopy(run.diff)}><Copy size={15} /></button></div>
    {!VERIFIED.has(run.status) && <div className="candidate-label"><AlertTriangle size={13} />Unverified candidate. Inspect failures before using this patch.</div>}
    <div className="file-tabs"><button className={file === 'all' ? 'selected' : ''} onClick={() => setFile('all')}>All files</button>{run.files_changed.map(path => <button className={file === path ? 'selected' : ''} key={path} onClick={() => setFile(path)}><FileCode2 size={13} />{path}</button>)}</div>
    <div className="diff-code" aria-label="Unified source diff">{diffLines(diff).map((line, index) => <div key={index} className={`diff-line ${line.kind}`}><span className="line-number">{line.old}</span><span className="line-number">{line.next}</span><code>{line.text || ' '}</code></div>)}</div>
    <div className="diff-footer"><ShieldCheck size={13} />Source allowlist enforced. Existing tests are protected.</div>
  </>;
}

function TestPanel({ run }: { run: Run }) {
  if (!run.tests.length) return <Empty title="Tests have not run yet">The verifier will record the baseline, regression reproduction, and complete patched suite.</Empty>;
  return <div className="test-panel"><div className="panel-intro"><TestTube2 size={18} /><div><h3>Executed test evidence</h3><p>Failures on the original source are expected. A verified patch needs a passing full suite.</p></div></div>{run.tests.map((test, index) => <details key={`${run.id}-${index}`} className={`test-result ${test.passed ? 'pass' : 'fail'}`} open={index === run.tests.length - 1}><summary><span className={`result-icon ${test.passed ? 'good' : 'warning'}`}>{test.passed ? <Check size={14} /> : <X size={14} />}</span><div><strong>{test.phase}</strong><small>{test.tests_run} tests · {test.failures} failures · {test.errors} errors · {duration(test.duration_ms)}</small></div><span className="test-state">{test.timed_out ? 'TIMEOUT' : test.passed ? 'PASS' : 'FAIL'}</span><ChevronDown size={14} /></summary><div className="test-runner"><Terminal size={12} />{test.runner} · exit {test.returncode}</div><pre>{test.output}</pre></details>)}</div>;
}

function ActivityPanel({ events, replay, playing }: { events: AgentEvent[]; replay: boolean; playing: boolean }) {
  return <div className="activity-panel"><div className="panel-intro"><Activity size={18} /><div><h3>{replay ? 'Recorded agent activity' : 'Agent activity'}</h3><p>{replay ? 'A playback of persisted events from an executed fixture run.' : 'Structured engineering summaries and tool results, persisted to SQLite.'}</p></div>{playing && <LoaderCircle size={18} className="spin" />}</div><div className="activity-list">{events.map(event => <article key={event.sequence} className={`activity-event ${event.level}`}><div className="event-symbol">{event.role === 'verifier' ? <TestTube2 size={15} /> : event.role === 'human' ? <ShieldCheck size={15} /> : event.role === 'system' ? <Terminal size={15} /> : <Bot size={15} />}</div><div className="event-content"><div><strong>{event.role}</strong><span>{STAGE_LABELS[event.stage] || event.stage}</span><time>{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></div><p>{event.message}</p></div></article>)}{!events.length && <p className="list-empty">Waiting for the first event…</p>}</div></div>;
}

function PlanPanel({ run }: { run: Run }) {
  if (!run.plan) return <Empty title="The plan is being prepared">The planner first inspects source files and baseline failures.</Empty>;
  return <div className="plan-panel"><div className="panel-intro"><BookOpen size={18} /><div><h3>Repair plan</h3><p>{run.mode === 'demo' ? 'A scripted plan for the selected fixture.' : 'A typed model proposal, checked against the allowed source files.'}</p></div></div><blockquote>{run.plan.summary}</blockquote><h4>Planned steps</h4><ol className="plan-steps">{run.plan.steps.map((step, index) => <li key={index}><span>{index + 1}</span>{step}</li>)}</ol><h4>Acceptance criteria</h4><ul className="criteria-list">{run.plan.acceptance_criteria.map((item, index) => <li key={index}><CheckCircle2 size={15} />{item}</li>)}</ul><h4>Allowed targets</h4><div className="target-files">{run.plan.target_files.map(path => <code key={path}><FileCode2 size={13} />{path}</code>)}</div><div className="info-box">{run.plan.risks.join(' ')}</div></div>;
}

function ReviewPanel({ run, offline, onReview }: { run: Run; offline: boolean; onReview: () => void }) {
  const checks = gate(run);
  return <div className="review-panel"><div className="panel-intro"><ShieldCheck size={19} /><div><h3>Evidence before approval</h3><p>A model recommendation cannot bypass the tool checks or human decision.</p></div></div><div className="gate-list">{[
    [checks.tests, 'Complete patched test suite passes', 'Existing tests plus the new regression.'],
    [checks.regression, 'Regression reproduces the original bug', 'The new test fails on the untouched original source.'],
    [checks.reviewer, run.mode === 'demo' ? 'Scripted reviewer accepts the change' : 'Independent model reviewer accepts the change', 'Review checks the diff against the issue and test evidence.'],
    [checks.human, 'Human approves the patch', run.decision ? `Decision: ${run.decision.decision}. ${run.decision.note}` : 'You make the final decision in the local application.'],
  ].map(([passed, title, detail], index) => <div className="gate-row" key={index}>{passed ? <CheckCircle2 size={21} className="green" /> : <Circle size={21} className="muted" />}<div><strong>{String(title)}</strong><p>{String(detail)}</p></div><span>{passed ? 'Passed' : index === 3 ? 'Human gate' : 'Pending'}</span></div>)}</div>
    {run.review && <div className="review-summary"><span className="eyebrow">REVIEW SUMMARY</span><p>{run.review.summary}</p>{run.review.concerns.length > 0 && <ul>{run.review.concerns.map((concern, i) => <li key={i}>{concern}</li>)}</ul>}</div>}
    <button className="button primary" onClick={onReview} disabled={!offline && run.status !== 'awaiting_review'}><ShieldCheck size={16} />{offline ? 'Open review checklist' : 'Make review decision'}</button>
    {run.pr_body && <details className="pr-description"><summary><GitPullRequest size={15} />Prepared PR description<ChevronDown size={14} /></summary><pre>{run.pr_title}{'\n\n'}{run.pr_body}</pre><button className="button secondary" onClick={() => download('PR_DESCRIPTION.md', `${run.pr_title}\n\n${run.pr_body}`)}><ArrowDownToLine size={14} />Download description</button></details>}
  </div>;
}

function Evaluation({ report, onRun }: { report: Report; onRun: (run: Run) => Promise<void> }) {
  const summary = report.summary;
  return <><div className="page-heading"><div><div className="eyebrow"><ChartNoAxesCombined size={14} />REPRODUCIBLE EVALUATION</div><h1>Measure the workflow.</h1><p>Compare a single attempt with a bounded, test-driven repair loop.</p></div><button className="button secondary" onClick={() => download('patchpilot-benchmark.json', JSON.stringify(report, null, 2), 'application/json')}><ArrowDownToLine size={16} />Export results</button></div>
    <div className="disclosure-banner"><AlertTriangle size={19} /><div><strong>Scripted fixture evaluation. Real executed tests.</strong><p>{report.disclosure}</p></div></div>
    <div className="evaluation-metrics"><section className="card"><span className="eyebrow">SINGLE ATTEMPT</span><strong>{summary.one_shot_successes}<em> / {summary.repair_cases}</em></strong><p>fixtures reached human review</p></section><section className="card featured"><span className="eyebrow">REPAIR LOOP</span><strong>{summary.loop_successes}<em> / {summary.repair_cases}</em></strong><p>fixtures reached human review</p></section><section className="card"><span className="eyebrow">TEST EVIDENCE</span><strong>{summary.final_passing_tests}</strong><p>passing tests across final repair suites</p></section><section className="card"><span className="eyebrow">POLICY PROBE</span><strong>{summary.policy_blocks}<em> / {summary.policy_probes}</em></strong><p>prohibited edits stopped before execution</p></section></div>
    <section className="card evaluation-table"><div className="section-heading"><div><h2>Case-by-case results</h2><p>One execution per variant per fixture. No inference-time model calls.</p></div><span className="outline-tag">PYTHON {report.python_version}</span></div><div className="table-scroll"><table><thead><tr><th>Repair case</th><th>Single attempt</th><th>Repair loop</th><th>Attempts</th><th>Duration</th><th>Tests</th><th /></tr></thead><tbody>{report.comparisons.map(comparison => <tr key={comparison.project_id}><td><strong>{comparison.title}</strong><small>{comparison.project_id}</small></td><td><span className={comparison.one_shot_success ? 'table-success' : 'table-failure'}>{comparison.one_shot_success ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{comparison.one_shot_success ? 'Verified' : 'Stopped'}</span></td><td><span className="table-success"><CheckCircle2 size={15} />{comparison.loop_success ? 'Verified' : 'Stopped'}</span></td><td>{comparison.loop_attempts}</td><td className="mono">{duration(comparison.loop_ms)}</td><td>{comparison.final_tests} pass</td><td><button className="icon-button" aria-label={`Inspect ${comparison.title}`} onClick={() => { const run = report.runs.find(item => item.project_id === comparison.project_id && item.experiment === 'repair-loop'); if (run) void onRun(run); }}><ArrowRight size={16} /></button></td></tr>)}</tbody></table></div></section>
    <div className="two-column"><section className="card insight-card"><div className="insight-icon"><RotateCcw size={21} /></div><h2>The recovery worth inspecting</h2><p>The invoice's first patch added a tiny float offset. Tests caught incorrect rounding for negative credits. The next attempt used Decimal with explicit half-up rounding and passed all seven tests.</p><p className="field-hint">The second solution is part of the known demo recipe. This result verifies feedback and retry orchestration.</p></section><section className="card insight-card"><div className="insight-icon"><TestTube2 size={21} /></div><h2>The next meaningful experiment</h2><p>Run a configured model on held-out issues, compare the same model with and without the repair loop, and report success, latency, token usage, and cost over repeated trials.</p><p className="field-hint">That experiment is planned. These fixture results make no claim about general LLM performance.</p></section></div>
    <p className="evaluation-footnote">Executed {new Date(report.generated_at).toLocaleString()} · Median repair-loop duration: {duration(summary.loop_median_ms)} · API calls: 0 · This is not a SWE-bench result.</p>
  </>;
}

const ROLES = [
  { name: 'Planner', icon: BookOpen, label: 'Understand the bug', description: 'Reads the issue, a bounded source snapshot, and baseline failures. Returns a typed plan with allowed targets and acceptance criteria.', input: 'Issue + source + baseline tests', output: 'Plan JSON', guard: 'Target files must be in the source allowlist.' },
  { name: 'Implementer', icon: Code2, label: 'Propose a minimal edit', description: 'Returns exact before-and-after edits and a new regression test. Receives test or review feedback when an attempt fails.', input: 'Current source + plan + failure feedback', output: 'Patch JSON + regression test', guard: 'No test changes, arbitrary shell, secrets, or file escapes.' },
  { name: 'Verifier', icon: TestTube2, label: 'Execute the proof', description: 'Runs the regression on the original code, then the full suite on the candidate. This role is a deterministic tool, not a model.', input: 'Original snapshot + candidate patch', output: 'Test counts + exit codes + logs', guard: 'Docker for live code, deadlines, output and resource limits.' },
  { name: 'Reviewer', icon: ShieldCheck, label: 'Inspect the result', description: 'Checks the diff against the issue and executed evidence. Can request another attempt. Its approval still requires a separate human decision.', input: 'Issue + original-to-current diff + test evidence', output: 'Review JSON', guard: 'No ability to apply, push, or merge code.' },
];
function Architecture() {
  const [selectedRole, setSelectedRole] = useState(0);
  const role = ROLES[selectedRole];
  return <><div className="page-heading"><div><div className="eyebrow"><Layers3 size={14} />SYSTEM DESIGN</div><h1>Small roles. Clear boundaries.</h1><p>A controlled state machine connects model proposals to executable tools.</p></div><span className="outline-tag">BOUNDED AUTONOMY</span></div>
    <section className="card architecture-flow"><div className="section-heading"><div><h2>The issue-to-patch loop</h2><p>Failures return evidence to the implementer. Attempt, time, and token budgets stop the loop.</p></div></div><div className="flow-start"><GitBranch size={18} /><span>Reported issue</span><ArrowRight size={17} /><FolderGit2 size={18} /><span>Isolated snapshot + baseline</span></div><div className="role-grid">{ROLES.map((item, index) => <button className={`role-node ${selectedRole === index ? 'selected' : ''}`} key={item.name} onClick={() => setSelectedRole(index)}><div><item.icon size={20} /><span>0{index + 1}</span></div><h3>{item.name}</h3><p>{item.label}</p><small>{index === 2 ? 'Deterministic tool' : 'Typed role contract'}</small></button>)}</div><div className="flow-return"><RotateCcw size={16} /><span>Failing tests or review concerns → next implementation attempt</span></div><div className="flow-finish"><div><ShieldCheck size={19} /><strong>All evidence gates pass</strong></div><ArrowRight size={19} /><div><LockKeyhole size={19} /><strong>Human review</strong></div><ArrowRight size={19} /><div><ArrowDownToLine size={19} /><strong>Download patch + evidence</strong></div></div></section>
    <section className="card role-details"><div className="role-details-heading"><role.icon size={24} /><div><h2>{role.name}</h2><p>{role.description}</p></div></div><div className="contract-grid"><div><span className="eyebrow">INPUT</span><p>{role.input}</p></div><div><span className="eyebrow">OUTPUT</span><p>{role.output}</p></div><div><span className="eyebrow">BOUNDARY</span><p>{role.guard}</p></div></div></section>
    <div className="two-column"><section className="card stack-card"><h2>What runs where</h2><div><span>React + TypeScript</span><strong>Dashboard and evidence inspection</strong></div><div><span>FastAPI + Pydantic</span><strong>Typed API and role output validation</strong></div><div><span>Python state machine</span><strong>Budgeted planning, edits, retries, and review</strong></div><div><span>OpenAI Responses</span><strong>Optional live structured model provider</strong></div><div><span>Docker + unittest</span><strong>Constrained execution of live candidate code</strong></div><div><span>SQLite + event stream</span><strong>Persistent runs, events, and decisions</strong></div></section><section className="card boundary-card"><h2>v0.2 execution boundary</h2><p>Pure Python modules with unittest tests. A bounded snapshot, existing source-file edits, and one added regression file.</p><ul><li><CheckCircle2 size={16} />Source edits validate before any file is written.</li><li><CheckCircle2 size={16} />Original tests are hashed and preserved.</li><li><CheckCircle2 size={16} />Live execution requires the Docker image.</li><li><CheckCircle2 size={16} />The model receives no shell execution tool.</li><li><CheckCircle2 size={16} />Service restarts mark unfinished runs interrupted.</li></ul><div className="info-box">AST rules are a policy layer. Docker adds isolation; this is a personal engineering prototype, not a public service for arbitrary hostile repositories.</div></section></div>
  </>;
}

function Guide({ downloadSource }: { downloadSource: boolean }) {
  return <><div className="page-heading"><div><div className="eyebrow"><BookOpen size={14} />PROJECT GUIDE</div><h1>Build it. Understand it. Show it.</h1><p>A working foundation for Harikrishna's AI engineering portfolio.</p></div>{downloadSource ? <a className="button primary" href="./downloads/PatchPilot_AI_Source.zip" download><ArrowDownToLine size={16} />Download source</a> : <span className="outline-tag">SOURCE IN YOUR CHECKOUT</span>}</div>
    <div className="two-column"><section className="card guide-card"><div className="insight-icon"><Terminal size={23} /></div><h2>Run the complete application</h2><p>Python 3.11+ and Node.js 20.19+ or 22.12+. Unzip the project, then run:</p><pre className="command-block">{`python -m venv .venv\n# Activate .venv for your OS\npython -m pip install -e ".[dev]"\ncd web\nnpm ci\nnpm run build\ncd ..\npatchpilot serve`}</pre><p>Open <code>http://127.0.0.1:8000</code>. Scripted demos work without an API key or Docker. Full OS-specific instructions are in <code>docs/SETUP.md</code>.</p></section><section className="card guide-card"><div className="insight-icon"><Bot size={23} /></div><h2>Enable live model repairs</h2><p>Build the constrained test image and set your credentials in the server's environment. The browser never receives your model API key.</p><pre className="command-block">{`docker build -f Dockerfile.sandbox \\\n  -t patchpilot-sandbox:0.1 .\nexport OPENAI_API_KEY="..."\nexport PATCHPILOT_MODEL="your-model"\npatchpilot serve`}</pre><p>Select <strong>OpenAI Responses · live</strong> in the local app. The provider is wired and contract-tested. No real model calls or Docker executions were verified in the initial build environment.</p></section></div>
    <section className="card guide-card intake-guide"><div className="eyebrow">VERSION 2 / YOUR CODE</div><h2>From your repository to a reviewed patch</h2><p>Open <strong>Your repository</strong>, import a small Python module and unittest tests, define the bug and acceptance criteria, and choose the source files the agent may edit. Save it to your queue or export a repair request.</p><pre>{`patchpilot import shop-discount-rounding.patchpilot.json\npatchpilot run shop-discount-rounding --mode openai\npatchpilot inspect YOUR_RUN_ID > run.json`}</pre><p>With the app running locally, <strong>Register with local service</strong> makes the repository available without restarting. Set up the model and Docker first, then start a live repair. Back on this hosted page, use <strong>Repair runs → Import evidence</strong> to inspect the exported <code>run.json</code>. Imported claims are labeled and are not re-executed here.</p><p>Supported scope: dependency-free Python under <code>src/</code>, unittest under <code>tests/</code>, up to 60 files and a 50 KiB selected source/test context. System, network, and file operations are blocked by the intake policy.</p></section>
    <section className="card guide-card supervision"><div className="section-heading"><div><h2>Your role as supervisor</h2><p>Show efficient use of AI through the decisions and verification you can explain.</p></div><span className="outline-tag">ENGINEERING OWNERSHIP</span></div><div className="supervision-grid"><div><span>01</span><h3>Define the task</h3><p>Choose a bounded issue, state acceptance criteria, and decide which source files the agent can change.</p></div><div><span>02</span><h3>Inspect the evidence</h3><p>Read the diff, failed original regression, final test suite, and any reviewer concerns.</p></div><div><span>03</span><h3>Measure the outcome</h3><p>Record success, attempts, latency, model usage, and cost. Separate demo results from live experiments.</p></div><div><span>04</span><h3>Explain the tradeoffs</h3><p>Describe why the workflow uses typed edits, bounded retries, Docker, and a human approval gate.</p></div></div></section>
    <div className="two-column"><section className="card guide-card"><h2>Included in the source bundle</h2><ul className="feature-list"><li><CheckCircle2 size={16} />Agent service, CLI, and React dashboard</li><li><CheckCircle2 size={16} />Four repair fixtures and a prohibited-edit probe</li><li><CheckCircle2 size={16} />Automated backend and UI unit tests</li><li><CheckCircle2 size={16} />Reproducible benchmark script and measured results</li><li><CheckCircle2 size={16} />Architecture, setup, API, and evaluation guides</li><li><CheckCircle2 size={16} />Demo script and honest portfolio wording</li><li><CheckCircle2 size={16} />CI workflow and a sandbox Dockerfile</li></ul></section><section className="card guide-card roadmap"><h2>The next milestone</h2><span className="outline-tag">PLANNED</span><p>Run a real model on held-out repository issues and compare it against a single-call baseline. Only then make claims about model repair accuracy or efficiency.</p><p>GitHub issue ingestion, automatic draft PR creation, dependency-heavy projects, and production multi-user hosting are future extensions.</p><a href="https://github.com/HK0922" target="_blank" rel="noreferrer" className="text-button">Harikrishna's GitHub <ExternalLink size={13} /></a></section></div>
  </>;
}
