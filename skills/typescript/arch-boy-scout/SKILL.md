---
name: arch-boy-scout
description: Use when touching any file in a TypeScript codebase — identifies which layer the file belongs to, reports architecture violations by rule number, and moves what was touched to its correct layer. Orchestrates the Clean Architecture skills.
when_to_use: |
  Also trigger on: qualquer edição em código TypeScript existente, "melhore isso",
  "refatore", código legado sem camadas claras, componente ou arquivo grande fazendo
  várias coisas, antes de abrir PR, "isso está no lugar certo".
---

# Architecture Boy Scout

> "Always check a module in cleaner than when you checked it out."

Aplicada à arquitetura, a regra vira: **todo arquivo que você tocou sai mais
perto da camada certa do que entrou.** Não perfeito. Mais perto.

Esta skill orquestra as demais: `clean-architecture` para as regras,
`ts-clean-architecture` para o mapeamento em TypeScript, e `ca-backend-http`,
`ca-frontend-react`, `ca-mobile-rn` ou `ca-cli-worker` para o contexto.

## Protocolo

**1. Identifique a camada do arquivo tocado.**

Leia `.arch.json` se existir; caso contrário, derive do layout e declare o mapa
que você assumiu. Um arquivo que não cabe em nenhuma camada é, ele próprio, o
primeiro achado: diga isso em vez de forçá-lo numa caixa.

**2. Rode o verificador e leia as violações que envolvem o arquivo.**

```bash
node ./scripts/import-check.mjs .
```

Filtre a saída pelo arquivo que você tocou. As demais violações são reais, mas
não são suas nesta tarefa.

**3. Corrija apenas o que você tocou (Y2).**

O escopo é o arquivo da tarefa e o caminho que ele percorre. Um repositório sem
Clean Architecture não vira um repositório com Clean Architecture num commit, e
tentar isso transforma uma correção de bug numa revisão impossível de revisar.

**4. Relate.**

Três linhas: a camada que o arquivo ocupa, as violações encontradas por número, e
os movimentos feitos. Violações que você deixou para depois vão listadas — um
achado não registrado é um achado perdido.

## O que conta como melhoria incremental

- **Extrair um port que já estava implícito.** O caso de uso recebia o
  `PrismaClient` e usava dois métodos; declare o tipo com esses dois métodos em
  `src/usecase` e injete a implementação (D3, P1).
- **Mover regra de negócio do componente para o caso de uso ou para o domínio.**
  O cálculo dentro do JSX vira função pura testável sem render (P4).
- **Mapear o tipo da API para o domínio na borda.** Onde a resposta crua
  atravessava o app, passa a existir um `toDomain` na infra (D4, M2).
- **Traduzir um erro de driver na borda.** `PrismaClientKnownRequestError` vira
  um erro de domínio no repositório; o controller compara com o erro de domínio (M4).
- **Dar uma função de criação a um tipo que não tinha.** Onde havia objetos
  literais espalhados, passa a existir uma função com a invariante (M3c).
- **Quebrar um hook que faz tudo.** Separar o estado de transporte (adapter) do
  cálculo de domínio (caso de uso).

## O que não fazer

- **Não reescreva a arquitetura inteira.** Migrar todo o repositório de uma vez
  não é boy-scout: é um projeto próprio, que merece seu próprio plano.
- **Não reorganize arquivos que a tarefa atual não tocou.** Cada arquivo movido
  é um arquivo que o revisor precisa reler.
- **Não troque a biblioteca a pretexto de arquitetura.** Substituir o ORM ou o
  gerenciador de estado é decisão explícita, não efeito colateral.
- **Não introduza um barrel file para "organizar".** `index.ts` reexportando
  camadas cria ciclo e esconde a fronteira que o verificador deveria enxergar.
- **Não relate melhoria que você não verificou.** Rode o `import-check` depois de
  mover; a saída é a evidência.

## Quando o arquivo está em código legado sem camadas

Comece pelo menor movimento que reduz o acoplamento sem exigir tocar em outros
arquivos: extrair um port, mover uma função de regra, mapear um tipo na borda.
Deixe a estrutura de pastas para depois — mover arquivos muda todos os imports e
transforma um diff legível num diff impossível.

Se a tarefa exige criar código novo num módulo sem camadas, crie o código novo já
na camada certa, mesmo ao lado de código que não está. Uma ilha correta é o
começo de uma migração; um arquivo novo no padrão antigo é uma migração que nunca
começa.

## AI Behavior

Ao tocar em qualquer arquivo TypeScript, declare a camada dele antes de editar.
Ao terminar, rode `scripts/import-check.mjs` e relate no formato:

```
Camada: src/usecase
Violações encontradas: D2 (importava @prisma/client), P1 (port declarado na infra)
Movimentos: tipo SubscriptionRepository declarado em src/usecase;
            objeto de request substituído por CancelSubscriptionInput
Deixado para depois: L6 em src/adapter/legacy-controller.ts (fora do escopo desta tarefa)
```

Nunca afirme que a arquitetura melhorou sem a saída do verificador. Nunca amplie
o escopo para arquivos que a tarefa não pediu, mesmo quando a violação for óbvia:
registre e siga.
