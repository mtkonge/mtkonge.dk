import { bytesToBase64 } from "./bytes.ts";
import { Err, Ok, Result } from "./results.ts";

export type FileContent =
    | { tag: "dynamic"; data: Uint8Array }
    | { tag: "static"; data: Uint8Array; url: string };

export type File = {
    tag: "file";
    name: string;
    content: FileContent;
};

export type Dir = {
    tag: "dir";
    name: string;
    parent: Dir | null;
    children: Map<string, Dir | File>;
};

export function dirChildren(
    children: { [key: string]: Dir },
): Map<string, Dir> {
    const map = new Map();

    for (const key in children) {
        map.set(key, children[key]);
    }

    return map;
}

export type FileChild = {
    content: string;
    xdgResource: string | null;
};

export async function fetchFile(
    path: string,
): Promise<FileContent & { tag: "static" }> {
    const response = await fetch(path);
    return {
        tag: "static",
        url: path,
        data: await response.bytes(),
    };
}

export function fileChildren(
    children: { [filename: string]: FileContent },
): Map<string, File> {
    const map = new Map<string, File>();

    for (const name in children) {
        map.set(name, {
            tag: "file",
            name,
            content: children[name],
        });
    }

    return map;
}

export function linkDirTreeOrphans(node: Dir, parent: Dir | null) {
    node.parent = parent;
    const dirChildren = node.children.values().filter((v) => v.tag === "dir");
    for (const child of dirChildren) {
        linkDirTreeOrphans(child, node);
    }
}

function fullDirPathString(node: Dir): string {
    if (!node.parent) {
        return "";
    }
    return `${fullDirPathString(node.parent)}/${node.name}`;
}

type ParentFromPath =
    | { tag: "root"; root: Dir }
    | { tag: "file"; filename: string; parent: Dir };

export class Session {
    private cwdDir: Dir;

    constructor(
        private root: Dir,
        private username: string,
    ) {
        this.cwdDir = root;
    }

    public cd(path?: string): Result<undefined, string> {
        if (path === undefined) {
            this.cwdDir = this.userDir();
            return Ok(undefined);
        }

        if (path === "") {
            return Ok(undefined);
        }

        if (path === "/") {
            this.cwdDir = this.root;
            return Ok(undefined);
        }

        const res = this.getChildFromPath(path);
        if (!res.ok) {
            return Err(`${path}: No such file or directory`);
        }

        if (res.value.tag === "file") {
            return Err(`${path}: Not a directory`);
        }

        this.cwdDir = res.value;

        return Ok(undefined);
    }

