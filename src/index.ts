import * as ts from 'typescript';
import * as tsServer from 'typescript/lib/tsserverlibrary.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

function logToFile(logFilePath: string, message: string): void {
    // Ensure the directory exists
    const directory = path.dirname(logFilePath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    try {
        fs.appendFileSync(logFilePath, logEntry, { encoding: 'utf8' });
    } catch (err) {}
}

const logFile = '/home/brownhounds/logs.log';

function init({
    typescript,
}: { typescript: typeof ts }): tsServer.server.PluginModule {
    logToFile(logFile, 'This is a test log message from Node TS.');
    return {
        create: (info: tsServer.server.PluginCreateInfo) => {
            info.project.projectService.logger.info(
                '[elemix-ts-plugin] ======================================= HELLO THERE =======================================',
            );
            return info.languageService;
        },
    };
}

export = init;
