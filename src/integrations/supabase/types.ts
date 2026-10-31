export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      acao_colaboradores: {
        Row: {
          acao_id: string
          organization_id: string
          pessoa_id: string
        }
        Insert: {
          acao_id: string
          organization_id: string
          pessoa_id: string
        }
        Update: {
          acao_id?: string
          organization_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acao_colaboradores_organization_id_acao_id_fkey"
            columns: ["organization_id", "acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "acao_colaboradores_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      acoes_operacionais: {
        Row: {
          cliente_id: string | null
          conclusao: string | null
          created_at: string
          created_by: string
          descricao: string
          estado: string
          exige_verificacao: boolean
          id: string
          local: string
          motivo: string | null
          organization_id: string
          prazo: string | null
          prioridade: string
          projeto_id: string | null
          responsavel_id: string
          titulo: string
          unidade_id: string | null
          updated_at: string
          verificado_por: string | null
          version: number
        }
        Insert: {
          cliente_id?: string | null
          conclusao?: string | null
          created_at?: string
          created_by?: string
          descricao?: string
          estado?: string
          exige_verificacao?: boolean
          id?: string
          local?: string
          motivo?: string | null
          organization_id: string
          prazo?: string | null
          prioridade?: string
          projeto_id?: string | null
          responsavel_id: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
          verificado_por?: string | null
          version?: number
        }
        Update: {
          cliente_id?: string | null
          conclusao?: string | null
          created_at?: string
          created_by?: string
          descricao?: string
          estado?: string
          exige_verificacao?: boolean
          id?: string
          local?: string
          motivo?: string | null
          organization_id?: string
          prazo?: string | null
          prioridade?: string
          projeto_id?: string | null
          responsavel_id?: string
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
          verificado_por?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "acao_cliente"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "acao_projeto"
            columns: ["organization_id", "cliente_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "acao_unidade"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "acoes_operacionais_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_operacionais_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_automacoes: {
        Row: {
          backend_pid: number
          created_at: string
          custodia_id: string
          evento_id: string
          id: string
          job_execucao_id: string
          operacao: string
          organization_id: string
          serie_id: string
          serie_versao_id: string
          solicitante_id: string
          transaction_id: unknown
        }
        Insert: {
          backend_pid: number
          created_at?: string
          custodia_id: string
          evento_id: string
          id?: string
          job_execucao_id: string
          operacao: string
          organization_id: string
          serie_id: string
          serie_versao_id: string
          solicitante_id: string
          transaction_id: unknown
        }
        Update: {
          backend_pid?: number
          created_at?: string
          custodia_id?: string
          evento_id?: string
          id?: string
          job_execucao_id?: string
          operacao?: string
          organization_id?: string
          serie_id?: string
          serie_versao_id?: string
          solicitante_id?: string
          transaction_id?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "agenda_automacoes_job_execucao_id_fkey"
            columns: ["job_execucao_id"]
            isOneToOne: false
            referencedRelation: "job_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_automacoes_organization_id_custodia_id_fkey"
            columns: ["organization_id", "custodia_id"]
            isOneToOne: false
            referencedRelation: "ferramenta_custodias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_automacoes_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_automacoes_organization_id_serie_id_serie_versao_id_fkey"
            columns: ["organization_id", "serie_id", "serie_versao_id"]
            isOneToOne: false
            referencedRelation: "agenda_serie_versoes"
            referencedColumns: ["organization_id", "serie_id", "id"]
          },
        ]
      }
      agenda_comentarios: {
        Row: {
          created_at: string
          created_by: string
          evento_id: string
          id: string
          organization_id: string
          texto: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          evento_id: string
          id?: string
          organization_id: string
          texto: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evento_id?: string
          id?: string
          organization_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_comentarios_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_evento_revisoes: {
        Row: {
          autor: string
          created_at: string
          evento_id: string
          organization_id: string
          snapshot: Json
          versao: number
        }
        Insert: {
          autor?: string
          created_at?: string
          evento_id: string
          organization_id: string
          snapshot: Json
          versao: number
        }
        Update: {
          autor?: string
          created_at?: string
          evento_id?: string
          organization_id?: string
          snapshot?: Json
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_evento_revisoes_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_eventos: {
        Row: {
          acao_id: string | null
          bloqueia_recursos: boolean
          cliente_id: string | null
          created_at: string
          created_by: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string
          dia_inteiro: boolean
          estado: string
          excecao: boolean
          fim: string
          geracao_job_id: string | null
          gerado_automaticamente: boolean
          id: string
          inicio: string
          levantamento_id: string | null
          local: string
          motivo: string | null
          ocorrencia_data: string | null
          organization_id: string
          origem_ocorrencia: string | null
          projeto_id: string | null
          responsavel_id: string
          serie_id: string | null
          serie_versao_id: string | null
          timezone: string
          tipo: string
          titulo: string
          unidade_id: string | null
          updated_at: string
          version: number
          visibilidade: string
        }
        Insert: {
          acao_id?: string | null
          bloqueia_recursos?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string
          dia_inteiro?: boolean
          estado?: string
          excecao?: boolean
          fim: string
          geracao_job_id?: string | null
          gerado_automaticamente?: boolean
          id?: string
          inicio: string
          levantamento_id?: string | null
          local?: string
          motivo?: string | null
          ocorrencia_data?: string | null
          organization_id: string
          origem_ocorrencia?: string | null
          projeto_id?: string | null
          responsavel_id: string
          serie_id?: string | null
          serie_versao_id?: string | null
          timezone?: string
          tipo: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
          visibilidade?: string
        }
        Update: {
          acao_id?: string | null
          bloqueia_recursos?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string
          dia_inteiro?: boolean
          estado?: string
          excecao?: boolean
          fim?: string
          geracao_job_id?: string | null
          gerado_automaticamente?: boolean
          id?: string
          inicio?: string
          levantamento_id?: string | null
          local?: string
          motivo?: string | null
          ocorrencia_data?: string | null
          organization_id?: string
          origem_ocorrencia?: string | null
          projeto_id?: string | null
          responsavel_id?: string
          serie_id?: string | null
          serie_versao_id?: string | null
          timezone?: string
          tipo?: string
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_cliente"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_evento_serie"
            columns: ["organization_id", "serie_id", "serie_versao_id"]
            isOneToOne: false
            referencedRelation: "agenda_serie_versoes"
            referencedColumns: ["organization_id", "serie_id", "id"]
          },
          {
            foreignKeyName: "agenda_eventos_geracao_job_id_fkey"
            columns: ["geracao_job_id"]
            isOneToOne: false
            referencedRelation: "job_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_eventos_organization_id_acao_id_fkey"
            columns: ["organization_id", "acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_eventos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_eventos_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_levantamento"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "levantamento_id",
            ]
            isOneToOne: false
            referencedRelation: "levantamentos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "agenda_projeto"
            columns: ["organization_id", "cliente_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "agenda_unidade"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
        ]
      }
      agenda_excecoes: {
        Row: {
          created_at: string
          created_by: string
          data_original: string
          evento_id: string
          id: string
          motivo: string
          organization_id: string
          serie_id: string
          serie_versao_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          data_original: string
          evento_id: string
          id?: string
          motivo: string
          organization_id: string
          serie_id: string
          serie_versao_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_original?: string
          evento_id?: string
          id?: string
          motivo?: string
          organization_id?: string
          serie_id?: string
          serie_versao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_excecoes_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_excecoes_organization_id_serie_id_serie_versao_id_fkey"
            columns: ["organization_id", "serie_id", "serie_versao_id"]
            isOneToOne: false
            referencedRelation: "agenda_serie_versoes"
            referencedColumns: ["organization_id", "serie_id", "id"]
          },
        ]
      }
      agenda_ferramentas: {
        Row: {
          created_at: string
          created_by: string
          custodia_id: string | null
          evento_id: string
          ferramenta_id: string
          id: string
          organization_id: string
          pessoa_id: string
          version: number
          vigente: boolean
        }
        Insert: {
          created_at?: string
          created_by: string
          custodia_id?: string | null
          evento_id: string
          ferramenta_id: string
          id?: string
          organization_id: string
          pessoa_id: string
          version?: number
          vigente?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string
          custodia_id?: string | null
          evento_id?: string
          ferramenta_id?: string
          id?: string
          organization_id?: string
          pessoa_id?: string
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agenda_ferramentas_organization_id_custodia_id_fkey"
            columns: ["organization_id", "custodia_id"]
            isOneToOne: false
            referencedRelation: "ferramenta_custodias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_ferramentas_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_ferramentas_organization_id_ferramenta_id_fkey"
            columns: ["organization_id", "ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_ferramentas_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_participantes: {
        Row: {
          ciencia_em: string | null
          confirmacao: string
          created_at: string
          created_by: string
          equipe_inicio: string | null
          equipe_origem_id: string | null
          evento_id: string
          funcao: string
          id: string
          organization_id: string
          pessoa_id: string
          retirado_em: string | null
          version: number
          vigente: boolean
        }
        Insert: {
          ciencia_em?: string | null
          confirmacao?: string
          created_at?: string
          created_by?: string
          equipe_inicio?: string | null
          equipe_origem_id?: string | null
          evento_id: string
          funcao: string
          id?: string
          organization_id: string
          pessoa_id: string
          retirado_em?: string | null
          version?: number
          vigente?: boolean
        }
        Update: {
          ciencia_em?: string | null
          confirmacao?: string
          created_at?: string
          created_by?: string
          equipe_inicio?: string | null
          equipe_origem_id?: string | null
          evento_id?: string
          funcao?: string
          id?: string
          organization_id?: string
          pessoa_id?: string
          retirado_em?: string | null
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agenda_equipe_temporal"
            columns: [
              "organization_id",
              "equipe_origem_id",
              "pessoa_id",
              "equipe_inicio",
            ]
            isOneToOne: false
            referencedRelation: "equipe_membros"
            referencedColumns: [
              "organization_id",
              "equipe_id",
              "pessoa_id",
              "inicio",
            ]
          },
          {
            foreignKeyName: "agenda_participantes_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_participantes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_preferencias: {
        Row: {
          antecedencia_minutos: number
          notificar: boolean
          notificar_atrasos: boolean
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          antecedencia_minutos?: number
          notificar?: boolean
          notificar_atrasos?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          antecedencia_minutos?: number
          notificar?: boolean
          notificar_atrasos?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_preferencias_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      agenda_requisitos: {
        Row: {
          competencia_id: string
          evento_id: string
          exige_evidencia: boolean
          exige_validade: boolean
          nome: string
          organization_id: string
        }
        Insert: {
          competencia_id: string
          evento_id: string
          exige_evidencia: boolean
          exige_validade: boolean
          nome: string
          organization_id: string
        }
        Update: {
          competencia_id?: string
          evento_id?: string
          exige_evidencia?: boolean
          exige_validade?: boolean
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_requisitos_organization_id_competencia_id_fkey"
            columns: ["organization_id", "competencia_id"]
            isOneToOne: false
            referencedRelation: "competencias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_requisitos_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_reservas_pessoas: {
        Row: {
          ativa: boolean
          created_at: string
          evento_id: string
          evento_version: number
          fim: string
          id: string
          inicio: string
          liberada_em: string | null
          organization_id: string
          participante_id: string
          pessoa_id: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          evento_id: string
          evento_version: number
          fim: string
          id?: string
          inicio: string
          liberada_em?: string | null
          organization_id: string
          participante_id: string
          pessoa_id: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          evento_id?: string
          evento_version?: number
          fim?: string
          id?: string
          inicio?: string
          liberada_em?: string | null
          organization_id?: string
          participante_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_evento_id_particip_fkey"
            columns: [
              "organization_id",
              "evento_id",
              "participante_id",
              "pessoa_id",
            ]
            isOneToOne: false
            referencedRelation: "agenda_participantes"
            referencedColumns: [
              "organization_id",
              "evento_id",
              "id",
              "pessoa_id",
            ]
          },
          {
            foreignKeyName: "agenda_reservas_pessoas_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_serie_ocorrencias: {
        Row: {
          codigo: string | null
          data: string
          estado: string
          evento_id: string | null
          organization_id: string
          proxima_tentativa: string
          serie_versao_id: string
          tentativas: number
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          data: string
          estado: string
          evento_id?: string | null
          organization_id: string
          proxima_tentativa?: string
          serie_versao_id: string
          tentativas?: number
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          data?: string
          estado?: string
          evento_id?: string | null
          organization_id?: string
          proxima_tentativa?: string
          serie_versao_id?: string
          tentativas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_serie_ocorrencias_organization_id_evento_id_fkey"
            columns: ["organization_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "agenda_serie_ocorrencias_organization_id_serie_versao_id_fkey"
            columns: ["organization_id", "serie_versao_id"]
            isOneToOne: false
            referencedRelation: "agenda_serie_versoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_serie_versoes: {
        Row: {
          created_at: string
          created_by: string
          evento_modelo: Json
          id: string
          inicio_aplicacao: string
          motivo: string | null
          numero: number
          organization_id: string
          publicar: boolean
          regra: Json
          serie_id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          evento_modelo: Json
          id?: string
          inicio_aplicacao: string
          motivo?: string | null
          numero: number
          organization_id: string
          publicar: boolean
          regra: Json
          serie_id: string
          timezone: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evento_modelo?: Json
          id?: string
          inicio_aplicacao?: string
          motivo?: string | null
          numero?: number
          organization_id?: string
          publicar?: boolean
          regra?: Json
          serie_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_serie_versoes_organization_id_serie_id_fkey"
            columns: ["organization_id", "serie_id"]
            isOneToOne: false
            referencedRelation: "agenda_series"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      agenda_series: {
        Row: {
          cancelamento_corte: string | null
          created_at: string
          created_by: string
          estado: string
          id: string
          materializacao_pendente: boolean
          materializado_ate: string | null
          organization_id: string
          ultima_falha_codigo: string | null
          ultima_tentativa: string | null
          updated_at: string
          versao_atual_id: string | null
          version: number
        }
        Insert: {
          cancelamento_corte?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          materializacao_pendente?: boolean
          materializado_ate?: string | null
          organization_id: string
          ultima_falha_codigo?: string | null
          ultima_tentativa?: string | null
          updated_at?: string
          versao_atual_id?: string | null
          version?: number
        }
        Update: {
          cancelamento_corte?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          materializacao_pendente?: boolean
          materializado_ate?: string | null
          organization_id?: string
          ultima_falha_codigo?: string | null
          ultima_tentativa?: string | null
          updated_at?: string
          versao_atual_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_serie_atual"
            columns: ["organization_id", "id", "versao_atual_id"]
            isOneToOne: false
            referencedRelation: "agenda_serie_versoes"
            referencedColumns: ["organization_id", "serie_id", "id"]
          },
          {
            foreignKeyName: "agenda_series_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      almoxarifados: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string
          descricao: string
          id: string
          nome: string
          organization_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome: string
          organization_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome?: string
          organization_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "almoxarifados_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          acao_id: string | null
          agenda_evento_id: string | null
          calibracao_id: string | null
          caminho: string
          confirmado_em: string | null
          created_at: string
          created_by: string
          estado: string
          ferramenta_id: string | null
          id: string
          mime: string
          nome: string
          organization_id: string
          pessoa_id: string | null
          pet_id: string | null
          pet_item: string | null
          qualificacao_id: string | null
          sha256: string
          tamanho: number
        }
        Insert: {
          acao_id?: string | null
          agenda_evento_id?: string | null
          calibracao_id?: string | null
          caminho: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          ferramenta_id?: string | null
          id?: string
          mime: string
          nome: string
          organization_id: string
          pessoa_id?: string | null
          pet_id?: string | null
          pet_item?: string | null
          qualificacao_id?: string | null
          sha256: string
          tamanho: number
        }
        Update: {
          acao_id?: string | null
          agenda_evento_id?: string | null
          calibracao_id?: string | null
          caminho?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          ferramenta_id?: string | null
          id?: string
          mime?: string
          nome?: string
          organization_id?: string
          pessoa_id?: string | null
          pet_id?: string | null
          pet_item?: string | null
          qualificacao_id?: string | null
          sha256?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "anexo_agenda_tenant"
            columns: ["organization_id", "agenda_evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexo_calibracao_tenant"
            columns: ["organization_id", "calibracao_id"]
            isOneToOne: false
            referencedRelation: "ferramenta_calibracoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexo_ferramenta_tenant"
            columns: ["organization_id", "ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexo_pet_tenant"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexos_organization_id_acao_id_fkey"
            columns: ["organization_id", "acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "anexos_organization_id_qualificacao_id_fkey"
            columns: ["organization_id", "qualificacao_id"]
            isOneToOne: false
            referencedRelation: "pessoa_qualificacoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      apontamentos: {
        Row: {
          apontado_em: string
          chave: string | null
          created_at: string
          created_by: string | null
          estorno_de: string | null
          id: string
          item_id: string
          organization_id: string
          quantidade: number
          sinal: number
        }
        Insert: {
          apontado_em?: string
          chave?: string | null
          created_at?: string
          created_by?: string | null
          estorno_de?: string | null
          id?: string
          item_id: string
          organization_id: string
          quantidade: number
          sinal?: number
        }
        Update: {
          apontado_em?: string
          chave?: string | null
          created_at?: string
          created_by?: string | null
          estorno_de?: string | null
          id?: string
          item_id?: string
          organization_id?: string
          quantidade?: number
          sinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "apontamentos_estorno_de_fkey"
            columns: ["estorno_de"]
            isOneToOne: false
            referencedRelation: "apontamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamentos_item_id_fkey"
            columns: ["organization_id", "item_id"]
            isOneToOne: false
            referencedRelation: "ordem_producao_itens"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "apontamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aprovacoes: {
        Row: {
          autor: string
          created_at: string
          hash_conteudo: string
          id: string
          invalidada_em: string | null
          observacao: string | null
          organization_id: string
          revisao_id: string
          tipo: string
        }
        Insert: {
          autor: string
          created_at?: string
          hash_conteudo: string
          id?: string
          invalidada_em?: string | null
          observacao?: string | null
          organization_id: string
          revisao_id: string
          tipo: string
        }
        Update: {
          autor?: string
          created_at?: string
          hash_conteudo?: string
          id?: string
          invalidada_em?: string | null
          observacao?: string | null
          organization_id?: string
          revisao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      aquisicoes: {
        Row: {
          chave: string
          created_at: string
          created_by: string | null
          custo_total: number | null
          custo_unitario: number | null
          documento_id: string | null
          id: string
          lote: string | null
          organization_id: string
          origem: Json | null
          parcelas: Json
          pendencia: string | null
          politica_versao: string | null
          produto_id: string
          quantidade: number
          situacao: string
          unidade: string
          valores_calculados: Json | null
        }
        Insert: {
          chave: string
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          documento_id?: string | null
          id?: string
          lote?: string | null
          organization_id: string
          origem?: Json | null
          parcelas?: Json
          pendencia?: string | null
          politica_versao?: string | null
          produto_id: string
          quantidade: number
          situacao: string
          unidade: string
          valores_calculados?: Json | null
        }
        Update: {
          chave?: string
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          documento_id?: string | null
          id?: string
          lote?: string | null
          organization_id?: string
          origem?: Json | null
          parcelas?: Json
          pendencia?: string | null
          politica_versao?: string | null
          produto_id?: string
          quantidade?: number
          situacao?: string
          unidade?: string
          valores_calculados?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "aquisicoes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_fiscais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquisicoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquisicoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          autor: string | null
          created_at: string
          dados: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          motivo: string | null
          organization_id: string
        }
        Insert: {
          acao: string
          autor?: string | null
          created_at?: string
          dados?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          organization_id: string
        }
        Update: {
          acao?: string
          autor?: string | null
          created_at?: string
          dados?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          motivo?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calculo_execucoes: {
        Row: {
          created_at: string
          created_by: string | null
          entradas: Json
          id: string
          motor_versao: string
          organization_id: string
          regras_id: string | null
          resultado: Json
          revisao_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entradas: Json
          id?: string
          motor_versao: string
          organization_id: string
          regras_id?: string | null
          resultado: Json
          revisao_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entradas?: Json
          id?: string
          motor_versao?: string
          organization_id?: string
          regras_id?: string | null
          resultado?: Json
          revisao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculo_execucoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculo_execucoes_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_historico: {
        Row: {
          antes: Json | null
          autor: string | null
          cliente_id: string
          contato_id: string | null
          created_at: string
          depois: Json
          id: number
          motivo: string | null
          operacao: string
          organization_id: string
          unidade_id: string | null
          versao: number
        }
        Insert: {
          antes?: Json | null
          autor?: string | null
          cliente_id: string
          contato_id?: string | null
          created_at?: string
          depois: Json
          id?: never
          motivo?: string | null
          operacao: string
          organization_id: string
          unidade_id?: string | null
          versao: number
        }
        Update: {
          antes?: Json | null
          autor?: string | null
          cliente_id?: string
          contato_id?: string | null
          created_at?: string
          depois?: Json
          id?: never
          motivo?: string | null
          operacao?: string
          organization_id?: string
          unidade_id?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "cliente_historico_organization_id_cliente_id_fkey"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cliente_historico_organization_id_contato_id_fkey"
            columns: ["organization_id", "contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "cliente_historico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_historico_organization_id_unidade_id_fkey"
            columns: ["organization_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      clientes: {
        Row: {
          arquivado_em: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          identificador_normalizado: string | null
          marca: Json | null
          motivo_arquivo: string | null
          nome_exibicao: string | null
          observacoes: string | null
          organization_id: string
          razao_social: string
          situacao: string
          uf: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          identificador_normalizado?: string | null
          marca?: Json | null
          motivo_arquivo?: string | null
          nome_exibicao?: string | null
          observacoes?: string | null
          organization_id: string
          razao_social: string
          situacao?: string
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          identificador_normalizado?: string | null
          marca?: Json | null
          motivo_arquivo?: string | null
          nome_exibicao?: string | null
          observacoes?: string | null
          organization_id?: string
          razao_social?: string
          situacao?: string
          uf?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clientes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      codigo_equivalencias: {
        Row: {
          autor: string | null
          codigo_anterior: string
          codigo_novo: string
          created_at: string
          id: string
          motivo: string
          organization_id: string
          produto_id: string
        }
        Insert: {
          autor?: string | null
          codigo_anterior: string
          codigo_novo: string
          created_at?: string
          id?: string
          motivo: string
          organization_id: string
          produto_id: string
        }
        Update: {
          autor?: string | null
          codigo_anterior?: string
          codigo_novo?: string
          created_at?: string
          id?: string
          motivo?: string
          organization_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigo_equivalencias_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigo_equivalencias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      competencias: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string
          descricao: string | null
          exige_evidencia: boolean
          exige_validade: boolean
          id: string
          nome: string
          organization_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          descricao?: string | null
          exige_evidencia?: boolean
          exige_validade?: boolean
          id?: string
          nome: string
          organization_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          descricao?: string | null
          exige_evidencia?: boolean
          exige_validade?: boolean
          id?: string
          nome?: string
          organization_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "competencias_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      config_orcamento: {
        Row: {
          organization_id: string
          parametros: Json
          proximo_numero: number
          updated_at: string
        }
        Insert: {
          organization_id: string
          parametros?: Json
          proximo_numero?: number
          updated_at?: string
        }
        Update: {
          organization_id?: string
          parametros?: Json
          proximo_numero?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_orcamento_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          arquivado_em: string | null
          cargo: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          motivo_arquivo: string | null
          nome: string
          observacoes: string | null
          organization_id: string
          telefone: string | null
          unidade_id: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cargo?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          motivo_arquivo?: string | null
          nome: string
          observacoes?: string | null
          organization_id: string
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cargo?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          motivo_arquivo?: string | null
          nome?: string
          observacoes?: string | null
          organization_id?: string
          telefone?: string | null
          unidade_id?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_cliente_tenant_operacional"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "contatos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contatos_unidade_cliente_operacional"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
        ]
      }
      demandas: {
        Row: {
          anterior: Json | null
          created_at: string
          hash_tecnico: string | null
          id: string
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id: string
          origem: Json | null
          quantidade_necessaria: number
          quantidade_planejada: number
          quantidade_tecnica: number | null
          revisao_componente_id: string
          revisao_id: string
          status: string
        }
        Insert: {
          anterior?: Json | null
          created_at?: string
          hash_tecnico?: string | null
          id?: string
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id: string
          origem?: Json | null
          quantidade_necessaria: number
          quantidade_planejada: number
          quantidade_tecnica?: number | null
          revisao_componente_id: string
          revisao_id: string
          status?: string
        }
        Update: {
          anterior?: Json | null
          created_at?: string
          hash_tecnico?: string | null
          id?: string
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id?: string
          origem?: Json | null
          quantidade_necessaria?: number
          quantidade_planejada?: number
          quantidade_tecnica?: number | null
          revisao_componente_id?: string
          revisao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "demandas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_revisao_componente_id_fkey"
            columns: ["revisao_componente_id"]
            isOneToOne: false
            referencedRelation: "revisao_componentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandas_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          emitido_em: string
          emitido_por: string | null
          id: string
          interno: boolean
          organization_id: string
          revisao_id: string | null
          snapshot: Json
          tipo: string
          versao: number
        }
        Insert: {
          emitido_em?: string
          emitido_por?: string | null
          id?: string
          interno?: boolean
          organization_id: string
          revisao_id?: string | null
          snapshot: Json
          tipo: string
          versao?: number
        }
        Update: {
          emitido_em?: string
          emitido_por?: string | null
          id?: string
          interno?: boolean
          organization_id?: string
          revisao_id?: string | null
          snapshot?: Json
          tipo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "documentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscais: {
        Row: {
          chave_acesso: string | null
          created_at: string
          emitido_em: string | null
          fornecedor_id: string | null
          fornecedor_texto: string | null
          id: string
          numero: string
          observacao: string | null
          organization_id: string
          origem: Json | null
          provisorio: boolean
          serie: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          emitido_em?: string | null
          fornecedor_id?: string | null
          fornecedor_texto?: string | null
          id?: string
          numero: string
          observacao?: string | null
          organization_id: string
          origem?: Json | null
          provisorio?: boolean
          serie?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          emitido_em?: string | null
          fornecedor_id?: string | null
          fornecedor_texto?: string | null
          id?: string
          numero?: string
          observacao?: string | null
          organization_id?: string
          origem?: Json | null
          provisorio?: boolean
          serie?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_fiscais_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_membros: {
        Row: {
          created_at: string
          created_by: string
          equipe_id: string
          fim: string | null
          id: string
          inicio: string
          organization_id: string
          pessoa_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          equipe_id: string
          fim?: string | null
          id?: string
          inicio: string
          organization_id: string
          pessoa_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          equipe_id?: string
          fim?: string | null
          id?: string
          inicio?: string
          organization_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_membros_organization_id_equipe_id_fkey"
            columns: ["organization_id", "equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "equipe_membros_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      equipes: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string
          id: string
          lider_id: string | null
          nome: string
          organization_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          id?: string
          lider_id?: string | null
          nome: string
          organization_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          id?: string
          lider_id?: string | null
          nome?: string
          organization_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_organization_id_lider_id_fkey"
            columns: ["organization_id", "lider_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      est_metodo_versoes: {
        Row: {
          created_at: string
          created_by: string
          fontes: Json
          id: string
          instrucoes: string
          metodo_id: string
          nome: string
          numero: number
          organization_id: string
          registro_profissional: string
          requisitos: Json
          responsavel_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          fontes: Json
          id?: string
          instrucoes: string
          metodo_id: string
          nome: string
          numero: number
          organization_id: string
          registro_profissional: string
          requisitos: Json
          responsavel_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fontes?: Json
          id?: string
          instrucoes?: string
          metodo_id?: string
          nome?: string
          numero?: number
          organization_id?: string
          registro_profissional?: string
          requisitos?: Json
          responsavel_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "est_metodo_versoes_organization_id_metodo_id_fkey"
            columns: ["organization_id", "metodo_id"]
            isOneToOne: false
            referencedRelation: "est_metodos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "est_metodo_versoes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      est_metodos: {
        Row: {
          created_at: string
          created_by: string
          descricao: string
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "est_metodos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_conferencias: {
        Row: {
          aceita: number
          apontamento_id: string | null
          created_at: string
          created_by: string
          fator: number
          id: string
          inventario_id: string | null
          local_id: string
          lote: string | null
          motivo: string | null
          organization_id: string
          produto_id: string
          quantidade: number
          quarentena: number
          recebimento_id: string | null
          reconciliacao: string | null
          rejeitada: number
          serie: string | null
          unidade_origem: string
        }
        Insert: {
          aceita: number
          apontamento_id?: string | null
          created_at?: string
          created_by?: string
          fator: number
          id?: string
          inventario_id?: string | null
          local_id: string
          lote?: string | null
          motivo?: string | null
          organization_id: string
          produto_id: string
          quantidade: number
          quarentena: number
          recebimento_id?: string | null
          reconciliacao?: string | null
          rejeitada: number
          serie?: string | null
          unidade_origem: string
        }
        Update: {
          aceita?: number
          apontamento_id?: string | null
          created_at?: string
          created_by?: string
          fator?: number
          id?: string
          inventario_id?: string | null
          local_id?: string
          lote?: string | null
          motivo?: string | null
          organization_id?: string
          produto_id?: string
          quantidade?: number
          quarentena?: number
          recebimento_id?: string | null
          reconciliacao?: string | null
          rejeitada?: number
          serie?: string | null
          unidade_origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_conferencias_organization_id_apontamento_id_fkey"
            columns: ["organization_id", "apontamento_id"]
            isOneToOne: false
            referencedRelation: "apontamentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_inventario_id_fkey"
            columns: ["organization_id", "inventario_id"]
            isOneToOne: false
            referencedRelation: "estoque_inventarios"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_local_id_fkey"
            columns: ["organization_id", "local_id"]
            isOneToOne: false
            referencedRelation: "almoxarifados"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_produto_id_fkey"
            columns: ["organization_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_conferencias_organization_id_recebimento_id_fkey"
            columns: ["organization_id", "recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estoque_estorno_alocacoes: {
        Row: {
          conferencia_id: string
          id: string
          operacao_id: string
          organization_id: string
          quantidade: number
        }
        Insert: {
          conferencia_id: string
          id?: string
          operacao_id: string
          organization_id: string
          quantidade: number
        }
        Update: {
          conferencia_id?: string
          id?: string
          operacao_id?: string
          organization_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_estorno_alocacoes_organization_id_conferencia_id_fkey"
            columns: ["organization_id", "conferencia_id"]
            isOneToOne: false
            referencedRelation: "estoque_conferencias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_estorno_alocacoes_organization_id_operacao_id_fkey"
            columns: ["organization_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "estoque_operacoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estoque_inventarios: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          baseline: number
          contada: number
          created_at: string
          created_by: string
          estado: string
          id: string
          ledger_id: number
          local_id: string
          lote: string | null
          motivo: string
          organization_id: string
          produto_id: string
          updated_at: string
          version: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          baseline: number
          contada: number
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          ledger_id: number
          local_id: string
          lote?: string | null
          motivo: string
          organization_id: string
          produto_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          baseline?: number
          contada?: number
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          ledger_id?: number
          local_id?: string
          lote?: string | null
          motivo?: string
          organization_id?: string
          produto_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_inventarios_organization_id_local_id_fkey"
            columns: ["organization_id", "local_id"]
            isOneToOne: false
            referencedRelation: "almoxarifados"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_inventarios_organization_id_produto_id_fkey"
            columns: ["organization_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          conferencia_id: string
          created_at: string
          created_by: string
          id: string
          local_id: string | null
          operacao_id: string
          organization_id: string
          pessoa_id: string | null
          posicao: string
          produto_id: string
          quantidade: number
          reserva_id: string | null
          seq: number
        }
        Insert: {
          conferencia_id: string
          created_at?: string
          created_by?: string
          id?: string
          local_id?: string | null
          operacao_id: string
          organization_id: string
          pessoa_id?: string | null
          posicao: string
          produto_id: string
          quantidade: number
          reserva_id?: string | null
          seq?: never
        }
        Update: {
          conferencia_id?: string
          created_at?: string
          created_by?: string
          id?: string
          local_id?: string | null
          operacao_id?: string
          organization_id?: string
          pessoa_id?: string | null
          posicao?: string
          produto_id?: string
          quantidade?: number
          reserva_id?: string | null
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_organization_id_local_id_fkey"
            columns: ["organization_id", "local_id"]
            isOneToOne: false
            referencedRelation: "almoxarifados"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_operacao_id_fkey"
            columns: ["organization_id", "operacao_id"]
            isOneToOne: false
            referencedRelation: "estoque_operacoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_produto_id_conferencia__fkey"
            columns: ["organization_id", "produto_id", "conferencia_id"]
            isOneToOne: false
            referencedRelation: "estoque_conferencias"
            referencedColumns: ["organization_id", "produto_id", "id"]
          },
          {
            foreignKeyName: "estoque_movimentos_organization_id_produto_id_reserva_id_fkey"
            columns: ["organization_id", "produto_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["organization_id", "produto_id", "id"]
          },
        ]
      }
      estoque_operacoes: {
        Row: {
          apontamento_estorno_id: string | null
          conferencia_id: string | null
          created_at: string
          created_by: string
          id: string
          inventario_id: string | null
          motivo: string | null
          organization_id: string
          recebimento_estorno_id: string | null
          reserva_id: string | null
          tipo: string
        }
        Insert: {
          apontamento_estorno_id?: string | null
          conferencia_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          inventario_id?: string | null
          motivo?: string | null
          organization_id: string
          recebimento_estorno_id?: string | null
          reserva_id?: string | null
          tipo: string
        }
        Update: {
          apontamento_estorno_id?: string | null
          conferencia_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          inventario_id?: string | null
          motivo?: string | null
          organization_id?: string
          recebimento_estorno_id?: string | null
          reserva_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_operacoes_organization_id_apontamento_estorno_id_fkey"
            columns: ["organization_id", "apontamento_estorno_id"]
            isOneToOne: false
            referencedRelation: "apontamentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_conferencia_id_fkey"
            columns: ["organization_id", "conferencia_id"]
            isOneToOne: false
            referencedRelation: "estoque_conferencias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_inventario_id_fkey"
            columns: ["organization_id", "inventario_id"]
            isOneToOne: false
            referencedRelation: "estoque_inventarios"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_recebimento_estorno_id_fkey"
            columns: ["organization_id", "recebimento_estorno_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_operacoes_organization_id_reserva_id_fkey"
            columns: ["organization_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estoque_produto_politicas: {
        Row: {
          created_at: string
          created_by: string
          estoque_minimo: number
          exige_lote: boolean
          exige_serie: boolean
          id: string
          organization_id: string
          produto_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          estoque_minimo?: number
          exige_lote?: boolean
          exige_serie?: boolean
          id?: string
          organization_id: string
          produto_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          estoque_minimo?: number
          exige_lote?: boolean
          exige_serie?: boolean
          id?: string
          organization_id?: string
          produto_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_politicas_organization_id_produto_id_fkey"
            columns: ["organization_id", "produto_id"]
            isOneToOne: true
            referencedRelation: "produtos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estoque_reserva_itens: {
        Row: {
          conferencia_id: string
          id: string
          organization_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Insert: {
          conferencia_id: string
          id?: string
          organization_id: string
          produto_id: string
          quantidade: number
          reserva_id: string
        }
        Update: {
          conferencia_id?: string
          id?: string
          organization_id?: string
          produto_id?: string
          quantidade?: number
          reserva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_reserva_itens_organization_id_produto_id_conferenc_fkey"
            columns: ["organization_id", "produto_id", "conferencia_id"]
            isOneToOne: false
            referencedRelation: "estoque_conferencias"
            referencedColumns: ["organization_id", "produto_id", "id"]
          },
          {
            foreignKeyName: "estoque_reserva_itens_organization_id_produto_id_reserva_i_fkey"
            columns: ["organization_id", "produto_id", "reserva_id"]
            isOneToOne: false
            referencedRelation: "estoque_reservas"
            referencedColumns: ["organization_id", "produto_id", "id"]
          },
        ]
      }
      estoque_reservas: {
        Row: {
          created_at: string
          created_by: string
          estado: string
          id: string
          local_id: string
          lote: string | null
          motivo: string | null
          op_id: string | null
          organization_id: string
          pessoa_id: string
          produto_id: string
          projeto_id: string | null
          quantidade: number
          updated_at: string
          validade: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          local_id: string
          lote?: string | null
          motivo?: string | null
          op_id?: string | null
          organization_id: string
          pessoa_id: string
          produto_id: string
          projeto_id?: string | null
          quantidade: number
          updated_at?: string
          validade: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          local_id?: string
          lote?: string | null
          motivo?: string | null
          op_id?: string | null
          organization_id?: string
          pessoa_id?: string
          produto_id?: string
          projeto_id?: string | null
          quantidade?: number
          updated_at?: string
          validade?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_reservas_organization_id_local_id_fkey"
            columns: ["organization_id", "local_id"]
            isOneToOne: false
            referencedRelation: "almoxarifados"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_op_id_fkey"
            columns: ["organization_id", "op_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_produto_id_fkey"
            columns: ["organization_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estoque_reservas_organization_id_projeto_id_fkey"
            columns: ["organization_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_arquivos: {
        Row: {
          caminho: string
          confirmado_em: string | null
          created_at: string
          created_by: string
          estado: string
          estudo_id: string
          id: string
          mime: string
          motivo: string | null
          nome: string
          organization_id: string
          perigo_id: string | null
          revisao_id: string
          sha256: string
          tamanho: number
        }
        Insert: {
          caminho: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          estudo_id: string
          id?: string
          mime: string
          motivo?: string | null
          nome: string
          organization_id: string
          perigo_id?: string | null
          revisao_id: string
          sha256: string
          tamanho: number
        }
        Update: {
          caminho?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          estudo_id?: string
          id?: string
          mime?: string
          motivo?: string | null
          nome?: string
          organization_id?: string
          perigo_id?: string | null
          revisao_id?: string
          sha256?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "estudo_arquivos_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_arquivos_organization_id_estudo_id_revisao_id_perig_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id", "perigo_id"]
            isOneToOne: false
            referencedRelation: "estudo_perigos"
            referencedColumns: [
              "organization_id",
              "estudo_id",
              "revisao_id",
              "id",
            ]
          },
        ]
      }
      estudo_decisoes: {
        Row: {
          autor: string
          created_at: string
          decisao: string
          estudo_id: string
          id: number
          motivo: string
          organization_id: string
          pessoa_id: string | null
          registro_profissional: string | null
          responsabilidade_tecnica: string
          revisao_id: string
          submissao_id: string | null
        }
        Insert: {
          autor?: string
          created_at?: string
          decisao: string
          estudo_id: string
          id?: never
          motivo: string
          organization_id: string
          pessoa_id?: string | null
          registro_profissional?: string | null
          responsabilidade_tecnica?: string
          revisao_id: string
          submissao_id?: string | null
        }
        Update: {
          autor?: string
          created_at?: string
          decisao?: string
          estudo_id?: string
          id?: never
          motivo?: string
          organization_id?: string
          pessoa_id?: string | null
          registro_profissional?: string | null
          responsabilidade_tecnica?: string
          revisao_id?: string
          submissao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estudo_decisoes_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_decisoes_organization_id_estudo_id_revisao_id_submi_fkey"
            columns: [
              "organization_id",
              "estudo_id",
              "revisao_id",
              "submissao_id",
            ]
            isOneToOne: false
            referencedRelation: "estudo_submissoes"
            referencedColumns: [
              "organization_id",
              "estudo_id",
              "revisao_id",
              "id",
            ]
          },
          {
            foreignKeyName: "estudo_decisoes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_eventos: {
        Row: {
          autor: string
          comando: string
          created_at: string
          estudo_id: string
          id: number
          motivo: string | null
          organization_id: string
          revisao_id: string | null
        }
        Insert: {
          autor?: string
          comando: string
          created_at?: string
          estudo_id: string
          id?: never
          motivo?: string | null
          organization_id: string
          revisao_id?: string | null
        }
        Update: {
          autor?: string
          comando?: string
          created_at?: string
          estudo_id?: string
          id?: never
          motivo?: string | null
          organization_id?: string
          revisao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estudo_eventos_organization_id_estudo_id_fkey"
            columns: ["organization_id", "estudo_id"]
            isOneToOne: false
            referencedRelation: "estudos_tecnicos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_eventos_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
        ]
      }
      estudo_fontes: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string
          desativada_motivo: string | null
          documento_id: string | null
          estudo_id: string
          id: string
          justificativa: string
          levantamento_id: string | null
          levantamento_revisao_id: string | null
          numero: number | null
          organization_id: string
          pe_projeto_id: string | null
          pe_versao_id: string | null
          revisao_id: string
          sha256: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          desativada_motivo?: string | null
          documento_id?: string | null
          estudo_id: string
          id?: string
          justificativa: string
          levantamento_id?: string | null
          levantamento_revisao_id?: string | null
          numero?: number | null
          organization_id: string
          pe_projeto_id?: string | null
          pe_versao_id?: string | null
          revisao_id: string
          sha256?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          desativada_motivo?: string | null
          documento_id?: string | null
          estudo_id?: string
          id?: string
          justificativa?: string
          levantamento_id?: string | null
          levantamento_revisao_id?: string | null
          numero?: number | null
          organization_id?: string
          pe_projeto_id?: string | null
          pe_versao_id?: string | null
          revisao_id?: string
          sha256?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estudo_fontes_organization_id_documento_id_fkey"
            columns: ["organization_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_levantamento_id_levantamento_fkey"
            columns: [
              "organization_id",
              "levantamento_id",
              "levantamento_revisao_id",
            ]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
          {
            foreignKeyName: "estudo_fontes_organization_id_pe_projeto_id_pe_versao_id_fkey"
            columns: ["organization_id", "pe_projeto_id", "pe_versao_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      estudo_medida_linhagens: {
        Row: {
          acao_id: string | null
          acao_request_hash: string | null
          created_at: string
          created_by: string
          estudo_id: string
          id: string
          organization_id: string
        }
        Insert: {
          acao_id?: string | null
          acao_request_hash?: string | null
          created_at?: string
          created_by?: string
          estudo_id: string
          id?: string
          organization_id: string
        }
        Update: {
          acao_id?: string | null
          acao_request_hash?: string | null
          created_at?: string
          created_by?: string
          estudo_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estudo_medida_linhagens_organization_id_acao_id_fkey"
            columns: ["organization_id", "acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_medida_linhagens_organization_id_estudo_id_fkey"
            columns: ["organization_id", "estudo_id"]
            isOneToOne: false
            referencedRelation: "estudos_tecnicos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_medidas: {
        Row: {
          base_id: string | null
          created_at: string
          created_by: string
          descricao: string
          estudo_id: string
          exige_acao: boolean
          fundamento: string
          id: string
          linhagem_id: string
          organization_id: string
          perigo_id: string
          prazo: string | null
          prioridade: string
          responsavel_id: string | null
          revisao_id: string
          updated_at: string
          version: number
        }
        Insert: {
          base_id?: string | null
          created_at?: string
          created_by?: string
          descricao?: string
          estudo_id: string
          exige_acao?: boolean
          fundamento?: string
          id?: string
          linhagem_id: string
          organization_id: string
          perigo_id: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          revisao_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_id?: string | null
          created_at?: string
          created_by?: string
          descricao?: string
          estudo_id?: string
          exige_acao?: boolean
          fundamento?: string
          id?: string
          linhagem_id?: string
          organization_id?: string
          perigo_id?: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          revisao_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_base_id_fkey"
            columns: ["organization_id", "estudo_id", "base_id"]
            isOneToOne: false
            referencedRelation: "estudo_medidas"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_linhagem_id_fkey"
            columns: ["organization_id", "estudo_id", "linhagem_id"]
            isOneToOne: false
            referencedRelation: "estudo_medida_linhagens"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_estudo_id_revisao_id_perigo_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id", "perigo_id"]
            isOneToOne: false
            referencedRelation: "estudo_perigos"
            referencedColumns: [
              "organization_id",
              "estudo_id",
              "revisao_id",
              "id",
            ]
          },
          {
            foreignKeyName: "estudo_medidas_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_perigos: {
        Row: {
          avaliacao: string
          base_id: string | null
          codigo: string
          created_at: string
          created_by: string
          critico: boolean
          descricao: string
          estudo_id: string
          exposicao: string
          id: string
          local: string
          organization_id: string
          revisao_id: string
          updated_at: string
          version: number
        }
        Insert: {
          avaliacao?: string
          base_id?: string | null
          codigo: string
          created_at?: string
          created_by?: string
          critico?: boolean
          descricao?: string
          estudo_id: string
          exposicao?: string
          id?: string
          local?: string
          organization_id: string
          revisao_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          avaliacao?: string
          base_id?: string | null
          codigo?: string
          created_at?: string
          created_by?: string
          critico?: boolean
          descricao?: string
          estudo_id?: string
          exposicao?: string
          id?: string
          local?: string
          organization_id?: string
          revisao_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "estudo_perigos_organization_id_estudo_id_base_id_fkey"
            columns: ["organization_id", "estudo_id", "base_id"]
            isOneToOne: false
            referencedRelation: "estudo_perigos"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_perigos_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
        ]
      }
      estudo_revisoes: {
        Row: {
          analise: string
          aprovado_em: string | null
          aprovado_por: string | null
          art_referencia: string
          base_id: string | null
          conclusao: string
          created_at: string
          created_by: string
          escopo: string
          estado: string
          estudo_id: string
          id: string
          metodo_versao_id: string | null
          numero: number
          organization_id: string
          premissas: string
          responsabilidade_tecnica: string
          responsavel_tecnico_id: string
          revisor_id: string | null
          snapshot: Json | null
          snapshot_sha256: string | null
          submissao_atual_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          analise?: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          art_referencia?: string
          base_id?: string | null
          conclusao?: string
          created_at?: string
          created_by?: string
          escopo?: string
          estado?: string
          estudo_id: string
          id?: string
          metodo_versao_id?: string | null
          numero: number
          organization_id: string
          premissas?: string
          responsabilidade_tecnica?: string
          responsavel_tecnico_id: string
          revisor_id?: string | null
          snapshot?: Json | null
          snapshot_sha256?: string | null
          submissao_atual_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          analise?: string
          aprovado_em?: string | null
          aprovado_por?: string | null
          art_referencia?: string
          base_id?: string | null
          conclusao?: string
          created_at?: string
          created_by?: string
          escopo?: string
          estado?: string
          estudo_id?: string
          id?: string
          metodo_versao_id?: string | null
          numero?: number
          organization_id?: string
          premissas?: string
          responsabilidade_tecnica?: string
          responsavel_tecnico_id?: string
          revisor_id?: string | null
          snapshot?: Json | null
          snapshot_sha256?: string | null
          submissao_atual_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "est_submissao_fk"
            columns: [
              "organization_id",
              "estudo_id",
              "id",
              "submissao_atual_id",
            ]
            isOneToOne: false
            referencedRelation: "estudo_submissoes"
            referencedColumns: [
              "organization_id",
              "estudo_id",
              "revisao_id",
              "id",
            ]
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_estudo_id_base_id_fkey"
            columns: ["organization_id", "estudo_id", "base_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_estudo_id_fkey"
            columns: ["organization_id", "estudo_id"]
            isOneToOne: false
            referencedRelation: "estudos_tecnicos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_metodo_versao_id_fkey"
            columns: ["organization_id", "metodo_versao_id"]
            isOneToOne: false
            referencedRelation: "est_metodo_versoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_responsavel_tecnico_id_fkey"
            columns: ["organization_id", "responsavel_tecnico_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "estudo_revisoes_organization_id_revisor_id_fkey"
            columns: ["organization_id", "revisor_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_submissoes: {
        Row: {
          autor: string
          created_at: string
          estudo_id: string
          id: string
          numero: number
          organization_id: string
          pessoa_id: string
          registro_profissional: string
          revisao_id: string
          sha256: string
          snapshot: Json
        }
        Insert: {
          autor?: string
          created_at?: string
          estudo_id: string
          id?: string
          numero: number
          organization_id: string
          pessoa_id: string
          registro_profissional: string
          revisao_id: string
          sha256: string
          snapshot: Json
        }
        Update: {
          autor?: string
          created_at?: string
          estudo_id?: string
          id?: string
          numero?: number
          organization_id?: string
          pessoa_id?: string
          registro_profissional?: string
          revisao_id?: string
          sha256?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "estudo_submissoes_organization_id_estudo_id_revisao_id_fkey"
            columns: ["organization_id", "estudo_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_submissoes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      estudo_substituicoes: {
        Row: {
          anterior_id: string
          atual_id: string
          autor: string
          created_at: string
          estudo_id: string
          organization_id: string
        }
        Insert: {
          anterior_id: string
          atual_id: string
          autor?: string
          created_at?: string
          estudo_id: string
          organization_id: string
        }
        Update: {
          anterior_id?: string
          atual_id?: string
          autor?: string
          created_at?: string
          estudo_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estudo_substituicoes_organization_id_estudo_id_anterior_id_fkey"
            columns: ["organization_id", "estudo_id", "anterior_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudo_substituicoes_organization_id_estudo_id_atual_id_fkey"
            columns: ["organization_id", "estudo_id", "atual_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
        ]
      }
      estudos_tecnicos: {
        Row: {
          aprovada_id: string | null
          cliente_id: string
          codigo: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          projeto_id: string | null
          responsavel_id: string
          revisao_atual_id: string | null
          tipo: string
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
          visibilidade: string
        }
        Insert: {
          aprovada_id?: string | null
          cliente_id: string
          codigo: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id: string
          projeto_id?: string | null
          responsavel_id: string
          revisao_atual_id?: string | null
          tipo: string
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
          visibilidade?: string
        }
        Update: {
          aprovada_id?: string | null
          cliente_id?: string
          codigo?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          projeto_id?: string | null
          responsavel_id?: string
          revisao_atual_id?: string | null
          tipo?: string
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "est_aprovada_fk"
            columns: ["organization_id", "id", "aprovada_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "est_atual_fk"
            columns: ["organization_id", "id", "revisao_atual_id"]
            isOneToOne: false
            referencedRelation: "estudo_revisoes"
            referencedColumns: ["organization_id", "estudo_id", "id"]
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_cliente_id_projeto_id_fkey"
            columns: ["organization_id", "cliente_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estudos_tecnicos_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      fabricantes: {
        Row: {
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          id?: string
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fabricantes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      familias_codigo: {
        Row: {
          grupo: string
          nome: string
          observacao: string | null
          ordem: number
          sigla: string
          situacao: string
        }
        Insert: {
          grupo: string
          nome: string
          observacao?: string | null
          ordem?: number
          sigla: string
          situacao?: string
        }
        Update: {
          grupo?: string
          nome?: string
          observacao?: string | null
          ordem?: number
          sigla?: string
          situacao?: string
        }
        Relationships: []
      }
      ferramenta_calibracao_politicas: {
        Row: {
          created_at: string
          created_by: string
          exige_validade: boolean
          fonte: string
          id: string
          metodo: string
          nome: string
          numero: number
          organization_id: string
          profissional_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          exige_validade: boolean
          fonte: string
          id?: string
          metodo: string
          nome: string
          numero: number
          organization_id: string
          profissional_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          exige_validade?: boolean
          fonte?: string
          id?: string
          metodo?: string
          nome?: string
          numero?: number
          organization_id?: string
          profissional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferramenta_calibracao_politic_organization_id_profissional_fkey"
            columns: ["organization_id", "profissional_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramenta_calibracao_politicas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramenta_calibracoes: {
        Row: {
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          created_by: string
          emissor: string
          estado: string
          execucao: string
          ferramenta_id: string
          id: string
          motivo: string | null
          organization_id: string
          politica_id: string
          referencia: string | null
          updated_at: string
          validade: string | null
          version: number
        }
        Insert: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by?: string
          emissor: string
          estado?: string
          execucao: string
          ferramenta_id: string
          id?: string
          motivo?: string | null
          organization_id: string
          politica_id: string
          referencia?: string | null
          updated_at?: string
          validade?: string | null
          version?: number
        }
        Update: {
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by?: string
          emissor?: string
          estado?: string
          execucao?: string
          ferramenta_id?: string
          id?: string
          motivo?: string | null
          organization_id?: string
          politica_id?: string
          referencia?: string | null
          updated_at?: string
          validade?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ferramenta_calibracoes_organization_id_ferramenta_id_fkey"
            columns: ["organization_id", "ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramenta_calibracoes_organization_id_politica_id_fkey"
            columns: ["organization_id", "politica_id"]
            isOneToOne: false
            referencedRelation: "ferramenta_calibracao_politicas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      ferramenta_custodias: {
        Row: {
          agenda_evento_id: string | null
          condicao_devolucao: string | null
          created_at: string
          created_by: string
          devolvida_em: string | null
          estado: string
          ferramenta_id: string
          fim: string
          id: string
          inicio: string
          motivo: string | null
          organization_id: string
          pessoa_id: string
          retirada_em: string | null
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          agenda_evento_id?: string | null
          condicao_devolucao?: string | null
          created_at?: string
          created_by?: string
          devolvida_em?: string | null
          estado?: string
          ferramenta_id: string
          fim: string
          id?: string
          inicio: string
          motivo?: string | null
          organization_id: string
          pessoa_id: string
          retirada_em?: string | null
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          agenda_evento_id?: string | null
          condicao_devolucao?: string | null
          created_at?: string
          created_by?: string
          devolvida_em?: string | null
          estado?: string
          ferramenta_id?: string
          fim?: string
          id?: string
          inicio?: string
          motivo?: string | null
          organization_id?: string
          pessoa_id?: string
          retirada_em?: string | null
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ferramenta_custodias_organization_id_agenda_evento_id_fkey"
            columns: ["organization_id", "agenda_evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramenta_custodias_organization_id_ferramenta_id_fkey"
            columns: ["organization_id", "ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramenta_custodias_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      ferramentas: {
        Row: {
          condicao: string
          created_at: string
          created_by: string
          descricao: string
          exige_calibracao: boolean
          id: string
          local_id: string
          organization_id: string
          patrimonio: string
          politica_calibracao_id: string | null
          produto_id: string | null
          proprietario: string
          proprietario_nome: string | null
          updated_at: string
          version: number
        }
        Insert: {
          condicao?: string
          created_at?: string
          created_by?: string
          descricao: string
          exige_calibracao?: boolean
          id?: string
          local_id: string
          organization_id: string
          patrimonio: string
          politica_calibracao_id?: string | null
          produto_id?: string | null
          proprietario: string
          proprietario_nome?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          condicao?: string
          created_at?: string
          created_by?: string
          descricao?: string
          exige_calibracao?: boolean
          id?: string
          local_id?: string
          organization_id?: string
          patrimonio?: string
          politica_calibracao_id?: string | null
          produto_id?: string | null
          proprietario?: string
          proprietario_nome?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramentas_organization_id_local_id_fkey"
            columns: ["organization_id", "local_id"]
            isOneToOne: false
            referencedRelation: "almoxarifados"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramentas_organization_id_politica_calibracao_id_fkey"
            columns: ["organization_id", "politica_calibracao_id"]
            isOneToOne: false
            referencedRelation: "ferramenta_calibracao_politicas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ferramentas_organization_id_produto_id_fkey"
            columns: ["organization_id", "produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          cnpj: string | null
          contato: string | null
          created_at: string
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          id?: string
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      geracao_ordens: {
        Row: {
          autor: string | null
          chave: string
          chave_operacao: string | null
          created_at: string
          escopo: string | null
          organization_id: string
          pedido_hash: string | null
          resposta: Json
          revisao_id: string
        }
        Insert: {
          autor?: string | null
          chave: string
          chave_operacao?: string | null
          created_at?: string
          escopo?: string | null
          organization_id: string
          pedido_hash?: string | null
          resposta: Json
          revisao_id: string
        }
        Update: {
          autor?: string | null
          chave?: string
          chave_operacao?: string | null
          created_at?: string
          escopo?: string | null
          organization_id?: string
          pedido_hash?: string | null
          resposta?: Json
          revisao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geracao_ordens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geracao_ordens_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      importacao_registros: {
        Row: {
          aba: string
          arquivo: string
          chave: string
          created_at: string
          dados: Json
          explicacao: string | null
          id: string
          linha: string | null
          organization_id: string
          produto_id: string | null
          situacao: string
          tema: string
        }
        Insert: {
          aba: string
          arquivo: string
          chave: string
          created_at?: string
          dados: Json
          explicacao?: string | null
          id?: string
          linha?: string | null
          organization_id: string
          produto_id?: string | null
          situacao: string
          tema: string
        }
        Update: {
          aba?: string
          arquivo?: string
          chave?: string
          created_at?: string
          dados?: Json
          explicacao?: string | null
          id?: string
          linha?: string | null
          organization_id?: string
          produto_id?: string | null
          situacao?: string
          tema?: string
        }
        Relationships: [
          {
            foreignKeyName: "importacao_registros_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacao_registros_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      indisponibilidades: {
        Row: {
          cancelada_em: string | null
          cancelada_por: string | null
          created_at: string
          created_by: string
          fim: string
          id: string
          inicio: string
          motivo_cancelamento: string | null
          motivo_operacional: string
          organization_id: string
          pessoa_id: string
          version: number
        }
        Insert: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          created_at?: string
          created_by?: string
          fim: string
          id?: string
          inicio: string
          motivo_cancelamento?: string | null
          motivo_operacional: string
          organization_id: string
          pessoa_id: string
          version?: number
        }
        Update: {
          cancelada_em?: string | null
          cancelada_por?: string | null
          created_at?: string
          created_by?: string
          fim?: string
          id?: string
          inicio?: string
          motivo_cancelamento?: string | null
          motivo_operacional?: string
          organization_id?: string
          pessoa_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "indisponibilidades_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      job_execucoes: {
        Row: {
          erro_codigo: string | null
          estado: string
          falhas: number
          finalizado_em: string | null
          id: string
          iniciado_em: string
          job: string
          processados: number
        }
        Insert: {
          erro_codigo?: string | null
          estado: string
          falhas?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          job: string
          processados?: number
        }
        Update: {
          erro_codigo?: string | null
          estado?: string
          falhas?: number
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          job?: string
          processados?: number
        }
        Relationships: []
      }
      levantamento_adocoes: {
        Row: {
          autor: string
          campo: string
          created_at: string
          id: string
          levantamento_id: string
          medicao_id: string
          organization_id: string
          origem: Json
          preview_hash: string
          revisao_destino_id: string
          revisao_id: string
          sistema_id: string
          valor_adotado: number
          valor_anterior: number
        }
        Insert: {
          autor?: string
          campo: string
          created_at?: string
          id?: string
          levantamento_id: string
          medicao_id: string
          organization_id: string
          origem: Json
          preview_hash: string
          revisao_destino_id: string
          revisao_id: string
          sistema_id: string
          valor_adotado: number
          valor_anterior: number
        }
        Update: {
          autor?: string
          campo?: string
          created_at?: string
          id?: string
          levantamento_id?: string
          medicao_id?: string
          organization_id?: string
          origem?: Json
          preview_hash?: string
          revisao_destino_id?: string
          revisao_id?: string
          sistema_id?: string
          valor_adotado?: number
          valor_anterior?: number
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_adocoes_organization_id_levantamento_id_revis_fkey"
            columns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "medicao_id",
            ]
            isOneToOne: false
            referencedRelation: "levantamento_medicoes"
            referencedColumns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "id",
            ]
          },
          {
            foreignKeyName: "levantamento_adocoes_organization_id_revisao_destino_id_si_fkey"
            columns: ["organization_id", "revisao_destino_id", "sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas_dimensionados"
            referencedColumns: ["organization_id", "revisao_id", "id"]
          },
        ]
      }
      levantamento_arquivos: {
        Row: {
          caminho: string
          confirmado_em: string | null
          created_at: string
          created_by: string
          estado: string
          id: string
          levantamento_id: string
          mime: string
          motivo: string | null
          nome: string
          organization_id: string
          ponto_id: string | null
          revisao_id: string
          sha256: string
          tamanho: number
        }
        Insert: {
          caminho: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          levantamento_id: string
          mime: string
          motivo?: string | null
          nome: string
          organization_id: string
          ponto_id?: string | null
          revisao_id: string
          sha256: string
          tamanho: number
        }
        Update: {
          caminho?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          levantamento_id?: string
          mime?: string
          motivo?: string | null
          nome?: string
          organization_id?: string
          ponto_id?: string | null
          revisao_id?: string
          sha256?: string
          tamanho?: number
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_arquivos_organization_id_levantamento_id_rev_fkey1"
            columns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "ponto_id",
            ]
            isOneToOne: false
            referencedRelation: "levantamento_pontos"
            referencedColumns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "id",
            ]
          },
          {
            foreignKeyName: "levantamento_arquivos_organization_id_levantamento_id_revi_fkey"
            columns: ["organization_id", "levantamento_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
        ]
      }
      levantamento_avaliacoes: {
        Row: {
          autor: string
          comentario: string
          created_at: string
          decisao: string
          id: number
          levantamento_id: string
          organization_id: string
          pendencias: Json
          revisao_id: string
        }
        Insert: {
          autor?: string
          comentario?: string
          created_at?: string
          decisao: string
          id?: never
          levantamento_id: string
          organization_id: string
          pendencias?: Json
          revisao_id: string
        }
        Update: {
          autor?: string
          comentario?: string
          created_at?: string
          decisao?: string
          id?: never
          levantamento_id?: string
          organization_id?: string
          pendencias?: Json
          revisao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_avaliacoes_organization_id_levantamento_id_re_fkey"
            columns: ["organization_id", "levantamento_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
        ]
      }
      levantamento_medicoes: {
        Row: {
          base_id: string | null
          chave: string
          coletado_em: string | null
          created_at: string
          created_by: string
          grandeza: string
          id: string
          levantamento_id: string
          metodo: string
          natureza: string
          observacoes: string
          organization_id: string
          origem: string
          ponto_id: string
          precisao: number | null
          revisao_id: string
          unidade: string
          updated_at: string
          valor: number | null
          version: number
        }
        Insert: {
          base_id?: string | null
          chave: string
          coletado_em?: string | null
          created_at?: string
          created_by?: string
          grandeza: string
          id?: string
          levantamento_id: string
          metodo?: string
          natureza?: string
          observacoes?: string
          organization_id: string
          origem?: string
          ponto_id: string
          precisao?: number | null
          revisao_id: string
          unidade?: string
          updated_at?: string
          valor?: number | null
          version?: number
        }
        Update: {
          base_id?: string | null
          chave?: string
          coletado_em?: string | null
          created_at?: string
          created_by?: string
          grandeza?: string
          id?: string
          levantamento_id?: string
          metodo?: string
          natureza?: string
          observacoes?: string
          organization_id?: string
          origem?: string
          ponto_id?: string
          precisao?: number | null
          revisao_id?: string
          unidade?: string
          updated_at?: string
          valor?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_medicoes_organization_id_base_id_fkey"
            columns: ["organization_id", "base_id"]
            isOneToOne: false
            referencedRelation: "levantamento_medicoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "levantamento_medicoes_organization_id_levantamento_id_revi_fkey"
            columns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "ponto_id",
            ]
            isOneToOne: false
            referencedRelation: "levantamento_pontos"
            referencedColumns: [
              "organization_id",
              "levantamento_id",
              "revisao_id",
              "id",
            ]
          },
        ]
      }
      levantamento_modelo_versoes: {
        Row: {
          created_at: string
          created_by: string
          fonte: string
          id: string
          modelo_id: string
          numero: number
          organization_id: string
          requisitos: Json
          responsavel_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          fonte: string
          id?: string
          modelo_id: string
          numero: number
          organization_id: string
          requisitos: Json
          responsavel_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          fonte?: string
          id?: string
          modelo_id?: string
          numero?: number
          organization_id?: string
          requisitos?: Json
          responsavel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_modelo_versoes_organization_id_modelo_id_fkey"
            columns: ["organization_id", "modelo_id"]
            isOneToOne: false
            referencedRelation: "levantamento_modelos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "levantamento_modelo_versoes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      levantamento_modelos: {
        Row: {
          created_at: string
          created_by: string
          descricao: string
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_modelos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      levantamento_pontos: {
        Row: {
          area: string
          base_id: string | null
          codigo: string
          created_at: string
          created_by: string
          exige_foto: boolean
          id: string
          levantamento_id: string
          localizacao: string
          nome: string
          observacoes: string
          organization_id: string
          revisao_id: string
          tipo_sistema: string
          updated_at: string
          version: number
        }
        Insert: {
          area?: string
          base_id?: string | null
          codigo: string
          created_at?: string
          created_by?: string
          exige_foto?: boolean
          id?: string
          levantamento_id: string
          localizacao?: string
          nome: string
          observacoes?: string
          organization_id: string
          revisao_id: string
          tipo_sistema?: string
          updated_at?: string
          version?: number
        }
        Update: {
          area?: string
          base_id?: string | null
          codigo?: string
          created_at?: string
          created_by?: string
          exige_foto?: boolean
          id?: string
          levantamento_id?: string
          localizacao?: string
          nome?: string
          observacoes?: string
          organization_id?: string
          revisao_id?: string
          tipo_sistema?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_pontos_organization_id_base_id_fkey"
            columns: ["organization_id", "base_id"]
            isOneToOne: false
            referencedRelation: "levantamento_pontos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "levantamento_pontos_organization_id_levantamento_id_revisa_fkey"
            columns: ["organization_id", "levantamento_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
        ]
      }
      levantamento_revisoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          base_id: string | null
          created_at: string
          created_by: string
          estado: string
          fim_previsto: string | null
          id: string
          inicio_previsto: string | null
          levantamento_id: string
          modelo_versao_id: string | null
          numero: number
          organization_id: string
          snapshot: Json | null
          snapshot_sha256: string | null
          updated_at: string
          version: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          base_id?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          fim_previsto?: string | null
          id?: string
          inicio_previsto?: string | null
          levantamento_id: string
          modelo_versao_id?: string | null
          numero: number
          organization_id: string
          snapshot?: Json | null
          snapshot_sha256?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          base_id?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          fim_previsto?: string | null
          id?: string
          inicio_previsto?: string | null
          levantamento_id?: string
          modelo_versao_id?: string | null
          numero?: number
          organization_id?: string
          snapshot?: Json | null
          snapshot_sha256?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "levantamento_revisoes_organization_id_levantamento_id_base_fkey"
            columns: ["organization_id", "levantamento_id", "base_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
          {
            foreignKeyName: "levantamento_revisoes_organization_id_levantamento_id_fkey"
            columns: ["organization_id", "levantamento_id"]
            isOneToOne: false
            referencedRelation: "levantamentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "levantamento_revisoes_organization_id_modelo_versao_id_fkey"
            columns: ["organization_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "levantamento_modelo_versoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      levantamentos: {
        Row: {
          aprovada_id: string | null
          cliente_id: string
          codigo: string
          created_at: string
          created_by: string
          finalidade: string
          id: string
          organization_id: string
          projeto_id: string | null
          proposta_id: string | null
          responsavel_id: string
          revisao_atual_id: string | null
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          aprovada_id?: string | null
          cliente_id: string
          codigo: string
          created_at?: string
          created_by?: string
          finalidade: string
          id?: string
          organization_id: string
          projeto_id?: string | null
          proposta_id?: string | null
          responsavel_id: string
          revisao_atual_id?: string | null
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          aprovada_id?: string | null
          cliente_id?: string
          codigo?: string
          created_at?: string
          created_by?: string
          finalidade?: string
          id?: string
          organization_id?: string
          projeto_id?: string | null
          proposta_id?: string | null
          responsavel_id?: string
          revisao_atual_id?: string | null
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lev_aprovada_fk"
            columns: ["organization_id", "id", "aprovada_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
          {
            foreignKeyName: "lev_atual_fk"
            columns: ["organization_id", "id", "revisao_atual_id"]
            isOneToOne: false
            referencedRelation: "levantamento_revisoes"
            referencedColumns: ["organization_id", "levantamento_id", "id"]
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_projeto_id_fkey"
            columns: ["organization_id", "cliente_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_proposta_id_fkey"
            columns: ["organization_id", "cliente_id", "proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "levantamentos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "levantamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "levantamentos_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          agenda_evento_id: string
          created_at: string
          destinatario_id: string
          entidade_version: number
          id: string
          lida_em: string | null
          organization_id: string
          tipo: string
        }
        Insert: {
          agenda_evento_id: string
          created_at?: string
          destinatario_id: string
          entidade_version: number
          id?: string
          lida_em?: string | null
          organization_id: string
          tipo: string
        }
        Update: {
          agenda_evento_id?: string
          created_at?: string
          destinatario_id?: string
          entidade_version?: number
          id?: string
          lida_em?: string | null
          organization_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_organization_id_agenda_evento_id_fkey"
            columns: ["organization_id", "agenda_evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_aplicabilidade_decisoes: {
        Row: {
          aprovacao_profissional: boolean
          autoriza_operacao: boolean
          created_at: string
          decisao: string
          evidencias: Json
          executor: string
          externo_id: string
          fonte_id: string | null
          fonte_sha256: string
          fonte_sha256_encontrado: string | null
          id: string
          justificativa: string
          motivo_resultado: string
          normas_anteriores: string[] | null
          normas_aplicadas: string[] | null
          normas_decididas: string[]
          organization_id: string
          pendencia_esperada_id: string
          pendencia_id: string | null
          registro_sha256_antes: string | null
          registro_sha256_apos: string | null
          request_sha256: string
          resultado: string
          sistema_origem: string
          versao: string
        }
        Insert: {
          aprovacao_profissional?: boolean
          autoriza_operacao?: boolean
          created_at?: string
          decisao: string
          evidencias: Json
          executor?: string
          externo_id: string
          fonte_id?: string | null
          fonte_sha256: string
          fonte_sha256_encontrado?: string | null
          id?: string
          justificativa: string
          motivo_resultado: string
          normas_anteriores?: string[] | null
          normas_aplicadas?: string[] | null
          normas_decididas: string[]
          organization_id: string
          pendencia_esperada_id: string
          pendencia_id?: string | null
          registro_sha256_antes?: string | null
          registro_sha256_apos?: string | null
          request_sha256: string
          resultado: string
          sistema_origem: string
          versao: string
        }
        Update: {
          aprovacao_profissional?: boolean
          autoriza_operacao?: boolean
          created_at?: string
          decisao?: string
          evidencias?: Json
          executor?: string
          externo_id?: string
          fonte_id?: string | null
          fonte_sha256?: string
          fonte_sha256_encontrado?: string | null
          id?: string
          justificativa?: string
          motivo_resultado?: string
          normas_anteriores?: string[] | null
          normas_aplicadas?: string[] | null
          normas_decididas?: string[]
          organization_id?: string
          pendencia_esperada_id?: string
          pendencia_id?: string | null
          registro_sha256_antes?: string | null
          registro_sha256_apos?: string | null
          request_sha256?: string
          resultado?: string
          sistema_origem?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_aplicabilidade_decisoes_fonte_id_fkey"
            columns: ["fonte_id"]
            isOneToOne: false
            referencedRelation: "nr_fontes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_aplicabilidade_decisoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_aplicabilidade_decisoes_organization_id_pendencia_id_fkey"
            columns: ["organization_id", "pendencia_id"]
            isOneToOne: false
            referencedRelation: "nr_pendencias"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_arquivo_vinculos: {
        Row: {
          arquivo_id: string
          cliente_id: string
          created_at: string
          documento_id: string | null
          evidencia: Json
          id: string
          local_id: string | null
          organization_id: string
          origem_chave: string
          pasta_id: string | null
          revisao_id: string | null
          unidade_id: string
        }
        Insert: {
          arquivo_id: string
          cliente_id: string
          created_at?: string
          documento_id?: string | null
          evidencia: Json
          id?: string
          local_id?: string | null
          organization_id: string
          origem_chave: string
          pasta_id?: string | null
          revisao_id?: string | null
          unidade_id: string
        }
        Update: {
          arquivo_id?: string
          cliente_id?: string
          created_at?: string
          documento_id?: string | null
          evidencia?: Json
          id?: string
          local_id?: string | null
          organization_id?: string
          origem_chave?: string
          pasta_id?: string | null
          revisao_id?: string | null
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_arquivo_vinculos_organization_id_cliente_id_unidade_id__fkey"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "arquivo_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_arquivos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivo_vinculos_organization_id_cliente_id_unidade_id_fkey1"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "documento_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivo_vinculos_organization_id_cliente_id_unidade_id_fkey2"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivo_vinculos_organization_id_cliente_id_unidade_id_fkey3"
            columns: ["organization_id", "cliente_id", "unidade_id", "pasta_id"]
            isOneToOne: false
            referencedRelation: "nr_pastas"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivo_vinculos_organization_id_documento_id_revisao_i_fkey"
            columns: ["organization_id", "documento_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
        ]
      }
      nr_arquivos: {
        Row: {
          arquivado_em: string | null
          bytes_verificados: boolean
          caminho: string
          chave: string
          cliente_id: string
          confirmado_em: string | null
          created_at: string
          created_by: string | null
          documento_id: string | null
          erro: string | null
          estado: string
          extensao: string
          id: string
          local_id: string | null
          lote_id: string | null
          mime: string
          nome: string
          nome_exibicao: string | null
          normas: string[]
          organization_id: string
          origem: string
          origem_metadata: Json
          papel: string
          pasta_id: string | null
          request_hash: string
          revisao_id: string | null
          sha256: string
          tamanho: number
          unidade_id: string
          updated_at: string
          verificado_em: string | null
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          bytes_verificados?: boolean
          caminho: string
          chave: string
          cliente_id: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string | null
          documento_id?: string | null
          erro?: string | null
          estado?: string
          extensao: string
          id?: string
          local_id?: string | null
          lote_id?: string | null
          mime: string
          nome: string
          nome_exibicao?: string | null
          normas: string[]
          organization_id: string
          origem?: string
          origem_metadata?: Json
          papel?: string
          pasta_id?: string | null
          request_hash: string
          revisao_id?: string | null
          sha256: string
          tamanho: number
          unidade_id: string
          updated_at?: string
          verificado_em?: string | null
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          bytes_verificados?: boolean
          caminho?: string
          chave?: string
          cliente_id?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string | null
          documento_id?: string | null
          erro?: string | null
          estado?: string
          extensao?: string
          id?: string
          local_id?: string | null
          lote_id?: string | null
          mime?: string
          nome?: string
          nome_exibicao?: string | null
          normas?: string[]
          organization_id?: string
          origem?: string
          origem_metadata?: Json
          papel?: string
          pasta_id?: string | null
          request_hash?: string
          revisao_id?: string | null
          sha256?: string
          tamanho?: number
          unidade_id?: string
          updated_at?: string
          verificado_em?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_arquivos_organization_id_cliente_id_unidade_id_document_fkey"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "documento_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_cliente_id_unidade_id_local_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_cliente_id_unidade_id_pasta_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "pasta_id"]
            isOneToOne: false
            referencedRelation: "nr_pastas"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_documento_id_revisao_id_fkey"
            columns: ["organization_id", "documento_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_arquivos_organization_id_lote_id_fkey"
            columns: ["organization_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "nr_import_lotes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_contextos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string
          normas: string[]
          organization_id: string
          unidade_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string
          normas: string[]
          organization_id: string
          unidade_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string
          normas?: string[]
          organization_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_contextos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_contextos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_documento_impacto_revisoes: {
        Row: {
          autor: string
          base_version_conferida: number
          created_at: string
          documento_id: string
          id: string
          impacto_id: string
          motivo: string
          organization_id: string
          responsavel_id: string
          revisao_destino_id: string
          revisao_sha256: string
        }
        Insert: {
          autor?: string
          base_version_conferida: number
          created_at?: string
          documento_id: string
          id?: string
          impacto_id: string
          motivo: string
          organization_id: string
          responsavel_id: string
          revisao_destino_id: string
          revisao_sha256: string
        }
        Update: {
          autor?: string
          base_version_conferida?: number
          created_at?: string
          documento_id?: string
          id?: string
          impacto_id?: string
          motivo?: string
          organization_id?: string
          responsavel_id?: string
          revisao_destino_id?: string
          revisao_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_documento_impacto_revisoe_organization_id_documento_id_fkey1"
            columns: ["organization_id", "documento_id", "revisao_destino_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
          {
            foreignKeyName: "nr_documento_impacto_revisoes_organization_id_documento_id_fkey"
            columns: ["organization_id", "documento_id", "impacto_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_impactos"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
          {
            foreignKeyName: "nr_documento_impacto_revisoes_organization_id_responsavel__fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_documento_impactos: {
        Row: {
          alteracoes: Json
          autor: string | null
          base_version_anterior: number
          base_version_nova: number
          campos_alterados: string[]
          cliente_id: string
          created_at: string
          documento_id: string
          id: string
          local_id: string
          organization_id: string
          revisao_origem_id: string
          unidade_id: string
        }
        Insert: {
          alteracoes: Json
          autor?: string | null
          base_version_anterior: number
          base_version_nova: number
          campos_alterados: string[]
          cliente_id: string
          created_at?: string
          documento_id: string
          id?: string
          local_id: string
          organization_id: string
          revisao_origem_id: string
          unidade_id: string
        }
        Update: {
          alteracoes?: Json
          autor?: string | null
          base_version_anterior?: number
          base_version_nova?: number
          campos_alterados?: string[]
          cliente_id?: string
          created_at?: string
          documento_id?: string
          id?: string
          local_id?: string
          organization_id?: string
          revisao_origem_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_documento_impactos_organization_id_cliente_id_unidade__fkey1"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_documento_impactos_organization_id_cliente_id_unidade_i_fkey"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "documento_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_documento_impactos_organization_id_documento_id_revisao_fkey"
            columns: ["organization_id", "documento_id", "revisao_origem_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
        ]
      }
      nr_documento_modelos: {
        Row: {
          conteudo_modelo_sha256: string
          created_at: string
          created_by: string
          documento_id: string
          modelo_estado_capturado: string
          modelo_id: string
          modelo_snapshot: Json
          modelo_versao_id: string
          modelo_version_capturada: number
          organization_id: string
          rascunho_reconhecido: boolean
          revisao_id: string
        }
        Insert: {
          conteudo_modelo_sha256: string
          created_at?: string
          created_by: string
          documento_id: string
          modelo_estado_capturado: string
          modelo_id: string
          modelo_snapshot: Json
          modelo_versao_id: string
          modelo_version_capturada: number
          organization_id: string
          rascunho_reconhecido: boolean
          revisao_id: string
        }
        Update: {
          conteudo_modelo_sha256?: string
          created_at?: string
          created_by?: string
          documento_id?: string
          modelo_estado_capturado?: string
          modelo_id?: string
          modelo_snapshot?: Json
          modelo_versao_id?: string
          modelo_version_capturada?: number
          organization_id?: string
          rascunho_reconhecido?: boolean
          revisao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_documento_modelos_organization_id_documento_id_revisao__fkey"
            columns: ["organization_id", "documento_id", "revisao_id"]
            isOneToOne: true
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
          {
            foreignKeyName: "nr_documento_modelos_organization_id_modelo_id_modelo_vers_fkey"
            columns: ["organization_id", "modelo_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "nr_modelo_versoes"
            referencedColumns: ["organization_id", "modelo_id", "id"]
          },
        ]
      }
      nr_documento_relacoes: {
        Row: {
          created_at: string
          documento_id: string
          documento_relacionado_id: string
          evidencia: Json
          executor: string
          organization_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          documento_id: string
          documento_relacionado_id: string
          evidencia: Json
          executor?: string
          organization_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          documento_id?: string
          documento_relacionado_id?: string
          evidencia?: Json
          executor?: string
          organization_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_documento_relacoes_organization_id_documento_id_fkey"
            columns: ["organization_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_documento_relacoes_organization_id_documento_relacionad_fkey"
            columns: ["organization_id", "documento_relacionado_id"]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_documento_revisoes: {
        Row: {
          autor_historico: string | null
          conteudo: Json
          created_at: string
          created_by: string | null
          data_origem: string | null
          documento_id: string
          estado: string
          id: string
          numero: number
          organization_id: string
          sha256: string | null
          snapshot: Json | null
          substitui_id: string | null
          vigencia: string
        }
        Insert: {
          autor_historico?: string | null
          conteudo?: Json
          created_at?: string
          created_by?: string | null
          data_origem?: string | null
          documento_id: string
          estado?: string
          id?: string
          numero: number
          organization_id: string
          sha256?: string | null
          snapshot?: Json | null
          substitui_id?: string | null
          vigencia?: string
        }
        Update: {
          autor_historico?: string | null
          conteudo?: Json
          created_at?: string
          created_by?: string | null
          data_origem?: string | null
          documento_id?: string
          estado?: string
          id?: string
          numero?: number
          organization_id?: string
          sha256?: string | null
          snapshot?: Json | null
          substitui_id?: string | null
          vigencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_documento_revisoes_organization_id_documento_id_fkey"
            columns: ["organization_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_documento_revisoes_organization_id_documento_id_substit_fkey"
            columns: ["organization_id", "documento_id", "substitui_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
        ]
      }
      nr_documentos: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          estado_origem: string | null
          id: string
          local_id: string | null
          normas: string[]
          organization_id: string
          origem_url: string | null
          pasta_id: string | null
          recebimento: string
          revisao_atual_id: string | null
          tipo: string
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          estado_origem?: string | null
          id?: string
          local_id?: string | null
          normas: string[]
          organization_id: string
          origem_url?: string | null
          pasta_id?: string | null
          recebimento?: string
          revisao_atual_id?: string | null
          tipo?: string
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          estado_origem?: string | null
          id?: string
          local_id?: string | null
          normas?: string[]
          organization_id?: string
          origem_url?: string | null
          pasta_id?: string | null
          recebimento?: string
          revisao_atual_id?: string | null
          tipo?: string
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_doc_revisao_fk"
            columns: ["organization_id", "id", "revisao_atual_id"]
            isOneToOne: false
            referencedRelation: "nr_documento_revisoes"
            referencedColumns: ["organization_id", "documento_id", "id"]
          },
          {
            foreignKeyName: "nr_documentos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_documentos_organization_id_cliente_id_unidade_id_local__fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_documentos_organization_id_cliente_id_unidade_id_pasta__fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "pasta_id"]
            isOneToOne: false
            referencedRelation: "nr_pastas"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_documentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_fontes: {
        Row: {
          autor_historico: string | null
          caminho_original: string | null
          capturado_em: string
          destino_id: string
          destino_tipo: string
          externo_id: string
          id: string
          lote_id: string | null
          organization_id: string
          origem: string
          pai_externo_id: string | null
          payload: Json
          sha256: string
          snapshot_destino: Json | null
          tipo: string
        }
        Insert: {
          autor_historico?: string | null
          caminho_original?: string | null
          capturado_em: string
          destino_id: string
          destino_tipo: string
          externo_id: string
          id?: string
          lote_id?: string | null
          organization_id: string
          origem: string
          pai_externo_id?: string | null
          payload: Json
          sha256: string
          snapshot_destino?: Json | null
          tipo: string
        }
        Update: {
          autor_historico?: string | null
          caminho_original?: string | null
          capturado_em?: string
          destino_id?: string
          destino_tipo?: string
          externo_id?: string
          id?: string
          lote_id?: string | null
          organization_id?: string
          origem?: string
          pai_externo_id?: string | null
          payload?: Json
          sha256?: string
          snapshot_destino?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_fontes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_fontes_organization_id_lote_id_fkey"
            columns: ["organization_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "nr_import_lotes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_foto_ocorrencias: {
        Row: {
          arquivo_id: string | null
          autoria_historica: string | null
          campo: string
          categoria_origem: string | null
          cliente_id: string
          created_at: string
          data_origem: string | null
          evidencia: Json
          id: string
          legenda_origem: string
          local_id: string
          miniatura_arquivo_id: string | null
          miniatura_proveniencia: string | null
          ocorrencia_origem: string
          ordem: number
          organization_id: string
          origem: string
          referencia_miniatura: string | null
          referencia_original: string
          unidade_id: string
        }
        Insert: {
          arquivo_id?: string | null
          autoria_historica?: string | null
          campo?: string
          categoria_origem?: string | null
          cliente_id: string
          created_at?: string
          data_origem?: string | null
          evidencia: Json
          id?: string
          legenda_origem?: string
          local_id: string
          miniatura_arquivo_id?: string | null
          miniatura_proveniencia?: string | null
          ocorrencia_origem: string
          ordem: number
          organization_id: string
          origem: string
          referencia_miniatura?: string | null
          referencia_original: string
          unidade_id: string
        }
        Update: {
          arquivo_id?: string | null
          autoria_historica?: string | null
          campo?: string
          categoria_origem?: string | null
          cliente_id?: string
          created_at?: string
          data_origem?: string | null
          evidencia?: Json
          id?: string
          legenda_origem?: string
          local_id?: string
          miniatura_arquivo_id?: string | null
          miniatura_proveniencia?: string | null
          ocorrencia_origem?: string
          ordem?: number
          organization_id?: string
          origem?: string
          referencia_miniatura?: string | null
          referencia_original?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_foto_ocorrencias_organization_id_cliente_id_unidade_id__fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_foto_ocorrencias_organization_id_cliente_id_unidade_id_fkey1"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "arquivo_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_arquivos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_foto_ocorrencias_organization_id_cliente_id_unidade_id_fkey2"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "miniatura_arquivo_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_arquivos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
        ]
      }
      nr_historico: {
        Row: {
          antes: Json | null
          autor: string | null
          autor_historico: string | null
          cliente_contexto: string | null
          comando: string
          created_at: string
          depois: Json | null
          id: number
          motivo: string | null
          normas_contexto: Json | null
          organization_id: string
          recurso: string
          registro_id: string
          unidade_contexto: string | null
        }
        Insert: {
          antes?: Json | null
          autor?: string | null
          autor_historico?: string | null
          cliente_contexto?: string | null
          comando: string
          created_at?: string
          depois?: Json | null
          id?: never
          motivo?: string | null
          normas_contexto?: Json | null
          organization_id: string
          recurso: string
          registro_id: string
          unidade_contexto?: string | null
        }
        Update: {
          antes?: Json | null
          autor?: string | null
          autor_historico?: string | null
          cliente_contexto?: string | null
          comando?: string
          created_at?: string
          depois?: Json | null
          id?: never
          motivo?: string | null
          normas_contexto?: Json | null
          organization_id?: string
          recurso?: string
          registro_id?: string
          unidade_contexto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nr_historico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_imagem_representacoes: {
        Row: {
          altura: number | null
          arquivo_id: string
          caminho: string | null
          created_at: string
          erro: string | null
          estado: string
          id: string
          largura: number | null
          lease: string | null
          lease_ate: string | null
          mime: string | null
          organization_id: string
          original_sha256: string
          processado_em: string | null
          processador: string
          proveniencia: string
          sha256: string | null
          tamanho: number | null
          tentativas: number
          variante: string
        }
        Insert: {
          altura?: number | null
          arquivo_id: string
          caminho?: string | null
          created_at?: string
          erro?: string | null
          estado?: string
          id?: string
          largura?: number | null
          lease?: string | null
          lease_ate?: string | null
          mime?: string | null
          organization_id: string
          original_sha256: string
          processado_em?: string | null
          processador?: string
          proveniencia?: string
          sha256?: string | null
          tamanho?: number | null
          tentativas?: number
          variante: string
        }
        Update: {
          altura?: number | null
          arquivo_id?: string
          caminho?: string | null
          created_at?: string
          erro?: string | null
          estado?: string
          id?: string
          largura?: number | null
          lease?: string | null
          lease_ate?: string | null
          mime?: string | null
          organization_id?: string
          original_sha256?: string
          processado_em?: string | null
          processador?: string
          proveniencia?: string
          sha256?: string | null
          tamanho?: number | null
          tentativas?: number
          variante?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_imagem_representacoes_organization_id_arquivo_id_fkey"
            columns: ["organization_id", "arquivo_id"]
            isOneToOne: false
            referencedRelation: "nr_arquivos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_imagem_worker_tickets: {
        Row: {
          consumido_em: string | null
          criado_em: string
          expira_em: string
          finalidade: string
          processador: string
          ticket_sha256: string
        }
        Insert: {
          consumido_em?: string | null
          criado_em?: string
          expira_em: string
          finalidade?: string
          processador?: string
          ticket_sha256: string
        }
        Update: {
          consumido_em?: string | null
          criado_em?: string
          expira_em?: string
          finalidade?: string
          processador?: string
          ticket_sha256?: string
        }
        Relationships: []
      }
      nr_import_fila_eventos: {
        Row: {
          acao: string
          autor: string | null
          created_at: string
          detalhes: Json
          fila_id: string
          id: number
          organization_id: string
        }
        Insert: {
          acao: string
          autor?: string | null
          created_at?: string
          detalhes?: Json
          fila_id: string
          id?: never
          organization_id: string
        }
        Update: {
          acao?: string
          autor?: string | null
          created_at?: string
          detalhes?: Json
          fila_id?: string
          id?: never
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_import_fila_eventos_organization_id_fila_id_fkey"
            columns: ["organization_id", "fila_id"]
            isOneToOne: false
            referencedRelation: "nr_import_filas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_import_fila_itens: {
        Row: {
          capturado_em: string
          destino: Json
          estado: string
          externo_id: string
          fila_id: string
          id: string
          motivo: string | null
          organization_id: string
          payload: Json
          resultado: string | null
          sequencia: number
          sha256: string
          sha256_origem: string
          staging_sha256: string
          tentativas: number
          tipo: string
          updated_at: string
        }
        Insert: {
          capturado_em: string
          destino: Json
          estado?: string
          externo_id: string
          fila_id: string
          id?: string
          motivo?: string | null
          organization_id: string
          payload: Json
          resultado?: string | null
          sequencia: number
          sha256: string
          sha256_origem: string
          staging_sha256: string
          tentativas?: number
          tipo: string
          updated_at?: string
        }
        Update: {
          capturado_em?: string
          destino?: Json
          estado?: string
          externo_id?: string
          fila_id?: string
          id?: string
          motivo?: string | null
          organization_id?: string
          payload?: Json
          resultado?: string | null
          sequencia?: number
          sha256?: string
          sha256_origem?: string
          staging_sha256?: string
          tentativas?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_import_fila_itens_organization_id_fila_id_fkey"
            columns: ["organization_id", "fila_id"]
            isOneToOne: false
            referencedRelation: "nr_import_filas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_import_filas: {
        Row: {
          chave: string
          created_at: string
          created_by: string
          estado: string
          id: string
          lote_id: string
          manifesto: Json
          norma: string
          organization_id: string
          origem: string
          total: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          created_by: string
          estado?: string
          id?: string
          lote_id: string
          manifesto: Json
          norma: string
          organization_id: string
          origem: string
          total: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          lote_id?: string
          manifesto?: Json
          norma?: string
          organization_id?: string
          origem?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nr_import_filas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_import_filas_organization_id_lote_id_fkey"
            columns: ["organization_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "nr_import_lotes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_import_itens: {
        Row: {
          caminho_original: string | null
          capturado_em: string
          cliente_id: string | null
          destino_id: string | null
          destino_tipo: string | null
          evidencia: Json
          executor: string
          externo_id: string
          id: string
          lote_id: string
          motivo: string | null
          norma: string | null
          organization_id: string
          origem: string
          pai_externo_id: string | null
          payload: Json
          resultado: string
          sha256: string
          snapshot_destino: Json | null
          tipo: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          caminho_original?: string | null
          capturado_em: string
          cliente_id?: string | null
          destino_id?: string | null
          destino_tipo?: string | null
          evidencia?: Json
          executor?: string
          externo_id: string
          id?: string
          lote_id: string
          motivo?: string | null
          norma?: string | null
          organization_id: string
          origem: string
          pai_externo_id?: string | null
          payload: Json
          resultado?: string
          sha256: string
          snapshot_destino?: Json | null
          tipo: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          caminho_original?: string | null
          capturado_em?: string
          cliente_id?: string | null
          destino_id?: string | null
          destino_tipo?: string | null
          evidencia?: Json
          executor?: string
          externo_id?: string
          id?: string
          lote_id?: string
          motivo?: string | null
          norma?: string | null
          organization_id?: string
          origem?: string
          pai_externo_id?: string | null
          payload?: Json
          resultado?: string
          sha256?: string
          snapshot_destino?: Json | null
          tipo?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_import_itens_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_import_itens_organization_id_lote_id_fkey"
            columns: ["organization_id", "lote_id"]
            isOneToOne: false
            referencedRelation: "nr_import_lotes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_import_lotes: {
        Row: {
          chave: string
          checkpoint: Json
          created_at: string
          created_by: string | null
          estado: string
          executor: string
          id: string
          manifesto: Json
          organization_id: string
          origem: string
          resumo: Json
          snapshot_fim: string | null
          snapshot_inicio: string | null
          updated_at: string
        }
        Insert: {
          chave: string
          checkpoint?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          executor?: string
          id?: string
          manifesto?: Json
          organization_id: string
          origem: string
          resumo?: Json
          snapshot_fim?: string | null
          snapshot_inicio?: string | null
          updated_at?: string
        }
        Update: {
          chave?: string
          checkpoint?: Json
          created_at?: string
          created_by?: string | null
          estado?: string
          executor?: string
          id?: string
          manifesto?: Json
          organization_id?: string
          origem?: string
          resumo?: Json
          snapshot_fim?: string | null
          snapshot_inicio?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_import_lotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_levantamentos: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          id: string
          levantamento_canonico_id: string | null
          local_id: string | null
          modelo_id: string | null
          modelo_versao_id: string | null
          normas: string[]
          organization_id: string
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          levantamento_canonico_id?: string | null
          local_id?: string | null
          modelo_id?: string | null
          modelo_versao_id?: string | null
          normas: string[]
          organization_id: string
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          levantamento_canonico_id?: string | null
          local_id?: string | null
          modelo_id?: string | null
          modelo_versao_id?: string | null
          normas?: string[]
          organization_id?: string
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_levantamentos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_levantamentos_organization_id_cliente_id_unidade_id_loc_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_levantamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_levantamentos_organization_id_levantamento_canonico_id_fkey"
            columns: ["organization_id", "levantamento_canonico_id"]
            isOneToOne: false
            referencedRelation: "levantamentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_levantamentos_organization_id_modelo_id_fkey"
            columns: ["organization_id", "modelo_id"]
            isOneToOne: false
            referencedRelation: "nr_modelos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_levantamentos_organization_id_modelo_id_modelo_versao_i_fkey"
            columns: ["organization_id", "modelo_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "nr_modelo_versoes"
            referencedColumns: ["organization_id", "modelo_id", "id"]
          },
        ]
      }
      nr_locais: {
        Row: {
          aliases: string[]
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          familia: string
          id: string
          normas: string[]
          organization_id: string
          pet_espaco_id: string | null
          tag: string
          tipo: string
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          aliases?: string[]
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          familia?: string
          id?: string
          normas: string[]
          organization_id: string
          pet_espaco_id?: string | null
          tag?: string
          tipo?: string
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          aliases?: string[]
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          familia?: string
          id?: string
          normas?: string[]
          organization_id?: string
          pet_espaco_id?: string | null
          tag?: string
          tipo?: string
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_locais_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_locais_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_locais_organization_id_unidade_id_pet_espaco_id_fkey"
            columns: ["organization_id", "unidade_id", "pet_espaco_id"]
            isOneToOne: false
            referencedRelation: "pet_espacos"
            referencedColumns: ["organization_id", "unidade_id", "id"]
          },
        ]
      }
      nr_modelo_publicacao_fontes: {
        Row: {
          arquivo_contexto: Json | null
          arquivo_id: string | null
          arquivo_sha256: string | null
          confronto: string
          consultado_em: string
          created_at: string
          data_fonte: string
          id: string
          licenca_confirmada: boolean
          licenca_referencia: string | null
          modelo_id: string
          modelo_versao_id: string
          natureza: string
          normas: string[]
          organization_id: string
          publicado_por: string
          responsavel_id: string
          titulo: string
          url: string | null
          versao: string
        }
        Insert: {
          arquivo_contexto?: Json | null
          arquivo_id?: string | null
          arquivo_sha256?: string | null
          confronto: string
          consultado_em: string
          created_at?: string
          data_fonte: string
          id?: string
          licenca_confirmada?: boolean
          licenca_referencia?: string | null
          modelo_id: string
          modelo_versao_id: string
          natureza: string
          normas: string[]
          organization_id: string
          publicado_por: string
          responsavel_id: string
          titulo: string
          url?: string | null
          versao: string
        }
        Update: {
          arquivo_contexto?: Json | null
          arquivo_id?: string | null
          arquivo_sha256?: string | null
          confronto?: string
          consultado_em?: string
          created_at?: string
          data_fonte?: string
          id?: string
          licenca_confirmada?: boolean
          licenca_referencia?: string | null
          modelo_id?: string
          modelo_versao_id?: string
          natureza?: string
          normas?: string[]
          organization_id?: string
          publicado_por?: string
          responsavel_id?: string
          titulo?: string
          url?: string | null
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_modelo_publicacao_fontes_organization_id_arquivo_id_fkey"
            columns: ["organization_id", "arquivo_id"]
            isOneToOne: false
            referencedRelation: "nr_arquivos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_modelo_publicacao_fontes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_modelo_publicacao_fontes_organization_id_modelo_id_mode_fkey"
            columns: ["organization_id", "modelo_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "nr_modelo_versoes"
            referencedColumns: ["organization_id", "modelo_id", "id"]
          },
          {
            foreignKeyName: "nr_modelo_publicacao_fontes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_modelo_versoes: {
        Row: {
          conteudo: Json
          created_at: string
          created_by: string | null
          dados: Json
          fonte: string | null
          id: string
          modelo_id: string
          numero: number
          organization_id: string
          responsavel_id: string | null
          sha256: string
        }
        Insert: {
          conteudo: Json
          created_at?: string
          created_by?: string | null
          dados: Json
          fonte?: string | null
          id?: string
          modelo_id: string
          numero: number
          organization_id: string
          responsavel_id?: string | null
          sha256: string
        }
        Update: {
          conteudo?: Json
          created_at?: string
          created_by?: string | null
          dados?: Json
          fonte?: string | null
          id?: string
          modelo_id?: string
          numero?: number
          organization_id?: string
          responsavel_id?: string | null
          sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_modelo_versoes_organization_id_modelo_id_fkey"
            columns: ["organization_id", "modelo_id"]
            isOneToOne: false
            referencedRelation: "nr_modelos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_modelo_versoes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_modelos: {
        Row: {
          arquivado_em: string | null
          cliente_id: string | null
          conteudo: Json
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          id: string
          normas: string[]
          organization_id: string
          tipo: string
          titulo: string
          unidade_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id?: string | null
          conteudo?: Json
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          normas: string[]
          organization_id: string
          tipo?: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string | null
          conteudo?: Json
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          normas?: string[]
          organization_id?: string
          tipo?: string
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_modelos_organization_id_cliente_id_fkey"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "nr_modelos_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_modelos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_pastas: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          id: string
          normas: string[]
          ordem: number
          organization_id: string
          parent_id: string | null
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          normas: string[]
          ordem?: number
          organization_id: string
          parent_id?: string | null
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          normas?: string[]
          ordem?: number
          organization_id?: string
          parent_id?: string | null
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_pastas_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_pastas_organization_id_cliente_id_unidade_id_parent_id_fkey"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "parent_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_pastas"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_pastas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_pendencias: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          criticidade: string
          dados: Json
          descricao: string
          documento_id: string | null
          estado: string
          id: string
          local_id: string | null
          normas: string[]
          organization_id: string
          prazo: string | null
          responsavel_id: string | null
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          criticidade?: string
          dados?: Json
          descricao?: string
          documento_id?: string | null
          estado?: string
          id?: string
          local_id?: string | null
          normas: string[]
          organization_id: string
          prazo?: string | null
          responsavel_id?: string | null
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          criticidade?: string
          dados?: Json
          descricao?: string
          documento_id?: string | null
          estado?: string
          id?: string
          local_id?: string | null
          normas?: string[]
          organization_id?: string
          prazo?: string | null
          responsavel_id?: string | null
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_pendencias_organization_id_cliente_id_unidade_id_docume_fkey"
            columns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "documento_id",
            ]
            isOneToOne: false
            referencedRelation: "nr_documentos"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_pendencias_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_pendencias_organization_id_cliente_id_unidade_id_local__fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_pendencias_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nr_pendencias_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_respostas: {
        Row: {
          acao: string | null
          aplicabilidade: string | null
          campo_id: string
          condicao: string | null
          existencia: string | null
          levantamento_id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
          validacao: string | null
          valor: Json
        }
        Insert: {
          acao?: string | null
          aplicabilidade?: string | null
          campo_id: string
          condicao?: string | null
          existencia?: string | null
          levantamento_id: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          validacao?: string | null
          valor: Json
        }
        Update: {
          acao?: string | null
          aplicabilidade?: string | null
          campo_id?: string
          condicao?: string | null
          existencia?: string | null
          levantamento_id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          validacao?: string | null
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nr_respostas_organization_id_levantamento_id_fkey"
            columns: ["organization_id", "levantamento_id"]
            isOneToOne: false
            referencedRelation: "nr_levantamentos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      nr_sistemas: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          dados: Json
          descricao: string
          estado: string
          id: string
          local_id: string | null
          normas: string[]
          organization_id: string
          tipo: string
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          local_id?: string | null
          normas: string[]
          organization_id: string
          tipo?: string
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          dados?: Json
          descricao?: string
          estado?: string
          id?: string
          local_id?: string | null
          normas?: string[]
          organization_id?: string
          tipo?: string
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nr_sistemas_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "nr_sistemas_organization_id_cliente_id_unidade_id_local_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "local_id"]
            isOneToOne: false
            referencedRelation: "nr_locais"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "nr_sistemas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_tratativas: {
        Row: {
          autor_historico: string | null
          created_at: string
          created_by: string | null
          data_origem: string | null
          id: string
          organization_id: string
          pendencia_id: string
          texto: string
          tipo: string
        }
        Insert: {
          autor_historico?: string | null
          created_at?: string
          created_by?: string | null
          data_origem?: string | null
          id?: string
          organization_id: string
          pendencia_id: string
          texto: string
          tipo: string
        }
        Update: {
          autor_historico?: string | null
          created_at?: string
          created_by?: string | null
          data_origem?: string | null
          id?: string
          organization_id?: string
          pendencia_id?: string
          texto?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "nr_tratativas_organization_id_pendencia_id_fkey"
            columns: ["organization_id", "pendencia_id"]
            isOneToOne: false
            referencedRelation: "nr_pendencias"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      numeracao: {
        Row: {
          ano: number
          organization_id: string
          prefixo: string
          proximo: number
        }
        Insert: {
          ano: number
          organization_id: string
          prefixo: string
          proximo?: number
        }
        Update: {
          ano?: number
          organization_id?: string
          prefixo?: string
          proximo?: number
        }
        Relationships: [
          {
            foreignKeyName: "numeracao_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operacao_historico: {
        Row: {
          autor: string
          created_at: string
          entidade: string
          entidade_id: string
          estado_anterior: string | null
          estado_atual: string | null
          id: number
          motivo: string | null
          operacao: string
          organization_id: string
          versao: number | null
        }
        Insert: {
          autor?: string
          created_at?: string
          entidade: string
          entidade_id: string
          estado_anterior?: string | null
          estado_atual?: string | null
          id?: never
          motivo?: string | null
          operacao: string
          organization_id: string
          versao?: number | null
        }
        Update: {
          autor?: string
          created_at?: string
          entidade?: string
          entidade_id?: string
          estado_anterior?: string | null
          estado_atual?: string | null
          id?: never
          motivo?: string | null
          operacao?: string
          organization_id?: string
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operacao_historico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operacoes_idempotentes: {
        Row: {
          autor: string
          chave: string
          comando: string
          created_at: string
          organization_id: string
          request_hash: string
          resultado: Json
        }
        Insert: {
          autor: string
          chave: string
          comando: string
          created_at?: string
          organization_id: string
          request_hash: string
          resultado: Json
        }
        Update: {
          autor?: string
          chave?: string
          comando?: string
          created_at?: string
          organization_id?: string
          request_hash?: string
          resultado?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operacoes_idempotentes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ordem_compra_itens: {
        Row: {
          demanda_id: string
          id: string
          ordem_id: string
          organization_id: string
          preco_unitario: number
          quantidade: number
          quantidade_cancelada: number
          quantidade_recebida: number
        }
        Insert: {
          demanda_id: string
          id?: string
          ordem_id: string
          organization_id: string
          preco_unitario?: number
          quantidade: number
          quantidade_cancelada?: number
          quantidade_recebida?: number
        }
        Update: {
          demanda_id?: string
          id?: string
          ordem_id?: string
          organization_id?: string
          preco_unitario?: number
          quantidade?: number
          quantidade_cancelada?: number
          quantidade_recebida?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordem_compra_itens_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordem_compra_itens_ordem_id_fkey"
            columns: ["organization_id", "ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ordem_compra_itens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ordem_producao_itens: {
        Row: {
          demanda_id: string
          ficha_tecnica: string | null
          id: string
          ordem_id: string
          organization_id: string
          quantidade: number
          quantidade_produzida: number
        }
        Insert: {
          demanda_id: string
          ficha_tecnica?: string | null
          id?: string
          ordem_id: string
          organization_id: string
          quantidade: number
          quantidade_produzida?: number
        }
        Update: {
          demanda_id?: string
          ficha_tecnica?: string | null
          id?: string
          ordem_id?: string
          organization_id?: string
          quantidade?: number
          quantidade_produzida?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordem_producao_itens_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordem_producao_itens_ordem_id_fkey"
            columns: ["organization_id", "ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ordem_producao_itens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_compra: {
        Row: {
          condicoes: string | null
          created_at: string
          emitida_em: string | null
          entrega_prevista: string | null
          fornecedor_id: string
          frete: number
          hash_tecnico: string | null
          id: string
          numero: string
          organization_id: string
          projeto_id: string | null
          revisao_id: string
          status: string
        }
        Insert: {
          condicoes?: string | null
          created_at?: string
          emitida_em?: string | null
          entrega_prevista?: string | null
          fornecedor_id: string
          frete?: number
          hash_tecnico?: string | null
          id?: string
          numero: string
          organization_id: string
          projeto_id?: string | null
          revisao_id: string
          status?: string
        }
        Update: {
          condicoes?: string | null
          created_at?: string
          emitida_em?: string | null
          entrega_prevista?: string | null
          fornecedor_id?: string
          frete?: number
          hash_tecnico?: string | null
          id?: string
          numero?: string
          organization_id?: string
          projeto_id?: string | null
          revisao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey"
            columns: ["organization_id", "fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "ordens_compra_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_projeto_id_fkey"
            columns: ["organization_id", "revisao_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "revisao_id", "id"]
          },
          {
            foreignKeyName: "ordens_compra_revisao_id_fkey"
            columns: ["organization_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          created_at: string
          hash_tecnico: string | null
          id: string
          liberada_em: string | null
          numero: string
          organization_id: string
          prazo: string | null
          projeto_id: string | null
          responsavel: string | null
          revisao_id: string
          status: string
        }
        Insert: {
          created_at?: string
          hash_tecnico?: string | null
          id?: string
          liberada_em?: string | null
          numero: string
          organization_id: string
          prazo?: string | null
          projeto_id?: string | null
          responsavel?: string | null
          revisao_id: string
          status?: string
        }
        Update: {
          created_at?: string
          hash_tecnico?: string | null
          id?: string
          liberada_em?: string | null
          numero?: string
          organization_id?: string
          prazo?: string | null
          projeto_id?: string | null
          responsavel?: string | null
          revisao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_projeto_id_fkey"
            columns: ["organization_id", "revisao_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["organization_id", "revisao_id", "id"]
          },
          {
            foreignKeyName: "ordens_producao_revisao_id_fkey"
            columns: ["organization_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string
          escopo: string
          estado: string
          id: string
          numero: number
          organization_id: string
          responsavel_id: string | null
          titulo: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string
          escopo?: string
          estado?: string
          id?: string
          numero?: never
          organization_id: string
          responsavel_id?: string | null
          titulo: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string
          escopo?: string
          estado?: string
          id?: string
          numero?: never
          organization_id?: string
          responsavel_id?: string | null
          titulo?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_organization_id_cliente_id_unidade_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "cliente_id", "id"]
          },
          {
            foreignKeyName: "ordens_servico_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          nome: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          timezone?: string
        }
        Relationships: []
      }
      os_apontamentos: {
        Row: {
          chave: string
          created_at: string
          created_by: string
          descricao: string
          fim: string
          fonte: string
          id: string
          inicio: string
          organization_id: string
          os_id: string
          pessoa_id: string
        }
        Insert: {
          chave: string
          created_at?: string
          created_by?: string
          descricao: string
          fim: string
          fonte?: string
          id?: string
          inicio: string
          organization_id: string
          os_id: string
          pessoa_id: string
        }
        Update: {
          chave?: string
          created_at?: string
          created_by?: string
          descricao?: string
          fim?: string
          fonte?: string
          id?: string
          inicio?: string
          organization_id?: string
          os_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_apontamentos_organization_id_os_id_fkey"
            columns: ["organization_id", "os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "os_apontamentos_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      os_participantes: {
        Row: {
          funcao: string
          organization_id: string
          os_id: string
          pessoa_id: string
        }
        Insert: {
          funcao?: string
          organization_id: string
          os_id: string
          pessoa_id: string
        }
        Update: {
          funcao?: string
          organization_id?: string
          os_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_participantes_organization_id_os_id_fkey"
            columns: ["organization_id", "os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "os_participantes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      outbox_eventos: {
        Row: {
          agenda_evento_id: string
          concluido_em: string | null
          created_at: string
          disponivel_em: string
          entidade_version: number
          erro_codigo: string | null
          estado: string
          id: number
          organization_id: string
          tentativas: number
          tipo: string
        }
        Insert: {
          agenda_evento_id: string
          concluido_em?: string | null
          created_at?: string
          disponivel_em?: string
          entidade_version: number
          erro_codigo?: string | null
          estado?: string
          id?: never
          organization_id: string
          tentativas?: number
          tipo: string
        }
        Update: {
          agenda_evento_id?: string
          concluido_em?: string | null
          created_at?: string
          disponivel_em?: string
          entidade_version?: number
          erro_codigo?: string | null
          estado?: string
          id?: never
          organization_id?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_eventos_organization_id_agenda_evento_id_fkey"
            columns: ["organization_id", "agenda_evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pe_arquivos: {
        Row: {
          caminho: string
          confirmado_em: string | null
          created_at: string
          created_by: string
          estado: string
          id: string
          mime: string
          nome: string
          organization_id: string
          projeto_id: string
          sha256: string
          tamanho: number
          versao_id: string
        }
        Insert: {
          caminho: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          mime: string
          nome: string
          organization_id: string
          projeto_id: string
          sha256: string
          tamanho: number
          versao_id: string
        }
        Update: {
          caminho?: string
          confirmado_em?: string | null
          created_at?: string
          created_by?: string
          estado?: string
          id?: string
          mime?: string
          nome?: string
          organization_id?: string
          projeto_id?: string
          sha256?: string
          tamanho?: number
          versao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_arquivos_organization_id_projeto_id_versao_id_fkey"
            columns: ["organization_id", "projeto_id", "versao_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      pe_cenarios: {
        Row: {
          base_id: string
          created_at: string
          created_by: string
          descartado: boolean
          id: string
          modelo: Json
          organization_id: string
          projeto_id: string
          promovida_id: string | null
          titulo: string
          updated_at: string
          version: number
        }
        Insert: {
          base_id: string
          created_at?: string
          created_by?: string
          descartado?: boolean
          id?: string
          modelo: Json
          organization_id: string
          projeto_id: string
          promovida_id?: string | null
          titulo: string
          updated_at?: string
          version?: number
        }
        Update: {
          base_id?: string
          created_at?: string
          created_by?: string
          descartado?: boolean
          id?: string
          modelo?: Json
          organization_id?: string
          projeto_id?: string
          promovida_id?: string | null
          titulo?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pe_cenarios_organization_id_projeto_id_base_id_fkey"
            columns: ["organization_id", "projeto_id", "base_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
          {
            foreignKeyName: "pe_cenarios_organization_id_projeto_id_promovida_id_fkey"
            columns: ["organization_id", "projeto_id", "promovida_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      pe_eventos: {
        Row: {
          autor: string
          cenario_id: string | null
          comando: string
          created_at: string
          id: number
          motivo: string | null
          organization_id: string
          projeto_id: string
          versao_id: string | null
        }
        Insert: {
          autor?: string
          cenario_id?: string | null
          comando: string
          created_at?: string
          id?: never
          motivo?: string | null
          organization_id: string
          projeto_id: string
          versao_id?: string | null
        }
        Update: {
          autor?: string
          cenario_id?: string | null
          comando?: string
          created_at?: string
          id?: never
          motivo?: string | null
          organization_id?: string
          projeto_id?: string
          versao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_cenario_id_fkey"
            columns: ["organization_id", "projeto_id", "cenario_id"]
            isOneToOne: false
            referencedRelation: "pe_cenarios"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_fkey"
            columns: ["organization_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "pe_projetos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pe_eventos_organization_id_projeto_id_versao_id_fkey"
            columns: ["organization_id", "projeto_id", "versao_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      pe_projetos: {
        Row: {
          arquivado: boolean
          cliente_id: string
          created_at: string
          created_by: string
          descricao: string
          id: string
          local_descritivo: string
          organization_id: string
          responsavel_id: string
          titulo: string
          unidade_id: string | null
          updated_at: string
          version: number
          vigente_id: string | null
          visibilidade: string
        }
        Insert: {
          arquivado?: boolean
          cliente_id: string
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          local_descritivo?: string
          organization_id: string
          responsavel_id: string
          titulo: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
          vigente_id?: string | null
          visibilidade?: string
        }
        Update: {
          arquivado?: boolean
          cliente_id?: string
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          local_descritivo?: string
          organization_id?: string
          responsavel_id?: string
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
          version?: number
          vigente_id?: string | null
          visibilidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "pe_projetos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_projetos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_projetos_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pe_projetos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pe_vigente_mesmo_projeto"
            columns: ["organization_id", "id", "vigente_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      pe_versoes: {
        Row: {
          autor_declarado: string
          congelado_em: string | null
          congelado_por: string | null
          created_at: string
          created_by: string
          elaborado_em: string | null
          estado: string
          id: string
          modelo: Json
          numero: number
          organization_id: string
          parent_id: string | null
          projeto_id: string
          resumo: string
          revisao_declarada: string
          snapshot: Json | null
          snapshot_sha256: string | null
          updated_at: string
          version: number
        }
        Insert: {
          autor_declarado?: string
          congelado_em?: string | null
          congelado_por?: string | null
          created_at?: string
          created_by?: string
          elaborado_em?: string | null
          estado?: string
          id?: string
          modelo: Json
          numero: number
          organization_id: string
          parent_id?: string | null
          projeto_id: string
          resumo: string
          revisao_declarada?: string
          snapshot?: Json | null
          snapshot_sha256?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          autor_declarado?: string
          congelado_em?: string | null
          congelado_por?: string | null
          created_at?: string
          created_by?: string
          elaborado_em?: string | null
          estado?: string
          id?: string
          modelo?: Json
          numero?: number
          organization_id?: string
          parent_id?: string | null
          projeto_id?: string
          resumo?: string
          revisao_declarada?: string
          snapshot?: Json | null
          snapshot_sha256?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pe_versoes_organization_id_projeto_id_fkey"
            columns: ["organization_id", "projeto_id"]
            isOneToOne: false
            referencedRelation: "pe_projetos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pe_versoes_organization_id_projeto_id_parent_id_fkey"
            columns: ["organization_id", "projeto_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "pe_versoes"
            referencedColumns: ["organization_id", "projeto_id", "id"]
          },
        ]
      }
      pessoa_qualificacoes: {
        Row: {
          competencia_id: string
          conclusao: string
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          created_by: string
          emissor: string
          estado: string
          id: string
          motivo: string | null
          organization_id: string
          pessoa_id: string
          updated_at: string
          validade: string | null
          version: number
        }
        Insert: {
          competencia_id: string
          conclusao: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by?: string
          emissor: string
          estado?: string
          id?: string
          motivo?: string | null
          organization_id: string
          pessoa_id: string
          updated_at?: string
          validade?: string | null
          version?: number
        }
        Update: {
          competencia_id?: string
          conclusao?: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          created_by?: string
          emissor?: string
          estado?: string
          id?: string
          motivo?: string | null
          organization_id?: string
          pessoa_id?: string
          updated_at?: string
          validade?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_qualificacoes_organization_id_competencia_id_fkey"
            columns: ["organization_id", "competencia_id"]
            isOneToOne: false
            referencedRelation: "competencias"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pessoa_qualificacoes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pessoa_usuario_identidades: {
        Row: {
          organization_id: string
          origem: string
          pessoa_id: string
          registrado_em: string
          user_id: string
        }
        Insert: {
          organization_id: string
          origem: string
          pessoa_id: string
          registrado_em?: string
          user_id: string
        }
        Update: {
          organization_id?: string
          origem?: string
          pessoa_id?: string
          registrado_em?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_usuario_identidades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_usuario_identidades_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pessoas: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string
          email_profissional: string | null
          funcao: string | null
          id: string
          nome: string
          organization_id: string
          registro_profissional: string | null
          telefone_profissional: string | null
          updated_at: string
          user_id: string | null
          version: number
          vinculo: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          email_profissional?: string | null
          funcao?: string | null
          id?: string
          nome: string
          organization_id: string
          registro_profissional?: string | null
          telefone_profissional?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
          vinculo: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string
          email_profissional?: string | null
          funcao?: string | null
          id?: string
          nome?: string
          organization_id?: string
          registro_profissional?: string | null
          telefone_profissional?: string | null
          updated_at?: string
          user_id?: string | null
          version?: number
          vinculo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      pet_assinatura_callbacks: {
        Row: {
          assinatura_id: string
          evento_id: string
          organization_id: string
          payload_sha256: string
          provedor: string
          recebido_em: string
        }
        Insert: {
          assinatura_id: string
          evento_id: string
          organization_id: string
          payload_sha256: string
          provedor: string
          recebido_em?: string
        }
        Update: {
          assinatura_id?: string
          evento_id?: string
          organization_id?: string
          payload_sha256?: string
          provedor?: string
          recebido_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_assinatura_callbacks_organization_id_assinatura_id_fkey"
            columns: ["organization_id", "assinatura_id"]
            isOneToOne: false
            referencedRelation: "pet_assinaturas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_assinatura_integracoes: {
        Row: {
          ambiente: string
          configuracao_referencia: string
          configurada: boolean
          icp_brasil: boolean
          organization_id: string
          provedor: string
          verificado_em: string | null
        }
        Insert: {
          ambiente: string
          configuracao_referencia: string
          configurada?: boolean
          icp_brasil?: boolean
          organization_id: string
          provedor: string
          verificado_em?: string | null
        }
        Update: {
          ambiente?: string
          configuracao_referencia?: string
          configurada?: boolean
          icp_brasil?: boolean
          organization_id?: string
          provedor?: string
          verificado_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_assinatura_integracoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_assinaturas: {
        Row: {
          assinada_em: string | null
          conteudo_assinado: Json
          conteudo_sha256: string
          created_at: string
          created_by: string | null
          declaracao: string
          estado: string
          evento_em: string
          finalidade: string
          id: string
          identidade_verificada: Json | null
          metodo: string
          organization_id: string
          participante_id: string
          pessoa_id: string
          pet_id: string
          provedor: string | null
          provedor_id: string | null
          revisao_id: string
          validacao: Json | null
        }
        Insert: {
          assinada_em?: string | null
          conteudo_assinado: Json
          conteudo_sha256: string
          created_at?: string
          created_by?: string | null
          declaracao: string
          estado?: string
          evento_em: string
          finalidade: string
          id?: string
          identidade_verificada?: Json | null
          metodo: string
          organization_id: string
          participante_id: string
          pessoa_id: string
          pet_id: string
          provedor?: string | null
          provedor_id?: string | null
          revisao_id: string
          validacao?: Json | null
        }
        Update: {
          assinada_em?: string | null
          conteudo_assinado?: Json
          conteudo_sha256?: string
          created_at?: string
          created_by?: string | null
          declaracao?: string
          estado?: string
          evento_em?: string
          finalidade?: string
          id?: string
          identidade_verificada?: Json | null
          metodo?: string
          organization_id?: string
          participante_id?: string
          pessoa_id?: string
          pet_id?: string
          provedor?: string | null
          provedor_id?: string | null
          revisao_id?: string
          validacao?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_assinatura_participante_pessoa"
            columns: [
              "organization_id",
              "pet_id",
              "participante_id",
              "pessoa_id",
            ]
            isOneToOne: false
            referencedRelation: "pet_participantes"
            referencedColumns: ["organization_id", "pet_id", "id", "pessoa_id"]
          },
          {
            foreignKeyName: "pet_assinaturas_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_assinaturas_organization_id_pet_id_participante_id_fkey"
            columns: ["organization_id", "pet_id", "participante_id"]
            isOneToOne: false
            referencedRelation: "pet_participantes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_assinaturas_organization_id_pet_id_revisao_id_fkey"
            columns: ["organization_id", "pet_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_avaliacoes: {
        Row: {
          calibracao: string
          contexto: string | null
          created_by: string
          etapa: string
          id: string
          instrumento: string
          momento: string
          numero_serie: string
          organization_id: string
          pet_id: string
          recebido_em: string
          responsavel_id: string
        }
        Insert: {
          calibracao: string
          contexto?: string | null
          created_by?: string
          etapa: string
          id?: string
          instrumento: string
          momento: string
          numero_serie: string
          organization_id: string
          pet_id: string
          recebido_em?: string
          responsavel_id: string
        }
        Update: {
          calibracao?: string
          contexto?: string | null
          created_by?: string
          etapa?: string
          id?: string
          instrumento?: string
          momento?: string
          numero_serie?: string
          organization_id?: string
          pet_id?: string
          recebido_em?: string
          responsavel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_avaliacoes_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_avaliacoes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_documentos: {
        Row: {
          anexo_id: string | null
          created_at: string
          created_by: string | null
          erro: string | null
          estado: string
          id: string
          organization_id: string
          original_documento_id: string | null
          pet_id: string
          revisao_id: string
          sha256: string | null
          tipo: string
        }
        Insert: {
          anexo_id?: string | null
          created_at?: string
          created_by?: string | null
          erro?: string | null
          estado?: string
          id?: string
          organization_id: string
          original_documento_id?: string | null
          pet_id: string
          revisao_id: string
          sha256?: string | null
          tipo: string
        }
        Update: {
          anexo_id?: string | null
          created_at?: string
          created_by?: string | null
          erro?: string | null
          estado?: string
          id?: string
          organization_id?: string
          original_documento_id?: string | null
          pet_id?: string
          revisao_id?: string
          sha256?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_documento_anexo_contexto"
            columns: ["organization_id", "pet_id", "anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_documentos_organization_id_anexo_id_fkey"
            columns: ["organization_id", "anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_documentos_organization_id_original_documento_id_fkey"
            columns: ["organization_id", "original_documento_id"]
            isOneToOne: false
            referencedRelation: "pet_documentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_documentos_organization_id_pet_id_revisao_id_fkey"
            columns: ["organization_id", "pet_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_espacos: {
        Row: {
          ativo: boolean
          caracteristicas: string
          created_at: string
          created_by: string | null
          id: string
          identificacao: string
          import_origem: string | null
          localizacao: string
          organization_id: string
          referencias_tecnicas: Json
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          ativo?: boolean
          caracteristicas?: string
          created_at?: string
          created_by?: string | null
          id?: string
          identificacao: string
          import_origem?: string | null
          localizacao: string
          organization_id: string
          referencias_tecnicas?: Json
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          ativo?: boolean
          caracteristicas?: string
          created_at?: string
          created_by?: string | null
          id?: string
          identificacao?: string
          import_origem?: string | null
          localizacao?: string
          organization_id?: string
          referencias_tecnicas?: Json
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_espacos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_espacos_organization_id_unidade_id_fkey"
            columns: ["organization_id", "unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_eventos_operacionais: {
        Row: {
          created_at: string
          created_by: string
          dados: Json
          id: string
          momento: string
          motivo: string
          organization_id: string
          pet_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          dados?: Json
          id?: string
          momento?: string
          motivo: string
          organization_id: string
          pet_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dados?: Json
          id?: string
          momento?: string
          motivo?: string
          organization_id?: string
          pet_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_eventos_operacionais_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_eventos_presenca: {
        Row: {
          assinatura_id: string | null
          assinatura_pendente: boolean
          created_by: string
          exige_conferencia: boolean
          id: string
          momento_declarado: string
          motivo: string | null
          organization_id: string
          origem: string
          participante_id: string
          pessoa_id: string
          pet_id: string
          recebido_em: string
          retifica_id: string | null
          revisao_id: string
          tipo: string
        }
        Insert: {
          assinatura_id?: string | null
          assinatura_pendente?: boolean
          created_by?: string
          exige_conferencia?: boolean
          id?: string
          momento_declarado: string
          motivo?: string | null
          organization_id: string
          origem: string
          participante_id: string
          pessoa_id: string
          pet_id: string
          recebido_em?: string
          retifica_id?: string | null
          revisao_id: string
          tipo: string
        }
        Update: {
          assinatura_id?: string | null
          assinatura_pendente?: boolean
          created_by?: string
          exige_conferencia?: boolean
          id?: string
          momento_declarado?: string
          motivo?: string | null
          organization_id?: string
          origem?: string
          participante_id?: string
          pessoa_id?: string
          pet_id?: string
          recebido_em?: string
          retifica_id?: string | null
          revisao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_evento_participante_pessoa"
            columns: [
              "organization_id",
              "pet_id",
              "participante_id",
              "pessoa_id",
            ]
            isOneToOne: false
            referencedRelation: "pet_participantes"
            referencedColumns: ["organization_id", "pet_id", "id", "pessoa_id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pet_id_assinatura_id_fkey"
            columns: ["organization_id", "pet_id", "assinatura_id"]
            isOneToOne: false
            referencedRelation: "pet_assinaturas"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pet_id_participante_i_fkey"
            columns: ["organization_id", "pet_id", "participante_id"]
            isOneToOne: false
            referencedRelation: "pet_participantes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pet_id_retifica_id_fkey"
            columns: ["organization_id", "pet_id", "retifica_id"]
            isOneToOne: false
            referencedRelation: "pet_eventos_presenca"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_eventos_presenca_organization_id_pet_id_revisao_id_fkey"
            columns: ["organization_id", "pet_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_intervalos: {
        Row: {
          entrada_em: string
          entrada_id: string
          id: string
          organization_id: string
          pessoa_id: string
          pet_id: string
          saida_em: string | null
          saida_id: string | null
        }
        Insert: {
          entrada_em: string
          entrada_id: string
          id?: string
          organization_id: string
          pessoa_id: string
          pet_id: string
          saida_em?: string | null
          saida_id?: string | null
        }
        Update: {
          entrada_em?: string
          entrada_id?: string
          id?: string
          organization_id?: string
          pessoa_id?: string
          pet_id?: string
          saida_em?: string | null
          saida_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_intervalos_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_intervalos_organization_id_pet_id_entrada_id_fkey"
            columns: ["organization_id", "pet_id", "entrada_id"]
            isOneToOne: false
            referencedRelation: "pet_eventos_presenca"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_intervalos_organization_id_pet_id_saida_id_fkey"
            columns: ["organization_id", "pet_id", "saida_id"]
            isOneToOne: false
            referencedRelation: "pet_eventos_presenca"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_leituras: {
        Row: {
          agente: string
          avaliacao_id: string
          id: string
          organization_id: string
          origem: string
          pet_id: string
          unidade: string
          valor: number
        }
        Insert: {
          agente: string
          avaliacao_id: string
          id?: string
          organization_id: string
          origem: string
          pet_id: string
          unidade: string
          valor: number
        }
        Update: {
          agente?: string
          avaliacao_id?: string
          id?: string
          organization_id?: string
          origem?: string
          pet_id?: string
          unidade?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_leituras_organization_id_pet_id_avaliacao_id_fkey"
            columns: ["organization_id", "pet_id", "avaliacao_id"]
            isOneToOne: false
            referencedRelation: "pet_avaliacoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_modelo_versoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          created_by: string
          declaracao_aprovacao: string | null
          estado: string
          id: string
          modelo_id: string
          organization_id: string
          procedimento: Json
          sha256: string
          versao: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string
          declaracao_aprovacao?: string | null
          estado?: string
          id?: string
          modelo_id: string
          organization_id: string
          procedimento: Json
          sha256: string
          versao: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string
          declaracao_aprovacao?: string | null
          estado?: string
          id?: string
          modelo_id?: string
          organization_id?: string
          procedimento?: Json
          sha256?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_modelo_versoes_organization_id_aprovado_por_fkey"
            columns: ["organization_id", "aprovado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_modelo_versoes_organization_id_modelo_id_fkey"
            columns: ["organization_id", "modelo_id"]
            isOneToOne: false
            referencedRelation: "pet_modelos"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_modelos: {
        Row: {
          created_at: string
          created_by: string
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          nome?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_modelos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_participantes: {
        Row: {
          classificacao: string
          contato: string | null
          created_at: string
          created_by: string
          empresa: string | null
          fim: string | null
          funcao: string
          id: string
          inicio: string
          nome_snapshot: string
          organization_id: string
          pessoa_id: string
          pet_id: string
        }
        Insert: {
          classificacao: string
          contato?: string | null
          created_at?: string
          created_by?: string
          empresa?: string | null
          fim?: string | null
          funcao: string
          id?: string
          inicio?: string
          nome_snapshot: string
          organization_id: string
          pessoa_id: string
          pet_id: string
        }
        Update: {
          classificacao?: string
          contato?: string | null
          created_at?: string
          created_by?: string
          empresa?: string | null
          fim?: string | null
          funcao?: string
          id?: string
          inicio?: string
          nome_snapshot?: string
          organization_id?: string
          pessoa_id?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_participantes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_participantes_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_permissoes: {
        Row: {
          atividade: string
          cliente_id: string
          condicao_operacional: string
          conteudo: Json
          created_at: string
          created_by: string
          emitida_em: string | null
          encerrada_em: string | null
          espaco_id: string
          estado_documental: string
          id: string
          modelo_versao_id: string | null
          numero: string | null
          organization_id: string
          os_id: string
          retencao_ate: string | null
          revisao_atual_id: string | null
          sequencia: number
          snapshot_identificacao: Json
          termino_operacional_em: string | null
          termino_previsto: string
          timezone: string
          unidade_id: string
          updated_at: string
          version: number
        }
        Insert: {
          atividade: string
          cliente_id: string
          condicao_operacional?: string
          conteudo?: Json
          created_at?: string
          created_by?: string
          emitida_em?: string | null
          encerrada_em?: string | null
          espaco_id: string
          estado_documental?: string
          id?: string
          modelo_versao_id?: string | null
          numero?: string | null
          organization_id: string
          os_id: string
          retencao_ate?: string | null
          revisao_atual_id?: string | null
          sequencia?: never
          snapshot_identificacao: Json
          termino_operacional_em?: string | null
          termino_previsto: string
          timezone: string
          unidade_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          atividade?: string
          cliente_id?: string
          condicao_operacional?: string
          conteudo?: Json
          created_at?: string
          created_by?: string
          emitida_em?: string | null
          encerrada_em?: string | null
          espaco_id?: string
          estado_documental?: string
          id?: string
          modelo_versao_id?: string | null
          numero?: string | null
          organization_id?: string
          os_id?: string
          retencao_ate?: string | null
          revisao_atual_id?: string | null
          sequencia?: never
          snapshot_identificacao?: Json
          termino_operacional_em?: string | null
          termino_previsto?: string
          timezone?: string
          unidade_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_permissoes_organization_id_cliente_id_unidade_id_os_id_fkey"
            columns: ["organization_id", "cliente_id", "unidade_id", "os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: [
              "organization_id",
              "cliente_id",
              "unidade_id",
              "id",
            ]
          },
          {
            foreignKeyName: "pet_permissoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_permissoes_organization_id_modelo_versao_id_fkey"
            columns: ["organization_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "pet_modelo_versoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_permissoes_organization_id_unidade_id_espaco_id_fkey"
            columns: ["organization_id", "unidade_id", "espaco_id"]
            isOneToOne: false
            referencedRelation: "pet_espacos"
            referencedColumns: ["organization_id", "unidade_id", "id"]
          },
          {
            foreignKeyName: "pet_revisao_tenant"
            columns: ["organization_id", "id", "revisao_atual_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_prorrogacoes: {
        Row: {
          condicoes: Json
          created_at: string
          created_by: string
          decisao: string
          id: string
          motivo: string
          organization_id: string
          pet_id: string
          supervisor_id: string
          termino_anterior: string
          termino_novo: string
        }
        Insert: {
          condicoes: Json
          created_at?: string
          created_by?: string
          decisao: string
          id?: string
          motivo: string
          organization_id: string
          pet_id: string
          supervisor_id: string
          termino_anterior: string
          termino_novo: string
        }
        Update: {
          condicoes?: Json
          created_at?: string
          created_by?: string
          decisao?: string
          id?: string
          motivo?: string
          organization_id?: string
          pet_id?: string
          supervisor_id?: string
          termino_anterior?: string
          termino_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_prorrogacoes_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_prorrogacoes_organization_id_supervisor_id_fkey"
            columns: ["organization_id", "supervisor_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_relatorio_jobs: {
        Row: {
          anexo_id: string | null
          arquivo_sha256: string | null
          autor: string
          chave: string
          created_at: string
          documento_id: string
          finalizado_em: string | null
          organization_id: string
          pet_id: string
          pet_version: number
          revisao_id: string
          snapshot: Json
          snapshot_sha256: string
          tamanho: number | null
        }
        Insert: {
          anexo_id?: string | null
          arquivo_sha256?: string | null
          autor: string
          chave: string
          created_at?: string
          documento_id: string
          finalizado_em?: string | null
          organization_id: string
          pet_id: string
          pet_version: number
          revisao_id: string
          snapshot: Json
          snapshot_sha256: string
          tamanho?: number | null
        }
        Update: {
          anexo_id?: string | null
          arquivo_sha256?: string | null
          autor?: string
          chave?: string
          created_at?: string
          documento_id?: string
          finalizado_em?: string | null
          organization_id?: string
          pet_id?: string
          pet_version?: number
          revisao_id?: string
          snapshot?: Json
          snapshot_sha256?: string
          tamanho?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_relatorio_jobs_organization_id_anexo_id_fkey"
            columns: ["organization_id", "anexo_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_relatorio_jobs_organization_id_documento_id_fkey"
            columns: ["organization_id", "documento_id"]
            isOneToOne: false
            referencedRelation: "pet_documentos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_relatorio_jobs_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_relatorio_jobs_organization_id_pet_id_revisao_id_fkey"
            columns: ["organization_id", "pet_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_responsaveis_tecnicos: {
        Row: {
          designacao: string
          fim: string | null
          inicio: string
          organization_id: string
          pessoa_id: string
        }
        Insert: {
          designacao: string
          fim?: string | null
          inicio: string
          organization_id: string
          pessoa_id: string
        }
        Update: {
          designacao?: string
          fim?: string | null
          inicio?: string
          organization_id?: string
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_responsaveis_tecnicos_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_respostas: {
        Row: {
          conferido_em: string
          conferido_por: string
          id: string
          item: string
          justificativa: string | null
          organization_id: string
          pet_id: string
          resposta: string
        }
        Insert: {
          conferido_em?: string
          conferido_por?: string
          id?: string
          item: string
          justificativa?: string | null
          organization_id: string
          pet_id: string
          resposta: string
        }
        Update: {
          conferido_em?: string
          conferido_por?: string
          id?: string
          item?: string
          justificativa?: string | null
          organization_id?: string
          pet_id?: string
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_respostas_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_retificacao_decisoes: {
        Row: {
          decidido_em: string
          decidido_por: string
          decisao: string
          id: string
          motivo: string
          organization_id: string
          pet_id: string
          responsavel_id: string
          retificacao_id: string
          revisao_id: string | null
        }
        Insert: {
          decidido_em?: string
          decidido_por?: string
          decisao: string
          id?: string
          motivo: string
          organization_id: string
          pet_id: string
          responsavel_id: string
          retificacao_id: string
          revisao_id?: string | null
        }
        Update: {
          decidido_em?: string
          decidido_por?: string
          decisao?: string
          id?: string
          motivo?: string
          organization_id?: string
          pet_id?: string
          responsavel_id?: string
          retificacao_id?: string
          revisao_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_retificacao_decisoes_organization_id_pet_id_retificaca_fkey"
            columns: ["organization_id", "pet_id", "retificacao_id"]
            isOneToOne: false
            referencedRelation: "pet_retificacoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacao_decisoes_organization_id_pet_id_revisao_id_fkey"
            columns: ["organization_id", "pet_id", "revisao_id"]
            isOneToOne: false
            referencedRelation: "pet_revisoes"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacao_decisoes_organization_id_responsavel_id_fkey"
            columns: ["organization_id", "responsavel_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pet_retificacoes: {
        Row: {
          evento_id: string
          evidencia_id: string
          id: string
          intervalo_base_sha256: string
          intervalo_id: string
          modelo_versao_id: string
          momento_corrigido: string
          momento_original: string
          motivo: string
          organization_id: string
          pessoa_id: string
          pet_id: string
          procedimento_sha256: string
          registrante_original: string
          solicitado_em: string
          solicitado_por: string
          version_pet: number
        }
        Insert: {
          evento_id: string
          evidencia_id: string
          id?: string
          intervalo_base_sha256: string
          intervalo_id: string
          modelo_versao_id: string
          momento_corrigido: string
          momento_original: string
          motivo: string
          organization_id: string
          pessoa_id: string
          pet_id: string
          procedimento_sha256: string
          registrante_original: string
          solicitado_em?: string
          solicitado_por?: string
          version_pet: number
        }
        Update: {
          evento_id?: string
          evidencia_id?: string
          id?: string
          intervalo_base_sha256?: string
          intervalo_id?: string
          modelo_versao_id?: string
          momento_corrigido?: string
          momento_original?: string
          motivo?: string
          organization_id?: string
          pessoa_id?: string
          pet_id?: string
          procedimento_sha256?: string
          registrante_original?: string
          solicitado_em?: string
          solicitado_por?: string
          version_pet?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_retificacao_evidencia_contexto"
            columns: ["organization_id", "pet_id", "evidencia_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacao_intervalo_contexto"
            columns: ["organization_id", "pet_id", "intervalo_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pet_intervalos"
            referencedColumns: ["organization_id", "pet_id", "id", "pessoa_id"]
          },
          {
            foreignKeyName: "pet_retificacoes_organization_id_evidencia_id_fkey"
            columns: ["organization_id", "evidencia_id"]
            isOneToOne: false
            referencedRelation: "anexos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacoes_organization_id_intervalo_id_fkey"
            columns: ["organization_id", "intervalo_id"]
            isOneToOne: false
            referencedRelation: "pet_intervalos"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacoes_organization_id_modelo_versao_id_fkey"
            columns: ["organization_id", "modelo_versao_id"]
            isOneToOne: false
            referencedRelation: "pet_modelo_versoes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacoes_organization_id_pessoa_id_fkey"
            columns: ["organization_id", "pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "pet_retificacoes_organization_id_pet_id_evento_id_fkey"
            columns: ["organization_id", "pet_id", "evento_id"]
            isOneToOne: false
            referencedRelation: "pet_eventos_presenca"
            referencedColumns: ["organization_id", "pet_id", "id"]
          },
        ]
      }
      pet_revisoes: {
        Row: {
          conteudo: Json
          created_at: string
          created_by: string
          finalidade: string
          id: string
          organization_id: string
          pet_id: string
          sha256: string
          versao: number
        }
        Insert: {
          conteudo: Json
          created_at?: string
          created_by?: string
          finalidade: string
          id?: string
          organization_id: string
          pet_id: string
          sha256: string
          versao: number
        }
        Update: {
          conteudo?: Json
          created_at?: string
          created_by?: string
          finalidade?: string
          id?: string
          organization_id?: string
          pet_id?: string
          sha256?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_revisoes_organization_id_pet_id_fkey"
            columns: ["organization_id", "pet_id"]
            isOneToOne: false
            referencedRelation: "pet_permissoes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      politicas_custo: {
        Row: {
          created_at: string
          descricao: string
          divergencias: Json
          id: string
          organization_id: string
          parcelas_no_custo: string[]
          situacao: string
          versao: string
        }
        Insert: {
          created_at?: string
          descricao: string
          divergencias?: Json
          id?: string
          organization_id: string
          parcelas_no_custo: string[]
          situacao?: string
          versao: string
        }
        Update: {
          created_at?: string
          descricao?: string
          divergencias?: Json
          id?: string
          organization_id?: string
          parcelas_no_custo?: string[]
          situacao?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "politicas_custo_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_conversoes: {
        Row: {
          confirmado_por: string | null
          created_at: string
          fator: number
          id: string
          organization_id: string
          produto_id: string
          unidade_compra: string
        }
        Insert: {
          confirmado_por?: string | null
          created_at?: string
          fator: number
          id?: string
          organization_id: string
          produto_id: string
          unidade_compra: string
        }
        Update: {
          confirmado_por?: string | null
          created_at?: string
          fator?: number
          id?: string
          organization_id?: string
          produto_id?: string
          unidade_compra?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_conversoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_conversoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_custos: {
        Row: {
          created_at: string
          created_by: string | null
          custo: number
          fornecedor_id: string | null
          id: string
          inclui: string[]
          organization_id: string
          origem: string | null
          produto_id: string
          vigencia: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo: number
          fornecedor_id?: string | null
          id?: string
          inclui?: string[]
          organization_id: string
          origem?: string | null
          produto_id: string
          vigencia?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo?: number
          fornecedor_id?: string | null
          id?: string
          inclui?: string[]
          organization_id?: string
          origem?: string | null
          produto_id?: string
          vigencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_custos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_custos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_custos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_estrutura: {
        Row: {
          created_at: string
          filho_id: string
          id: string
          ordem: number
          organization_id: string
          pai_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          filho_id: string
          id?: string
          ordem?: number
          organization_id: string
          pai_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          filho_id?: string
          id?: string
          ordem?: number
          organization_id?: string
          pai_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_estrutura_filho_id_fkey"
            columns: ["filho_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_estrutura_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_estrutura_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_referencias: {
        Row: {
          codigo_fornecedor: string
          created_at: string
          descricao_original: string | null
          fornecedor_id: string
          id: string
          organization_id: string
          produto_id: string
        }
        Insert: {
          codigo_fornecedor: string
          created_at?: string
          descricao_original?: string | null
          fornecedor_id: string
          id?: string
          organization_id: string
          produto_id: string
        }
        Update: {
          codigo_fornecedor?: string
          created_at?: string
          descricao_original?: string | null
          fornecedor_id?: string
          id?: string
          organization_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_referencias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_referencias_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_referencias_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          acabamento: string | null
          ativo: boolean
          base_custo: string
          chave_cadastro: string | null
          codigo: string
          codigo_legado: string | null
          composicao_status: string
          created_at: string
          descricao: string
          descricao_original: string | null
          dimensoes: string | null
          fabricante_id: string | null
          familia: string | null
          familia_tecnica: string | null
          fornecedor_padrao_id: string | null
          id: string
          indivisivel: boolean
          material: string | null
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra: number
          ncm: string | null
          organization_id: string
          origem: string | null
          sequencia: number | null
          tipo_item: string | null
          unidade: string
          versao: number
        }
        Insert: {
          acabamento?: string | null
          ativo?: boolean
          base_custo?: string
          chave_cadastro?: string | null
          codigo: string
          codigo_legado?: string | null
          composicao_status?: string
          created_at?: string
          descricao: string
          descricao_original?: string | null
          dimensoes?: string | null
          fabricante_id?: string | null
          familia?: string | null
          familia_tecnica?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          indivisivel?: boolean
          material?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra?: number
          ncm?: string | null
          organization_id: string
          origem?: string | null
          sequencia?: number | null
          tipo_item?: string | null
          unidade: string
          versao?: number
        }
        Update: {
          acabamento?: string | null
          ativo?: boolean
          base_custo?: string
          chave_cadastro?: string | null
          codigo?: string
          codigo_legado?: string | null
          composicao_status?: string
          created_at?: string
          descricao?: string
          descricao_original?: string | null
          dimensoes?: string | null
          fabricante_id?: string | null
          familia?: string | null
          familia_tecnica?: string | null
          fornecedor_padrao_id?: string | null
          id?: string
          indivisivel?: boolean
          material?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra?: number
          ncm?: string | null
          organization_id?: string
          origem?: string | null
          sequencia?: number | null
          tipo_item?: string | null
          unidade?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_fabricante_id_fkey"
            columns: ["fabricante_id"]
            isOneToOne: false
            referencedRelation: "fabricantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_familia_fkey"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "familias_codigo"
            referencedColumns: ["sigla"]
          },
          {
            foreignKeyName: "produtos_familia_tecnica_fkey"
            columns: ["familia_tecnica"]
            isOneToOne: false
            referencedRelation: "familias_codigo"
            referencedColumns: ["sigla"]
          },
          {
            foreignKeyName: "produtos_fornecedor_padrao_id_fkey"
            columns: ["fornecedor_padrao_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos: {
        Row: {
          cliente_id: string
          codigo: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          proposta_id: string
          revisao_id: string
          status: string
        }
        Insert: {
          cliente_id: string
          codigo: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          proposta_id: string
          revisao_id: string
          status?: string
        }
        Update: {
          cliente_id?: string
          codigo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          proposta_id?: string
          revisao_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: true
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_checkpoints: {
        Row: {
          atualizado_em: string
          organization_id: string
          revisao_id: string
          snapshot: Json
          total_salvo: number | null
          versao: number
          versao_salva: number
        }
        Insert: {
          atualizado_em?: string
          organization_id: string
          revisao_id: string
          snapshot: Json
          total_salvo?: number | null
          versao?: number
          versao_salva?: number
        }
        Update: {
          atualizado_em?: string
          organization_id?: string
          revisao_id?: string
          snapshot?: Json
          total_salvo?: number | null
          versao?: number
          versao_salva?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_checkpoints_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: true
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_operacoes: {
        Row: {
          autor: string
          created_at: string
          id: string
          resposta: Json
          revisao_id: string
        }
        Insert: {
          autor: string
          created_at?: string
          id: string
          resposta: Json
          revisao_id: string
        }
        Update: {
          autor?: string
          created_at?: string
          id?: string
          resposta?: Json
          revisao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposta_operacoes_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_rascunho_autores: {
        Row: {
          autor: string | null
          autor_nome: string | null
          campo: string
          created_at: string
          id: number
          objeto: string
          revisao_id: string
          versao: number
        }
        Insert: {
          autor?: string | null
          autor_nome?: string | null
          campo: string
          created_at?: string
          id?: never
          objeto: string
          revisao_id: string
          versao: number
        }
        Update: {
          autor?: string | null
          autor_nome?: string | null
          campo?: string
          created_at?: string
          id?: never
          objeto?: string
          revisao_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_rascunho_autores_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_revisoes: {
        Row: {
          aceita_em: string | null
          calculado_em: string | null
          created_at: string
          created_by: string | null
          desatualizada: boolean
          enviada_em: string | null
          id: string
          numero: number
          organization_id: string
          parametros: Json
          proposta_id: string
          regras_id: string | null
          regras_snapshot: Json | null
          status: Database["public"]["Enums"]["status_revisao"]
          textos: Json
          totais: Json | null
          updated_at: string
          version: number
        }
        Insert: {
          aceita_em?: string | null
          calculado_em?: string | null
          created_at?: string
          created_by?: string | null
          desatualizada?: boolean
          enviada_em?: string | null
          id?: string
          numero: number
          organization_id: string
          parametros?: Json
          proposta_id: string
          regras_id?: string | null
          regras_snapshot?: Json | null
          status?: Database["public"]["Enums"]["status_revisao"]
          textos?: Json
          totais?: Json | null
          updated_at?: string
          version?: number
        }
        Update: {
          aceita_em?: string | null
          calculado_em?: string | null
          created_at?: string
          created_by?: string | null
          desatualizada?: boolean
          enviada_em?: string | null
          id?: string
          numero?: number
          organization_id?: string
          parametros?: Json
          proposta_id?: string
          regras_id?: string | null
          regras_snapshot?: Json | null
          status?: Database["public"]["Enums"]["status_revisao"]
          textos?: Json
          totais?: Json | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_revisoes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_revisoes_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_revisoes_regras_id_fkey"
            columns: ["regras_id"]
            isOneToOne: false
            referencedRelation: "regras_versionadas"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_salvamentos: {
        Row: {
          autor: string
          autor_nome: string
          calculo_id: string | null
          campos: number
          created_at: string
          diferencas: Json
          id: string
          impacto: Json | null
          objetos: number
          organization_id: string
          proposta_id: string
          revisao_id: string
          versao_destino: number
          versao_origem: number
        }
        Insert: {
          autor: string
          autor_nome: string
          calculo_id?: string | null
          campos: number
          created_at?: string
          diferencas: Json
          id: string
          impacto?: Json | null
          objetos: number
          organization_id: string
          proposta_id: string
          revisao_id: string
          versao_destino: number
          versao_origem: number
        }
        Update: {
          autor?: string
          autor_nome?: string
          calculo_id?: string | null
          campos?: number
          created_at?: string
          diferencas?: Json
          id?: string
          impacto?: Json | null
          objetos?: number
          organization_id?: string
          proposta_id?: string
          revisao_id?: string
          versao_destino?: number
          versao_origem?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_salvamentos_calculo_id_fkey"
            columns: ["calculo_id"]
            isOneToOne: false
            referencedRelation: "calculo_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_salvamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_salvamentos_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_salvamentos_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas: {
        Row: {
          cliente_id: string
          contato_id: string | null
          created_at: string
          created_by: string | null
          id: string
          numero: string
          organization_id: string
          projeto_id: string | null
          revisao_corrente_id: string | null
          titulo: string | null
          unidade_id: string | null
        }
        Insert: {
          cliente_id: string
          contato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          numero: string
          organization_id: string
          projeto_id?: string | null
          revisao_corrente_id?: string | null
          titulo?: string | null
          unidade_id?: string | null
        }
        Update: {
          cliente_id?: string
          contato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          numero?: string
          organization_id?: string
          projeto_id?: string | null
          revisao_corrente_id?: string | null
          titulo?: string | null
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_proj_fk"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_rev_fk"
            columns: ["revisao_corrente_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos: {
        Row: {
          chave: string | null
          created_at: string
          created_by: string | null
          estorno_de: string | null
          id: string
          item_id: string
          organization_id: string
          quantidade: number
          recebido_em: string
          sinal: number
        }
        Insert: {
          chave?: string | null
          created_at?: string
          created_by?: string | null
          estorno_de?: string | null
          id?: string
          item_id: string
          organization_id: string
          quantidade: number
          recebido_em?: string
          sinal?: number
        }
        Update: {
          chave?: string | null
          created_at?: string
          created_by?: string | null
          estorno_de?: string | null
          id?: string
          item_id?: string
          organization_id?: string
          quantidade?: number
          recebido_em?: string
          sinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_estorno_de_fkey"
            columns: ["estorno_de"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimentos_item_id_fkey"
            columns: ["organization_id", "item_id"]
            isOneToOne: false
            referencedRelation: "ordem_compra_itens"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "recebimentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_versionadas: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          organization_id: string
          origem: string | null
          regras: Json
          versao: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          organization_id: string
          origem?: string | null
          regras: Json
          versao: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          organization_id?: string
          origem?: string | null
          regras?: Json
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_versionadas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      revisao_componentes: {
        Row: {
          codigo: string
          custo_adotado: number
          custo_atualizado_em: string | null
          custo_base: string | null
          custo_fonte: Json | null
          custo_inclui: string[]
          custo_origem_id: string | null
          descricao: string
          estrutura: Json | null
          estrutura_origem: Json | null
          fabricante: string | null
          fornecedor_id: string | null
          id: string
          incluido_orcamento: boolean
          indivisivel: boolean
          justificativa: string | null
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra: number
          ncm: string | null
          organization_id: string
          produto_id: string
          quantidade_avulsa: number
          revisao_id: string
          unidade: string
        }
        Insert: {
          codigo: string
          custo_adotado?: number
          custo_atualizado_em?: string | null
          custo_base?: string | null
          custo_fonte?: Json | null
          custo_inclui?: string[]
          custo_origem_id?: string | null
          descricao: string
          estrutura?: Json | null
          estrutura_origem?: Json | null
          fabricante?: string | null
          fornecedor_id?: string | null
          id?: string
          incluido_orcamento?: boolean
          indivisivel?: boolean
          justificativa?: string | null
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra?: number
          ncm?: string | null
          organization_id: string
          produto_id: string
          quantidade_avulsa?: number
          revisao_id: string
          unidade: string
        }
        Update: {
          codigo?: string
          custo_adotado?: number
          custo_atualizado_em?: string | null
          custo_base?: string | null
          custo_fonte?: Json | null
          custo_inclui?: string[]
          custo_origem_id?: string | null
          descricao?: string
          estrutura?: Json | null
          estrutura_origem?: Json | null
          fabricante?: string | null
          fornecedor_id?: string | null
          id?: string
          incluido_orcamento?: boolean
          indivisivel?: boolean
          justificativa?: string | null
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"]
          multiplo_compra?: number
          ncm?: string | null
          organization_id?: string
          produto_id?: string
          quantidade_avulsa?: number
          revisao_id?: string
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisao_componentes_custo_origem_id_fkey"
            columns: ["custo_origem_id"]
            isOneToOne: false
            referencedRelation: "produto_custos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_componentes_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_componentes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_componentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_componentes_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_configuracao: {
        Row: {
          detalhe: string
          estado: string
          extensao: string
          job_id: number | null
          nome: string
          verificado_em: string
        }
        Insert: {
          detalhe: string
          estado: string
          extensao: string
          job_id?: number | null
          nome: string
          verificado_em?: string
        }
        Update: {
          detalhe?: string
          estado?: string
          extensao?: string
          job_id?: number | null
          nome?: string
          verificado_em?: string
        }
        Relationships: []
      }
      series_codigo: {
        Row: {
          familia: string
          organization_id: string
          tipo: string
          ultimo: number
          updated_at: string
        }
        Insert: {
          familia: string
          organization_id: string
          tipo: string
          ultimo?: number
          updated_at?: string
        }
        Update: {
          familia?: string
          organization_id?: string
          tipo?: string
          ultimo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_codigo_familia_fkey"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "familias_codigo"
            referencedColumns: ["sigla"]
          },
          {
            foreignKeyName: "series_codigo_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      series_planilha: {
        Row: {
          familia: string
          origem: string
          pendencia: string | null
          tipo: string
          ultimo: number
        }
        Insert: {
          familia: string
          origem?: string
          pendencia?: string | null
          tipo: string
          ultimo: number
        }
        Update: {
          familia?: string
          origem?: string
          pendencia?: string | null
          tipo?: string
          ultimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_planilha_familia_fkey"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "familias_codigo"
            referencedColumns: ["sigla"]
          },
        ]
      }
      sistema_componentes: {
        Row: {
          id: string
          memoria: string | null
          organization_id: string
          override_justificativa: string | null
          override_quantidade: number | null
          quantidade: number
          quantidade_tecnica: number
          regra_chave: string
          revisao_componente_id: string
          revisao_id: string
          sistema_id: string
        }
        Insert: {
          id?: string
          memoria?: string | null
          organization_id: string
          override_justificativa?: string | null
          override_quantidade?: number | null
          quantidade: number
          quantidade_tecnica: number
          regra_chave: string
          revisao_componente_id: string
          revisao_id: string
          sistema_id: string
        }
        Update: {
          id?: string
          memoria?: string | null
          organization_id?: string
          override_justificativa?: string | null
          override_quantidade?: number | null
          quantidade?: number
          quantidade_tecnica?: number
          regra_chave?: string
          revisao_componente_id?: string
          revisao_id?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sistema_componentes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sistema_componentes_revisao_componente_id_fkey"
            columns: ["revisao_componente_id"]
            isOneToOne: false
            referencedRelation: "revisao_componentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sistema_componentes_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sistema_componentes_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sistemas_dimensionados"
            referencedColumns: ["id"]
          },
        ]
      }
      sistemas_dimensionados: {
        Row: {
          created_at: string
          id: string
          identificacao: string
          metragem: number
          ordem: number
          organization_id: string
          origem: string
          revisao_id: string
          tipo: Database["public"]["Enums"]["tipo_sistema"]
          trechos: number
        }
        Insert: {
          created_at?: string
          id?: string
          identificacao?: string
          metragem?: number
          ordem: number
          organization_id: string
          origem?: string
          revisao_id: string
          tipo: Database["public"]["Enums"]["tipo_sistema"]
          trechos?: number
        }
        Update: {
          created_at?: string
          id?: string
          identificacao?: string
          metragem?: number
          ordem?: number
          organization_id?: string
          origem?: string
          revisao_id?: string
          tipo?: Database["public"]["Enums"]["tipo_sistema"]
          trechos?: number
        }
        Relationships: [
          {
            foreignKeyName: "sistemas_dimensionados_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sistemas_dimensionados_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          arquivado_em: string | null
          cliente_id: string
          created_at: string
          created_by: string | null
          distancia_ida_volta_km: number | null
          endereco: string | null
          id: string
          motivo_arquivo: string | null
          nome: string
          observacoes: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          arquivado_em?: string | null
          cliente_id: string
          created_at?: string
          created_by?: string | null
          distancia_ida_volta_km?: number | null
          endereco?: string | null
          id?: string
          motivo_arquivo?: string | null
          nome: string
          observacoes?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          arquivado_em?: string | null
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          distancia_ida_volta_km?: number | null
          endereco?: string | null
          id?: string
          motivo_arquivo?: string | null
          nome?: string
          observacoes?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "unidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_cliente_tenant_operacional"
            columns: ["organization_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "unidades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capacidades: {
        Row: {
          capacidade: string
          concedido_por: string
          created_at: string
          organization_id: string
          user_id: string
        }
        Insert: {
          capacidade: string
          concedido_por?: string
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          capacidade?: string
          concedido_por?: string
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capacidades_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _alvos_rascunho_op: {
        Args: { _op: string }
        Returns: {
          alvo: number
          atual: number
          codigo: string
          demanda_id: string
          produzida: number
        }[]
      }
      _plano_ordens: { Args: { _escopo: string; _rev: string }; Returns: Json }
      aceitar_projeto_operacional: {
        Args: {
          _chave: string
          _motivo?: string
          _org: string
          _revisao: string
        }
        Returns: Json
      }
      administrar_vinculo_operacional: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      ag_anexo_autor_destino: {
        Args: {
          _autor: string
          _escrever?: boolean
          _evento: string
          _org: string
        }
        Returns: boolean
      }
      ag_anexo_cancelavel: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      ag_autor_acao: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      ag_autor_ler: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      ag_bloqueios: { Args: { _id: string; _org: string }; Returns: Json }
      ag_configuracao: { Args: { _org: string }; Returns: Json }
      ag_dashboard: {
        Args: { _filtros?: Json; _fim: string; _inicio: string; _org: string }
        Returns: Json
      }
      ag_evento_json: {
        Args: {
          _ate?: string
          _de?: string
          _id: string
          _org: string
          _tz?: string
        }
        Returns: Json
      }
      ag_evento_resumo: {
        Args: { _fim?: string; _id: string; _inicio?: string; _org: string }
        Returns: Json
      }
      ag_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      ag_expandir_datas: {
        Args: { _ate: string; _de: string; _evento: Json; _regra: Json }
        Returns: {
          data: string
          fim: string
          ignorada: boolean
          inicio: string
          ordinal: number
        }[]
      }
      ag_fuso: { Args: { _tz: string }; Returns: string }
      ag_gravar: {
        Args: {
          _autor: string
          _dados: Json
          _data?: string
          _expected?: number
          _id?: string
          _job?: string
          _org: string
          _serie?: string
          _serie_versao?: string
        }
        Returns: string
      }
      ag_historico: {
        Args: {
          _id: string
          _limite?: number
          _org: string
          _pagina?: number
          _tipo: string
        }
        Returns: Json
      }
      ag_lembretes: { Args: { _limite?: number }; Returns: Json }
      ag_liberar_ferramentas: {
        Args: {
          _id: string
          _motivo: string
          _org: string
          _preservar_retiradas?: boolean
        }
        Returns: undefined
      }
      ag_listar: {
        Args: {
          _busca?: string
          _equipe?: string
          _estado?: string
          _fim: string
          _inicio: string
          _limite?: number
          _minha?: boolean
          _org: string
          _pagina?: number
          _timezone: string
          _tipo?: string
        }
        Returns: Json
      }
      ag_listar_v2: {
        Args: {
          _filtros?: Json
          _fim: string
          _inicio: string
          _limite?: number
          _org: string
          _pagina?: number
        }
        Returns: Json
      }
      ag_materializar: {
        Args: {
          _ate: string
          _estrito?: boolean
          _job?: string
          _org: string
          _serie: string
        }
        Returns: Json
      }
      ag_modelo: { Args: { _id: string; _org: string }; Returns: Json }
      ag_notificacoes: {
        Args: { _limite?: number; _org: string; _pagina?: number }
        Returns: Json
      }
      ag_obter: { Args: { _id: string; _org: string }; Returns: Json }
      ag_obter_acao: { Args: { _id: string; _org: string }; Returns: Json }
      ag_opcoes: {
        Args: {
          _busca?: string
          _cliente?: string
          _limite?: number
          _org: string
          _pagina?: number
          _tipo: string
        }
        Returns: Json
      }
      ag_payload: { Args: { _d: Json; _keys: string[] }; Returns: undefined }
      ag_pendentes: {
        Args: {
          _busca?: string
          _limite?: number
          _minhas?: boolean
          _org: string
          _pagina?: number
        }
        Returns: Json
      }
      ag_pendentes_v2: {
        Args: {
          _filtros?: Json
          _limite?: number
          _minhas?: boolean
          _org: string
          _pagina?: number
        }
        Returns: Json
      }
      ag_permissoes: { Args: { _id: string; _org: string }; Returns: Json }
      ag_pessoa: { Args: { _autor: string; _org: string }; Returns: string }
      ag_registrar: {
        Args: {
          _anterior: string
          _autor: string
          _efeito: string
          _id: string
          _org: string
        }
        Returns: undefined
      }
      ag_reservar_ferramentas: {
        Args: { _autor: string; _id: string; _job?: string; _org: string }
        Returns: undefined
      }
      ag_resolver_periodo: { Args: { _d: Json }; Returns: Json }
      ag_resultado: { Args: { _org: string; _r: Json }; Returns: Json }
      ag_salvar_acao_base: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      ag_serie_comando: {
        Args: { _autor: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      ag_serie_json: { Args: { _id: string; _org: string }; Returns: Json }
      ag_texto: {
        Args: { _d: Json; _key: string; _max: number; _min: number }
        Returns: string
      }
      ag_transicionar: {
        Args: {
          _autor: string
          _estado: string
          _excecao?: boolean
          _expected: number
          _id: string
          _motivo?: string
          _org: string
        }
        Returns: string
      }
      ag_transicionar_acao_base: {
        Args: {
          _chave: string
          _estado: string
          _expected_version: number
          _id: string
          _motivo?: string
          _org: string
        }
        Returns: Json
      }
      ag_travar_ferramentas: {
        Args: { _dados?: Json; _id: string; _org: string }
        Returns: undefined
      }
      ag_travar_origem: {
        Args: { _acao: string; _lev: string; _org: string }
        Returns: undefined
      }
      ag_universo: {
        Args: { _filtros?: Json; _fim: string; _inicio: string; _org: string }
        Returns: {
          acao_id: string | null
          bloqueia_recursos: boolean
          cliente_id: string | null
          created_at: string
          created_by: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string
          dia_inteiro: boolean
          estado: string
          excecao: boolean
          fim: string
          geracao_job_id: string | null
          gerado_automaticamente: boolean
          id: string
          inicio: string
          levantamento_id: string | null
          local: string
          motivo: string | null
          ocorrencia_data: string | null
          organization_id: string
          origem_ocorrencia: string | null
          projeto_id: string | null
          responsavel_id: string
          serie_id: string | null
          serie_versao_id: string | null
          timezone: string
          tipo: string
          titulo: string
          unidade_id: string | null
          updated_at: string
          version: number
          visibilidade: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agenda_eventos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ag_validar_regra: { Args: { _evento: Json; _regra: Json }; Returns: Json }
      agenda_ler_evento: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      agenda_registrar_revisao: {
        Args: { _anterior: string; _efeito: string; _id: string; _org: string }
        Returns: undefined
      }
      agenda_reservar: {
        Args: { _id: string; _org: string }
        Returns: undefined
      }
      alm_autor_gerir: {
        Args: { _autor: string; _org: string }
        Returns: boolean
      }
      alm_autor_ler_ferramenta: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      alm_decimal: {
        Args: { _positivo?: boolean; _valor: Json }
        Returns: number
      }
      alm_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      alm_executar_ferramenta: {
        Args: { _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      alm_ferramenta_liberada: {
        Args: {
          _fim: string
          _id: string
          _inicio: string
          _org: string
          _timezone: string
        }
        Returns: undefined
      }
      alm_gerir: { Args: { _org: string }; Returns: boolean }
      alm_ler_ferramenta: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      alm_ler_produto: { Args: { _id: string; _org: string }; Returns: boolean }
      alm_ler_reserva: { Args: { _id: string; _org: string }; Returns: boolean }
      alm_listar: {
        Args: {
          _busca?: string
          _estado?: string
          _limite?: number
          _local?: string
          _org: string
          _pagina?: number
          _tipo: string
        }
        Returns: Json
      }
      alm_livre_lote: {
        Args: { _conferencia: string; _local: string; _org: string }
        Returns: number
      }
      alm_movimento: {
        Args: {
          _conferencia: string
          _local: string
          _op: string
          _org: string
          _pessoa: string
          _posicao: string
          _produto: string
          _quantidade: number
          _reserva: string
        }
        Returns: undefined
      }
      alm_obter: {
        Args: { _id: string; _org: string; _tipo: string }
        Returns: Json
      }
      alm_opcoes: {
        Args: {
          _busca?: string
          _limite?: number
          _local?: string
          _org: string
          _pagina?: number
          _tipo: string
        }
        Returns: Json
      }
      alm_permissoes: { Args: { _org: string }; Returns: Json }
      alm_produto_fracao: {
        Args: { _id: string; _org: string; _quantidade: number }
        Returns: undefined
      }
      alm_produto_json: { Args: { _id: string; _org: string }; Returns: Json }
      alm_reserva_quantidades: {
        Args: { _id: string; _org: string }
        Returns: Json
      }
      alm_row: {
        Args: { _id: string; _org: string; _tipo: string }
        Returns: Json
      }
      alm_saldo: {
        Args: {
          _conferencia?: string
          _local?: string
          _org: string
          _produto: string
        }
        Returns: Json
      }
      alm_texto: {
        Args: { _campo: string; _dados: Json; _max: number; _min?: number }
        Returns: string
      }
      alm_travar: { Args: { _org: string }; Returns: undefined }
      alm_validar_payload: {
        Args: { _campos: string[]; _dados: Json }
        Returns: undefined
      }
      aplicar_demanda: {
        Args: { _hash: string; _linhas: Json; _remover: string[]; _rev: string }
        Returns: Json
      }
      arquivar_cadastro_cliente: {
        Args: {
          _arquivar: boolean
          _chave: string
          _entidade: string
          _expected_version: number
          _id: string
          _motivo: string
          _org: string
        }
        Returns: Json
      }
      arvore_produto: {
        Args: { _nivel?: number; _produto: string }
        Returns: Json
      }
      atualizar_componentes_revisao: {
        Args: { _esperados: Json; _ids: string[]; _patch: Json; _rev: string }
        Returns: number
      }
      cadastrar_produto_codificado: {
        Args: {
          _chave: string
          _custo: number
          _dados: Json
          _familia: string
          _org: string
          _tipo: string
        }
        Returns: Json
      }
      can_see_costs: { Args: { _org: string }; Returns: boolean }
      cancelar_anexo_operacional: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      cancelar_anexo_operacional_ate27: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      cancelar_anexo_operacional_ate30: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      capturar_revisao: {
        Args: { _operacao?: string; _rev: string }
        Returns: Json
      }
      cliente_marca_pode_enviar: {
        Args: { p_caminho: string }
        Returns: boolean
      }
      concluir_revisao: {
        Args: {
          _calculo: Json
          _operacao?: string
          _rev: string
          _snapshot: Json
          _versao: number
          _versao_salva: number
        }
        Returns: Json
      }
      confirmar_anexo_operacional: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string }
        Returns: undefined
      }
      confirmar_participacao_agenda: {
        Args: {
          _chave: string
          _confirmacao: string
          _expected_version: number
          _id: string
          _org: string
        }
        Returns: Json
      }
      consultar_jobs_operacionais: { Args: { _org: string }; Returns: Json }
      criar_organizacao: { Args: { _nome: string }; Returns: string }
      diferencas_comerciais: {
        Args: { _a: Json; _b: Json; _rev: string }
        Returns: {
          antes: Json
          campo: string
          depois: Json
          justificativa: string
          nome: string
          objeto: string
        }[]
      }
      diferencas_rascunho: {
        Args: { _a: Json; _b: Json }
        Returns: {
          antes: Json
          campo: string
          depois: Json
          justificativa: string
          nome: string
          objeto: string
        }[]
      }
      editar_produto: {
        Args: { _dados: Json; _produto: string }
        Returns: Json
      }
      encerrar_membro_equipe: {
        Args: {
          _chave: string
          _fim: string
          _id: string
          _motivo: string
          _org: string
        }
        Returns: Json
      }
      eq_executar_indisponibilidade: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      eq_listar_indisponibilidades: {
        Args: {
          _limite?: number
          _org: string
          _pagina?: number
          _pessoa: string
        }
        Returns: Json
      }
      est_autor_base: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      est_autor_fonte: {
        Args: {
          _autor: string
          _doc: string
          _lev: string
          _org: string
          _pe: string
        }
        Returns: boolean
      }
      est_autor_ler: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      est_bloqueios: { Args: { _org: string; _revisao: string }; Returns: Json }
      est_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      est_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string }
        Returns: Json
      }
      est_doc_fonte_valida: {
        Args: {
          _cliente: string
          _documento: string
          _org: string
          _unidade: string
        }
        Returns: boolean
      }
      est_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      est_gravar_fonte: {
        Args: { _d: Json; _estudo: string; _org: string; _revisao: string }
        Returns: string
      }
      est_gravar_medida: {
        Args: {
          _d: Json
          _estudo: string
          _org: string
          _perigo: string
          _revisao: string
        }
        Returns: string
      }
      est_ler: { Args: { _id: string; _org: string }; Returns: boolean }
      est_ler_arquivo: { Args: { _id: string; _org: string }; Returns: boolean }
      est_listar: {
        Args: {
          _busca?: string
          _cliente?: string
          _estado?: string
          _limite?: number
          _org: string
          _pagina?: number
          _responsavel?: string
        }
        Returns: Json
      }
      est_metodos: {
        Args: {
          _busca?: string
          _limite?: number
          _org: string
          _pagina?: number
        }
        Returns: Json
      }
      est_obter: {
        Args: { _id: string; _org: string; _revisao?: string }
        Returns: Json
      }
      est_opcoes: {
        Args: {
          _busca?: string
          _cliente?: string
          _org: string
          _pagina?: number
          _tipo: string
          _unidade?: string
        }
        Returns: Json
      }
      est_pe_fonte_valida: {
        Args: {
          _cliente: string
          _org: string
          _unidade: string
          _versao: string
        }
        Returns: boolean
      }
      est_pode_enviar_arquivo: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      est_preparar_arquivo: {
        Args: {
          _chave: string
          _dados: Json
          _org: string
          _perigo: string
          _revisao: string
        }
        Returns: Json
      }
      est_profissional: {
        Args: { _autor: string; _org: string }
        Returns: string
      }
      est_proximo_codigo: { Args: { _org: string }; Returns: string }
      est_publicar_metodo: {
        Args: { _chave: string; _dados: Json; _metodo: string; _org: string }
        Returns: Json
      }
      est_snapshot: { Args: { _org: string; _revisao: string }; Returns: Json }
      est_travar_autor: {
        Args: { _autor: string; _org: string }
        Returns: undefined
      }
      est_travar_destino: {
        Args: {
          _autor: string
          _editavel?: boolean
          _org: string
          _revisao: string
        }
        Returns: {
          analise: string
          aprovado_em: string | null
          aprovado_por: string | null
          art_referencia: string
          base_id: string | null
          conclusao: string
          created_at: string
          created_by: string
          escopo: string
          estado: string
          estudo_id: string
          id: string
          metodo_versao_id: string | null
          numero: number
          organization_id: string
          premissas: string
          responsabilidade_tecnica: string
          responsavel_tecnico_id: string
          revisor_id: string | null
          snapshot: Json | null
          snapshot_sha256: string | null
          submissao_atual_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "estudo_revisoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      est_travar_fontes: {
        Args: { _estudo: string; _org: string }
        Returns: undefined
      }
      est_validar_textos: {
        Args: { _campos: string[]; _d: Json }
        Returns: undefined
      }
      est_vincular_acao: {
        Args: { _chave: string; _dados: Json; _medida: string; _org: string }
        Returns: Json
      }
      executar_job_agenda_notificacoes: { Args: never; Returns: Json }
      formatar_codigo: {
        Args: { _familia: string; _seq: number; _tipo: string }
        Returns: string
      }
      gerar_ordens: {
        Args: {
          _chave: string
          _escopo?: string
          _plano_hash?: string
          _rev: string
        }
        Returns: Json
      }
      has_org_role: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      hash_tecnico: { Args: { _rev: string }; Returns: string }
      importar_produto_oficial: {
        Args: { _codigo: string; _dados: Json; _org: string }
        Returns: string
      }
      incluir_produto_revisao: {
        Args: { _produto: string; _quantidade: number; _rev: string }
        Returns: Json
      }
      iniciar_anexo_agenda: {
        Args: { _chave: string; _dados: Json; _evento: string; _org: string }
        Returns: Json
      }
      iniciar_anexo_pet: {
        Args: { _chave: string; _dados: Json; _org: string; _pet: string }
        Returns: Json
      }
      iniciar_anexo_pet_ate32: {
        Args: { _chave: string; _dados: Json; _org: string; _pet: string }
        Returns: Json
      }
      is_member: { Args: { _org: string }; Returns: boolean }
      lev_adotar_medicao: {
        Args: {
          _campo: string
          _chave: string
          _medicao: string
          _org: string
          _preview_hash: string
          _revisao: string
          _sistema: string
        }
        Returns: Json
      }
      lev_autor_ler: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      lev_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      lev_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string }
        Returns: undefined
      }
      lev_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      lev_gravar_medicao: {
        Args: {
          _d: Json
          _levantamento: string
          _org: string
          _ponto: string
          _revisao: string
        }
        Returns: string
      }
      lev_ler: { Args: { _id: string; _org: string }; Returns: boolean }
      lev_listar: {
        Args: {
          _busca?: string
          _cliente?: string
          _estado?: string
          _limite?: number
          _org: string
          _pagina?: number
          _responsavel?: string
        }
        Returns: Json
      }
      lev_obter: {
        Args: { _id: string; _org: string; _revisao?: string }
        Returns: Json
      }
      lev_pode_enviar_arquivo: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      lev_preparar_arquivo: {
        Args: {
          _chave: string
          _dados: Json
          _org: string
          _ponto: string
          _revisao: string
        }
        Returns: Json
      }
      lev_prever_adocao: {
        Args: {
          _campo: string
          _medicao: string
          _org: string
          _revisao: string
          _sistema: string
        }
        Returns: Json
      }
      lev_profissional: { Args: { _org: string }; Returns: string }
      lev_proximo_codigo: { Args: { _org: string }; Returns: string }
      lev_publicar_modelo: {
        Args: { _chave: string; _dados: Json; _modelo: string; _org: string }
        Returns: Json
      }
      lev_travar_autor: {
        Args: { _autor: string; _org: string }
        Returns: undefined
      }
      lev_travar_destino: {
        Args: {
          _autor: string
          _editavel?: boolean
          _org: string
          _revisao: string
        }
        Returns: {
          aprovado_em: string | null
          aprovado_por: string | null
          base_id: string | null
          created_at: string
          created_by: string
          estado: string
          fim_previsto: string | null
          id: string
          inicio_previsto: string | null
          levantamento_id: string
          modelo_versao_id: string | null
          numero: number
          organization_id: string
          snapshot: Json | null
          snapshot_sha256: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "levantamento_revisoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lev_unidade_compativel: {
        Args: { _grandeza: string; _unidade: string }
        Returns: boolean
      }
      lev_validar_coleta: {
        Args: { _org: string; _revisao: string }
        Returns: undefined
      }
      listar_anexos_operacionais: {
        Args: { _org: string; _pai: Json }
        Returns: Json
      }
      listar_anexos_operacionais_ate27: {
        Args: { _org: string; _pai: Json }
        Returns: Json
      }
      listar_anexos_operacionais_ate30: {
        Args: { _org: string; _pai: Json }
        Returns: Json
      }
      listar_cadastros_cliente: {
        Args: {
          _busca?: string
          _cliente?: string
          _grupo?: string
          _limite?: number
          _org: string
          _pagina?: number
          _situacao?: string
        }
        Returns: Json
      }
      listar_eventos_agenda: {
        Args: {
          _fim: string
          _inicio: string
          _minha?: boolean
          _org: string
          _pagina?: number
          _tamanho?: number
        }
        Returns: Json
      }
      marcar_notificacao_lida: {
        Args: { _id: string; _org: string }
        Returns: undefined
      }
      nr_aplicabilidade_manifesto_aplicar: {
        Args: {
          p_manifesto: Json
          p_org: string
          p_sistema: string
          p_versao: string
        }
        Returns: Json
      }
      nr_arquivo_alterar: {
        Args: {
          p_chave: string
          p_comando: string
          p_dados: Json
          p_expected_version: number
          p_id: string
          p_org: string
        }
        Returns: Json
      }
      nr_arquivo_cancelar: {
        Args: { p_chave: string; p_id: string; p_motivo: string; p_org: string }
        Returns: Json
      }
      nr_arquivo_confirmar: {
        Args: {
          p_autor: string
          p_id: string
          p_mime: string
          p_org: string
          p_sha256: string
          p_tamanho: number
        }
        Returns: Json
      }
      nr_arquivo_confirmar_interno: {
        Args: {
          p_autor: string
          p_id: string
          p_importacao: boolean
          p_mime: string
          p_org: string
          p_sha256: string
          p_tamanho: number
        }
        Returns: Json
      }
      nr_arquivo_consumo: { Args: { p_org: string }; Returns: Json }
      nr_arquivo_destino: {
        Args: { p_id: string; p_importacao?: boolean; p_org: string }
        Returns: boolean
      }
      nr_arquivo_falhar: {
        Args: { p_autor: string; p_id: string; p_motivo: string; p_org: string }
        Returns: undefined
      }
      nr_arquivo_importar_confirmar: {
        Args: {
          p_id: string
          p_mime: string
          p_org: string
          p_sha256: string
          p_tamanho: number
        }
        Returns: Json
      }
      nr_arquivo_importar_preparar: {
        Args: { p_chave: string; p_dados: Json; p_org: string }
        Returns: Json
      }
      nr_arquivo_importar_vinculo: {
        Args: {
          p_arquivo: string
          p_chave: string
          p_destino: Json
          p_evidencia: Json
          p_org: string
        }
        Returns: string
      }
      nr_arquivo_ler: {
        Args: { p_id: string; p_org: string }
        Returns: boolean
      }
      nr_arquivo_limites: { Args: { p_org: string }; Returns: Json }
      nr_arquivo_listar: {
        Args: { p_filtros?: Json; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_arquivo_pode_enviar: {
        Args: { p_id: string; p_org: string }
        Returns: boolean
      }
      nr_arquivo_preparar: {
        Args: { p_chave: string; p_dados: Json; p_org: string }
        Returns: Json
      }
      nr_arquivo_preparar_interno: {
        Args: {
          p_autor: string
          p_chave: string
          p_dados: Json
          p_importacao: boolean
          p_org: string
        }
        Returns: Json
      }
      nr_arquivo_versoes_listar: {
        Args: {
          p_arquivo: string
          p_limite?: number
          p_norma: string
          p_org: string
          p_pagina?: number
        }
        Returns: Json
      }
      nr_concluir_importacao: {
        Args: { p_lote: string; p_org: string }
        Returns: Json
      }
      nr_condicao_levantamento: {
        Args: { p_condicao: Json; p_local: Json; p_respostas: Json }
        Returns: Json
      }
      nr_consultar: {
        Args: {
          p_filtros?: Json
          p_norma: string
          p_org: string
          p_recurso: string
        }
        Returns: Json
      }
      nr_consultar_base_68: {
        Args: {
          p_filtros?: Json
          p_norma: string
          p_org: string
          p_recurso: string
        }
        Returns: Json
      }
      nr_contexto_associar: {
        Args: {
          p_chave: string
          p_cliente: string
          p_normas: string[]
          p_org: string
          p_unidade: string
        }
        Returns: Json
      }
      nr_contextos_acervo: {
        Args: { p_org: string }
        Returns: {
          cliente_id: string
          normas: string[]
          unidade_id: string
        }[]
      }
      nr_documento_campos: {
        Args: {
          p_cliente: string
          p_local?: string
          p_norma: string
          p_org: string
          p_unidade: string
        }
        Returns: Json
      }
      nr_documento_campos_interno: {
        Args: {
          p_cliente: string
          p_local: string
          p_norma: string
          p_org: string
          p_unidade: string
        }
        Returns: Json
      }
      nr_documento_copia_comprovada: {
        Args: { p_dados: Json; p_org: string }
        Returns: boolean
      }
      nr_documento_de_modelo: {
        Args: { p_chave: string; p_dados: Json; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_documento_e_copia: {
        Args: { p_dados: Json; p_tipo: string }
        Returns: boolean
      }
      nr_documento_resumo: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_documento_resumo_base_68: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_documento_revisar_impactos: {
        Args: {
          p_base_expected_version: number
          p_chave: string
          p_documento: string
          p_expected_version: number
          p_motivo: string
          p_norma: string
          p_org: string
          p_revisao: string
        }
        Returns: Json
      }
      nr_executar: {
        Args: {
          p_chave: string
          p_comando: string
          p_dados: Json
          p_expected_version: number
          p_id: string
          p_norma: string
          p_org: string
          p_recurso: string
        }
        Returns: Json
      }
      nr_fonte_oficial_valida: {
        Args: { p_norma: string; p_url: string }
        Returns: boolean
      }
      nr_foto_ocorrencia_completar: {
        Args: { p_dados: Json; p_org: string }
        Returns: string
      }
      nr_foto_ocorrencia_importar: {
        Args: { p_dados: Json; p_org: string }
        Returns: string
      }
      nr_foto_ocorrencias_ler: {
        Args: { p_local: string; p_org: string }
        Returns: Json
      }
      nr_historico_detalhe: {
        Args: { p_id: number; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_historico_listar: {
        Args: {
          p_limite?: number
          p_norma: string
          p_org: string
          p_pagina?: number
          p_recurso: string
          p_registro: string
        }
        Returns: Json
      }
      nr_historico_tecnico_consultar: {
        Args: { p_filtros: Json; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_imagem_representacao_ler: {
        Args: { p_arquivo: string; p_org: string; p_variante: string }
        Returns: Json
      }
      nr_imagem_trabalho_concluir: {
        Args: { p_id: string; p_lease: string; p_resultado: Json }
        Returns: undefined
      }
      nr_imagem_trabalho_obter:
        | { Args: { p_limite?: number }; Returns: Json }
        | { Args: { p_limite: number; p_processador: string }; Returns: Json }
      nr_imagem_worker_disparar: { Args: never; Returns: Json }
      nr_imagem_worker_validar: { Args: { p_token: string }; Returns: boolean }
      nr_import_fila_comandar: {
        Args: { p_acao: string; p_fila: string; p_org: string }
        Returns: Json
      }
      nr_import_fila_consultar: {
        Args: { p_id?: string; p_org: string; p_pagina?: number }
        Returns: Json
      }
      nr_import_fila_criar: {
        Args: {
          p_chave: string
          p_fim: string
          p_inicio: string
          p_manifesto: Json
          p_norma: string
          p_org: string
          p_origem: string
          p_total: number
        }
        Returns: Json
      }
      nr_import_fila_staging: {
        Args: { p_fila: string; p_itens: Json; p_org: string }
        Returns: Json
      }
      nr_import_processar: { Args: { p_limite?: number }; Returns: Json }
      nr_import_snapshot: {
        Args: { p_entidade: string; p_id: string; p_org: string }
        Returns: Json
      }
      nr_importacao_inspecionar: {
        Args: {
          p_filtros?: Json
          p_item?: string
          p_lote?: string
          p_org: string
        }
        Returns: Json
      }
      nr_importar_item: {
        Args: {
          p_capturado_em: string
          p_destino: Json
          p_externo_id: string
          p_hash: string
          p_lote: string
          p_org: string
          p_payload: Json
          p_tipo: string
        }
        Returns: Json
      }
      nr_iniciar_importacao: {
        Args: {
          p_chave: string
          p_manifesto: Json
          p_org: string
          p_origem: string
          p_snapshot_fim: string
          p_snapshot_inicio: string
        }
        Returns: string
      }
      nr_levantamento_apresentacao: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_levantamento_diagnostico: {
        Args: { p_local: Json; p_modelo: Json; p_respostas: Json }
        Returns: Json
      }
      nr_levantamento_validacao: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_linha: { Args: { p_linha: Json; p_recurso: string }; Returns: Json }
      nr_linha_base_67: {
        Args: { p_linha: Json; p_recurso: string }
        Returns: Json
      }
      nr_local_resumo: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_local_resumo_base_68: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_modelo_publicacao_contexto: {
        Args: { p_id: string; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_modelo_publicar_tecnico: {
        Args: {
          p_chave: string
          p_evidencia: Json
          p_expected_version: number
          p_id: string
          p_norma: string
          p_org: string
        }
        Returns: Json
      }
      nr_painel_contadores_documentos: {
        Args: { p_filtros?: Json; p_norma: string; p_org: string }
        Returns: Json
      }
      nr_pasta_ordenar: {
        Args: {
          p_chave: string
          p_direcao: string
          p_expected_version: number
          p_id: string
          p_norma: string
          p_org: string
        }
        Returns: Json
      }
      nr_pendencia_aplicabilidade_candidata: {
        Args: { p_id: string; p_org: string }
        Returns: Json
      }
      nr_registro_visivel: {
        Args: {
          p_norma: string
          p_org: string
          p_recurso: string
          p_registro: string
        }
        Returns: boolean
      }
      nr_revisao_detalhe: {
        Args: {
          p_norma: string
          p_org: string
          p_recurso: string
          p_registro: string
          p_revisao: string
        }
        Returns: Json
      }
      nr_revisoes_listar: {
        Args: {
          p_limite?: number
          p_norma: string
          p_org: string
          p_pagina?: number
          p_recurso: string
          p_registro: string
        }
        Returns: Json
      }
      nr_tag_ordem: { Args: { p_tag: string }; Returns: string[] }
      nr_uuid_seguro: { Args: { p_valor: string }; Returns: string }
      nr_valor_preenchido: { Args: { p_valor: Json }; Returns: boolean }
      nr_vincular_documentos_importados: {
        Args: {
          p_evidencia: Json
          p_externo_de: string
          p_externo_para: string
          p_org: string
          p_origem: string
          p_relacao: string
          p_tipo: string
        }
        Returns: undefined
      }
      objeto_rascunho: { Args: { _r: Json; _t: string }; Returns: Json }
      obter_cadastro_cliente: {
        Args: { _entidade: string; _id: string; _org: string }
        Returns: Json
      }
      obter_cliente_operacional: {
        Args: { _id: string; _org: string }
        Returns: Json
      }
      operacao_autor_destino_anexo: {
        Args: { _autor: string; _escrever?: boolean; _org: string; _pai: Json }
        Returns: boolean
      }
      operacao_autor_destino_anexo_ate27: {
        Args: { _autor: string; _escrever?: boolean; _org: string; _pai: Json }
        Returns: boolean
      }
      operacao_autor_destino_anexo_ate30: {
        Args: { _autor: string; _escrever?: boolean; _org: string; _pai: Json }
        Returns: boolean
      }
      operacao_autor_destino_anexo_ate32: {
        Args: { _autor: string; _escrever?: boolean; _org: string; _pai: Json }
        Returns: boolean
      }
      operacao_autor_ler_anexo: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      operacao_autor_pode: {
        Args: { _acao: string; _autor: string; _org: string }
        Returns: boolean
      }
      operacao_concluir: {
        Args: {
          _chave: string
          _comando: string
          _org: string
          _payload: Json
          _resultado: Json
        }
        Returns: Json
      }
      operacao_identidade_propria: {
        Args: { _org: string; _pessoa: string }
        Returns: boolean
      }
      operacao_ler_acao: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      operacao_ler_anexo: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      operacao_minha_pessoa: {
        Args: { _org: string; _pessoa: string }
        Returns: boolean
      }
      operacao_pode: { Args: { _acao: string; _org: string }; Returns: boolean }
      operacao_pode_enviar_anexo: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      operacao_repetir: {
        Args: { _chave: string; _comando: string; _org: string; _payload: Json }
        Returns: Json
      }
      operacao_travar_pai_anexo: {
        Args: { _org: string; _pai: Json }
        Returns: undefined
      }
      operacao_travar_pai_anexo_ate27: {
        Args: { _org: string; _pai: Json }
        Returns: undefined
      }
      operacao_travar_pai_anexo_ate30: {
        Args: { _org: string; _pai: Json }
        Returns: undefined
      }
      os_ler: { Args: { p_id: string; p_org: string }; Returns: boolean }
      pe_autor_acessa: {
        Args: { _autor: string; _org: string; _projeto: string }
        Returns: boolean
      }
      pe_cancelar_arquivo: {
        Args: { _chave: string; _id: string; _motivo: string; _org: string }
        Returns: Json
      }
      pe_confirmar_arquivo: {
        Args: { _autor: string; _id: string; _org: string; _sha256: string }
        Returns: undefined
      }
      pe_executar: {
        Args: { _chave: string; _comando: string; _dados: Json; _org: string }
        Returns: Json
      }
      pe_ler_arquivo: { Args: { _id: string; _org: string }; Returns: boolean }
      pe_ler_projeto: { Args: { _id: string; _org: string }; Returns: boolean }
      pe_pode_enviar_arquivo: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      pe_preparar_arquivo: {
        Args: { _chave: string; _dados: Json; _org: string; _versao: string }
        Returns: Json
      }
      pe_validar_modelo: { Args: { _modelo: Json }; Returns: undefined }
      pet_anexo_autor_destino: {
        Args: {
          _autor: string
          _escrever?: boolean
          _org: string
          _pet: string
        }
        Returns: boolean
      }
      pet_anexo_cancelavel: {
        Args: { _autor: string; _id: string; _org: string }
        Returns: boolean
      }
      pet_autor_ler: {
        Args: { p_autor: string; p_id: string; p_org: string }
        Returns: boolean
      }
      pet_executar: { Args: { p_comando: Json; p_org: string }; Returns: Json }
      pet_executar_ate31: {
        Args: { p_comando: Json; p_org: string }
        Returns: Json
      }
      pet_finalizar_relatorio: {
        Args: {
          p_anexo: string
          p_autor: string
          p_documento: string
          p_org: string
          p_sha256: string
        }
        Returns: Json
      }
      pet_intervalos_efetivos: {
        Args: { p_org: string; p_pet?: string }
        Returns: {
          entrada_em: string
          entrada_id: string
          entrada_original_em: string
          id: string
          pessoa_id: string
          pet_id: string
          retificacao_entrada_id: string
          retificacao_saida_id: string
          saida_em: string
          saida_id: string
          saida_original_em: string
        }[]
      }
      pet_ler: { Args: { p_id: string; p_org: string }; Returns: boolean }
      pet_listar: { Args: { p_filtros?: Json; p_org: string }; Returns: Json }
      pet_obter: { Args: { p_id: string; p_org: string }; Returns: Json }
      pet_obter_ate31: { Args: { p_id: string; p_org: string }; Returns: Json }
      pet_opcoes: { Args: { p_org: string }; Returns: Json }
      pet_operar: { Args: { p_id: string; p_org: string }; Returns: boolean }
      pet_pendencias: { Args: { p_id: string; p_org: string }; Returns: Json }
      pet_preparar_relatorio: {
        Args: {
          p_chave: string
          p_expected_version: number
          p_org: string
          p_pet: string
        }
        Returns: Json
      }
      pet_relatorio_anexo_autorizado: {
        Args: { p_autor: string; p_item: string; p_org: string; p_pet: string }
        Returns: boolean
      }
      pet_relatorio_falhar: {
        Args: { p_documento: string; p_motivo: string; p_org: string }
        Returns: undefined
      }
      pet_retificacao_validar: {
        Args: {
          p_corrigido: string
          p_evento: string
          p_org: string
          p_pet: string
        }
        Returns: Json
      }
      pet_retificar: { Args: { p_comando: Json; p_org: string }; Returns: Json }
      pet_sha256: { Args: { p_valor: Json }; Returns: string }
      pet_validar_assinatura: {
        Args: {
          p_assinatura: string
          p_evento: string
          p_org: string
          p_provedor: string
          p_validacao: Json
        }
        Returns: undefined
      }
      planejar_ordens: {
        Args: { _escopo?: string; _rev: string }
        Returns: Json
      }
      pode: { Args: { _acao: string; _org: string }; Returns: boolean }
      preparar_anexo_operacional: {
        Args: { _chave: string; _dados: Json; _org: string }
        Returns: Json
      }
      previa_codigo: {
        Args: { _familia: string; _org: string; _tipo: string }
        Returns: string
      }
      processar_notificacoes_agenda: {
        Args: { _limite?: number }
        Returns: Json
      }
      proximo_numero: {
        Args: { _org: string; _prefixo: string }
        Returns: string
      }
      proximo_numero_proposta: { Args: { _org: string }; Returns: string }
      qualificacao_validacao_permitida: {
        Args: { _id: string; _org: string }
        Returns: boolean
      }
      reclassificar_produto: {
        Args: {
          _familia: string
          _motivo: string
          _produto: string
          _tipo: string
        }
        Returns: Json
      }
      recodificar_produto: {
        Args: { _familia: string; _produto: string; _tipo: string }
        Returns: Json
      }
      registrar_aquisicao: {
        Args: {
          _chave: string
          _custo_sugerido: number
          _dados: Json
          _produto: string
        }
        Returns: Json
      }
      registrar_indisponibilidade: {
        Args: {
          _chave: string
          _fim: string
          _inicio: string
          _motivo: string
          _org: string
          _pessoa: string
        }
        Returns: Json
      }
      registrar_movimento: {
        Args: {
          _chave: string
          _estorno_de?: string
          _item: string
          _quantidade: number
          _tipo: string
        }
        Returns: Json
      }
      reservar_sequencia: {
        Args: { _familia: string; _org: string; _tipo: string }
        Returns: number
      }
      revisao_editavel: { Args: { _rev: string }; Returns: boolean }
      revisar_rascunho_op: {
        Args: { _chave: string; _op: string }
        Returns: Json
      }
      salvar_acao_operacional: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_cliente_operacional: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_competencia: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_composicao: {
        Args: { _itens: Json; _produto: string; _status: string }
        Returns: Json
      }
      salvar_contato_operacional: {
        Args: {
          _chave: string
          _cliente: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_equipe: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_evento_agenda: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_pessoa: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_qualificacao: {
        Args: {
          _chave: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      salvar_unidade_operacional: {
        Args: {
          _chave: string
          _cliente: string
          _dados: Json
          _expected_version?: number
          _id?: string
          _org: string
        }
        Returns: Json
      }
      snapshot_rascunho: { Args: { _rev: string }; Returns: Json }
      transicionar_acao_operacional: {
        Args: {
          _chave: string
          _estado: string
          _expected_version: number
          _id: string
          _motivo?: string
          _org: string
        }
        Returns: Json
      }
      transicionar_evento_agenda: {
        Args: {
          _chave: string
          _estado: string
          _expected_version: number
          _id: string
          _motivo?: string
          _org: string
        }
        Returns: Json
      }
      transicionar_qualificacao: {
        Args: {
          _chave: string
          _estado: string
          _expected_version: number
          _id: string
          _motivo?: string
          _org: string
        }
        Returns: Json
      }
      travar_revisao: { Args: { _rev: string }; Returns: undefined }
      vincular_membro_equipe: {
        Args: {
          _chave: string
          _equipe: string
          _fim?: string
          _inicio: string
          _org: string
          _pessoa: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "comercial"
        | "engenharia"
        | "compras"
        | "financeiro"
        | "campo"
      modalidade_suprimento: "comprar" | "fabricar" | "terceirizar"
      status_revisao:
        | "rascunho"
        | "em_revisao"
        | "enviada"
        | "aceita"
        | "recusada"
        | "substituida"
      tipo_sistema: "TELHADO" | "OVERHEAD"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "comercial",
        "engenharia",
        "compras",
        "financeiro",
        "campo",
      ],
      modalidade_suprimento: ["comprar", "fabricar", "terceirizar"],
      status_revisao: [
        "rascunho",
        "em_revisao",
        "enviada",
        "aceita",
        "recusada",
        "substituida",
      ],
      tipo_sistema: ["TELHADO", "OVERHEAD"],
    },
  },
} as const
