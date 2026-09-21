---
name: ca-backend-http
description: Use when building or reviewing an HTTP backend in Go — routing, handlers, request decoding, use case wiring and repositories. Applies Clean Architecture layer boundaries to the request path.
when_to_use: |
  Also trigger on: "onde valido o request", handler com regra de negócio dentro,
  middleware acessando banco, "como devolvo 404 sem acoplar", `http.Request` chegando
  no caso de uso, transação abrangendo várias camadas, "onde fica o roteador".
---

# Clean Architecture num backend HTTP em Go

As regras estão na skill `clean-architecture`; o mapeamento para Go está em
`go-clean-architecture`. Esta skill cobre o que é específico do caminho de uma
requisição.

## As quatro camadas de uma requisição

```
rota          registra o caminho e liga ao handler          cmd/api (root)
handler       decodifica, chama o use case, escreve         internal/http (adapter)
use case      orquestra a regra de aplicação                internal/usecase
port          o que o use case precisa do mundo             internal/usecase
repositório   implementa o port com o driver real           internal/infra (infra)
```

O handler é o tradutor: entra JSON e sai JSON, e no meio só existe o caso de uso.
Se o handler tem `if` sobre regra de negócio, essa regra está na camada errada.

## Templates

Operação inventada: cancelar uma assinatura.

```go
// internal/domain/subscription.go
package domain

import "errors"

var (
	ErrSubscriptionNotFound = errors.New("assinatura não encontrada")
	ErrAlreadyCanceled      = errors.New("assinatura já cancelada")
)

type SubscriptionStatus string

const (
	StatusActive   SubscriptionStatus = "active"
	StatusCanceled SubscriptionStatus = "canceled"
)

type Subscription struct {
	ID     string             `gorm:"column:id;primaryKey" json:"id"`
	Status SubscriptionStatus `gorm:"column:status"        json:"status"`
}

// Cancel é a regra de negócio: só assinatura ativa pode ser cancelada.
func (s *Subscription) Cancel() error {
	if s.Status == StatusCanceled {
		return ErrAlreadyCanceled
	}
	s.Status = StatusCanceled
	return nil
}
```

```go
// internal/usecase/cancel_subscription.go
package usecase

import (
	"context"

	"example.com/billing/internal/domain"
)

type CancelSubscriptionInput struct {
	SubscriptionID string
}

// Port declarado por quem consome (P1), com os dois métodos usados aqui (P2).
type SubscriptionRepository interface {
	FindByID(ctx context.Context, id string) (domain.Subscription, error)
	Save(ctx context.Context, subscription domain.Subscription) error
}

type CancelSubscription struct {
	repo SubscriptionRepository
}

func NewCancelSubscription(repo SubscriptionRepository) CancelSubscription {
	return CancelSubscription{repo: repo}
}

func (u CancelSubscription) Execute(ctx context.Context, input CancelSubscriptionInput) (domain.Subscription, error) {
	subscription, err := u.repo.FindByID(ctx, input.SubscriptionID)
	if err != nil {
		return domain.Subscription{}, err
	}

	if err := subscription.Cancel(); err != nil {
		return domain.Subscription{}, err
	}

	if err := u.repo.Save(ctx, subscription); err != nil {
		return domain.Subscription{}, err
	}
	return subscription, nil
}
```

```go
// internal/http/cancel_subscription_handler.go
package http

import (
	"encoding/json"
	"errors"
	"net/http"

	"example.com/billing/internal/domain"
	"example.com/billing/internal/usecase"
)

type CancelSubscriptionHandler struct {
	useCase usecase.CancelSubscription
}

func NewCancelSubscriptionHandler(useCase usecase.CancelSubscription) CancelSubscriptionHandler {
	return CancelSubscriptionHandler{useCase: useCase}
}

func (h CancelSubscriptionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "id obrigatório", http.StatusBadRequest) // forma, não regra
		return
	}

	subscription, err := h.useCase.Execute(r.Context(), usecase.CancelSubscriptionInput{SubscriptionID: id})
	if err != nil {
		writeError(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(subscriptionResponse{ID: subscription.ID, Status: string(subscription.Status)})
}

// writeError é o único lugar que converte erro de domínio em status (M4).
func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrSubscriptionNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, domain.ErrAlreadyCanceled):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, "erro interno", http.StatusInternalServerError)
	}
}

type subscriptionResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}
```

