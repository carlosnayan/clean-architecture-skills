---
name: ca-mobile-rn
description: Use when building or reviewing a React Native application's structure — isolating business rules from navigation, native modules, offline storage and platform differences.
when_to_use: |
  Also trigger on: regra de negócio dentro da tela, chamada a módulo nativo no
  componente, lógica de sincronização offline espalhada, "onde coloco isso no React
  Native", código com `Platform.OS` dentro da regra de negócio, navegação carregando
  estado de domínio, storage local acessado direto pela tela.
---

# Clean Architecture em React Native

As regras estão na skill `clean-architecture`; o mapeamento para TypeScript está
em `ts-clean-architecture`. A divisão de componente/hook/caso de uso é a mesma de
`ca-frontend-react` — esta skill cobre o que a plataforma acrescenta.

## O mapeamento no mobile

```
tela          humble object: recebe dados prontos, emite eventos (P4)    src/adapter
hook          adapter: liga a tela ao caso de uso                        src/adapter
use case      regra de aplicação, sem React e sem plataforma             src/usecase
port          o que o caso de uso precisa do mundo                       src/usecase
infra         storage, permissões, push, módulo nativo, rede             src/infra
```

A diferença em relação à web é o tamanho da camada de infra: storage local,
permissões, notificações, câmera, biometria, conectividade e módulos nativos são
todos mundo externo. Cada um entra por um port, e nenhum deles aparece acima de
`src/infra`.

O teste continua o mesmo: **o caso de uso roda no Node, sem simulador?**

## Templates

Operação inventada: sincronizar favoritos guardados offline.

```ts
// src/domain/favorites.ts
export type Favorite = {
  readonly id: string;
  readonly productId: string;
  readonly savedAt: Date;
  readonly syncedAt: Date | null;
};

export function isPending(favorite: Favorite): boolean {
  return favorite.syncedAt === null;
}

export function markSynced(favorite: Favorite, at: Date): Favorite {
  return { ...favorite, syncedAt: at };
}

// Regra de negócio: em conflito, a gravação mais recente vence.
export function resolveConflict(local: Favorite, remote: Favorite): Favorite {
  return local.savedAt >= remote.savedAt ? local : remote;
}
```

```ts
// src/usecase/sync-favorites.ts
import { isPending, markSynced, resolveConflict, type Favorite } from "@/domain/favorites";

export type SyncFavoritesInput = {
  force: boolean;
};

export type SyncFavoritesResult = {
  pushed: number;
  skipped: number;
};

// Ports declarados por quem consome (P1). Nenhum deles menciona a plataforma.
export type FavoriteStorage = {
  readAll(): Promise<Favorite[]>;
  write(favorites: Favorite[]): Promise<void>;
};

export type FavoriteApi = {
  fetchAll(): Promise<Favorite[]>;
  push(favorites: Favorite[]): Promise<void>;
};

export type Connectivity = {
  isOnline(): Promise<boolean>;
};

export type Clock = {
  now(): Date;
};

export function makeSyncFavorites(
  storage: FavoriteStorage,
  api: FavoriteApi,
  connectivity: Connectivity,
  clock: Clock,
) {
  return async function execute(input: SyncFavoritesInput): Promise<SyncFavoritesResult> {
    // Offline-first é regra de aplicação: a decisão de não sincronizar é do
    // caso de uso, não de um `if` espalhado pelas telas.
    if (!input.force && !(await connectivity.isOnline())) {
      return { pushed: 0, skipped: (await storage.readAll()).filter(isPending).length };
    }

    const local = await storage.readAll();
    const remote = await api.fetchAll();
    const remoteById = new Map(remote.map((favorite) => [favorite.id, favorite]));

    const resolved = local.map((favorite) => {
      const counterpart = remoteById.get(favorite.id);
      return counterpart ? resolveConflict(favorite, counterpart) : favorite;
    });

    const pending = resolved.filter(isPending);
    if (pending.length > 0) await api.push(pending);

    const now = clock.now();
    await storage.write(resolved.map((favorite) => markSynced(favorite, now)));

    return { pushed: pending.length, skipped: 0 };
  };
}
```

