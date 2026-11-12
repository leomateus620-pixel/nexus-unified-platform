import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mimeInspecoes, validarArquivoInspecoes } from "../src/features/inspecoes/arquivo-formatos";
import { mimeDetectado } from "../src/features/operacao/files";

const mp4 = Uint8Array.of(
  0,
  0,
  0,
  20,
  0x66,
  0x74,
  0x79,
  0x70,
  0x69,
  0x73,
  0x6f,
  0x6d,
  0,
  0,
  0,
  0,
  0x6d,
  0x70,
  0x34,
  0x32,
);
const webm = Uint8Array.of(
  0x1a,
  0x45,
  0xdf,
  0xa3,
  0x87,
  0x42,
  0x82,
  0x84,
  0x77,
  0x65,
  0x62,
  0x6d,
  0x18,
  0x53,
  0x80,
  0x67,
);

test("Inspeções reconhece os contêineres de evidência em bytes e o fluxo operacional geral mantém seus formatos", () => {
  assert.equal(mimeInspecoes(mp4), "video/mp4");
  assert.equal(mimeInspecoes(webm), "video/webm");
  assert.equal(mimeDetectado(mp4), null);
  assert.equal(mimeDetectado(webm), null);
  assert.equal(mimeInspecoes(new TextEncoder().encode("%PDF-1.7")), "application/pdf");
});

test("Inspeções rejeita assinatura truncada, outro DocType e HTML", () => {
  assert.equal(mimeInspecoes(mp4.subarray(0, 19)), null);
  const other = webm.slice();
  other[8] = 0x61;
  assert.equal(mimeInspecoes(other), null);
  assert.equal(mimeInspecoes(new TextEncoder().encode("<html>webm ftyp mp42</html>")), null);
});

test("Inspeções exige tamanho, formato e hash idênticos no retorno do vídeo", async () => {
  const metadata = {
    tamanho: webm.byteLength,
    mime: "video/webm",
    sha256: createHash("sha256").update(webm).digest("hex"),
  };
  await validarArquivoInspecoes(webm, metadata);
  await assert.rejects(validarArquivoInspecoes(webm, { ...metadata, tamanho: 1 }), /tamanho/);
  await assert.rejects(
    validarArquivoInspecoes(webm, { ...metadata, mime: "video/mp4" }),
    /formato/,
  );
  await assert.rejects(
    validarArquivoInspecoes(webm, { ...metadata, sha256: "0".repeat(64) }),
    /hash/,
  );
});
