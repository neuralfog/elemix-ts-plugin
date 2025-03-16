import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { inspect } from 'node:util';

class Logger {
    private file = path.join(os.homedir(), '.local', 'elemix-ts-plugin', 'logs.log');

    constructor() {
        const directory = path.dirname(this.file);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }

    private formatMessage(message: unknown): string {
        if (message instanceof Error) {
            return message.stack || message.message;
        }
        return typeof message === 'object' ? inspect(message, { depth: null }) : String(message);
    }

    private $log(label: string, message: unknown): void {
        const timestamp = new Date().toISOString();
        const output = this.formatMessage(message);
        const logEntry = `[${label}][${timestamp}] ${output}\n`;
        fs.appendFileSync(this.file, logEntry, { encoding: 'utf8' });
    }

    public log(message: unknown, label = 'INFO'): void {
        this.$log(label, message);
    }
}

export const logger = new Logger();
