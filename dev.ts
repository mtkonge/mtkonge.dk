import { serveDir } from "jsr:@std/http/file-server";
import { bundle } from "./bundle.ts";

function listening(addr: Addr) {
    console.log(`Listening on http://${addr.hostname}:${addr.port}/`);
}

type Addr = {
    hostname: string;
    port: number;
};

async function check() {
    const command = new Deno.Command("deno", {
        args: ["check", "src"],
        stdout: "piped",
    });
    const process = command.spawn();
    const output = await process.output();
    await Deno.stdout.write(output.stdout);
}

async function watchAndBundle(addr: Addr) {
    let changeOccurred = true;
    let running = false;
    setInterval(async () => {
        if (!changeOccurred || running) {
            return;
        }
        running = true;
        console.clear();
        await bundle().catch((err) => console.error(err));
        await check();
        listening(addr);
        changeOccurred = false;
        running = false;
    }, 250);
    const watcher = Deno.watchFs(["src", "public"]);
    for await (const _ of watcher) {
        changeOccurred = true;
    }
}

function serveDist(addr: Addr) {
    Deno.serve({
        port: addr.port,
        hostname: addr.hostname,
        onListen: (_) => listening(addr),
    }, (req: Request) => {
        return serveDir(req, {
            fsRoot: "dist",
            urlRoot: "",
            quiet: true,
        });
    });
}

if (import.meta.main) {
    const addr = {
        hostname: "0.0.0.0",
        port: 5173,
    };
    await bundle();
    watchAndBundle(addr);
    serveDist(addr);
}
