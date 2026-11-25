import { describe, expect, it } from "vitest";

import {
  applyMarkdownAction,
  countWords,
  extractHeadings,
  readingMinutes,
  slugify,
} from "./markdown";

describe("slugify", () => {
  it("genera slugs compatibles con GitHub", () => {
    expect(slugify("Cómo construí Ryoko")).toBe("cómo-construí-ryoko");
    expect(slugify("Hola, mundo!")).toBe("hola-mundo");
  });
});

describe("extractHeadings", () => {
  it("extrae encabezados ATX con ids únicos", () => {
    const headings = extractHeadings(
      ["# Título", "Texto", "## Sección", "### Detalle", "## Sección"].join("\n"),
    );

    expect(headings).toEqual([
      { level: 1, text: "Título", id: "título" },
      { level: 2, text: "Sección", id: "sección" },
      { level: 3, text: "Detalle", id: "detalle" },
      { level: 2, text: "Sección", id: "sección-1" },
    ]);
  });

  it("ignora encabezados dentro de bloques de código", () => {
    const headings = extractHeadings(
      ["# Real", "```md", "# Falso", "```", "## También real"].join("\n"),
    );

    expect(headings.map((heading) => heading.text)).toEqual(["Real", "También real"]);
  });

  it("limpia marcas inline del texto", () => {
    const headings = extractHeadings("## **Negrita** y [enlace](https://example.com)");
    expect(headings[0]?.text).toBe("Negrita y enlace");
  });
});

describe("countWords", () => {
  it("cuenta palabras ignorando sintaxis y código", () => {
    const markdown = [
      "# Hola mundo",
      "",
      "Este es un **texto** con `código` y un [enlace](https://example.com).",
      "",
      "```ts",
      "const estoNoCuenta = true;",
      "```",
    ].join("\n");

    expect(countWords(markdown)).toBe(10);
  });

  it("devuelve cero para contenido vacío", () => {
    expect(countWords("   \n\n")).toBe(0);
    expect(readingMinutes(0)).toBe(0);
  });
});

describe("readingMinutes", () => {
  it("estima al menos un minuto cuando hay contenido", () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
  });
});

describe("applyMarkdownAction", () => {
  it("envuelve la selección en negritas", () => {
    expect(applyMarkdownAction("hola mundo", 5, 10, "bold")).toEqual({
      value: "hola **mundo**",
      selectionStart: 7,
      selectionEnd: 12,
    });
  });

  it("inserta un placeholder cuando no hay selección", () => {
    const result = applyMarkdownAction("", 0, 0, "italic");
    expect(result.value).toBe("_texto_");
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe("texto");
  });

  it("convierte la línea actual en encabezado", () => {
    expect(applyMarkdownAction("Hola", 2, 2, "h2")).toEqual({
      value: "## Hola",
      selectionStart: 5,
      selectionEnd: 5,
    });
  });

  it("numera listas ordenadas por línea", () => {
    const result = applyMarkdownAction("uno\ndos", 0, 7, "ol");
    expect(result.value).toBe("1. uno\n2. dos");
  });

  it("crea un enlace con texto seleccionado", () => {
    expect(applyMarkdownAction("ver docs", 4, 8, "link")).toEqual({
      value: "ver [docs](url)",
      selectionStart: 5,
      selectionEnd: 9,
    });
  });

  it("inserta una regla horizontal", () => {
    const result = applyMarkdownAction("texto", 5, 5, "hr");
    expect(result.value).toBe("texto\n\n---\n\n");
    expect(result.selectionStart).toBe(12);
  });
});
