package domain

import (
	"gorm.io/gorm"
	"example.com/sample/internal/usecase"
	"time"
)

type Order struct {
	ID        string
	CreatedAt time.Time
	db        *gorm.DB
	_         usecase.Marker
}
