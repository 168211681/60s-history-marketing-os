"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function LocalTime({ value }: { value: string | null }) {
  const client = useSyncExternalStore(subscribe, () => true, () => false);
  if (!value) return <span>None</span>;
  const label = client ? new Date(value).toLocaleString() : `${value.slice(0, 16).replace("T", " ")} UTC`;
  return <time dateTime={value}>{label}</time>;
}
