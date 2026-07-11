const l = console.log;
const stdout = process.stdout;
const stdin = process.stdin;
const readline = require("readline");

class PasswordPrompt {
    constructor(opts) {
        const { promptMsg = "password:", passMaxLength } = opts
        this.promptMsg = promptMsg
        this.passMaxLength = passMaxLength
        this.input = ''
        this.stdin = stdin
        this.self = this
    }
    start(cb) {
        return new Promise(resolve => {
            resolve = typeof cb == "function" ? cb : resolve;
            stdout.write(this.promptMsg)
            this.stdin.setRawMode(true)
            this.stdin.resume()
            this.stdin.setEncoding('utf-8')
            this.stdin.on("data", this.pn(this, resolve))
        });
    }
    pn(me, cb) {
        return (data) => {
            const c = data
            const self = me
            switch (c) {
                case '\u0004': // Ctrl-d
                case '\r':
                case '\n':
                    return self.enter(cb)
                case '\u0003': // Ctrl-c
                    return self.ctrlc()
                default:
                    // backspace
                    if (c.charCodeAt(0) === 8) return this.backspace()
                    else return self.newchar(c)
            }
        }
    }
    enter(cb) {
        stdin.removeListener('data', this.pn)
        stdin.setRawMode(false)
        stdin.pause()
        l("\n")
        cb(this.input)
    }
    ctrlc() {
        stdin.removeListener('data', this.pn)
        stdin.setRawMode(false)
        stdin.pause()
    }
    newchar(c) {
        if (this.input.length != this.passMaxLength) {
            this.input += c
            stdout.write("*")
        }
    }
    backspace() {
        const pslen = this.promptMsg.length
        readline.cursorTo(stdout, (pslen + this.input.length) - 1, 0)
        stdout.write(" ")
        readline.moveCursor(stdout, -1, 0)
        this.input = this.input.slice(0, this.input.length - 1)
    }
}
module.exports = PasswordPrompt