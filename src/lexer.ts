export type Token = {
    index: number
    length: number
    value?: string
    option?: string
    command?: string
}

export interface Command {
    args: Token[]
    run(): string | void
}

export class CommandLexer {
    private index = 0

    public constructor(private text: string) {

    }

    private done(): boolean {
        return this.index >= this.text.length
    }

    private current(): string {
        return this.text[this.index]
    }

    private step() {
        if (this.done()) {
            return
        }
        this.index++
    }

    private test(pattern: RegExp | string): boolean {
        if (typeof pattern === "string") {
            return this.current() === pattern;
        } else {
            return pattern.test(this.current());
        }
    }

    public next(): Token[] | null {
        if (this.done()) {
            return null
        }


        return []
    }




}


