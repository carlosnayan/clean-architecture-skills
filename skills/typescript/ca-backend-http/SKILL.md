---
name: ca-backend-http
description: Use when building or reviewing an HTTP backend in TypeScript — routing, controllers, request validation, use case wiring and repositories. Applies Clean Architecture layer boundaries to the request path.
when_to_use: |
  Also trigger on: "onde valido o request", controller com regra de negócio dentro,
  middleware acessando banco, "como devolvo 404 sem acoplar", objeto de request
  chegando no caso de uso, transação abrangendo várias camadas, "onde fica o roteador",
  schema de validação misturado com regra de negócio.
---

# Clean Architecture num backend HTTP em TypeScript

As regras estão na skill `clean-architecture`; o mapeamento para TypeScript está
em `ts-clean-architecture`. Esta skill cobre o caminho de uma requisição.

## As quatro camadas de uma requisição

```
rota          registra o caminho e liga ao controller      src/main.ts (root)
controller    valida forma, chama o use case, responde     src/adapter
use case      orquestra a regra de aplicação               src/usecase
port          o que o use case precisa do mundo            src/usecase
repositório   implementa o port com o driver real          src/infra
```

O controller é tradutor: entra JSON, sai JSON, e no meio só existe o caso de uso.
`if` sobre regra de negócio dentro do controller é regra na camada errada.

## Templates

Operação inventada: cancelar uma assinatura.

```ts
// src/domain/subscription.ts
export class SubscriptionNotFound extends Error {
  constructor(id: string) {
    super(`assinatura ${id} não encontrada`);
    this.name = "SubscriptionNotFound";
  }
}

export class SubscriptionAlreadyCanceled extends Error {
  constructor() {
    super("assinatura já cancelada");
    this.name = "SubscriptionAlreadyCanceled";
  }
}

export type SubscriptionStatus = "active" | "canceled";

export type Subscription = {
  readonly id: string;
  readonly status: SubscriptionStatus;
};

// A regra de negócio: só assinatura ativa pode ser cancelada.
export function cancel(subscription: Subscription): Subscription {
  if (subscription.status === "canceled") throw new SubscriptionAlreadyCanceled();
  return { ...subscription, status: "canceled" };
}
```

```ts
// src/usecase/cancel-subscription.ts
import { cancel, type Subscription } from "@/domain/subscription";

export type CancelSubscriptionInput = {
  subscriptionId: string;
};

// Port declarado por quem consome (P1), com os dois métodos usados aqui (P2).
export type SubscriptionRepository = {
  findById(id: string): Promise<Subscription>;
  save(subscription: Subscription): Promise<void>;
};

export function makeCancelSubscription(repository: SubscriptionRepository) {
  return async function execute(input: CancelSubscriptionInput): Promise<Subscription> {
    const subscription = await repository.findById(input.subscriptionId);
    const canceled = cancel(subscription);
    await repository.save(canceled);
    return canceled;
  };
}
```

```ts
// src/adapter/cancel-subscription-controller.ts
import {
  SubscriptionAlreadyCanceled,
  SubscriptionNotFound,
} from "@/domain/subscription";
import type { makeCancelSubscription } from "@/usecase/cancel-subscription";

type HttpRequest = { params: Record<string, string | undefined> };
type HttpResponse = { status: number; body: unknown };

export function makeCancelSubscriptionController(
  execute: ReturnType<typeof makeCancelSubscription>,
) {
  return async function handle(request: HttpRequest): Promise<HttpResponse> {
    const id = request.params.id;
    if (!id) {
      // Forma, não regra: o controller sabe o que é um request válido.
      return { status: 400, body: { message: "id obrigatório" } };
    }

    try {
      const subscription = await execute({ subscriptionId: id });
      return { status: 200, body: { id: subscription.id, status: subscription.status } };
    } catch (error) {
      return toHttpResponse(error);
    }
  };
}

// Único ponto que converte erro de domínio em status (M4).
function toHttpResponse(error: unknown): HttpResponse {
  if (error instanceof SubscriptionNotFound) return { status: 404, body: { message: error.message } };
  if (error instanceof SubscriptionAlreadyCanceled) return { status: 409, body: { message: error.message } };
  return { status: 500, body: { message: "erro interno" } };
}
```

