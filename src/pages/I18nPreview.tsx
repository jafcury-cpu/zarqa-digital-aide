import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { dictionary, t } from "@/lib/i18n";

type Group = {
  area: string;
  entries: { key: string; value: string }[];
};

function groupByArea(entries: [string, string][]): Group[] {
  const map = new Map<string, { key: string; value: string }[]>();
  for (const [key, value] of entries) {
    const area = key.includes(".") ? key.split(".")[0] : "outros";
    if (!map.has(area)) map.set(area, []);
    map.get(area)!.push({ key, value });
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, list]) => ({
      area,
      entries: list.sort((a, b) => a.key.localeCompare(b.key)),
    }));
}

export default function I18nPreview() {
  useDocumentTitle("Dicionário i18n");
  const [query, setQuery] = useState("");

  const allEntries = useMemo(
    () => Object.entries(dictionary) as [string, string][],
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter(
      ([key, value]) =>
        key.toLowerCase().includes(q) || value.toLowerCase().includes(q),
    );
  }, [allEntries, query]);

  const groups = useMemo(() => groupByArea(filtered), [filtered]);
  const total = allEntries.length;
  const showing = filtered.length;

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <p className="text-kicker">{t("brand.panel")} · {t("brand.name")}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Dicionário de textos (pt-BR)
          </h1>
          <p className="text-sm text-muted-foreground">
            Pré-visualização das chaves do arquivo{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">src/lib/i18n.ts</code>.
            Use a busca para localizar por chave ou valor.
          </p>
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por chave ou valor..."
            className="pl-9"
            aria-label="Buscar no dicionário"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{showing} de {total} chaves</Badge>
          <Badge variant="outline">{groups.length} áreas</Badge>
        </div>

        {groups.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma chave encontrada para “{query}”.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.area} className="surface-panel space-y-3 p-5">
                <header className="flex items-center justify-between">
                  <h2 className="font-display text-lg uppercase tracking-[0.2em] text-foreground">
                    {group.area}
                  </h2>
                  <Badge variant="outline">{group.entries.length}</Badge>
                </header>
                <ul className="divide-y divide-border">
                  {group.entries.map(({ key, value }) => (
                    <li
                      key={key}
                      className="grid gap-2 py-2 md:grid-cols-[minmax(220px,1fr)_2fr] md:items-baseline md:gap-6"
                    >
                      <code className="font-mono text-xs text-accent-blue break-all">
                        {key}
                      </code>
                      <span className="text-sm text-foreground">{value}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
