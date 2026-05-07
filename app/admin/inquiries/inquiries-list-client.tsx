"use client";

import { useState } from "react";
import { InquiryRow, type InquiryRowData } from "./inquiry-row";

interface Props {
  initial: InquiryRowData[];
  emptyMessage: string;
}

export function InquiriesListClient({ initial, emptyMessage }: Props) {
  const [rows, setRows] = useState(initial);

  // If the server hands us a different list (tab switch, realtime refresh),
  // sync the local state. Compare ids to avoid stomping in-flight optimistic
  // removals when the parent re-renders with the same data.
  const initialIds = initial.map((r) => r.id).join("|");
  const [knownIds, setKnownIds] = useState(initialIds);
  if (initialIds !== knownIds) {
    setRows(initial);
    setKnownIds(initialIds);
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (rows.length === 0) {
    return <p className="font-display italic text-ink-mute">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-rule-soft">
      {rows.map((row) => (
        <InquiryRow key={row.id} row={row} onDelete={removeRow} />
      ))}
    </ul>
  );
}
