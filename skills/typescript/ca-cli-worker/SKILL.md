---
name: ca-cli-worker
description: Use when building or reviewing a Node CLI, background worker, cron job or queue consumer in TypeScript. Applies Clean Architecture layer boundaries where the entry point is a command or a message instead of an HTTP request.
when_to_use: |
  Also trigger on: argumentos de linha de comando lidos dentro da regra de negócio,
  consumidor de fila chamando repositório direto, "onde coloco o loop do worker",
  cancelamento por AbortSignal, "como testo esse job", cron com lógica no agendador,
  `process.exit` no meio do processamento.
---

# Clean Architecture num CLI ou worker em Node

As regras estão na skill `clean-architecture`; o mapeamento para TypeScript está
em `ts-clean-architecture`. Esta skill cobre o que muda quando a entrada não é
uma requisição HTTP.

## O adapter aqui é o comando

Argumentos, variáveis de ambiente e mensagens de fila são o equivalente exato do
corpo de um request: dados não confiáveis, num formato do mundo externo, que
alguém traduz para um input model antes de entrar no caso de uso.

```
argv / mensagem   entrada crua do mundo externo             src/main.ts (root)
adapter           traduz para input model, trata sinais      src/adapter
use case          orquestra a regra de aplicação             src/usecase
port              o que o use case precisa do mundo          src/usecase
infra             índice, fila, banco, relógio               src/infra
```

O caso de uso é literalmente o mesmo de um backend HTTP. Se trocar o disparo
custa mais que trocar o adapter, alguma coisa vazou.

## Templates

Operação inventada: reindexar o catálogo.

```ts
// src/domain/catalog.ts
export class CatalogEmpty extends Error {
  constructor() {
    super("catálogo vazio, nada a reindexar");
    this.name = "CatalogEmpty";
  }
}

export type Product = {
  readonly id: string;
  readonly name: string;
};

export type ReindexReport = {
  readonly indexed: number;
  readonly skipped: number;
};

// O relatório é montado no domínio, não somado à mão em cada ponto de entrada.
export function mergeReports(a: ReindexReport, b: ReindexReport): ReindexReport {
  return { indexed: a.indexed + b.indexed, skipped: a.skipped + b.skipped };
}
```

```ts
// src/usecase/reindex-catalog.ts
import { CatalogEmpty, mergeReports, type Product, type ReindexReport } from "@/domain/catalog";

export type ReindexCatalogInput = {
  batchSize: number;
  dryRun: boolean;
  signal: AbortSignal;
};

export type ProductReader = {
  nextBatch(size: number): Promise<Product[]>;
};

export type SearchIndex = {
  index(products: Product[]): Promise<void>;
};

export function makeReindexCatalog(products: ProductReader, searchIndex: SearchIndex) {
  return async function execute(input: ReindexCatalogInput): Promise<ReindexReport> {
    let report: ReindexReport = { indexed: 0, skipped: 0 };

    for (;;) {
      // Cancelamento é decisão de aplicação: o caso de uso respeita o sinal que
      // recebeu, sem saber se veio de SIGTERM, de um timeout ou de um teste.
      input.signal.throwIfAborted();

      const batch = await products.nextBatch(input.batchSize);
      if (batch.length === 0) break;

      if (input.dryRun) {
        report = mergeReports(report, { indexed: 0, skipped: batch.length });
        continue;
      }

      await searchIndex.index(batch);
      report = mergeReports(report, { indexed: batch.length, skipped: 0 });
    }

    if (report.indexed === 0 && report.skipped === 0) throw new CatalogEmpty();
    return report;
  };
}
```

```ts
// src/adapter/reindex-catalog-command.ts
import { parseArgs } from "node:util";

import type { makeReindexCatalog } from "@/usecase/reindex-catalog";

type Output = { write(text: string): void };

// Traduz argumentos em input model e o resultado em texto. Nenhuma regra aqui.
export function makeReindexCatalogCommand(
  execute: ReturnType<typeof makeReindexCatalog>,
  out: Output,
) {
  return async function run(argv: string[], signal: AbortSignal): Promise<void> {
    const { values } = parseArgs({
      args: argv,
      options: {
        "batch-size": { type: "string", default: "500" },
        "dry-run": { type: "boolean", default: false },
      },
    });

    const report = await execute({
      batchSize: Number(values["batch-size"]),
      dryRun: values["dry-run"] === true,
      signal,
    });

    out.write(`indexados: ${report.indexed}, ignorados: ${report.skipped}\n`);
  };
}
```

