#!/bin/sh

set -eu

ROOT_PATH="${CONDUCTOR_ROOT_PATH:?CONDUCTOR_ROOT_PATH is required}"

copy_file() {
  src="$1"
  dest="$2"

  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

vp install
mkdir -p dist
copy_file "$ROOT_PATH/.env" ".env"
