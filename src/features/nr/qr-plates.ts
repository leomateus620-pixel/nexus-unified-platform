import qrcode from "qrcode-generator";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type NrQrPlace = { id: string; tag: string | null; titulo: string };
export function localQrUrl(origin: string, client: string, unit: string, local: string) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password)
    throw new Error("Endereço da aplicação inválido.");
  const url = new URL(`/nr-33/locais/${local}`, base.origin);
  url.search = new URLSearchParams({ cliente: client, unidade: unit }).toString();
  return url.href;
}

/** Four supplementary identification labels per A4. No bearer tokens or private records. */
export async function nrQrPlates(
  origin: string,
  client: string,
  unit: string,
  places: NrQrPlace[],
) {
  if (!places.length) throw new Error("Selecione pelo menos um local.");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: string) =>
    [...s]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  const isTest =
    new URL(origin).hostname === "localhost" || /^127\./.test(new URL(origin).hostname);
  for (let i = 0; i < places.length; i += 4) {
    const page = pdf.addPage([595.28, 841.89]);
    for (let slot = 0; slot < 4 && i + slot < places.length; slot++) {
      const place = places[i + slot]!,
        x = 28 + (slot % 2) * 281,
        y = 438 - Math.floor(slot / 2) * 407;
      page.drawRectangle({
        x,
        y,
        width: 258,
        height: 375,
        borderWidth: 0.5,
        borderColor: rgb(0.65, 0.65, 0.65),
      });
      page.drawText(isTest ? "TESTE LOCAL - NÃO INSTALAR" : "NEXUS - IDENTIFICAÇÃO DO LOCAL", {
        x: x + 12,
        y: y + 350,
        size: 10,
        font: bold,
      });
      page.drawText(safe(place.tag ?? "Local"), { x: x + 12, y: y + 319, size: 20, font: bold });
      const title = safe(place.titulo);
      let line = "";
      const lines: string[] = [];
      for (const word of title.split(/\s+/)) {
        if (font.widthOfTextAtSize(`${line} ${word}`, 10) > 232 && line) {
          lines.push(line);
          line = word;
        } else line = line ? `${line} ${word}` : word;
      }
      if (line) lines.push(line);
      lines
        .slice(0, 3)
        .forEach((v, n) => page.drawText(v, { x: x + 12, y: y + 297 - n * 13, size: 10, font }));
      const qr = qrcode(0, "M");
      qr.addData(localQrUrl(origin, client, unit, place.id));
      qr.make();
      const count = qr.getModuleCount(),
        cell = 208 / (count + 8),
        left = x + 25 + 4 * cell,
        bottom = y + 49 + 4 * cell;
      for (let row = 0; row < count; row++)
        for (let col = 0; col < count; col++)
          if (qr.isDark(row, col))
            page.drawRectangle({
              x: left + col * cell,
              y: bottom + (count - row - 1) * cell,
              width: cell,
              height: cell,
              color: rgb(0, 0, 0),
            });
      page.drawText("Ficha técnica e documentos - acesso autenticado", {
        x: x + 12,
        y: y + 29,
        size: 9,
        font,
      });
      page.drawText("Identificação complementar. Não autoriza entrada.", {
        x: x + 12,
        y: y + 15,
        size: 9,
        font,
      });
    }
  }
  return pdf.save();
}
