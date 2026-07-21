import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);

test("executes dependency scheduling through the shipped wasm boundary", async () => {
  const { stdout } = await run(process.execPath, [new URL("wasm-smoke-child.mjs", import.meta.url).pathname]);
  assert.deepEqual(JSON.parse(stdout), { ready: true, scheduled: 2 });
});
