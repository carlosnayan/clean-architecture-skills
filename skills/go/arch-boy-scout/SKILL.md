---
name: arch-boy-scout
description: Use when touching any file in a Go codebase — identifies which layer the file belongs to, reports architecture violations by rule number, and moves what was touched to its correct layer. Orchestrates the Clean Architecture skills.
when_to_use: |
  Also trigger on: qualquer edição em código Go existente, "melhore isso", "refatore",
  código legado sem camadas claras, arquivo grande fazendo várias coisas, antes de
  abrir PR, "isso está no lugar certo".
---

# Architecture Boy Scout

> "Always check a module in cleaner than when you checked it out."

Aplicada à arquitetura, a regra vira: **todo arquivo que você tocou sai mais
perto da camada certa do que entrou.** Não perfeito. Mais perto.

Esta skill orquestra as demais: `clean-architecture` para as regras,
`go-clean-architecture` para o mapeamento em Go, `ca-backend-http` e
`ca-cli-worker` para o contexto.

## Protocolo

**1. Identifique a camada do arquivo tocado.**

Leia `.arch.json` se existir; caso contrário, derive do layout e declare o mapa
que você assumiu. Um arquivo que não cabe em nenhuma camada é, ele próprio, o
primeiro achado: diga isso em vez de forçá-lo numa caixa.

**2. Rode o verificador e leia as violações que envolvem o arquivo.**

```bash
./scripts/import-check.sh .
```

Filtre a saída pelo arquivo que você tocou. As demais violações são reais, mas
não são suas nesta tarefa.

**3. Corrija apenas o que você tocou (Y2).**

O escopo é o arquivo da tarefa e o caminho que ele percorre. Um repositório sem
Clean Architecture não vira um repositório com Clean Architecture num commit, e
tentar isso transforma uma correção de bug numa revisão impossível de revisar.

**4. Relate.**

Três linhas: a camada que o arquivo ocupa, as violações encontradas por número, e
os movimentos feitos. Se você encontrou violações que deixou para depois, liste-as
explicitamente — um achado não registrado é um achado perdido.

## O que conta como melhoria incremental

- **Extrair um port que já estava implícito.** O caso de uso recebia `*gorm.DB`
  e usava dois métodos; declare a interface com esses dois métodos em
  `internal/usecase` e passe a implementação (D3, P1).
- **Mover regra de negócio do handler para o caso de uso ou para a entidade.**
  O `if` que decide se a operação é permitida pertence ao domínio (L6).
- **Traduzir um erro de infra na borda.** `gorm.ErrRecordNotFound` vira
  `domain.ErrNotFound` no repositório; o handler passa a comparar com o erro de
  domínio (M4).
- **Dar um construtor a uma entidade que não tinha.** Onde havia
  `domain.Invoice{...}` espalhado, passa a existir `NewInvoice` com a invariante
  (M3c).
- **Renomear um pacote que não diz nada.** `internal/services` vira o nome da
  capacidade que ele realmente oferece (L5).

## O que não fazer

- **Não reescreva a arquitetura inteira.** Migrar todo o repositório de uma vez
  não é boy-scout: é um projeto próprio, que merece seu próprio plano e sua
  própria revisão.
- **Não reorganize arquivos que a tarefa atual não tocou.** Cada arquivo movido
  é um arquivo que o revisor precisa reler. Movimento sem motivo consome o
  orçamento de atenção que a mudança real precisa.
- **Não troque a biblioteca a pretexto de arquitetura.** Substituir o ORM não é
  uma melhoria incremental; é uma decisão que precisa ser tomada explicitamente.
- **Não deixe o código pior "temporariamente".** Um port declarado no lugar
  errado para acelerar hoje é exatamente a dívida que esta skill existe para
  impedir.
- **Não relate melhoria que você não verificou.** Rode o `import-check` depois de
  mover; a saída é a evidência.

## Quando o arquivo está em código legado sem camadas

Comece pelo menor movimento que reduz o acoplamento e não exige tocar em outros
arquivos: extrair um port, mover uma função de regra, traduzir um erro. Deixe a
estrutura de pastas para depois — mover arquivos muda todos os imports do
repositório e transforma um diff legível num diff impossível.

Se a tarefa exige criar código novo num pacote sem camadas, crie o código novo
já na camada certa, mesmo que ele fique ao lado de código que não está. Uma ilha
correta é o começo de uma migração; um arquivo novo no padrão antigo é uma
migração que nunca começa.

## AI Behavior

Ao tocar em qualquer arquivo Go, declare a camada dele antes de editar. Ao
terminar, rode `scripts/import-check.sh` e relate no formato:

```
Camada: internal/usecase
Violações encontradas: D2 (importava net/http), P1 (port declarado na infra)
Movimentos: port SubscriptionRepository declarado em internal/usecase;
            *http.Request substituído por CancelSubscriptionInput
Deixado para depois: L6 em internal/http/legacy_handler.go (fora do escopo desta tarefa)
```

Nunca afirme que a arquitetura melhorou sem a saída do verificador. Nunca amplie
o escopo para arquivos que a tarefa não pediu, mesmo quando a violação for óbvia:
registre e siga.
