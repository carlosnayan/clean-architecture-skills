#!/usr/bin/env node
// Gera as quatro camadas de um caso de uso. Uso: node new-usecase.mjs place-order
import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname } from "node:path";

const name = process.argv[2];
if (!name) {
  process.stderr.write("uso: node new-usecase.mjs <nome-do-caso-de-uso>   (exemplo: place-order)\n");
  process.exit(2);
}

const Pascal = name
  .split(/[-_]/)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join("");

const camel = Pascal.charAt(0).toLowerCase() + Pascal.slice(1);

const files = new Map([
  [`src/domain/${name}.ts`, `export type ${Pascal}Result = {\n};\n`],
  [
    `src/usecase/${name}.ts`,
    `import type { ${Pascal}Result } from "@/domain/${name}";\n\n` +
      `export type ${Pascal}Input = {\n};\n\n` +
      `// Port consumido por este caso de uso (P1).\n` +
      `export type ${Pascal}Repository = {\n};\n\n` +
      `export function make${Pascal}(repository: ${Pascal}Repository) {\n` +
      `  return async function execute(input: ${Pascal}Input): Promise<${Pascal}Result> {\n` +
      `    void repository;\n` +
      `    void input;\n` +
      `    throw new Error("não implementado");\n` +
      `  };\n}\n`,
  ],
  [
    `src/adapter/${name}-controller.ts`,
    `import type { make${Pascal} } from "@/usecase/${name}";\n\n` +
      `// Traduz o protocolo de entrada para o caso de uso e de volta (L3).\n` +
      `export function make${Pascal}Controller(execute: ReturnType<typeof make${Pascal}>) {\n` +
      `  return async function handle(): Promise<void> {\n` +
      `    void execute;\n` +
      `  };\n}\n`,
  ],
  [
    `src/infra/${name}-repository.ts`,
    `import type { ${Pascal}Repository } from "@/usecase/${name}";\n\n` +
      `export const ${camel}Repository: ${Pascal}Repository = {\n};\n`,
  ],
]);

for (const path of files.keys()) {
  try {
    await access(path);
    process.stderr.write(`${path} já existe; nada foi gerado\n`);
    process.exit(1);
  } catch {
    // ausente, pode gerar
  }
}

for (const [path, contents] of files) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  process.stdout.write(`${path}\n`);
}
