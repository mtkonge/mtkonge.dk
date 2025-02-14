import * as esbuild from "npm:esbuild@0.20.2";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11.0";

async function bundleTs() {
    await esbuild.build({
        plugins: [...denoPlugins()],
        entryPoints: ["./src/main.ts"],
        outfile: "./dist/bundle.js",
        bundle: true,
        format: "esm",
    });

    esbuild.stop();
}

async function copyPublic(path: string[] = []) {
    const dir = path.join("/");
    await Deno.mkdir("dist/" + dir).catch((_) => _);
    for await (const file of Deno.readDir(`public/${dir}`)) {
        if (file.isDirectory) {
            await copyPublic([...path, file.name]);
            continue;
        }
        await Deno.copyFile(
            `public/${dir}/${file.name}`,
            `dist/${dir}/${file.name}`,
        );
    }
}

export async function bundle() {
    await copyPublic();
    await bundleTs();
}

if (import.meta.main) {
    await bundle();
    console.log("success: output in 'dist/'");
}
