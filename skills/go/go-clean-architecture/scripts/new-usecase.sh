#!/usr/bin/env bash
# Gera as quatro camadas de um caso de uso. Uso: ./new-usecase.sh place_order
set -euo pipefail

if [ $# -ne 1 ]; then
	echo "uso: $0 <nome_do_caso_de_uso>   (exemplo: place_order)" >&2
	exit 2
fi

name="$1"
camel="$(echo "$name" | awk -F_ '{for(i=1;i<=NF;i++) printf toupper(substr($i,1,1)) substr($i,2)}')"

if [ ! -f go.mod ]; then
	echo "go.mod não encontrado no diretório atual" >&2
	exit 2
fi

module="$(sed -n 's/^module[[:space:]]*//p' go.mod | head -n 1)"

files=(
	"internal/domain/${name}.go"
	"internal/usecase/${name}.go"
	"internal/http/${name}_handler.go"
	"internal/infra/postgres/${name}_repository.go"
)

for f in "${files[@]}"; do
	if [ -e "$f" ]; then
		echo "$f já existe; nada foi gerado" >&2
		exit 1
	fi
done

mkdir -p internal/domain internal/usecase internal/http internal/infra/postgres

cat > "internal/domain/${name}.go" <<GO
package domain

// ${camel}Result é o resultado de negócio de ${camel}.
type ${camel}Result struct {
}
GO

cat > "internal/usecase/${name}.go" <<GO
package usecase

import "${module}/internal/domain"

// ${camel}Input reúne os dados de entrada do caso de uso.
type ${camel}Input struct {
}

// ${camel}Repository é o port que este caso de uso consome (P1).
type ${camel}Repository interface {
}

// ${camel} executa a regra de aplicação.
type ${camel} struct {
	repo ${camel}Repository
}

func New${camel}(repo ${camel}Repository) ${camel} {
	return ${camel}{repo: repo}
}

func (u ${camel}) Execute(input ${camel}Input) (domain.${camel}Result, error) {
	return domain.${camel}Result{}, nil
}
GO

cat > "internal/http/${name}_handler.go" <<GO
package http

import (
	"net/http"

	"${module}/internal/usecase"
)

// ${camel}Handler traduz HTTP para o caso de uso e de volta (L3).
type ${camel}Handler struct {
	useCase usecase.${camel}
}

func New${camel}Handler(useCase usecase.${camel}) ${camel}Handler {
	return ${camel}Handler{useCase: useCase}
}

func (h ${camel}Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
}
GO

cat > "internal/infra/postgres/${name}_repository.go" <<GO
package postgres

import "${module}/internal/usecase"

// ${camel}Repository implementa o port declarado pelo caso de uso.
type ${camel}Repository struct {
}

var _ usecase.${camel}Repository = ${camel}Repository{}
GO

printf '%s\n' "${files[@]}"
