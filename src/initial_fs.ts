import {
    Dir,
    dirChildren,
    fetchFile,
    fileChildren,
    linkDirTreeOrphans,
} from "./file_system.ts";

export async function root(username: string): Promise<Dir> {
    const motd = "motd.txt";
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
                            [motd]: await fetchFile(motd),
                        }),
                    },
                }),
            },
        }),
    };

    linkDirTreeOrphans(root, null);

    return root;
}
