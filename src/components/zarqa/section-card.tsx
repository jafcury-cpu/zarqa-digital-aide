import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionCardProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionCard({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("surface-panel overflow-hidden border-border/90 bg-panel", className)}>
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            {eyebrow ? <p className="text-kicker">{eyebrow}</p> : null}
            <div>
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">{title}</CardTitle>
              {description ? <CardDescription className="mt-1 text-sm text-muted-foreground">{description}</CardDescription> : null}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
