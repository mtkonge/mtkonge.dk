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
    children: Map<string, Dir | File>;
    parent: Dir | RootDir;
};

export type RootDir = {
    tag: "root_dir";
    children: Map<string, Dir | File>;
};

export type InitialDir = {
    tag: "dir";
    name: string;
    children: Map<string, InitialDir | File>;
};

export type InitialRootDir = {
    tag: "root_dir";
    children: Map<string, InitialDir | File>;
};

export function initialChildren(
    children: { [key: string]: InitialDir | File },
): Map<string, InitialDir | File> {
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

type ParentFromPath =
    | { tag: "root"; root: RootDir }
    | { tag: "file"; filename: string; parent: Dir["parent"] };

function absolutePathOfDir(
    dir: Dir | RootDir,
    descendants: Dir[] = [],
): string {
    if (dir.tag === "root_dir") {
        return "/" + descendants.map((v) => v.name).join("/");
    }
    return absolutePathOfDir(dir.parent, [dir, ...descendants]);
}

function linkRootDir(root: InitialRootDir): RootDir {
    const node: RootDir = {
        tag: "root_dir",
        children: new Map(),
    };
    const children = new Map<string, Dir | File>(
        root.children.entries().map(([name, child]) => [
            name,
            child.tag === "dir" ? linkDir(child, node) : child,
        ]),
    );
    node.children = children;
    return node;
}
function linkDir(
    initial: InitialDir,
    parent: Dir["parent"],
): Dir {
    const node: Dir = {
        tag: "dir",
        name: initial.name,
        parent,
        children: new Map(),
    };
    const children = new Map<string, Dir | File>(
        initial.children.entries().map(([name, child]) => [
            name,
            child.tag === "dir" ? linkDir(child, node) : child,
        ]),
    );
    node.children = children;
    return node;
}

type IoError =
    | "no_such_file_or_directory"
    | "not_a_directory"
    | "is_a_directory"
    | "file_exists"
    | "hal_9000";
function formatIoError(
    path: string,
    error: IoError,
): `${string}: ${string}` {
    switch (error) {
        case "no_such_file_or_directory":
            return `'${path}': No such file or directory`;
        case "not_a_directory":
            return `'${path}': Not directory`;
        case "is_a_directory":
            return `'${path}': Is a directory`;
        case "file_exists":
            return `'${path}': File exists`;
        case "hal_9000":
            // (2001: A Space Odyssey)
            return `'${path}': I'm sorry, Dave. I'm afraid I can't do that.`;
    }
}

export class Session {
    private cwdDir: Dir | RootDir;
    private root: RootDir;

    constructor(
        root: InitialRootDir,
        private username: string,
    ) {
        this.root = linkRootDir(root);
        this.cwdDir = this.root;
    }

    public cd(path?: string): Result<undefined, string> {
        if (path === undefined) {
            this.cwdDir = this.userDir();
            return Ok(undefined);
        }
        const res = this.nodeFromPath(path);
        if (!res.ok) {
            return Err(formatIoError(path, "no_such_file_or_directory"));
        }
        if (res.value.tag === "file") {
            return Err(formatIoError(path, "not_a_directory"));
        }
        this.cwdDir = res.value;
        return Ok(undefined);
    }

    public createOrOpenFile(
        path: string,
        data: Uint8Array = new Uint8Array(),
    ): Result<File, string> {
        const res = this.filenameAndParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            return Err(formatIoError(path, "file_exists"));
        }
        const { filename, parent } = res.value;
        const file = parent.children.get(filename);
        if (!file) {
            return Ok(this.createFile(filename, data, parent));
        }
        if (file.tag === "dir") {
            return Err(formatIoError(path, "is_a_directory"));
        }
        return Ok(file);
    }

    public rm(path: string, recursive: boolean): Result<undefined, string> {
        const res = this.filenameAndParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            if (!recursive) {
                return Err(formatIoError(path, "is_a_directory"));
            }
            return Err(formatIoError(path, "hal_9000"));
        }
        const { filename, parent } = res.value;
        const file = parent.children.get(filename);
        if (file === undefined) {
            return Err(formatIoError(path, "no_such_file_or_directory"));
        }
        if (file.tag === "dir" && !recursive) {
            return Err(formatIoError(path, "is_a_directory"));
        }
        const isImportantDirectory = file === this.root.children.get("home") ||
            file === this.userDir();
        if (isImportantDirectory) {
            return Err(formatIoError(path, "hal_9000"));
        }
        parent.children.delete(filename);
        return Ok(undefined);
    }

    private createFile(
        name: string,
        data: Uint8Array,
        parent: RootDir | Dir,
    ): File {
        const file: File = {
            tag: "file",
            name,
            content: {
                tag: "dynamic",
                data,
            },
        };

        parent.children.set(name, file);

        return file;
    }

    private createDir(name: string, parent: RootDir | Dir): Dir {
        const dir: Dir = {
            tag: "dir",
            parent,
            name,
            children: new Map(),
        };

        parent.children.set(name, dir);

        return dir;
    }

    public mkdir(
        path: string,
        makeParents: boolean,
    ): Result<undefined, string> {
        const pathSegments = this.pathToAbsolutePathSegments(path);
        const filename = pathSegments.pop();
        if (filename === undefined) {
            if (makeParents) {
                return Ok(undefined);
            }
            return Err(formatIoError(path, "file_exists"));
        }
        let parent: RootDir | Dir = this.root;
        while (true) {
            const segment = pathSegments.shift();
            if (segment === undefined) {
                break;
            }
            const child: File | Dir | undefined = parent.children.get(
                segment,
            );
            if (child === undefined) {
                if (!makeParents) {
                    const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                    return Err(
                        formatIoError(childPath, "no_such_file_or_directory"),
                    );
                }
                const newChild = this.createDir(segment, parent);
                parent = newChild;
                continue;
            }
            if (child.tag === "file") {
                const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                return Err(formatIoError(childPath, "file_exists"));
            }
            parent = child;
        }

        const existingChild = parent.children.get(filename);
        if (existingChild !== undefined) {
            if (!makeParents || existingChild.tag === "file") {
                return Err(formatIoError(path, "file_exists"));
            }
            return Ok(undefined);
        }
        this.createDir(filename, parent);
        return Ok(undefined);
    }

    public dirOrFileExists(path: string): boolean {
        const res = this.nodeFromPath(path);
        return res.ok;
    }

    public touch(path: string): Result<undefined, string> {
        const res = this.filenameAndParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            return Ok(undefined);
        }

        const { filename, parent } = res.value;

        const file = parent.children.get(filename);
        if (file !== undefined) {
            Ok(undefined);
        }
        this.createFile(filename, new Uint8Array(), parent);
        return Ok(undefined);
    }

    public cat(path: string): Result<string, string> {
        const res = this.nodeFromPath(path);
        if (!res.ok) {
            return Err(formatIoError(path, "no_such_file_or_directory"));
        }

        const file = res.value;
        if (file.tag === "dir" || file.tag === "root_dir") {
            return Err(formatIoError(path, "is_a_directory"));
        }

        const decoded = new TextDecoder().decode(file.content.data);

        return Ok(decoded);
    }

    public xdgOpen(path: string): Result<undefined, string> {
        const res = this.filenameAndParentFromPath(path);
        if (!res.ok) {
            return res;
        }
        if (res.value.tag === "root") {
            return Err(formatIoError(path, "is_a_directory"));
        }

        const { filename, parent } = res.value;

        const file = parent.children.get(filename);
        if (file === undefined) {
            return Err(formatIoError(path, "no_such_file_or_directory"));
        }
        if (file.tag === "dir") {
            return Err(formatIoError(path, "is_a_directory"));
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
            const res = this.nodeFromPath(path);
            if (!res.ok) {
                return Err(formatIoError(path, "no_such_file_or_directory"));
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
        return absolutePathOfDir(this.cwdDir);
    }

    public formattedCwd(): string {
        const val = this.pwd();
        return val.replace(new RegExp(`^/home/${this.username}`), "~");
    }

    private filenameAndParentFromPath(
        path: string,
    ): Result<ParentFromPath, string> {
        const pathSegments = this.pathToAbsolutePathSegments(path);
        const filename = pathSegments.pop();
        if (filename === undefined) {
            return Ok({ tag: "root", root: this.root });
        }
        let parent: RootDir | Dir = this.root;
        while (true) {
            const segment = pathSegments.shift();
            if (segment === undefined) {
                break;
            }
            const child: File | Dir | undefined = parent.children.get(
                segment,
            );
            if (child === undefined) {
                const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                return Err(
                    formatIoError(childPath, "no_such_file_or_directory"),
                );
            }
            if (child.tag === "file") {
                const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                return Err(formatIoError(childPath, "not_a_directory"));
            }
            parent = child;
        }
        return Ok({ tag: "file", parent, filename });
    }

    private nodeFromPath(
        maybeRelative: string,
    ): Result<RootDir | Dir | File, string> {
        const pathSegments = this.pathToAbsolutePathSegments(maybeRelative);
        let parent: RootDir | Dir = this.root;
        while (true) {
            const segment = pathSegments.shift();
            if (segment === undefined) {
                break;
            }
            const child: File | Dir | undefined = parent.children.get(
                segment,
            );
            if (child === undefined) {
                const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                return Err(
                    formatIoError(childPath, "no_such_file_or_directory"),
                );
            }
            if (child.tag === "file") {
                if (pathSegments.length > 0) {
                    const childPath = `${absolutePathOfDir(parent)}/${segment}`;
                    return Err(
                        formatIoError(childPath, "not_a_directory"),
                    );
                }
                return Ok(child);
            }
            parent = child;
        }
        return Ok(parent);
    }

    private pathToAbsolutePathSegments(path: string): string[] {
        let absPath;
        if (path.startsWith("/")) {
            absPath = path;
        } else if (path === "~" || path.startsWith("~/")) {
            absPath = path.replace(
                "~",
                absolutePathOfDir(this.userDir()),
            );
        } else {
            absPath = absolutePathOfDir(this.cwdDir) + "/" + path;
        }

        const segments = absPath.split("/").filter((v) =>
            v !== "" && v !== "."
        );
        const nodes: string[] = [];
        while (true) {
            const seg = segments.shift();
            if (seg === undefined) {
                break;
            }
            if (seg === "..") {
                nodes.pop();
                continue;
            }
            nodes.push(seg);
        }
        return nodes;
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
