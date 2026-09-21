---
name: ts-clean-architecture
description: Use when writing, reviewing or refactoring the structure of any TypeScript codebase. Maps Clean Architecture onto modules, types and dependency injection — where ports live, how the composition root works, and which imports break the Dependency Rule.
when_to_use: |
  Also trigger on: tipo do Prisma ou do Drizzle vazando para o domínio, decorator de
  framework na entidade, controller chamando repositório direto, "onde coloco esse
  arquivo em TS", barrel file criando ciclo, "preciso de um container de DI",
  `any` cruzando limite de camada, path alias apontando para dentro do domínio.
---

# Clean Architecture em TypeScript

As 24 regras (D, L, P, M, T, Y) estão na skill `clean-architecture`. Esta skill
traduz aquelas regras para módulos, tipos e injeção de dependência.

## Layout canônico

```
src/main.ts          composition root: o único módulo que conhece todas as camadas
src/domain/          entities, value objects e erros de domínio; sem dependências
src/usecase/         regra de aplicação e os ports que ela consome
src/adapter/         controllers, presenters, hooks: traduzem protocolo
src/infra/           implementações dos ports; aqui vivem ORM, HTTP client, SDK
```

Configure o alias `@/*` para `src/*` e importe sempre por ele. Import relativo
que sobe três níveis esconde a fronteira que ele está cruzando.

## Ports em TypeScript (P1, P2)

❌ Tipo declarado junto da implementação:

```ts
// src/infra/invoice-repository.ts
import { PrismaClient } from "@prisma/client";

// O caso de uso agora precisa importar infra para tipar sua dependência (D1).
export type InvoiceRepository = {
  save(invoice: Invoice): Promise<void>;
  findById(id: string): Promise<Invoice | null>;
  findAll(): Promise<Invoice[]>;
  delete(id: string): Promise<void>;
};
```

✅ Port declarado por quem consome, com os métodos que este caso de uso usa:

```ts
// src/usecase/issue-invoice.ts
import type { Invoice } from "@/domain/invoice";

// Dois métodos porque issueInvoice usa dois (P2).
export type InvoiceRepository = {
  save(invoice: Invoice): Promise<void>;
  findById(id: string): Promise<Invoice | null>;
};

export function makeIssueInvoice(repository: InvoiceRepository) {
  return async function execute(input: IssueInvoiceInput): Promise<Invoice> {
    // ...
  };
}
```

```ts
// src/infra/prisma-invoice-repository.ts
import type { InvoiceRepository } from "@/usecase/issue-invoice";

// A anotação explícita é a verificação: se o port mudar, o erro aparece aqui.
export const prismaInvoiceRepository: InvoiceRepository = {
  async save(invoice) { /* ... */ },
  async findById(id) { /* ... */ },
};
```

A infra importa o use case para satisfazer o port. A dependência aponta para
dentro (D1) enquanto o fluxo de controle vai para fora (D5).

## Composition root (P5)

```ts
// src/main.ts
import { PrismaClient } from "@prisma/client";

import { makeIssueInvoice } from "@/usecase/issue-invoice";
import { makeInvoiceController } from "@/adapter/invoice-controller";
import { makePrismaInvoiceRepository } from "@/infra/prisma-invoice-repository";

const prisma = new PrismaClient();
const invoices = makePrismaInvoiceRepository(prisma);   // infra
const issueInvoice = makeIssueInvoice(invoices);        // use case recebe o port
const controller = makeInvoiceController(issueInvoice); // adapter recebe o use case
```

Funções de fábrica bastam: o grafo de dependências é construído de dentro para
fora, explicitamente, num arquivo só.

Containers como InversifyJS ou o DI do NestJS são aceitáveis desde que **apenas
a composition root** os conheça — decorator de container espalhado pelos casos
de uso é o framework invadindo a camada que deveria ser a mais estável.

## Entidades, tags e decorators (M3)

Tags textuais são dados inertes e por isso são toleradas na entidade. Decorators
não são: `@Entity()` executa no momento do import, registra a classe num
registry do ORM e amarra o domínio ao ciclo de vida do framework. Isso é
execução, e viola M3a.

❌ Entidade que executa framework:

```ts
// src/domain/invoice.ts
import { Entity, Column, BeforeInsert } from "typeorm"; // M3a: import de ORM

@Entity()                                               // M3a: executa no import
export class Invoice {
  @Column() id!: string;
  @Column() amount!: number;

  @BeforeInsert()                                       // M3a: hook de ciclo de vida
  generateId() {
    this.id = crypto.randomUUID();
  }
}
```

