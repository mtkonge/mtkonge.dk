import { mime } from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import { serveDir } from "jsr:@std/http/file-server";
import * as path from "jsr:@std/path";

function base64ToBytes(base64: string): Uint8Array {
    return new Uint8Array(atob(base64).split("").map((c) => c.charCodeAt(0)));
}

function responseFromFileAndData(
    filename: string,
    data: string,
): Response {
    const ext = path.extname(filename).substring(".".length);
    const filetype = mime.getType(ext) ?? "application/octet-stream";
    const body = base64ToBytes(data);
    return new Response(body, {
        headers: new Headers({ "Content-Type": filetype }),
    });
}

export function serveXdgOpenRequest(req: Request): Response {
    const url = new URL(req.url);
    const params = url.searchParams;
    const filename = params.get("filename");
    const data = params.get("data");
    if (filename === null || data === null) {
        return new Response("invalid body: missing filename or data");
    }
    return responseFromFileAndData(filename, data);
}

export async function serveWgetRequest(req: Request): Promise<Response> {
    const reqUrl = new URL(req.url);
    const params = reqUrl.searchParams;
    const target = new URL(params.get("url") ?? "");
    return await fetch(target);
}

function main() {
    Deno.serve({ port: 5823 }, (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/bin/xdg-open")) {
            return serveXdgOpenRequest(req);
        }
        if (url.pathname.startsWith("/bin/wget")) {
            return serveWgetRequest(req);
        }
        return serveDir(req, {
            fsRoot: "dist",
            urlRoot: "",
            quiet: true,
        });
    });
}

if (import.meta.main) {
    main();
}
