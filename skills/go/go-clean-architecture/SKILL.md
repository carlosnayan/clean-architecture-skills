---
name: go-clean-architecture
description: Use when writing, reviewing or refactoring the structure of any Go codebase. Maps Clean Architecture onto Go packages, interfaces and wiring — where ports live, how the composition root works, and which imports break the Dependency Rule.
when_to_use: |
  Also trigger on: pacote de domínio importando gorm/sqlx/net/http, handler chamando
  repositório direto, interface declarada junto da implementação, "onde coloco esse
  arquivo em Go", "como faço injeção de dependência sem framework", struct de entidade
  com *gorm.DB, "internal/ ou pkg/", erro de driver vazando para o handler.
---

# Clean Architecture em Go

As 24 regras (D, L, P, M, T, Y) estão na skill `clean-architecture`. Esta skill
traduz aquelas regras para pacotes, interfaces e wiring de Go — onde o port mora,
como a composition root funciona, e quais imports quebram a Dependency Rule.

## Layout canônico

```
cmd/api/main.go              composition root: o único arquivo que conhece todas as camadas
internal/domain/             entities, value objects e erros de domínio; sem dependências
internal/usecase/            regra de aplicação e os ports que ela consome
internal/http/               handlers, roteamento, decodificação: traduzem protocolo
internal/infra/postgres/     implementações dos ports; aqui vive o driver
```

Use `internal/` para tudo que não é API pública do módulo — o compilador passa a
impedir import externo, o que transforma a fronteira em erro de compilação e não
em convenção.

## Ports em Go (P1, P2)

Em Go o port pertence ao consumidor. Isso não é estilo: é o que permite trocar a
implementação sem tocar em quem a usa, e é o que mantém a interface pequena.

❌ Interface declarada ao lado da implementação:

```go
// internal/infra/postgres/invoice_repository.go
package postgres

// O use case agora tem que importar infra para falar dessa interface (D1).
type InvoiceRepository interface {
	Save(ctx context.Context, invoice domain.Invoice) error
	FindByID(ctx context.Context, id string) (domain.Invoice, error)
	FindAll(ctx context.Context) ([]domain.Invoice, error)
	Delete(ctx context.Context, id string) error
	Count(ctx context.Context) (int, error)
}

type InvoiceRepositoryPG struct{ db *gorm.DB }
```

✅ Port declarado por quem consome, com os métodos que este caso de uso usa:

```go
// internal/usecase/issue_invoice.go
package usecase

// Dois métodos porque IssueInvoice usa dois (P2).
type InvoiceRepository interface {
	Save(ctx context.Context, invoice domain.Invoice) error
	FindByID(ctx context.Context, id string) (domain.Invoice, error)
}
```

```go
// internal/infra/postgres/invoice_repository.go
package postgres

type InvoiceRepository struct{ db *gorm.DB }

// Asserção de compilação: se o port mudar, isto quebra aqui, não em produção.
var _ usecase.InvoiceRepository = InvoiceRepository{}
```

A infra importa o use case para satisfazer o port. A dependência continua
apontando para dentro (D1), embora o fluxo de controle vá para fora (D5).

## Composition root (P5)

Go não precisa de container de DI. A composition root é uma função que constrói
o grafo de dependências de dentro para fora:

```go
// cmd/api/main.go
package main

func main() {
	db, err := gorm.Open(postgres.Open(os.Getenv("DATABASE_URL")))
	if err != nil {
		log.Fatalf("abrindo banco: %v", err)
	}

	invoices := pg.NewInvoiceRepository(db)        // infra
	issueInvoice := usecase.NewIssueInvoice(invoices) // use case recebe o port
	handler := httpapi.NewIssueInvoiceHandler(issueInvoice) // adapter recebe o use case

	mux := http.NewServeMux()
	mux.Handle("POST /invoices", handler)
	log.Fatal(http.ListenAndServe(":8080", mux))
}
```

Este é o único arquivo autorizado a conhecer todas as camadas ao mesmo tempo.
Qualquer outro lugar que construa suas próprias dependências está escondendo um
acoplamento que ninguém vê no diagrama.

## Entidades e tags (M3)

Tags de mapeamento são strings: não criam import e não executam nada. Por isso
são toleradas na entidade. O que não é tolerado é import e execução.

❌ Entidade que executa framework:

```go
package domain

type Invoice struct {
	ID     string `gorm:"column:id;primaryKey"`
	Amount int64  `gorm:"column:amount"`
	db     *gorm.DB // M3a: handle de conexão dentro da entidade
}

// M3a: hook de ciclo de vida — o ORM decide quando a regra roda.
func (i *Invoice) BeforeCreate(tx *gorm.DB) error {
	i.ID = uuid.NewString()
	return nil
}
```

✅ Mesmo struct, mesmas tags, sem framework:

