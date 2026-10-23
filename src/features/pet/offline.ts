import type { Json } from "./schemas";
import { jsonValue } from "./schemas";
import { z } from "zod";
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (n) => String.fromCharCode(n)).join(""));
const un64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export type RegistroPendente = {
  chave: string;
  tipo: "registrar_saida" | "interromper";
  pessoa_id?: string;
  momento: string;
  motivo: string;
  origem: "offline";
  estado: "pendente" | "conflito";
  expected_version?: number;
};
export type ConfirmacaoLocal = { registro: RegistroPendente; confirmado_em: string };
export type PacoteLocal = {
  formato: 1;
  organizationId: string;
  userId: string;
  petId: string;
  version: number;
  sincronizadoEm: string;
  documentoHash: string;
  pdf: string;
  snapshot: { [key: string]: Json };
  pendentes: RegistroPendente[];
  // Additive encrypted metadata only; never part of a legacy SQL command/hash.
  confirmados?: ConfirmacaoLocal[];
};
type Envelope = { formato: 1; salt: string; iv: string; ciphertext: string };
const registroSchema = z
  .object({
    chave: z.string().min(1).max(100),
    tipo: z.enum(["registrar_saida", "interromper"]),
    pessoa_id: z.string().min(1).optional(),
    momento: z.string().datetime(),
    motivo: z.string().trim().min(1).max(4000),
    origem: z.literal("offline"),
    estado: z.enum(["pendente", "conflito"]),
    expected_version: z.number().int().positive().optional(),
  })
  .strict()
  .refine((r) => r.tipo !== "registrar_saida" || !!r.pessoa_id, "Saída exige pessoa identificada.");
const pacoteSchema = z
  .object({
    formato: z.literal(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    petId: z.string().min(1),
    version: z.number().int().positive(),
    sincronizadoEm: z.string().datetime(),
    documentoHash: z.string().min(1),
    pdf: z.string().max(30 * 1024 * 1024),
    snapshot: z.record(jsonValue),
    pendentes: z.array(registroSchema).max(1000),
    confirmados: z
      .array(
        z
          .object({
            registro: registroSchema.refine(
              (r) => r.expected_version !== undefined,
              "Confirmação exige o pedido enviado.",
            ),
            confirmado_em: z.string().datetime(),
          })
          .strict(),
      )
      .max(1000)
      .optional(),
  })
  .strict();
async function key(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12) throw new Error("Use uma senha local com ao menos 12 caracteres.");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: Uint8Array.from(salt).buffer, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function protegerPacote(pacote: PacoteLocal, senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(senha, salt),
    encoder.encode(JSON.stringify(pacote)),
  );
  return JSON.stringify({
    formato: 1,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(cipher)),
  } satisfies Envelope);
}
export async function abrirPacote(
  encrypted: string,
  senha: string,
  contexto: { organizationId: string; userId: string; petId: string },
): Promise<PacoteLocal> {
  try {
    const e = JSON.parse(encrypted) as Envelope;
    if (e.formato !== 1) throw new Error("Formato inválido");
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: un64(e.iv) },
      await key(senha, un64(e.salt)),
      un64(e.ciphertext),
    );
    const p = pacoteSchema.parse(JSON.parse(new TextDecoder().decode(bytes))) as PacoteLocal;
    if (
      p.formato !== 1 ||
      p.organizationId !== contexto.organizationId ||
      p.userId !== contexto.userId ||
      p.petId !== contexto.petId ||
      !Array.isArray(p.pendentes)
    )
      throw new Error("Contexto inválido");
    return p;
  } catch {
    throw new Error(
      "Não foi possível abrir a cópia protegida. Confira a senha e o contexto da PET.",
    );
  }
}
export const chavePacote = (org: string, user: string, pet: string) =>
  `nexus-pet:v1:${org}:${user}:${pet}`;
