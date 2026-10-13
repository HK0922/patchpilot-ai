import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, FileCode2, FolderUp, LoaderCircle, Plus, Save, Trash2, X } from 'lucide-react';
import { download } from './utils';
import { blankDraft, bundle, exampleDraft, FORM_KEY, QUEUE_KEY, readSources, validateDraft } from './intake';
import type { RepairDraft, RepairBundle } from './intake';

function isDraft(value: unknown): value is RepairDraft {
  const d = value as RepairDraft;
  return !!d && ['id', 'projectId', 'title', 'issue', 'criteria', 'updatedAt'].every(key => typeof d[key as keyof RepairDraft] === 'string')
    && ['high', 'normal', 'low'].includes(d.priority) && ['draft', 'exported', 'registered'].includes(d.state)
    && typeof d.attempts === 'number' && typeof d.tokens === 'number'
    && Array.isArray(d.editable) && d.editable.every(x => typeof x === 'string')
    && Array.isArray(d.files) && d.files.length <= 60 && d.files.every(x => x && typeof x.path === 'string' && typeof x.source === 'string');
}
function restoreForm() {
  try { const d: unknown = JSON.parse(localStorage.getItem(FORM_KEY) || 'null'); return isDraft(d) ? d : blankDraft(); }
  catch { return blankDraft(); }
}
function restoreQueue(): RepairDraft[] {
  try { const d: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(d) ? d.filter(isDraft).slice(0, 8) : []; }
  catch { return []; }
}
interface Props {
  local: boolean; intakeReady: boolean; liveReady: boolean;
  onReplay: () => void; onGuide: () => void;
  onRegister: (request: RepairBundle, draft: RepairDraft) => Promise<void>;
}
export default function RepositoryDesk({ local, intakeReady, liveReady, onReplay, onGuide, onRegister }: Props) {
  const [draft, setDraft] = useState(restoreForm);
  const [queue, setQueue] = useState(restoreQueue);
  const [selectedFile, setSelectedFile] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [deleted, setDeleted] = useState<RepairDraft | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const errors = validateDraft(draft);
  const selected = draft.files.find(x => x.path === selectedFile) || draft.files[0];
  const sources = draft.files.filter(x => x.path.startsWith('src/') && !x.path.endsWith('__init__.py'));
  const testCount = draft.files.filter(x => x.path.startsWith('tests/') && x.path.split('/').at(-1)?.startsWith('test')).length;

  useEffect(() => {
    try { localStorage.setItem(FORM_KEY, JSON.stringify(draft)); setStorageError(''); }
    catch { setStorageError('Browser storage is unavailable or full. Keep this page open and export your request.'); }
  }, [draft]);
  function update(change: Partial<RepairDraft>) { setDraft(current => ({ ...current, ...change, updatedAt: new Date().toISOString(), state: 'draft' })); setError(''); setMessage(''); }
  function writeQueue(items: RepairDraft[]) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)); setQueue(items); return true; }
    catch { setError('Could not save the queue. Export your request or free browser storage.'); return false; }
  }
  function save(state: RepairDraft['state'] = 'draft') {
    const item = { ...draft, state, updatedAt: new Date().toISOString() };
    if (queue.length >= 8 && !queue.some(x => x.id === draft.id)) { setError('The queue holds eight requests. Remove an older draft first.'); return; }
    if (writeQueue([item, ...queue.filter(x => x.id !== item.id)])) { setDraft(item); setMessage('Saved to your browser queue.'); }
  }
  function exportRequest() {
    try { download(`${draft.projectId}.patchpilot.json`, JSON.stringify(bundle(draft), null, 2), 'application/json'); save('exported'); setMessage('Repair request downloaded. Import it into your local service to execute the repair.'); }
    catch (e) { setError((e as Error).message); }
  }
  async function importFiles(input: FileList | null) {
    if (!input?.length) return;
    setReading(true); setError(''); setMessage('');
    try {
      const result = await readSources(input);
      update({ files: result.files, editable: result.files.filter(x => x.path.startsWith('src/') && !x.path.endsWith('__init__.py')).map(x => x.path) });
      setSelectedFile(result.files[0]?.path || '');
      setMessage(`${result.files.length} Python files loaded${result.skipped ? `; ${result.skipped} unrelated files skipped` : ''}. Review the edit scope below.`);
    } catch (e) { setError((e as Error).message); }
    finally { setReading(false); if (folderInput.current) folderInput.current.value = ''; if (fileInput.current) fileInput.current.value = ''; }
  }
  async function register() {
    setRegistering(true); setError('');
    try { await onRegister(bundle(draft), draft); save('registered'); }
    catch (e) { setError((e as Error).message); }
    finally { setRegistering(false); }
  }
  function selectRequest(item: RepairDraft) { setDraft(item); setSelectedFile(item.files[0]?.path || ''); setError(''); setMessage('Request restored. You can edit its scope and criteria.'); }

  return <>
    <div className="page-heading"><div><div className="eyebrow">01 / YOUR REPOSITORY</div><h1>A real issue. Your code.</h1><p>Bring a module, define the fix, and prepare a bounded repair.</p></div><button className="button secondary" onClick={() => { setDraft(blankDraft()); setSelectedFile(''); setMessage('New request. Saved queue items remain available.'); }}><Plus size={16} />New request</button></div>
    <div className="environment-banner"><div className="environment-icon"><FolderUp size={18} /></div><div><strong>{local ? 'Connected to your local service' : 'Prepare here. Execute locally.'}</strong><p>{local ? 'Repository imports create a snapshot on your local service. Live repairs use its server-side model and Docker sandbox.' : 'Files and drafts stay in this browser. Export a request, run it with the local service, then import the evidence for review.'}</p><button className="environment-action" onClick={onReplay}>Explore an executed workflow<ArrowRight size={14} /></button></div><span className="outline-tag">{local ? 'LOCAL SERVICE' : 'BROWSER WORKSPACE'}</span></div>
    <div className="intake-grid">
      <section className="card request-editor">
        <div className="section-heading"><div><span className="eyebrow">REPAIR REQUEST</span><h2>Define the outcome</h2></div><span className="request-state">{draft.state}</span></div>
        <div className="request-fields">
          <label className="field-label" htmlFor="request-title">Issue title</label><input id="request-title" value={draft.title} maxLength={120} placeholder="e.g. Checkout totals round inconsistently" onChange={e => update({ title: e.target.value })} />
          <div className="field-row"><div><label className="field-label" htmlFor="request-id">Project ID</label><input id="request-id" value={draft.projectId} maxLength={49} placeholder="shop-rounding" onChange={e => update({ projectId: e.target.value })} /></div><div><label className="field-label" htmlFor="request-priority">Priority</label><select id="request-priority" value={draft.priority} onChange={e => update({ priority: e.target.value as RepairDraft['priority'] })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></div></div>
          <label className="field-label" htmlFor="request-issue">Behavior to fix</label><textarea id="request-issue" rows={4} value={draft.issue} maxLength={3500} placeholder="What happens now? What should happen? Include a reproduction." onChange={e => update({ issue: e.target.value })} />
          <label className="field-label" htmlFor="request-criteria">Acceptance criteria</label><textarea id="request-criteria" rows={3} value={draft.criteria} maxLength={2900} placeholder="One observable requirement per line" onChange={e => update({ criteria: e.target.value })} />
          <div className="import-region"><div><span className="eyebrow">REPOSITORY SNAPSHOT</span><h3>{draft.files.length ? `${draft.files.length} files in scope` : 'Add source and tests'}</h3><p>Pure Python modules under src/ and unittest tests under tests/. Select a small, dependency-free module.</p></div>
            <input ref={folderInput} className="visually-hidden" id="repository-folder" type="file" multiple aria-label="Choose repository folder" {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={e => void importFiles(e.target.files)} />
            <input ref={fileInput} className="visually-hidden" id="repository-files" type="file" multiple accept=".py" aria-label="Select Python files" onChange={e => void importFiles(e.target.files)} />
            <div className="import-actions"><button className="button secondary" disabled={reading} onClick={() => folderInput.current?.click()}>{reading ? <LoaderCircle size={15} className="spin" /> : <FolderUp size={16} />}Choose folder</button><button className="text-button" disabled={reading} onClick={() => fileInput.current?.click()}>Select files instead</button></div>
            <button className="text-button example-action" onClick={() => { const d = exampleDraft(); setDraft(d); setSelectedFile(d.files[0].path); setMessage('Example request loaded. It has not been repaired or executed.'); setError(''); }}>Load a checkout example<ArrowRight size={13} /></button>
          </div>
          {sources.length > 0 && <fieldset className="scope-fieldset"><legend>Files the agent may edit</legend>{sources.map(file => <label key={file.path}><input type="checkbox" checked={draft.editable.includes(file.path)} onChange={e => update({ editable: e.target.checked ? [...draft.editable, file.path] : draft.editable.filter(x => x !== file.path) })} /><span className="mono">{file.path}</span></label>)}<p>Existing tests are read-only. A new regression test must reproduce the bug before a patch can pass.</p></fieldset>}
          <details className="run-config"><summary>Repair budgets<ChevronRight size={14} /></summary><div className="field-row"><div><label className="field-label" htmlFor="request-attempts">Max repair attempts</label><select id="request-attempts" value={draft.attempts} onChange={e => update({ attempts: +e.target.value })}>{[1, 2, 3, 4].map(x => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="field-label" htmlFor="request-tokens">Model token ceiling</label><select id="request-tokens" value={draft.tokens} onChange={e => update({ tokens: +e.target.value })}>{[16000, 30000, 60000].map(x => <option key={x} value={x}>{x.toLocaleString()}</option>)}</select></div></div></details>
          <div className="request-actions"><button className="button secondary" onClick={() => save()}><Save size={15} />Save to queue</button><button className="button primary" disabled={errors.length > 0 || reading} onClick={exportRequest}><ArrowDownToLine size={15} />Export repair request</button></div>
          {local && <button className="button secondary full register-action" disabled={!intakeReady || errors.length > 0 || reading || registering} onClick={() => void register()}>{registering ? <LoaderCircle className="spin" size={15} /> : <ArrowRight size={15} />}Register with local service</button>}
          <p className="field-hint">Drafts and source snapshots are saved in this browser. Exporting creates a file; it does not execute Python or call a model.</p>
        </div>
      </section>
      <div className="intake-side">
        <section className="readiness-panel"><div className="card-title"><h2>Before the agent runs</h2><span className="counter">{errors.length ? 'INCOMPLETE' : 'READY TO EXPORT'}</span></div><div className="readiness-row"><span>{draft.files.length ? <Check size={15} /> : '01'}</span><div><strong>Repository context</strong><p>{draft.files.length ? `${sources.length} source modules · ${testCount} test files` : 'Source, existing tests, and a narrow edit scope.'}</p></div></div><div className="readiness-row"><span>{draft.issue.length >= 10 && draft.criteria.trim() ? <Check size={15} /> : '02'}</span><div><strong>Expected behavior</strong><p>Describe a reproducible bug and explicit acceptance criteria.</p></div></div><div className="readiness-row"><span>{liveReady ? <Check size={15} /> : '03'}</span><div><strong>Execution environment</strong><p>{liveReady ? 'Live model and Docker sandbox configured.' : 'The local service needs a server-side API key, model, and Docker image for live repairs.'}</p></div></div>
          {errors.length > 0 && <details className="readiness-errors"><summary>{errors.length} items to complete</summary><ul>{errors.map(x => <li key={x}>{x}</li>)}</ul></details>}
          <button className="text-button" onClick={onGuide}>Open local setup guide<ArrowRight size={13} /></button>
        </section>
        {selected && <section className="card source-preview"><div className="section-heading"><div><span className="eyebrow">FILE INSPECTION</span><h2>Review the context</h2></div></div><label className="visually-hidden" htmlFor="preview-file">Preview file</label><select id="preview-file" value={selected.path} onChange={e => setSelectedFile(e.target.value)}>{draft.files.map(x => <option key={x.path} value={x.path}>{x.path}</option>)}</select><pre aria-label="Selected source file"><code>{selected.source || '# Empty package initializer'}</code></pre><div className="diff-footer"><FileCode2 size={13} />{draft.editable.includes(selected.path) ? 'Editable source' : 'Read-only context'}</div></section>}
        <section className="issue-queue"><div className="card-title"><h2>Your issue queue</h2><span className="counter">{queue.length} / 8</span></div><p className="queue-description">Saved on this browser. Export a request to move it between devices.</p>{queue.length ? <div className="queue-list">{[...queue].sort((a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority])).map(item => <div className="queue-row" key={item.id}><button className="queue-open" onClick={() => selectRequest(item)}><span className={`priority-mark ${item.priority}`}>{item.priority}</span><strong>{item.title || 'Untitled repair request'}</strong><small>{item.projectId || 'No project ID'} · {item.state}</small></button><button className="icon-button" aria-label={`Delete ${item.title || 'untitled request'}`} onClick={() => { if (writeQueue(queue.filter(x => x.id !== item.id))) { setDeleted(item); setMessage('Request removed from the queue.'); } }}><Trash2 size={15} /></button></div>)}</div> : <p className="queue-empty">Your first real repair starts here.<br />Save a request to return to it later.</p>}{deleted && <button className="text-button" onClick={() => { if (writeQueue([deleted, ...queue].slice(0, 8))) { setDeleted(null); setMessage('Request restored.'); } }}>Undo removal</button>}</section>
      </div>
    </div>
    {(message || error || storageError) && <div className={`desk-notice ${error || storageError ? 'notice-error' : ''}`} role={error || storageError ? 'alert' : 'status'}><span>{error || storageError || message}</span><button className="icon-button" aria-label="Dismiss workspace notice" onClick={() => { setError(''); setMessage(''); setStorageError(''); }}><X size={16} /></button></div>}
  </>;
}
