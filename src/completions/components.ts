import * as ts from 'typescript';
import {
    extractTemplateText,
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
            const prior = oldGetCompletionsAtPosition.call(
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
                const token = getTokenAtPosition(sourceFile, position);
                if (!token) {
                    return prior;
                }

                let templateExpression: ts.Node | undefined = token;
                while (
                    templateExpression &&
                    !ts.isTaggedTemplateExpression(templateExpression)
                ) {
                    templateExpression = templateExpression.parent;
                }
                if (
                    !templateExpression ||
                    !ts.isTaggedTemplateExpression(templateExpression)
                ) {
                    return prior;
                }

                const templateStart = templateExpression.template.getStart();
                const templateText = extractTemplateText(
                    templateExpression,
                    typescript,
                );
                if (!templateText) {
                    return prior;
                }

                // First try: get component info at current position.
                let { componentName, insideTag } = findComponentAtCursor(
                    templateText,
                    position,
                    templateStart,
                );
                // If not detected as "inside" but we do have a component name,
                // try adjusting the position by 1 to catch cases when caret is at the very end.
                if (!insideTag && componentName) {
                    const adjusted = findComponentAtCursor(
                        templateText,
                        position - 1,
                        templateStart,
                    );
                    if (adjusted.insideTag) {
                        componentName = adjusted.componentName;
                        insideTag = true;
                    }
                }

                if (insideTag && componentName) {
                    const components = getAllComponents(program);
                    const component = components.find(
                        (c) => c.name === componentName,
                    );
                    if (component?.props) {
                        const propEntries = component.props.map((prop) => ({
                            name: `:${prop.key}`,
                            kind: typescript.ScriptElementKind
                                .memberVariableElement,
                            sortText: '1',
                            insertText: `:${prop.key}=\${}`,
                        }));
                        prior.entries.push(...propEntries);
                    }
                }
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
