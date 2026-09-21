---
name: ca-cli-worker
description: Use when building or reviewing a Go CLI, background worker, cron job or queue consumer. Applies Clean Architecture layer boundaries where the entry point is a command or a message instead of an HTTP request.
when_to_use: |
  Also trigger on: flags de linha de comando lidas dentro da regra de negócio,
  consumidor de fila chamando repositório direto, "onde coloco o loop do worker",
  cancelamento por contexto, "como testo esse job", cron com lógica no agendador.
---

# Clean Architecture num CLI ou worker em Go

As regras estão na skill `clean-architecture`; o mapeamento para Go está em
`go-clean-architecture`. Esta skill cobre o que muda quando a entrada não é uma
requisição HTTP.

## O adapter aqui é o comando

Flags, argumentos, variáveis de ambiente e mensagens de fila são o equivalente
exato do corpo de um request: dados não confiáveis, num formato do mundo externo,
que alguém precisa traduzir para um input model antes de entrar no caso de uso.

```
flag / mensagem   entrada crua do mundo externo               cmd (root) ou adapter
adapter           traduz para input model, trata sinais       internal/cli
use case          orquestra a regra de aplicação              internal/usecase
port              o que o use case precisa do mundo           internal/usecase
infra             índice, fila, banco, relógio                internal/infra
```

O caso de uso é literalmente o mesmo de um backend HTTP. Trocar a forma de
disparar não deveria custar nada — e esta skill existe para tornar isso
verdadeiro em vez de aspiracional.

## Templates

Operação inventada: reindexar o catálogo.

```go
// internal/domain/catalog.go
package domain

import "errors"

var ErrCatalogEmpty = errors.New("catálogo vazio, nada a reindexar")

type ReindexReport struct {
	Indexed int
	Skipped int
}

// Merge existe para que o relatório final seja montado no domínio, e não somado
// à mão em cada ponto de entrada.
func (r ReindexReport) Merge(other ReindexReport) ReindexReport {
	return ReindexReport{Indexed: r.Indexed + other.Indexed, Skipped: r.Skipped + other.Skipped}
}
```

```go
// internal/usecase/reindex_catalog.go
package usecase

import (
	"context"

	"example.com/catalog/internal/domain"
)

type ReindexCatalogInput struct {
	BatchSize int
	DryRun    bool
}

type ProductReader interface {
	NextBatch(ctx context.Context, size int) ([]domain.Product, error)
}

type SearchIndex interface {
	Index(ctx context.Context, products []domain.Product) error
}

type ReindexCatalog struct {
	products ProductReader
	index    SearchIndex
}

func NewReindexCatalog(products ProductReader, index SearchIndex) ReindexCatalog {
	return ReindexCatalog{products: products, index: index}
}

func (u ReindexCatalog) Execute(ctx context.Context, input ReindexCatalogInput) (domain.ReindexReport, error) {
	report := domain.ReindexReport{}

	for {
		// O cancelamento é decisão de aplicação: o caso de uso respeita o ctx
		// que recebeu, sem saber se veio de um sinal, de um timeout ou de um teste.
		if err := ctx.Err(); err != nil {
			return report, err
		}

		batch, err := u.products.NextBatch(ctx, input.BatchSize)
		if err != nil {
			return report, err
		}
		if len(batch) == 0 {
			break
		}

		if input.DryRun {
			report = report.Merge(domain.ReindexReport{Skipped: len(batch)})
			continue
		}

		if err := u.index.Index(ctx, batch); err != nil {
			return report, err
		}
		report = report.Merge(domain.ReindexReport{Indexed: len(batch)})
	}

	if report.Indexed == 0 && report.Skipped == 0 {
		return report, domain.ErrCatalogEmpty
	}
	return report, nil
}
```

