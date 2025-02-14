import { rawCmdIsCmd, validCmds } from "./cmd_validation.ts";
import { Session } from "./file_system.ts";
import { root } from "./initial_fs.ts";
import { CommandLexer } from "./lexer.ts";
import { CommandParser, Redirect } from "./parser.ts";
import { Err, Ok, Result } from "./results.ts";
import "./style.css";
import { UiAction } from "./ui.ts";
import { KeyEvent, Ui } from "./ui.ts";

const username = "guest";
const commandHistory: string[] = [];
let commandHistoryIndex = 0;
let lastKnownCommand = "";

function autoCompleteMatches(
    input: string,
    options: string[],
): string[] {
    const matches = options.map((v) => v).filter((v) => v.startsWith(input));
    if (matches.length <= 1) {
        return matches;
    }
    const maxLength = matches.map((v) => v.length)
        .toSorted()
        .toReversed()
        .pop();
    if (maxLength === undefined) {
        throw new Error("unreachable: we return if length <= 1");
    }
    let closestLength = 0;
    const letters = matches[0].split("").slice(0, maxLength);
    for (let letterIdx = 0; letterIdx < maxLength; ++letterIdx) {
        const letterToMatch = letters[letterIdx];
        if (matches.every((match) => match[letterIdx] === letterToMatch)) {
            // we add 1 here because it's a length, not an index
            closestLength = letterIdx + 1;
        } else {
            break;
        }
    }
    if (closestLength === input.length) {
        return matches;
    } else if (closestLength < input.length) {
        throw new Error(
            "unreachable: matches that start with {input} all share {input} in common",
        );
    }
    return [matches[0].substring(0, closestLength)];
}

function requestAutoComplete(session: Session, cmd: string, last: string | undefined): string[] {
    if (last === undefined) {
        if (rawCmdIsCmd(cmd)) {
            return [];
        }
        return autoCompleteMatches(cmd, validCmds());
    } else if (!rawCmdIsCmd(cmd)) {
        return [];
    }
    switch (cmd) {
        case "cd":
        case "mkdir":
        case "ls":
        case "touch":
        case "cat": {
            const fileSeperator = last.lastIndexOf("/");
            const path = fileSeperator !== -1
                ? last.substring(0, fileSeperator + 1)
                : undefined;
            const filename = fileSeperator !== -1
                ? last.substring(fileSeperator + 1)
                : last;
            const files = session.listFiles(path);
            if (!files.ok) {
                return [];
            }
            const res = autoCompleteMatches(
                filename,
                files.value,
            );
            return res.map((v) => path !== undefined ? path + v : v);
        }
        case "pwd":
        case "echo":
        case "clear": {
            return [];
        }
    }
}

function uiKeyEvent(session: Session, event: KeyEvent): UiAction[] {
    const actions: UiAction[] = []; 
    if (event.key === "Enter") {
        let shouldClear = false;

        const res = runCommand(event.input, {
            clear() {
                shouldClear = true;
            },
        }, session);

        if (!res.ok) {
            actions.push({tag: "add_history_item", output: res.error});
            actions.push({tag: "clear_input"});
            commandHistory.push(event.input);
            return actions;
        }

        if (res.value.tag === "empty_cmd") {
            actions.push({tag: "add_history_item", output: ""});
            return actions;
        }

        commandHistory.push(event.input);
        
        const output = res.value;
        if (output.redirects.length === 0) {
            actions.push({tag: "add_history_item", "output": res.value.content});
        } else {
            for (const redirect of output.redirects) {
                const res = session.createOrOpenFile(redirect.target);
                if (!res.ok) {
                    actions.push({tag: "add_history_item", output: `bash: ${res.error}`});
                    actions.push({tag: "clear_input"});
                    return actions;
                }
                const file = res.value;
                if (redirect.tag === "write") {
                    file.content = output.content;
                } else if (redirect.tag === "append") {
                    file.content += output.content;
                }
            }
            actions.push({tag: "add_history_item", output: ""});
        }

        if (shouldClear) {
            actions.push({tag: "clear_history"})
        }

        actions.push({tag: "clear_input"})
        return actions;
    }
     if (event.ctrl && event.key === "c") {
        actions.push({tag: "add_history_item", output: ""});
        actions.push({tag: "clear_input"})
        return actions;
    }
    if (event.key === "Tab") {
        const [cmd, ...args] = event.input.trimStart().split(/\s+/g);
        const last = args.pop();
        const options = requestAutoComplete(session, cmd, last);
        if (options.length === 1) {
            const option = options[0];
            const idx = event.input.lastIndexOf(last ?? cmd);
            const selected = event.input.substring(0, idx) + option;
            actions.push({tag: "set_input_value", value: selected})
        } else if (options.length > 1) {
            actions.push({tag: "add_history_item", output: options.join("\n")});
        }
        event.preventDefault();
        return actions;
    } 
     if (event.key === "ArrowUp") {
        if (commandHistoryIndex >= commandHistory.length) {
            return actions;
        }
        if (commandHistoryIndex === 0) {
            lastKnownCommand = event.input;
        }
        commandHistoryIndex++;
        const cmd = commandHistory[commandHistory.length - commandHistoryIndex];
        actions.push({tag: "set_input_value", value: cmd});
        event.preventDefault();
        return actions;
    } else if (event.key === "ArrowDown") {
        if (commandHistoryIndex === 1) {
            actions.push({tag: "set_input_value", value: lastKnownCommand}); // TODO: change to currently editing text
            commandHistoryIndex--;
            return actions;
        }
        if (commandHistoryIndex === 0) {
            return actions;
        }
        commandHistoryIndex--;
        const cmd = commandHistory[commandHistory.length - commandHistoryIndex];
        actions.push({tag: "set_input_value", value: cmd});
        event.preventDefault();
        return actions;
    }
    return [];
}



