import { fetchFile, initialChildren, InitialRootDir } from "./file_system.ts";

export async function root(username: string): Promise<InitialRootDir> {
    const motd = "motd.txt";
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
                            [motd]: {
                                tag: "file",
                                name: motd,
                                content: await fetchFile(motd),
                            },
                        }),
                    },
                }),
            },
        }),
    };

    return root;
}
