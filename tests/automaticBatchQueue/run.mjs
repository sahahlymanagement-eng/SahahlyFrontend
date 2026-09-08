import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

// Exercise the actual component's effects and handlers with controlled network
// responses, including requests that outlast multiple polling intervals.
const source = await readFile(new URL("../../src/pages/manager/AutomaticBatchQueue.jsx", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "jsx", format: "cjs" });
function mount() {
  const slots = [], effects = [], intervals = [], requests = [];
  let cursor = 0, first = true;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (first) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (first) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => { if (first) effects.push(fn); },
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const api = { get: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })) };
  const exports = {};
  const module = { exports };
  vm.runInNewContext(code, {
    module, exports, React: react, AbortController,
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval() {},
    require(name) {
      if (name === "react") return react;
      if (name === "react-icons/fi") return {};
      if (name === "react-toastify") return { toast: { error() {}, success() {} } };
      if (name.endsWith("/api/api")) return api;
      if (name.endsWith("/authRoutes")) return { getRoleName: () => "director" };
      if (name.endsWith("/session")) return { getStoredUser: () => ({}) };
      if (name.endsWith("/markingCost")) return { sahahlyModelLabel: String };
      throw Error(name);
    },
  });
  const render = () => { cursor = 0; const tree = module.exports.default(); first = false; return tree; };
  render();
  const cleanups = effects.map((fn) => fn());
  return { render, requests, poll: () => intervals.find(({ ms }) => ms === 10000).fn(), unmount: () => cleanups.forEach((fn) => fn?.()) };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const slow = mount();
slow.poll(); slow.poll();
assert.equal(slow.requests.length, 1, "polling must not supersede a slow initial request");
assert.equal(slow.requests[0].options.timeout, 30000);
slow.requests[0].resolve({ data: { running: null, queued: [], history: [] } });
await flush();
assert.match(JSON.stringify(slow.render()), /No automatic batch is running/);
assert.doesNotMatch(JSON.stringify(slow.render()), /Loading queue/);
slow.poll();
assert.equal(slow.requests.length, 2, "polling resumes after completion");
slow.requests[1].reject({ code: "ECONNABORTED" });
await flush();
assert.match(JSON.stringify(slow.render()), /Showing the last loaded queue/);
slow.unmount();

const failed = mount();
failed.requests[0].reject({ code: "ECONNABORTED" });
await flush();
const failedTree = JSON.stringify(failed.render());
assert.match(failedTree, /queue took too long/);
assert.doesNotMatch(failedTree, /Loading queue|No automatic batch is running/);
failed.poll();
failed.requests[1].resolve({ data: { running: null, queued: [], history: [] } });
await flush();
assert.doesNotMatch(JSON.stringify(failed.render()), /queue took too long/);
failed.poll();
failed.unmount();
assert.equal(failed.requests[2].options.signal.aborted, true, "unmount aborts the pending request");
console.log("Automatic batch queue: slow response, timeout, retry, stale data and cleanup checks passed.");
