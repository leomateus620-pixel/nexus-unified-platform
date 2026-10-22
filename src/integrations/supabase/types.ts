export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      acao_colaboradores: {
        Row: {
          acao_id: string;
          organization_id: string;
          pessoa_id: string;
        };
        ComputedFields: never;
        Insert: {
          acao_id: string;
          organization_id: string;
          pessoa_id: string;
        };
        Update: {
          acao_id?: string;
          organization_id?: string;
          pessoa_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "acao_colaboradores_organization_id_acao_id_fkey";
            columns: ["organization_id", "acao_id"];
            isOneToOne: false;
            referencedRelation: "acoes_operacionais";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "acao_colaboradores_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      acoes_operacionais: {
        Row: {
          conclusao: string | null;
          created_at: string;
          created_by: string;
          descricao: string;
          estado: string;
          exige_verificacao: boolean;
          id: string;
          motivo: string | null;
          organization_id: string;
          prazo: string | null;
          prioridade: string;
          responsavel_id: string;
          titulo: string;
          updated_at: string;
          verificado_por: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          conclusao?: string | null;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          estado?: string;
          exige_verificacao?: boolean;
          id?: string;
          motivo?: string | null;
          organization_id: string;
          prazo?: string | null;
          prioridade?: string;
          responsavel_id: string;
          titulo: string;
          updated_at?: string;
          verificado_por?: string | null;
          version?: number;
        };
        Update: {
          conclusao?: string | null;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          estado?: string;
          exige_verificacao?: boolean;
          id?: string;
          motivo?: string | null;
          organization_id?: string;
          prazo?: string | null;
          prioridade?: string;
          responsavel_id?: string;
          titulo?: string;
          updated_at?: string;
          verificado_por?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "acoes_operacionais_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acoes_operacionais_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      agenda_evento_revisoes: {
        Row: {
          autor: string;
          created_at: string;
          evento_id: string;
          organization_id: string;
          snapshot: NonNullable<Json>;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          created_at?: string;
          evento_id: string;
          organization_id: string;
          snapshot: NonNullable<Json>;
          versao: number;
        };
        Update: {
          autor?: string;
          created_at?: string;
          evento_id?: string;
          organization_id?: string;
          snapshot?: NonNullable<Json>;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_evento_revisoes_organization_id_evento_id_fkey";
            columns: ["organization_id", "evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      agenda_eventos: {
        Row: {
          acao_id: string | null;
          bloqueia_recursos: boolean;
          created_at: string;
          created_by: string;
          data_fim: string | null;
          data_inicio: string | null;
          descricao: string;
          dia_inteiro: boolean;
          estado: string;
          fim: string;
          id: string;
          inicio: string;
          local: string;
          motivo: string | null;
          organization_id: string;
          origem_ocorrencia: string | null;
          responsavel_id: string;
          timezone: string;
          tipo: string;
          titulo: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          acao_id?: string | null;
          bloqueia_recursos?: boolean;
          created_at?: string;
          created_by?: string;
          data_fim?: string | null;
          data_inicio?: string | null;
          descricao?: string;
          dia_inteiro?: boolean;
          estado?: string;
          fim: string;
          id?: string;
          inicio: string;
          local?: string;
          motivo?: string | null;
          organization_id: string;
          origem_ocorrencia?: string | null;
          responsavel_id: string;
          timezone?: string;
          tipo: string;
          titulo: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          acao_id?: string | null;
          bloqueia_recursos?: boolean;
          created_at?: string;
          created_by?: string;
          data_fim?: string | null;
          data_inicio?: string | null;
          descricao?: string;
          dia_inteiro?: boolean;
          estado?: string;
          fim?: string;
          id?: string;
          inicio?: string;
          local?: string;
          motivo?: string | null;
          organization_id?: string;
          origem_ocorrencia?: string | null;
          responsavel_id?: string;
          timezone?: string;
          tipo?: string;
          titulo?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_eventos_organization_id_acao_id_fkey";
            columns: ["organization_id", "acao_id"];
            isOneToOne: false;
            referencedRelation: "acoes_operacionais";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "agenda_eventos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agenda_eventos_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      agenda_participantes: {
        Row: {
          ciencia_em: string | null;
          confirmacao: string;
          created_at: string;
          created_by: string;
          evento_id: string;
          funcao: string;
          id: string;
          organization_id: string;
          pessoa_id: string;
          retirado_em: string | null;
          version: number;
          vigente: boolean;
        };
        ComputedFields: never;
        Insert: {
          ciencia_em?: string | null;
          confirmacao?: string;
          created_at?: string;
          created_by?: string;
          evento_id: string;
          funcao: string;
          id?: string;
          organization_id: string;
          pessoa_id: string;
          retirado_em?: string | null;
          version?: number;
          vigente?: boolean;
        };
        Update: {
          ciencia_em?: string | null;
          confirmacao?: string;
          created_at?: string;
          created_by?: string;
          evento_id?: string;
          funcao?: string;
          id?: string;
          organization_id?: string;
          pessoa_id?: string;
          retirado_em?: string | null;
          version?: number;
          vigente?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_participantes_organization_id_evento_id_fkey";
            columns: ["organization_id", "evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "agenda_participantes_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      agenda_requisitos: {
        Row: {
          competencia_id: string;
          evento_id: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          competencia_id: string;
          evento_id: string;
          organization_id: string;
        };
        Update: {
          competencia_id?: string;
          evento_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_requisitos_organization_id_competencia_id_fkey";
            columns: ["organization_id", "competencia_id"];
            isOneToOne: false;
            referencedRelation: "competencias";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "agenda_requisitos_organization_id_evento_id_fkey";
            columns: ["organization_id", "evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      agenda_reservas_pessoas: {
        Row: {
          ativa: boolean;
          created_at: string;
          evento_id: string;
          evento_version: number;
          fim: string;
          id: string;
          inicio: string;
          liberada_em: string | null;
          organization_id: string;
          participante_id: string;
          pessoa_id: string;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          evento_id: string;
          evento_version: number;
          fim: string;
          id?: string;
          inicio: string;
          liberada_em?: string | null;
          organization_id: string;
          participante_id: string;
          pessoa_id: string;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          evento_id?: string;
          evento_version?: number;
          fim?: string;
          id?: string;
          inicio?: string;
          liberada_em?: string | null;
          organization_id?: string;
          participante_id?: string;
          pessoa_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_evento_id_fkey";
            columns: ["organization_id", "evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_evento_id_particip_fkey";
            columns: ["organization_id", "evento_id", "participante_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "agenda_participantes";
            referencedColumns: ["organization_id", "evento_id", "id", "pessoa_id"];
          },
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      almoxarifados: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string;
          descricao: string;
          id: string;
          nome: string;
          organization_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome: string;
          organization_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome?: string;
          organization_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "almoxarifados_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      anexos: {
        Row: {
          acao_id: string | null;
          calibracao_id: string | null;
          caminho: string;
          confirmado_em: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          ferramenta_id: string | null;
          id: string;
          mime: string;
          nome: string;
          organization_id: string;
          pessoa_id: string | null;
          qualificacao_id: string | null;
          sha256: string;
          tamanho: number;
        };
        ComputedFields: never;
        Insert: {
          acao_id?: string | null;
          calibracao_id?: string | null;
          caminho: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          ferramenta_id?: string | null;
          id?: string;
          mime: string;
          nome: string;
          organization_id: string;
          pessoa_id?: string | null;
          qualificacao_id?: string | null;
          sha256: string;
          tamanho: number;
        };
        Update: {
          acao_id?: string | null;
          calibracao_id?: string | null;
          caminho?: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          ferramenta_id?: string | null;
          id?: string;
          mime?: string;
          nome?: string;
          organization_id?: string;
          pessoa_id?: string | null;
          qualificacao_id?: string | null;
          sha256?: string;
          tamanho?: number;
        };
        Relationships: [
          {
            foreignKeyName: "anexo_calibracao_tenant";
            columns: ["organization_id", "calibracao_id"];
            isOneToOne: false;
            referencedRelation: "ferramenta_calibracoes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "anexo_ferramenta_tenant";
            columns: ["organization_id", "ferramenta_id"];
            isOneToOne: false;
            referencedRelation: "ferramentas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "anexos_organization_id_acao_id_fkey";
            columns: ["organization_id", "acao_id"];
            isOneToOne: false;
            referencedRelation: "acoes_operacionais";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "anexos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "anexos_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "anexos_organization_id_qualificacao_id_fkey";
            columns: ["organization_id", "qualificacao_id"];
            isOneToOne: false;
            referencedRelation: "pessoa_qualificacoes";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      apontamentos: {
        Row: {
          apontado_em: string;
          chave: string | null;
          created_at: string;
          created_by: string | null;
          estorno_de: string | null;
          id: string;
          item_id: string;
          organization_id: string;
          quantidade: number;
          sinal: number;
        };
        ComputedFields: never;
        Insert: {
          apontado_em?: string;
          chave?: string | null;
          created_at?: string;
          created_by?: string | null;
          estorno_de?: string | null;
          id?: string;
          item_id: string;
          organization_id: string;
          quantidade: number;
          sinal?: number;
        };
        Update: {
          apontado_em?: string;
          chave?: string | null;
          created_at?: string;
          created_by?: string | null;
          estorno_de?: string | null;
          id?: string;
          item_id?: string;
          organization_id?: string;
          quantidade?: number;
          sinal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "apontamentos_estorno_de_fkey";
            columns: ["estorno_de"];
            isOneToOne: false;
            referencedRelation: "apontamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apontamentos_item_id_fkey";
            columns: ["organization_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "ordem_producao_itens";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "apontamentos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      aprovacoes: {
        Row: {
          autor: string;
          created_at: string;
          hash_conteudo: string;
          id: string;
          invalidada_em: string | null;
          observacao: string | null;
          organization_id: string;
          revisao_id: string;
          tipo: string;
        };
        ComputedFields: never;
        Insert: {
          autor: string;
          created_at?: string;
          hash_conteudo: string;
          id?: string;
          invalidada_em?: string | null;
          observacao?: string | null;
          organization_id: string;
          revisao_id: string;
          tipo: string;
        };
        Update: {
          autor?: string;
          created_at?: string;
          hash_conteudo?: string;
          id?: string;
          invalidada_em?: string | null;
          observacao?: string | null;
          organization_id?: string;
          revisao_id?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "aprovacoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "aprovacoes_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      aquisicoes: {
        Row: {
          chave: string;
          created_at: string;
          created_by: string | null;
          custo_total: number | null;
          custo_unitario: number | null;
          documento_id: string | null;
          id: string;
          lote: string | null;
          organization_id: string;
          origem: Json | null;
          parcelas: NonNullable<Json>;
          pendencia: string | null;
          politica_versao: string | null;
          produto_id: string;
          quantidade: number;
          situacao: string;
          unidade: string;
          valores_calculados: Json | null;
        };
        ComputedFields: never;
        Insert: {
          chave: string;
          created_at?: string;
          created_by?: string | null;
          custo_total?: number | null;
          custo_unitario?: number | null;
          documento_id?: string | null;
          id?: string;
          lote?: string | null;
          organization_id: string;
          origem?: Json | null;
          parcelas?: NonNullable<Json>;
          pendencia?: string | null;
          politica_versao?: string | null;
          produto_id: string;
          quantidade: number;
          situacao: string;
          unidade: string;
          valores_calculados?: Json | null;
        };
        Update: {
          chave?: string;
          created_at?: string;
          created_by?: string | null;
          custo_total?: number | null;
          custo_unitario?: number | null;
          documento_id?: string | null;
          id?: string;
          lote?: string | null;
          organization_id?: string;
          origem?: Json | null;
          parcelas?: NonNullable<Json>;
          pendencia?: string | null;
          politica_versao?: string | null;
          produto_id?: string;
          quantidade?: number;
          situacao?: string;
          unidade?: string;
          valores_calculados?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "aquisicoes_documento_id_fkey";
            columns: ["documento_id"];
            isOneToOne: false;
            referencedRelation: "documentos_fiscais";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "aquisicoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "aquisicoes_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria: {
        Row: {
          acao: string;
          autor: string | null;
          created_at: string;
          dados: Json | null;
          entidade: string;
          entidade_id: string | null;
          id: string;
          motivo: string | null;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          acao: string;
          autor?: string | null;
          created_at?: string;
          dados?: Json | null;
          entidade: string;
          entidade_id?: string | null;
          id?: string;
          motivo?: string | null;
          organization_id: string;
        };
        Update: {
          acao?: string;
          autor?: string | null;
          created_at?: string;
          dados?: Json | null;
          entidade?: string;
          entidade_id?: string | null;
          id?: string;
          motivo?: string | null;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      calculo_execucoes: {
        Row: {
          created_at: string;
          created_by: string | null;
          entradas: NonNullable<Json>;
          id: string;
          motor_versao: string;
          organization_id: string;
          regras_id: string | null;
          resultado: NonNullable<Json>;
          revisao_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          entradas: NonNullable<Json>;
          id?: string;
          motor_versao: string;
          organization_id: string;
          regras_id?: string | null;
          resultado: NonNullable<Json>;
          revisao_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          entradas?: NonNullable<Json>;
          id?: string;
          motor_versao?: string;
          organization_id?: string;
          regras_id?: string | null;
          resultado?: NonNullable<Json>;
          revisao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calculo_execucoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calculo_execucoes_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      cliente_historico: {
        Row: {
          antes: Json | null;
          autor: string | null;
          cliente_id: string;
          contato_id: string | null;
          created_at: string;
          depois: NonNullable<Json>;
          id: number;
          motivo: string | null;
          operacao: string;
          organization_id: string;
          unidade_id: string | null;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          antes?: Json | null;
          autor?: string | null;
          cliente_id: string;
          contato_id?: string | null;
          created_at?: string;
          depois: NonNullable<Json>;
          id?: never;
          motivo?: string | null;
          operacao: string;
          organization_id: string;
          unidade_id?: string | null;
          versao: number;
        };
        Update: {
          antes?: Json | null;
          autor?: string | null;
          cliente_id?: string;
          contato_id?: string | null;
          created_at?: string;
          depois?: NonNullable<Json>;
          id?: never;
          motivo?: string | null;
          operacao?: string;
          organization_id?: string;
          unidade_id?: string | null;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cliente_historico_organization_id_cliente_id_fkey";
            columns: ["organization_id", "cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "cliente_historico_organization_id_contato_id_fkey";
            columns: ["organization_id", "contato_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "cliente_historico_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cliente_historico_organization_id_unidade_id_fkey";
            columns: ["organization_id", "unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      clientes: {
        Row: {
          arquivado_em: string | null;
          cidade: string | null;
          cnpj: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          identificador_normalizado: string | null;
          motivo_arquivo: string | null;
          nome_exibicao: string | null;
          observacoes: string | null;
          organization_id: string;
          razao_social: string;
          situacao: string;
          uf: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          arquivado_em?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          identificador_normalizado?: never;
          motivo_arquivo?: string | null;
          nome_exibicao?: string | null;
          observacoes?: string | null;
          organization_id: string;
          razao_social: string;
          situacao?: string;
          uf?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          arquivado_em?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          identificador_normalizado?: never;
          motivo_arquivo?: string | null;
          nome_exibicao?: string | null;
          observacoes?: string | null;
          organization_id?: string;
          razao_social?: string;
          situacao?: string;
          uf?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      codigo_equivalencias: {
        Row: {
          autor: string | null;
          codigo_anterior: string;
          codigo_novo: string;
          created_at: string;
          id: string;
          motivo: string;
          organization_id: string;
          produto_id: string;
        };
        ComputedFields: never;
        Insert: {
          autor?: string | null;
          codigo_anterior: string;
          codigo_novo: string;
          created_at?: string;
          id?: string;
          motivo: string;
          organization_id: string;
          produto_id: string;
        };
        Update: {
          autor?: string | null;
          codigo_anterior?: string;
          codigo_novo?: string;
          created_at?: string;
          id?: string;
          motivo?: string;
          organization_id?: string;
          produto_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "codigo_equivalencias_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "codigo_equivalencias_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      competencias: {
        Row: {
          ativa: boolean;
          created_at: string;
          created_by: string;
          descricao: string | null;
          exige_evidencia: boolean;
          exige_validade: boolean;
          id: string;
          nome: string;
          organization_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          descricao?: string | null;
          exige_evidencia?: boolean;
          exige_validade?: boolean;
          id?: string;
          nome: string;
          organization_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          descricao?: string | null;
          exige_evidencia?: boolean;
          exige_validade?: boolean;
          id?: string;
          nome?: string;
          organization_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "competencias_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      config_orcamento: {
        Row: {
          organization_id: string;
          parametros: NonNullable<Json>;
          proximo_numero: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          organization_id: string;
          parametros?: NonNullable<Json>;
          proximo_numero?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          parametros?: NonNullable<Json>;
          proximo_numero?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "config_orcamento_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      contatos: {
        Row: {
          arquivado_em: string | null;
          cargo: string | null;
          cliente_id: string;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: string;
          motivo_arquivo: string | null;
          nome: string;
          observacoes: string | null;
          organization_id: string;
          telefone: string | null;
          unidade_id: string | null;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          arquivado_em?: string | null;
          cargo?: string | null;
          cliente_id: string;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          motivo_arquivo?: string | null;
          nome: string;
          observacoes?: string | null;
          organization_id: string;
          telefone?: string | null;
          unidade_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          arquivado_em?: string | null;
          cargo?: string | null;
          cliente_id?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          motivo_arquivo?: string | null;
          nome?: string;
          observacoes?: string | null;
          organization_id?: string;
          telefone?: string | null;
          unidade_id?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contatos_cliente_tenant_operacional";
            columns: ["organization_id", "cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "contatos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contatos_unidade_cliente_operacional";
            columns: ["organization_id", "cliente_id", "unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
        ];
      };
      demandas: {
        Row: {
          anterior: Json | null;
          created_at: string;
          hash_tecnico: string | null;
          id: string;
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"];
          organization_id: string;
          origem: Json | null;
          quantidade_necessaria: number;
          quantidade_planejada: number;
          quantidade_tecnica: number | null;
          revisao_componente_id: string;
          revisao_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          anterior?: Json | null;
          created_at?: string;
          hash_tecnico?: string | null;
          id?: string;
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"];
          organization_id: string;
          origem?: Json | null;
          quantidade_necessaria: number;
          quantidade_planejada: number;
          quantidade_tecnica?: number | null;
          revisao_componente_id: string;
          revisao_id: string;
          status?: string;
        };
        Update: {
          anterior?: Json | null;
          created_at?: string;
          hash_tecnico?: string | null;
          id?: string;
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"];
          organization_id?: string;
          origem?: Json | null;
          quantidade_necessaria?: number;
          quantidade_planejada?: number;
          quantidade_tecnica?: number | null;
          revisao_componente_id?: string;
          revisao_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "demandas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandas_revisao_componente_id_fkey";
            columns: ["revisao_componente_id"];
            isOneToOne: false;
            referencedRelation: "revisao_componentes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "demandas_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos: {
        Row: {
          emitido_em: string;
          emitido_por: string | null;
          id: string;
          interno: boolean;
          organization_id: string;
          revisao_id: string | null;
          snapshot: NonNullable<Json>;
          tipo: string;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          emitido_em?: string;
          emitido_por?: string | null;
          id?: string;
          interno?: boolean;
          organization_id: string;
          revisao_id?: string | null;
          snapshot: NonNullable<Json>;
          tipo: string;
          versao?: number;
        };
        Update: {
          emitido_em?: string;
          emitido_por?: string | null;
          id?: string;
          interno?: boolean;
          organization_id?: string;
          revisao_id?: string | null;
          snapshot?: NonNullable<Json>;
          tipo?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      documentos_fiscais: {
        Row: {
          chave_acesso: string | null;
          created_at: string;
          emitido_em: string | null;
          fornecedor_id: string | null;
          fornecedor_texto: string | null;
          id: string;
          numero: string;
          observacao: string | null;
          organization_id: string;
          origem: Json | null;
          provisorio: boolean;
          serie: string | null;
        };
        ComputedFields: never;
        Insert: {
          chave_acesso?: string | null;
          created_at?: string;
          emitido_em?: string | null;
          fornecedor_id?: string | null;
          fornecedor_texto?: string | null;
          id?: string;
          numero: string;
          observacao?: string | null;
          organization_id: string;
          origem?: Json | null;
          provisorio?: boolean;
          serie?: string | null;
        };
        Update: {
          chave_acesso?: string | null;
          created_at?: string;
          emitido_em?: string | null;
          fornecedor_id?: string | null;
          fornecedor_texto?: string | null;
          id?: string;
          numero?: string;
          observacao?: string | null;
          organization_id?: string;
          origem?: Json | null;
          provisorio?: boolean;
          serie?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documentos_fiscais_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      equipe_membros: {
        Row: {
          created_at: string;
          created_by: string;
          equipe_id: string;
          fim: string | null;
          id: string;
          inicio: string;
          organization_id: string;
          pessoa_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          equipe_id: string;
          fim?: string | null;
          id?: string;
          inicio: string;
          organization_id: string;
          pessoa_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          equipe_id?: string;
          fim?: string | null;
          id?: string;
          inicio?: string;
          organization_id?: string;
          pessoa_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "equipe_membros_organization_id_equipe_id_fkey";
            columns: ["organization_id", "equipe_id"];
            isOneToOne: false;
            referencedRelation: "equipes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "equipe_membros_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      equipes: {
        Row: {
          ativa: boolean;
          created_at: string;
          created_by: string;
          id: string;
          lider_id: string | null;
          nome: string;
          organization_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          lider_id?: string | null;
          nome: string;
          organization_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          lider_id?: string | null;
          nome?: string;
          organization_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "equipes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "equipes_organization_id_lider_id_fkey";
            columns: ["organization_id", "lider_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      est_metodo_versoes: {
        Row: {
          created_at: string;
          created_by: string;
          fontes: NonNullable<Json>;
          id: string;
          instrucoes: string;
          metodo_id: string;
          nome: string;
          numero: number;
          organization_id: string;
          registro_profissional: string;
          requisitos: NonNullable<Json>;
          responsavel_id: string;
          tipo: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          fontes: NonNullable<Json>;
          id?: string;
          instrucoes: string;
          metodo_id: string;
          nome: string;
          numero: number;
          organization_id: string;
          registro_profissional: string;
          requisitos: NonNullable<Json>;
          responsavel_id: string;
          tipo: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          fontes?: NonNullable<Json>;
          id?: string;
          instrucoes?: string;
          metodo_id?: string;
          nome?: string;
          numero?: number;
          organization_id?: string;
          registro_profissional?: string;
          requisitos?: NonNullable<Json>;
          responsavel_id?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "est_metodo_versoes_organization_id_metodo_id_fkey";
            columns: ["organization_id", "metodo_id"];
            isOneToOne: false;
            referencedRelation: "est_metodos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "est_metodo_versoes_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      est_metodos: {
        Row: {
          created_at: string;
          created_by: string;
          descricao: string;
          id: string;
          nome: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome: string;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "est_metodos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      estoque_conferencias: {
        Row: {
          aceita: number;
          apontamento_id: string | null;
          created_at: string;
          created_by: string;
          fator: number;
          id: string;
          inventario_id: string | null;
          local_id: string;
          lote: string | null;
          motivo: string | null;
          organization_id: string;
          produto_id: string;
          quantidade: number;
          quarentena: number;
          recebimento_id: string | null;
          reconciliacao: string | null;
          rejeitada: number;
          serie: string | null;
          unidade_origem: string;
        };
        ComputedFields: never;
        Insert: {
          aceita: number;
          apontamento_id?: string | null;
          created_at?: string;
          created_by?: string;
          fator: number;
          id?: string;
          inventario_id?: string | null;
          local_id: string;
          lote?: string | null;
          motivo?: string | null;
          organization_id: string;
          produto_id: string;
          quantidade: number;
          quarentena: number;
          recebimento_id?: string | null;
          reconciliacao?: string | null;
          rejeitada: number;
          serie?: string | null;
          unidade_origem: string;
        };
        Update: {
          aceita?: number;
          apontamento_id?: string | null;
          created_at?: string;
          created_by?: string;
          fator?: number;
          id?: string;
          inventario_id?: string | null;
          local_id?: string;
          lote?: string | null;
          motivo?: string | null;
          organization_id?: string;
          produto_id?: string;
          quantidade?: number;
          quarentena?: number;
          recebimento_id?: string | null;
          reconciliacao?: string | null;
          rejeitada?: number;
          serie?: string | null;
          unidade_origem?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_conferencias_organization_id_apontamento_id_fkey";
            columns: ["organization_id", "apontamento_id"];
            isOneToOne: false;
            referencedRelation: "apontamentos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_inventario_id_fkey";
            columns: ["organization_id", "inventario_id"];
            isOneToOne: false;
            referencedRelation: "estoque_inventarios";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_local_id_fkey";
            columns: ["organization_id", "local_id"];
            isOneToOne: false;
            referencedRelation: "almoxarifados";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_produto_id_fkey";
            columns: ["organization_id", "produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_recebimento_id_fkey";
            columns: ["organization_id", "recebimento_id"];
            isOneToOne: false;
            referencedRelation: "recebimentos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estoque_estorno_alocacoes: {
        Row: {
          conferencia_id: string;
          id: string;
          operacao_id: string;
          organization_id: string;
          quantidade: number;
        };
        ComputedFields: never;
        Insert: {
          conferencia_id: string;
          id?: string;
          operacao_id: string;
          organization_id: string;
          quantidade: number;
        };
        Update: {
          conferencia_id?: string;
          id?: string;
          operacao_id?: string;
          organization_id?: string;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_estorno_alocacoes_organization_id_conferencia_id_fkey";
            columns: ["organization_id", "conferencia_id"];
            isOneToOne: false;
            referencedRelation: "estoque_conferencias";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_estorno_alocacoes_organization_id_operacao_id_fkey";
            columns: ["organization_id", "operacao_id"];
            isOneToOne: false;
            referencedRelation: "estoque_operacoes";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estoque_inventarios: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          baseline: number;
          contada: number;
          created_at: string;
          created_by: string;
          estado: string;
          id: string;
          ledger_id: number;
          local_id: string;
          lote: string | null;
          motivo: string;
          organization_id: string;
          produto_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          baseline: number;
          contada: number;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          ledger_id: number;
          local_id: string;
          lote?: string | null;
          motivo: string;
          organization_id: string;
          produto_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          baseline?: number;
          contada?: number;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          ledger_id?: number;
          local_id?: string;
          lote?: string | null;
          motivo?: string;
          organization_id?: string;
          produto_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_inventarios_organization_id_local_id_fkey";
            columns: ["organization_id", "local_id"];
            isOneToOne: false;
            referencedRelation: "almoxarifados";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_inventarios_organization_id_produto_id_fkey";
            columns: ["organization_id", "produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estoque_movimentos: {
        Row: {
          conferencia_id: string;
          created_at: string;
          created_by: string;
          id: string;
          local_id: string | null;
          operacao_id: string;
          organization_id: string;
          pessoa_id: string | null;
          posicao: string;
          produto_id: string;
          quantidade: number;
          reserva_id: string | null;
          seq: number;
        };
        ComputedFields: never;
        Insert: {
          conferencia_id: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          local_id?: string | null;
          operacao_id: string;
          organization_id: string;
          pessoa_id?: string | null;
          posicao: string;
          produto_id: string;
          quantidade: number;
          reserva_id?: string | null;
          seq?: never;
        };
        Update: {
          conferencia_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          local_id?: string | null;
          operacao_id?: string;
          organization_id?: string;
          pessoa_id?: string | null;
          posicao?: string;
          produto_id?: string;
          quantidade?: number;
          reserva_id?: string | null;
          seq?: never;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_organization_id_local_id_fkey";
            columns: ["organization_id", "local_id"];
            isOneToOne: false;
            referencedRelation: "almoxarifados";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_operacao_id_fkey";
            columns: ["organization_id", "operacao_id"];
            isOneToOne: false;
            referencedRelation: "estoque_operacoes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_produto_id_conferencia__fkey";
            columns: ["organization_id", "produto_id", "conferencia_id"];
            isOneToOne: false;
            referencedRelation: "estoque_conferencias";
            referencedColumns: ["organization_id", "produto_id", "id"];
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_produto_id_reserva_id_fkey";
            columns: ["organization_id", "produto_id", "reserva_id"];
            isOneToOne: false;
            referencedRelation: "estoque_reservas";
            referencedColumns: ["organization_id", "produto_id", "id"];
          },
        ];
      };
      estoque_operacoes: {
        Row: {
          apontamento_estorno_id: string | null;
          conferencia_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          inventario_id: string | null;
          motivo: string | null;
          organization_id: string;
          recebimento_estorno_id: string | null;
          reserva_id: string | null;
          tipo: string;
        };
        ComputedFields: never;
        Insert: {
          apontamento_estorno_id?: string | null;
          conferencia_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          inventario_id?: string | null;
          motivo?: string | null;
          organization_id: string;
          recebimento_estorno_id?: string | null;
          reserva_id?: string | null;
          tipo: string;
        };
        Update: {
          apontamento_estorno_id?: string | null;
          conferencia_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          inventario_id?: string | null;
          motivo?: string | null;
          organization_id?: string;
          recebimento_estorno_id?: string | null;
          reserva_id?: string | null;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_operacoes_organization_id_apontamento_estorno_id_fkey";
            columns: ["organization_id", "apontamento_estorno_id"];
            isOneToOne: false;
            referencedRelation: "apontamentos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_conferencia_id_fkey";
            columns: ["organization_id", "conferencia_id"];
            isOneToOne: false;
            referencedRelation: "estoque_conferencias";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_inventario_id_fkey";
            columns: ["organization_id", "inventario_id"];
            isOneToOne: false;
            referencedRelation: "estoque_inventarios";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_recebimento_estorno_id_fkey";
            columns: ["organization_id", "recebimento_estorno_id"];
            isOneToOne: false;
            referencedRelation: "recebimentos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_reserva_id_fkey";
            columns: ["organization_id", "reserva_id"];
            isOneToOne: false;
            referencedRelation: "estoque_reservas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estoque_produto_politicas: {
        Row: {
          created_at: string;
          created_by: string;
          estoque_minimo: number;
          exige_lote: boolean;
          exige_serie: boolean;
          id: string;
          organization_id: string;
          produto_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          estoque_minimo?: number;
          exige_lote?: boolean;
          exige_serie?: boolean;
          id?: string;
          organization_id: string;
          produto_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          estoque_minimo?: number;
          exige_lote?: boolean;
          exige_serie?: boolean;
          id?: string;
          organization_id?: string;
          produto_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_produto_politicas_organization_id_produto_id_fkey";
            columns: ["organization_id", "produto_id"];
            isOneToOne: true;
            referencedRelation: "produtos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estoque_reserva_itens: {
        Row: {
          conferencia_id: string;
          id: string;
          organization_id: string;
          produto_id: string;
          quantidade: number;
          reserva_id: string;
        };
        ComputedFields: never;
        Insert: {
          conferencia_id: string;
          id?: string;
          organization_id: string;
          produto_id: string;
          quantidade: number;
          reserva_id: string;
        };
        Update: {
          conferencia_id?: string;
          id?: string;
          organization_id?: string;
          produto_id?: string;
          quantidade?: number;
          reserva_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_reserva_itens_organization_id_produto_id_conferenc_fkey";
            columns: ["organization_id", "produto_id", "conferencia_id"];
            isOneToOne: false;
            referencedRelation: "estoque_conferencias";
            referencedColumns: ["organization_id", "produto_id", "id"];
          },
          {
            foreignKeyName: "estoque_reserva_itens_organization_id_produto_id_reserva_i_fkey";
            columns: ["organization_id", "produto_id", "reserva_id"];
            isOneToOne: false;
            referencedRelation: "estoque_reservas";
            referencedColumns: ["organization_id", "produto_id", "id"];
          },
        ];
      };
      estoque_reservas: {
        Row: {
          created_at: string;
          created_by: string;
          estado: string;
          id: string;
          local_id: string;
          lote: string | null;
          motivo: string | null;
          op_id: string | null;
          organization_id: string;
          pessoa_id: string;
          produto_id: string;
          projeto_id: string | null;
          quantidade: number;
          updated_at: string;
          validade: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          local_id: string;
          lote?: string | null;
          motivo?: string | null;
          op_id?: string | null;
          organization_id: string;
          pessoa_id: string;
          produto_id: string;
          projeto_id?: string | null;
          quantidade: number;
          updated_at?: string;
          validade: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          local_id?: string;
          lote?: string | null;
          motivo?: string | null;
          op_id?: string | null;
          organization_id?: string;
          pessoa_id?: string;
          produto_id?: string;
          projeto_id?: string | null;
          quantidade?: number;
          updated_at?: string;
          validade?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estoque_reservas_organization_id_local_id_fkey";
            columns: ["organization_id", "local_id"];
            isOneToOne: false;
            referencedRelation: "almoxarifados";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_op_id_fkey";
            columns: ["organization_id", "op_id"];
            isOneToOne: false;
            referencedRelation: "ordens_producao";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_produto_id_fkey";
            columns: ["organization_id", "produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_projeto_id_fkey";
            columns: ["organization_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_arquivos: {
        Row: {
          caminho: string;
          confirmado_em: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          estudo_id: string;
          id: string;
          mime: string;
          motivo: string | null;
          nome: string;
          organization_id: string;
          perigo_id: string | null;
          revisao_id: string;
          sha256: string;
          tamanho: number;
        };
        ComputedFields: never;
        Insert: {
          caminho: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          estudo_id: string;
          id?: string;
          mime: string;
          motivo?: string | null;
          nome: string;
          organization_id: string;
          perigo_id?: string | null;
          revisao_id: string;
          sha256: string;
          tamanho: number;
        };
        Update: {
          caminho?: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          estudo_id?: string;
          id?: string;
          mime?: string;
          motivo?: string | null;
          nome?: string;
          organization_id?: string;
          perigo_id?: string | null;
          revisao_id?: string;
          sha256?: string;
          tamanho?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_arquivos_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_arquivos_organization_id_estudo_id_revisao_id_perig_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id", "perigo_id"];
            isOneToOne: false;
            referencedRelation: "estudo_perigos";
            referencedColumns: ["organization_id", "estudo_id", "revisao_id", "id"];
          },
        ];
      };
      estudo_decisoes: {
        Row: {
          autor: string;
          created_at: string;
          decisao: string;
          estudo_id: string;
          id: number;
          motivo: string;
          organization_id: string;
          pessoa_id: string | null;
          registro_profissional: string | null;
          responsabilidade_tecnica: string;
          revisao_id: string;
          submissao_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          created_at?: string;
          decisao: string;
          estudo_id: string;
          id?: never;
          motivo: string;
          organization_id: string;
          pessoa_id?: string | null;
          registro_profissional?: string | null;
          responsabilidade_tecnica?: string;
          revisao_id: string;
          submissao_id?: string | null;
        };
        Update: {
          autor?: string;
          created_at?: string;
          decisao?: string;
          estudo_id?: string;
          id?: never;
          motivo?: string;
          organization_id?: string;
          pessoa_id?: string | null;
          registro_profissional?: string | null;
          responsabilidade_tecnica?: string;
          revisao_id?: string;
          submissao_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_decisoes_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_decisoes_organization_id_estudo_id_revisao_id_submi_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id", "submissao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_submissoes";
            referencedColumns: ["organization_id", "estudo_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "estudo_decisoes_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_eventos: {
        Row: {
          autor: string;
          comando: string;
          created_at: string;
          estudo_id: string;
          id: number;
          motivo: string | null;
          organization_id: string;
          revisao_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          comando: string;
          created_at?: string;
          estudo_id: string;
          id?: never;
          motivo?: string | null;
          organization_id: string;
          revisao_id?: string | null;
        };
        Update: {
          autor?: string;
          comando?: string;
          created_at?: string;
          estudo_id?: string;
          id?: never;
          motivo?: string | null;
          organization_id?: string;
          revisao_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_eventos_organization_id_estudo_id_fkey";
            columns: ["organization_id", "estudo_id"];
            isOneToOne: false;
            referencedRelation: "estudos_tecnicos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_eventos_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
        ];
      };
      estudo_fontes: {
        Row: {
          ativa: boolean;
          created_at: string;
          created_by: string;
          desativada_motivo: string | null;
          documento_id: string | null;
          estudo_id: string;
          id: string;
          justificativa: string;
          levantamento_id: string | null;
          levantamento_revisao_id: string | null;
          numero: number | null;
          organization_id: string;
          pe_projeto_id: string | null;
          pe_versao_id: string | null;
          revisao_id: string;
          sha256: string | null;
          tipo: string;
          titulo: string;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          desativada_motivo?: string | null;
          documento_id?: string | null;
          estudo_id: string;
          id?: string;
          justificativa: string;
          levantamento_id?: string | null;
          levantamento_revisao_id?: string | null;
          numero?: number | null;
          organization_id: string;
          pe_projeto_id?: string | null;
          pe_versao_id?: string | null;
          revisao_id: string;
          sha256?: string | null;
          tipo: string;
          titulo: string;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          desativada_motivo?: string | null;
          documento_id?: string | null;
          estudo_id?: string;
          id?: string;
          justificativa?: string;
          levantamento_id?: string | null;
          levantamento_revisao_id?: string | null;
          numero?: number | null;
          organization_id?: string;
          pe_projeto_id?: string | null;
          pe_versao_id?: string | null;
          revisao_id?: string;
          sha256?: string | null;
          tipo?: string;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_fontes_organization_id_documento_id_fkey";
            columns: ["organization_id", "documento_id"];
            isOneToOne: false;
            referencedRelation: "documentos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_levantamento_id_levantamento_fkey";
            columns: ["organization_id", "levantamento_id", "levantamento_revisao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_pe_projeto_id_pe_versao_id_fkey";
            columns: ["organization_id", "pe_projeto_id", "pe_versao_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      estudo_medida_linhagens: {
        Row: {
          acao_id: string | null;
          acao_request_hash: string | null;
          created_at: string;
          created_by: string;
          estudo_id: string;
          id: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          acao_id?: string | null;
          acao_request_hash?: string | null;
          created_at?: string;
          created_by?: string;
          estudo_id: string;
          id?: string;
          organization_id: string;
        };
        Update: {
          acao_id?: string | null;
          acao_request_hash?: string | null;
          created_at?: string;
          created_by?: string;
          estudo_id?: string;
          id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_medida_linhagens_organization_id_acao_id_fkey";
            columns: ["organization_id", "acao_id"];
            isOneToOne: false;
            referencedRelation: "acoes_operacionais";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_medida_linhagens_organization_id_estudo_id_fkey";
            columns: ["organization_id", "estudo_id"];
            isOneToOne: false;
            referencedRelation: "estudos_tecnicos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_medidas: {
        Row: {
          base_id: string | null;
          created_at: string;
          created_by: string;
          descricao: string;
          estudo_id: string;
          exige_acao: boolean;
          fundamento: string;
          id: string;
          linhagem_id: string;
          organization_id: string;
          perigo_id: string;
          prazo: string | null;
          prioridade: string;
          responsavel_id: string | null;
          revisao_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          base_id?: string | null;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          estudo_id: string;
          exige_acao?: boolean;
          fundamento?: string;
          id?: string;
          linhagem_id: string;
          organization_id: string;
          perigo_id: string;
          prazo?: string | null;
          prioridade?: string;
          responsavel_id?: string | null;
          revisao_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          base_id?: string | null;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          estudo_id?: string;
          exige_acao?: boolean;
          fundamento?: string;
          id?: string;
          linhagem_id?: string;
          organization_id?: string;
          perigo_id?: string;
          prazo?: string | null;
          prioridade?: string;
          responsavel_id?: string | null;
          revisao_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_base_id_fkey";
            columns: ["organization_id", "estudo_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "estudo_medidas";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_linhagem_id_fkey";
            columns: ["organization_id", "estudo_id", "linhagem_id"];
            isOneToOne: false;
            referencedRelation: "estudo_medida_linhagens";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_revisao_id_perigo_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id", "perigo_id"];
            isOneToOne: false;
            referencedRelation: "estudo_perigos";
            referencedColumns: ["organization_id", "estudo_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_perigos: {
        Row: {
          avaliacao: string;
          base_id: string | null;
          codigo: string;
          created_at: string;
          created_by: string;
          critico: boolean;
          descricao: string;
          estudo_id: string;
          exposicao: string;
          id: string;
          local: string;
          organization_id: string;
          revisao_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          avaliacao?: string;
          base_id?: string | null;
          codigo: string;
          created_at?: string;
          created_by?: string;
          critico?: boolean;
          descricao?: string;
          estudo_id: string;
          exposicao?: string;
          id?: string;
          local?: string;
          organization_id: string;
          revisao_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          avaliacao?: string;
          base_id?: string | null;
          codigo?: string;
          created_at?: string;
          created_by?: string;
          critico?: boolean;
          descricao?: string;
          estudo_id?: string;
          exposicao?: string;
          id?: string;
          local?: string;
          organization_id?: string;
          revisao_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_perigos_organization_id_estudo_id_base_id_fkey";
            columns: ["organization_id", "estudo_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "estudo_perigos";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_perigos_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
        ];
      };
      estudo_revisoes: {
        Row: {
          analise: string;
          aprovado_em: string | null;
          aprovado_por: string | null;
          art_referencia: string;
          base_id: string | null;
          conclusao: string;
          created_at: string;
          created_by: string;
          escopo: string;
          estado: string;
          estudo_id: string;
          id: string;
          metodo_versao_id: string | null;
          numero: number;
          organization_id: string;
          premissas: string;
          responsabilidade_tecnica: string;
          responsavel_tecnico_id: string;
          revisor_id: string | null;
          snapshot: Json | null;
          snapshot_sha256: string | null;
          submissao_atual_id: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          analise?: string;
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          art_referencia?: string;
          base_id?: string | null;
          conclusao?: string;
          created_at?: string;
          created_by?: string;
          escopo?: string;
          estado?: string;
          estudo_id: string;
          id?: string;
          metodo_versao_id?: string | null;
          numero: number;
          organization_id: string;
          premissas?: string;
          responsabilidade_tecnica?: string;
          responsavel_tecnico_id: string;
          revisor_id?: string | null;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          submissao_atual_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          analise?: string;
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          art_referencia?: string;
          base_id?: string | null;
          conclusao?: string;
          created_at?: string;
          created_by?: string;
          escopo?: string;
          estado?: string;
          estudo_id?: string;
          id?: string;
          metodo_versao_id?: string | null;
          numero?: number;
          organization_id?: string;
          premissas?: string;
          responsabilidade_tecnica?: string;
          responsavel_tecnico_id?: string;
          revisor_id?: string | null;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          submissao_atual_id?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "est_submissao_fk";
            columns: ["organization_id", "estudo_id", "id", "submissao_atual_id"];
            isOneToOne: false;
            referencedRelation: "estudo_submissoes";
            referencedColumns: ["organization_id", "estudo_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_estudo_id_base_id_fkey";
            columns: ["organization_id", "estudo_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_estudo_id_fkey";
            columns: ["organization_id", "estudo_id"];
            isOneToOne: false;
            referencedRelation: "estudos_tecnicos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_metodo_versao_id_fkey";
            columns: ["organization_id", "metodo_versao_id"];
            isOneToOne: false;
            referencedRelation: "est_metodo_versoes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_responsavel_tecnico_id_fkey";
            columns: ["organization_id", "responsavel_tecnico_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_revisor_id_fkey";
            columns: ["organization_id", "revisor_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_submissoes: {
        Row: {
          autor: string;
          created_at: string;
          estudo_id: string;
          id: string;
          numero: number;
          organization_id: string;
          pessoa_id: string;
          registro_profissional: string;
          revisao_id: string;
          sha256: string;
          snapshot: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          created_at?: string;
          estudo_id: string;
          id?: string;
          numero: number;
          organization_id: string;
          pessoa_id: string;
          registro_profissional: string;
          revisao_id: string;
          sha256: string;
          snapshot: NonNullable<Json>;
        };
        Update: {
          autor?: string;
          created_at?: string;
          estudo_id?: string;
          id?: string;
          numero?: number;
          organization_id?: string;
          pessoa_id?: string;
          registro_profissional?: string;
          revisao_id?: string;
          sha256?: string;
          snapshot?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_submissoes_organization_id_estudo_id_revisao_id_fkey";
            columns: ["organization_id", "estudo_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_submissoes_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      estudo_substituicoes: {
        Row: {
          anterior_id: string;
          atual_id: string;
          autor: string;
          created_at: string;
          estudo_id: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          anterior_id: string;
          atual_id: string;
          autor?: string;
          created_at?: string;
          estudo_id: string;
          organization_id: string;
        };
        Update: {
          anterior_id?: string;
          atual_id?: string;
          autor?: string;
          created_at?: string;
          estudo_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "estudo_substituicoes_organization_id_estudo_id_anterior_id_fkey";
            columns: ["organization_id", "estudo_id", "anterior_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudo_substituicoes_organization_id_estudo_id_atual_id_fkey";
            columns: ["organization_id", "estudo_id", "atual_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
        ];
      };
      estudos_tecnicos: {
        Row: {
          aprovada_id: string | null;
          cliente_id: string;
          codigo: string;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          projeto_id: string | null;
          responsavel_id: string;
          revisao_atual_id: string | null;
          tipo: string;
          titulo: string;
          unidade_id: string;
          updated_at: string;
          version: number;
          visibilidade: string;
        };
        ComputedFields: never;
        Insert: {
          aprovada_id?: string | null;
          cliente_id: string;
          codigo: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id: string;
          projeto_id?: string | null;
          responsavel_id: string;
          revisao_atual_id?: string | null;
          tipo: string;
          titulo: string;
          unidade_id: string;
          updated_at?: string;
          version?: number;
          visibilidade?: string;
        };
        Update: {
          aprovada_id?: string | null;
          cliente_id?: string;
          codigo?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          projeto_id?: string | null;
          responsavel_id?: string;
          revisao_atual_id?: string | null;
          tipo?: string;
          titulo?: string;
          unidade_id?: string;
          updated_at?: string;
          version?: number;
          visibilidade?: string;
        };
        Relationships: [
          {
            foreignKeyName: "est_aprovada_fk";
            columns: ["organization_id", "id", "aprovada_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "est_atual_fk";
            columns: ["organization_id", "id", "revisao_atual_id"];
            isOneToOne: false;
            referencedRelation: "estudo_revisoes";
            referencedColumns: ["organization_id", "estudo_id", "id"];
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_cliente_id_projeto_id_fkey";
            columns: ["organization_id", "cliente_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_cliente_id_unidade_id_fkey";
            columns: ["organization_id", "cliente_id", "unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      fabricantes: {
        Row: {
          id: string;
          nome: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          nome: string;
          organization_id: string;
        };
        Update: {
          id?: string;
          nome?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fabricantes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      familias_codigo: {
        Row: {
          grupo: string;
          nome: string;
          observacao: string | null;
          ordem: number;
          sigla: string;
          situacao: string;
        };
        ComputedFields: never;
        Insert: {
          grupo: string;
          nome: string;
          observacao?: string | null;
          ordem?: number;
          sigla: string;
          situacao?: string;
        };
        Update: {
          grupo?: string;
          nome?: string;
          observacao?: string | null;
          ordem?: number;
          sigla?: string;
          situacao?: string;
        };
        Relationships: [];
      };
      ferramenta_calibracao_politicas: {
        Row: {
          created_at: string;
          created_by: string;
          exige_validade: boolean;
          fonte: string;
          id: string;
          metodo: string;
          nome: string;
          numero: number;
          organization_id: string;
          profissional_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          exige_validade: boolean;
          fonte: string;
          id?: string;
          metodo: string;
          nome: string;
          numero: number;
          organization_id: string;
          profissional_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          exige_validade?: boolean;
          fonte?: string;
          id?: string;
          metodo?: string;
          nome?: string;
          numero?: number;
          organization_id?: string;
          profissional_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ferramenta_calibracao_politic_organization_id_profissional_fkey";
            columns: ["organization_id", "profissional_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramenta_calibracao_politicas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ferramenta_calibracoes: {
        Row: {
          conferido_em: string | null;
          conferido_por: string | null;
          created_at: string;
          created_by: string;
          emissor: string;
          estado: string;
          execucao: string;
          ferramenta_id: string;
          id: string;
          motivo: string | null;
          organization_id: string;
          politica_id: string;
          referencia: string | null;
          updated_at: string;
          validade: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          conferido_em?: string | null;
          conferido_por?: string | null;
          created_at?: string;
          created_by?: string;
          emissor: string;
          estado?: string;
          execucao: string;
          ferramenta_id: string;
          id?: string;
          motivo?: string | null;
          organization_id: string;
          politica_id: string;
          referencia?: string | null;
          updated_at?: string;
          validade?: string | null;
          version?: number;
        };
        Update: {
          conferido_em?: string | null;
          conferido_por?: string | null;
          created_at?: string;
          created_by?: string;
          emissor?: string;
          estado?: string;
          execucao?: string;
          ferramenta_id?: string;
          id?: string;
          motivo?: string | null;
          organization_id?: string;
          politica_id?: string;
          referencia?: string | null;
          updated_at?: string;
          validade?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ferramenta_calibracoes_organization_id_ferramenta_id_fkey";
            columns: ["organization_id", "ferramenta_id"];
            isOneToOne: false;
            referencedRelation: "ferramentas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramenta_calibracoes_organization_id_politica_id_fkey";
            columns: ["organization_id", "politica_id"];
            isOneToOne: false;
            referencedRelation: "ferramenta_calibracao_politicas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ferramenta_custodias: {
        Row: {
          agenda_evento_id: string | null;
          condicao_devolucao: string | null;
          created_at: string;
          created_by: string;
          devolvida_em: string | null;
          estado: string;
          ferramenta_id: string;
          fim: string;
          id: string;
          inicio: string;
          motivo: string | null;
          organization_id: string;
          pessoa_id: string;
          retirada_em: string | null;
          timezone: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          agenda_evento_id?: string | null;
          condicao_devolucao?: string | null;
          created_at?: string;
          created_by?: string;
          devolvida_em?: string | null;
          estado?: string;
          ferramenta_id: string;
          fim: string;
          id?: string;
          inicio: string;
          motivo?: string | null;
          organization_id: string;
          pessoa_id: string;
          retirada_em?: string | null;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          agenda_evento_id?: string | null;
          condicao_devolucao?: string | null;
          created_at?: string;
          created_by?: string;
          devolvida_em?: string | null;
          estado?: string;
          ferramenta_id?: string;
          fim?: string;
          id?: string;
          inicio?: string;
          motivo?: string | null;
          organization_id?: string;
          pessoa_id?: string;
          retirada_em?: string | null;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ferramenta_custodias_organization_id_agenda_evento_id_fkey";
            columns: ["organization_id", "agenda_evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramenta_custodias_organization_id_ferramenta_id_fkey";
            columns: ["organization_id", "ferramenta_id"];
            isOneToOne: false;
            referencedRelation: "ferramentas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramenta_custodias_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ferramentas: {
        Row: {
          condicao: string;
          created_at: string;
          created_by: string;
          descricao: string;
          exige_calibracao: boolean;
          id: string;
          local_id: string;
          organization_id: string;
          patrimonio: string;
          politica_calibracao_id: string | null;
          produto_id: string | null;
          proprietario: string;
          proprietario_nome: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          condicao?: string;
          created_at?: string;
          created_by?: string;
          descricao: string;
          exige_calibracao?: boolean;
          id?: string;
          local_id: string;
          organization_id: string;
          patrimonio: string;
          politica_calibracao_id?: string | null;
          produto_id?: string | null;
          proprietario: string;
          proprietario_nome?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          condicao?: string;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          exige_calibracao?: boolean;
          id?: string;
          local_id?: string;
          organization_id?: string;
          patrimonio?: string;
          politica_calibracao_id?: string | null;
          produto_id?: string | null;
          proprietario?: string;
          proprietario_nome?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ferramentas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ferramentas_organization_id_local_id_fkey";
            columns: ["organization_id", "local_id"];
            isOneToOne: false;
            referencedRelation: "almoxarifados";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramentas_organization_id_politica_calibracao_id_fkey";
            columns: ["organization_id", "politica_calibracao_id"];
            isOneToOne: false;
            referencedRelation: "ferramenta_calibracao_politicas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ferramentas_organization_id_produto_id_fkey";
            columns: ["organization_id", "produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      fornecedores: {
        Row: {
          cnpj: string | null;
          contato: string | null;
          created_at: string;
          id: string;
          nome: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          cnpj?: string | null;
          contato?: string | null;
          created_at?: string;
          id?: string;
          nome: string;
          organization_id: string;
        };
        Update: {
          cnpj?: string | null;
          contato?: string | null;
          created_at?: string;
          id?: string;
          nome?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fornecedores_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      geracao_ordens: {
        Row: {
          autor: string | null;
          chave: string;
          chave_operacao: string | null;
          created_at: string;
          escopo: string | null;
          organization_id: string;
          pedido_hash: string | null;
          resposta: NonNullable<Json>;
          revisao_id: string;
        };
        ComputedFields: never;
        Insert: {
          autor?: string | null;
          chave: string;
          chave_operacao?: string | null;
          created_at?: string;
          escopo?: string | null;
          organization_id: string;
          pedido_hash?: string | null;
          resposta: NonNullable<Json>;
          revisao_id: string;
        };
        Update: {
          autor?: string | null;
          chave?: string;
          chave_operacao?: string | null;
          created_at?: string;
          escopo?: string | null;
          organization_id?: string;
          pedido_hash?: string | null;
          resposta?: NonNullable<Json>;
          revisao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "geracao_ordens_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "geracao_ordens_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      importacao_registros: {
        Row: {
          aba: string;
          arquivo: string;
          chave: string;
          created_at: string;
          dados: NonNullable<Json>;
          explicacao: string | null;
          id: string;
          linha: string | null;
          organization_id: string;
          produto_id: string | null;
          situacao: string;
          tema: string;
        };
        ComputedFields: never;
        Insert: {
          aba: string;
          arquivo: string;
          chave: string;
          created_at?: string;
          dados: NonNullable<Json>;
          explicacao?: string | null;
          id?: string;
          linha?: string | null;
          organization_id: string;
          produto_id?: string | null;
          situacao: string;
          tema: string;
        };
        Update: {
          aba?: string;
          arquivo?: string;
          chave?: string;
          created_at?: string;
          dados?: NonNullable<Json>;
          explicacao?: string | null;
          id?: string;
          linha?: string | null;
          organization_id?: string;
          produto_id?: string | null;
          situacao?: string;
          tema?: string;
        };
        Relationships: [
          {
            foreignKeyName: "importacao_registros_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "importacao_registros_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      indisponibilidades: {
        Row: {
          created_at: string;
          created_by: string;
          fim: string;
          id: string;
          inicio: string;
          motivo_operacional: string;
          organization_id: string;
          pessoa_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          fim: string;
          id?: string;
          inicio: string;
          motivo_operacional: string;
          organization_id: string;
          pessoa_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          fim?: string;
          id?: string;
          inicio?: string;
          motivo_operacional?: string;
          organization_id?: string;
          pessoa_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "indisponibilidades_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      job_execucoes: {
        Row: {
          erro_codigo: string | null;
          estado: string;
          falhas: number;
          finalizado_em: string | null;
          id: string;
          iniciado_em: string;
          job: string;
          processados: number;
        };
        ComputedFields: never;
        Insert: {
          erro_codigo?: string | null;
          estado: string;
          falhas?: number;
          finalizado_em?: string | null;
          id?: string;
          iniciado_em?: string;
          job: string;
          processados?: number;
        };
        Update: {
          erro_codigo?: string | null;
          estado?: string;
          falhas?: number;
          finalizado_em?: string | null;
          id?: string;
          iniciado_em?: string;
          job?: string;
          processados?: number;
        };
        Relationships: [];
      };
      levantamento_adocoes: {
        Row: {
          autor: string;
          campo: string;
          created_at: string;
          id: string;
          levantamento_id: string;
          medicao_id: string;
          organization_id: string;
          origem: NonNullable<Json>;
          preview_hash: string;
          revisao_destino_id: string;
          revisao_id: string;
          sistema_id: string;
          valor_adotado: number;
          valor_anterior: number;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          campo: string;
          created_at?: string;
          id?: string;
          levantamento_id: string;
          medicao_id: string;
          organization_id: string;
          origem: NonNullable<Json>;
          preview_hash: string;
          revisao_destino_id: string;
          revisao_id: string;
          sistema_id: string;
          valor_adotado: number;
          valor_anterior: number;
        };
        Update: {
          autor?: string;
          campo?: string;
          created_at?: string;
          id?: string;
          levantamento_id?: string;
          medicao_id?: string;
          organization_id?: string;
          origem?: NonNullable<Json>;
          preview_hash?: string;
          revisao_destino_id?: string;
          revisao_id?: string;
          sistema_id?: string;
          valor_adotado?: number;
          valor_anterior?: number;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_adocoes_organization_id_levantamento_id_revis_fkey";
            columns: ["organization_id", "levantamento_id", "revisao_id", "medicao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_medicoes";
            referencedColumns: ["organization_id", "levantamento_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "levantamento_adocoes_organization_id_revisao_destino_id_si_fkey";
            columns: ["organization_id", "revisao_destino_id", "sistema_id"];
            isOneToOne: false;
            referencedRelation: "sistemas_dimensionados";
            referencedColumns: ["organization_id", "revisao_id", "id"];
          },
        ];
      };
      levantamento_arquivos: {
        Row: {
          caminho: string;
          confirmado_em: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          id: string;
          levantamento_id: string;
          mime: string;
          motivo: string | null;
          nome: string;
          organization_id: string;
          ponto_id: string | null;
          revisao_id: string;
          sha256: string;
          tamanho: number;
        };
        ComputedFields: never;
        Insert: {
          caminho: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          levantamento_id: string;
          mime: string;
          motivo?: string | null;
          nome: string;
          organization_id: string;
          ponto_id?: string | null;
          revisao_id: string;
          sha256: string;
          tamanho: number;
        };
        Update: {
          caminho?: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          levantamento_id?: string;
          mime?: string;
          motivo?: string | null;
          nome?: string;
          organization_id?: string;
          ponto_id?: string | null;
          revisao_id?: string;
          sha256?: string;
          tamanho?: number;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_arquivos_organization_id_levantamento_id_rev_fkey1";
            columns: ["organization_id", "levantamento_id", "revisao_id", "ponto_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_pontos";
            referencedColumns: ["organization_id", "levantamento_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "levantamento_arquivos_organization_id_levantamento_id_revi_fkey";
            columns: ["organization_id", "levantamento_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
        ];
      };
      levantamento_avaliacoes: {
        Row: {
          autor: string;
          comentario: string;
          created_at: string;
          decisao: string;
          id: number;
          levantamento_id: string;
          organization_id: string;
          pendencias: NonNullable<Json>;
          revisao_id: string;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          comentario?: string;
          created_at?: string;
          decisao: string;
          id?: never;
          levantamento_id: string;
          organization_id: string;
          pendencias?: NonNullable<Json>;
          revisao_id: string;
        };
        Update: {
          autor?: string;
          comentario?: string;
          created_at?: string;
          decisao?: string;
          id?: never;
          levantamento_id?: string;
          organization_id?: string;
          pendencias?: NonNullable<Json>;
          revisao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_avaliacoes_organization_id_levantamento_id_re_fkey";
            columns: ["organization_id", "levantamento_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
        ];
      };
      levantamento_medicoes: {
        Row: {
          base_id: string | null;
          chave: string;
          coletado_em: string | null;
          created_at: string;
          created_by: string;
          grandeza: string;
          id: string;
          levantamento_id: string;
          metodo: string;
          natureza: string;
          observacoes: string;
          organization_id: string;
          origem: string;
          ponto_id: string;
          precisao: number | null;
          revisao_id: string;
          unidade: string;
          updated_at: string;
          valor: number | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          base_id?: string | null;
          chave: string;
          coletado_em?: string | null;
          created_at?: string;
          created_by?: string;
          grandeza: string;
          id?: string;
          levantamento_id: string;
          metodo?: string;
          natureza?: string;
          observacoes?: string;
          organization_id: string;
          origem?: string;
          ponto_id: string;
          precisao?: number | null;
          revisao_id: string;
          unidade?: string;
          updated_at?: string;
          valor?: number | null;
          version?: number;
        };
        Update: {
          base_id?: string | null;
          chave?: string;
          coletado_em?: string | null;
          created_at?: string;
          created_by?: string;
          grandeza?: string;
          id?: string;
          levantamento_id?: string;
          metodo?: string;
          natureza?: string;
          observacoes?: string;
          organization_id?: string;
          origem?: string;
          ponto_id?: string;
          precisao?: number | null;
          revisao_id?: string;
          unidade?: string;
          updated_at?: string;
          valor?: number | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_medicoes_organization_id_base_id_fkey";
            columns: ["organization_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_medicoes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "levantamento_medicoes_organization_id_levantamento_id_revi_fkey";
            columns: ["organization_id", "levantamento_id", "revisao_id", "ponto_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_pontos";
            referencedColumns: ["organization_id", "levantamento_id", "revisao_id", "id"];
          },
        ];
      };
      levantamento_modelo_versoes: {
        Row: {
          created_at: string;
          created_by: string;
          fonte: string;
          id: string;
          modelo_id: string;
          numero: number;
          organization_id: string;
          requisitos: NonNullable<Json>;
          responsavel_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          fonte: string;
          id?: string;
          modelo_id: string;
          numero: number;
          organization_id: string;
          requisitos: NonNullable<Json>;
          responsavel_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          fonte?: string;
          id?: string;
          modelo_id?: string;
          numero?: number;
          organization_id?: string;
          requisitos?: NonNullable<Json>;
          responsavel_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_modelo_versoes_organization_id_modelo_id_fkey";
            columns: ["organization_id", "modelo_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_modelos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "levantamento_modelo_versoes_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      levantamento_modelos: {
        Row: {
          created_at: string;
          created_by: string;
          descricao: string;
          id: string;
          nome: string;
          organization_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome: string;
          organization_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          nome?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_modelos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      levantamento_pontos: {
        Row: {
          area: string;
          base_id: string | null;
          codigo: string;
          created_at: string;
          created_by: string;
          exige_foto: boolean;
          id: string;
          levantamento_id: string;
          localizacao: string;
          nome: string;
          observacoes: string;
          organization_id: string;
          revisao_id: string;
          tipo_sistema: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          area?: string;
          base_id?: string | null;
          codigo: string;
          created_at?: string;
          created_by?: string;
          exige_foto?: boolean;
          id?: string;
          levantamento_id: string;
          localizacao?: string;
          nome: string;
          observacoes?: string;
          organization_id: string;
          revisao_id: string;
          tipo_sistema?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          area?: string;
          base_id?: string | null;
          codigo?: string;
          created_at?: string;
          created_by?: string;
          exige_foto?: boolean;
          id?: string;
          levantamento_id?: string;
          localizacao?: string;
          nome?: string;
          observacoes?: string;
          organization_id?: string;
          revisao_id?: string;
          tipo_sistema?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_pontos_organization_id_base_id_fkey";
            columns: ["organization_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_pontos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "levantamento_pontos_organization_id_levantamento_id_revisa_fkey";
            columns: ["organization_id", "levantamento_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
        ];
      };
      levantamento_revisoes: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          base_id: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          fim_previsto: string | null;
          id: string;
          inicio_previsto: string | null;
          levantamento_id: string;
          modelo_versao_id: string | null;
          numero: number;
          organization_id: string;
          snapshot: Json | null;
          snapshot_sha256: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          base_id?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          fim_previsto?: string | null;
          id?: string;
          inicio_previsto?: string | null;
          levantamento_id: string;
          modelo_versao_id?: string | null;
          numero: number;
          organization_id: string;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          base_id?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          fim_previsto?: string | null;
          id?: string;
          inicio_previsto?: string | null;
          levantamento_id?: string;
          modelo_versao_id?: string | null;
          numero?: number;
          organization_id?: string;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "levantamento_revisoes_organization_id_levantamento_id_base_fkey";
            columns: ["organization_id", "levantamento_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
          {
            foreignKeyName: "levantamento_revisoes_organization_id_levantamento_id_fkey";
            columns: ["organization_id", "levantamento_id"];
            isOneToOne: false;
            referencedRelation: "levantamentos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "levantamento_revisoes_organization_id_modelo_versao_id_fkey";
            columns: ["organization_id", "modelo_versao_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_modelo_versoes";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      levantamentos: {
        Row: {
          aprovada_id: string | null;
          cliente_id: string;
          codigo: string;
          created_at: string;
          created_by: string;
          finalidade: string;
          id: string;
          organization_id: string;
          projeto_id: string | null;
          proposta_id: string | null;
          responsavel_id: string;
          revisao_atual_id: string | null;
          unidade_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          aprovada_id?: string | null;
          cliente_id: string;
          codigo: string;
          created_at?: string;
          created_by?: string;
          finalidade: string;
          id?: string;
          organization_id: string;
          projeto_id?: string | null;
          proposta_id?: string | null;
          responsavel_id: string;
          revisao_atual_id?: string | null;
          unidade_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aprovada_id?: string | null;
          cliente_id?: string;
          codigo?: string;
          created_at?: string;
          created_by?: string;
          finalidade?: string;
          id?: string;
          organization_id?: string;
          projeto_id?: string | null;
          proposta_id?: string | null;
          responsavel_id?: string;
          revisao_atual_id?: string | null;
          unidade_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lev_aprovada_fk";
            columns: ["organization_id", "id", "aprovada_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
          {
            foreignKeyName: "lev_atual_fk";
            columns: ["organization_id", "id", "revisao_atual_id"];
            isOneToOne: false;
            referencedRelation: "levantamento_revisoes";
            referencedColumns: ["organization_id", "levantamento_id", "id"];
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_projeto_id_fkey";
            columns: ["organization_id", "cliente_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_proposta_id_fkey";
            columns: ["organization_id", "cliente_id", "proposta_id"];
            isOneToOne: false;
            referencedRelation: "propostas";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_unidade_id_fkey";
            columns: ["organization_id", "cliente_id", "unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["organization_id", "cliente_id", "id"];
          },
          {
            foreignKeyName: "levantamentos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "levantamentos_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          email: string | null;
          id: string;
          nome: string | null;
          organization_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          id?: string;
          nome?: string | null;
          organization_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          id?: string;
          nome?: string | null;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notificacoes: {
        Row: {
          agenda_evento_id: string;
          created_at: string;
          destinatario_id: string;
          entidade_version: number;
          id: string;
          lida_em: string | null;
          organization_id: string;
          tipo: string;
        };
        ComputedFields: never;
        Insert: {
          agenda_evento_id: string;
          created_at?: string;
          destinatario_id: string;
          entidade_version: number;
          id?: string;
          lida_em?: string | null;
          organization_id: string;
          tipo: string;
        };
        Update: {
          agenda_evento_id?: string;
          created_at?: string;
          destinatario_id?: string;
          entidade_version?: number;
          id?: string;
          lida_em?: string | null;
          organization_id?: string;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notificacoes_organization_id_agenda_evento_id_fkey";
            columns: ["organization_id", "agenda_evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      numeracao: {
        Row: {
          ano: number;
          organization_id: string;
          prefixo: string;
          proximo: number;
        };
        ComputedFields: never;
        Insert: {
          ano: number;
          organization_id: string;
          prefixo: string;
          proximo?: number;
        };
        Update: {
          ano?: number;
          organization_id?: string;
          prefixo?: string;
          proximo?: number;
        };
        Relationships: [
          {
            foreignKeyName: "numeracao_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      operacao_historico: {
        Row: {
          autor: string;
          created_at: string;
          entidade: string;
          entidade_id: string;
          estado_anterior: string | null;
          estado_atual: string | null;
          id: number;
          motivo: string | null;
          operacao: string;
          organization_id: string;
          versao: number | null;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          created_at?: string;
          entidade: string;
          entidade_id: string;
          estado_anterior?: string | null;
          estado_atual?: string | null;
          id?: never;
          motivo?: string | null;
          operacao: string;
          organization_id: string;
          versao?: number | null;
        };
        Update: {
          autor?: string;
          created_at?: string;
          entidade?: string;
          entidade_id?: string;
          estado_anterior?: string | null;
          estado_atual?: string | null;
          id?: never;
          motivo?: string | null;
          operacao?: string;
          organization_id?: string;
          versao?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "operacao_historico_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      operacoes_idempotentes: {
        Row: {
          autor: string;
          chave: string;
          comando: string;
          created_at: string;
          organization_id: string;
          request_hash: string;
          resultado: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          autor: string;
          chave: string;
          comando: string;
          created_at?: string;
          organization_id: string;
          request_hash: string;
          resultado: NonNullable<Json>;
        };
        Update: {
          autor?: string;
          chave?: string;
          comando?: string;
          created_at?: string;
          organization_id?: string;
          request_hash?: string;
          resultado?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "operacoes_idempotentes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ordem_compra_itens: {
        Row: {
          demanda_id: string;
          id: string;
          ordem_id: string;
          organization_id: string;
          preco_unitario: number;
          quantidade: number;
          quantidade_cancelada: number;
          quantidade_recebida: number;
        };
        ComputedFields: never;
        Insert: {
          demanda_id: string;
          id?: string;
          ordem_id: string;
          organization_id: string;
          preco_unitario?: number;
          quantidade: number;
          quantidade_cancelada?: number;
          quantidade_recebida?: number;
        };
        Update: {
          demanda_id?: string;
          id?: string;
          ordem_id?: string;
          organization_id?: string;
          preco_unitario?: number;
          quantidade?: number;
          quantidade_cancelada?: number;
          quantidade_recebida?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordem_compra_itens_demanda_id_fkey";
            columns: ["demanda_id"];
            isOneToOne: false;
            referencedRelation: "demandas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordem_compra_itens_ordem_id_fkey";
            columns: ["organization_id", "ordem_id"];
            isOneToOne: false;
            referencedRelation: "ordens_compra";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ordem_compra_itens_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ordem_producao_itens: {
        Row: {
          demanda_id: string;
          ficha_tecnica: string | null;
          id: string;
          ordem_id: string;
          organization_id: string;
          quantidade: number;
          quantidade_produzida: number;
        };
        ComputedFields: never;
        Insert: {
          demanda_id: string;
          ficha_tecnica?: string | null;
          id?: string;
          ordem_id: string;
          organization_id: string;
          quantidade: number;
          quantidade_produzida?: number;
        };
        Update: {
          demanda_id?: string;
          ficha_tecnica?: string | null;
          id?: string;
          ordem_id?: string;
          organization_id?: string;
          quantidade?: number;
          quantidade_produzida?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordem_producao_itens_demanda_id_fkey";
            columns: ["demanda_id"];
            isOneToOne: false;
            referencedRelation: "demandas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordem_producao_itens_ordem_id_fkey";
            columns: ["organization_id", "ordem_id"];
            isOneToOne: false;
            referencedRelation: "ordens_producao";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ordem_producao_itens_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ordens_compra: {
        Row: {
          condicoes: string | null;
          created_at: string;
          emitida_em: string | null;
          entrega_prevista: string | null;
          fornecedor_id: string;
          frete: number;
          hash_tecnico: string | null;
          id: string;
          numero: string;
          organization_id: string;
          projeto_id: string | null;
          revisao_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          condicoes?: string | null;
          created_at?: string;
          emitida_em?: string | null;
          entrega_prevista?: string | null;
          fornecedor_id: string;
          frete?: number;
          hash_tecnico?: string | null;
          id?: string;
          numero: string;
          organization_id: string;
          projeto_id?: string | null;
          revisao_id: string;
          status?: string;
        };
        Update: {
          condicoes?: string | null;
          created_at?: string;
          emitida_em?: string | null;
          entrega_prevista?: string | null;
          fornecedor_id?: string;
          frete?: number;
          hash_tecnico?: string | null;
          id?: string;
          numero?: string;
          organization_id?: string;
          projeto_id?: string | null;
          revisao_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey";
            columns: ["organization_id", "fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "ordens_compra_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_projeto_id_fkey";
            columns: ["organization_id", "revisao_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["organization_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "ordens_compra_revisao_id_fkey";
            columns: ["organization_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      ordens_producao: {
        Row: {
          created_at: string;
          hash_tecnico: string | null;
          id: string;
          liberada_em: string | null;
          numero: string;
          organization_id: string;
          prazo: string | null;
          projeto_id: string | null;
          responsavel: string | null;
          revisao_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          hash_tecnico?: string | null;
          id?: string;
          liberada_em?: string | null;
          numero: string;
          organization_id: string;
          prazo?: string | null;
          projeto_id?: string | null;
          responsavel?: string | null;
          revisao_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          hash_tecnico?: string | null;
          id?: string;
          liberada_em?: string | null;
          numero?: string;
          organization_id?: string;
          prazo?: string | null;
          projeto_id?: string | null;
          responsavel?: string | null;
          revisao_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_producao_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_producao_projeto_id_fkey";
            columns: ["organization_id", "revisao_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["organization_id", "revisao_id", "id"];
          },
          {
            foreignKeyName: "ordens_producao_revisao_id_fkey";
            columns: ["organization_id", "revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          nome: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          nome: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          nome?: string;
        };
        Relationships: [];
      };
      outbox_eventos: {
        Row: {
          agenda_evento_id: string;
          concluido_em: string | null;
          created_at: string;
          disponivel_em: string;
          entidade_version: number;
          erro_codigo: string | null;
          estado: string;
          id: number;
          organization_id: string;
          tentativas: number;
          tipo: string;
        };
        ComputedFields: never;
        Insert: {
          agenda_evento_id: string;
          concluido_em?: string | null;
          created_at?: string;
          disponivel_em?: string;
          entidade_version: number;
          erro_codigo?: string | null;
          estado?: string;
          id?: never;
          organization_id: string;
          tentativas?: number;
          tipo: string;
        };
        Update: {
          agenda_evento_id?: string;
          concluido_em?: string | null;
          created_at?: string;
          disponivel_em?: string;
          entidade_version?: number;
          erro_codigo?: string | null;
          estado?: string;
          id?: never;
          organization_id?: string;
          tentativas?: number;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outbox_eventos_organization_id_agenda_evento_id_fkey";
            columns: ["organization_id", "agenda_evento_id"];
            isOneToOne: false;
            referencedRelation: "agenda_eventos";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      pe_arquivos: {
        Row: {
          caminho: string;
          confirmado_em: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          id: string;
          mime: string;
          nome: string;
          organization_id: string;
          projeto_id: string;
          sha256: string;
          tamanho: number;
          versao_id: string;
        };
        ComputedFields: never;
        Insert: {
          caminho: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          mime: string;
          nome: string;
          organization_id: string;
          projeto_id: string;
          sha256: string;
          tamanho: number;
          versao_id: string;
        };
        Update: {
          caminho?: string;
          confirmado_em?: string | null;
          created_at?: string;
          created_by?: string;
          estado?: string;
          id?: string;
          mime?: string;
          nome?: string;
          organization_id?: string;
          projeto_id?: string;
          sha256?: string;
          tamanho?: number;
          versao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pe_arquivos_organization_id_projeto_id_versao_id_fkey";
            columns: ["organization_id", "projeto_id", "versao_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      pe_cenarios: {
        Row: {
          base_id: string;
          created_at: string;
          created_by: string;
          descartado: boolean;
          id: string;
          modelo: NonNullable<Json>;
          organization_id: string;
          projeto_id: string;
          promovida_id: string | null;
          titulo: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          base_id: string;
          created_at?: string;
          created_by?: string;
          descartado?: boolean;
          id?: string;
          modelo: NonNullable<Json>;
          organization_id: string;
          projeto_id: string;
          promovida_id?: string | null;
          titulo: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          base_id?: string;
          created_at?: string;
          created_by?: string;
          descartado?: boolean;
          id?: string;
          modelo?: NonNullable<Json>;
          organization_id?: string;
          projeto_id?: string;
          promovida_id?: string | null;
          titulo?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pe_cenarios_organization_id_projeto_id_base_id_fkey";
            columns: ["organization_id", "projeto_id", "base_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
          {
            foreignKeyName: "pe_cenarios_organization_id_projeto_id_promovida_id_fkey";
            columns: ["organization_id", "projeto_id", "promovida_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      pe_eventos: {
        Row: {
          autor: string;
          cenario_id: string | null;
          comando: string;
          created_at: string;
          id: number;
          motivo: string | null;
          organization_id: string;
          projeto_id: string;
          versao_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          autor?: string;
          cenario_id?: string | null;
          comando: string;
          created_at?: string;
          id?: never;
          motivo?: string | null;
          organization_id: string;
          projeto_id: string;
          versao_id?: string | null;
        };
        Update: {
          autor?: string;
          cenario_id?: string | null;
          comando?: string;
          created_at?: string;
          id?: never;
          motivo?: string | null;
          organization_id?: string;
          projeto_id?: string;
          versao_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_cenario_id_fkey";
            columns: ["organization_id", "projeto_id", "cenario_id"];
            isOneToOne: false;
            referencedRelation: "pe_cenarios";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_fkey";
            columns: ["organization_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "pe_projetos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_versao_id_fkey";
            columns: ["organization_id", "projeto_id", "versao_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      pe_projetos: {
        Row: {
          arquivado: boolean;
          cliente_id: string;
          created_at: string;
          created_by: string;
          descricao: string;
          id: string;
          local_descritivo: string;
          organization_id: string;
          responsavel_id: string;
          titulo: string;
          unidade_id: string | null;
          updated_at: string;
          version: number;
          vigente_id: string | null;
          visibilidade: string;
        };
        ComputedFields: never;
        Insert: {
          arquivado?: boolean;
          cliente_id: string;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          local_descritivo?: string;
          organization_id: string;
          responsavel_id: string;
          titulo: string;
          unidade_id?: string | null;
          updated_at?: string;
          version?: number;
          vigente_id?: string | null;
          visibilidade?: string;
        };
        Update: {
          arquivado?: boolean;
          cliente_id?: string;
          created_at?: string;
          created_by?: string;
          descricao?: string;
          id?: string;
          local_descritivo?: string;
          organization_id?: string;
          responsavel_id?: string;
          titulo?: string;
          unidade_id?: string | null;
          updated_at?: string;
          version?: number;
          vigente_id?: string | null;
          visibilidade?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pe_projetos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pe_projetos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pe_projetos_organization_id_responsavel_id_fkey";
            columns: ["organization_id", "responsavel_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "pe_projetos_unidade_id_fkey";
            columns: ["unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pe_vigente_mesmo_projeto";
            columns: ["organization_id", "id", "vigente_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      pe_versoes: {
        Row: {
          autor_declarado: string;
          congelado_em: string | null;
          congelado_por: string | null;
          created_at: string;
          created_by: string;
          elaborado_em: string | null;
          estado: string;
          id: string;
          modelo: NonNullable<Json>;
          numero: number;
          organization_id: string;
          parent_id: string | null;
          projeto_id: string;
          resumo: string;
          revisao_declarada: string;
          snapshot: Json | null;
          snapshot_sha256: string | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          autor_declarado?: string;
          congelado_em?: string | null;
          congelado_por?: string | null;
          created_at?: string;
          created_by?: string;
          elaborado_em?: string | null;
          estado?: string;
          id?: string;
          modelo: NonNullable<Json>;
          numero: number;
          organization_id: string;
          parent_id?: string | null;
          projeto_id: string;
          resumo: string;
          revisao_declarada?: string;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          autor_declarado?: string;
          congelado_em?: string | null;
          congelado_por?: string | null;
          created_at?: string;
          created_by?: string;
          elaborado_em?: string | null;
          estado?: string;
          id?: string;
          modelo?: NonNullable<Json>;
          numero?: number;
          organization_id?: string;
          parent_id?: string | null;
          projeto_id?: string;
          resumo?: string;
          revisao_declarada?: string;
          snapshot?: Json | null;
          snapshot_sha256?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pe_versoes_organization_id_projeto_id_fkey";
            columns: ["organization_id", "projeto_id"];
            isOneToOne: false;
            referencedRelation: "pe_projetos";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "pe_versoes_organization_id_projeto_id_parent_id_fkey";
            columns: ["organization_id", "projeto_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "pe_versoes";
            referencedColumns: ["organization_id", "projeto_id", "id"];
          },
        ];
      };
      pessoa_qualificacoes: {
        Row: {
          competencia_id: string;
          conclusao: string;
          conferido_em: string | null;
          conferido_por: string | null;
          created_at: string;
          created_by: string;
          emissor: string;
          estado: string;
          id: string;
          motivo: string | null;
          organization_id: string;
          pessoa_id: string;
          updated_at: string;
          validade: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          competencia_id: string;
          conclusao: string;
          conferido_em?: string | null;
          conferido_por?: string | null;
          created_at?: string;
          created_by?: string;
          emissor: string;
          estado?: string;
          id?: string;
          motivo?: string | null;
          organization_id: string;
          pessoa_id: string;
          updated_at?: string;
          validade?: string | null;
          version?: number;
        };
        Update: {
          competencia_id?: string;
          conclusao?: string;
          conferido_em?: string | null;
          conferido_por?: string | null;
          created_at?: string;
          created_by?: string;
          emissor?: string;
          estado?: string;
          id?: string;
          motivo?: string | null;
          organization_id?: string;
          pessoa_id?: string;
          updated_at?: string;
          validade?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pessoa_qualificacoes_organization_id_competencia_id_fkey";
            columns: ["organization_id", "competencia_id"];
            isOneToOne: false;
            referencedRelation: "competencias";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "pessoa_qualificacoes_organization_id_pessoa_id_fkey";
            columns: ["organization_id", "pessoa_id"];
            isOneToOne: false;
            referencedRelation: "pessoas";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      pessoas: {
        Row: {
          ativa: boolean;
          created_at: string;
          created_by: string;
          email_profissional: string | null;
          funcao: string | null;
          id: string;
          nome: string;
          organization_id: string;
          registro_profissional: string | null;
          telefone_profissional: string | null;
          updated_at: string;
          user_id: string | null;
          version: number;
          vinculo: string;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          email_profissional?: string | null;
          funcao?: string | null;
          id?: string;
          nome: string;
          organization_id: string;
          registro_profissional?: string | null;
          telefone_profissional?: string | null;
          updated_at?: string;
          user_id?: string | null;
          version?: number;
          vinculo: string;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string;
          email_profissional?: string | null;
          funcao?: string | null;
          id?: string;
          nome?: string;
          organization_id?: string;
          registro_profissional?: string | null;
          telefone_profissional?: string | null;
          updated_at?: string;
          user_id?: string | null;
          version?: number;
          vinculo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pessoas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pessoas_organization_id_user_id_fkey";
            columns: ["organization_id", "user_id"];
            isOneToOne: true;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "user_id"];
          },
        ];
      };
      politicas_custo: {
        Row: {
          created_at: string;
          descricao: string;
          divergencias: NonNullable<Json>;
          id: string;
          organization_id: string;
          parcelas_no_custo: string[];
          situacao: string;
          versao: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          descricao: string;
          divergencias?: NonNullable<Json>;
          id?: string;
          organization_id: string;
          parcelas_no_custo: string[];
          situacao?: string;
          versao: string;
        };
        Update: {
          created_at?: string;
          descricao?: string;
          divergencias?: NonNullable<Json>;
          id?: string;
          organization_id?: string;
          parcelas_no_custo?: string[];
          situacao?: string;
          versao?: string;
        };
        Relationships: [
          {
            foreignKeyName: "politicas_custo_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_conversoes: {
        Row: {
          confirmado_por: string | null;
          created_at: string;
          fator: number;
          id: string;
          organization_id: string;
          produto_id: string;
          unidade_compra: string;
        };
        ComputedFields: never;
        Insert: {
          confirmado_por?: string | null;
          created_at?: string;
          fator: number;
          id?: string;
          organization_id: string;
          produto_id: string;
          unidade_compra: string;
        };
        Update: {
          confirmado_por?: string | null;
          created_at?: string;
          fator?: number;
          id?: string;
          organization_id?: string;
          produto_id?: string;
          unidade_compra?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produto_conversoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_conversoes_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_custos: {
        Row: {
          created_at: string;
          created_by: string | null;
          custo: number;
          fornecedor_id: string | null;
          id: string;
          inclui: string[];
          organization_id: string;
          origem: string | null;
          produto_id: string;
          vigencia: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          custo: number;
          fornecedor_id?: string | null;
          id?: string;
          inclui?: string[];
          organization_id: string;
          origem?: string | null;
          produto_id: string;
          vigencia?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          custo?: number;
          fornecedor_id?: string | null;
          id?: string;
          inclui?: string[];
          organization_id?: string;
          origem?: string | null;
          produto_id?: string;
          vigencia?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produto_custos_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_custos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_custos_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_estrutura: {
        Row: {
          created_at: string;
          filho_id: string;
          id: string;
          ordem: number;
          organization_id: string;
          pai_id: string;
          quantidade: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          filho_id: string;
          id?: string;
          ordem?: number;
          organization_id: string;
          pai_id: string;
          quantidade: number;
        };
        Update: {
          created_at?: string;
          filho_id?: string;
          id?: string;
          ordem?: number;
          organization_id?: string;
          pai_id?: string;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produto_estrutura_filho_id_fkey";
            columns: ["filho_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_estrutura_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_estrutura_pai_id_fkey";
            columns: ["pai_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produto_referencias: {
        Row: {
          codigo_fornecedor: string;
          created_at: string;
          descricao_original: string | null;
          fornecedor_id: string;
          id: string;
          organization_id: string;
          produto_id: string;
        };
        ComputedFields: never;
        Insert: {
          codigo_fornecedor: string;
          created_at?: string;
          descricao_original?: string | null;
          fornecedor_id: string;
          id?: string;
          organization_id: string;
          produto_id: string;
        };
        Update: {
          codigo_fornecedor?: string;
          created_at?: string;
          descricao_original?: string | null;
          fornecedor_id?: string;
          id?: string;
          organization_id?: string;
          produto_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produto_referencias_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_referencias_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produto_referencias_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      produtos: {
        Row: {
          acabamento: string | null;
          ativo: boolean;
          base_custo: string;
          chave_cadastro: string | null;
          codigo: string;
          codigo_legado: string | null;
          composicao_status: string;
          created_at: string;
          descricao: string;
          descricao_original: string | null;
          dimensoes: string | null;
          fabricante_id: string | null;
          familia: string | null;
          familia_tecnica: string | null;
          fornecedor_padrao_id: string | null;
          id: string;
          indivisivel: boolean;
          material: string | null;
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra: number;
          ncm: string | null;
          organization_id: string;
          origem: string | null;
          sequencia: number | null;
          tipo_item: string | null;
          unidade: string;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          acabamento?: string | null;
          ativo?: boolean;
          base_custo?: string;
          chave_cadastro?: string | null;
          codigo: string;
          codigo_legado?: string | null;
          composicao_status?: string;
          created_at?: string;
          descricao: string;
          descricao_original?: string | null;
          dimensoes?: string | null;
          fabricante_id?: string | null;
          familia?: string | null;
          familia_tecnica?: string | null;
          fornecedor_padrao_id?: string | null;
          id?: string;
          indivisivel?: boolean;
          material?: string | null;
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra?: number;
          ncm?: string | null;
          organization_id: string;
          origem?: string | null;
          sequencia?: number | null;
          tipo_item?: string | null;
          unidade: string;
          versao?: number;
        };
        Update: {
          acabamento?: string | null;
          ativo?: boolean;
          base_custo?: string;
          chave_cadastro?: string | null;
          codigo?: string;
          codigo_legado?: string | null;
          composicao_status?: string;
          created_at?: string;
          descricao?: string;
          descricao_original?: string | null;
          dimensoes?: string | null;
          fabricante_id?: string | null;
          familia?: string | null;
          familia_tecnica?: string | null;
          fornecedor_padrao_id?: string | null;
          id?: string;
          indivisivel?: boolean;
          material?: string | null;
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra?: number;
          ncm?: string | null;
          organization_id?: string;
          origem?: string | null;
          sequencia?: number | null;
          tipo_item?: string | null;
          unidade?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "produtos_fabricante_id_fkey";
            columns: ["fabricante_id"];
            isOneToOne: false;
            referencedRelation: "fabricantes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produtos_familia_fkey";
            columns: ["familia"];
            isOneToOne: false;
            referencedRelation: "familias_codigo";
            referencedColumns: ["sigla"];
          },
          {
            foreignKeyName: "produtos_familia_tecnica_fkey";
            columns: ["familia_tecnica"];
            isOneToOne: false;
            referencedRelation: "familias_codigo";
            referencedColumns: ["sigla"];
          },
          {
            foreignKeyName: "produtos_fornecedor_padrao_id_fkey";
            columns: ["fornecedor_padrao_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "produtos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      projetos: {
        Row: {
          cliente_id: string;
          codigo: string;
          created_at: string;
          created_by: string | null;
          id: string;
          organization_id: string;
          proposta_id: string;
          revisao_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          cliente_id: string;
          codigo: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id: string;
          proposta_id: string;
          revisao_id: string;
          status?: string;
        };
        Update: {
          cliente_id?: string;
          codigo?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          organization_id?: string;
          proposta_id?: string;
          revisao_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projetos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projetos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projetos_proposta_id_fkey";
            columns: ["proposta_id"];
            isOneToOne: false;
            referencedRelation: "propostas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projetos_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: true;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      proposta_checkpoints: {
        Row: {
          atualizado_em: string;
          organization_id: string;
          revisao_id: string;
          snapshot: NonNullable<Json>;
          total_salvo: number | null;
          versao: number;
          versao_salva: number;
        };
        ComputedFields: never;
        Insert: {
          atualizado_em?: string;
          organization_id: string;
          revisao_id: string;
          snapshot: NonNullable<Json>;
          total_salvo?: number | null;
          versao?: number;
          versao_salva?: number;
        };
        Update: {
          atualizado_em?: string;
          organization_id?: string;
          revisao_id?: string;
          snapshot?: NonNullable<Json>;
          total_salvo?: number | null;
          versao?: number;
          versao_salva?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proposta_checkpoints_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_checkpoints_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: true;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      proposta_operacoes: {
        Row: {
          autor: string;
          created_at: string;
          id: string;
          resposta: NonNullable<Json>;
          revisao_id: string;
        };
        ComputedFields: never;
        Insert: {
          autor: string;
          created_at?: string;
          id: string;
          resposta: NonNullable<Json>;
          revisao_id: string;
        };
        Update: {
          autor?: string;
          created_at?: string;
          id?: string;
          resposta?: NonNullable<Json>;
          revisao_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "proposta_operacoes_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      proposta_rascunho_autores: {
        Row: {
          autor: string | null;
          autor_nome: string | null;
          campo: string;
          created_at: string;
          id: number;
          objeto: string;
          revisao_id: string;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          autor?: string | null;
          autor_nome?: string | null;
          campo: string;
          created_at?: string;
          id?: never;
          objeto: string;
          revisao_id: string;
          versao: number;
        };
        Update: {
          autor?: string | null;
          autor_nome?: string | null;
          campo?: string;
          created_at?: string;
          id?: never;
          objeto?: string;
          revisao_id?: string;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proposta_rascunho_autores_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      proposta_revisoes: {
        Row: {
          aceita_em: string | null;
          calculado_em: string | null;
          created_at: string;
          created_by: string | null;
          desatualizada: boolean;
          enviada_em: string | null;
          id: string;
          numero: number;
          organization_id: string;
          parametros: NonNullable<Json>;
          proposta_id: string;
          regras_id: string | null;
          regras_snapshot: Json | null;
          status: Database["public"]["Enums"]["status_revisao"];
          textos: NonNullable<Json>;
          totais: Json | null;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          aceita_em?: string | null;
          calculado_em?: string | null;
          created_at?: string;
          created_by?: string | null;
          desatualizada?: boolean;
          enviada_em?: string | null;
          id?: string;
          numero: number;
          organization_id: string;
          parametros?: NonNullable<Json>;
          proposta_id: string;
          regras_id?: string | null;
          regras_snapshot?: Json | null;
          status?: Database["public"]["Enums"]["status_revisao"];
          textos?: NonNullable<Json>;
          totais?: Json | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          aceita_em?: string | null;
          calculado_em?: string | null;
          created_at?: string;
          created_by?: string | null;
          desatualizada?: boolean;
          enviada_em?: string | null;
          id?: string;
          numero?: number;
          organization_id?: string;
          parametros?: NonNullable<Json>;
          proposta_id?: string;
          regras_id?: string | null;
          regras_snapshot?: Json | null;
          status?: Database["public"]["Enums"]["status_revisao"];
          textos?: NonNullable<Json>;
          totais?: Json | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proposta_revisoes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_revisoes_proposta_id_fkey";
            columns: ["proposta_id"];
            isOneToOne: false;
            referencedRelation: "propostas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_revisoes_regras_id_fkey";
            columns: ["regras_id"];
            isOneToOne: false;
            referencedRelation: "regras_versionadas";
            referencedColumns: ["id"];
          },
        ];
      };
      proposta_salvamentos: {
        Row: {
          autor: string;
          autor_nome: string;
          calculo_id: string | null;
          campos: number;
          created_at: string;
          diferencas: NonNullable<Json>;
          id: string;
          impacto: Json | null;
          objetos: number;
          organization_id: string;
          proposta_id: string;
          revisao_id: string;
          versao_destino: number;
          versao_origem: number;
        };
        ComputedFields: never;
        Insert: {
          autor: string;
          autor_nome: string;
          calculo_id?: string | null;
          campos: number;
          created_at?: string;
          diferencas: NonNullable<Json>;
          id: string;
          impacto?: Json | null;
          objetos: number;
          organization_id: string;
          proposta_id: string;
          revisao_id: string;
          versao_destino: number;
          versao_origem: number;
        };
        Update: {
          autor?: string;
          autor_nome?: string;
          calculo_id?: string | null;
          campos?: number;
          created_at?: string;
          diferencas?: NonNullable<Json>;
          id?: string;
          impacto?: Json | null;
          objetos?: number;
          organization_id?: string;
          proposta_id?: string;
          revisao_id?: string;
          versao_destino?: number;
          versao_origem?: number;
        };
        Relationships: [
          {
            foreignKeyName: "proposta_salvamentos_calculo_id_fkey";
            columns: ["calculo_id"];
            isOneToOne: false;
            referencedRelation: "calculo_execucoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_salvamentos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_salvamentos_proposta_id_fkey";
            columns: ["proposta_id"];
            isOneToOne: false;
            referencedRelation: "propostas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "proposta_salvamentos_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      propostas: {
        Row: {
          cliente_id: string;
          contato_id: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          numero: string;
          organization_id: string;
          projeto_id: string | null;
          revisao_corrente_id: string | null;
          titulo: string | null;
          unidade_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          cliente_id: string;
          contato_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          numero: string;
          organization_id: string;
          projeto_id?: string | null;
          revisao_corrente_id?: string | null;
          titulo?: string | null;
          unidade_id?: string | null;
        };
        Update: {
          cliente_id?: string;
          contato_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          numero?: string;
          organization_id?: string;
          projeto_id?: string | null;
          revisao_corrente_id?: string | null;
          titulo?: string | null;
          unidade_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "propostas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propostas_contato_id_fkey";
            columns: ["contato_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propostas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propostas_proj_fk";
            columns: ["projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propostas_rev_fk";
            columns: ["revisao_corrente_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "propostas_unidade_id_fkey";
            columns: ["unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades";
            referencedColumns: ["id"];
          },
        ];
      };
      recebimentos: {
        Row: {
          chave: string | null;
          created_at: string;
          created_by: string | null;
          estorno_de: string | null;
          id: string;
          item_id: string;
          organization_id: string;
          quantidade: number;
          recebido_em: string;
          sinal: number;
        };
        ComputedFields: never;
        Insert: {
          chave?: string | null;
          created_at?: string;
          created_by?: string | null;
          estorno_de?: string | null;
          id?: string;
          item_id: string;
          organization_id: string;
          quantidade: number;
          recebido_em?: string;
          sinal?: number;
        };
        Update: {
          chave?: string | null;
          created_at?: string;
          created_by?: string | null;
          estorno_de?: string | null;
          id?: string;
          item_id?: string;
          organization_id?: string;
          quantidade?: number;
          recebido_em?: string;
          sinal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recebimentos_estorno_de_fkey";
            columns: ["estorno_de"];
            isOneToOne: false;
            referencedRelation: "recebimentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recebimentos_item_id_fkey";
            columns: ["organization_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "ordem_compra_itens";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "recebimentos_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      regras_versionadas: {
        Row: {
          ativa: boolean;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          id: string;
          organization_id: string;
          origem: string | null;
          regras: NonNullable<Json>;
          versao: number;
        };
        ComputedFields: never;
        Insert: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          organization_id: string;
          origem?: string | null;
          regras: NonNullable<Json>;
          versao: number;
        };
        Update: {
          ativa?: boolean;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          organization_id?: string;
          origem?: string | null;
          regras?: NonNullable<Json>;
          versao?: number;
        };
        Relationships: [
          {
            foreignKeyName: "regras_versionadas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      revisao_componentes: {
        Row: {
          codigo: string;
          custo_adotado: number;
          custo_atualizado_em: string | null;
          custo_base: string | null;
          custo_fonte: Json | null;
          custo_inclui: string[];
          custo_origem_id: string | null;
          descricao: string;
          estrutura: Json | null;
          estrutura_origem: Json | null;
          fabricante: string | null;
          fornecedor_id: string | null;
          id: string;
          incluido_orcamento: boolean;
          indivisivel: boolean;
          justificativa: string | null;
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra: number;
          ncm: string | null;
          organization_id: string;
          produto_id: string;
          quantidade_avulsa: number;
          revisao_id: string;
          unidade: string;
        };
        ComputedFields: never;
        Insert: {
          codigo: string;
          custo_adotado?: number;
          custo_atualizado_em?: string | null;
          custo_base?: string | null;
          custo_fonte?: Json | null;
          custo_inclui?: string[];
          custo_origem_id?: string | null;
          descricao: string;
          estrutura?: Json | null;
          estrutura_origem?: Json | null;
          fabricante?: string | null;
          fornecedor_id?: string | null;
          id?: string;
          incluido_orcamento?: boolean;
          indivisivel?: boolean;
          justificativa?: string | null;
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra?: number;
          ncm?: string | null;
          organization_id: string;
          produto_id: string;
          quantidade_avulsa?: number;
          revisao_id: string;
          unidade: string;
        };
        Update: {
          codigo?: string;
          custo_adotado?: number;
          custo_atualizado_em?: string | null;
          custo_base?: string | null;
          custo_fonte?: Json | null;
          custo_inclui?: string[];
          custo_origem_id?: string | null;
          descricao?: string;
          estrutura?: Json | null;
          estrutura_origem?: Json | null;
          fabricante?: string | null;
          fornecedor_id?: string | null;
          id?: string;
          incluido_orcamento?: boolean;
          indivisivel?: boolean;
          justificativa?: string | null;
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"];
          multiplo_compra?: number;
          ncm?: string | null;
          organization_id?: string;
          produto_id?: string;
          quantidade_avulsa?: number;
          revisao_id?: string;
          unidade?: string;
        };
        Relationships: [
          {
            foreignKeyName: "revisao_componentes_custo_origem_id_fkey";
            columns: ["custo_origem_id"];
            isOneToOne: false;
            referencedRelation: "produto_custos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revisao_componentes_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revisao_componentes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revisao_componentes_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "revisao_componentes_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduler_configuracao: {
        Row: {
          detalhe: string;
          estado: string;
          extensao: string;
          job_id: number | null;
          nome: string;
          verificado_em: string;
        };
        ComputedFields: never;
        Insert: {
          detalhe: string;
          estado: string;
          extensao: string;
          job_id?: number | null;
          nome: string;
          verificado_em?: string;
        };
        Update: {
          detalhe?: string;
          estado?: string;
          extensao?: string;
          job_id?: number | null;
          nome?: string;
          verificado_em?: string;
        };
        Relationships: [];
      };
      series_codigo: {
        Row: {
          familia: string;
          organization_id: string;
          tipo: string;
          ultimo: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          familia: string;
          organization_id: string;
          tipo: string;
          ultimo?: number;
          updated_at?: string;
        };
        Update: {
          familia?: string;
          organization_id?: string;
          tipo?: string;
          ultimo?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "series_codigo_familia_fkey";
            columns: ["familia"];
            isOneToOne: false;
            referencedRelation: "familias_codigo";
            referencedColumns: ["sigla"];
          },
          {
            foreignKeyName: "series_codigo_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      series_planilha: {
        Row: {
          familia: string;
          origem: string;
          pendencia: string | null;
          tipo: string;
          ultimo: number;
        };
        ComputedFields: never;
        Insert: {
          familia: string;
          origem?: string;
          pendencia?: string | null;
          tipo: string;
          ultimo: number;
        };
        Update: {
          familia?: string;
          origem?: string;
          pendencia?: string | null;
          tipo?: string;
          ultimo?: number;
        };
        Relationships: [
          {
            foreignKeyName: "series_planilha_familia_fkey";
            columns: ["familia"];
            isOneToOne: false;
            referencedRelation: "familias_codigo";
            referencedColumns: ["sigla"];
          },
        ];
      };
      sistema_componentes: {
        Row: {
          id: string;
          memoria: string | null;
          organization_id: string;
          override_justificativa: string | null;
          override_quantidade: number | null;
          quantidade: number;
          quantidade_tecnica: number;
          regra_chave: string;
          revisao_componente_id: string;
          revisao_id: string;
          sistema_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          memoria?: string | null;
          organization_id: string;
          override_justificativa?: string | null;
          override_quantidade?: number | null;
          quantidade: number;
          quantidade_tecnica: number;
          regra_chave: string;
          revisao_componente_id: string;
          revisao_id: string;
          sistema_id: string;
        };
        Update: {
          id?: string;
          memoria?: string | null;
          organization_id?: string;
          override_justificativa?: string | null;
          override_quantidade?: number | null;
          quantidade?: number;
          quantidade_tecnica?: number;
          regra_chave?: string;
          revisao_componente_id?: string;
          revisao_id?: string;
          sistema_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sistema_componentes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sistema_componentes_revisao_componente_id_fkey";
            columns: ["revisao_componente_id"];
            isOneToOne: false;
            referencedRelation: "revisao_componentes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sistema_componentes_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sistema_componentes_sistema_id_fkey";
            columns: ["sistema_id"];
            isOneToOne: false;
            referencedRelation: "sistemas_dimensionados";
            referencedColumns: ["id"];
          },
        ];
      };
      sistemas_dimensionados: {
        Row: {
          created_at: string;
          id: string;
          identificacao: string;
          metragem: number;
          ordem: number;
          organization_id: string;
          origem: string;
          revisao_id: string;
          tipo: Database["public"]["Enums"]["tipo_sistema"];
          trechos: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          identificacao?: string;
          metragem?: number;
          ordem: number;
          organization_id: string;
          origem?: string;
          revisao_id: string;
          tipo: Database["public"]["Enums"]["tipo_sistema"];
          trechos?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          identificacao?: string;
          metragem?: number;
          ordem?: number;
          organization_id?: string;
          origem?: string;
          revisao_id?: string;
          tipo?: Database["public"]["Enums"]["tipo_sistema"];
          trechos?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sistemas_dimensionados_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sistemas_dimensionados_revisao_id_fkey";
            columns: ["revisao_id"];
            isOneToOne: false;
            referencedRelation: "proposta_revisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      unidades: {
        Row: {
          arquivado_em: string | null;
          cliente_id: string;
          created_at: string;
          created_by: string | null;
          distancia_ida_volta_km: number | null;
          endereco: string | null;
          id: string;
          motivo_arquivo: string | null;
          nome: string;
          observacoes: string | null;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          arquivado_em?: string | null;
          cliente_id: string;
          created_at?: string;
          created_by?: string | null;
          distancia_ida_volta_km?: number | null;
          endereco?: string | null;
          id?: string;
          motivo_arquivo?: string | null;
          nome: string;
          observacoes?: string | null;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          arquivado_em?: string | null;
          cliente_id?: string;
          created_at?: string;
          created_by?: string | null;
          distancia_ida_volta_km?: number | null;
          endereco?: string | null;
          id?: string;
          motivo_arquivo?: string | null;
          nome?: string;
          observacoes?: string | null;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "unidades_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "unidades_cliente_tenant_operacional";
            columns: ["organization_id", "cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "unidades_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_capacidades: {
        Row: {
          capacidade: string;
          concedido_por: string;
          created_at: string;
          organization_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          capacidade: string;
          concedido_por?: string;
          created_at?: string;
          organization_id: string;
          user_id: string;
        };
        Update: {
          capacidade?: string;
          concedido_por?: string;
          created_at?: string;
          organization_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_capacidades_organization_id_user_id_fkey";
            columns: ["organization_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "user_id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _alvos_rascunho_op: {
        Args: { _op: string };
        Returns: {
          alvo: number;
          atual: number;
          codigo: string;
          demanda_id: string;
          produzida: number;
        }[];
      };
      _plano_ordens: { Args: { _escopo: string; _rev: string }; Returns: Json };
      aceitar_projeto_operacional: {
        Args: {
          _chave: string;
          _motivo?: string;
          _org: string;
          _revisao: string;
        };
        Returns: Json;
      };
      administrar_vinculo_operacional: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      agenda_ler_evento: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      agenda_registrar_revisao: {
        Args: { _anterior: string; _efeito: string; _id: string; _org: string };
        Returns: undefined;
      };
      agenda_reservar: {
        Args: { _id: string; _org: string };
        Returns: undefined;
      };
      alm_autor_gerir: {
        Args: { _autor: string; _org: string };
        Returns: boolean;
      };
      alm_autor_ler_ferramenta: {
        Args: { _autor: string; _id: string; _org: string };
        Returns: boolean;
      };
      alm_decimal: {
        Args: { _positivo?: boolean; _valor: Json };
        Returns: number;
      };
      alm_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      alm_executar_ferramenta: {
        Args: { _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      alm_ferramenta_liberada: {
        Args: {
          _fim: string;
          _id: string;
          _inicio: string;
          _org: string;
          _timezone: string;
        };
        Returns: undefined;
      };
      alm_gerir: { Args: { _org: string }; Returns: boolean };
      alm_ler_ferramenta: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      alm_ler_produto: { Args: { _id: string; _org: string }; Returns: boolean };
      alm_ler_reserva: { Args: { _id: string; _org: string }; Returns: boolean };
      alm_listar: {
        Args: {
          _busca?: string;
          _estado?: string;
          _limite?: number;
          _local?: string;
          _org: string;
          _pagina?: number;
          _tipo: string;
        };
        Returns: Json;
      };
      alm_livre_lote: {
        Args: { _conferencia: string; _local: string; _org: string };
        Returns: number;
      };
      alm_movimento: {
        Args: {
          _conferencia: string;
          _local: string;
          _op: string;
          _org: string;
          _pessoa: string;
          _posicao: string;
          _produto: string;
          _quantidade: number;
          _reserva: string;
        };
        Returns: undefined;
      };
      alm_obter: {
        Args: { _id: string; _org: string; _tipo: string };
        Returns: Json;
      };
      alm_opcoes: {
        Args: {
          _busca?: string;
          _limite?: number;
          _local?: string;
          _org: string;
          _pagina?: number;
          _tipo: string;
        };
        Returns: Json;
      };
      alm_permissoes: { Args: { _org: string }; Returns: Json };
      alm_produto_fracao: {
        Args: { _id: string; _org: string; _quantidade: number };
        Returns: undefined;
      };
      alm_produto_json: { Args: { _id: string; _org: string }; Returns: Json };
      alm_reserva_quantidades: {
        Args: { _id: string; _org: string };
        Returns: Json;
      };
      alm_row: {
        Args: { _id: string; _org: string; _tipo: string };
        Returns: Json;
      };
      alm_saldo: {
        Args: {
          _conferencia?: string;
          _local?: string;
          _org: string;
          _produto: string;
        };
        Returns: Json;
      };
      alm_texto: {
        Args: { _campo: string; _dados: Json; _max: number; _min?: number };
        Returns: string;
      };
      alm_travar: { Args: { _org: string }; Returns: undefined };
      alm_validar_payload: {
        Args: { _campos: string[]; _dados: Json };
        Returns: undefined;
      };
      aplicar_demanda: {
        Args: { _hash: string; _linhas: Json; _remover: string[]; _rev: string };
        Returns: Json;
      };
      arquivar_cadastro_cliente: {
        Args: {
          _arquivar: boolean;
          _chave: string;
          _entidade: string;
          _expected_version: number;
          _id: string;
          _motivo: string;
          _org: string;
        };
        Returns: Json;
      };
      arvore_produto: {
        Args: { _nivel?: number; _produto: string };
        Returns: Json;
      };
      atualizar_componentes_revisao: {
        Args: { _esperados: Json; _ids: string[]; _patch: Json; _rev: string };
        Returns: number;
      };
      cadastrar_produto_codificado: {
        Args: {
          _chave: string;
          _custo: number;
          _dados: Json;
          _familia: string;
          _org: string;
          _tipo: string;
        };
        Returns: Json;
      };
      can_see_costs: { Args: { _org: string }; Returns: boolean };
      cancelar_anexo_operacional: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string };
        Returns: Json;
      };
      capturar_revisao: {
        Args: { _operacao?: string; _rev: string };
        Returns: Json;
      };
      concluir_revisao: {
        Args: {
          _calculo: Json;
          _operacao?: string;
          _rev: string;
          _snapshot: Json;
          _versao: number;
          _versao_salva: number;
        };
        Returns: Json;
      };
      confirmar_anexo_operacional: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string };
        Returns: undefined;
      };
      confirmar_participacao_agenda: {
        Args: {
          _chave: string;
          _confirmacao: string;
          _expected_version: number;
          _id: string;
          _org: string;
        };
        Returns: Json;
      };
      consultar_jobs_operacionais: { Args: { _org: string }; Returns: Json };
      criar_organizacao: { Args: { _nome: string }; Returns: string };
      diferencas_comerciais: {
        Args: { _a: Json; _b: Json; _rev: string };
        Returns: {
          antes: Json;
          campo: string;
          depois: Json;
          justificativa: string;
          nome: string;
          objeto: string;
        }[];
      };
      diferencas_rascunho: {
        Args: { _a: Json; _b: Json };
        Returns: {
          antes: Json;
          campo: string;
          depois: Json;
          justificativa: string;
          nome: string;
          objeto: string;
        }[];
      };
      editar_produto: {
        Args: { _dados: Json; _produto: string };
        Returns: Json;
      };
      encerrar_membro_equipe: {
        Args: {
          _chave: string;
          _fim: string;
          _id: string;
          _motivo: string;
          _org: string;
        };
        Returns: Json;
      };
      est_autor_base: {
        Args: { _autor: string; _id: string; _org: string };
        Returns: boolean;
      };
      est_autor_fonte: {
        Args: {
          _autor: string;
          _doc: string;
          _lev: string;
          _org: string;
          _pe: string;
        };
        Returns: boolean;
      };
      est_autor_ler: {
        Args: { _autor: string; _id: string; _org: string };
        Returns: boolean;
      };
      est_bloqueios: { Args: { _org: string; _revisao: string }; Returns: Json };
      est_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string };
        Returns: Json;
      };
      est_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string };
        Returns: Json;
      };
      est_doc_fonte_valida: {
        Args: {
          _cliente: string;
          _documento: string;
          _org: string;
          _unidade: string;
        };
        Returns: boolean;
      };
      est_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      est_gravar_fonte: {
        Args: { _d: Json; _estudo: string; _org: string; _revisao: string };
        Returns: string;
      };
      est_gravar_medida: {
        Args: {
          _d: Json;
          _estudo: string;
          _org: string;
          _perigo: string;
          _revisao: string;
        };
        Returns: string;
      };
      est_ler: { Args: { _id: string; _org: string }; Returns: boolean };
      est_ler_arquivo: { Args: { _id: string; _org: string }; Returns: boolean };
      est_listar: {
        Args: {
          _busca?: string;
          _cliente?: string;
          _estado?: string;
          _limite?: number;
          _org: string;
          _pagina?: number;
          _responsavel?: string;
        };
        Returns: Json;
      };
      est_metodos: {
        Args: {
          _busca?: string;
          _limite?: number;
          _org: string;
          _pagina?: number;
        };
        Returns: Json;
      };
      est_obter: {
        Args: { _id: string; _org: string; _revisao?: string };
        Returns: Json;
      };
      est_opcoes: {
        Args: {
          _busca?: string;
          _cliente?: string;
          _org: string;
          _pagina?: number;
          _tipo: string;
          _unidade?: string;
        };
        Returns: Json;
      };
      est_pe_fonte_valida: {
        Args: {
          _cliente: string;
          _org: string;
          _unidade: string;
          _versao: string;
        };
        Returns: boolean;
      };
      est_pode_enviar_arquivo: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      est_preparar_arquivo: {
        Args: {
          _chave: string;
          _dados: Json;
          _org: string;
          _perigo: string;
          _revisao: string;
        };
        Returns: Json;
      };
      est_profissional: {
        Args: { _autor: string; _org: string };
        Returns: string;
      };
      est_proximo_codigo: { Args: { _org: string }; Returns: string };
      est_publicar_metodo: {
        Args: { _chave: string; _dados: Json; _metodo: string; _org: string };
        Returns: Json;
      };
      est_snapshot: { Args: { _org: string; _revisao: string }; Returns: Json };
      est_travar_autor: {
        Args: { _autor: string; _org: string };
        Returns: undefined;
      };
      est_travar_destino: {
        Args: {
          _autor: string;
          _editavel?: boolean;
          _org: string;
          _revisao: string;
        };
        Returns: {
          analise: string;
          aprovado_em: string | null;
          aprovado_por: string | null;
          art_referencia: string;
          base_id: string | null;
          conclusao: string;
          created_at: string;
          created_by: string;
          escopo: string;
          estado: string;
          estudo_id: string;
          id: string;
          metodo_versao_id: string | null;
          numero: number;
          organization_id: string;
          premissas: string;
          responsabilidade_tecnica: string;
          responsavel_tecnico_id: string;
          revisor_id: string | null;
          snapshot: Json | null;
          snapshot_sha256: string | null;
          submissao_atual_id: string | null;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "estudo_revisoes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      est_travar_fontes: {
        Args: { _estudo: string; _org: string };
        Returns: undefined;
      };
      est_validar_textos: {
        Args: { _campos: string[]; _d: Json };
        Returns: undefined;
      };
      est_vincular_acao: {
        Args: { _chave: string; _dados: Json; _medida: string; _org: string };
        Returns: Json;
      };
      executar_job_agenda_notificacoes: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      formatar_codigo: {
        Args: { _familia: string; _seq: number; _tipo: string };
        Returns: string;
      };
      gerar_ordens: {
        Args: {
          _chave: string;
          _escopo?: string;
          _plano_hash?: string;
          _rev: string;
        };
        Returns: Json;
      };
      has_org_role: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      hash_tecnico: { Args: { _rev: string }; Returns: string };
      importar_produto_oficial: {
        Args: { _codigo: string; _dados: Json; _org: string };
        Returns: string;
      };
      incluir_produto_revisao: {
        Args: { _produto: string; _quantidade: number; _rev: string };
        Returns: Json;
      };
      is_member: { Args: { _org: string }; Returns: boolean };
      lev_adotar_medicao: {
        Args: {
          _campo: string;
          _chave: string;
          _medicao: string;
          _org: string;
          _preview_hash: string;
          _revisao: string;
          _sistema: string;
        };
        Returns: Json;
      };
      lev_autor_ler: {
        Args: { _autor: string; _id: string; _org: string };
        Returns: boolean;
      };
      lev_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string };
        Returns: Json;
      };
      lev_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string };
        Returns: undefined;
      };
      lev_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      lev_gravar_medicao: {
        Args: {
          _d: Json;
          _levantamento: string;
          _org: string;
          _ponto: string;
          _revisao: string;
        };
        Returns: string;
      };
      lev_ler: { Args: { _id: string; _org: string }; Returns: boolean };
      lev_listar: {
        Args: {
          _busca?: string;
          _cliente?: string;
          _estado?: string;
          _limite?: number;
          _org: string;
          _pagina?: number;
          _responsavel?: string;
        };
        Returns: Json;
      };
      lev_obter: {
        Args: { _id: string; _org: string; _revisao?: string };
        Returns: Json;
      };
      lev_pode_enviar_arquivo: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      lev_preparar_arquivo: {
        Args: {
          _chave: string;
          _dados: Json;
          _org: string;
          _ponto: string;
          _revisao: string;
        };
        Returns: Json;
      };
      lev_prever_adocao: {
        Args: {
          _campo: string;
          _medicao: string;
          _org: string;
          _revisao: string;
          _sistema: string;
        };
        Returns: Json;
      };
      lev_profissional: { Args: { _org: string }; Returns: string };
      lev_proximo_codigo: { Args: { _org: string }; Returns: string };
      lev_publicar_modelo: {
        Args: { _chave: string; _dados: Json; _modelo: string; _org: string };
        Returns: Json;
      };
      lev_travar_autor: {
        Args: { _autor: string; _org: string };
        Returns: undefined;
      };
      lev_travar_destino: {
        Args: {
          _autor: string;
          _editavel?: boolean;
          _org: string;
          _revisao: string;
        };
        Returns: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          base_id: string | null;
          created_at: string;
          created_by: string;
          estado: string;
          fim_previsto: string | null;
          id: string;
          inicio_previsto: string | null;
          levantamento_id: string;
          modelo_versao_id: string | null;
          numero: number;
          organization_id: string;
          snapshot: Json | null;
          snapshot_sha256: string | null;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "levantamento_revisoes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      lev_unidade_compativel: {
        Args: { _grandeza: string; _unidade: string };
        Returns: boolean;
      };
      lev_validar_coleta: {
        Args: { _org: string; _revisao: string };
        Returns: undefined;
      };
      listar_anexos_operacionais: {
        Args: { _org: string; _pai: Json };
        Returns: Json;
      };
      listar_cadastros_cliente: {
        Args: {
          _busca?: string;
          _cliente?: string;
          _grupo?: string;
          _limite?: number;
          _org: string;
          _pagina?: number;
          _situacao?: string;
        };
        Returns: Json;
      };
      listar_eventos_agenda: {
        Args: {
          _fim: string;
          _inicio: string;
          _minha?: boolean;
          _org: string;
          _pagina?: number;
          _tamanho?: number;
        };
        Returns: Json;
      };
      marcar_notificacao_lida: {
        Args: { _id: string; _org: string };
        Returns: undefined;
      };
      objeto_rascunho: { Args: { _r: Json; _t: string }; Returns: Json };
      obter_cadastro_cliente: {
        Args: { _entidade: string; _id: string; _org: string };
        Returns: Json;
      };
      obter_cliente_operacional: {
        Args: { _id: string; _org: string };
        Returns: Json;
      };
      operacao_autor_destino_anexo: {
        Args: { _autor: string; _escrever?: boolean; _org: string; _pai: Json };
        Returns: boolean;
      };
      operacao_autor_ler_anexo: {
        Args: { _autor: string; _id: string; _org: string };
        Returns: boolean;
      };
      operacao_autor_pode: {
        Args: { _acao: string; _autor: string; _org: string };
        Returns: boolean;
      };
      operacao_concluir: {
        Args: {
          _chave: string;
          _comando: string;
          _org: string;
          _payload: Json;
          _resultado: Json;
        };
        Returns: Json;
      };
      operacao_ler_acao: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      operacao_ler_anexo: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      operacao_minha_pessoa: {
        Args: { _org: string; _pessoa: string };
        Returns: boolean;
      };
      operacao_pode: { Args: { _acao: string; _org: string }; Returns: boolean };
      operacao_pode_enviar_anexo: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      operacao_repetir: {
        Args: { _chave: string; _comando: string; _org: string; _payload: Json };
        Returns: Json;
      };
      operacao_travar_pai_anexo: {
        Args: { _org: string; _pai: Json };
        Returns: undefined;
      };
      pe_autor_acessa: {
        Args: { _autor: string; _org: string; _projeto: string };
        Returns: boolean;
      };
      pe_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string };
        Returns: Json;
      };
      pe_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string };
        Returns: undefined;
      };
      pe_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string };
        Returns: Json;
      };
      pe_ler_arquivo: { Args: { _id: string; _org: string }; Returns: boolean };
      pe_ler_projeto: { Args: { _id: string; _org: string }; Returns: boolean };
      pe_pode_enviar_arquivo: {
        Args: { _id: string; _org: string };
        Returns: boolean;
      };
      pe_preparar_arquivo: {
        Args: { _chave: string; _dados: Json; _org: string; _versao: string };
        Returns: Json;
      };
      pe_validar_modelo: { Args: { _modelo: Json }; Returns: undefined };
      planejar_ordens: {
        Args: { _escopo?: string; _rev: string };
        Returns: Json;
      };
      pode: { Args: { _acao: string; _org: string }; Returns: boolean };
      preparar_anexo_operacional: {
        Args: { _chave: string; _dados: Json; _org: string };
        Returns: Json;
      };
      previa_codigo: {
        Args: { _familia: string; _org: string; _tipo: string };
        Returns: string;
      };
      processar_notificacoes_agenda: {
        Args: { _limite?: number };
        Returns: Json;
      };
      proximo_numero: {
        Args: { _org: string; _prefixo: string };
        Returns: string;
      };
      proximo_numero_proposta: { Args: { _org: string }; Returns: string };
      reclassificar_produto: {
        Args: {
          _familia: string;
          _motivo: string;
          _produto: string;
          _tipo: string;
        };
        Returns: Json;
      };
      recodificar_produto: {
        Args: { _familia: string; _produto: string; _tipo: string };
        Returns: Json;
      };
      registrar_aquisicao: {
        Args: {
          _chave: string;
          _custo_sugerido: number;
          _dados: Json;
          _produto: string;
        };
        Returns: Json;
      };
      registrar_indisponibilidade: {
        Args: {
          _chave: string;
          _fim: string;
          _inicio: string;
          _motivo: string;
          _org: string;
          _pessoa: string;
        };
        Returns: Json;
      };
      registrar_movimento: {
        Args: {
          _chave: string;
          _estorno_de?: string;
          _item: string;
          _quantidade: number;
          _tipo: string;
        };
        Returns: Json;
      };
      reservar_sequencia: {
        Args: { _familia: string; _org: string; _tipo: string };
        Returns: number;
      };
      revisao_editavel: { Args: { _rev: string }; Returns: boolean };
      revisar_rascunho_op: {
        Args: { _chave: string; _op: string };
        Returns: Json;
      };
      salvar_acao_operacional: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_cliente_operacional: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_competencia: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_composicao: {
        Args: { _itens: Json; _produto: string; _status: string };
        Returns: Json;
      };
      salvar_contato_operacional: {
        Args: {
          _chave: string;
          _cliente: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_equipe: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_evento_agenda: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_pessoa: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_qualificacao: {
        Args: {
          _chave: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      salvar_unidade_operacional: {
        Args: {
          _chave: string;
          _cliente: string;
          _dados: Json;
          _expected_version?: number;
          _id?: string;
          _org: string;
        };
        Returns: Json;
      };
      snapshot_rascunho: { Args: { _rev: string }; Returns: Json };
      transicionar_acao_operacional: {
        Args: {
          _chave: string;
          _estado: string;
          _expected_version: number;
          _id: string;
          _motivo?: string;
          _org: string;
        };
        Returns: Json;
      };
      transicionar_evento_agenda: {
        Args: {
          _chave: string;
          _estado: string;
          _expected_version: number;
          _id: string;
          _motivo?: string;
          _org: string;
        };
        Returns: Json;
      };
      transicionar_qualificacao: {
        Args: {
          _chave: string;
          _estado: string;
          _expected_version: number;
          _id: string;
          _motivo?: string;
          _org: string;
        };
        Returns: Json;
      };
      travar_revisao: { Args: { _rev: string }; Returns: undefined };
      vincular_membro_equipe: {
        Args: {
          _chave: string;
          _equipe: string;
          _fim?: string;
          _inicio: string;
          _org: string;
          _pessoa: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "admin" | "comercial" | "engenharia" | "compras" | "financeiro" | "campo";
      modalidade_suprimento: "comprar" | "fabricar" | "terceirizar";
      status_revisao: "rascunho" | "em_revisao" | "enviada" | "aceita" | "recusada" | "substituida";
      tipo_sistema: "TELHADO" | "OVERHEAD";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "comercial", "engenharia", "compras", "financeiro", "campo"],
      modalidade_suprimento: ["comprar", "fabricar", "terceirizar"],
      status_revisao: ["rascunho", "em_revisao", "enviada", "aceita", "recusada", "substituida"],
      tipo_sistema: ["TELHADO", "OVERHEAD"],
    },
  },
} as const;
