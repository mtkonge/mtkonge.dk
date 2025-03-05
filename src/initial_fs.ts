import {
    fetchFile,
    initialChildren,
    InitialFile,
    InitialRootDir,
} from "./file_system.ts";

async function file(name: string): Promise<InitialFile> {
    return {
        tag: "file",
        name,
        content: await fetchFile(name),
    };
}

export async function root(username: string): Promise<InitialRootDir> {
    const motd = "motd.txt";
    const webring = "webring.txt";
    const root: InitialRootDir = {
        tag: "root_dir",
        children: initialChildren({
            "home": {
                tag: "dir",
                name: "home",
                children: initialChildren({
                    [username]: {
                        tag: "dir",
                        name: username,
                        children: initialChildren({
                            [motd]: await file(motd),
                            [webring]: await file(webring),
                        }),
                    },
                }),
            },
        }),
    };

    return root;
}
