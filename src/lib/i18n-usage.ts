/**
 * Indexa em build-time o uso de cada chave do dicionário i18n
 * varrendo os arquivos .ts/.tsx em src/ via import.meta.glob (raw).
 *
 * Detecta padrões como: t("chave.com.pontos")
 */

// Carrega todos os arquivos fonte como texto. eager:true para resolver síncrono.
const sourceModules = import.meta.glob("/src/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export type Occurrence = {
  file: string; // caminho relativo (ex: src/pages/Dashboard.tsx)
  line: number; // 1-indexed
  snippet: string; // linha completa (trim)
};

const T_CALL = /\bt\(\s*["'`]([a-zA-Z0-9_.-]+)["'`]\s*\)/g;

function buildIndex(): Map<string, Occurrence[]> {
  const index = new Map<string, Occurrence[]>();
  for (const [absPath, content] of Object.entries(sourceModules)) {
    // Ignora o próprio dicionário e este arquivo de índice.
    if (absPath.endsWith("/lib/i18n.ts")) continue;
    if (absPath.endsWith("/lib/i18n-usage.ts")) continue;

    const relative = absPath.replace(/^\//, "");
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, i) => {
      let match: RegExpExecArray | null;
      T_CALL.lastIndex = 0;
      while ((match = T_CALL.exec(lineText)) !== null) {
        const key = match[1];
        const list = index.get(key) ?? [];
        list.push({
          file: relative,
          line: i + 1,
          snippet: lineText.trim().slice(0, 240),
        });
        index.set(key, list);
      }
    });
  }
  return index;
}

const usageIndex = buildIndex();

export function getUsage(key: string): Occurrence[] {
  return usageIndex.get(key) ?? [];
}

export function getUsageCount(key: string): number {
  return usageIndex.get(key)?.length ?? 0;
}
