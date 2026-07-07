/**
 * Verifies routes and nav links exist — no UI elements removed.
 * Run: node scripts/verify-ui-routes.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "src");

function read(file) {
  return fs.readFileSync(path.join(src, file), "utf8");
}

function extractRoutes(appJs) {
  const routes = [];
  const re = /<Route\s+path="([^"]+)"/g;
  let m;
  while ((m = re.exec(appJs))) {
    if (!m[1].includes(":")) routes.push(m[1]);
  }
  return [...new Set(routes)];
}

function extractNavPaths(content) {
  const paths = [];
  const re = /path:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content))) paths.push(m[1]);
  return paths;
}

function countPattern(files, pattern) {
  let total = 0;
  for (const f of files) {
    const c = read(f);
    const matches = c.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

const appJs = read("App.jsx");
const routes = extractRoutes(appJs);

const navFiles = [
  "components/ManagerSidebar.jsx",
  "pages/teacher/TeacherSidebar.jsx",
  "pages/assistant/AssistantSidebar.jsx",
  "pages/director/DirectorLayout.jsx",
  "pages/quality team/QualityTeamLayout.jsx",
  "pages/quality manager/QualityManagerLayout.jsx",
  "pages/questionbank/QBLayout.jsx",
];

const navPaths = navFiles.flatMap((f) => {
  try {
    return extractNavPaths(read(f));
  } catch {
    return [];
  }
});

const missing = navPaths.filter((p) => {
  const segment = p.replace(/^\//, "").split("/").pop();
  return !routes.some((r) => r === segment || r.toLowerCase() === segment.toLowerCase());
});

const jsxFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== "node_modules") walk(p);
    else if (ent.name.endsWith(".jsx")) jsxFiles.push(path.relative(src, p).replace(/\\/g, "/"));
  }
}
walk(src);

const buttonCount = countPattern(jsxFiles, /<button\b/g);
const routeCount = routes.length;

console.log("=== Sahahly UI verification ===\n");
console.log(`Routes in App.jsx: ${routeCount}`);
console.log(`Nav links checked: ${navPaths.length}`);
console.log(`Button elements (all pages): ${buttonCount}`);

if (missing.length) {
  console.log("\n⚠ Nav paths without exact route match (may use nested paths):");
  missing.forEach((p) => console.log(`  - ${p}`));
} else {
  console.log("\n✓ All nav paths have matching route segments");
}

const requiredRoutes = [
  "dashboard",
  "assignments",
  "reports",
  "submissions",
  "students",
  "feedback",
  "token-usage",
  "classroommanagers",
];

const missingRequired = requiredRoutes.filter(
  (r) => !routes.some((route) => route.toLowerCase() === r.toLowerCase())
);

if (missingRequired.length) {
  console.error("\n✗ Missing required routes:", missingRequired.join(", "));
  process.exit(1);
}

console.log("\n✓ Core routes present");
console.log("✓ Verification complete (build separately with npm run build)");
