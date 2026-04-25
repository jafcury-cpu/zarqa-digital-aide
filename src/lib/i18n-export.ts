/**
 * Geração e validação dos exports do dicionário i18n.
 *
 * Centraliza a lógica para que a UI apenas chame `buildI18nExport`
 * e os testes possam validar o comportamento sem depender do DOM.
 */

import { dictionary, type DictionaryKey } from "@/lib/i18n";

export type ExportFormat = "json" | "csv" | "xlsx";

export type I18nExport = {
  format: ExportFormat;
  filename: string;
  mime: string;
  content: string;
  totalKeys: number;
};

export type I18nBinaryExport = {
  format: "xlsx";
  filename: string;
  mime: string;
  content: Uint8Array;
  totalKeys: number;
};

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Valida que `entries` corresponde a um snapshot íntegro do dicionário.
 *
 * Quando `requireFull` é true, exige que TODAS as chaves do dicionário
 * estejam presentes (usado pelos botões "Exportar tudo").
 *
 * Lança `Error` com mensagem em pt-BR ao detectar problemas.
 */
export function validateEntries(
  entries: ReadonlyArray<readonly [string, string]>,
  options: { requireFull?: boolean } = {},
): void {
  if (!Array.isArray(entries)) {
    throw new Error("Lista de entradas inválida.");
  }

  const dictKeys = Object.keys(dictionary) as DictionaryKey[];
  const dictKeySet = new Set<string>(dictKeys);

  const seen = new Set<string>();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error("Entrada malformada no dicionário.");
    }
    const [key, value] = entry;
    if (typeof key !== "string" || key.length === 0) {
      throw new Error("Chave vazia detectada no dicionário.");
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Valor vazio para a chave "${key}".`);
    }
    if (seen.has(key)) {
      throw new Error(`Chave duplicada no export: "${key}".`);
    }
    seen.add(key);
    if (!dictKeySet.has(key)) {
      throw new Error(`Chave não pertence ao dicionário: "${key}".`);
    }
  }

  if (options.requireFull) {
    if (entries.length !== dictKeys.length) {
      throw new Error(
        `Export incompleto: ${entries.length} de ${dictKeys.length} chaves.`,
      );
    }
    for (const k of dictKeys) {
      if (!seen.has(k)) {
        throw new Error(`Chave ausente no export completo: "${k}".`);
      }
    }
  }
}

/**
 * Constrói payload + metadados para download.
 * Se `entries` é omitido, exporta o dicionário completo.
 */
export function buildI18nExport(
  format: ExportFormat,
  entries?: ReadonlyArray<readonly [string, string]>,
): I18nExport {
  const isFull = entries === undefined;
  const data: ReadonlyArray<readonly [string, string]> =
    entries ?? (Object.entries(dictionary) as [string, string][]);

  validateEntries(data, { requireFull: isFull });

  const withArea = data.map(([k, v]) => {
    const area = k.includes(".") ? k.split(".")[0] : "outros";
    return { key: k, area, value: v };
  });

  if (format === "json") {
    const content = JSON.stringify(withArea, null, 2);
    return {
      format,
      filename: isFull ? "luize-i18n-completo.json" : "luize-i18n.json",
      mime: "application/json",
      content,
      totalKeys: data.length,
    };
  }

  const header = "key,area,value";
  const rows = withArea.map(
    ({ key, area, value }) =>
      `${escapeCsvField(key)},${escapeCsvField(area)},${escapeCsvField(value)}`,
  );
  return {
    format: "csv",
    filename: isFull ? "luize-i18n-completo.csv" : "luize-i18n.csv",
    mime: "text/csv",
    content: [header, ...rows].join("\n"),
    totalKeys: data.length,
  };
}
