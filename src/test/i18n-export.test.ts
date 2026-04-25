import { describe, expect, it } from "vitest";
import { dictionary } from "@/lib/i18n";
import { buildI18nExport, validateEntries } from "@/lib/i18n-export";

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
});
