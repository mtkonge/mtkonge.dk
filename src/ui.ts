export type UiAction =
    | { tag: "add_history_item"; output: string }
    | { tag: "set_input_value"; value: string }
    | { tag: "set_cwd"; cwd: string }
    | { tag: "clear_history" }
    | { tag: "clear_input" };

export type KeyEvent = {
    key: string;
    input: string;
    ctrl: boolean;
    preventDefault: () => void;
};

export type KeyEventFunctor = (event: KeyEvent) => void;

export type UiConfig = {
    keyListener: KeyEventFunctor;
};

export class Ui {
    private history = document.querySelector<HTMLDivElement>("#history")!;
    private input = document.querySelector<HTMLInputElement>(
        "#terminal-input",
    )!;
    private userPrefix = document.querySelector<HTMLSpanElement>("#user")!;

    constructor({ keyListener }: UiConfig) {
        this.input.addEventListener(
            "keyup",
            () => this.updateInputAndCursor(),
        );
        this.input.addEventListener(
            "keydown",
            (event: KeyboardEvent) => {
                keyListener({
                    key: event.key,
                    ctrl: event.ctrlKey,
                    input: this.input.value,
                    preventDefault: () => event.preventDefault(),
                });
                this.updateInputAndCursor();
            },
        );

        addEventListener("click", () => this.input.focus());
    }

    private addHistoryItem(output: string) {
        const userPrefixClone = this.userPrefix.cloneNode(
            true,
        ) as HTMLSpanElement;

        const command = document.createElement("span");
        command.classList.add("user-command");
        command.textContent = this.input.value;

        const userAndCommand = document.createElement("div");
        userAndCommand.classList.add("user-and-command");
        userAndCommand.appendChild(userPrefixClone);
        userAndCommand.appendChild(command);

        const outputElement = document.createElement("div");
        outputElement.textContent = output;

        const historyItem = document.createElement("div");
        historyItem.classList.add("history-list");

        historyItem.append(userAndCommand, outputElement);

        for (const descendant of historyItem.querySelectorAll("[id]")) {
            descendant.removeAttribute("id");
        }

        this.history.appendChild(historyItem);

        scrollTo(0, document.body.scrollHeight);
    }

    private clearHistory() {
        this.history.replaceChildren();
    }

    private executeAction(action: UiAction): null {
        switch (action.tag) {
            case "add_history_item":
                this.addHistoryItem(action.output);
                return null;
            case "clear_history":
                this.clearHistory();
                return null;
            case "set_input_value":
                this.input.value = action.value;
                return null;
            case "set_cwd":
                this.updateCwd(action.cwd);
                return null;
            case "clear_input":
                this.input.value = "";
                return null;
        }
    }

    private updateInputAndCursor() {
        const promptPrefix = document.querySelector("#user")?.textContent;
        if (!promptPrefix) {
            throw new Error("unreachable: defined in index.html");
        }

        const termContent = document.querySelector("#terminal-input-content");
        if (!termContent) throw new Error("unreachable: defined in index.html");
        const cursorSpace = " ";
        termContent.textContent = this.input.value + cursorSpace;
        const cursorPadding = document.querySelector(
            "#terminal-input-cursor-padding",
        );
        if (!cursorPadding) {
            throw new Error("unreachable: defined in index.html");
        }
        const contentUntilSelection = this.input.value.substring(
            0,
            this.input.selectionStart ?? this.input.value.length,
        );
        cursorPadding.textContent = promptPrefix + contentUntilSelection;
        const cursorSelection = document.querySelector(
            "#terminal-input-cursor-selection",
        );
        if (!cursorSelection) {
            throw new Error("unreachable: defined in index.html");
        }
        const cursorWidth = (this.input.selectionEnd ?? 0) -
            (this.input.selectionStart ?? 0);
        if (cursorWidth > 0) {
            cursorSelection.classList.add("block");
            const selectedInput = this.input.value.substring(
                this.input.selectionStart ?? 0,
                this.input.selectionEnd ?? this.input.value.length,
            );
            cursorSelection.textContent = selectedInput;
        } else {
            cursorSelection.classList.remove("block");
            cursorSelection.textContent = "_";
        }
    }

    private updateCwd(cwd: string) {
        const userCwd = document.querySelector<HTMLDivElement>("#dir")!;
        userCwd.textContent = cwd;
    }

    public executeActions(actions: UiAction[]) {
        while (true) {
            const action = actions.shift();
            if (action === undefined) {
                break;
            }
            this.executeAction(action);
        }
        this.updateInputAndCursor();
    }
}
