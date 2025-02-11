export type Cmd = "pwd" | "cd" | "mkdir" | "ls" | "touch" | "cat" | "echo";

const cmds: Cmd[] = [
    "pwd",
    "cd",
    "mkdir",
    "ls",
    "touch",
    "cat",
    "echo",
];

export function validCmds(): string[] {
    return cmds.map((v) => v.toString());
}

export function rawCmdIsCmd(rawCmd: string): rawCmd is Cmd {
    return cmds.map((v) => v.toString()).includes(rawCmd);
}
