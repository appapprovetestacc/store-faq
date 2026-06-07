import fs from "node:fs";

const r = JSON.parse(fs.readFileSync("playwright-results.json", "utf8"));
let passed = 0;
let failed = 0;
let skipped = 0;
let durationMs = 0;
const failedSpecs = [];

function walkSpec(spec, parentTitle) {
  for (const t of spec.tests || []) {
    for (const result of t.results || []) {
      durationMs += result.duration || 0;
      if (result.status === "passed") {
        passed++;
      } else if (result.status === "skipped" || t.status === "skipped") {
        skipped++;
      } else {
        failed++;
        if (failedSpecs.length < 50) {
          const errMsg =
            (result.errors && result.errors[0] && result.errors[0].message) ||
            (result.error && result.error.message) ||
            "failed";
          failedSpecs.push({
            title: (parentTitle ? parentTitle + " > " : "") + (spec.title || ""),
            error: errMsg,
          });
        }
      }
    }
  }
}

function walkSuite(suite, parentTitle) {
  const title = parentTitle
    ? parentTitle + " > " + (suite.title || "")
    : suite.title || "";
  for (const spec of suite.specs || []) walkSpec(spec, title);
  for (const child of suite.suites || []) walkSuite(child, title);
}

for (const s of r.suites || []) walkSuite(s, "");

const status = failed === 0 ? "pass" : "fail";
const runUrl =
  process.env.GITHUB_SERVER_URL &&
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_RUN_ID
    ? process.env.GITHUB_SERVER_URL +
      "/" +
      process.env.GITHUB_REPOSITORY +
      "/actions/runs/" +
      process.env.GITHUB_RUN_ID
    : null;

process.stdout.write(
  JSON.stringify({
    status,
    totals: {
      passed,
      failed,
      skipped,
      durationMs: Math.round(durationMs),
    },
    failedSpecs,
    occurredAt: new Date().toISOString(),
    ...(runUrl ? { runUrl } : {}),
  }),
);
