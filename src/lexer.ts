import { Err, Ok, Result } from "./results.ts";

export type Token = {
    index: number;
    length: number;
    value:
        | LongOption
        | ShortOption
        | Argument
        | RedirectWrite
        | RedirectAppend;
};

export type RedirectWrite = {
    tag: "redirect_write";
};

export type RedirectAppend = {
    tag: "redirect_append";
};

export type LongOption = {
    tag: "long_option";
    option: string;
};

export type ShortOption = {
    tag: "short_option";
    option: string;
};

export type Argument = {
    tag: "argument";
    argument: string;
};

export class CommandLexer {
    private currentIndex = 0;

    public constructor(private text: string) {
    }

    public done(): boolean {
        return this.currentIndex >= this.text.length;
    }

    private current(): string {
        return this.text[this.currentIndex];
    }

    private step() {
        if (this.done()) {
            return;
        }
        this.currentIndex++;
    }

    private test(pattern: RegExp | string): boolean {
        if (typeof pattern === "string") {
            return this.current() === pattern;
        } else {
            return pattern.test(this.current());
        }
    }

    private token(index: number, value: Token["value"]): Token {
        const length = this.currentIndex - index;
        return { index, length, value };
    }

    private eatValue(valueCharacters: RegExp | string): Result<string, string> {
        let value = "";
        while (!this.done() && this.test(valueCharacters)) {
            if (this.test("\\")) {
                this.step();
                if (this.done()) {
                    return Err("Encountered '\\' without value after");
                }
                value += this.current();
                this.step();
                continue;
            }
            value += this.current();
            this.step();
        }
        return Ok(value);
    }

    public next(): Result<Token | null, string> {
        if (this.done()) {
            return Ok(null);
        }
        const index = this.currentIndex;
        if (this.test(/\s/)) {
            while (!this.done() && this.test(/\s/)) {
                this.step();
            }
            return this.next();
        }
        const argChars = /[^>\s]/;
        if (this.test("-")) {
            this.step();

            let tag: Token["value"]["tag"] = "short_option";
            if (!this.done() && this.test("-")) {
                this.step();
                tag = "long_option";
            }
            if (!this.done()) {
                const res = this.eatValue(argChars);
                if (!res.ok) {
                    return Err(res.error);
                }
                return Ok(
                    this.token(index, {
                        tag,
                        option: res.value,
                    }),
                );
            }
            return Err(
                `Option without value at index ${this.currentIndex}`,
            );
        }

        if (this.test(">")) {
            this.step();

            let tag: Token["value"]["tag"] = "redirect_write";
            if (!this.done() && this.test(">")) {
                this.step();
                tag = "redirect_append";
            }
            return Ok(
                this.token(index, {
                    tag,
                }),
            );
        }

        if (this.test(/["']/)) {
            const quoteType = this.current();
            this.step();
            let argument = "";
            while (!this.done() && !this.test(quoteType)) {
                if (this.test("\\")) {
                    this.step();
                    if (this.done()) {
                        break;
                    }
                    argument += {
                        n: "\n",
                        t: "\t",
                        "0": "\0",
                    }[this.current()] ?? this.current();
                } else {
                    argument += this.current();
                }
                this.step();
            }
            if (this.done() || !this.test(quoteType)) {
                return Err(
                    `Unclosed/malformed string at index ${this.currentIndex}`,
                );
            }
            this.step();
            return Ok(
                this.token(index, { tag: "argument", argument }),
            );
        }

        if (this.test(argChars)) {
            const res = this.eatValue(argChars);
            if (!res.ok) {
                return Err(res.error);
            }
            return Ok(
                this.token(index, { tag: "argument", argument: res.value }),
            );
        }

        const current = this.current();
        const currentIndex = this.currentIndex;
        this.step();
        return Err(
            `Illegal character '${current}' at index ${currentIndex}`,
        );
    }
}
