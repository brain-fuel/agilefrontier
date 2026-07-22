# Agile Frontier

Agile Frontier turns a JSON story graph into a dependency-safe, capacity-aware
Gantt forecast. It highlights remaining paths by deadline slack, calculates the
latest safe start for every story, and lets managers trim the view to N graph
degrees beyond the currently actionable Gantt Frontier.

The scheduling engine is authored in Go+ and shipped to the browser as
WebAssembly. React owns rendering, import/export, and device-local persistence;
it does not reimplement planning semantics.

## Story JSON

Import an array or `{ "stories": [...] }`. The compact contract is:

```json
[
  {
    "id": "API-118",
    "title": "Expose unified customer profile",
    "points": 5,
    "status": "To Do",
    "links": [{ "type": "depends on", "storyId": "DATA-204" }]
  }
]
```

`key` may replace `id`, `summary` may replace `title`, and `storyPoints` may
replace `points`. `dependsOn`/`dependencies` arrays are also accepted. Optional
`team`, `assignee`, `sprint`, and `labels` fields support manager workflows.
The two link labels are configurable and reciprocal: `A depends on B`, while
`A is depended on by B` means B depends on A.

Statuses `Done`, `Canceled`, and `Cancelled` are omitted and considered
satisfied. Every other status is active.

## Planning semantics

- Work duration is `points / points-per-worker-day` with a half-day minimum.
- Active dependencies form a directed graph; missing references and cycles are
  reported rather than silently reordered.
- Ready stories are ranked by longest remaining downstream work. A deterministic
  list scheduler assigns them to the earliest available worker without starting
  dependents before prerequisites finish.
- The Gantt Frontier is graph depth zero: active work with no unresolved active
  dependency. Frontier depth N includes at most N downstream dependency hops.
- Latest safe start is the target deadline minus the story's full remaining
  downstream path. Slack of one day or less is red, up to half a sprint is
  yellow, and the rest is green.
- Working calendars skip Saturday and Sunday. Sprint length defaults to ten
  working days, and capacity defaults to two points per worker per day.

## Go+ and WebAssembly

The source of truth is [`planner/planner.gp`](planner/planner.gp). It uses
exhaustive sums for status, urgency, and planning outcomes plus refined worker,
velocity, and sprint units. Generated Go is committed for reproducible ordinary
Go builds. [`cmd/agilefrontierwasm/main.gp`](cmd/agilefrontierwasm/main.gp)
publishes the narrow JSON boundary consumed by the page.

```bash
./scripts/build-wasm.sh  # regenerate Go and public/agilefrontier.wasm
go test ./planner
npm install
npm test
npm run dev
```

The tests execute both the native Go+ engine and the exact shipped WebAssembly
binary. Release version: **v0.2.0**.

The planning-settings dialog also accepts compact numeric assignments such as
`workers=6; pointsPerDay=3; sprintDays=12`. They are parsed inside the Go+/WASM
engine by `goforge.dev/participle`, so grammar identity, FIRST evidence, and
parser output remain linked across the package boundary.
