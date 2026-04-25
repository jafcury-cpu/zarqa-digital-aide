import { useEffect, useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { dictionary, t } from "@/lib/i18n";
import { getUsage, getUsageCount } from "@/lib/i18n-usage";
import {
  buildI18nExport,
  buildI18nXlsxExport,
} from "@/lib/i18n-export";
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
  const [area, setArea] = useState<string>(() => {
    if (typeof window === "undefined") return "__all__";
    try {
      const raw = window.localStorage.getItem("i18n-preview:area");
      if (raw && typeof raw === "string") return raw;
    } catch {
      /* ignore */
    }
    return "__all__";
  });
  const [combineSearch, setCombineSearch] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem("i18n-preview:combineSearch");
      if (raw === "true") return true;
      if (raw === "false") return false;
    } catch {
      /* ignore */
    }
    return true;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "i18n-preview:combineSearch",
        String(combineSearch),
      );
    } catch {
      /* ignore */
    }
  }, [combineSearch]);
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
    const counts = new Map<string, number>();
    for (const [key] of allEntries) {
      const a = key.includes(".") ? key.split(".")[0] : "outros";
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [allEntries]);

  // Se a área salva não existe mais no dicionário, faz fallback para "__all__".
  useEffect(() => {
    if (area === "__all__") return;
    if (!areas.some((a) => a.name === area)) {
      setArea("__all__");
    }
  }, [area, areas]);

  // Persiste o filtro de área para sobreviver a recargas e exports.
  useEffect(() => {
    try {
      window.localStorage.setItem("i18n-preview:area", area);
    } catch {
      /* ignore */
    }
  }, [area]);

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
    if (!combineSearch) return byArea;
    return byArea.filter(
      ([key, value]) =>
        key.toLowerCase().includes(q) || value.toLowerCase().includes(q),
    );
  }, [byArea, query, combineSearch]);

  const groups = useMemo(() => groupByArea(filtered), [filtered]);
  const total = allEntries.length;
  const showing = filtered.length;
  const areaCount = byArea.length;

  function handleExport(
    format: "json" | "csv",
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

  async function handleExportXlsx(
    entries?: ReadonlyArray<readonly [string, string]>,
  ) {
    try {
      const out = await buildI18nXlsxExport(entries);
      const blob = new Blob([out.content], { type: out.mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = out.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(
        `Exportado ${out.totalKeys} chave${out.totalKeys === 1 ? "" : "s"} (XLSX).`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro desconhecido ao exportar.";
      toast.error("Falha ao exportar XLSX", { description: message });
      if (import.meta.env?.DEV) console.error("[i18n-export-xlsx]", err);
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
          <label
            htmlFor="area-filter"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Área calculada:
          </label>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger
              id="area-filter"
              className="h-9 w-[240px]"
              aria-label="Filtrar por área calculada"
            >
              <SelectValue placeholder="Área" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">
                Todas as áreas ({total})
              </SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.name} value={a.name}>
                  {a.name} ({a.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
            <Switch
              id="combine-search"
              checked={combineSearch}
              onCheckedChange={setCombineSearch}
              aria-label="Combinar busca textual com filtro de área"
            />
            <Label
              htmlFor="combine-search"
              className="cursor-pointer text-xs text-muted-foreground"
              title={
                combineSearch
                  ? "Busca textual está sendo combinada com o filtro de área."
                  : "Filtro de área ignora a busca textual atual."
              }
            >
              {combineSearch ? "Combinar busca + área" : "Ignorar busca textual"}
            </Label>
          </div>

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
                title={`Exporta todas as ${areaCount} chaves da área "${area}", ignorando a busca textual.`}
              >
                <Download className="mr-2 size-4" />
                JSON completo da área “{area}” ({areaCount})
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => handleExport("csv", byArea)}
                title={`Exporta todas as ${areaCount} chaves da área "${area}", ignorando a busca textual.`}
              >
                <Download className="mr-2 size-4" />
                CSV completo da área “{area}” ({areaCount})
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
                    const computedArea = key.includes(".")
                      ? key.split(".")[0]
                      : "outros";
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className="grid w-full gap-2 rounded py-2 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(220px,1fr)_auto_2fr_auto] md:items-baseline md:gap-6"
                          aria-label={`Ver ocorrências de ${key}`}
                        >
                          <code className="font-mono text-xs text-accent-blue break-all">
                            {key}
                          </code>
                          <Badge
                            variant="secondary"
                            className="justify-self-start font-mono text-[10px] uppercase tracking-wider"
                            title={`Área calculada: ${computedArea}`}
                          >
                            {computedArea}
                          </Badge>
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
