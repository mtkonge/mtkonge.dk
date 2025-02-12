import { Argument, Token } from "./lexer.ts";
import { Err, Ok, Result } from "./results.ts";

export type Redirect = {
    target: string;
    tag: "write" | "append";
};

export type Cmd = {
    bin: string;
    short_options: string[];
    long_options: string[];
    arguments: string[];
    redirects: Redirect[];
};

export class CommandParser {
    private currentIndex = 0;

    public constructor(private tokens: Token[]) {
    }

    public done(): boolean {
        return this.currentIndex >= this.tokens.length;
    }

    private current(): Token {
        return this.tokens[this.currentIndex];
    }

    private step() {
        if (this.done()) {
            return;
        }
        this.currentIndex++;
    }

    private eatArgument(): Result<Argument, string> {
        const { value: token, index } = this.current();
        if (token.tag !== "argument") {
            return Err(
                `expected argument at ${index}, got '${token.tag}'`,
            );
        }
        this.step();
        return Ok(token);
    }

    public parse(): Result<Cmd, string> {
        const cmd: Cmd = {
            bin: "",
            long_options: [],
            redirects: [],
            short_options: [],
            arguments: [],
        };
        if (this.done()) {
            return Ok(cmd);
        }
        const binRes = this.eatArgument();
        if (!binRes.ok) {
            return binRes;
        }
        cmd.bin = binRes.value.argument;
        while (!this.done()) {
            const { value: current } = this.current();
            this.step();
            switch (current.tag) {
                case "long_option": {
                    cmd.long_options.push(current.option);
                    break;
                }
                case "short_option": {
                    cmd.short_options.push(current.option);
                    break;
                }
                case "argument": {
                    cmd.arguments.push(current.argument);
                    break;
                }
                case "redirect_write": {
                    const res = this.eatArgument();
                    if (!res.ok) {
                        return res;
                    }
                    cmd.redirects.push({
                        tag: "write",
                        target: res.value.argument,
                    });
                    break;
                }
                case "redirect_append": {
                    const res = this.eatArgument();
                    if (!res.ok) {
                        return res;
                    }
                    cmd.redirects.push({
                        tag: "append",
                        target: res.value.argument,
                    });
                    break;
                }
            }
        }
        return Ok(cmd);
    }
}
