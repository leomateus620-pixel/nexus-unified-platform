import { NrSurveyField, NrSurveyValue } from "./NrSurveyFields";
import { patchNrLocalTechnical } from "./local-technical";
import { surveyApplicability, surveyObject, type SurveyFieldDefinition } from "./survey-projection";
import "./survey.css";

const field = (
  id: string,
  nome: string,
  tipo: SurveyFieldDefinition["tipo"] = "texto",
  extra: Partial<SurveyFieldDefinition> = {},
): SurveyFieldDefinition => ({ id, nome, tipo, obrigatorio: false, ...extra });
const choices = (id: string, nome: string, opcoes: string[]) =>
  field(id, nome, "selecao", { opcoes });
const multi = (id: string, nome: string, opcoes: string[]) =>
  field(id, nome, "multipla", { opcoes });
const yesNo = ["Sim", "Não", "Não verificado"];
const dimensions = (id: string, nome: string, forms: string[]) =>
  field(id, nome, "numero", { mostrar_se: { campo: "forma", valor: forms } });
const openingFields = [
  choices("modelo", "Modelo da abertura", [
    "Tampa flangeada",
    "Tampa articulada",
    "Escotilha",
    "Janela",
    "Alçapão",
    "Abertura livre",
    "Outro",
  ]),
  choices("formato", "Formato", ["Circular", "Retangular", "Quadrada", "Irregular"]),
  field("diametro", "Diâmetro (m)", "numero", {
    mostrar_se: { campo: "formato", valor: ["Circular"] },
  }),
  field("largura", "Largura (m)", "numero", {
    mostrar_se: { campo: "formato", valor: ["Retangular", "Quadrada", "Irregular"] },
  }),
  field("altura_vao", "Altura do vão (m)", "numero", {
    mostrar_se: { campo: "formato", valor: ["Retangular", "Quadrada", "Irregular"] },
  }),
  choices("posicao", "Posição", [
    "Superior",
    "Lateral superior",
    "Lateral inferior",
    "Frontal",
    "Inferior",
  ]),
  choices("orientacao", "Orientação de entrada", ["Vertical", "Horizontal", "Inclinada"]),
  field("altura_piso", "Altura em relação ao piso (m)", "numero"),
  choices("obstrucao", "Obstrução ou interferência", yesNo),
];
const rootFields = [
  field("setor", "Área / setor"),
  choices("enquadramento", "Enquadramento proposto", [
    "confirmado_ec",
    "nao_ec",
    "altura",
    "nao_avaliado",
  ]),
  field("processo", "Processo atendido"),
  field("acesso", "Acesso e evacuação", "texto_longo"),
  multi("atividades", "Atividades realizadas", [
    "Limpeza",
    "Inspeção/manutenção",
    "Reparo estrutural",
    "Desobstrução",
    "Pintura",
    "Solda a quente",
    "Instalação de equipamento",
    "Resgate",
  ]),
  field("aberturas", "Aberturas e bocas de visita", "lista", {
    subcampos: openingFields,
    rotulo_adicionar: "Adicionar abertura",
  }),
];
const cadastroFields = [
  field("tipo_construtivo", "Tipo construtivo e fabricante"),
  field("material", "Material de construção"),
  choices("criterio_ventilacao", "Ventilação natural deficiente", yesNo),
  choices("criterio_acesso", "Meios de entrada e saída limitados", yesNo),
  choices("criterio_ocupacao", "Não projetado para ocupação contínua", yesNo),
  field("frequencia_entrada", "Frequência de entrada"),
  choices("condicao_espaco", "Condição do espaço", ["Ativo", "Inativo", "Desativado"]),
  choices("sinalizacao_existe", "Sinalização no acesso", yesNo),
  choices("sinalizacao_estado", "Estado da sinalização", [
    "Legível e íntegra",
    "Desgastada",
    "Ilegível",
    "Não se aplica",
  ]),
  multi("riscos", "Riscos reconhecidos", [
    "Químico",
    "Físico",
    "Biológico",
    "Ergonômico",
    "Acidentes",
    "Engolfamento",
    "Soterramento",
    "Atmosfera deficiente em oxigênio",
    "Atmosfera inflamável",
    "Superfície aquecida",
    "Partes móveis",
    "Energia elétrica",
    "Queda de altura",
  ]),
  field("observacao_riscos", "Observações sobre riscos", "texto_longo"),
  multi("requisitos", "Requisitos registrados", [
    "PET emitida antes da entrada",
    "Avaliação atmosférica prévia",
    "Monitoramento contínuo",
    "Vigia permanente",
    "Bloqueio de energias",
    "Comunicação com a área",
    "Iluminação adequada",
    "Equipe treinada NR-33",
  ]),
  multi("epis", "EPI registrados", [
    "Cinturão tipo paraquedista",
    "Talabarte duplo",
    "Trava-quedas retrátil",
    "Capacete com jugular",
    "Protetor respiratório",
    "Luvas",
    "Botas",
    "Protetor auditivo",
    "Vestimenta química",
    "Máscara autônoma",
  ]),
  field("medidas_gerais", "Medidas gerais", "texto_longo"),
  field("pendencias_campo", "Pendências observadas em campo", "texto_longo"),
];
const geometryFields = [
  choices("forma", "Forma do espaço", [
    "prismatica",
    "armazem_fundo_v",
    "armazem_plano",
    "cilindrica",
    "cilindrica_com_cone",
    "conica",
    "tronco_conica",
    "irregular",
    "informada",
  ]),
  dimensions("comprimento", "Comprimento (m)", [
    "prismatica",
    "armazem_fundo_v",
    "armazem_plano",
    "irregular",
  ]),
  dimensions("largura", "Largura (m)", [
    "prismatica",
    "armazem_fundo_v",
    "armazem_plano",
    "irregular",
  ]),
  dimensions("diametro", "Diâmetro (m)", [
    "cilindrica",
    "cilindrica_com_cone",
    "conica",
    "tronco_conica",
  ]),
  dimensions("diametro_menor", "Diâmetro menor (m)", ["tronco_conica"]),
  dimensions("altura", "Altura da parte reta (m)", [
    "prismatica",
    "armazem_fundo_v",
    "armazem_plano",
    "cilindrica",
    "cilindrica_com_cone",
    "conica",
    "tronco_conica",
    "irregular",
  ]),
  dimensions("altura_cone", "Altura do cone (m)", [
    "cilindrica_com_cone",
    "conica",
    "tronco_conica",
  ]),
  dimensions("altura_fundo", "Altura do fundo (m)", ["armazem_fundo_v"]),
  dimensions("altura_telhado", "Altura do telhado (m)", ["armazem_fundo_v", "armazem_plano"]),
  field("volume_informado", "Volume declarado (m³)", "numero"),
  field("volume_documento", "Volume do documento (m³)", "numero"),
  field("volume_placa", "Volume da placa (m³)", "numero"),
  field("fonte_volume", "Fonte do volume declarado"),
  field("metodo", "Método e fonte das dimensões"),
  field("volume", "Volume histórico calculado (m³)", "calculado"),
];
const rescueFields = [
  field("cenario", "Cenário de resgate", "texto_longo"),
  choices("metodo", "Método registrado", [
    "Tripé móvel com guincho",
    "Sistema giratório fixo",
    "Bandeirinha",
    "Ponto de ancoragem com talha",
    "Resgate por evacuação assistida",
    "Não definido em campo",
  ]),
  field("ancoragem", "Ancoragem registrada"),
  field("rota", "Rota e acesso de resgate", "texto_longo"),
  multi("equipamentos", "Meios de resgate registrados", [
    "Tripé",
    "Guincho",
    "Trava-quedas retrátil com resgate",
    "Maca",
    "Cadeirinha",
    "Cordas e mosquetões",
    "Detector de gases",
    "Nenhum",
  ]),
  field("tempo_resposta", "Tempo de resposta declarado"),
];
const emergencyFields = [
  field("emergencia", "Plano de emergência", "texto_longo"),
  field("resgate_publico", "Resgate público"),
  field("tempo_resgate_publico", "Tempo de resposta público declarado"),
  multi("energias", "Energias registradas", [
    "Elétrica",
    "Mecânica",
    "Hidráulica",
    "Pneumática",
    "Térmica",
    "Química",
    "Gravitacional",
    "Não se aplica",
  ]),
  field("pontos_bloqueio", "Pontos e meios de bloqueio", "texto_longo"),
];
const anchorageFields = [
  choices("situacao", "Situação registrada da ancoragem", [
    "entrada_impedida",
    "uso_condicionado",
    "existente_sem_documentacao",
    "exigido_nao_identificado",
    "documentacao_completa",
  ]),
  field("sistemas", "Sistemas de ancoragem e linhas de vida", "lista", {
    rotulo_adicionar: "Adicionar sistema",
    subcampos: [
      choices("categoria", "Categoria", [
        "Ponto de ancoragem de resgate",
        "Ancoragem individual",
        "Sistema de resgate",
        "Linha de vida vertical",
        "Equipamento portátil",
      ]),
      field("sistema", "Descrição do sistema"),
      choices("existencia", "Existência", [
        "Presente",
        "Não identificado",
        "Ausente",
        "Não verificada",
      ]),
      field("quantidade", "Quantidade ou indicação a confirmar"),
      choices("uso", "Situação de uso registrada", [
        "Liberado",
        "Uso condicionado",
        "Somente após comprovação",
        "Entrada impedida",
        "Não conforme até a documentação",
        "A instalar",
      ]),
      field("fonte", "Fonte documental"),
    ],
  }),
  multi("documentos_apresentados", "Documentos apresentados", [
    "Projeto",
    "Memorial de cálculo",
    "ART",
    "Laudo de ensaio de carga NBR 16325-1",
    "Identificação do sistema",
    "Registro de inspeção periódica",
    "Certificado e ficha técnica do fabricante",
  ]),
  multi("documentos_exigidos", "Documentos exigidos", [
    "Projeto",
    "Memorial de cálculo",
    "ART",
    "Laudo de ensaio de carga NBR 16325-1",
    "Identificação do sistema",
    "Registro de inspeção periódica",
    "Certificado e ficha técnica do fabricante",
  ]),
  field("exigencias", "Exigências e justificativa", "texto_longo"),
  field("fonte", "Base documental"),
];

