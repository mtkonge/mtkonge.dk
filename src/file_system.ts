type Result<V, E> = Ok<V> | Err<E>;

type Ok<V> = { ok: true; value: V };

type Err<E> = { ok: false; error: E };

const Ok = <V>(value: V): Ok<V> => ({ ok: true, value });
const Err = <E>(error: E): Err<E> => ({ ok: false, error });

export type Dir = {
    name: string;
    parent?: Dir;
    children: Map<string, Dir>;
    files: Map<string, string>;
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

export function reverseOrphanDirTree(node: Dir, parent?: Dir) {
    node.parent = parent;
    for (const child of node.children.values()) {
        reverseOrphanDirTree(child, node);
    }
}

export function fullDirPathString(node: Dir): string {
    if (!node.parent) {
        return "";
    }
    return `${fullDirPathString(node.parent)}/${node.name}`;
}

export class Session {
    private cwdPath: Dir;

    constructor(
        private root: Dir,
        private username: string,
    ) {
        this.cwdPath = root;
    }

    public cd(path: string): Result<undefined, string> {
        if (path === "") {
            this.cwdPath = this.userDir();
            return Ok(undefined);
        }
        if (path === "/") {
            this.cwdPath = this.root;
            return Ok(undefined);
        }
        const segments = lexPath(path);
        for (const segment of segments) {
            const res = this.changeToPathSegment(segment);
            if (!res.ok) {
                return Err(`${path}: No such file or directory`);
            }
        }
        return Ok(undefined);
    }

    public cwd(): string {
        return fullDirPathString(this.cwdPath);
    }

    public cwdString(): string {
        const val = this.cwd();
        if (val === "") {
            return "/";
        }
        return val.replace(new RegExp(`^/home/${this.username}`), "~");
    }

    private changeToPathSegment(segment: string): Result<undefined, undefined> {
        if (segment === ".") {
            return Ok(undefined);
        }
        if (segment === "..") {
            if (!this.cwdPath.parent) {
                return Ok(undefined);
            }
            this.cwdPath = this.cwdPath.parent!;
            return Ok(undefined);
        }
        if (segment === "~") {
            this.cwdPath = this.userDir();
            return Ok(undefined);
        }
        if (!this.cwdPath.children.has(segment)) {
            return Err(undefined);
        }
        this.cwdPath = this.cwdPath.children.get(segment)!;
        return Ok(undefined);
    }

    private userDir(): Dir {
        return this.root
            .children.get("home")!
            .children.get("guest")!;
    }
}

function lexPath(text: string): string[] {
    return text.split("/").filter((v) => v !== "");
}
