import { serveDir } from "jsr:@std/http/file-server";
import { bundle } from "./bundle.ts";

async function watchAndBundle() {
    const watcher = Deno.watchFs(["src", "public"]);
    for await (const _ of watcher) {
        await bundle().catch((err) => console.error(err));
    }
}

function serveDist() {
    Deno.serve({ port: 5173 }, (req: Request) => {
        return serveDir(req, {
            fsRoot: "dist",
            urlRoot: "",
        });
    });
}

if (import.meta.main) {
    await bundle();
    watchAndBundle();
    serveDist();
}
