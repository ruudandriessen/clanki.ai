import { startLocalRunnerServer } from "./local-runner-server";

const options = parseArgs(process.argv.slice(2));
const server = await startLocalRunnerServer(options);
const address = server.address();

if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local runner server address");
}

console.log(`Local runner listening on http://${address.address}:${address.port}`);

function parseArgs(args: string[]): { host?: string; port?: number } {
    const options: { host?: string; port?: number } = {};

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        const value = args[index + 1];

        if (arg === "--host" && value) {
            options.host = value;
            index += 1;
            continue;
        }

        if (arg === "--port" && value) {
            const port = Number(value);
            if (!Number.isInteger(port) || port <= 0) {
                throw new Error(`Invalid port: ${value}`);
            }

            options.port = port;
            index += 1;
            continue;
        }
    }

    return options;
}
