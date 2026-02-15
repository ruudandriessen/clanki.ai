FROM docker.io/cloudflare/sandbox:0.7.2-opencode

USER root

RUN if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends gh && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache gh; \
    else \
      echo "No supported package manager found for installing gh." >&2; \
      exit 1; \
    fi

USER user

WORKDIR /home/user

# Required for wrangler dev (port 3000 is reserved by the internal Bun server)
EXPOSE 4096
