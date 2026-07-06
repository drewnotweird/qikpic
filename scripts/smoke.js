#!/usr/bin/env node
/* Pre-deploy smoke test: syntax, asset integrity, referenced files,
   and the server actually serving. Exits non-zero on any failure. */
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = path.dirname(__dirname);
let failures = 0;
const fail = (msg) => { failures++; console.error("FAIL:", msg); };
const ok = (msg) => console.log("  ok:", msg);

// 1. JS syntax
for (const f of ["app.js", "server.js", "sw.js"]) {
  try {
    execFileSync(process.execPath, ["--check", path.join(repo, f)]);
    ok(`${f} parses`);
  } catch (e) {
    fail(`${f} has a syntax error`);
  }
}

// 2. assets.js integrity
try {
  const ctx = {};
  vm.createContext(ctx);
  // const declarations stay in the script's lexical scope, so read the
  // completion value instead of a context property
  const A = vm.runInContext(
    fs.readFileSync(path.join(repo, "assets.js"), "utf8") + ";QIKPIK_ASSETS", ctx);
  const expected = ["skin", "natural", "mouth", "eyes", "nose", "haircolour",
                    "hair", "beardcolour", "beard", "accessories", "glasses"];
  for (const k of expected) {
    if (!A[k] || !Array.isArray(A[k].frames) || A[k].frames.length < 14) {
      fail(`assets.js: feature "${k}" missing or too few frames`);
    }
  }
  for (const k of ["hair", "beard"]) {
    if (!A[k].mask || A[k].mask.length !== A[k].frames.length) {
      fail(`assets.js: "${k}" mask array missing or mismatched`);
    }
  }
  const nonEmpty = expected.filter((k) => A[k] && A[k].frames.some((f) => f.trim() !== ""));
  if (nonEmpty.length !== expected.length) fail("assets.js: a feature has no artwork at all");
  ok("assets.js has all 11 features with artwork and masks");
} catch (e) {
  fail("assets.js failed to evaluate: " + e.message);
}

// 3. every local file referenced by index.html exists
const html = fs.readFileSync(path.join(repo, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|#|mailto:)/.test(u))
  .map((u) => u.split("?")[0]);
for (const ref of new Set(refs)) {
  if (!fs.existsSync(path.join(repo, ref))) fail(`index.html references missing file: ${ref}`);
}
ok(`${new Set(refs).size} local references in index.html all exist`);

// 4. server serves the core files
const server = spawn(process.execPath, [path.join(repo, "server.js")], { stdio: "ignore" });
const done = (code) => { server.kill(); process.exit(code); };

setTimeout(async () => {
  try {
    for (const p of ["/", "/app.js", "/assets.js", "/style.css", "/icons/logo.svg"]) {
      const res = await fetch("http://localhost:8791" + p);
      if (!res.ok) fail(`GET ${p} -> ${res.status}`);
    }
    ok("server serves core files");
  } catch (e) {
    fail("server check failed: " + e.message);
  }
  if (failures) {
    console.error(`\n${failures} failure(s)`);
    done(1);
  } else {
    console.log("\nsmoke test passed");
    done(0);
  }
}, 600);
