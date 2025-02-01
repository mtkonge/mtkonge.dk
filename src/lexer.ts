import { Err, Ok, Result } from "./results.ts";

export type Token = {
    index: number
    length: number
    value: Option | Argument | string
}

export type Option = {
    single?: string
    multiple?: string
}

export type Argument = {
    value: string
}

export class CommandLexer {
    private currentIndex = 0

    public constructor(private text: string) {

    }

    public done(): boolean {
        return this.currentIndex >= this.text.length
    }

    private current(): string {
        return this.text[this.currentIndex]
    }

    private step() {
        if (this.done()) {
            return
        }
        this.currentIndex++
    }

    private test(pattern: RegExp | string): boolean {
        if (typeof pattern === "string") {
            return this.current() === pattern;
        } else {
            return pattern.test(this.current());
        }
    }

    private token(index: number, value: Option | Argument | string): Token {
        const length = this.currentIndex - index;
        return { index, length, value };
    }

    public next(): Result<Token | null, string> {
        if (this.done()) {
            return Ok(null)
        }
        const index = this.currentIndex
        if (this.test(/[ \t\n\r/]/)) {
            while (!this.done() && this.test(" ")) {
                this.step()
            }
            return this.next()
        }
        if (this.test(/[a-zA-Z0-9_\.\/]/)) {
            let argument = "" 
            while (!this.done() && this.test(/[a-zA-Z0-9_\./-]/)) {
                argument += this.current()
                this.step()
            }
            return Ok(this.token(index, {value: argument}))
        }
        if (this.test(/[-]/)) {
            let option = ""
            this.step()
            if (!this.done() && this.test(/[-]/)) {
                while (!this.done() && this.test(/[a-zA-Z0-9_\./-]/)) {
                    option += this.current()
                    this.step()
                }
                return Ok(this.token(index, {single: option}))
            }
            if (!this.done()) {
                while (!this.done() && this.test(/[a-zA-Z0-9_\./-]/)) {
                    option += this.current()
                    this.step()
                }
                return Ok(this.token(index, {multiple: option}))
            }
            return Err(`Trailing '${this.current()}' at index ${this.currentIndex}`);
        }

        if (this.test(/["']/)) {
            const stringType = this.current()
            this.step()
            let value = ""
            while(!this.done() && !this.test(stringType)) {
                if (this.test("\\")) {
                    this.step()
                    if (this.done()) {
                        break;
                    }
                    value += {
                        n: "\n",
                        t: "\t",
                        "0": "\0"
                    }[this.current()] ?? this.current()
                } else {
                    value += this.current();
                }
                this.step()
            }
            if (this.done() || !this.test(stringType)) {
                return Err(`unclosed/malformed string at index ${this.currentIndex}`);
            }
            this.step()
            return Ok(this.token(index, value))
        }
        return Err(`Illegal character '${this.current()}' at index ${this.currentIndex}`);
    }




}


