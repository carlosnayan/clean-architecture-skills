import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { check } from "./import-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sample = join(here, "testdata", "sample");

test("detecta as violações do projeto de exemplo", async () => {
  const violations = await check(sample);
  const lines = violations.map((v) => `${v.rule}  ${v.file}:${v.line}  ${v.message}`);

  assert.deepEqual(lines, [
    "L6  src/adapter/order-controller.ts:1  adapter importa infra",
    "D2  src/domain/order.ts:1  domain importa pacote externo @prisma/client",
    "D1  src/domain/order.ts:2  domain importa camada mais externa usecase",
    "D2  src/usecase/place-order.ts:1  usecase importa pacote externo express",
  ]);
});

test("infra importando domain não viola", async () => {
  const violations = await check(sample);
  assert.equal(
    violations.filter((v) => v.file.startsWith("src/infra/")).length,
    0,
  );
});
