import type * as ts from 'typescript';
import type * as tsServer from 'typescript/lib/tsserverlibrary.js';
import { logger } from './Logger';
import {
    autoCompleteComponentProps,
    autoCompleteComponentsInTemplate,
} from './completions/components';
import { codeFixesComponentImports } from './code-actions/import-components';
import { preserveComponentImports } from './diagnostics/component-imports';
import { autoCompleteComponentHover } from './completions/componentInfo';

function init({
    typescript,
}: { typescript: typeof ts }): tsServer.server.PluginModule {
    return {
        create(info: tsServer.server.PluginCreateInfo) {
            logger.log('Plugin Initialized...');
            const languageService = info.languageService;
            const languageServiceHost = info.languageServiceHost;

            try {
                autoCompleteComponentsInTemplate(languageService, typescript);
                autoCompleteComponentProps(languageService, typescript);
                autoCompleteComponentHover(languageService, typescript);

                preserveComponentImports(languageService, typescript);

                codeFixesComponentImports(languageService);
            } catch (error) {
                logger.log(error, 'ERROR');
            }

            return languageService;
        },
    };
}

export = init;
