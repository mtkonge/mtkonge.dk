import { Session } from "./file_system.ts";
import { Dir, dirChildren, reverseOrphanDirTree } from "./file_system.ts";
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
window.addEventListener("resize", setInputMaxLength);
window.addEventListener("click", () => input.focus());

input.addEventListener("keydown", function (event: KeyboardEvent) {
    if (event.key === "Enter") {
        addHistoryItem(runCommand(input.value));
        updatePromptAndInput();
    } else if (event.ctrlKey && event.key === "c") {
        addHistoryItem("");
    } else if (event.key === "ArrowUp") {
        if (commandHistoryIndex >= commandHistory.length)
            return;

        commandHistoryIndex++;

        input.value = commandHistory[commandHistory.length - commandHistoryIndex];
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

        input.value = commandHistory[commandHistory.length - commandHistoryIndex];
        updateCursorPos(input.value.length);

        event.preventDefault();
    }
});

function updateCursorPos(pos) {
    input.setSelectionRange(pos, pos);
    updatePromptAndInput();
}

const root: Dir = {
    name: "/",
    children: dirChildren({
        "home": {
            name: "home",
            children: dirChildren({
                [username]: {
                    name: username,
                    children: dirChildren({}),
                    files: new Map(),
                },
            }),
            files: new Map(),
        },
    }),
    files: new Map(),
};

reverseOrphanDirTree(root);

const session = new Session(root, username);
console.log(session.cd(`/home/${username}`));

function runCommand(command: string): string {
    const args = command.trim().split(" ");

    if (args.length === 0) {
        return "";
    }

    switch (args[0]) {
        case "pwd":
            return session.cwd();
        case "cd": {
            if (args.length > 2) {
                return "cd: too many arguments";
            }

            const res = session.cd(args[1]);
            if (!res.ok) {
                return `cd: ${res.error}`;
            }

            return "";
        }
        case "mkdir": {
            if (args.length === 1) {
                return "mkdir: missing operand";
            }

            for (const dir of args.slice(1)) {
                const res = session.mkdir(dir);
                if (!res.ok) {
                    return `mkdir: ${res.error}`;
                }
            }

            return "";
        }
        case "ls": {
            if (args.length === 1) {
                const res = session.listFiles();
                if (!res.ok) {
                    return res.error;
                }
                return res.value;
            }
            return args.slice(1)
                .map((arg) => {
                    const res = session.listFiles(arg);
                    if (!res.ok) {
                        return res.error;
                    }
                    return res.value;
                }).join("\n");
        }
        default:
            return `${command}: Command not found`;
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

    input.value = "";
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