✅ Entidade com invariante própria:

```ts
// src/domain/invoice.ts
export class InvoiceAmountInvalid extends Error {
  constructor() {
    super("valor da fatura deve ser positivo");
    this.name = "InvoiceAmountInvalid";
  }
}

export type Invoice = {
  readonly id: string;
  readonly amount: number;
};

// A invariante vive aqui (M3c); o ID chega pronto de quem o gerou.
export function createInvoice(id: string, amount: number): Invoice {
  if (amount <= 0) throw new InvoiceAmountInvalid();
  return { id, amount };
}

export function isSettled(invoice: Invoice): boolean {
  return invoice.amount === 0;
}
```

O mapeamento para a tabela vive na infra. Se o seu ORM exige classes decoradas,
essas classes são modelos de persistência, não entidades (M1) — deixe-as em
`src/infra` e mapeie.

## Erros nas bordas (M4)

❌ Erro do ORM decidindo o status:

```ts
// src/adapter/invoice-controller.ts
if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
  return reply.status(404).send(); // D2: adapter sabe qual ORM a infra usa
}
```

✅ Traduzido na infra, comparado no domínio:

```ts
// src/infra/prisma-invoice-repository.ts
try {
  return await prisma.invoice.findUniqueOrThrow({ where: { id } });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new InvoiceNotFound(id);
  }
  throw error;
}
```

```ts
// src/adapter/invoice-controller.ts
if (error instanceof InvoiceNotFound) return reply.status(404).send();
```

## CRUD também atravessa as camadas (Y1)

Não existe a versão enxuta para operação simples. Um `getInvoice` de três linhas
tem entity, use case, controller e repositório como qualquer outra operação,
porque o valor está em quem lê depois saber exatamente onde procurar.

```bash
node ./scripts/new-usecase.mjs cancel-invoice
```

## Verificação

```bash
node ./scripts/import-check.mjs .
```

Configure o mapa de camadas em `.arch.json`, na raiz do projeto, quando o layout
diferir do canônico:

```json
{
  "layers": {
    "domain": ["src/domain"],
    "usecase": ["src/usecase"],
    "adapter": ["src/adapter"],
    "infra": ["src/infra"],
    "root": ["src/main.ts"]
  },
  "allow_in_domain": []
}
```

O script resolve os aliases de `compilerOptions.paths` do `tsconfig.json`, então
um import por `@/` é classificado igual a um relativo.

| Código | Condição |
|---|---|
| D1 | Módulo importa outro módulo interno de camada mais externa |
| D2 | `domain` ou `usecase` importa pacote externo fora da allowlist |
| L6 | `adapter` importa `infra`, ou `adapter` importa outro `adapter` |

P1, P4 e M3c não aparecem na saída: um port no módulo errado, lógica escondida
num componente e uma entidade sem invariante compilam e passam no verificador.
Esses exigem leitura do código.

No CI (T3):

```yaml
- run: node ./scripts/import-check.mjs .
```

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| Tipo gerado pelo Prisma no domínio | Tipo de domínio próprio, mapeado na infra (D4) |
| `@Injectable()` no caso de uso | Caso de uso é função de fábrica pura (M3a) |
| Barrel file reexportando camadas | Import direto do módulo, sem ciclo |
| `any` no limite de camada | Tipo explícito (D4) |
| Path alias da infra apontando para dentro do domínio | Import por port declarado pelo use case (P1) |
| `fetch` chamado no caso de uso | Port de gateway implementado na infra (D3) |
| Classe de entidade decorada pelo ORM | Modelo de persistência na infra, entidade no domínio (M1) |
| `process.env` lido no domínio | Configuração injetada pela composition root (P5) |
| Erro do driver propagado até o controller | Erro traduzido na infra (M4) |
| `as unknown as Invoice` para calar o compilador | Função de mapeamento explícita (M2) |

## AI Behavior

Ao revisar código TypeScript, identifique violações pelo número da regra — por
exemplo, "violação D2: `src/domain/invoice.ts` importa `@prisma/client`". Rode
`scripts/import-check.mjs` antes de afirmar que a arquitetura está correta: a
saída do script é evidência, sua leitura é hipótese.

Ao corrigir, relate o movimento — por exemplo, "movido: tipo `InvoiceRepository`
saiu de `src/infra` e foi declarado em `src/usecase` (P1); a infra agora o
satisfaz por anotação explícita".

Ao criar uma operação nova, gere as quatro camadas (Y1); não proponha a variante
curta porque a operação parece simples.
