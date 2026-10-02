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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
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
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ordem_producao_itens"
            referencedColumns: ["id"]
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
      clientes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          id: string
          organization_id: string
          razao_social: string
          situacao: string
          uf: string | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          organization_id: string
          razao_social: string
          situacao?: string
          uf?: string | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          razao_social?: string
          situacao?: string
          uf?: string | null
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
          cliente_id: string
          created_at: string
          email: string | null
          id: string
          nome: string
          organization_id: string
          telefone: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          organization_id: string
          telefone?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          organization_id?: string
          telefone?: string | null
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
            foreignKeyName: "contatos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          created_at: string
          id: string
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id: string
          quantidade_necessaria: number
          quantidade_planejada: number
          revisao_componente_id: string
          revisao_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          modalidade: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id: string
          quantidade_necessaria: number
          quantidade_planejada: number
          revisao_componente_id: string
          revisao_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          modalidade?: Database["public"]["Enums"]["modalidade_suprimento"]
          organization_id?: string
          quantidade_necessaria?: number
          quantidade_planejada?: number
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
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
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
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
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
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
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
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          created_at: string
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
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "proposta_revisoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      produto_custos: {
        Row: {
          created_at: string
          created_by: string | null
          custo: number
          fornecedor_id: string | null
          id: string
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
          dimensoes: string | null
          fabricante_id: string | null
          familia: string | null
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
          dimensoes?: string | null
          fabricante_id?: string | null
          familia?: string | null
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
          dimensoes?: string | null
          fabricante_id?: string | null
          familia?: string | null
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
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ordem_compra_itens"
            referencedColumns: ["id"]
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
          cliente_id: string
          created_at: string
          distancia_ida_volta_km: number | null
          endereco: string | null
          id: string
          nome: string
          organization_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          distancia_ida_volta_km?: number | null
          endereco?: string | null
          id?: string
          nome: string
          organization_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          distancia_ida_volta_km?: number | null
          endereco?: string | null
          id?: string
          nome?: string
          organization_id?: string
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
            foreignKeyName: "unidades_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      capturar_revisao: {
        Args: { _operacao?: string; _rev: string }
        Returns: Json
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
      formatar_codigo: {
        Args: { _familia: string; _seq: number; _tipo: string }
        Returns: string
      }
      has_org_role: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      hash_tecnico: { Args: { _rev: string }; Returns: string }
      incluir_produto_revisao: {
        Args: { _produto: string; _quantidade: number; _rev: string }
        Returns: Json
      }
      is_member: { Args: { _org: string }; Returns: boolean }
      objeto_rascunho: { Args: { _r: Json; _t: string }; Returns: Json }
      pode: { Args: { _acao: string; _org: string }; Returns: boolean }
      previa_codigo: {
        Args: { _familia: string; _org: string; _tipo: string }
        Returns: string
      }
      proximo_numero: {
        Args: { _org: string; _prefixo: string }
        Returns: string
      }
      proximo_numero_proposta: { Args: { _org: string }; Returns: string }
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
      salvar_composicao: {
        Args: { _itens: Json; _produto: string; _status: string }
        Returns: Json
      }
      snapshot_rascunho: { Args: { _rev: string }; Returns: Json }
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
