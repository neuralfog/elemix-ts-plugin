import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

class Logger {
    private file = path.join(
        os.homedir(),
        '.local',
        'elemix-ts-plugin',
        'logs.log',
    );

    constructor() {
        const directory = path.dirname(this.file);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
    }

    private log(label: string, message: unknown): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${label}][${timestamp}] ${JSON.stringify(message)}\n`;
        fs.appendFileSync(this.file, logEntry, { encoding: 'utf8' });
    }

    public info(message: unknown, label = 'INFO'): void {
        this.log(label, message);
    }
}

export const logger = new Logger();