export function NrLocalTechnicalEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  function group(title: string, branch: string, fields: SurveyFieldDefinition[], open = false) {
    const original = branch ? value[branch] : value;
    const data = branch ? surveyObject(original) : value;
    const unsupported =
      original != null && (typeof original !== "object" || Array.isArray(original));
    const extras = Object.fromEntries(
      Object.entries(data).filter(([key]) => !fields.some((definition) => definition.id === key)),
    );
    return (
      <details className="nr-survey-preserved" key={title} open={open}>
        <summary>{title}</summary>
        {unsupported ? (
          <>
            <p className="nr-source">
              A estrutura histórica deste grupo precisa de conciliação. O conteúdo permanece
              preservado.
            </p>
            <NrSurveyValue value={original} />
          </>
        ) : (
          <>
            <div className="nr-field-grid mt-3">
              {fields
                .filter((definition) => surveyApplicability(definition.mostrar_se, data) !== false)
                .map((definition) => (
                  <div
                    className={
                      ["texto_longo", "multipla", "lista", "checklist"].includes(definition.tipo)
                        ? "nr-wide"
                        : undefined
                    }
                    key={definition.id}
                  >
                    <NrSurveyField
                      field={definition}
                      value={data[definition.id]}
                      onChange={(next) =>
                        onChange(
                          patchNrLocalTechnical(
                            value,
                            branch ? [branch, definition.id] : [definition.id],
                            next,
                          ),
                        )
                      }
                    />
                  </div>
                ))}
            </div>
            {branch && Object.keys(extras).length > 0 && (
              <details className="mt-3">
                <summary>Fonte e informações históricas preservadas</summary>
                <NrSurveyValue value={extras} />
              </details>
            )}
          </>
        )}
      </details>
    );
  }
  const geometry = surveyObject(value["geometria"]);
  const deductions = Array.isArray(geometry["deducoes"])
    ? field("deducoes", "Deduções registradas", "lista", {
        subcampos: [
          field("descricao", "Descrição"),
          field("volume_m3", "Volume da dedução (m³)", "numero"),
          field("fonte", "Fonte"),
        ],
      })
    : field("deducoes", "Deduções declaradas (m³)", "numero");
  return (
    <section aria-label="Editar ficha técnica do local">
      <h3 className="font-semibold mt-4">Ficha técnica</h3>
      <p className="nr-source">
        Alterações são propostas de revisão do cadastro. Datas, autores, validações, cálculos e
        narrativas da origem permanecem preservados. Use o memorial de revisão para calcular
        novamente; este formulário não concede aprovação ou liberação operacional.
      </p>
      {group("Identificação, atividades e acessos", "", rootFields, true)}
      {group("Cadastro técnico, sinalização e requisitos", "cadastro", cadastroFields)}
      {group("Geometria e valores declarados", "geometria", [...geometryFields, deductions])}
      {group("Itens de avaliação", "", [
        field("itens", "Matriz de avaliações por família", "checklist"),
      ])}
      {group("Plano e meios de resgate", "resgate", rescueFields)}
      {group("Emergência e isolamento de energias", "cadastro", emergencyFields)}
      {group("Ancoragens, sistemas e documentos", "ancoragens", anchorageFields)}
    </section>
  );
}
