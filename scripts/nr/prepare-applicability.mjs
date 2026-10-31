import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SOURCE, digest } from "./inventory.mjs";

export const APPLICABILITY_VERSION = "nr-aplicabilidade-2026-10-30-v1";
// Decisões documentais explícitas da revisão de 30/10/2026; não derivadas de regex.
const reviewed = new Map([
  [
    "und-camera-slg/P09",
    [
      "descricao",
      "O PGSSTA menciona Santa Rosa",
      "A divergência identifica a unidade no PGSSTA; o assunto documental também integra o recorte NR35.",
    ],
  ],
  [
    "und-camera-slg/P12",
    [
      "descricao",
      "O PGSSTA contém orientações divergentes para descarte de corda.",
      "A pendência confronta orientações de corda do PGSSTA; acrescenta-se o contexto NR35 sem resolver a divergência técnica.",
    ],
  ],
  [
    "und-camera-slg/P13",
    [
      "descricao",
      "incluindo os trabalhos em altura fora de espaços confinados",
      "O escopo descrito inclui expressamente os trabalhos em altura fora de espaços confinados; ambos os recortes devem permitir consultar a pendência.",
    ],
  ],
  [
    "und-cotrirosa-fabrica/P36",
    [
      "titulo",
      "Ancoragens instaladas sem documentação",
      "A pendência trata das ancoragens descritas no PGSSTA e da documentação faltante; o recorte NR35 é adicional, sem concluir conformidade.",
    ],
  ],
  [
    "und-cotrirosa-fabrica/P41",
    [
      "descricao",
      "O PPREC e o PGSSTA compartilham a ART",
      "A verificação documental cobre PPREC e PGSSTA. Preserva-se o encerramento histórico e acrescenta-se a consulta pelo recorte NR35.",
    ],
  ],
  [
    "und-cotrirosa-fabrica/P44",
    [
      "descricao",
      "O PGSSTA cita a NR-18 para a corda Plasmodia de 12 mm.",
      "A correção documental se refere à corda citada no PGSSTA. Preservam-se o diagnóstico, a tratativa e o encerramento; acrescenta-se NR35.",
    ],
  ],
  [
    "und-cotrirosa-fabrica/P-CTR-F2-05",
    [
      "titulo",
      "Linhas de vida verticais sem identificação e sem ensaio",
      "A pendência trata das linhas de vida e ancoragens registradas no PGSSTA; o acesso pelo recorte NR35 conserva também a relação NR33 com os EC.",
    ],
  ],
  [
    "und-camera-slg/P-CAM-F2-10",
    [
      "titulo",
      "Registro fotográfico dos pontos de trabalho em altura ausente",
      "A evidência fotográfica pedida corresponde expressamente aos locais de trabalho em altura. O enquadramento adicional não afirma recuperação dos arquivos nem segurança operacional.",
    ],
  ],
]);
const ambiguous = new Set([
  "und-camera-slg/P19",
  "und-cotrirosa-fabrica/P37",
  "und-cotrirosa-fabrica/P43",
  "und-cotrirosa-fabrica/P55",
  "und-cotrirosa-fabrica/P-CTR-F2-02",
  "und-cotrirosa-fabrica/P-CTR-F2-03",
  "und-camera-slg/P-CAM-F2-02",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildApplicabilityManifest(source, mappings, { requireReviewed = false } = {}) {
  const ids = new Map(mappings.map((item) => [`${item.tipo}:${item.externo_id}`, item.destino_id]));
  const units = new Map(
    source.clientes.flatMap((client) => client.unidades.map((unit) => [unit.id, client.id])),
  );
  const ref = (type, id) => {
    const value = ids.get(`${type}:${id}`);
    if (!UUID.test(value ?? "")) throw Error(`Identidade não conciliada: ${type}:${id}`);
    return value;
  };
  const seen = new Set();
  const entries = source.pendencias
    .map((pending) => {
      const external = `${pending.unidade_id}/${pending.id}`;
      if (seen.has(external)) throw Error(`Pendência repetida no contexto: ${external}`);
      seen.add(external);
      const decision = reviewed.get(external);
      const evidence = [];
      if (decision) {
        const [field, excerpt] = decision;
        if (typeof pending[field] !== "string" || !pending[field].includes(excerpt))
          throw Error(`Trecho da decisão não corresponde à própria fonte: ${external}`);
        evidence.push({ campo: field, trecho: excerpt, campo_sha256: digest(pending[field]) });
      }
      return {
        externo_id: external,
        destino_id: ref("pendencia", external),
        cliente_id: ref("cliente", units.get(pending.unidade_id)),
        unidade_id: ref("unidade", pending.unidade_id),
        local_id: pending.local_id
          ? ref("local", `${pending.unidade_id}/${pending.local_id}`)
          : null,
        fonte_sha256: digest(pending),
        decisao: decision
          ? "incluir_nr35"
          : ambiguous.has(external)
            ? "revisao_pendente"
            : "manter_recorte",
        normas: decision ? ["NR33", "NR35"] : ["NR33"],
        justificativa:
          decision?.[2] ??
          (ambiguous.has(external)
            ? "Há referência que exige análise de aplicabilidade; este manifesto não comprova enquadramento adicional. Preservar NR33 e encaminhar para revisão, sem inferir NR35 para todos os EC."
            : "O manifesto atual não demonstra motivo para ampliar o recorte desta pendência. Preservar NR33; esta decisão de organização não declara que NR35 seja tecnicamente inaplicável."),
        evidencias: evidence,
      };
    })
    .sort((a, b) => a.externo_id.localeCompare(b.externo_id));
  if (requireReviewed)
    for (const external of reviewed.keys())
      if (!seen.has(external)) throw Error(`Fonte da decisão explícita ausente: ${external}`);
  return {
    versao: APPLICABILITY_VERSION,
    sistema: SOURCE,
    natureza: "conciliacao_documental_aplicabilidade",
    aprovacao_profissional: false,
    emissao_operacional: false,
    entradas: entries,
    sha256: digest(entries),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = path.resolve(process.argv[2] ?? "");
  if (
    !process.argv[2] ||
    directory === path.resolve(process.cwd()) ||
    directory.startsWith(path.resolve(process.cwd()) + path.sep)
  )
    throw Error("Use um diretório de staging privado fora do repositório.");
  const source = JSON.parse(await readFile(path.join(directory, "source-db.json"), "utf8"));
  const mappings = JSON.parse(await readFile(path.join(directory, "mappings.json"), "utf8"));
  const manifest = buildApplicabilityManifest(source, mappings, { requireReviewed: true });
  const output = path.join(directory, "plans", "aplicabilidade-revisada-v1.json");
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log(
    JSON.stringify({
      versao: manifest.versao,
      sha256: manifest.sha256,
      registros: manifest.entradas.length,
      decisoes: manifest.entradas.reduce(
        (counts, item) => ({ ...counts, [item.decisao]: (counts[item.decisao] ?? 0) + 1 }),
        {},
      ),
      resultado: "manifesto_preparado_sem_escrita_no_banco",
    }),
  );
}
