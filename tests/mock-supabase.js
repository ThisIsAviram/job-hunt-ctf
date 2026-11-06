// Minimal supabase-js stand-in that forwards to the test harness (backed by PGlite + the real schema).
export function createClient(url, key, opts = {}) {
  const sk = (opts.auth && opts.auth.storageKey) || "sb-mock";
  const getS = () => { try { return JSON.parse(localStorage.getItem(sk)); } catch (e) { return null; } };
  const setS = s => localStorage.setItem(sk, JSON.stringify(s));
  const call = async (path, body) => { const r = await fetch("/__mock/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, session: getS() }) }); return r.json(); };
  const auth = {
    async getSession() { return { data: { session: getS() } }; },
    async signInAnonymously() { const s = { user: { id: crypto.randomUUID(), is_anonymous: true, user_metadata: {} } }; setS(s); return { data: { session: s }, error: null }; },
    async signInWithOAuth() { setS({ user: { id: "00000000-0000-0000-0000-00000000000a", is_anonymous: false, user_metadata: { user_name: window.__MOCK_GH || "ThisIsAviram" } } }); location.reload(); return {}; },
    async signOut() { localStorage.removeItem(sk); return {}; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
  };
  function from(table) {
    const q = { table, op: "select", filters: [], order: null, limit: null, single: false, values: null, returning: false };
    const b = {
      select() { if (q.op !== "select") q.returning = true; return b; },
      insert(v) { q.op = "insert"; q.values = v; return b; },
      update(v) { q.op = "update"; q.values = v; return b; },
      delete() { q.op = "delete"; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(c, o) { q.order = [c, !(o && o.ascending === false)]; return b; },
      limit(n) { q.limit = n; return b; },
      single() { q.single = true; return b; },
      then(res, rej) { return call("table", { q }).then(res, rej); }
    };
    return b;
  }
  return { auth, from, rpc: (name, args) => call("rpc", { name, args }) };
}
