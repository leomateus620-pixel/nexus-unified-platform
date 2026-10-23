/** Intenções em memória: falha transitória conserva a chave; cancelamento permite outro envio. */
export class IntencoesAnexoOperacional {
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
    // O servidor pode ter salvo staging antes de a resposta com o ID chegar.
    if (payloadConhecido) this.envios.delete(payloadConhecido);
    for (const [payload, intencao] of this.envios)
      if (intencao.arquivoId === arquivoId) this.envios.delete(payload);
  }
}
