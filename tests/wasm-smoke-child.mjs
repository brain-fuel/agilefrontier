import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
vm.runInThisContext(await readFile(new URL("public/wasm_exec.js", root), "utf8"), { filename: "wasm_exec.js" });
const go = new globalThis.Go();
let ready;
const readyPromise = new Promise((resolve) => { ready = resolve; });
globalThis.__agilefrontierReady = ready;
const binary = await readFile(new URL("public/agilefrontier.wasm", root));
const instance = await WebAssembly.instantiate(binary, go.importObject);
void go.run(instance.instance);
await readyPromise;
const input = JSON.stringify({ stories: [{ id: "A", title: "Root", points: 2, status: "To Do" }, { id: "B", title: "Next", points: 2, status: "To Do", links: [{ type: "depends on", storyId: "A" }] }], options: { workers: 1, pointsPerDay: 2, startDate: "2026-07-21", deadlineDate: "2026-08-04", sprintDays: 10, frontierDepth: null, dependsOnLabel: "depends on", dependedOnByLabel: "is depended on by" } });
const output = JSON.parse(globalThis.agilefrontier.schedule(input));
if (output.scheduled?.length !== 2 || output.scheduled[1].startDay < output.scheduled[0].endDay) throw new Error("dependency scheduling failed");
process.stdout.write(JSON.stringify({ ready: true, scheduled: output.scheduled.length }));
process.exit(0);
