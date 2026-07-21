// Browser wire contract for the Go+ WebAssembly planner. All scheduling,
// validation, dependency, frontier, criticality, and calendar semantics live
// in planner/planner.gp; this file only loads the module and decodes its output.
export type StoryStatus = "Done" | "Canceled" | string;
export type StoryLink = { type?: string; label?: string; storyId?: string; target?: string; key?: string };
export type Story = {
  id: string;
  key?: string;
  title: string;
  summary?: string;
  points: number;
  storyPoints?: number;
  status: StoryStatus;
  team?: string;
  assignee?: string;
  sprint?: string;
  labels?: string[];
  links?: StoryLink[];
  dependsOn?: string[];
  dependencies?: string[];
};
export type SchedulerOptions = { workers: number; pointsPerDay: number; startDate: string; deadlineDate: string; sprintDays: number; frontierDepth: number | null; dependsOnLabel: string; dependedOnByLabel: string };
export type ScheduledStory = Story & { start: string; end: string; startDay: number; endDay: number; durationDays: number; worker: number; workerName: string; sprintNumber: number; criticalDays: number; depth: number; dependencies: string[]; isCritical: boolean; latestStart: string; latestStartDay: number; slackDays: number; urgency: "red" | "yellow" | "green" };
export type ScheduleResult = { scheduled: ScheduledStory[]; ignored: Story[]; hidden: Story[]; warnings: string[]; cycles: string[][]; totalWorkDays: number; criticalPathDays: number; finishDate: string | null; utilization: number };

const dayMs = 86_400_000;
export const defaultOptions: SchedulerOptions = { workers: 4, pointsPerDay: 2, startDate: new Date().toISOString().slice(0, 10), deadlineDate: new Date(Date.now() + 56 * dayMs).toISOString().slice(0, 10), sprintDays: 10, frontierDepth: null, dependsOnLabel: "depends on", dependedOnByLabel: "is depended on by" };
export const emptyResult: ScheduleResult = { scheduled: [], ignored: [], hidden: [], warnings: [], cycles: [], totalWorkDays: 0, criticalPathDays: 0, finishDate: null, utilization: 0 };

declare global {
  interface Window {
    Go: new () => { importObject: WebAssembly.Imports; run(instance: WebAssembly.Instance): Promise<void> };
    agilefrontier?: { schedule(input: string): string };
    __agilefrontierReady?: () => void;
  }
}

let modulePromise: Promise<void> | undefined;

export function loadPlanner() {
  if (typeof window === "undefined") return Promise.reject(new Error("WebAssembly requires a browser"));
  if (window.agilefrontier) return Promise.resolve();
  if (modulePromise) return modulePromise;
  modulePromise = new Promise<void>((resolve, reject) => {
    window.__agilefrontierReady = () => resolve();
    const boot = async () => {
      try {
        if (!window.Go) await loadScript("/wasm_exec.js");
        const go = new window.Go();
        const response = await fetch("/agilefrontier.wasm");
        const result = await WebAssembly.instantiateStreaming(response, go.importObject);
        void go.run(result.instance);
      } catch (error) { reject(error); }
    };
    void boot();
  });
  return modulePromise;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

export function scheduleStories(stories: Story[], options: SchedulerOptions): ScheduleResult {
  if (!window.agilefrontier) throw new Error("Go+ planning engine is not ready");
  const decoded = JSON.parse(window.agilefrontier.schedule(JSON.stringify({ stories, options }))) as ScheduleResult & { error?: string };
  if (decoded.error) throw new Error(decoded.error);
  return decoded;
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
