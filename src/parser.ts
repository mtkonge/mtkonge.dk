import { Argument, CommandLexer } from "./lexer.ts";
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
    public constructor(private lexer: CommandLexer) {
    }

    private eatArgument(): Result<Argument, string> {
        const res = this.lexer.next();
        if (!res.ok) {
            return res;
        }
        if (res.value === null) {
            return Err(
                "expected argument, got null",
            );
        }
        const { value: token, index } = res.value;
        if (token.tag !== "argument") {
            return Err(
                `expected argument at ${index}, got '${token.tag}'`,
            );
        }
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
        const binRes = this.eatArgument();
        if (!binRes.ok) {
            return binRes;
        }
        if (binRes.value === null) {
            return Ok(cmd);
        }
        cmd.bin = binRes.value.argument;
        while (true) {
            const tokenRes = this.lexer.next();
            if (!tokenRes.ok) {
                return tokenRes;
            }
            if (tokenRes.value === null) {
                return Ok(cmd);
            }
            const current = tokenRes.value.value;
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
    }
}
