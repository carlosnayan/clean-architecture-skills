package http

import (
	"example.com/sample/internal/infra/postgres"
	"example.com/sample/internal/usecase"
)

func Handle() {
	_ = postgres.Repo{}
	_ = usecase.Marker{}
}
