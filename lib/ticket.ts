// Pure helpers shared between server fetches and client-side renders.

export function ticketNumber(id: string, createdAt: Date | string): string {
  const d = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const tail = id.slice(-4).toUpperCase();
  return `DSP-${yyyy}-${mm}-${dd}-${tail}`;
}