```ts
// src/main.ts
import { CatalogEmpty } from "@/domain/catalog";
import { makeReindexCatalogCommand } from "@/adapter/reindex-catalog-command";
import { makeReindexCatalog } from "@/usecase/reindex-catalog";
import { makePostgresProductReader } from "@/infra/postgres-product-reader";
import { makeHttpSearchIndex } from "@/infra/http-search-index";

// O sinal do sistema operacional é detalhe de plataforma: fica no root.
const controller = new AbortController();
process.once("SIGTERM", () => controller.abort());
process.once("SIGINT", () => controller.abort());

const run = makeReindexCatalogCommand(
  makeReindexCatalog(
    makePostgresProductReader(process.env.DATABASE_URL!),
    makeHttpSearchIndex(process.env.SEARCH_URL!),
  ),
  process.stdout,
);

try {
  await run(process.argv.slice(2), controller.signal);
} catch (error) {
  // O código de saída é derivado do erro de domínio, no root (M4).
  if (error instanceof CatalogEmpty) {
    process.stdout.write("nada a fazer\n");
    process.exit(0);
  }
  process.stderr.write(`reindexação falhou: ${error}\n`);
  process.exit(1);
}
```

Para um consumidor de fila, o adapter muda de `run(argv, signal)` para
`handle(message, signal)` e nada mais se move.

## Decisões recorrentes

**Onde vive o loop do worker.** No adapter. O laço que busca mensagens, faz
backoff e confirma o recebimento é mecânica de transporte. O caso de uso processa
uma unidade de trabalho e retorna.

**Cancelamento.** Um `AbortSignal` criado no root, a partir de `SIGTERM`,
atravessa as camadas. O domínio nunca chama `process.exit` nem escuta sinais:
quem decide terminar o processo é quem o iniciou.

**Configuração.** `process.env` é lido na composition root e injetado (P5). Um
`process.env.BATCH_SIZE` dentro do caso de uso torna o teste dependente do
ambiente e esconde a dependência de quem lê a assinatura.

**Idempotência é regra de aplicação.** "Já processei essa mensagem?" pertence ao
caso de uso, atrás de um port. No adapter, vira lógica duplicada em cada ponto
de entrada.

**Como testo esse job.** Chamando `execute` com fakes dos ports e um
`AbortController` próprio. Se o teste precisa de `process.argv` ou de um broker,
a lógica vazou para o adapter (P4).

**Cron.** O agendador diz *quando*, nunca *o quê*. Expressão cron na
configuração, regra no caso de uso.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| `parseArgs` dentro do caso de uso | Argumentos lidos no adapter, input model no caso de uso (P3) |
| Worker chama o repositório | Worker chama o caso de uso (L6) |
| `process.exit` dentro do domínio | Erro propagado; o root decide o código de saída (M4) |
| `process.env` lido no caso de uso | Configuração injetada pela composition root (P5) |
| `setTimeout` de backoff no caso de uso | Backoff no adapter, como política de transporte |
| Caso de uso recebendo a mensagem crua do broker | Input model próprio, mensagem decodificada no adapter |
| Lógica do cron dentro do agendador | Agendador dispara; a regra está no caso de uso |
| Deduplicação com um `Set` global no worker | Port de idempotência declarado pelo caso de uso |
| `console.log` espalhado pelo domínio | Port de log, ou retorno que o adapter formata |

## AI Behavior

Ao revisar um CLI ou worker, pergunte primeiro se o caso de uso poderia ser
exposto por HTTP sem alteração. Se não puder, o adapter vazou para dentro — diga
exatamente o quê, citando a regra.

Ao implementar, gere as quatro camadas (Y1) e mostre o root traduzindo sinal em
`AbortSignal` e erro de domínio em código de saída.

Ao corrigir, relate o movimento — por exemplo, "movido: leitura de argumentos
saiu do caso de uso e foi para `src/adapter`; `execute` agora recebe
`ReindexCatalogInput` (P3)".
