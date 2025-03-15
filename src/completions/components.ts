import * as ts from 'typescript';
import {
    findComponentAtCursor,
    getAllComponents,
    getTokenAtPosition,
    isInsideHtmlTemplate,
} from '../utils';
import { logger } from '../Logger';

export const autoCompleteComponentsInTemplate = (
    languageService: ts.LanguageService,
    typescript: typeof ts,
) => {
    const oldGetCompletionsAtPosition =
        languageService.getCompletionsAtPosition;

    languageService.getCompletionsAtPosition = (
        fileName,
        position,
        options,
    ) => {
        const program = languageService.getProgram();
        let prior = oldGetCompletionsAtPosition.call(
            languageService,
            fileName,
            position,
            options,
        );
        const sourceFile = program?.getSourceFile(fileName);
        if (
            sourceFile &&
            isInsideHtmlTemplate(sourceFile, position, typescript)
        ) {
            logger.log('Providing component completions...');
            const components = getAllComponents(program);
            const customEntries = components.map((comp) => ({
                name: comp.name,
                kind: typescript.ScriptElementKind.classElement,
                sortText: '0',
                insertText: comp.slots.length
                    ? `<${comp.name}></${comp.name}>`
                    : `<${comp.name} />`,
                data: {
                    isComponent: true,
                    name: comp.name,
                    file: comp.file,
                },
            }));
            if (prior?.entries) {
                prior.entries.push(...customEntries);
            } else {
                prior = {
                    isGlobalCompletion: false,
                    isMemberCompletion: false,
                    isNewIdentifierLocation: false,
                    entries: customEntries,
                };
            }
        }
        return prior;
    };
};

export const autoCompleteComponentProps = (
    languageService: ts.LanguageService,
    typescript: typeof ts,
) => {
    const oldGetCompletionsAtPosition =
        languageService.getCompletionsAtPosition;

    languageService.getCompletionsAtPosition = (
        fileName,
        position,
        options,
    ) => {
        try {
            const program = languageService.getProgram();
            if (!program) {
                return oldGetCompletionsAtPosition.call(
                    languageService,
                    fileName,
                    position,
                    options,
                );
            }
            const sourceFile = program.getSourceFile(fileName);
            if (
                !sourceFile ||
                !isInsideHtmlTemplate(sourceFile, position, typescript)
            ) {
                return oldGetCompletionsAtPosition.call(
                    languageService,
                    fileName,
                    position,
                    options,
                );
            }
            const prior = oldGetCompletionsAtPosition.call(
                languageService,
                fileName,
                position,
                options,
            );
            const token = getTokenAtPosition(sourceFile, position);
            if (!token) {
                return prior;
            }
            let templateExpr: ts.Node | undefined = token;
            while (
                templateExpr &&
                !ts.isTaggedTemplateExpression(templateExpr)
            ) {
                templateExpr = templateExpr.parent;
            }
            if (!templateExpr || !ts.isTaggedTemplateExpression(templateExpr)) {
                return prior;
            }
            const template = templateExpr.template;
            const fullText = template.getFullText();
            const templateStart = template.getStart();

            const { componentName } = findComponentAtCursor(
                fullText,
                position,
                templateStart,
            );
            if (!componentName) {
                return prior;
            }
            const components = getAllComponents(program);
            const component = components.find((c) => c.name === componentName);
            if (component?.props) {
                const propEntries = component.props.map((prop) => ({
                    name: `:${prop.key}`,
                    kind: typescript.ScriptElementKind.memberVariableElement,
                    sortText: '1',
                    insertText: `:${prop.key}=\${}`,
                }));
                prior.entries.push(...propEntries);
            }
            return prior;
        } catch (error) {
            return oldGetCompletionsAtPosition.call(
                languageService,
                fileName,
                position,
                options,
            );
        }
    };
};
