/** Intenções de envio em memória: retry repete a chave; cancelamento permite novo envio. */
export class IntencoesArquivoEstudo {
  private readonly envios = new Map<string, { chave: string; arquivoId: string | null }>();

  constructor(private readonly gerarChave: () => string = () => crypto.randomUUID()) {}

  chave(payload: string): string {
    let intencao = this.envios.get(payload);
    if (!intencao) {
      intencao = { chave: this.gerarChave(), arquivoId: null };
      this.envios.set(payload, intencao);
    }
    return intencao.chave;
  }

  identificar(payload: string, arquivoId: string) {
    const intencao = this.envios.get(payload);
    if (intencao) intencao.arquivoId = arquivoId;
  }

  cancelar(arquivoId: string, payloadConhecido?: string) {
    // O staging pode ter sido salvo antes de sua resposta se perder. Nesse caso ainda
    // não conhecemos o ID localmente, mas o registro consultado permite reconhecer o payload.
    if (payloadConhecido) this.envios.delete(payloadConhecido);
    const conteudoCancelado = payloadConhecido ? this.conteudo(payloadConhecido) : null;
    for (const [payload, intencao] of this.envios)
      if (
        intencao.arquivoId === arquivoId ||
        (conteudoCancelado !== null && this.conteudo(payload) === conteudoCancelado)
      )
        this.envios.delete(payload);
  }

  private conteudo(payload: string): string | null {
    try {
      const value = JSON.parse(payload) as Record<string, unknown>;
      if (
        !value ||
        typeof value["organization_id"] !== "string" ||
        typeof value["estudo_id"] !== "string" ||
        typeof value["revisao_id"] !== "string" ||
        !(value["perigo_id"] === null || typeof value["perigo_id"] === "string") ||
        typeof value["mime"] !== "string" ||
        typeof value["tamanho"] !== "number" ||
        typeof value["sha256"] !== "string"
      )
        return null;
      // SQL deduplicates bytes within the exact destination, even when a filename differs.
      // Invalidate those lost-response aliases after cancelling that one canonical record.
      return JSON.stringify([
        value["organization_id"],
        value["estudo_id"],
        value["revisao_id"],
        value["perigo_id"],
        value["mime"],
        value["tamanho"],
        value["sha256"],
      ]);
    } catch {
      return null;
    }
  }
}
