import { Dir, dirChildren, linkDirTreeOrphans, fileChildren } from "./file_system.ts";

async function loadTextFile(path: string): Promise<string> {
    const response = await fetch(path);
    return await response.text();
}

export async function root(username: string): Promise<Dir> {
    const root: Dir = {
        tag: "dir",
        name: "/",
        parent: null,
        children: dirChildren({
            "home": {
                tag: "dir",
                name: "home",
                parent: null,
                children: dirChildren({
                    [username]: {
                        tag: "dir",
                        name: username,
                        parent: null,
                        children: fileChildren({
                            "welcome.txt": await loadTextFile("welcome.txt"),
                        }),
                    },
                }),
            },
        }),
    };
    
    linkDirTreeOrphans(root, null);

    return root;
}

