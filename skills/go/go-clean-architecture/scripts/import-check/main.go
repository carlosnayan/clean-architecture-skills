// Command import-check valida a Dependency Rule de um projeto Go lendo os
// imports de cada arquivo e comparando as camadas de origem e destino.
package main

import (
	"encoding/json"
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type config struct {
	Layers        map[string][]string `json:"layers"`
	AllowInDomain []string            `json:"allow_in_domain"`
}

var defaultConfig = config{
	Layers: map[string][]string{
		"domain":  {"internal/domain", "internal/entities"},
		"usecase": {"internal/usecase", "internal/app"},
		"adapter": {"internal/http", "internal/grpc", "internal/cli"},
		"infra":   {"internal/infra", "internal/repository"},
		"root":    {"cmd"},
	},
	AllowInDomain: []string{"time", "errors", "fmt", "strings", "strconv", "sort", "context"},
}

var rank = map[string]int{"domain": 0, "usecase": 1, "adapter": 2, "infra": 3, "root": 4}

type violation struct {
	Rule    string
	File    string
	Line    int
	Message string
}

func (v violation) String() string {
	return fmt.Sprintf("%s  %s:%d  %s", v.Rule, v.File, v.Line, v.Message)
}

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}

	violations, err := check(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "erro:", err)
		os.Exit(2)
	}

	for _, v := range violations {
		fmt.Println(v)
	}

	if len(violations) > 0 {
		fmt.Fprintf(os.Stderr, "\n%d violação(ões) da Dependency Rule\n", len(violations))
		os.Exit(1)
	}
	fmt.Fprintln(os.Stderr, "ok: nenhuma violação da Dependency Rule")
}

func check(root string) ([]violation, error) {
	cfg, err := loadConfig(root)
	if err != nil {
		return nil, err
	}

	modulePath, err := readModulePath(root)
	if err != nil {
		return nil, err
	}

	allowed := make(map[string]bool, len(cfg.AllowInDomain))
	for _, pkg := range cfg.AllowInDomain {
		allowed[pkg] = true
	}

	var violations []violation

	err = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			if info.Name() == "vendor" || info.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)

		fileLayer := layerOf(rel, cfg)
		if fileLayer == "" {
			return nil
		}

		fset := token.NewFileSet()
		parsed, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			return fmt.Errorf("%s: %w", rel, err)
		}

		for _, spec := range parsed.Imports {
			importPath := strings.Trim(spec.Path.Value, `"`)
			line := fset.Position(spec.Pos()).Line
			if v, ok := classify(fileLayer, importPath, modulePath, cfg, allowed); ok {
				v.File, v.Line = rel, line
				violations = append(violations, v)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(violations, func(i, j int) bool {
		if violations[i].File != violations[j].File {
			return violations[i].File < violations[j].File
		}
		return violations[i].Line < violations[j].Line
	})
	return violations, nil
}

// classify decide se um import viola a matriz de camadas.
func classify(fileLayer, importPath, modulePath string, cfg config, allowed map[string]bool) (violation, bool) {
	if internal, isInternal := strings.CutPrefix(importPath, modulePath+"/"); isInternal {
		targetLayer := layerOf(internal, cfg)
		if targetLayer == "" || targetLayer == fileLayer {
			return violation{}, false
		}
		if fileLayer == "adapter" && targetLayer == "infra" {
			return violation{Rule: "L6", Message: "adapter importa infra"}, true
		}
		if rank[targetLayer] > rank[fileLayer] {
			return violation{Rule: "D1", Message: fmt.Sprintf("%s importa camada mais externa %s", fileLayer, targetLayer)}, true
		}
		return violation{}, false
	}

	if fileLayer != "domain" && fileLayer != "usecase" {
		return violation{}, false
	}

	if isStdlib(importPath) && allowed[importPath] {
		return violation{}, false
	}

	return violation{Rule: "D2", Message: fmt.Sprintf("%s importa pacote externo %s", fileLayer, importPath)}, true
}

// isStdlib assume a convenção de que todo pacote externo tem um domínio no
// primeiro segmento do caminho.
func isStdlib(importPath string) bool {
	first, _, _ := strings.Cut(importPath, "/")
	return !strings.Contains(first, ".")
}

// layerOf devolve a camada do caminho, preferindo o prefixo configurado mais longo.
func layerOf(relPath string, cfg config) string {
	best, bestLen := "", -1
	for layer, prefixes := range cfg.Layers {
		for _, prefix := range prefixes {
			prefix = strings.Trim(prefix, "/")
			if relPath == prefix || strings.HasPrefix(relPath, prefix+"/") {
				if len(prefix) > bestLen {
					best, bestLen = layer, len(prefix)
				}
			}
		}
	}
	return best
}

func loadConfig(root string) (config, error) {
	data, err := os.ReadFile(filepath.Join(root, ".arch.json"))
	if os.IsNotExist(err) {
		fmt.Fprintln(os.Stderr, "aviso: .arch.json não encontrado, usando layout padrão")
		return defaultConfig, nil
	}
	if err != nil {
		return config{}, err
	}

	var cfg config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return config{}, fmt.Errorf(".arch.json inválido: %w", err)
	}
	for layer := range cfg.Layers {
		if _, ok := rank[layer]; !ok {
			return config{}, fmt.Errorf(".arch.json: camada desconhecida %q (use domain, usecase, adapter, infra ou root)", layer)
		}
	}
	if len(cfg.Layers) == 0 {
		cfg.Layers = defaultConfig.Layers
	}
	if len(cfg.AllowInDomain) == 0 {
		cfg.AllowInDomain = defaultConfig.AllowInDomain
	}
	return cfg, nil
}

func readModulePath(root string) (string, error) {
	data, err := os.ReadFile(filepath.Join(root, "go.mod"))
	if err != nil {
		return "", fmt.Errorf("lendo go.mod: %w", err)
	}
	for _, line := range strings.Split(string(data), "\n") {
		if module, ok := strings.CutPrefix(line, "module "); ok {
			return strings.TrimSpace(module), nil
		}
	}
	return "", fmt.Errorf("go.mod sem diretiva module")
}
