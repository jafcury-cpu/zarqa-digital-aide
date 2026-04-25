import { describe, expect, it } from "vitest";
import { dictionary } from "@/lib/i18n";
import {
  buildI18nExport,
  buildI18nXlsxExport,
  validateEntries,
} from "@/lib/i18n-export";
import ExcelJS from "exceljs";

describe("i18n-export", () => {
  it("dicionário não tem chaves ou valores vazios", () => {
    for (const [k, v] of Object.entries(dictionary)) {
      expect(k.length, `chave vazia: ${k}`).toBeGreaterThan(0);
      expect(typeof v).toBe("string");
      expect((v as string).length, `valor vazio em ${k}`).toBeGreaterThan(0);
    }
  });

  it("validateEntries aceita o dicionário completo", () => {
    const entries = Object.entries(dictionary) as [string, string][];
    expect(() => validateEntries(entries, { requireFull: true })).not.toThrow();
  });

  it("validateEntries rejeita valor vazio", () => {
    expect(() =>
      validateEntries([["brand.name", ""]], { requireFull: false }),
    ).toThrow(/Valor vazio/);
  });

  it("validateEntries rejeita chave duplicada", () => {
    expect(() =>
      validateEntries(
        [
          ["brand.name", "Luize"],
          ["brand.name", "Outro"],
        ],
        { requireFull: false },
      ),
    ).toThrow(/duplicada/);
  });

  it("validateEntries rejeita chave fora do dicionário", () => {
    expect(() =>
      validateEntries([["nao.existe", "x"]], { requireFull: false }),
    ).toThrow(/não pertence/);
  });

  it("validateEntries rejeita export completo incompleto", () => {
    const partial = (Object.entries(dictionary) as [string, string][]).slice(0, 3);
    expect(() => validateEntries(partial, { requireFull: true })).toThrow(
      /incompleto/,
    );
  });

  it("buildI18nExport(json) retorna todas as chaves com área", () => {
    const out = buildI18nExport("json");
    const parsed = JSON.parse(out.content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;
    expect(out.format).toBe("json");
    expect(out.totalKeys).toBe(Object.keys(dictionary).length);
    expect(parsed).toHaveLength(Object.keys(dictionary).length);
    expect(parsed.map((e) => e.key).sort()).toEqual(
      Object.keys(dictionary).sort(),
    );
    for (const entry of parsed) {
      const expected = entry.key.includes(".")
        ? entry.key.split(".")[0]
        : "outros";
      expect(entry.area).toBe(expected);
    }
    expect(out.mime).toBe("application/json");
    expect(out.filename).toMatch(/completo\.json$/);
  });

  it("buildI18nExport(csv) tem header com area + 1 linha por chave", () => {
    const out = buildI18nExport("csv");
    const lines = out.content.split("\n");
    expect(lines[0]).toBe("key,area,value");
    expect(lines.length).toBe(Object.keys(dictionary).length + 1);
    expect(out.mime).toBe("text/csv");
  });

  it("buildI18nExport(csv) escapa vírgulas, aspas e quebras de linha", () => {
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha'],
    ];
    const out = buildI18nExport("csv", tricky as never);
    const lines = out.content.split("\n");
    expect(lines[0]).toBe("key,area,value");
    // segunda coluna é a área calculada ("brand")
    const body = lines.slice(1).join("\n");
    expect(body).toMatch(/^brand\.name,brand,/);
    expect(body).toContain('"Luize, ""a Luize""');
  });

  it("export filtrado vazio é permitido (não exige completude)", () => {
    const out = buildI18nExport("json", []);
    expect(out.content).toBe("[]");
    expect(out.totalKeys).toBe(0);
  });
  it("CSV: ordem de colunas é sempre key,area,value", () => {
    const out = buildI18nExport("csv");
    expect(out.content.split("\n")[0]).toBe("key,area,value");
  });

  it("CSV: chave sem ponto receberia area='outros' (lógica do preview)", () => {
    // O dicionário real não tem chaves sem ponto, então validamos a regra
    // de derivação que é compartilhada entre preview e export.
    const deriveArea = (k: string) =>
      k.includes(".") ? k.split(".")[0] : "outros";
    expect(deriveArea("semponto")).toBe("outros");
    expect(deriveArea("brand.name")).toBe("brand");
    expect(deriveArea("a.b.c.d")).toBe("a");
  });

  it("CSV: chaves reais com múltiplos prefixos usam apenas o 1º segmento como area", () => {
    const reais: [string, string][] = [
      ["dashboard.eyebrow.briefing", dictionary["dashboard.eyebrow.briefing"]],
      ["sidebar.section.operacao", dictionary["sidebar.section.operacao"]],
    ];
    const out = buildI18nExport("csv", reais as never);
    const lines = out.content.split("\n");
    expect(lines[0]).toBe("key,area,value");
    expect(lines[1].startsWith("dashboard.eyebrow.briefing,dashboard,")).toBe(
      true,
    );
    expect(lines[2].startsWith("sidebar.section.operacao,sidebar,")).toBe(true);
  });

  it("CSV completo: area de cada linha bate com a lógica do preview", () => {
    const out = buildI18nExport("csv");
    const lines = out.content.split("\n").slice(1);
    expect(lines.length).toBe(Object.keys(dictionary).length);
    for (const line of lines) {
      // Pega os 2 primeiros campos respeitando aspas simples (sem vírgula no key/area)
      const [key, area] = line.split(",", 2);
      const expected = key.includes(".") ? key.split(".")[0] : "outros";
      expect(area, `linha: ${line}`).toBe(expected);
    }
  });

  it("JSON completo: cada item tem { key, area, value } com area consistente", () => {
    const out = buildI18nExport("json");
    const parsed = JSON.parse(out.content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;
    for (const item of parsed) {
      const expected = item.key.includes(".")
        ? item.key.split(".")[0]
        : "outros";
      expect(item.area).toBe(expected);
      expect(Object.keys(item)).toEqual(["key", "area", "value"]);
    }
  });

  it("CSV: values com vírgula, aspas e quebras de linha mantêm ordem key,area,value", () => {
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha 2'],
      ["common.save", 'salvar, "agora"'],
      ["dashboard.eyebrow.briefing", 'briefing\ncom "aspas", e vírgulas'],
    ];
    const out = buildI18nExport("csv", tricky as never);
    const lines = out.content.split(/\r?\n/);
    expect(lines[0]).toBe("key,area,value");

    // Reparser CSV mínimo respeitando aspas para validar 3 colunas por linha lógica
    const body = lines.slice(1).join("\n");
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (inQuotes) {
        if (ch === '"' && body[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") {
          cur.push(field);
          field = "";
        } else if (ch === "\n") {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = "";
        } else {
          field += ch;
        }
      }
    }
    if (field.length > 0 || cur.length > 0) {
      cur.push(field);
      rows.push(cur);
    }

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toHaveLength(3); // key, area, value — sem vazamento de colunas
    }

    // Cada area deve corresponder ao primeiro segmento da key
    expect(rows[0][0]).toBe("brand.name");
    expect(rows[0][1]).toBe("brand");
    expect(rows[0][2]).toBe('Luize, "a Luize"\nlinha 2');

    expect(rows[1][0]).toBe("common.save");
    expect(rows[1][1]).toBe("common");
    expect(rows[1][2]).toBe('salvar, "agora"');

    expect(rows[2][0]).toBe("dashboard.eyebrow.briefing");
    expect(rows[2][1]).toBe("dashboard");
    expect(rows[2][2]).toBe('briefing\ncom "aspas", e vírgulas');
  });

  it("JSON: values com vírgula, aspas e quebras de linha preservam conteúdo + estrutura {key,area,value}", () => {
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha 2'],
      ["common.save", 'salvar, "agora"'],
      ["dashboard.eyebrow.briefing", 'briefing\ncom "aspas", e vírgulas\te tab'],
    ];
    const out = buildI18nExport("json", tricky as never);
    expect(out.format).toBe("json");
    expect(out.mime).toBe("application/json");
    expect(out.totalKeys).toBe(3);

    const parsed = JSON.parse(out.content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;
    expect(parsed).toHaveLength(3);

    const expectedAreas: Record<string, string> = {
      "brand.name": "brand",
      "common.save": "common",
      "dashboard.eyebrow.briefing": "dashboard",
    };

    for (let i = 0; i < tricky.length; i++) {
      const [origKey, origValue] = tricky[i];
      const item = parsed[i];
      // Estrutura exata, na ordem certa
      expect(Object.keys(item)).toEqual(["key", "area", "value"]);
      expect(item.key).toBe(origKey);
      expect(item.area).toBe(expectedAreas[origKey]);
      // Conteúdo bit-a-bit preservado (vírgulas, aspas, \n, \t)
      expect(item.value).toBe(origValue);
      expect(item.value.length).toBe(origValue.length);
    }
  });

  it("JSON e CSV preservam mesmos values e mesma ordem de itens", () => {
    // Reparser CSV mínimo (RFC4180-ish) com suporte a aspas e quebras de linha.
    function parseCsv(text: string): string[][] {
      const rows: string[][] = [];
      let cur: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"' && text[i + 1] === '"') {
            field += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            field += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cur.push(field);
          field = "";
        } else if (ch === "\n") {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = "";
        } else {
          field += ch;
        }
      }
      if (field.length > 0 || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
      }
      return rows;
    }

    // Caso 1: dicionário completo
    const jsonFull = JSON.parse(buildI18nExport("json").content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;
    const csvFullRows = parseCsv(buildI18nExport("csv").content);
    expect(csvFullRows[0]).toEqual(["key", "area", "value"]);
    const csvFullBody = csvFullRows.slice(1);
    expect(csvFullBody).toHaveLength(jsonFull.length);
    for (let i = 0; i < jsonFull.length; i++) {
      expect(csvFullBody[i][0]).toBe(jsonFull[i].key);
      expect(csvFullBody[i][1]).toBe(jsonFull[i].area);
      expect(csvFullBody[i][2]).toBe(jsonFull[i].value);
    }

    // Caso 2: subset com caracteres tricky e ordem específica
    const tricky: [string, string][] = [
      ["dashboard.eyebrow.briefing", 'briefing\ncom "aspas", e vírgulas'],
      ["brand.name", 'Luize, "a Luize"'],
      ["common.save", "salvar\tagora"],
    ];
    const jsonSub = JSON.parse(
      buildI18nExport("json", tricky as never).content,
    ) as Array<{ key: string; area: string; value: string }>;
    const csvSubRows = parseCsv(
      buildI18nExport("csv", tricky as never).content,
    );
    expect(csvSubRows[0]).toEqual(["key", "area", "value"]);
    const csvSubBody = csvSubRows.slice(1);

    expect(jsonSub.map((i) => i.key)).toEqual(tricky.map(([k]) => k));
    expect(csvSubBody.map((r) => r[0])).toEqual(tricky.map(([k]) => k));
    for (let i = 0; i < tricky.length; i++) {
      expect(csvSubBody[i][0]).toBe(jsonSub[i].key);
      expect(csvSubBody[i][1]).toBe(jsonSub[i].area);
      expect(csvSubBody[i][2]).toBe(jsonSub[i].value);
      expect(jsonSub[i].value).toBe(tricky[i][1]);
    }
  });

  it("round-trip JSON: exportar → reimportar preserva key, area e value", () => {
    // 1) Export completo
    const out = buildI18nExport("json");
    const exported = JSON.parse(out.content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;

    // 2) "Reimporta": serializa de volta e parseia novamente (round-trip real)
    const reSerialized = JSON.stringify(exported);
    const reimported = JSON.parse(reSerialized) as Array<{
      key: string;
      area: string;
      value: string;
    }>;

    // 3) Mesma quantidade e mesma ordem
    expect(reimported).toHaveLength(exported.length);
    expect(reimported.map((i) => i.key)).toEqual(exported.map((i) => i.key));

    // 4) Cada item bate em key, area e value
    for (let i = 0; i < exported.length; i++) {
      expect(reimported[i]).toEqual(exported[i]);
      expect(Object.keys(reimported[i])).toEqual(["key", "area", "value"]);
    }

    // 5) Reimportado bate com o dicionário fonte (paridade com fonte da verdade)
    const dictMap = dictionary as Record<string, string>;
    for (const item of reimported) {
      expect(item.value).toBe(dictMap[item.key]);
      const expectedArea = item.key.includes(".")
        ? item.key.split(".")[0]
        : "outros";
      expect(item.area).toBe(expectedArea);
    }

    // 6) Round-trip com caracteres tricky (vírgulas, aspas, \n, \t)
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha 2'],
      ["common.save", "salvar\tagora"],
      ["dashboard.eyebrow.briefing", 'briefing\ncom "aspas", e vírgulas'],
    ];
    const trickyOut = buildI18nExport("json", tricky as never);
    const trickyReimported = JSON.parse(trickyOut.content) as Array<{
      key: string;
      area: string;
      value: string;
    }>;
    const trickyRoundTripped = JSON.parse(JSON.stringify(trickyReimported));
    expect(trickyRoundTripped).toEqual(trickyReimported);
    for (let i = 0; i < tricky.length; i++) {
      expect(trickyRoundTripped[i].key).toBe(tricky[i][0]);
      expect(trickyRoundTripped[i].value).toBe(tricky[i][1]);
      expect(trickyRoundTripped[i].area).toBe(tricky[i][0].split(".")[0]);
    }
  });

  it("round-trip CSV: exportar → reimportar preserva key, area e value (com vírgulas, aspas e \\n)", () => {
    // Parser CSV (RFC4180-ish) com suporte a aspas escapadas e quebras de linha dentro de campos.
    function parseCsv(text: string): string[][] {
      const rows: string[][] = [];
      let cur: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"' && text[i + 1] === '"') {
            field += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            field += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cur.push(field);
          field = "";
        } else if (ch === "\n") {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = "";
        } else if (ch === "\r") {
          // ignora CR (fica para o \n tratar a quebra)
        } else {
          field += ch;
        }
      }
      if (field.length > 0 || cur.length > 0) {
        cur.push(field);
        rows.push(cur);
      }
      return rows;
    }

    // 1) Round-trip do dicionário completo
    const out = buildI18nExport("csv");
    const rows = parseCsv(out.content);
    expect(rows[0]).toEqual(["key", "area", "value"]);
    const body = rows.slice(1);
    expect(body).toHaveLength(Object.keys(dictionary).length);
    const dictMap = dictionary as Record<string, string>;
    for (const [key, area, value] of body) {
      expect(value).toBe(dictMap[key]);
      const expectedArea = key.includes(".") ? key.split(".")[0] : "outros";
      expect(area).toBe(expectedArea);
    }

    // 2) Round-trip com caracteres tricky
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha 2'],
      ["common.save", 'salvar, "agora"'],
      ["dashboard.eyebrow.briefing", 'briefing\ncom "aspas", e vírgulas\te tab'],
    ];
    const trickyOut = buildI18nExport("csv", tricky as never);
    const trickyRows = parseCsv(trickyOut.content);
    expect(trickyRows[0]).toEqual(["key", "area", "value"]);
    const trickyBody = trickyRows.slice(1);
    expect(trickyBody).toHaveLength(tricky.length);

    for (let i = 0; i < tricky.length; i++) {
      const [origKey, origValue] = tricky[i];
      const [reKey, reArea, reValue] = trickyBody[i];
      expect(reKey).toBe(origKey);
      expect(reArea).toBe(origKey.split(".")[0]);
      expect(reValue).toBe(origValue); // preserva vírgulas, aspas, \n e \t
      expect(reValue.length).toBe(origValue.length);
    }

    // 3) Re-export: reimportado → exportado novamente deve gerar conteúdo idêntico
    const reExportTuples: [string, string][] = trickyBody.map(
      ([k, , v]) => [k, v] as [string, string],
    );
    const reExported = buildI18nExport("csv", reExportTuples as never);
    expect(reExported.content).toBe(trickyOut.content);
  });

  it("round-trip XLSX: exporta, reimporta e preserva key, area e value (com vírgulas, aspas e \\n)", async () => {
    // 1) Round-trip do dicionário completo
    const out = await buildI18nXlsxExport();
    expect(out.format).toBe("xlsx");
    expect(out.mime).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(out.filename).toMatch(/completo\.xlsx$/);
    expect(out.content).toBeInstanceOf(Uint8Array);
    expect(out.content.byteLength).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.content.buffer as ArrayBuffer);
    const ws = wb.getWorksheet("i18n");
    expect(ws).toBeDefined();

    // Header
    const header = ws!.getRow(1).values as unknown[];
    // ExcelJS 1-indexa values; índice 0 vem null
    expect(header[1]).toBe("key");
    expect(header[2]).toBe("area");
    expect(header[3]).toBe("value");

    // Linhas
    const dictMap = dictionary as Record<string, string>;
    const totalRows = Object.keys(dictionary).length;
    expect(ws!.rowCount).toBe(totalRows + 1);
    for (let i = 0; i < totalRows; i++) {
      const row = ws!.getRow(i + 2).values as unknown[];
      const key = row[1] as string;
      const area = row[2] as string;
      const value = row[3] as string;
      expect(value).toBe(dictMap[key]);
      const expectedArea = key.includes(".") ? key.split(".")[0] : "outros";
      expect(area).toBe(expectedArea);
    }

    // 2) Round-trip com caracteres tricky
    const tricky: [string, string][] = [
      ["brand.name", 'Luize, "a Luize"\nlinha 2'],
      ["common.save", 'salvar, "agora"\tcom tab'],
      [
        "dashboard.eyebrow.briefing",
        'briefing\ncom "aspas", e vírgulas\nmúltiplas linhas',
      ],
    ];
    const trickyOut = await buildI18nXlsxExport(tricky as never);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(trickyOut.content.buffer as ArrayBuffer);
    const ws2 = wb2.getWorksheet("i18n");
    expect(ws2).toBeDefined();

    // Header preservado
    const header2 = ws2!.getRow(1).values as unknown[];
    expect([header2[1], header2[2], header2[3]]).toEqual([
      "key",
      "area",
      "value",
    ]);

    expect(ws2!.rowCount).toBe(tricky.length + 1);
    for (let i = 0; i < tricky.length; i++) {
      const [origKey, origValue] = tricky[i];
      const row = ws2!.getRow(i + 2).values as unknown[];
      expect(row[1]).toBe(origKey);
      expect(row[2]).toBe(origKey.split(".")[0]);
      // Valor preservado bit-a-bit (vírgulas, aspas, \n, \t)
      expect(row[3]).toBe(origValue);
      expect((row[3] as string).length).toBe(origValue.length);
    }

    // 3) Re-export: reimportado → exportado novamente preserva os mesmos values
    const reTuples: [string, string][] = [];
    for (let i = 0; i < tricky.length; i++) {
      const row = ws2!.getRow(i + 2).values as unknown[];
      reTuples.push([row[1] as string, row[3] as string]);
    }
    const reExported = await buildI18nXlsxExport(reTuples as never);
    const wb3 = new ExcelJS.Workbook();
    await wb3.xlsx.load(reExported.content.buffer as ArrayBuffer);
    const ws3 = wb3.getWorksheet("i18n")!;
    for (let i = 0; i < tricky.length; i++) {
      const row = ws3.getRow(i + 2).values as unknown[];
      expect(row[1]).toBe(tricky[i][0]);
      expect(row[2]).toBe(tricky[i][0].split(".")[0]);
      expect(row[3]).toBe(tricky[i][1]);
    }
  });
});
