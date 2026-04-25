import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { dictionary, t } from "@/lib/i18n";
import { getUsage, getUsageCount } from "@/lib/i18n-usage";
import { buildI18nExport, type ExportFormat } from "@/lib/i18n-export";
import { toast } from "sonner";


function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
  const [area, setArea] = useState<string>("__all__");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const selectedOccurrences = useMemo(
    () => (selectedKey ? getUsage(selectedKey) : []),
    [selectedKey],
  );
  const selectedValue = selectedKey
    ? (dictionary as Record<string, string>)[selectedKey]
    : undefined;

  const allEntries = useMemo(
    () => Object.entries(dictionary) as [string, string][],
    [],
  );

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const [key] of allEntries) {
      set.add(key.includes(".") ? key.split(".")[0] : "outros");
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allEntries]);

  const byArea = useMemo(() => {
    if (area === "__all__") return allEntries;
    return allEntries.filter(
      ([key]) =>
        (key.includes(".") ? key.split(".")[0] : "outros") === area,
    );
  }, [allEntries, area]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return byArea;
    return byArea.filter(
      ([key, value]) =>
        key.toLowerCase().includes(q) || value.toLowerCase().includes(q),
    );
  }, [byArea, query]);

  const groups = useMemo(() => groupByArea(filtered), [filtered]);
  const total = allEntries.length;
  const showing = filtered.length;
  const areaCount = byArea.length;

  function handleExport(
    format: ExportFormat,
    entries?: ReadonlyArray<readonly [string, string]>,
  ) {
    try {
      const out = buildI18nExport(format, entries);
      downloadFile(out.filename, out.content, out.mime);
      toast.success(
        `Exportado ${out.totalKeys} chave${out.totalKeys === 1 ? "" : "s"} (${format.toUpperCase()}).`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao exportar.";
      toast.error("Falha ao exportar dicionário", { description: message });
      if (import.meta.env?.DEV) console.error("[i18n-export]", err);
    }
  }

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

        <div className="flex flex-wrap items-center gap-2">
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="h-9 w-[200px]" aria-label="Filtrar por área">
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as áreas</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleExport("json", filtered)}
          >
            <Download className="mr-2 size-4" />
            JSON (visível)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv", filtered)}
          >
            <Download className="mr-2 size-4" />
            CSV (visível)
          </Button>

          {area !== "__all__" && (
            <>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleExport("json", byArea)}
              >
                <Download className="mr-2 size-4" />
                JSON da área “{area}”
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleExport("csv", byArea)}
              >
                <Download className="mr-2 size-4" />
                CSV da área “{area}”
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleExport("json")}
          >
            <Download className="mr-2 size-4" />
            Tudo (JSON)
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => handleExport("csv")}
          >
            <Download className="mr-2 size-4" />
            Tudo (CSV)
          </Button>

          <span className="self-center text-xs text-muted-foreground">
            Visível: {filtered.length}
            {area !== "__all__" ? ` · Área: ${areaCount}` : ""} · Total: {total}
          </span>
        </div>

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
                  {group.entries.map(({ key, value }) => {
                    const usageCount = getUsageCount(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className="grid w-full gap-2 rounded py-2 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(220px,1fr)_2fr_auto] md:items-baseline md:gap-6"
                          aria-label={`Ver ocorrências de ${key}`}
                        >
                          <code className="font-mono text-xs text-accent-blue break-all">
                            {key}
                          </code>
                          <span className="text-sm text-foreground">{value}</span>
                          <Badge
                            variant={usageCount === 0 ? "destructive" : "outline"}
                            className="justify-self-start md:justify-self-end"
                          >
                            {usageCount} uso{usageCount === 1 ? "" : "s"}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={selectedKey !== null}
        onOpenChange={(open) => !open && setSelectedKey(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader className="space-y-2">
            <SheetTitle className="break-all font-mono text-sm text-accent-blue">
              {selectedKey}
            </SheetTitle>
            <SheetDescription className="text-foreground">
              {selectedValue ?? "(sem valor)"}
            </SheetDescription>
            <div className="pt-2">
              <Badge variant="outline">
                {selectedOccurrences.length} ocorrência
                {selectedOccurrences.length === 1 ? "" : "s"}
              </Badge>
            </div>
          </SheetHeader>

          <div className="mt-6 max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-2">
            {selectedOccurrences.length === 0 ? (
              <p className="rounded-md border border-dashed border-destructive/40 p-4 text-sm text-muted-foreground">
                Nenhum uso encontrado em <code>src/</code>. A chave pode estar
                órfã — considere remover do dicionário.
              </p>
            ) : (
              selectedOccurrences.map((occ, idx) => (
                <div
                  key={`${occ.file}-${occ.line}-${idx}`}
                  className="surface-panel space-y-1 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="font-mono text-xs text-accent-blue break-all">
                      {occ.file}
                    </code>
                    <Badge variant="outline">linha {occ.line}</Badge>
                  </div>
                  <pre className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                    {occ.snippet}
                  </pre>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
