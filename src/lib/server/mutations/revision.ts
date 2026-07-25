import "server-only";

export function revisionTimestamp(revisionDate: Date | null | undefined, fallbackDate: Date): number {
  return (revisionDate ?? fallbackDate).getTime();
}
