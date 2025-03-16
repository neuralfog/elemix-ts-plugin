import type * as ts from 'typescript';
import type * as tsServer from 'typescript/lib/tsserverlibrary.js';
import { autoCompleteComponentProps, autoCompleteComponentsInTemplate } from './completions/components';
import { codeFixesComponentImports } from './code-actions/import-components';
import { preserveComponentImports } from './diagnostics/component-imports';
import { autoCompleteComponentHover } from './completions/componentInfo';
import { validateProps, validatePropsTypes } from './diagnostics/component-props';

function init({ typescript }: { typescript: typeof ts }): tsServer.server.PluginModule {
    return {
        create(info: tsServer.server.PluginCreateInfo) {
            const languageService = info.languageService;

            autoCompleteComponentsInTemplate(languageService, typescript);
            autoCompleteComponentProps(languageService, typescript);
            autoCompleteComponentHover(languageService, typescript);

            preserveComponentImports(languageService, typescript);

            codeFixesComponentImports(languageService);
            validateProps(languageService, typescript);
            validatePropsTypes(languageService, typescript);

            return languageService;
        },
    };
}

export = init;