```ts
// src/infra/prisma-subscription-repository.ts
import { Prisma, type PrismaClient } from "@prisma/client";

import { SubscriptionNotFound, type Subscription } from "@/domain/subscription";
import type { SubscriptionRepository } from "@/usecase/cancel-subscription";

export function makePrismaSubscriptionRepository(prisma: PrismaClient): SubscriptionRepository {
  return {
    async findById(id) {
      try {
        const row = await prisma.subscription.findUniqueOrThrow({ where: { id } });
        return toDomain(row); // M2: mapeamento explícito, aqui na borda
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          throw new SubscriptionNotFound(id);
        }
        throw error;
      }
    },

    async save(subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: subscription.status },
      });
    },
  };
}

function toDomain(row: { id: string; status: string }): Subscription {
  return { id: row.id, status: row.status === "canceled" ? "canceled" : "active" };
}
```

O caso de uso não conhece HTTP nem Prisma e roda com um repositório em memória —
é o que T1 exige.

## Decisões recorrentes

**Onde valido o request.** O controller valida *forma* com um schema (Zod,
Valibot, TypeBox): campo ausente, tipo errado, UUID malformado. O caso de uso
valida *regra*: assinatura ativa, saldo suficiente, limite não excedido. Um
schema que rejeita `amount > creditLimit` está carregando regra de negócio para
a borda — o limite muda, e ninguém lembra de olhar no schema.

**Onde nasce o ID.** No caso de uso, por um port `IdGenerator`, ou recebido
pronto no input. Deixar o banco gerar faz a entidade nascer inválida em memória
e quebra T1.

**Onde a transação começa.** No caso de uso, por um port declarado por ele:

```ts
// src/usecase/ports.ts
export type UnitOfWork = {
  run<T>(operation: () => Promise<T>): Promise<T>;
};
```

A infra implementa com `prisma.$transaction`. O caso de uso decide *o quê* é
atômico sem saber *como*.

**Como escolho o status HTTP.** Sempre a partir do erro de domínio, num único
ponto de tradução. `if (error.code === "P2025")` espalhado pelos controllers é o
acoplamento voltando pela porta dos fundos.

**Onde fica o roteador.** Na composition root, junto do wiring. O controller não
se registra sozinho.

**Se o framework é NestJS.** Os decorators ficam nos controllers (adapter), onde
o framework já mora. O caso de uso continua sendo uma função ou classe simples,
registrada como provider na composition root — não decorada por dentro.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| Controller recebe `PrismaClient` | Controller recebe o caso de uso |
| Caso de uso devolve `{ status: 404 }` | Caso de uso lança erro de domínio (M4) |
| Validação de regra no schema do request | Validação de regra no caso de uso |
| Objeto de request como parâmetro do caso de uso | Input model próprio (P3) |
| Controller abre transação | Port de unidade de trabalho no caso de uso |
| Middleware consultando o banco direto | Middleware chamando um caso de uso |
| Tipo do Prisma devolvido pelo repositório | Tipo de domínio, mapeado na infra (D4) |
| `@Injectable()` no caso de uso | Provider registrado na composition root (M3a) |

## AI Behavior

Ao revisar um backend HTTP, percorra o caminho da requisição camada por camada e
diga em qual delas cada pedaço de lógica está — e em qual deveria estar, citando
o número da regra.

Ao implementar uma operação nova, gere as quatro camadas (Y1) e mostre o wiring
na composition root; uma operação sem wiring é código morto.

Ao corrigir, relate o movimento — por exemplo, "movido: verificação de assinatura
já cancelada saiu do controller e virou `cancel()` no domínio (L6)".
