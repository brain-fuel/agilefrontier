"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { sampleStories } from "../lib/sample";
import {
  defaultOptions,
  emptyResult,
  formatDate,
  applyOptionAssignments,
  loadPlanner,
  scheduleStories,
  type SchedulerOptions,
  type Story,
} from "../lib/scheduler";

const storageKey = "agilefrontier:v0.2.0";

type SavedState = { stories: Story[]; options: SchedulerOptions };

export default function Home() {
  const [stories, setStories] = useState<Story[]>(sampleStories);
  const [options, setOptions] = useState<SchedulerOptions>(defaultOptions);
  const [json, setJson] = useState(() => JSON.stringify(sampleStories, null, 2));
  const [jsonError, setJsonError] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState(emptyResult);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");
  const [engineError, setEngineError] = useState("");
	const [optionAssignments, setOptionAssignments] = useState("workers=4; pointsPerDay=2; sprintDays=10");
	const [optionAssignmentError, setOptionAssignmentError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const state = JSON.parse(saved) as SavedState;
          setStories(state.stories);
          setJson(JSON.stringify(state.stories, null, 2));
          setOptions({ ...defaultOptions, ...state.options });
        }
      } catch { /* A bad local draft should never prevent opening the app. */ }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, JSON.stringify({ stories, options }));
  }, [stories, options, hydrated]);

  useEffect(() => {
    let current = true;
    loadPlanner().then(() => {
      if (!current) return;
      setEngineState("ready");
    }).catch((error) => { if (current) { setEngineState("error"); setEngineError(error instanceof Error ? error.message : "Could not start Go+ planner"); } });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (engineState !== "ready") return;
    const timer = window.setTimeout(() => {
      try { setResult(scheduleStories(stories, options)); setEngineError(""); }
      catch (error) { setEngineError(error instanceof Error ? error.message : "Planning failed"); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [stories, options, engineState]);
  const totalDays = Math.max(10, Math.ceil(result.totalWorkDays + 1));
  const selectedStory = result.scheduled.find((story) => story.id === selected);
  const sprints = Math.max(1, Math.ceil(totalDays / options.sprintDays));
  const statusCounts = stories.reduce<Record<string, number>>((counts, story) => {
    counts[story.status] = (counts[story.status] ?? 0) + 1;
    return counts;
  }, {});

  const updateOption = <K extends keyof SchedulerOptions>(key: K, value: SchedulerOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

	const applyCompactOptions = () => {
		try {
			setOptions((current) => applyOptionAssignments(optionAssignments, current));
			setOptionAssignmentError("");
		} catch (error) {
			setOptionAssignmentError(error instanceof Error ? error.message : "Invalid planning assignments");
		}
	};

  const applyJson = () => {
    try {
      const decoded = JSON.parse(json) as unknown;
      const parsed = (Array.isArray(decoded) ? decoded : (decoded as { stories?: Story[] })?.stories) as Story[];
      if (!parsed.length) throw new Error("Expected an array of stories or { stories: [...] }");
      setStories(parsed);
      setJsonError("");
      setShowImport(false);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setJson(await file.text());
    setShowImport(true);
    event.target.value = "";
  };

  const exportJson = () => {
    const href = URL.createObjectURL(new Blob([JSON.stringify(stories, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "agilefrontier-stories.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const updateStory = (id: string, patch: Partial<Story>) => {
    setStories((current) => current.map((story) => story.id === id ? { ...story, ...patch } : story));
    setJson((current) => {
      try {
        const next = (JSON.parse(current) as Story[]).map((story) => story.id === id ? { ...story, ...patch } : story);
        return JSON.stringify(next, null, 2);
      } catch { return current; }
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <div><strong>Agile Frontier</strong><span>v0.2.0</span></div>
        </div>
        <nav aria-label="Application actions">
          <button className="button subtle" onClick={() => fileInput.current?.click()}>Import JSON</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importFile} />
          <button className="button subtle" onClick={exportJson}>Export</button>
          <button className="button primary" onClick={() => setShowSettings(true)}>Plan settings</button>
        </nav>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Dependency-aware delivery plan</p>
          <h1>Know what can move next.<br /><em>Protect the paths that matter.</em></h1>
          <p className="hero-copy">A live, capacity-aware view of your story graph—ordered by remaining critical-path work and bounded by the delivery frontier.</p>
        </div>
        <div className="deadline-card">
          <span>Target deadline</span>
          <label><input type="date" value={options.deadlineDate} onChange={(event) => updateOption("deadlineDate", event.target.value)} /></label>
          <p className={result.finishDate && result.finishDate > `${options.deadlineDate}T23:59:59Z` ? "late" : "on-track"}>
            <b /> Forecast finish {formatDate(result.finishDate)}
          </p>
        </div>
      </section>

      <section className="control-strip" aria-label="Planning controls">
        <label><span>Workers</span><input type="number" min="1" max="50" value={options.workers} onChange={(event) => updateOption("workers", Number(event.target.value))} /></label>
        <label><span>Points / worker / day</span><input type="number" min="0.25" step="0.25" value={options.pointsPerDay} onChange={(event) => updateOption("pointsPerDay", Number(event.target.value))} /></label>
        <label><span>Frontier depth</span><select value={options.frontierDepth ?? "all"} onChange={(event) => updateOption("frontierDepth", event.target.value === "all" ? null : Number(event.target.value))}>
          <option value="all">All future work</option><option value="0">0 · Actionable now</option><option value="1">1 degree</option><option value="2">2 degrees</option><option value="3">3 degrees</option><option value="4">4 degrees</option>
        </select></label>
        <div className="frontier-note"><span className={`pulse-dot ${engineState}`} />{engineState === "ready" ? `${result.scheduled.filter((story) => story.depth === 0).length} stories on the Gantt Frontier` : engineState === "error" ? "Go+ engine unavailable" : "Starting Go+ planning engine…"}</div>
      </section>

      {engineError && <section className="warnings" role="alert"><strong>Planner message</strong><span>{engineError}</span></section>}

      <section className="metrics" aria-label="Plan summary">
        <Metric label="Active stories" value={String(result.scheduled.length)} detail={`${result.hidden.length} beyond frontier · ${result.ignored.length} closed`} />
        <Metric label="Critical path" value={`${result.criticalPathDays.toFixed(1)}d`} detail="Longest remaining dependency chain" />
        <Metric label="Capacity use" value={`${Math.round(result.utilization * 100)}%`} detail={`${options.workers} parallel workers`} />
        <Metric label="Sprints in view" value={String(sprints)} detail={`${options.sprintDays} working days each`} />
      </section>

      {(result.warnings.length > 0) && <section className="warnings" role="alert"><strong>Graph review needed</strong>{result.warnings.map((warning) => <span key={warning}>{warning}</span>)}</section>}

      <section className="workspace">
        <div className="section-heading">
          <div><p className="eyebrow">Delivery sequence</p><h2>Gantt frontier</h2></div>
          <div className="legend" aria-label="Path urgency legend"><span><i className="red" />Start now</span><span><i className="yellow" />Watch next</span><span><i className="green" />Has room</span></div>
        </div>

        <div className="gantt-scroll">
          <div className="gantt" style={{ "--days": totalDays } as React.CSSProperties}>
            <div className="gantt-head sticky-label"><span>Story / owner</span></div>
            <div className="timeline-head">
              {Array.from({ length: sprints }, (_, index) => <div key={index} style={{ width: `${Math.min(options.sprintDays, totalDays - index * options.sprintDays) / totalDays * 100}%` }}><b>Sprint {index + 1}</b><span>{formatDate(new Date(new Date(`${options.startDate}T12:00:00Z`).getTime() + index * options.sprintDays * 1.4 * 86_400_000).toISOString())}</span></div>)}
            </div>
            {result.scheduled.map((story) => (
              <div className={`gantt-row ${selected === story.id ? "selected" : ""}`} key={story.id}>
                <button className="story-label sticky-label" onClick={() => setSelected(story.id)}>
                  <span className={`urgency-dot ${story.urgency}`} />
                  <span><b>{story.id}</b><strong>{story.title}</strong><small>{story.team ?? story.workerName} · {story.points} pts</small></span>
                </button>
                <div className="lane" onClick={() => setSelected(story.id)}>
                  {Array.from({ length: totalDays }, (_, day) => <i key={day} className={day > 0 && day % options.sprintDays === 0 ? "sprint-line" : ""} />)}
                  <button className={`bar ${story.urgency}`} style={{ left: `${story.startDay / totalDays * 100}%`, width: `${Math.max(story.durationDays / totalDays * 100, 1.5)}%` }} title={`${story.id}: ${story.start} → ${story.end}`} onClick={() => setSelected(story.id)}>
                    <span>{story.points}p</span>
                  </button>
                  {story.latestStartDay >= 0 && story.latestStartDay <= totalDays && <span className="latest-marker" style={{ left: `${story.latestStartDay / totalDays * 100}%` }} title={`Latest safe start: ${formatDate(story.latestStart)}`}><i /></span>}
                </div>
              </div>
            ))}
            {!result.scheduled.length && <div className="empty-state"><strong>Nothing is inside this frontier.</strong><span>Increase the frontier depth or import active stories.</span></div>}
          </div>
        </div>
      </section>

      <section className="backlog-section">
        <div className="section-heading"><div><p className="eyebrow">Manager workbench</p><h2>Estimates & assignments</h2></div><button className="text-button" onClick={() => setShowImport(true)}>Edit source JSON →</button></div>
        <div className="table-wrap"><table><thead><tr><th>Story</th><th>Status</th><th>Points</th><th>Team</th><th>Assignee preference</th><th>Sprint</th><th>Latest safe start</th><th>Slack</th></tr></thead><tbody>
          {result.scheduled.map((story) => <tr key={story.id} onClick={() => setSelected(story.id)}><td><b>{story.id}</b><span>{story.title}</span></td><td><span className="status-pill">{story.status}</span></td><td><input aria-label={`${story.id} points`} type="number" min="0" step="0.5" value={story.points} onChange={(event) => updateStory(story.id, { points: Number(event.target.value) })} /></td><td><input aria-label={`${story.id} team`} value={story.team ?? ""} placeholder="Unassigned" onChange={(event) => updateStory(story.id, { team: event.target.value })} /></td><td><input aria-label={`${story.id} assignee`} value={story.assignee ?? ""} placeholder={story.workerName} onChange={(event) => updateStory(story.id, { assignee: event.target.value })} /></td><td>Sprint {story.sprintNumber}</td><td>{formatDate(story.latestStart)}</td><td><span className={`slack ${story.urgency}`}>{story.slackDays.toFixed(1)}d</span></td></tr>)}
        </tbody></table></div>
        <div className="closed-summary">Status summary · {Object.entries(statusCounts).map(([status, count]) => <span key={status}>{status} {count}</span>)}</div>
      </section>

      {selectedStory && <aside className="detail-panel" aria-label="Story detail"><button className="close" aria-label="Close story detail" onClick={() => setSelected(null)}>×</button><p className="eyebrow">Depth {selectedStory.depth} · Sprint {selectedStory.sprintNumber}</p><h3>{selectedStory.title}</h3><code>{selectedStory.id}</code><div className="detail-grid"><span><small>Scheduled</small>{formatDate(selectedStory.start)} → {formatDate(selectedStory.end)}</span><span><small>Latest safe start</small>{formatDate(selectedStory.latestStart)}</span><span><small>Criticality</small><i className={`slack ${selectedStory.urgency}`}>{selectedStory.slackDays.toFixed(1)} days slack</i></span><span><small>Dependencies</small>{selectedStory.dependencies.join(", ") || "Frontier-ready"}</span></div><p>Remaining path: <b>{selectedStory.criticalDays.toFixed(1)} working days</b></p></aside>}

      {showImport && <Modal title="Story JSON" eyebrow="Import or edit" onClose={() => setShowImport(false)}><p className="modal-copy">Accepts an array or <code>{`{ "stories": [...] }`}</code>. Each story needs an <code>id</code> or <code>key</code>, plus title, links, points, and status.</p><textarea className="json-editor" spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)} />{jsonError && <p className="field-error">{jsonError}</p>}<div className="modal-actions"><button className="button subtle" onClick={() => { const source = JSON.stringify(sampleStories, null, 2); setJson(source); setJsonError(""); }}>Load sample</button><button className="button primary" onClick={applyJson}>Apply stories</button></div></Modal>}

      {showSettings && <Modal title="Planning assumptions" eyebrow="Capacity model" onClose={() => setShowSettings(false)}><div className="settings-grid"><label><span>Plan start</span><input type="date" value={options.startDate} onChange={(event) => updateOption("startDate", event.target.value)} /></label><label><span>Target deadline</span><input type="date" value={options.deadlineDate} onChange={(event) => updateOption("deadlineDate", event.target.value)} /></label><label><span>Working days / sprint</span><input type="number" min="1" value={options.sprintDays} onChange={(event) => updateOption("sprintDays", Number(event.target.value))} /></label><label><span>Depends-on label</span><input value={options.dependsOnLabel} onChange={(event) => updateOption("dependsOnLabel", event.target.value)} /></label><label><span>Reverse label</span><input value={options.dependedOnByLabel} onChange={(event) => updateOption("dependedOnByLabel", event.target.value)} /></label></div><label><span>Compact numeric overrides</span><input value={optionAssignments} onChange={(event) => setOptionAssignments(event.target.value)} placeholder="workers=4; pointsPerDay=2; sprintDays=10" /></label>{optionAssignmentError && <p className="field-error">{optionAssignmentError}</p>}<div className="modal-actions"><button className="button subtle" onClick={applyCompactOptions}>Apply compact overrides</button><button className="button subtle" onClick={() => { setStories(sampleStories); setJson(JSON.stringify(sampleStories, null, 2)); setOptions(defaultOptions); }}>Reset all</button><button className="button primary" onClick={() => setShowSettings(false)}>Use assumptions</button></div></Modal>}

      <footer><span>Agile Frontier v0.2.0</span><span>Plans stay in this browser until you export them.</span></footer>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close" aria-label={`Close ${title}`} onClick={onClose}>×</button><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</section></div>;
}
