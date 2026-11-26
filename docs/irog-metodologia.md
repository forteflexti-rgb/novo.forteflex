# Metodologia do IROG FORTEFLEX

Versão do cálculo: `irog-1.1.0` (código: `src/lib/irog/engine.ts`, testes: `src/lib/irog/engine.test.ts`).

## Grão do cálculo

O IROG é calculado por **recurso × dia × turno**. Todo indicador de linha, setor, fábrica ou período
é uma consolidação desses grãos.

## Fórmulas

| Grandeza | Definição | Fonte |
| --- | --- | --- |
| Tempo de calendário | Minutos do turno no calendário do recurso, já descontadas as exceções (feriados) | `work_calendars`, `calendar_exceptions` |
| Paradas programadas | Paradas cujo motivo tem `is_planned = true` | `downtime_records` + `downtime_reasons` |
| Tempo programado | Calendário − paradas programadas | calculado |
| Paradas não programadas | Paradas cujo motivo tem `is_planned = false` | `downtime_records` + `downtime_reasons` |
| Tempo de operação | Tempo programado − paradas não programadas | calculado |
| Tempo padrão produzido | Σ quantidade ÷ taxa padrão (em minutos) | `production_events` + `resource_standards` |
| Tempo padrão aprovado | Tempo padrão produzido − tempo padrão das perdas | `loss_events` |

- **Disponibilidade** = tempo de operação ÷ tempo programado
- **Performance** = tempo padrão produzido ÷ tempo de operação
- **Qualidade** = tempo padrão aprovado ÷ tempo padrão produzido
- **IROG** = Disponibilidade × Performance × Qualidade = tempo padrão aprovado ÷ tempo programado

### Regras adotadas para os dados do Iniflex (decisão de 26/11/2026)

- **Qualidade por peso.** O RPCP019 registra perdas só em kg, por recurso e dia, enquanto a produção
  vem em mt, mil ou kg. A qualidade é (kg produzido − kg perdido) ÷ kg produzido, usando o peso
  líquido de cada apontamento. O tempo padrão aprovado = tempo padrão produzido × qualidade.
- **Tempo de operação observado.** Quando há horários de apontamento, o tempo de operação é limitado
  à **união** dos horários apontados no dia: apontamentos sobrepostos no mesmo recurso não contam o
  tempo duas vezes. Tempo programado sem apontamento nem parada registrada vira **parada não
  apontada** (conta contra a disponibilidade) e aparece como aviso.
- **Duração impossível.** Apontamento com duração negativa ou acima de 24 h deixa o grão pendente
  (`APONTAMENTO_DURACAO_INVALIDA`) até ser corrigido no ERP. Ex.: OP 11412, recurso 501, 27/10/2026,
  122 dias.
- **Grão recurso × dia.** Cerca de 48% dos apontamentos do RPCP622 não informam o turno (os recursos
  201 e 301 nunca informam), então o IROG por turno fica indisponível até o turno ser apontado.

Todos os componentes são exibidos em percentual.

### Padrão produtivo

Cada padrão é cadastrado por recurso, opcionalmente por produto e etapa, como **taxa por hora** ou
**ciclo em segundos**, sempre com a unidade da quantidade (kg, mil, mt, un) e uma vigência. Vale o padrão
mais específico: produto + etapa, depois produto, depois etapa, depois o padrão geral do recurso.

### Por que minutos padrão

Produtos em kg, milheiro e metro não podem ser somados. Convertendo cada quantidade no tempo que ela
deveria levar segundo o padrão, todas as grandezas viram minutos e podem ser somadas sem misturar
unidades.

## Consolidação

A consolidação **soma os tempos** dos grãos calculados e só então divide:

- IROG consolidado = Σ tempo padrão aprovado ÷ Σ tempo programado
- Disponibilidade = Σ tempo de operação ÷ Σ tempo programado (e assim por diante)

Nunca se faz média simples dos percentuais. Um recurso que programou 60 min pesa 60 min, e não o mesmo
que um que programou 450 min.

Grãos pendentes ficam fora dos indicadores. A tela mostra a **cobertura** (fração do tempo programado
que foi calculada) e os motivos das pendências.

## Pendências (o cálculo não substitui dado ausente por zero)

| Código | Quando ocorre | O que cadastrar |
| --- | --- | --- |
| `CALENDARIO_AUSENTE` | Recurso sem calendário no dia/turno | Calendário de operação |
| `SEM_TEMPO_PROGRAMADO` | Há produção, mas o tempo programado é zero | Revisar calendário ou exceções |
| `PARADA_SEM_CLASSIFICACAO` | Parada sem motivo programada / não programada | Classificação de paradas |
| `PARADAS_EXCEDEM_CALENDARIO` | Paradas somam mais que o tempo programado | Revisar paradas ou calendário |
| `PADRAO_AUSENTE` | Produto/etapa sem capacidade ou ciclo no recurso | Padrão produtivo |
| `UNIDADE_INCOMPATIVEL` | Unidade do apontamento difere da unidade do padrão | Padrão na unidade correta |
| `PERDA_SEM_PRODUCAO_CORRESPONDENTE` | Perda sem produção do mesmo produto/unidade | Vincular a perda ao produto |
| `PERDA_MAIOR_QUE_PRODUCAO` | Perda maior que a produção (possível duplicidade) | Conferir os registros de origem |
| `APONTAMENTO_DURACAO_INVALIDA` | Apontamento com duração negativa ou acima de 24 h | Corrigir início/fim no ERP |
| `PESO_AUSENTE` | Qualidade por peso sem peso líquido no apontamento | Peso líquido no apontamento |
| `VALOR_INVALIDO` | Quantidade, duração ou padrão negativo ou não numérico | Corrigir a origem |

Cada pendência informa o motivo, o cadastro necessário e quantos registros foram afetados, com os ids.

## Alertas de consistência (não bloqueiam o cálculo)

- `PERFORMANCE_ACIMA_100`: o valor é mantido, sem limite de 100%. Indica que o padrão pode estar
  subestimado e precisa ser revisto pela engenharia.
- `SEM_PRODUCAO`: grão com tempo programado e nenhuma produção.
- `PARADA_NAO_APONTADA`: tempo programado sem apontamento nem parada registrada.
- `PRODUCAO_FORA_DO_CALENDARIO`: horários apontados além do tempo programado.

## Regras de dados

- Nenhum padrão, meta ou calendário vem pré-preenchido. Os valores são cadastrados pela engenharia,
  com origem e responsável, e ficam registrados em `audit_log`.
- Cada registro carrega sua origem (`demo`, `manual`, `iniflex_report`, `iniflex_api`). Dados
  demonstrativos nunca entram no IROG real.
- Perdas ficam em registros próprios e nunca são somadas de novo à produção.
