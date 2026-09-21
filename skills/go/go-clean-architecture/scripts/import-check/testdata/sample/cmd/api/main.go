package main

import (
	"example.com/sample/internal/http"
	"example.com/sample/internal/infra/postgres"
)

func main() {
	_ = postgres.Repo{}
	http.Handle()
}
