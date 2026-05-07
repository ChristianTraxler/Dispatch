"use client";

import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function PullToRefresh({ children }: Props) {
  return <>{children}</>;
}