```go
// internal/infra/postgres/subscription_repository.go
package postgres

import (
	"context"
	"errors"
	"fmt"

	"gorm.io/gorm"

	"example.com/billing/internal/domain"
	"example.com/billing/internal/usecase"
)

type SubscriptionRepository struct{ db *gorm.DB }

var _ usecase.SubscriptionRepository = SubscriptionRepository{}

func NewSubscriptionRepository(db *gorm.DB) SubscriptionRepository {
	return SubscriptionRepository{db: db}
}

func (r SubscriptionRepository) FindByID(ctx context.Context, id string) (domain.Subscription, error) {
	var subscription domain.Subscription
	if err := r.db.WithContext(ctx).First(&subscription, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return domain.Subscription{}, domain.ErrSubscriptionNotFound
		}
		return domain.Subscription{}, fmt.Errorf("buscando assinatura %s: %w", id, err)
	}
	return subscription, nil
}

func (r SubscriptionRepository) Save(ctx context.Context, subscription domain.Subscription) error {
	if err := r.db.WithContext(ctx).Save(&subscription).Error; err != nil {
		return fmt.Errorf("salvando assinatura %s: %w", subscription.ID, err)
	}
	return nil
}
```

O caso de uso não importa `net/http` e roda com um repositório em memória — é o
que T1 exige e o que torna o teste rápido (T9 do Clean Code).

## Decisões recorrentes

**Onde valido o request.** O handler valida *forma*: campo ausente, JSON
malformado, UUID inválido. O caso de uso valida *regra*: assinatura ativa, saldo
suficiente, limite não excedido. Regra que vive no handler não é testável sem
subir um servidor, e some quando alguém adiciona um segundo ponto de entrada.

**Onde nasce o ID.** No caso de uso, por um port `IDGenerator`, ou recebido
pronto no input. Deixar o banco gerar com `DEFAULT` faz a entidade nascer
inválida em memória e quebra T1.

**Onde a transação começa.** No caso de uso, por um port de unidade de trabalho
declarado por ele:

```go
// internal/usecase/ports.go
type UnitOfWork interface {
	Do(ctx context.Context, fn func(ctx context.Context) error) error
}
```

A infra implementa com `db.Transaction`. O caso de uso decide *o quê* é atômico
sem saber *como* a atomicidade é obtida.

**Como escolho o status HTTP.** Sempre a partir do erro de domínio, num único
ponto de tradução como o `writeError` acima. Espalhar `switch` de status pelos
handlers é como o acoplamento volta pela porta dos fundos.

**Onde fica o roteador.** Na composition root, junto do wiring. O handler não se
registra sozinho: quem conhece a rota é quem conhece o sistema inteiro.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| Handler recebe `*gorm.DB` | Handler recebe o caso de uso |
| Caso de uso devolve `http.StatusNotFound` | Caso de uso devolve erro de domínio (M4) |
| Validação de regra no middleware | Validação de regra no caso de uso |
| `*http.Request` como parâmetro do caso de uso | Input model próprio (P3) |
| Handler abre transação | Port de unidade de trabalho no caso de uso |
| Middleware consultando o banco direto | Middleware chamando um caso de uso |
| Struct de request reaproveitado como entidade | DTO no adapter, entidade no domínio (M1) |
| Regra de negócio no `switch` do handler | Método na entidade |

## AI Behavior

Ao revisar um backend HTTP, percorra o caminho da requisição camada por camada e
diga em qual delas cada pedaço de lógica está — e em qual deveria estar. Cite o
número da regra.

Ao implementar uma operação nova, gere as quatro camadas (Y1) e mostre o wiring
na composition root; uma operação sem wiring é código morto.

Ao corrigir, relate o movimento — por exemplo, "movido: verificação de assinatura
já cancelada saiu do handler e virou `Subscription.Cancel()` no domínio (L6)".
