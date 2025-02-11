import { rawCmdIsCmd, validCmds } from "./cmd_validation.ts";
import { fileChildren, Session } from "./file_system.ts";
import { Dir, dirChildren, reverseOrphanDirTree } from "./file_system.ts";
import { CommandLexer } from "./lexer.ts";
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
            const result = autoCompleteMatches(
                filename,
                files.value,
            );
            return result.map((v) => path !== undefined ? path + v : v);
        }
        case "pwd":
        case "echo":
        case "clear": {
            return [];
        }
    }
}

input.addEventListener("keydown", function(event: KeyboardEvent) {
    if (event.key === "Enter") {
        let shouldClear = false;

        const output = runCommand(input.value, {
            clear() {
                shouldClear = true;
            },
        });

        if (shouldClear) {
            clearHistory();
        } else {
            addHistoryItem(output);
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
    name: "/",
    dirs: dirChildren({
        "home": {
            name: "home",
            dirs: dirChildren({
                [username]: {
                    name: username,
                    dirs: dirChildren({}),
                    files: fileChildren({
                        "welcome.txt": await loadTextFile("welcome.txt"),
                    }),
                },
            }),
            files: new Map(),
        },
    }),
    files: new Map(),
};

reverseOrphanDirTree(root);

const session = new Session(root, username);
session.cd(`/home/${username}`);
addHistoryItem(runCommand("cat welcome.txt"));

type MetaCmds = {
    clear?(): void;
};

function runCommand(command: string, metaCmds: MetaCmds = {}): string {
    const [cmd, ...args] = command.trim().split(" ");
    const lexer = new CommandLexer(command);
    while (!lexer.done()) {
        const result = lexer.next();
        if (!result.ok) {
            console.error(result.error);
        } else {
            console.log(result.value);
        }
    }

    if (cmd === "") {
        return "";
    }
    if (!rawCmdIsCmd(cmd)) {
        return `${cmd}: Command not found`;
    }
    switch (cmd) {
        case "pwd":
            return session.cwd();
        case "cd": {
            if (args.length > 1) {
                return "cd: too many arguments";
            }

            const res = session.cd(args[0]);
            if (!res.ok) {
                return `cd: ${res.error}`;
            }

            return "";
        }
        case "mkdir": {
            if (args.length === 0) {
                return "mkdir: missing operand";
            }

            for (const dir of args) {
                const res = session.mkdir(dir);
                if (!res.ok) {
                    return `mkdir: ${res.error}`;
                }
            }

            return "";
        }
        case "ls": {
            if (args.length === 0) {
                const res = session.listFiles();
                if (!res.ok) {
                    return res.error;
                }
                return res.value.join("\n");
            }
            return args
                .map((arg) => {
                    const res = session.listFiles(arg);
                    if (!res.ok) {
                        return res.error;
                    }
                    return res.value.join("\n");
                }).join("\n");
        }
        case "touch": {
            if (args.length === 0) {
                return "touch: missing file operand";
            }
            for (const fn of args) {
                session.touch(fn);
            }
            return "";
        }
        case "cat": {
            if (args.length === 0) {
                return "cat: missing file operand";
            }
            return args.map((v) => {
                const r = session.cat(v);
                return r.ok ? r.value : r.error;
            }).reduce((acc, v) => acc + "\n" + v);
        }
        case "echo": {
            if (args.length === 0) {
                return "\n";
            }
            return args[0];
        }
        case "clear": {
            metaCmds.clear?.();
            return "";
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

    commandHistory.push(input.value);
}

function clearHistory() {
    for (const child of history.children) {
        history.removeChild(child);
    }
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