type MetaCmds = {
    clear?(): void;
};

type Output = 
| { tag: "cmd", redirects: Redirect[], content: string, }
| { tag: "empty_cmd", };

function runCommand(
    command: string,
    metaCmds: MetaCmds,
    session: Session,
): Result<Output, string> {
    const lexer = new CommandLexer(command);
    const tokens = [];
    while (!lexer.done()) {
        const res = lexer.next();
        if (!res.ok) {
            return Err(`error lexing cmd: ${res.error}`);
        } else {
            if (!res.value) {
                throw new Error(
                    "unreachable: should only return null tokens if lexer is done",
                );
            }
            tokens.push(res.value);
        }
    }
    const parseRes = new CommandParser(tokens).parse();
    if (!parseRes.ok) {
        return parseRes;
    }

    const cmd = parseRes.value;
    const redirects = cmd.redirects;

    if (cmd.bin === "") {
        return Ok({tag: "empty_cmd"})
    }

    if (!rawCmdIsCmd(cmd.bin)) {
        return Err(`${cmd.bin}: Command not found`);
    }
    switch (cmd.bin) {
        case "pwd":
            return Ok({ tag: "cmd", redirects, content: session.pwd() });
        case "cd": {
            if (cmd.arguments.length > 1) {
                return Err("cd: too many arguments");
            }

            const res = session.cd(cmd.arguments.pop() ?? "");
            if (!res.ok) {
                return Err(`cd: ${res.error}`);
            }

            return Ok({ tag: "cmd", redirects, content: "" });
        }
        case "mkdir": {
            if (cmd.arguments.length === 0) {
                return Err("mkdir: missing operand");
            }

            const makeParents = cmd.short_options.includes("p") ||
                cmd.long_options.includes("parents");

            for (const dir of cmd.arguments) {
                const res = session.mkdir(dir, makeParents);
                if (!res.ok) {
                    return Err(`mkdir: ${res.error}`);
                }
            }

            return Ok({ tag: "cmd", redirects, content: "" });
        }
        case "ls": {
            const showAll = cmd.short_options.includes("a") ||
                cmd.long_options.includes("all");

            const res = cmd.arguments.length === 0
                ? [session.listFiles()]
                : cmd.arguments.map((arg) => session.listFiles(arg));

            const content = res
                .map((v) =>
                    v.ok
                        ? v.value
                            .filter((v) => showAll || !v.startsWith("."))
                            .join("\n")
                        : v.error
                ).join("\n");
            return Ok({ tag: "cmd",
                redirects,
                content,
            });
        }
        case "touch": {
            if (cmd.arguments.length === 0) {
                return Err("touch: missing file operand");
            }
            for (const file of cmd.arguments) {
                session.touch(file);
            }
            return Ok({ tag: "cmd", redirects, content: "" });
        }
        case "cat": {
            if (cmd.arguments.length === 0) {
                return Err("cat: missing file operand");
            }
            const content = cmd.arguments
                .map((v) => session.cat(v))
                .map((r) => r.ok ? r.value : `cat: ${r.error}`)
                .reduce((acc, v) => acc + "\n" + v);
            return Ok({ tag: "cmd",
                content,
                redirects,
            });
        }
        case "echo": {
            if (cmd.arguments.length === 0) {
                return Ok({ tag: "cmd", redirects, content: "\n" });
            }
            return Ok({ tag: "cmd", redirects, content: cmd.arguments.join(" ") + "\n" });
        }
        case "clear": {
            metaCmds.clear?.();
            return Ok({ tag: "cmd", redirects, content: "" });
        }
    }
}


async function main() {
    const session = new Session(await root(username), username);
    session.cd(`/home/${username}`);

    const ui = new Ui({
        updatePrompt: (update) => update(session.cwdString()),
        keyListener: (event) => ui.executeActions(uiKeyEvent(session, event)),
    })

    const catOutput = (() => {
        const res = runCommand("cat welcome.txt", {}, session);
        if (!res.ok) throw new Error("unreachable: valid cat command");
        if (res.value.tag !== "cmd") throw new Error("unreachable: valid cat command");
        return res.value.content;
    })();

    ui.executeActions([{tag: "add_history_item", output: catOutput}]);
}

main();
