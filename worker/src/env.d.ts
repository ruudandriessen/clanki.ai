declare namespace Cloudflare {
  interface Env {
    ELECTRIC_SECRET: string;
    ELECTRIC_SOURCE_ID: string;
    DURABLE_STREAMS_SERVICE_ID?: string;
    DURABLE_STREAMS_SECRET?: string;
  }
}
