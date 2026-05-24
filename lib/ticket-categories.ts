// Single source of truth for ticket categories. Mirrors the TicketCategory
// enum in prisma/schema.prisma — keep the two in sync when adding values.

export const TICKET_CATEGORIES = [
  { value: "BUG", label: "Bug — something's broken" },
  { value: "CONTENT", label: "Content — text or image change" },
  { value: "UPDATE", label: "Update — add or change something" },
  { value: "FEATURE", label: "Feature request" },
  { value: "QUESTION", label: "Question — not urgent" },
  { value: "URGENT", label: "Urgent — site is down" },
] as const;

export type TicketCategoryValue = (typeof TICKET_CATEGORIES)[number]["value"];

export const TICKET_CATEGORY_VALUES = TICKET_CATEGORIES.map((c) => c.value);

export function isTicketCategory(value: string): value is TicketCategoryValue {
  return (TICKET_CATEGORY_VALUES as readonly string[]).includes(value);
}

// Compact label (drops the "— …" descriptor) for header chips and dropdowns.
export function categoryShortLabel(value: string): string {
  const found = TICKET_CATEGORIES.find((c) => c.value === value);
  return found ? found.label.split(" — ")[0] : value;
}
