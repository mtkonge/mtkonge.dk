export type Cmd = (typeof cmds)[number];

const cmds = [
    "pwd",
    "cd",
    "mkdir",
    "ls",
    "touch",
    "cat",
    "echo",
    "clear",
    "rm",
] as const;

export function validCmds(): string[] {
    return cmds.map((v) => v.toString());
}

export function rawCmdIsCmd(rawCmd: string): rawCmd is Cmd {
    return cmds.map((v) => v.toString()).includes(rawCmd);
}
