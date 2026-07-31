const CHUNK_RETRY_KEY = "filzy:chunk-refresh";
const CHUNK_ERROR = /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk [\w-]+ failed/i;

export async function importWithRefresh(importer) {
  try {
    const module = await importer();
    sessionStorage.removeItem(CHUNK_RETRY_KEY);
    return module;
  } catch (error) {
    const message = String(error?.message || error || "");
    if (!CHUNK_ERROR.test(message)) throw error;

    const lastRefresh = Number(sessionStorage.getItem(CHUNK_RETRY_KEY) || 0);
    if (Date.now() - lastRefresh < 60_000) {
      sessionStorage.removeItem(CHUNK_RETRY_KEY);
      throw new Error("Filzy could not finish updating. Refresh the page and try again.");
    }

    sessionStorage.setItem(CHUNK_RETRY_KEY, String(Date.now()));
    const next = new URL(window.location.href);
    next.searchParams.set("_filzy_refresh", String(Date.now()));
    window.location.replace(next);
    return new Promise(() => {});
  }
}

export function clearChunkRefreshQuery() {
  const current = new URL(window.location.href);
  if (!current.searchParams.has("_filzy_refresh")) return;
  current.searchParams.delete("_filzy_refresh");
  window.history.replaceState(window.history.state, "", current);
}
