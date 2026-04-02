import { ComponentType, LazyExoticComponent, Suspense, useEffect, useRef, useState } from "react";
import { LoadingPanel } from "@/components/zarqa/loading-panel";

type DeferredLazySectionProps = {
  component: LazyExoticComponent<ComponentType>;
  minHeightClassName?: string;
};

export function DeferredLazySection({ component: Component, minHeightClassName = "min-h-[320px]" }: DeferredLazySectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldRender) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [shouldRender]);

  return (
    <div ref={containerRef} className={minHeightClassName}>
      {shouldRender ? (
        <Suspense fallback={<LoadingPanel lines={4} />}>
          <Component />
        </Suspense>
      ) : (
        <LoadingPanel lines={4} />
      )}
    </div>
  );
}