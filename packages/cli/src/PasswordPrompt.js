const stdout = process.stdout;
const stdin = process.stdin;
const readline = require("readline");

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE = 8;
const DEL = 127; // what the delete key actually sends on macOS/Linux

// Shared with prompt.js so masked and plain prompts draw from the SAME
// line queue on piped stdin — see src/stdin-lines.js for why.
const { readLineFromPipe } = require('./stdin-lines');

class PasswordPrompt {
    constructor(opts) {
        const { promptMsg = "password:", passMaxLength } = opts
        this.promptMsg = promptMsg
        this.passMaxLength = passMaxLength
        this.input = ''
        this.stdin = stdin
    }
    start(cb) {
        return new Promise(resolve => {
            resolve = typeof cb == "function" ? cb : resolve;
            // reset per call so the prompt is reusable (e.g. password confirmation)
            this.input = ''
            stdout.write(this.promptMsg)

            // Piped/scripted stdin (no TTY) can't do raw-mode masking —
            // read a plain line instead so non-interactive use still works
            // (e.g. printf "pw\n" | auth ...). Nothing is echoed anyway.
            if (!this.stdin.isTTY || typeof this.stdin.setRawMode !== 'function') {
                readLineFromPipe(this.stdin).then((line) => {
                    stdout.write('\n')
                    resolve(line)
                })
                return
            }

            this.stdin.setRawMode(true)
            this.stdin.resume()
            this.stdin.setEncoding('utf-8')
            this.listener = this.pn(this, resolve)
            this.stdin.on("data", this.listener)
        });
    }
    pn(me, cb) {
        return (data) => {
            const self = me
            // A data event can carry many characters at once (pasted input,
            // scripted stdin) — process each one, not the chunk as a "key".
            for (const c of data) {
                switch (c) {
                    case CTRL_D:
                    case '\r':
                    case '\n':
                        return self.enter(cb)
                    case CTRL_C:
                        return self.ctrlc()
                    default:
                        if (c.charCodeAt(0) === BACKSPACE || c.charCodeAt(0) === DEL) self.backspace()
                        else self.newchar(c)
                }
            }
        }
    }
    enter(cb) {
        stdin.removeListener('data', this.listener)
        stdin.setRawMode(false)
        stdin.pause()
        console.log("\n")
        cb(this.input)
    }
    ctrlc() {
        stdin.removeListener('data', this.listener)
        stdin.setRawMode(false)
        stdin.pause()
        process.exit(130)
    }
    newchar(c) {
        if (this.input.length != this.passMaxLength) {
            this.input += c
            stdout.write("*")
        }
    }
    backspace() {
        if (!this.input.length) return
        this.input = this.input.slice(0, this.input.length - 1)
        readline.moveCursor(stdout, -1, 0)
        stdout.write(" ")
        readline.moveCursor(stdout, -1, 0)
    }
}
module.exports = PasswordPrompt
