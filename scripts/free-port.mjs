#!/usr/bin/env node
/**
 * Best-effort: free a TCP port (macOS/Linux with `lsof`).
 * SIGTERM first, then SIGKILL anything still listening — old APIs often ignore SIGTERM.
 */
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = process.argv[2] ?? "8788";

function pidsOnPort(p) {
  try {
    const out = execFileSync("lsof", ["-ti", `:${p}`], {
      encoding: "utf8",
      maxBuffer: 512 * 1024,
    }).trim();
    return out ? out.split(/\s+/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function killPids(pids, sig) {
  let n = 0;
  for (const s of pids) {
    const pid = Number(s);
    if (!Number.isFinite(pid)) continue;
    try {
      process.kill(pid, sig);
      n++;
    } catch {
      /* ignore */
    }
  }
  return n;
}

const before = pidsOnPort(port);
if (before.length === 0) {
  console.log(`free-port: nothing on :${port} (or lsof unavailable — free the port manually)`);
  process.exit(0);
}

const t1 = killPids(before, "SIGTERM");
console.log(`free-port: SIGTERM → ${t1} process(es) on :${port}`);

await delay(450);

const after = pidsOnPort(port);
if (after.length > 0) {
  const t2 = killPids(after, "SIGKILL");
  console.log(`free-port: SIGKILL → ${t2} process(es) still on :${port}`);
} else {
  console.log(`free-port: port ${port} is free`);
}
