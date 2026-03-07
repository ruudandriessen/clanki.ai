#!/bin/sh

set -eu

ROOT_PATH="${CONDUCTOR_ROOT_PATH:?CONDUCTOR_ROOT_PATH is required}"

copy_dir() {
  src="$1"
  dest="$2"

  if [ ! -d "$src" ]; then
    return
  fi

  mkdir -p "$(dirname "$dest")" "$dest"
  rsync -a --delete "$src"/ "$dest"/
}

copy_file() {
  src="$1"
  dest="$2"

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

bun install
mkdir -p dist
copy_file "$ROOT_PATH/.env" ".env"

if [ ! -d "$ROOT_PATH/electron" ]; then
  exit 0
fi

if [ "$(git -C "$ROOT_PATH" branch --show-current)" != "main" ]; then
  echo "Expected CONDUCTOR_ROOT_PATH to point at a main checkout: $ROOT_PATH" >&2
  exit 1
fi

copy_dir "$ROOT_PATH/.output" ".output"
