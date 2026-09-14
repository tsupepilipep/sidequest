const STORAGE_KEY = "sidequest_browser_id";

/**
 * Anonymous per-browser identity used to keep one rating per person per
 * segment. Generated once and kept in localStorage.
 */
export function getBrowserId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable (private mode, blocked). Fall back to a per-load id.
    return crypto.randomUUID();
  }
}
