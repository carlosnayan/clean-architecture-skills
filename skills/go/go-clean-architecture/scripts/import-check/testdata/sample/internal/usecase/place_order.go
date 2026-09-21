package usecase

import (
	"net/http"

	"example.com/sample/internal/domain"
)

type Marker struct{}

func Place(o domain.Order, r *http.Request) error { return nil }