    public createOrOpenFile(
        path: string,
        data: Uint8Array = new Uint8Array(),
    ): Result<File, string> {
        const res = this.getParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            return Err(`${path}: File exists`);
        }
        const { filename: name, parent } = res.value;
        const file = parent.children.get(name);
        if (!file) {
            const child: File = {
                tag: "file",
                name,
                content: {
                    tag: "dynamic",
                    data,
                },
            };
            parent.children.set(name, child);
            return Ok(child);
        }
        if (file.tag === "dir") {
            return Err(`${path}: Is a directory`);
        }
        return Ok(file);
    }

    public rm(path: string, recursive: boolean): Result<undefined, string> {
        const res = this.getParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            if (!recursive) {
                return Err(`${path}: Is a directory`);
            }
            // (2001: A Space Odyssey)
            return Err(`${path}: I'm sorry, Dave. I'm afraid I can't do that.`);
        }
        const { filename, parent } = res.value;
        const file = parent.children.get(filename);
        if (!file) {
            return Err(`${path}: No such file or directory`);
        }
        if (file.tag === "dir" && !recursive) {
            return Err(`${path}: Is a directory`);
        }
        const isImportantDirectory = file === this.root.children.get("home") ||
            file === this.userDir();
        if (isImportantDirectory) {
            // (2001: A Space Odyssey)
            return Err(
                `${path}: I'm sorry, Dave. I'm afraid I can't do that.`,
            );
        }
        parent.children.delete(filename);
        return Ok(undefined);
    }

    private createDir(name: string, parent: Dir): Dir {
        const dir: Dir = {
            tag: "dir",
            parent,
            name,
            children: new Map(),
        };

        parent.children.set(name, dir);

        return dir;
    }

    private nodeRootFromPath(path: string): Dir {
        if (path.startsWith("/")) {
            return this.root;
        }
        if (path.startsWith("~")) {
            this.userDir();
        }
        return this.cwdDir;
    }

    public mkdir(
        path: string,
        makeParents: boolean,
    ): Result<undefined, string> {
        const segments = lexPath(path);
        const filename = segments.pop();
        if (!filename) {
            if (path === "/") {
                return Err(`${path}: File exists`);
            }
            throw new Error("unreachable: path cannot be empty");
        }

        let node = this.nodeRootFromPath(path);
        for (const segment of segments) {
            const res = this.getNodeFromPathSegment(node, segment);
            if (!res.ok && makeParents) {
                const child = this.createDir(segment, node);
                node = child;
                continue;
            } else if (!res.ok) {
                return Err(`${path}: No such file or directory`);
            }
            if (res.value.tag === "file") {
                return Err(`${path}: Not a directory`);
            }
            node = res.value;
        }

        const existing = node.children.get(filename);
        if (existing && makeParents) {
            if (existing.tag === "dir") {
                return Ok(undefined);
            }
            return Err(`${path}: Not a directory`);
        } else if (existing) {
            return Err(`${path}: File exists`);
        }

        this.createDir(filename, node);

        return Ok(undefined);
    }
    public touch(path: string): Result<undefined, string> {
        const res = this.getParentFromPath(path);
        if (!res.ok) {
            return Err(`'${path}': No such file or directory`);
        }
        if (res.value.tag === "root") {
            return Ok(undefined);
        }

        const { filename: name, parent } = res.value;
        if (!parent.children.has(name)) {
            parent.children.set(name, {
                tag: "file",
                name,
                content: { tag: "dynamic", data: new Uint8Array() },
            });
        }
        return Ok(undefined);
    }

    public cat(path: string): Result<string, string> {
        const res = this.getChildFromPath(path);
        if (!res.ok) {
            return Err(`'${path}': No such file or directory`);
        }

        const file = res.value;
        if (file.tag === "dir") {
            return Err(`'${path}': Is a directory`);
        }

        const decoded = new TextDecoder().decode(file.content.data);

        return Ok(decoded);
    }

    public xdgOpen(path: string): Result<undefined, string> {
        const res = this.getParentFromPath(path);
        if (!res.ok) {
            return Err(`'${path}': No such file or directory`);
        }

        if (res.value.tag === "root") {
            return Err(`'${path}': Is a directory`);
        }

        const { filename, parent } = res.value;

        const file = parent.children.get(filename);
        if (file === undefined) {
            return Err(`'${path}': No such file or directory`);
        }
        if (file.tag === "dir") {
            return Err(`'${path}': Is a directory`);
        }

        const { content } = file;
        switch (content.tag) {
            case "dynamic": {
                open(
                    `/bin/xdg-open?filename=${
                        encodeURIComponent(filename)
                    }&data=${encodeURIComponent(bytesToBase64(content.data))}`,
                );
                return Ok(undefined);
            }
            case "static": {
                open(content.url);
                return Ok(undefined);
            }
        }
    }

    public listFiles(path?: string): Result<string[], string> {
        let dir = this.cwdDir;
        if (path) {
            const res = this.getChildFromPath(path);
            if (!res.ok) {
                return Err(`"${path}": No such file or directory`);
            }
            const child = res.value;
            if (child.tag === "file") {
                return Ok([path]);
            }
            dir = child;
        }

        return Ok(
            dir.children
                .entries()
                .map(([name, value]) => value.tag === "dir" ? name + "/" : name)
                .toArray()
                .toSorted(),
        );
    }

    public pwd(): string {
        return fullDirPathString(this.cwdDir);
    }

    public cwdString(): string {
        const val = this.pwd();
        return val.replace(new RegExp(`^/home/${this.username}`), "~");
    }

    public dirOrFileExists(path: string): boolean {
        const res = this.getChildFromPath(path);
        if (!res.ok) {
            return false;
        }
        return true;
    }

    private getParentFromPath(
        path: string,
    ): Result<ParentFromPath, string> {
        const segments = lexPath(path);
        const filename = segments.pop();
        if (!filename) {
            if (path === "/") {
                return Ok({ tag: "root", root: this.root });
            }
            throw new Error("unreachable: path cannot be empty");
        }

        let parent = this.nodeRootFromPath(path);
        for (const segment of segments) {
            const res = this.getNodeFromPathSegment(parent, segment);
            if (!res.ok) {
                return Err(`${path}: No such file or directory`);
            }
            if (res.value.tag === "file") {
                return Err(`${path}: Not a directory`);
            }
            parent = res.value;
        }

        return Ok({ tag: "file", filename, parent });
    }

    private getChildFromPath(
        path: string,
    ): Result<Dir | File, string> {
        const res = this.getParentFromPath(path);
        if (!res.ok) return res;
        if (res.value.tag === "root") return Ok(this.root);
        const { filename, parent } = res.value;

        const child = parent.children.get(filename);
        if (!child) {
            return Err(`${path}: No such file or directory`);
        }
        return Ok(child);
    }

    private getNodeFromPathSegment(
        dir: Dir,
        segment: string,
    ): Result<File | Dir, undefined> {
        if (segment === ".") {
            return Ok(dir);
        }
        if (segment === "..") {
            if (!dir.parent) {
                return Ok(dir);
            }
            return Ok(dir.parent);
        }
        const child = dir.children.get(segment);
        if (!child) {
            return Err(undefined);
        }
        return Ok(child);
    }

    private userDir(): Dir {
        const home = this.root.children.get("home");
        if (!home || home.tag === "file") {
            throw new Error("unreachable: '/home' is either a file or null");
        }
        const userDir = home.children.get(this.username);
        if (!userDir || userDir.tag === "file") {
            throw new Error(
                `unreachable: '/home/${this.username}' is either a file or null`,
            );
        }
        return userDir;
    }
}

function lexPath(text: string): string[] {
    return text.split("/").filter((v) => v !== "");
}
