FROM docker.io/cloudflare/sandbox:0.7.2-opencode

WORKDIR /home/user

# Required for wrangler dev (port 3000 is reserved by the internal Bun server)
EXPOSE 4096
