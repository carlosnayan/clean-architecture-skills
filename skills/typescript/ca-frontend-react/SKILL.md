---
name: ca-frontend-react
description: Use when building or reviewing a React web application's structure — where business rules live when there is no server, what a use case means in the browser, and how components stay free of data-fetching and domain logic.
when_to_use: |
  Also trigger on: componente com regra de negócio dentro, `fetch` chamado direto no
  componente, estado de servidor misturado com estado de UI, "onde coloco essa lógica
  no React", hook fazendo tudo, tipo da resposta da API usado como modelo da tela,
  "como testo isso sem renderizar", formulário validando regra de negócio.
---

# Clean Architecture num frontend React

As regras estão na skill `clean-architecture`; o mapeamento para TypeScript está
em `ts-clean-architecture`. Esta skill cobre o que muda quando a camada externa é
o navegador.

## O mapeamento no browser

A tradução que resolve a maior parte das dúvidas:

```
componente    humble object: recebe dados prontos e emite eventos (P4)   src/adapter
hook          adapter: liga o componente ao caso de uso                  src/adapter
use case      regra de aplicação, função pura, sem React                 src/usecase
port          o que o caso de uso precisa do mundo                       src/usecase
cliente HTTP  implementa o port; aqui vive fetch, axios, SDK             src/infra
```

**Sim, existe regra de negócio no frontend.** Todo cálculo que a tela faz antes
de mandar para a API — desconto aplicado, total do carrinho, se o botão pode ser
clicado, se o cupom expirou — é regra. Que o servidor valide de novo não a torna
menos regra: torna-a duplicada, e é exatamente por isso que ela precisa morar num
lugar identificável dos dois lados.

O teste que decide: **o caso de uso roda sem React?** Se para testar o cálculo
você precisa renderizar um componente, a regra está na camada errada.

## Templates

Operação inventada: aplicar um cupom ao carrinho.

```ts
// src/domain/cart.ts
export class CouponExpired extends Error {
  constructor() {
    super("cupom expirado");
    this.name = "CouponExpired";
  }
}

export class CouponBelowMinimum extends Error {
  constructor(minimum: number) {
    super(`pedido mínimo de ${minimum} para este cupom`);
    this.name = "CouponBelowMinimum";
  }
}

export type Coupon = {
  readonly code: string;
  readonly percentOff: number;
  readonly minimumTotal: number;
  readonly expiresAt: Date;
};

export type Cart = {
  readonly items: ReadonlyArray<{ price: number; quantity: number }>;
  readonly coupon: Coupon | null;
};

export function subtotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// A regra de negócio, testável sem navegador e sem React.
export function applyCoupon(cart: Cart, coupon: Coupon, now: Date): Cart {
  if (coupon.expiresAt <= now) throw new CouponExpired();
  if (subtotal(cart) < coupon.minimumTotal) throw new CouponBelowMinimum(coupon.minimumTotal);
  return { ...cart, coupon };
}

export function total(cart: Cart): number {
  const base = subtotal(cart);
  return cart.coupon ? base * (1 - cart.coupon.percentOff / 100) : base;
}
```

```ts
// src/usecase/apply-coupon.ts
import { applyCoupon, type Cart, type Coupon } from "@/domain/cart";

export type ApplyCouponInput = {
  cart: Cart;
  code: string;
};

// Ports declarados por quem consome (P1).
export type CouponGateway = {
  findByCode(code: string): Promise<Coupon>;
};

export type Clock = {
  now(): Date;
};

export function makeApplyCoupon(coupons: CouponGateway, clock: Clock) {
  return async function execute(input: ApplyCouponInput): Promise<Cart> {
    const coupon = await coupons.findByCode(input.code);
    return applyCoupon(input.cart, coupon, clock.now());
  };
}
```

```ts
// src/adapter/use-apply-coupon.ts
import { useState } from "react";

import type { Cart } from "@/domain/cart";
import type { makeApplyCoupon } from "@/usecase/apply-coupon";

type ApplyCouponView = {
  cart: Cart;
  error: string | null;
  isApplying: boolean;
  apply: (code: string) => Promise<void>;
};

// O hook é o adapter: estado de UI e tradução de erro para texto. Nenhuma regra.
export function useApplyCoupon(
  initialCart: Cart,
  execute: ReturnType<typeof makeApplyCoupon>,
): ApplyCouponView {
  const [cart, setCart] = useState(initialCart);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  async function apply(code: string) {
    setIsApplying(true);
    setError(null);
    try {
      setCart(await execute({ cart, code }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "não foi possível aplicar o cupom");
    } finally {
      setIsApplying(false);
    }
  }

  return { cart, error, isApplying, apply };
}
```

