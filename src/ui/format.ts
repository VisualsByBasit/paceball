/** An error's own message, or whatever was thrown, as text. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** When a delivery was saved, as History and Compare list it: "Tue 23 Sept · 14:05". */
export function formatWhen(t: number): string {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}
