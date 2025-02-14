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
    "xdg-open",
    "wget",
] as const;

export async function assertMotdIncludesCmd() {
    const path = "motd.txt";
    const welcome = await fetch(path).then((r) => r.text());
    for (const cmd of cmds) {
        if (welcome.includes(cmd)) continue;
        throw new Error(`unreachable: ${path} should include ${cmd}`);
    }
}

export function validCmds(): string[] {
    return cmds.map((v) => v.toString());
}

export function rawCmdIsCmd(rawCmd: string): rawCmd is Cmd {
    return cmds.map((v) => v.toString()).includes(rawCmd);
}