```tsx
// src/adapter/cart-summary.tsx
import { total } from "@/domain/cart";
import type { Cart } from "@/domain/cart";

type Props = {
  cart: Cart;
  error: string | null;
  isApplying: boolean;
  onApply: (code: string) => void;
};

// Humble object (P4): recebe dados prontos, emite eventos, nada decide.
export function CartSummary({ cart, error, isApplying, onApply }: Props) {
  return (
    <section>
      <output>{total(cart)}</output>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(new FormData(event.currentTarget).get("code") as string);
        }}
      >
        <input name="code" aria-label="código do cupom" />
        <button type="submit" disabled={isApplying}>
          aplicar
        </button>
      </form>
    </section>
  );
}
```

```ts
// src/infra/http-coupon-gateway.ts
import type { Coupon } from "@/domain/cart";
import type { CouponGateway } from "@/usecase/apply-coupon";

type CouponResponse = {
  code: string;
  percent_off: number;
  minimum_total: number;
  expires_at: string;
};

export function makeHttpCouponGateway(baseUrl: string): CouponGateway {
  return {
    async findByCode(code) {
      const response = await fetch(`${baseUrl}/coupons/${code}`);
      if (!response.ok) throw new Error(`cupom ${code} indisponível`);
      return toDomain((await response.json()) as CouponResponse);
    },
  };
}

// M2: o formato da API morre aqui. snake_case e string de data não atravessam.
function toDomain(response: CouponResponse): Coupon {
  return {
    code: response.code,
    percentOff: response.percent_off,
    minimumTotal: response.minimum_total,
    expiresAt: new Date(response.expires_at),
  };
}
```

O teste de `applyCoupon` é uma chamada de função com uma data fixa. Nenhum
`render`, nenhum mock de `fetch`, nenhum `waitFor`.

## Decisões recorrentes

**Estado de servidor versus estado de domínio.** Cache, revalidação, retry e
status de carregamento são estado de *transporte* e pertencem ao adapter. O
carrinho, o cupom aplicado e o total são estado de *domínio*. React Query e SWR
gerenciam o primeiro com competência — só não deixe o segundo morar dentro deles.

**Onde a resposta da API vira modelo de domínio.** Na infra, numa função de
mapeamento explícita, como o `toDomain` acima. Usar o tipo da resposta
diretamente na tela faz uma mudança de contrato do backend atravessar o app
inteiro sem encontrar uma fronteira.

**Por que data-fetching é adapter.** `useQuery` conhece cache, chaves e
invalidação: isso é mecânica de transporte. O caso de uso não deve saber que a
resposta veio de um cache ou da rede.

**Validação de formulário.** Forma no componente ou no schema: campo obrigatório,
formato de e-mail, número positivo. Regra no domínio: cupom expirado, limite de
crédito, horário permitido. A mesma divisão do backend.

**Quando um estado é global.** Contexto injeta *dependências* (o caso de uso já
construído), não regras. Um provider que calcula desconto é um caso de uso
disfarçado de React.

**Se o app usa Server Components ou um meta-framework.** A divisão não muda: o
componente de servidor é outro adapter. O caso de uso continua sendo a função
pura que os dois lados chamam.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| `fetch` dentro do componente | Componente chama o hook, hook chama o caso de uso (L6) |
| Tipo da resposta da API usado na tela | Modelo de domínio mapeado no adapter (D4, M2) |
| Regra de desconto dentro do JSX | Regra no caso de uso, testada sem render (P4) |
| Contexto global carregando regra de negócio | Contexto injeta dependências, não regras (P5) |
| `useEffect` orquestrando regra de negócio | Caso de uso chamado pelo handler do evento |
| `new Date()` dentro da regra | Port `Clock` injetado, testável com data fixa |
| Teste que renderiza para testar cálculo | Teste que chama a função de domínio (T1) |
| Schema de validação com regra de negócio | Schema valida forma; regra no domínio |
| `localStorage` lido no componente | Port de storage implementado na infra |

## AI Behavior

Ao revisar um frontend React, aplique o teste decisivo a cada pedaço de lógica:
isso roda sem React? Se não roda e não é UI, está na camada errada — diga qual
regra e para onde vai.

Ao implementar, gere as quatro camadas (Y1): domínio, caso de uso, hook e
gateway. Mostre o mapeamento explícito da resposta da API.

Ao corrigir, relate o movimento — por exemplo, "movido: cálculo do total saiu de
`CartSummary` e virou `total()` em `src/domain/cart.ts` (P4); o componente agora
só renderiza".
