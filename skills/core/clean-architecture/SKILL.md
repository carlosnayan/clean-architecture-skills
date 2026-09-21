---
name: clean-architecture
description: Use when designing, reviewing or refactoring the structure of any codebase — deciding which layer a file belongs to, whether a dependency points the right way, or how to isolate business rules from frameworks. Language-agnostic catalog of 24 Clean Architecture rules.
when_to_use: |
  Also trigger on: "onde coloco esse arquivo", "isso é regra de negócio ou de aplicação",
  "como estruturo esse projeto", camada interna importando framework, controller chamando
  repositório direto, entidade com dependência de banco, "isso está acoplado demais",
  revisão de arquitetura, decisão sobre criar uma interface.
---

# Clean Architecture: Complete Reference

**A Dependency Rule é a regra que sustenta todas as outras:** o código-fonte só
depende para dentro. Nada em um círculo interno sabe qualquer coisa sobre um
círculo externo — nem o nome de uma classe, nem uma função, nem uma variável.
O que está mais dentro é mais estável e mais geral; o que está mais fora é
detalhe substituível.

Quando uma camada interna precisa causar um efeito no mundo externo, ela não
chama para fora: ela declara um port e recebe uma implementação. A dependência
continua apontando para dentro mesmo quando o fluxo de controle aponta para fora.

## Dependency Rule (D1-D5)

- **D1:** Dependências apontam para dentro, sempre
- **D2:** O domínio não importa framework, IO, ORM nem SDK
- **D3:** Precisou chamar para fora? Inverta com um port declarado pela camada interna
- **D4:** Dados cruzam limites como tipos da camada interna
- **D5:** Fluxo de controle e direção de dependência são independentes

## Camadas (L1-L6)

- **L1:** Entities — regra de negócio corporativa, zero dependências
- **L2:** Use cases — regra de aplicação, orquestram entities através de ports
- **L3:** Adapters — controllers, presenters, gateways: só traduzem formato
- **L4:** Frameworks e drivers são detalhe substituível na borda
- **L5:** A estrutura de pastas grita o domínio, não o framework
- **L6:** Não pule camadas — controller não fala com repositório

## Ports e Boundaries (P1-P5)

- **P1:** O port pertence a quem o consome, não a quem o implementa
- **P2:** Interfaces pequenas, moldadas pela necessidade (ISP)
- **P3:** Um use case é uma operação, com input e output models explícitos
- **P4:** Humble object — tire a lógica de tudo que é difícil de testar
- **P5:** Injeção de dependência só na composition root

## Modelos e Dados (M1-M4)

- **M1:** Entity, modelo de persistência e DTO são papéis distintos, ainda que coabitem um struct
- **M2:** Quando houver tipos separados, o mapeamento é explícito e vive no adapter
- **M3:** A entidade não importa nem executa framework. Tags de mapeamento são permitidas
- **M3a:** Proibido no domínio — import de ORM/HTTP/SDK, hooks de framework, handle de conexão como campo, IO em método de entidade
- **M3b:** A API não é a tabela por omissão — campo que não sai na resposta é marcado explicitamente
- **M3c:** A entidade tem construtor e comportamento; struct com tags não autoriza saco de campos sem invariante
- **M4:** Erros de domínio são tipos de domínio; traduza HTTP e SQL na borda

Métodos declarativos de configuração de ORM — por exemplo, o que informa o nome
da tabela — são tolerados e documentados como exceção: são declaração, não
execução. Hooks de ciclo de vida do ORM não são, porque rodam lógica dentro do
domínio e amarram a entidade ao momento em que o framework decide chamá-la.

## Testes e Pragmatismo (T1-T4, Y1-Y2)

- **T1:** Use case roda sem banco, HTTP ou framework
- **T2:** Substitua pelo port, não pelo mock do framework
- **T3:** O import-check roda no CI como teste de arquitetura
- **T4:** Testes de borda são poucos e de integração
- **Y1:** Uniformidade acima de atalhos — todo caso de uso, inclusive CRUD trivial, atravessa as quatro camadas
- **Y2:** Em código legado sem CA, não reescreva tudo — mova para a camada certa o que você tocou

## Protocolo de auditoria

Ao revisar a arquitetura de um projeto, siga esta ordem. Não opine antes do
passo 1: sem o mapa, toda observação vira palpite.

1. **Mapeie cada diretório para uma camada** e declare o mapa em voz alta antes
   de qualquer julgamento. Use `.arch.json` se existir; caso contrário, derive do
   layout e confirme com quem conhece o projeto.
2. **Liste toda dependência que cruza limite de camada.** Imports são a evidência
   primária: eles não mentem sobre acoplamento, ao contrário de nomes de pasta.
3. **Classifique cada cruzamento por número de regra.** Um cruzamento para dentro
   é legítimo; para fora é violação. Nomeie a regra, não a sensação.
4. **Para cada violação, diga o destino correto do código**, não apenas o
   problema. "Isso está acoplado" não é revisão; "esse mapeamento pertence ao
   repositório em infra" é.

P1, P4 e M3c não são detectáveis por import e exigem leitura do código: um port
declarado no lugar errado, lógica escondida num componente difícil de testar e
uma entidade sem invariante compilam e passam em qualquer verificador estrutural.

## Tabela de referência rápida

| Regra | Resumo |
|---|---|
| D1 | Dependências apontam para dentro |
| D2 | Domínio sem framework, IO, ORM ou SDK |
| D3 | Chamada para fora vira port invertido |
| L1 | Entities sem dependência alguma |
| L2 | Use cases orquestram; não conhecem protocolo |
| L5 | A pasta grita o domínio, não o framework |
| L6 | Controller não fala com repositório |
| P1 | O port pertence a quem consome |
| P3 | Um use case, uma operação, input e output próprios |
| P5 | Injeção só na composition root |
| M3 | Entidade não importa nem executa framework |
| M4 | Erro de infra é traduzido na borda |
| T1 | Use case testável sem banco nem HTTP |
| Y1 | CRUD também atravessa as quatro camadas |

## Anti-Patterns (Don't → Do)

| ❌ Don't | ✅ Do |
|---|---|
| Entidade importa o ORM | Repositório na infra implementa um port do domínio |
| Controller chama o repositório | Controller chama o use case |
| Interface declarada junto da implementação | Port declarado por quem consome |
| Use case recebe o objeto de request HTTP | Use case recebe um input model próprio |
| Erro do banco sobe até o handler | Erro traduzido para erro de domínio na borda |
| CRUD sem use case porque é simples | CRUD atravessa as quatro camadas como qualquer operação |
| Pasta `services/` com tudo dentro | Pastas com o nome das capacidades do domínio |
| Use case devolve código de status | Use case devolve resultado ou erro de domínio |
| Port com quinze métodos porque o repositório tem quinze | Port com os métodos que este use case usa |
| Regra de negócio validada só no banco | Regra no construtor ou no use case, banco como rede de segurança |

## AI Behavior

Ao revisar arquitetura, identifique cada violação pelo número da regra — por
exemplo, "violação D2: o pacote de domínio importa o driver do banco". Declare o
mapa de camadas antes de apontar qualquer coisa.

Ao corrigir, relate o que moveu e para onde — por exemplo, "movido: mapeamento de
linha para entidade saiu do use case e foi para o repositório na infra (M2)".

Quando a escolha entre camadas for genuinamente ambígua, diga qual ambiguidade
existe e decida, em vez de devolver a pergunta sem uma recomendação.
