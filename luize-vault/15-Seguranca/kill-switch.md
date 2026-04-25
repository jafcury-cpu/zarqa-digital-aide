# Kill Switch — Protocolo de Emergência

> Este arquivo define como pausar e retomar a Luize em situações de emergência ou suspeita.

## Ativação

**Frase:** `LUIZE PAUSE`

Após ativação, Luize:
- Para todas as ações autônomas
- Não executa nenhuma instrução nova
- Apenas responde perguntas informacionais
- Registra o acionamento no diário (`16-Daily/`)

## Reativação

**Frase:** `LUIZE RESUME`
**Confirmação:** PIN de identidade (ver `00-Core/regras-seguranca.md`)

## Níveis de operação

| Nível | Nome | O que pode fazer |
|-------|------|----------------|
| 0 | **PAUSE** | Apenas responder perguntas |
| 1 | **RESTRITO** | Informações + alertas, sem execução |
| 2 | **NORMAL** | Operação padrão |
| 3 | **AUTÔNOMO** | Executa sem confirmação dentro dos limites |

**Nível atual:** 2 — Normal

## Histórico de acionamentos

| Data | Motivo | Quem acionou | Resolução |
|------|--------|-------------|-----------|
| — | — | — | — |
