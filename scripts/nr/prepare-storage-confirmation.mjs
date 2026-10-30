import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// The proof is a receipt from actual authenticated GET/readback, never an upload URL.
const [directory, org] = process.argv.slice(2);
if (!directory || !/^[a-f0-9-]{36}$/.test(org ?? '')) throw Error('Usage: prepare-storage-confirmation.mjs PRIVATE_DIRECTORY ORGANIZATION_UUID');
const prepared = JSON.parse(await readFile(path.join(directory, 'storage-prepared.json'), 'utf8'));
const proof = JSON.parse(await readFile(path.join(directory, 'storage-proof.json'), 'utf8'));
const rows = prepared.map(x => ({ arquivo_id: x.id, caminho: x.caminho, mime: x.mime, tamanho: Number(x.tamanho), sha256: x.sha256 })).sort((a, b) => a.arquivo_id.localeCompare(b.arquivo_id));
const hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const bytes = rows.reduce((n, r) => n + r.tamanho, 0);
if (!rows.length || proof.format !== 'nexus-storage-readback-receipt-v1' || proof.project_ref !== 'yhtgijtllvgzoqtfcgal' || proof.bucket !== 'nexus-nr-acervo' || !proof.source_message_id || proof.canonical_sha256 !== hash || proof.verified !== rows.length || proof.bytes !== bytes || proof.errors !== 0 || proof.manifest_mismatches !== 0 || proof.unfinished !== 0) throw Error('Actual Storage readback receipt does not match the prepared targets. No confirmation plan generated.');
if (new Set(rows.map(r => r.arquivo_id)).size !== rows.length || new Set(rows.map(r => r.caminho)).size !== rows.length) throw Error('Duplicate target.');
for (const row of rows) if (!/^[a-f0-9-]{36}$/.test(row.arquivo_id) || !row.caminho.startsWith(`${org}/acervo/`) || !/^[a-f0-9]{64}$/.test(row.sha256) || !Number.isSafeInteger(row.tamanho) || row.tamanho < 1 || row.tamanho > 52428800) throw Error('Invalid prepared target.');
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const batches = [];
for (let i = 0; i < rows.length; i += 75) {
  const values = rows.slice(i, i + 75).map(r => `(${q(r.arquivo_id)}::uuid,${q(r.sha256)},${r.tamanho}::bigint,${q(r.mime)})`).join(',');
  batches.push(`select count(public.nr_arquivo_importar_confirmar(${q(org)}::uuid,t.id,t.sha,t.bytes,t.mime)) as confirmados from (values ${values}) as t(id,sha,bytes,mime);`);
}
const ids = rows.map(r => `(${q(r.arquivo_id)}::uuid)`).join(',');
const preflight = `with wanted(id) as (values ${ids}) select count(*) as encontrados,count(*) filter(where s.id is not null and (s.metadata->>'size')::bigint=a.tamanho and s.metadata->>'mimetype'=a.mime) as objetos_compativeis from wanted w join public.nr_arquivos a on a.id=w.id and a.organization_id=${q(org)}::uuid left join storage.objects s on s.bucket_id='nexus-nr-acervo' and s.name=a.caminho;`;
const readback = `with wanted(id) as (values ${ids}) select a.estado,count(*) as arquivos,sum(a.tamanho) as bytes from wanted w join public.nr_arquivos a on a.id=w.id and a.organization_id=${q(org)}::uuid group by a.estado;`;
await mkdir(path.join(directory, 'plans'), { recursive: true, mode: 0o700 });
await writeFile(path.join(directory, 'plans', 'storage-confirmar.json'), JSON.stringify({ count: rows.length, bytes, canonical_sha256: hash, proof_source: proof.source_message_id, preflight, batches, readback }), { mode: 0o600 });
console.log(JSON.stringify({ count: rows.length, bytes, canonical_sha256: hash, batches: batches.length }));
