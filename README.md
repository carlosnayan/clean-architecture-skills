# Clean Architecture Skills for AI Agents

[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-Compatible-blue)](https://agentskills.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Teach your AI where the code goes — and let it prove the answer.**

[Agent Skills](https://agentskills.io) que aplicam Clean Architecture ao código
que seu agente escreve e revisa. Funcionam com Claude Code, Google Antigravity e
qualquer ferramenta compatível com o padrão Agent Skills.

## Why?

Todo agente sabe recitar Clean Architecture. Peça a definição da Dependency Rule
e você recebe um parágrafo correto. Peça código, e ele escreve um handler que
chama o repositório direto.

O problema não é conhecimento: é aplicação. O agente erra nas decisões concretas
— onde o arquivo mora, qual import é vazamento de infra, quando criar um port,
se aquele `if` é regra de negócio ou detalhe de protocolo. E erra de forma
inconsistente entre sessões, o que é pior do que errar sempre igual.

Estas skills atacam os dois lados: um catálogo de 24 regras numeradas, para que
o agente fale em violações específicas em vez de impressões vagas, e um
verificador executável da Dependency Rule, para que a afirmação "a arquitetura
está correta" tenha evidência em vez de otimismo.

## What's Included

| Track | Skill | Descrição | Regras |
| --- | --- | --- | --- |
| Core | `clean-architecture` | **Skill núcleo** — catálogo completo, agnóstico de linguagem | D1-D5, L1-L6, P1-P5, M1-M4, T1-T4, Y1-Y2 |
| Go | `go-clean-architecture` | **Master do track** — pacotes, ports, wiring e verificação | Todas, traduzidas para Go |
| Go | `ca-backend-http` | Caminho de uma requisição HTTP | D1-D5, L3, L6, M4, P1-P3 |
| Go | `ca-cli-worker` | CLI, worker, cron e consumidor de fila | D1-D5, L3, L6, P1-P4, Y1 |
| Go | `arch-boy-scout` | **Orquestrador** — melhore a camada de tudo que tocar | Y2 e todas as demais |
| TypeScript | `ts-clean-architecture` | **Master do track** — módulos, tipos, DI e verificação | Todas, traduzidas para TS |
| TypeScript | `ca-backend-http` | Caminho de uma requisição HTTP | D1-D5, L3, L6, M4, P1-P3 |
| TypeScript | `ca-frontend-react` | Regras de negócio no navegador; componente como humble object | D4, L6, M2, P1, P4 |
| TypeScript | `ca-mobile-rn` | Storage, permissões, offline e diferenças de plataforma | D2, D3, L6, P1, P4 |
| TypeScript | `ca-cli-worker` | CLI, worker, cron e consumidor de fila | D1-D5, L3, L6, P1-P5, Y1 |
| TypeScript | `arch-boy-scout` | **Orquestrador** — melhore a camada de tudo que tocar | Y2 e todas as demais |

Use a skill master para cobertura ampla, ou as skills de contexto para o tipo de
aplicação em que você está trabalhando.

## Cobertura por track

| Contexto | Go | TypeScript |
| --- | --- | --- |
| Backend HTTP | ✅ | ✅ |
| CLI / worker / cron | ✅ | ✅ |
| Frontend React | — | ✅ |
| Mobile React Native | — | ✅ |

A assimetria é proposital. Go não escreve React nem React Native, e preencher
essas células com conteúdo genérico só tornaria a skill menos confiável nas
células onde ela tem algo real a dizer.

## Installation

Sempre instale a skill núcleo junto com o track escolhido.

> [!WARNING]
> Instale apenas um track por diretório de skills. Go e TypeScript reusam os
> mesmos nomes (`ca-backend-http`, `ca-cli-worker`, `arch-boy-scout`). Os dois
> juntos fazem o agente carregar instruções conflitantes.

### Claude Code

**Global:**

```bash
mkdir -p ~/.claude/skills

# Track Go
cp -r skills/core/* skills/go/* ~/.claude/skills/

# Track TypeScript
cp -r skills/core/* skills/typescript/* ~/.claude/skills/
```

**Específico do projeto:**

```bash
mkdir -p .claude/skills
cp -r skills/core/* skills/go/* .claude/skills/
```

### Google Antigravity

**Global:**

```bash
mkdir -p ~/.gemini/antigravity/skills
cp -r skills/core/* skills/go/* ~/.gemini/antigravity/skills/
```

**Específico do projeto:**

```bash
mkdir -p .agent/skills
cp -r skills/core/* skills/typescript/* .agent/skills/
```

### Outras ferramentas compatíveis

As skills seguem o padrão [Agent Skills](https://agentskills.io). Consulte a
documentação da sua ferramenta para o diretório de skills e copie o conteúdo de
`skills/core/` mais o track escolhido.

## Verificação

Numa sessão do Claude Code:

- Pergunte `What skills are available?` — você deve ver `clean-architecture`,
  `go-clean-architecture` (ou `ts-clean-architecture`), `ca-backend-http`,
  `ca-cli-worker` e `arch-boy-scout`.
- Ou invoque direto: `/arch-boy-scout`.

Skills recarregam a quente dentro de um `~/.claude/skills/` existente. Se você
criou o diretório agora, reinicie o Claude Code uma vez para que ele passe a
observá-lo.

Para validar o repositório em si:

```bash
./scripts/validate-skills.sh
```

## O catálogo de regras

### Dependency Rule (D1-D5)

| Regra | Princípio |
| --- | --- |
| D1 | Dependências apontam para dentro, sempre |
| D2 | O domínio não importa framework, IO, ORM nem SDK |
| D3 | Precisou chamar para fora? Inverta com um port declarado pela camada interna |
| D4 | Dados cruzam limites como tipos da camada interna |
| D5 | Fluxo de controle e direção de dependência são independentes |

### Camadas (L1-L6)

| Regra | Princípio |
| --- | --- |
| L1 | Entities: regra de negócio corporativa, zero dependências |
| L2 | Use cases: regra de aplicação, orquestram entities através de ports |
| L3 | Adapters: controllers, presenters, gateways — só traduzem formato |
| L4 | Frameworks e drivers são detalhe substituível na borda |
| L5 | A estrutura de pastas grita o domínio, não o framework |
| L6 | Não pule camadas — controller não fala com repositório |

### Ports e Boundaries (P1-P5)

| Regra | Princípio |
| --- | --- |
| P1 | O port pertence a quem o consome, não a quem o implementa |
| P2 | Interfaces pequenas, moldadas pela necessidade (ISP) |
| P3 | Um use case é uma operação, com input e output models explícitos |
| P4 | Humble object: tire a lógica de tudo que é difícil de testar |
| P5 | Injeção de dependência só na composition root |

### Modelos e Dados (M1-M4)

| Regra | Princípio |
| --- | --- |
| M1 | Entity, modelo de persistência e DTO são papéis distintos, ainda que coabitem um struct |
| M2 | Quando houver tipos separados, o mapeamento é explícito e vive no adapter |
| M3 | A entidade não importa nem executa framework. Tags de mapeamento são permitidas |
| M3a | Proibido no domínio: import de ORM/HTTP/SDK, hooks de framework, handle de conexão como campo, IO em método de entidade |
| M3b | A API não é a tabela por omissão — campo que não sai na resposta é marcado explicitamente |
| M3c | A entidade tem construtor e comportamento; struct com tags não autoriza saco de campos sem invariante |
| M4 | Erros de domínio são tipos de domínio; traduza HTTP e SQL na borda |

Métodos declarativos de configuração de ORM são tolerados: são declaração, não
execução. Hooks de ciclo de vida não são, porque rodam lógica dentro do domínio.

### Testes e Pragmatismo (T1-T4, Y1-Y2)

| Regra | Princípio |
| --- | --- |
| T1 | Use case roda sem banco, HTTP ou framework |
| T2 | Substitua pelo port, não pelo mock do framework |
| T3 | O import-check roda no CI como teste de arquitetura |
| T4 | Testes de borda são poucos e de integração |
| Y1 | Uniformidade acima de atalhos: todo caso de uso, inclusive CRUD trivial, atravessa as quatro camadas |
| Y2 | Em código legado sem CA, não reescreva tudo — mova para a camada certa o que você tocou |

## Verificação executável

A Dependency Rule é a única parte do Clean Architecture que dá para checar de
forma determinística — e é justamente a parte que mais quebra. Cada track traz um
`import-check` sem dependência externa:

```bash
# Track Go
./skills/go/go-clean-architecture/scripts/import-check.sh .

# Track TypeScript
node ./skills/typescript/ts-clean-architecture/scripts/import-check.mjs .
```

| Código | Condição |
| --- | --- |
| D1 | Módulo importa outro módulo interno de camada mais externa |
| D2 | `domain` ou `usecase` importa pacote externo, ou stdlib fora da allowlist |
| L6 | `adapter` importa `infra`, ou `adapter` importa outro `adapter` |

Saída, uma violação por linha, com exit code diferente de zero quando há alguma:

```
D2  internal/domain/order.go:4  domain importa pacote externo gorm.io/gorm
D1  internal/domain/order.go:5  domain importa camada mais externa usecase
L6  internal/http/order_handler.go:4  adapter importa infra
```

**O que o script não detecta:** P1 (port declarado na camada errada), P4 (lógica
escondida num componente difícil de testar) e M3c (entidade sem invariante).
Esses compilam, passam no verificador e exigem leitura do código — é para eles
que o protocolo de auditoria da skill núcleo existe.

### Configuração

O mapa de camadas é configurável em `.arch.json`, na raiz do projeto analisado:

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

Sem o arquivo, o script usa o layout canônico do track e avisa. No track
TypeScript ele também resolve os aliases de `compilerOptions.paths`.

### No CI (T3)

```yaml
# Go
- run: ./scripts/import-check.sh .

# TypeScript
- run: node ./scripts/import-check.mjs .
```

## Scaffold

A regra Y1 diz que todo caso de uso atravessa as quatro camadas, inclusive um
CRUD trivial. Isso só é sustentável se o boilerplate for gerado em vez de
digitado:

```bash
# Go — gera as quatro camadas de cancel_subscription
./skills/go/go-clean-architecture/scripts/new-usecase.sh cancel_subscription

# TypeScript
node ./skills/typescript/ts-clean-architecture/scripts/new-usecase.mjs cancel-subscription
```

O código gerado compila e passa no `import-check` — o scaffold e o verificador
concordam por construção, então a estrutura inicial nunca nasce errada.

## Update

Refaça a cópia da instalação para pegar a versão mais recente. Se você atualiza
com frequência, use symlinks:

```bash
git clone https://github.com/carlosnayan/clean-architecture-skills.git ~/src/clean-architecture-skills
cd ~/src/clean-architecture-skills/skills
for d in core/*/ go/*/; do ln -sfn "$PWD/${d%/}" "$HOME/.claude/skills/$(basename "$d")"; done
```

Depois, um `git pull` em `~/src/clean-architecture-skills` atualiza todas as
skills de uma vez.

## Uninstall

```bash
rm -rf ~/.claude/skills/{clean-architecture,go-clean-architecture,ts-clean-architecture,ca-backend-http,ca-frontend-react,ca-mobile-rn,ca-cli-worker,arch-boy-scout}
```

## Contributing

PRs são bem-vindos. Algumas ideias:

- [ ] Track para outras linguagens (Python, Rust, Kotlin)
- [ ] Detecção de P1 por análise de declarações, com falso positivo aceitável
- [ ] Skill de contexto para GraphQL e gRPC
- [ ] Exemplos de migração incremental em código legado

Toda skill precisa passar em `./scripts/validate-skills.sh`, e mudanças nos
scripts precisam vir com teste.

## Resources

- [_Clean Architecture_](https://www.amazon.com/Clean-Architecture-Craftsmans-Software-Structure/dp/0134494164) — Robert C. Martin
- [Agent Skills Standard](https://agentskills.io)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)
- [Clean Code Skills](https://github.com/carlosnayan/clean-code-skills) — as regras de código que complementam estas de estrutura

## License

MIT License. Veja [LICENSE](LICENSE).

---

_Arquitetura é o conjunto de decisões que você gostaria de ter acertado no
começo. Um agente que as verifica é melhor que um agente que as recita._