/** Only facts that must survive outage. No issuance, release, entry or signature offline. */
export function adicionarPendente(p: PacoteLocal, registro: RegistroPendente): PacoteLocal {
  registroSchema.parse(registro);
  if (!registro.motivo.trim() || !Number.isFinite(Date.parse(registro.momento)))
    throw new Error("Informe o horário declarado e o contexto do registro.");
  if (registro.tipo === "registrar_saida" && !registro.pessoa_id)
    throw new Error("Selecione a pessoa que saiu.");
  const confirmed = p.confirmados?.find((x) => x.registro.chave === registro.chave);
  if (confirmed) {
    exigirMesmoRegistro(confirmed.registro, registro);
    return p;
  }
  const previous = p.pendentes.find((x) => x.chave === registro.chave);
  if (previous) {
    exigirMesmoRegistro(previous, registro);
    return p;
  }
  return { ...p, pendentes: [...p.pendentes, registro] };
}

function exigirMesmoRegistro(previous: RegistroPendente, incoming: RegistroPendente) {
  const fact = (r: RegistroPendente) =>
    JSON.stringify({
      chave: r.chave,
      tipo: r.tipo,
      pessoa_id: r.pessoa_id ?? null,
      momento: r.momento,
      motivo: r.motivo,
      origem: r.origem,
    });
  if (
    fact(previous) !== fact(incoming) ||
    (previous.expected_version !== undefined &&
      incoming.expected_version !== undefined &&
      previous.expected_version !== incoming.expected_version)
  )
    throw new Error(
      "Pacote com uma chave já existente e conteúdo divergente. Confira a contingência.",
    );
}
/** Confirmed means a response was observed on this device, not a certificate.
 * Keep the exact sent request encrypted so importing an old export cannot queue it again. */
export function confirmarPendenteLocal(
  p: PacoteLocal,
  chave: string,
  confirmadoEm: string,
): PacoteLocal {
  const registro = p.pendentes.find((r) => r.chave === chave);
  if (!registro) {
    if (p.confirmados?.some((r) => r.registro.chave === chave)) return p;
    throw new Error("Registro pendente não encontrado.");
  }
  if (registro.expected_version === undefined || !Number.isFinite(Date.parse(confirmadoEm)))
    throw new Error("A confirmação exige o pedido exato enviado e seu momento de recebimento.");
  if ((p.confirmados?.length ?? 0) >= 1000)
    throw new Error(
      "A cópia atingiu o limite de confirmações locais; preserve o pacote e solicite conferência antes de continuar.",
    );
  return {
    ...p,
    pendentes: p.pendentes.filter((r) => r.chave !== chave),
    confirmados: [
      ...(p.confirmados || []),
      { registro: { ...registro }, confirmado_em: confirmadoEm },
    ],
  };
}
/** Receipts from an imported file are replay candidates until the server confirms
 * them on this device. Only the existing local response ledger can suppress a retry. */
export function mesclarPacoteLocal(
  current: PacoteLocal | null,
  incoming: PacoteLocal,
): PacoteLocal {
  if (
    current &&
    (current.organizationId !== incoming.organizationId ||
      current.userId !== incoming.userId ||
      current.petId !== incoming.petId)
  )
    throw new Error("O pacote pertence a outro contexto autorizado.");
  const base = current ?? { ...incoming, pendentes: [], confirmados: [] };
  const confirmed = new Map((base.confirmados || []).map((r) => [r.registro.chave, r.registro]));
  const pending = new Map(base.pendentes.map((r) => [r.chave, r]));
  const candidates = [
    ...incoming.pendentes,
    ...(incoming.confirmados || []).map((r) => r.registro),
  ];
  for (const r of candidates) {
    registroSchema.parse(r);
    const receipt = confirmed.get(r.chave);
    if (receipt) {
      exigirMesmoRegistro(receipt, r);
      continue;
    }
    const previous = pending.get(r.chave);
    if (previous) {
      exigirMesmoRegistro(previous, r);
      pending.set(r.chave, {
        ...previous,
        ...(previous.expected_version === undefined && r.expected_version !== undefined
          ? { expected_version: r.expected_version }
          : {}),
      });
    } else pending.set(r.chave, { ...r, estado: "pendente" });
  }
  if (pending.size > 1000)
    throw new Error(
      "O pacote excede o limite de registros pendentes. Preserve os arquivos para conferência.",
    );
  return { ...base, pendentes: [...pending.values()] };
}
