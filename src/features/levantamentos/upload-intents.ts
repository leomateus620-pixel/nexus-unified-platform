/** Intenções de envio em memória: retry repete a chave; cancelamento permite novo envio. */
export class IntencoesArquivoLevantamento {
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
    for (const [payload, intencao] of this.envios)
      if (intencao.arquivoId === arquivoId) this.envios.delete(payload);
  }
}
