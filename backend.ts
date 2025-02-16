import { mime } from "https://deno.land/x/mimetypes@v1.0.0/mod.ts";
import { serveDir } from "jsr:@std/http/file-server";
import * as path from "jsr:@std/path";

export function listening(addr: Addr) {
    console.log(`Listening on http://${addr.hostname}:${addr.port}/`);
}

export type Addr = {
    hostname: string;
    port: number;
};

async function responseFromFile(
    data: File,
): Promise<Response> {
    const ext = path.extname(data.name).substring(".".length);
    const filetype = mime.getType(ext) ?? "application/octet-stream";
    const headers = new Headers({
        "Content-Type": filetype,
        "Content-Disposition": `inline; filename="${data.name}"`,
    });
    return await data.bytes().then((data) => new Response(data, { headers }));
}

async function serveXdgOpenRequest(req: Request): Promise<Response> {
    const body = await req.formData();
    const data = body.get("data");
    if (data === null) {
        return new Response("invalid body: missing data");
    }
    if (!(data instanceof File)) {
        return new Response("invalid body: data should be a file");
    }
    return await responseFromFile(data);
}

async function serveWgetRequest(req: Request): Promise<Response> {
    const reqUrl = new URL(req.url);
    const params = reqUrl.searchParams;
    const target = new URL(params.get("url") ?? "");
    return await fetch(target);
}

export function serveBinAndDist(addr: Addr) {
    Deno.serve({
        port: addr.port,
        hostname: addr.hostname,
        onListen: (_) => listening(addr),
    }, async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname.startsWith("/bin/xdg-open")) {
            return await serveXdgOpenRequest(req);
        }
        if (url.pathname.startsWith("/bin/wget")) {
            return await serveWgetRequest(req);
        }
        return serveDir(req, {
            fsRoot: "dist",
            urlRoot: "",
            quiet: true,
        });
    });
}

if (import.meta.main) {
    serveBinAndDist({ port: 5812, hostname: "0.0.0.0" });
}