```go
// internal/cli/reindex_catalog_command.go
package cli

import (
	"context"
	"flag"
	"fmt"
	"io"

	"example.com/catalog/internal/usecase"
)

type ReindexCatalogCommand struct {
	useCase usecase.ReindexCatalog
	out     io.Writer
}

func NewReindexCatalogCommand(useCase usecase.ReindexCatalog, out io.Writer) ReindexCatalogCommand {
	return ReindexCatalogCommand{useCase: useCase, out: out}
}

// Run traduz argumentos em input model e o resultado em texto. Nenhuma regra aqui.
func (c ReindexCatalogCommand) Run(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("reindex-catalog", flag.ContinueOnError)
	batchSize := fs.Int("batch-size", 500, "quantos produtos por lote")
	dryRun := fs.Bool("dry-run", false, "não escreve no índice")
	if err := fs.Parse(args); err != nil {
		return err
	}

	report, err := c.useCase.Execute(ctx, usecase.ReindexCatalogInput{
		BatchSize: *batchSize,
		DryRun:    *dryRun,
	})
	if err != nil {
		return err
	}

	fmt.Fprintf(c.out, "indexados: %d, ignorados: %d\n", report.Indexed, report.Skipped)
	return nil
}
```

```go
// cmd/reindex/main.go
package main

func main() {
	// O sinal é detalhe de plataforma: fica no root e vira um context.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")))
	if err != nil {
		log.Fatalf("abrindo banco: %v", err)
	}

	command := cli.NewReindexCatalogCommand(
		usecase.NewReindexCatalog(pg.NewProductReader(db), search.NewIndex(os.Getenv("SEARCH_URL"))),
		os.Stdout,
	)

	if err := command.Run(ctx, os.Args[1:]); err != nil {
		// O código de saída é derivado do erro de domínio, no root (M4).
		if errors.Is(err, domain.ErrCatalogEmpty) {
			log.Println("nada a fazer")
			os.Exit(0)
		}
		log.Printf("reindexação falhou: %v", err)
		os.Exit(1)
	}
}
```

Para um consumidor de fila, o adapter muda de `Run(ctx, args)` para
`Handle(ctx, message)` e nada mais se move.

## Decisões recorrentes

**Onde vive o loop do worker.** No adapter. O laço que busca mensagens, faz
backoff e confirma o recebimento é mecânica de transporte. O caso de uso processa
uma unidade de trabalho e retorna.

**Cancelamento.** Um `context.Context` entra pelo root vindo do sinal do sistema
operacional e atravessa todas as camadas. O domínio nunca chama `signal.Notify`
nem `os.Exit`: quem decide terminar o processo é quem o iniciou.

**Idempotência é regra de aplicação.** "Já processei essa mensagem?" pertence ao
caso de uso, atrás de um port. No adapter, ela vira lógica duplicada em cada
ponto de entrada; no domínio, ela exige conhecer o broker.

**Como testo esse job.** Chamando `Execute` com fakes dos ports. Se o teste
precisa de flags, de fila ou de sinal, a lógica vazou para o adapter (P4).

**Cron.** O agendador diz *quando*, nunca *o quê*. Expressão cron na
configuração, regra no caso de uso.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| `flag.Parse()` dentro do caso de uso | Flags lidas no adapter e passadas como input model (P3) |
| Worker chama o repositório | Worker chama o caso de uso (L6) |
| `os.Exit` dentro do domínio | Erro retornado e traduzido no `main` (M4) |
| `time.Sleep` de backoff no caso de uso | Backoff no adapter, retry como política de transporte |
| Caso de uso recebendo a mensagem crua do broker | Input model próprio, mensagem decodificada no adapter |
| Lógica do cron dentro do agendador | Agendador dispara; a regra está no caso de uso |
| `log.Fatal` no meio do processamento | Erro propagado; o root decide o código de saída |
| Deduplicação com um `map` global no worker | Port de idempotência declarado pelo caso de uso |

## AI Behavior

Ao revisar um CLI ou worker, pergunte primeiro se o caso de uso poderia ser
exposto por HTTP sem alteração. Se não puder, o adapter vazou para dentro — diga
exatamente o quê, citando a regra.

Ao implementar, gere as quatro camadas (Y1) e mostre o root traduzindo sinal em
contexto e erro de domínio em código de saída.

Ao corrigir, relate o movimento — por exemplo, "movido: leitura de flags saiu do
caso de uso e foi para `internal/cli`; `Execute` agora recebe `ReindexCatalogInput` (P3)".
