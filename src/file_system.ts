import { Err, Ok, Result } from "./Result.ts";

export type Dir = {
    name: string;
    parent?: Dir;
    dirs: Map<string, Dir>;
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
    for (const child of node.dirs.values()) {
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
    private cwdDir: Dir;

    constructor(
        private root: Dir,
        private username: string,
    ) {
        this.cwdDir = root;
    }

    public cd(path: string): Result<undefined, string> {
        if (path === "") {
            this.cwdDir = this.userDir();
            return Ok(undefined);
        }

        if (path === "/") {
            this.cwdDir = this.root;
            return Ok(undefined);
        }

        const res = this.getNodeFromPath(this.cwdDir, path);
        if (!res.ok) {
            return Err(`${path}: No such file or directory`);
        }

        this.cwdDir = res.value;

        return Ok(undefined);
    }

    public mkdir(dirname: string): Result<undefined, string> {
        if (this.dirOrFileExists(dirname)) {
            return Err(`cannot create directory '${dirname}': File exists`);
        }

        this.cwdDir.dirs.set(dirname, {
            name: dirname,
            dirs: dirChildren({}),
            parent: this.cwdDir,
            files: new Map(),
        });

        return Ok(undefined);
    }
	public touch(filename: string):  Result<undefined, string> {
		if (this.dirOrFileExists(filename)) {
			return Err(`cannot create directory '${filename}': File exists`);
		}

		this.cwdDir.files.set(filename, "");

		return Ok(undefined)
	}

	public cat(filename: string):  Result<string, string> {
		const content = this.cwdDir.files.get(filename);
		if (content === undefined) {
			return Err(`"${filename}": No such file or directory`);
		}

		return Ok(content)
	}

    public listFiles(path?: string): Result<string, string> {
        let dir: Dir;
        if (path) {
            const res = this.getNodeFromPath(this.cwdDir, path);

            if (!res.ok) {
                return Err(`"${path}": No such file or directory`);
            }
            dir = res.value;
        } else {
            dir = this.cwdDir;
        }

        return Ok(
            [
                ...dir.dirs.keys(),
                ...dir.files.keys(),
            ]
                .toSorted().join("\n"),
        );
    }

    public cwd(): string {
        return fullDirPathString(this.cwdDir);
    }

    public cwdString(): string {
        const val = this.cwd();
        if (val === "") {
            return "/";
        }
        return val.replace(new RegExp(`^/home/${this.username}`), "~");
    }

	public dirOrFileExists(name: string): boolean {
		return this.cwdDir.dirs.has(name) || this.cwdDir.files.has(name);
	}

    private getNodeFromPath(dir: Dir, path: string): Result<Dir, undefined> {
        const segments = lexPath(path);

        let node = path.startsWith("/") ? this.root : dir;
        for (const segment of segments) {
            const res = this.getNodeFromPathSegment(node, segment);
            if (!res.ok) {
                return Err(undefined);
            }
            node = res.value;
        }

        return Ok(node);
    }

    private getNodeFromPathSegment(
        dir: Dir,
        segment: string,
    ): Result<Dir, undefined> {
        if (segment === ".") {
            return Ok(dir);
        }
        if (segment === "..") {
            if (!dir.parent) {
                return Ok(dir);
            }
            return Ok(dir.parent);
        }
        if (segment === "~") {
            return Ok(this.userDir());
        }
        if (!dir.dirs.has(segment)) {
            return Err(undefined);
        }
        return Ok(dir.dirs.get(segment)!);
    }

    private userDir(): Dir {
        return this.root
            .dirs.get("home")!
            .dirs.get("guest")!;
    }
}

function lexPath(text: string): string[] {
    return text.split("/").filter((v) => v !== "");
}
