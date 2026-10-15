/**
 * Runs once per server start. Node-only work lives in instrumentation-node.ts behind the
 * `if` block so the edge compile of this file tree-shakes better-sqlite3 away.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
