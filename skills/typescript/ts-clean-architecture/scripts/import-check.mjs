#!/usr/bin/env node
// Valida a Dependency Rule de um projeto TypeScript lendo os imports de cada
// arquivo e comparando as camadas de origem e destino. Sem dependências.
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = {
  layers: {
    domain: ["src/domain", "src/core/domain", "src/entities"],
    usecase: ["src/usecase", "src/application", "src/core/usecase"],
    adapter: ["src/adapter", "src/controllers", "src/ui", "src/hooks"],
    infra: ["src/infra", "src/repositories", "src/services"],
    root: ["src/main.ts", "src/index.ts", "src/composition"],
  },
  allow_in_domain: [],
};

const RANK = { domain: 0, usecase: 1, adapter: 2, infra: 3, root: 4 };

const IMPORT_PATTERNS = [
  /\bimport\s+type\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bexport\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

export async function check(root) {
  const projectRoot = resolve(root);
  const config = await loadConfig(projectRoot);
  const aliases = await loadAliases(projectRoot);
  const allowed = new Set(config.allow_in_domain);
  const violations = [];

  for await (const file of walk(projectRoot)) {
    const rel = toPosix(relative(projectRoot, file));
    const fileLayer = layerOf(rel, config);
    if (!fileLayer) continue;

    const source = await readFile(file, "utf8");
    for (const { specifier, line } of extractImports(source)) {
      const violation = classify({
        fileLayer,
        specifier,
        fileDir: toPosix(relative(projectRoot, dirname(file))),
        config,
        aliases,
        allowed,
      });
      if (violation) violations.push({ ...violation, file: rel, line });
    }
  }

  violations.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return violations;
}

function classify({ fileLayer, specifier, fileDir, config, aliases, allowed }) {
  const internal = resolveInternal(specifier, fileDir, aliases);

  if (internal !== null) {
    const targetLayer = layerOf(internal, config);
    if (!targetLayer || targetLayer === fileLayer) return null;
    if (fileLayer === "adapter" && targetLayer === "infra") {
      return { rule: "L6", message: "adapter importa infra" };
    }
    if (RANK[targetLayer] > RANK[fileLayer]) {
      return { rule: "D1", message: `${fileLayer} importa camada mais externa ${targetLayer}` };
    }
    return null;
  }

  if (fileLayer !== "domain" && fileLayer !== "usecase") return null;
  if (allowed.has(specifier)) return null;
  return { rule: "D2", message: `${fileLayer} importa pacote externo ${specifier}` };
}

// resolveInternal devolve o caminho relativo à raiz para imports do próprio
// projeto (relativos ou por alias), ou null para pacotes externos.
function resolveInternal(specifier, fileDir, aliases) {
  if (specifier.startsWith(".")) {
    return toPosix(join(fileDir, specifier));
  }
  for (const [prefix, target] of aliases) {
    if (specifier === prefix) return target;
    if (specifier.startsWith(prefix + "/")) {
      return toPosix(join(target, specifier.slice(prefix.length + 1)));
    }
  }
  return null;
}

function layerOf(relPath, config) {
  let best = "";
  let bestLength = -1;
  for (const [layer, prefixes] of Object.entries(config.layers)) {
    for (const raw of prefixes) {
      const prefix = raw.replace(/^\/+|\/+$/g, "");
      const matches =
        relPath === prefix || relPath.startsWith(prefix + "/") || matchesFilePrefix(relPath, prefix);
      if (matches && prefix.length > bestLength) {
        best = layer;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

// matchesFilePrefix cobre prefixos que apontam para um arquivo específico,
// como src/main.ts, inclusive quando o import omite a extensão.
function matchesFilePrefix(relPath, prefix) {
  return (
    SOURCE_EXTENSIONS.some((ext) => prefix.endsWith(ext)) &&
    stripExtension(relPath) === stripExtension(prefix)
  );
}

function stripExtension(path) {
  for (const ext of SOURCE_EXTENSIONS) {
    if (path.endsWith(ext)) return path.slice(0, -ext.length);
  }
  return path;
}

function extractImports(source) {
  const found = new Map();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split("\n").length;
      const key = `${match[1]}@${line}`;
      if (!found.has(key)) found.set(key, { specifier: match[1], line });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      yield* walk(join(directory, entry.name));
      continue;
    }
    const name = entry.name;
    if (name.includes(".test.") || name.includes(".spec.")) continue;
    if (SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      yield join(directory, name);
    }
  }
}

async function loadConfig(root) {
  const config = await readJson(join(root, ".arch.json"));
  if (!config) {
    process.stderr.write("aviso: .arch.json não encontrado, usando layout padrão\n");
    return DEFAULT_CONFIG;
  }
  for (const layer of Object.keys(config.layers ?? {})) {
    if (!(layer in RANK)) {
      throw new Error(
        `.arch.json: camada desconhecida "${layer}" (use domain, usecase, adapter, infra ou root)`,
      );
    }
  }
  return {
    layers: config.layers ?? DEFAULT_CONFIG.layers,
    allow_in_domain: config.allow_in_domain ?? [],
  };
}

// loadAliases lê compilerOptions.paths e devolve pares [prefixo, destino]
// relativos à raiz do projeto, do mais específico para o menos.
async function loadAliases(root) {
  const tsconfig = await readJson(join(root, "tsconfig.json"));
  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths) return [];

  const baseUrl = tsconfig.compilerOptions.baseUrl ?? ".";
  const aliases = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!targets?.length) continue;
    aliases.push([
      pattern.replace(/\/\*$/, ""),
      toPosix(join(baseUrl, targets[0].replace(/\/\*$/, ""))),
    ]);
  }
  return aliases.sort((a, b) => b[0].length - a[0].length);
}

async function readJson(path) {
  try {
    return JSON.parse(stripJsonComments(await readFile(path, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// stripJsonComments existe porque tsconfig.json aceita comentários.
function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function toPosix(path) {
  return path.split("\\").join("/");
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const target = process.argv[2] ?? ".";
  try {
    const violations = await check(target);
    for (const v of violations) {
      process.stdout.write(`${v.rule}  ${v.file}:${v.line}  ${v.message}\n`);
    }
    if (violations.length > 0) {
      process.stderr.write(`\n${violations.length} violação(ões) da Dependency Rule\n`);
      process.exit(1);
    }
    process.stderr.write("ok: nenhuma violação da Dependency Rule\n");
  } catch (error) {
    process.stderr.write(`erro: ${error.message}\n`);
    process.exit(2);
  }
}
