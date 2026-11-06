# PET Cotrirosa: field parity with the paper form, plus responsive layout

Reference: photo of the Cotrirosa paper form (PET - EC (2).jpeg). Validation case: COTRIROSA → Fábrica de Ração — Santa Rosa → EC 28 · SA 05, opened from the 3D Map and from the operational PET page. Each screen shows whether it is a **Demonstração** or an **Operação** PET.

The work is split into phases. Each phase must build and pass its tests before the next one starts.

## Phase 0: Field matrix (before any code changes)
- Create `docs/nexus-operacional/pet/matriz-cotrirosa.md`. Each line of the paper form gets one row with: form field → Nexus step → component → data ID → validation → where it shows in Conferência/PDF → coverage status. The status is one of: existing, conditional on the model, generic record, or missing.
- Check the matrix against the code, the unit's approved model (read-only query) and the screen.
- A field counts as "fillable" only if it can be filled in, saved and then read back.

## Phase 1: Perigos (hazards)
- Five families with the paper form's exact options:
  - Químicos: Poeiras, Fumos, Gases tóxicos, Vapores, Névoas, Derivados de petróleo
  - Físicos: Ruído, Calor, Frio, Umidade, Radiação ionizante, Radiação não ionizante
  - Ergonômicos: Esforço intenso, Manuseio de carga, Repetitividade, Monotonia, Deficiência de luz, Trabalho noturno
  - Biológicos: Vírus, Bactérias, Fungos, Parasitas
  - Acidentes: Queda, Queimaduras, Corte, Choque elétrico, Intempéries, Animais peçonhentos
- Each family allows several choices. "Outros" becomes one "+ Adicionar outro" button that can be used many times, and each extra entry needs a description.
- Nexus hazards that are not on the paper form (energias perigosas, engolfamento) stay in their own group.
- Each hazard records where it came from (risk assessment, or found at entry time) and keeps "Adicionar medida" right next to it.
- Demo and operational PET use the same catalog. The demo label "não validado tecnicamente" stays.

## Phase 2: Medidas de controle e prevenção (control measures)
- New checklist, versioned in the model. Every item from the paper form gets its own answer, from the states that item allows: Sim, Não, Não se aplica, Não verificado.
- Items now answered separately:
  - Resgate 4×1 and corda
  - Iluminação fixa and escada móvel
  - Cinturão (S/N only), talabarte and trava-quedas
  - Protetor auricular and creme
  - PFF1, PFF2 or semifacial
  - Roupa (protective clothing)
  - Respiratory equipment for the work team and for the rescue team
  - Explosion-proof electrical equipment (equipamento elétrico Ex)
  - EPC/EPI "Outros", each with a description and its own answer
- Every new answer starts as Não verificado. Choosing a planned control and confirming it was carried out are recorded separately.
- Old grouped IDs stay so older records still read correctly. A legacy grouped answer does not confirm the new separate items.

## Phase 3: Antes da entrada (before entry)
- Two separate atmosphere tests: **Teste inicial** and **Após ventilação/isolamento**. Each has its own time, H₂S and CO in ppm, LIE in %, O₂ in % vol, test supervisor, confirmation, instrument, serial number and "aparelho da filial" (S/NA).
- Readings start empty. Saving one test keeps the other one.
- The O₂ check follows NR-33 33.5.15.2, not the literal "ou" on the form. A reading outside the approved criteria blocks entry.
- Lines with S/N/NA answers: Bloqueios/etiquetagem; Purga/lavagem; Ventilação (whether it applies, whether it was done, Natural/Mecânica, Insuflador móvel/fixo, time in minutes); Comunicação; Resgate; Movimentação vertical; Treinamento conferido; Treinamentos válidos (taken from the Equipe step's certificates); Monitoramento contínuo adequado.
- Conferência shows the two tests side by side and marks which one supports the entry.

## Phase 4: Durante o trabalho (during the work)
- **Permissão de Trabalho a Quente** (hot work permit): S/N/NA/NV. When it applies, it shows the permit's ID, validity and status. If hot work is planned from the start, it becomes a pending item in Conferência.
- "Ver plano e contatos": SAMU 192, Bombeiros 193, and the unit's own Ambulância and Segurança contacts. If those two are not registered, the screen says so.
- Monitoring status and blocking conditions appear first. Interruption, exit and occurrences reuse the existing actions, so the server rules stay in force.
- The screen sends the user to a new PET or an extension (prorrogação) only in the cases of items 33.5.11 and 33.5.12.1.

## Phase 5: Responsive layout
- The PET form adjusts to the space it actually has (container queries), so it works inside the 3D Map panel or with the side menu open.
- Sizes:
  - 320–479 px: one column; "Etapa X de N · Nome"; "Ver etapas"; the footer stays in the page flow when the screen is short.
  - 768–1024 px: two columns only for short pairs, such as time and responsible person.
  - 1280 px and up: steps in a side column, the form at a comfortable reading width, and a pending-items summary on wide screens.
- One scroll area only. Buttons at least 44 px. Text fields at 16 px on mobile. Safe-area margins and the dynamic screen height are respected.
- Each pending item in Conferência jumps straight to its field.

## Validation
- Unit tests for each rule:
  - each new item can be answered on its own
  - a legacy grouped answer stays pending for the new separate items
  - the O₂ criterion
  - the two tests are independent
  - hot work becomes a pending item
- Fill in a test PET on EC 28 (demo, and operational only with test records), save, reopen, and compare the summary and PDF against the matrix.
- Screenshots at 320, 390, 768, 1280 and 1440 px.
- Limits that will be reported, not claimed:
  - no physical devices, so no Safari iOS or Chrome Android
  - no screen recording of the phone keyboard
  - any new Cotrirosa model version needs technical approval before operational use, so it stays as a draft

## Technical notes
- Main files: `preparation-domain.ts`, `PetEditor.tsx`, `PetOperations.tsx`, `demo/catalogo.ts`, `demo/domain.ts`, `demo/PetDemoWorkspace.tsx`, `mobile/*`, `pet-preparation.css`, `mapa.css`, `UnitMapPanel.tsx`.
- New checklist and hazard IDs live in one catalog module shared by demo and operation.
- Server validation of scope, item applicability and evidence goes through the existing PET functions. A migration is added only if a field has nowhere to be stored.
- `AGENTS.md` gets a rule for the shared Cotrirosa catalog.