```go
package domain

import "errors"

var ErrInvoiceAmountInvalid = errors.New("valor da fatura deve ser positivo")

type Invoice struct {
	ID     string `gorm:"column:id;primaryKey" json:"id"`
	Amount int64  `gorm:"column:amount"        json:"amount"`
	Secret string `gorm:"column:secret"        json:"-"` // M3b: decisão explícita de não expor
}

// NewInvoice é onde a invariante vive (M3c). O ID chega pronto de quem o gerou,
// em vez de ser preenchido pelo banco num momento que o domínio não controla.
func NewInvoice(id string, amount int64) (Invoice, error) {
	if amount <= 0 {
		return Invoice{}, ErrInvoiceAmountInvalid
	}
	return Invoice{ID: id, Amount: amount}, nil
}

func (i Invoice) IsSettled() bool { return i.Amount == 0 }
```

A diferença prática: `NewInvoice("inv-1", 100)` produz uma fatura válida em
memória, e o caso de uso é testável sem Postgres (T1).

## Erros nas bordas (M4)

❌ Erro do driver decidindo o status HTTP:

```go
// internal/http/invoice_handler.go
if errors.Is(err, gorm.ErrRecordNotFound) { // D2: adapter sabe qual ORM a infra usa
	w.WriteHeader(http.StatusNotFound)
	return
}
```

✅ Traduzido na infra, comparado no domínio:

```go
// internal/infra/postgres/invoice_repository.go
func (r InvoiceRepository) FindByID(ctx context.Context, id string) (domain.Invoice, error) {
	var invoice domain.Invoice
	if err := r.db.WithContext(ctx).First(&invoice, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domain.Invoice{}, domain.ErrInvoiceNotFound
		}
		return domain.Invoice{}, fmt.Errorf("buscando fatura %s: %w", id, err)
	}
	return invoice, nil
}
```

```go
// internal/http/invoice_handler.go
if errors.Is(err, domain.ErrInvoiceNotFound) {
	w.WriteHeader(http.StatusNotFound)
	return
}
```

Trocar GORM por sqlx passa a ser uma mudança de um pacote, não uma caçada por
`ErrRecordNotFound` no repositório inteiro.

## CRUD também atravessa as camadas (Y1)

Não existe a versão enxuta para operação simples. Um `GetInvoice` de três linhas
tem entity, use case, handler e repositório como qualquer outra operação, porque
o valor está em quem lê depois saber exatamente onde procurar — e porque a
operação trivial de hoje é a que ganha regra de negócio em três meses.

Para o boilerplate não custar caro, gere-o:

```bash
./scripts/new-usecase.sh cancel_invoice
```

## Verificação

```bash
./scripts/import-check.sh .
```

Configure o mapa de camadas em `.arch.json`, na raiz do projeto, quando o layout
diferir do canônico:

```json
{
  "layers": {
    "domain": ["internal/domain"],
    "usecase": ["internal/usecase"],
    "adapter": ["internal/http"],
    "infra": ["internal/infra"],
    "root": ["cmd"]
  },
  "allow_in_domain": ["time", "errors", "fmt", "strings", "context"]
}
```

O que o script detecta:

| Código | Condição |
|---|---|
| D1 | Pacote importa outro pacote interno de camada mais externa |
| D2 | `domain` ou `usecase` importa pacote externo, ou stdlib fora da allowlist |
| L6 | `adapter` importa `infra`, ou `adapter` importa outro `adapter` |

P1, P4 e M3c não aparecem na saída: um port no pacote errado, lógica escondida
num handler e uma entidade sem invariante compilam e passam no verificador.
Esses exigem leitura do código.

No CI (T3):

```yaml
- run: ./scripts/import-check.sh .
```

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| `package utils` | Pacote com nome da capacidade que ele oferece |
| Interface no pacote que a implementa | Port no pacote que a consome (P1) |
| `any` cruzando limite de camada | Tipo concreto do lado de dentro (D4) |
| Handler importa `internal/infra` | Handler importa só `internal/usecase` (L6) |
| `panic` em pacote de domínio | Erro de domínio retornado ao chamador |
| Entidade com `BeforeCreate` | Regra no construtor ou no caso de uso (M3a) |
| `*gorm.DB` no construtor do use case | Port declarado pelo use case (D3) |
| `gorm.ErrRecordNotFound` no handler | Erro traduzido na infra (M4) |
| Use case recebendo `*http.Request` | Use case recebendo input model próprio (P3) |
| Repositório devolvendo linha do ORM | Repositório devolvendo tipo de domínio (D4) |

## AI Behavior

Ao revisar código Go, identifique violações pelo número da regra — por exemplo,
"violação D2: `internal/domain/invoice.go` importa `gorm.io/gorm`". Rode
`scripts/import-check.sh` antes de afirmar que a arquitetura está correta: a
saída do script é evidência, sua leitura é hipótese.

Ao corrigir, relate o movimento — por exemplo, "movido: `InvoiceRepository` saiu
de `internal/infra/postgres` e foi declarado em `internal/usecase` (P1); a infra
agora satisfaz o port por asserção de compilação".

Ao criar uma operação nova, gere as quatro camadas (Y1); não proponha a variante
curta porque a operação parece simples.
