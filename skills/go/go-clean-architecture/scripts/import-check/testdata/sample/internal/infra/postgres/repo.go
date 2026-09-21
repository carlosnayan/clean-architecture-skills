package postgres

import "example.com/sample/internal/domain"

type Repo struct{}

func (Repo) Get() domain.Order { return domain.Order{} }
