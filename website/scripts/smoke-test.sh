#!/usr/bin/env bash
# Smoke test: build the website and verify all expected routes exist
# in the Next.js routes manifest.
#
# Usage: pnpm --filter anatomia-website smoke
set -e

echo "Building website..."
pnpm build 2>&1

MANIFEST=".next/routes-manifest.json"
if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found after build"
  exit 1
fi

echo "Checking routes in $MANIFEST..."

ROUTES=(
  "/"
  "/docs"
  "/manifesto"
  "/contact"
  "/changelog"
  "/cli"
  "/examples"
  "/about"
  "/license"
)

FAILED=0
for route in "${ROUTES[@]}"; do
  if grep -q "\"page\": *\"$route\"" "$MANIFEST"; then
    echo "  ✓ $route"
  else
    echo "  ✗ $route MISSING"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo "Some routes are missing!"
  exit 1
fi

echo "All ${#ROUTES[@]} routes found."
