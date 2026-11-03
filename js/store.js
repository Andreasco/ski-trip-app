// The group's shared data, on Supabase. The publishable key is meant to be public:
// the tables are closed and only functions that check a personal code can reach them.
// The secret service_role key must never go in the site.
globalThis.SUPABASE = { url: "https://ybjqustegnbdgxmzflyn.supabase.co", publishableKey: "sb_publishable_ccQJvgfPlQaIzbfi__0sSw_vBqMeWOu" };

globalThis.store = (() => {
  const SESSION = "discesa-session";
  const CACHE = "discesa-cache";
  const load = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  };
  const keep = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* blocked storage only means asking again next time */ }
  };
  const EMPTY = { people: [], pastTrips: [], photos: [], quotes: [], votes: [], proposals: [] };
  let session = load(SESSION);
  let data = { ...EMPTY, ...load(CACHE) };

  const call = async (name, args, code = session?.code) => {
    if (!globalThis.SUPABASE.url) throw new Error("not_configured");
    const response = await fetch(`${globalThis.SUPABASE.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: globalThis.SUPABASE.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: code, ...args }),
      // A project waking from a pause, or a weak signal, must not leave a button waiting for ever.
      // Older iPhones (iOS 15) lack this, and simply wait.
      signal: AbortSignal.timeout?.(12000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(body?.message || "request_failed"), { refused: true });
    return body;
  };

  const api = {
    get session() {
      return session;
    },

    // Who a code belongs to, without entering yet.
    identify: (code) => call("login", {}, code),
    async login(code) {
      session = { code, ...(await call("login", {}, code)) };
      keep(SESSION, session);
    },
    logout() {
      session = null;
      data = EMPTY;
      keep(SESSION, null);
      keep(CACHE, null);
    },

    // False means the last downloaded data is showing. A refused code also ends the session.
    async refresh() {
      try {
        data = { ...EMPTY, ...(await call("read_all", {})) };
        keep(CACHE, data);
        return true;
      } catch (error) {
        if (error.message === "bad_code") api.logout();
        return false;
      }
    },

    listPeople: () => data.people,
    listPastTrips: () => data.pastTrips,
    listPhotos: () => data.photos,
    readPhoto: (id) => call("read_photo", { p_id: id }),
    listQuotes: () => data.quotes,
    listVotes: () => data.votes,
    listProposals: () => data.proposals,

    async saveQuote(quote) {
      await call("save_quote", { p_quote: quote });
      await api.refresh();
    },
    async deleteQuote(id) {
      await call("delete_quote", { p_id: id });
      await api.refresh();
    },
    async saveVote({ ranking, attending }) {
      await call("save_vote", { p_ranking: ranking, p_attending: attending });
      await api.refresh();
    },
    async saveProposal(text) {
      await call("save_proposal", { p_text: text });
      await api.refresh();
    },
    async setProposalStatus(id, status) {
      await call("set_proposal_status", { p_id: id, p_status: status });
      await api.refresh();
    },
  };
  return api;
})();