```ts
// src/adapter/use-sync-favorites.ts
import { useCallback, useState } from "react";

import type { makeSyncFavorites } from "@/usecase/sync-favorites";

export function useSyncFavorites(execute: ReturnType<typeof makeSyncFavorites>) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = useCallback(
    async (force = false) => {
      setIsSyncing(true);
      try {
        const result = await execute({ force });
        setMessage(
          result.pushed > 0 ? `${result.pushed} favoritos sincronizados` : "tudo em dia",
        );
      } catch {
        setMessage("não foi possível sincronizar agora");
      } finally {
        setIsSyncing(false);
      }
    },
    [execute],
  );

  return { isSyncing, message, sync };
}
```

```ts
// src/infra/async-storage-favorites.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Favorite } from "@/domain/favorites";
import type { FavoriteStorage } from "@/usecase/sync-favorites";

const KEY = "favorites";

export const asyncStorageFavorites: FavoriteStorage = {
  async readAll() {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    // M2: datas voltam como string do storage e são reconstruídas aqui.
    return (JSON.parse(raw) as SerializedFavorite[]).map(toDomain);
  },

  async write(favorites) {
    await AsyncStorage.setItem(KEY, JSON.stringify(favorites));
  },
};

type SerializedFavorite = {
  id: string;
  productId: string;
  savedAt: string;
  syncedAt: string | null;
};

function toDomain(raw: SerializedFavorite): Favorite {
  return {
    id: raw.id,
    productId: raw.productId,
    savedAt: new Date(raw.savedAt),
    syncedAt: raw.syncedAt ? new Date(raw.syncedAt) : null,
  };
}
```

O teste de `makeSyncFavorites` usa quatro objetos literais como ports. Roda em
milissegundos, no Node, sem Metro e sem simulador.

## Decisões recorrentes

**Offline-first é regra de aplicação.** "Posso gravar local e sincronizar depois?"
e "quem vence num conflito?" são decisões de negócio. Se elas vivem na tela, cada
tela nova reimplementa a política — e elas divergem.

**`Platform.OS` fica na infra.** Diferença de plataforma se resolve com duas
implementações do mesmo port, escolhidas na composition root. Um `if (Platform.OS
=== "ios")` dentro do caso de uso é o sistema operacional entrando na camada mais
estável do app.

```ts
// src/main.ts
const storage = Platform.OS === "ios" ? keychainFavorites : encryptedPrefsFavorites;
```

**Navegação é adapter.** A rota transporta um identificador, não um agregado de
domínio. Parâmetro de navegação carregando o objeto inteiro transforma o estado
da navegação num banco de dados paralelo, que ninguém invalida.

**Permissões e módulos nativos.** Sempre atrás de um port. O caso de uso pede
"a localização atual"; quem sabe que isso exige permissão, que o usuário pode
recusar e que iOS e Android pedem de formas diferentes é a infra.

**Como testo sem simulador.** Chamando `execute` com fakes dos ports. Se o teste
precisa de `jest.mock("react-native")`, a lógica vazou para a camada de
plataforma (P4).

**Retry e backoff** são política de transporte: adapter ou infra. O caso de uso
decide *se* a operação deve ser repetida do ponto de vista do negócio
(idempotência), não *quantas vezes* a rede deve tentar.

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| `AsyncStorage` chamado na tela | Port de storage implementado na infra (L6) |
| `Platform.OS` dentro do caso de uso | Duas implementações do mesmo port (D2) |
| Lógica de retry no componente | Retry no adapter; idempotência no caso de uso |
| Objeto de domínio como parâmetro de rota | Identificador na rota, busca no caso de uso |
| `useEffect` sincronizando ao montar a tela | Caso de uso chamado por um evento explícito |
| Módulo nativo importado no domínio | Port declarado pelo caso de uso (D3) |
| Política de conflito dentro do hook | Função de domínio testável (P4) |
| `new Date()` dentro da regra de sincronização | Port `Clock` injetado |
| Permissão pedida dentro do caso de uso | Infra resolve permissão ao implementar o port |

## AI Behavior

Ao revisar um app React Native, liste primeiro tudo que toca a plataforma —
storage, permissões, push, módulos nativos, conectividade — e verifique se cada
um está atrás de um port. O que estiver acima de `src/infra` é achado.

Ao implementar, gere as quatro camadas (Y1) e mostre a escolha de implementação
por plataforma acontecendo na composition root, não dentro da regra.

Ao corrigir, relate o movimento — por exemplo, "movido: `AsyncStorage` saiu de
`FavoritesScreen` e virou o port `FavoriteStorage`, implementado em
`src/infra/async-storage-favorites.ts` (L6, P1)".
