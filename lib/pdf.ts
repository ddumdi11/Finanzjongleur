import { PDFParse } from "pdf-parse";

/**
 * Extrahiert den reinen Text aus einem PDF-Buffer.
 *
 * Verwendet pdf-parse (intern pdfjs-dist). Beträge landen in der
 * Ausgabe auf derselben Zeile wie die Buchungs-/Wertstellungsdaten
 * (durch Tabs getrennt) — genau das Format, das `parseVolksbankPaste`
 * erwartet. Es ist also keine zusätzliche Textbereinigung nötig;
 * Header-/Footer-Rauschen fängt der Parser über die Seiten-Marker
 * selbst ab.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
