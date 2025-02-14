import { rawCmdIsCmd, validCmds } from "./cmd_validation.ts";
import { fileChildren, Session } from "./file_system.ts";
import { Dir, dirChildren, linkDirTreeOrphans } from "./file_system.ts";
import { CommandLexer } from "./lexer.ts";
import { CommandParser, Redirect } from "./parser.ts";
import { Err, Ok, Result } from "./results.ts";
import "./style.css";

const input = document.querySelector<HTMLInputElement>("#terminal-input")!;
const cursor = document.querySelector<HTMLSpanElement>("#cursor")!;
const history = document.querySelector<HTMLDivElement>("#history")!;
const userPrefix = document.querySelector<HTMLDivElement>("#user")!;
const dirElement = document.querySelector<HTMLDivElement>("#dir")!;

const username = "guest";
const commandHistory: string[] = [];
let commandHistoryIndex = 0;

input.addEventListener("input", updatePromptAndInput);
input.addEventListener("keydown", updatePromptAndInput);
input.addEventListener("keyup", updatePromptAndInput);
input.addEventListener("focus", showCursor);
input.addEventListener("blur", hideCursor);
addEventListener("resize", setInputMaxLength);
addEventListener("click", () => input.focus());

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

function requestAutoComplete(cmd: string, last: string | undefined): string[] {
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

input.addEventListener("keydown", function (event: KeyboardEvent) {
    if (event.key === "Enter") {
        let shouldClear = false;

        const res = runCommand(input.value, {
            clear() {
                shouldClear = true;
            },
        });

        if (!res.ok) {
            addHistoryItem(res.error);
            input.value = "";
            return;
        }
        if (res.value.tag === "empty_cmd") {
            addHistoryItem("");
            return;
        }
        
        const output = res.value;
        if (output.redirects.length === 0) {
            addHistoryItem(res.value.content);
        } else {
            for (const redirect of output.redirects) {
                const res = session.createOrOpenFile(redirect.target);
                if (!res.ok) {
                    addHistoryItem(`bash: ${res.error}`);
                    input.value = "";
                    return;
                }
                const file = res.value;
                if (redirect.tag === "write") {
                    file.content = output.content;
                } else if (redirect.tag === "append") {
                    file.content += output.content;
                }
            }
            addHistoryItem("");
        }

        if (shouldClear) {
            clearHistory();
        }

        input.value = "";
        updatePromptAndInput();
    } else if (event.ctrlKey && event.key === "c") {
        addHistoryItem("");
        input.value = "";
    } else if (event.key === "Tab") {
        const [cmd, ...args] = input.value.trimStart().split(/\s+/g);
        const last = args.pop();
        const options = requestAutoComplete(cmd, last);
        if (options.length === 1) {
            const option = options[0];
            const idx = input.value.lastIndexOf(last ?? cmd);
            input.value = input.value.substring(0, idx) + option;
        } else if (options.length > 1) {
            addHistoryItem(options.join("\n"));
        }
        event.preventDefault();
    } else if (event.key === "ArrowUp") {
        if (commandHistoryIndex >= commandHistory.length) {
            return;
        }

        commandHistoryIndex++;

        input.value =
            commandHistory[commandHistory.length - commandHistoryIndex];
        updateCursorPos(input.value.length);

        event.preventDefault();
    } else if (event.key === "ArrowDown") {
        if (commandHistoryIndex === 1) {
            input.value = ""; // TODO change to currently editing text

            commandHistoryIndex--;

            return;
        }

        if (commandHistoryIndex === 0) {
            return;
        }

        commandHistoryIndex--;

        input.value =
            commandHistory[commandHistory.length - commandHistoryIndex];
        updateCursorPos(input.value.length);

        event.preventDefault();
    }
});

async function loadTextFile(path: string): Promise<string> {
    const response = await fetch(path);
    return await response.text();
}

function updateCursorPos(pos: number) {
    input.setSelectionRange(pos, pos);
    updatePromptAndInput();
}

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
                        "welcome.txt": await loadTextFile("welcome.txt"),
                    }),
                },
            }),
        },
    }),
};

linkDirTreeOrphans(root, null);

const session = new Session(root, username);
session.cd(`/home/${username}`);
addHistoryItem((() => {
    const res = runCommand("cat welcome.txt");
    if (!res.ok) throw new Error("unreachable: valid cat command");
    if (res.value.tag !== "cmd") throw new Error("unreachable: valid cat command");
    return res.value.content;
})());

type MetaCmds = {
    clear?(): void;
};

type Output = 
| { tag: "cmd", redirects: Redirect[], content: string, }
| { tag: "empty_cmd", };

function runCommand(
    command: string,
    metaCmds: MetaCmds = {},
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

function addHistoryItem(output: string) {
    const userPrefixClone = userPrefix.cloneNode(true) as HTMLDivElement;
    userPrefixClone.id = "";

    const command = document.createElement("div");
    command.innerHTML = input.value;

    const userAndCommand = document.createElement("div");
    userAndCommand.classList.add("user-and-command");
    userAndCommand.appendChild(userPrefixClone);
    userAndCommand.appendChild(command);

    const outputElement = document.createElement("div");
    outputElement.innerHTML = output;

    const historyItem = document.createElement("div");
    historyItem.classList.add("history-list");

    historyItem.appendChild(userAndCommand);
    historyItem.appendChild(outputElement);

    history.appendChild(historyItem);

    scrollTo(0, document.body.scrollHeight);

    commandHistory.push(input.value);
}

function clearHistory() {
    history.replaceChildren();
}

function setInputMaxLength() {
    const width = input.clientWidth;
    const charWidth = 10;
    input.maxLength = Math.floor(width / charWidth) - 1;
}

function updatePromptAndInput() {
    // a lot of this is hardcoded. Figure out a way to fix this
    const marginPx = 8;
    const offsetPx = 2;

    const dir = session.cwdString();

    const prompt = username + "@mtkonge:" + dir + "$ ";
    const prefixChars = prompt.length;

    dirElement.innerText = dir;

    const charWidthPx = 10;

    const cursorPosition = input.selectionStart!;
    const cursorLeft = (prefixChars + cursorPosition) * charWidthPx + marginPx +
        offsetPx;

    cursor.style.left = cursorLeft + "px";
}

function showCursor() {
    cursor.style.display = "inline-block";
}

function hideCursor() {
    cursor.style.display = "none";
}

function main() {
    hideCursor();
    updatePromptAndInput();
    setInputMaxLength();
}

main();
