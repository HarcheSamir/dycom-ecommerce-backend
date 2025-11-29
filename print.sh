#!/bin/bash

# Step 1: Show project structure
echo "===== PROJECT STRUCTURE ====="
tree -I "node_modules"

# Step 2: Print all relevant files (exclude CSVs)
echo -e "\n===== FILE CONTENTS ====="
find . -type f \
  ! -path "./node_modules/*" \
  ! -path "./.git/*" \
  ! -path "./prisma/migrations/*" \
  ! -path "./data/*.csv" \
  ! -name "package-lock.json" \
  ! -name "print.sh" \
  -exec sh -c '
    for f; do
      echo -e "\033[1;34m\n===== FILE: $f =====\033[0m"
      cat "$f"
    done
  ' _ {} +
