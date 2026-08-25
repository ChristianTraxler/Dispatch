// Decides which tickets show an "activity" marker in the two tickets lists.
//
// Unread messages alone are not enough: a status change leaves no message
// behind, so a client who was pushed "Fixing Errors" would open the dashboard
// and see nothing marked. The stage timestamps are compared against a
// per-viewer "last opened" mark instead.

/** Newest of a set of nullable timestamps, or null if all are null. */
function newest(...dates: (Date | null | undefined)[]): Date | null {
  let max: Date | null = null;
  for (const d of dates) {
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

/**
 * True when `at` happened after the viewer last opened the ticket.
 *
 * A null `lastViewedAt` deliberately returns FALSE rather than true. The
 * column was added to live data, so every pre-existing ticket starts null —
 * treating that as "unseen" would light up every ticket in the list the first
 * time anyone loaded it, which is exactly when the marker most needs to mean
 * something. Tracking begins once a ticket has been opened.
 */
function happenedSinceView(at: Date | null, lastViewedAt: Date | null): boolean {
  if (!at || !lastViewedAt) return false;
  return at > lastViewedAt;
}

export interface ClientActivityInput {
  unreadCount: number;
  clientLastViewedAt: Date | null;
  /** Stage timestamps the admin drives — the ones the client gets pushed about. */
  firstViewedAt: Date | null;
  reviewingStartedAt: Date | null;
  fixingStartedAt: Date | null;
  fixedAt: Date | null;
}

/** Has anything happened on this ticket the client has not seen? */
export function clientHasActivity(t: ClientActivityInput): boolean {
  if (t.unreadCount > 0) return true;
  const lastStage = newest(
    t.firstViewedAt,
    t.reviewingStartedAt,
    t.fixingStartedAt,
    t.fixedAt,
  );
  return happenedSinceView(lastStage, t.clientLastViewedAt);
}

export interface AdminActivityInput {
  unreadCount: number;
  adminLastViewedAt: Date | null;
  /**
   * Null means the ticket has never been opened in the admin panel. Unlike
   * adminLastViewedAt this is real pre-existing data, so it can safely stand
   * in for "brand new, needs attention" without flagging historical tickets.
   */
  firstViewedAt: Date | null;
  /** Client-driven events. Status changes are excluded — those are the admin's own. */
  reopenedAt: Date | null;
  confirmedAt: Date | null;
}

/** Has anything happened on this ticket the admin has not seen? */
export function adminHasActivity(t: AdminActivityInput): boolean {
  if (t.unreadCount > 0) return true;
  if (!t.firstViewedAt) return true;
  return happenedSinceView(newest(t.reopenedAt, t.confirmedAt), t.adminLastViewedAt);
}
