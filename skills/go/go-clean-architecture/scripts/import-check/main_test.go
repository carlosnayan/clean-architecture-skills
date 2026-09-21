package main

import (
	"strings"
	"testing"
)

func TestCheckSampleProject(t *testing.T) {
	violations, err := check("testdata/sample")
	if err != nil {
		t.Fatalf("check: %v", err)
	}

	got := make([]string, 0, len(violations))
	for _, v := range violations {
		got = append(got, v.String())
	}
	joined := strings.Join(got, "\n")

	want := []string{
		"D2  internal/domain/order.go:4  domain importa pacote externo gorm.io/gorm",
		"D1  internal/domain/order.go:5  domain importa camada mais externa usecase",
		"D2  internal/usecase/place_order.go:4  usecase importa pacote externo net/http",
		"L6  internal/http/order_handler.go:4  adapter importa infra",
	}
	for _, w := range want {
		if !strings.Contains(joined, w) {
			t.Errorf("faltou a violação:\n%s\nsaída:\n%s", w, joined)
		}
	}

	if len(violations) != len(want) {
		t.Errorf("esperava %d violações, veio %d:\n%s", len(want), len(violations), joined)
	}
}

func TestStdlibAllowlistIsRespected(t *testing.T) {
	violations, err := check("testdata/sample")
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	for _, v := range violations {
		if strings.Contains(v.Message, " time") {
			t.Errorf("time está na allowlist e não deveria violar: %s", v)
		}
	}
}
