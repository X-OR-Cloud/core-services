#!/usr/bin/env bash
# scaffold.sh — Create a new CBM module from templates
#
# Usage:
#   ./scaffold.sh <module-name> [route-name]
#
# Examples:
#   ./scaffold.sh contract           → class: Contract, route: contracts
#   ./scaffold.sh budget-item        → class: BudgetItem, route: budget-items
#   ./scaffold.sh purchase-order po  → class: PurchaseOrder, route: po
#
# What it does:
#   1. Copies 5 template files from skill assets/templates/
#   2. Replaces MODULE_NAME, MODULE_CLASS, MODULE_ROUTE placeholders
#   3. Creates the module directory at services/cbm/src/modules/<name>/
#   4. Prints reminder to register in app.module.ts

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATES_DIR="$SKILL_DIR/assets/templates"

# ── Arguments ──────────────────────────────────────────────────────────────
MODULE_NAME="${1:-}"
ROUTE_NAME="${2:-}"

if [[ -z "$MODULE_NAME" ]]; then
  echo "Usage: $0 <module-name> [route-name]"
  echo "Example: $0 contract"
  echo "Example: $0 budget-item"
  exit 1
fi

# ── Derive names ────────────────────────────────────────────────────────────
# kebab-case → PascalCase: budget-item → BudgetItem
to_pascal() {
  echo "$1" | sed 's/-\([a-z]\)/\U\1/g;s/^\([a-z]\)/\U\1/'
}

# kebab-case → camelCase: budget-item → budgetItem
to_camel() {
  echo "$1" | sed 's/-\([a-z]\)/\U\1/g'
}

# plural for route: budget-item → budget-items
pluralize() {
  local word="$1"
  # Basic pluralization — append 's' (adjust manually for irregular nouns)
  if [[ "$word" == *-item ]]; then
    echo "${word}s"
  elif [[ "$word" == *y ]]; then
    echo "${word%y}ies"
  else
    echo "${word}s"
  fi
}

MODULE_CLASS=$(to_pascal "$MODULE_NAME")
MODULE_CAMEL=$(to_camel "$MODULE_NAME")

if [[ -z "$ROUTE_NAME" ]]; then
  ROUTE_NAME=$(pluralize "$MODULE_NAME")
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CBM Module Scaffold"
echo "  module-name:  $MODULE_NAME"
echo "  class:        $MODULE_CLASS"
echo "  camel:        $MODULE_CAMEL"
echo "  route:        $ROUTE_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Locate CBM service root ─────────────────────────────────────────────────
# Try common paths
CBM_ROOT=""
for candidate in \
  "/usr/agents/mehr/workspace/code/services/cbm" \
  "$(git rev-parse --show-toplevel 2>/dev/null)/services/cbm"; do
  if [[ -d "$candidate" ]]; then
    CBM_ROOT="$candidate"
    break
  fi
done

if [[ -z "$CBM_ROOT" ]]; then
  echo "ERROR: Could not find services/cbm. Run from within the repo or set CBM_ROOT."
  exit 1
fi

TARGET_DIR="$CBM_ROOT/src/modules/$MODULE_NAME"

if [[ -d "$TARGET_DIR" ]]; then
  echo "ERROR: Directory already exists: $TARGET_DIR"
  exit 1
fi

mkdir -p "$TARGET_DIR"
echo "Created: $TARGET_DIR"

# ── Copy and replace templates ──────────────────────────────────────────────
for template in "$TEMPLATES_DIR"/MODULE_NAME.*.ts; do
  # Derive target filename
  filename=$(basename "$template" | sed "s/MODULE_NAME/$MODULE_NAME/")
  target="$TARGET_DIR/$filename"

  # Copy and replace placeholders
  sed \
    -e "s/MODULE_CLASS/$MODULE_CLASS/g" \
    -e "s/MODULE_NAME/$MODULE_CAMEL/g" \
    -e "s/MODULE_ROUTE/$ROUTE_NAME/g" \
    "$template" > "$target"

  echo "  Created: $filename"
done

# ── Print next steps ─────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Files created in $TARGET_DIR"
echo ""
echo "  NEXT STEPS:"
echo ""
echo "  1. Edit $MODULE_NAME.schema.ts — add your fields"
echo "  2. Edit $MODULE_NAME.dto.ts — add Create/Update DTO fields"
echo "  3. Edit $MODULE_NAME.service.ts — customize business logic"
echo "  4. Edit $MODULE_NAME.controller.ts — uncomment state machine endpoints if needed"
echo ""
echo "  5. Register in app.module.ts:"
echo "     import { ${MODULE_CLASS}Module } from '../modules/$MODULE_NAME/$MODULE_NAME.module';"
echo "     // Add ${MODULE_CLASS}Module to @Module imports[]"
echo ""
echo "  6. Verify:"
echo "     npx tsc --noEmit -p services/cbm/tsconfig.app.json"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
