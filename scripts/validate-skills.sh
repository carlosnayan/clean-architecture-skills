#!/usr/bin/env bash
# Valida o frontmatter de todo SKILL.md do repositório.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=0

skills=$(find "$root/skills" -name SKILL.md 2>/dev/null | sort)

if [ -z "$skills" ]; then
	echo "nenhum SKILL.md encontrado em $root/skills"
	exit 1
fi

for skill in $skills; do
	rel="${skill#"$root"/}"
	dir_name="$(basename "$(dirname "$skill")")"

	if [ "$(head -n 1 "$skill")" != "---" ]; then
		echo "$rel: não começa com frontmatter"
		failures=$((failures + 1))
		continue
	fi

	front="$(sed -n '2,/^---$/p' "$skill")"

	for field in name description when_to_use; do
		if ! printf '%s\n' "$front" | grep -q "^$field:"; then
			echo "$rel: frontmatter sem '$field'"
			failures=$((failures + 1))
		fi
	done

	declared="$(printf '%s\n' "$front" | sed -n 's/^name:[[:space:]]*//p' | head -n 1)"
	if [ "$declared" != "$dir_name" ]; then
		echo "$rel: name '$declared' difere do diretório '$dir_name'"
		failures=$((failures + 1))
	fi
done

if [ "$failures" -ne 0 ]; then
	echo "$failures problema(s) encontrado(s)"
	exit 1
fi

echo "ok: $(printf '%s\n' "$skills" | wc -l | tr -d ' ') skill(s) válida(s)"
