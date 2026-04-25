import { Skeleton } from "@/components/ui/skeleton";

export function LoadingPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div className="surface-panel space-y-4 p-5">
      <Skeleton className="h-3 w-24 bg-muted" />
      <Skeleton className="h-8 w-1/2 bg-muted" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full bg-muted" />
        ))}
      </div>
    </div>
  );
}
