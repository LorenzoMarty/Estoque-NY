export interface DiffEntry {
  key: string;
  before: unknown;
  after: unknown;
  status: "added" | "removed" | "changed" | "unchanged";
}

export function computeDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffEntry[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return Array.from(keys)
    .sort()
    .map((key) => {
      const beforeValue = before?.[key];
      const afterValue = after?.[key];
      let status: DiffEntry["status"] = "unchanged";
      if (!(key in (before ?? {}))) status = "added";
      else if (!(key in (after ?? {}))) status = "removed";
      else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) status = "changed";
      return { key, before: beforeValue, after: afterValue, status };
    });
}
