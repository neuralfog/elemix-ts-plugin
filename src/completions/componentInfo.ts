import * as ts from 'typescript';
import {
    findFullComponentAtCursor,
    getAllComponents,
    getImportPath,
    getTokenAtPosition,
    isInsideHtmlTemplate,
} from '../utils';

export const autoCompleteComponentHover = (
    languageService: ts.LanguageService,
    typescript: typeof ts,
) => {
    const oldGetQuickInfoAtPosition = languageService.getQuickInfoAtPosition;

    languageService.getQuickInfoAtPosition = (fileName, position) => {
        const program = languageService.getProgram();
        if (!program) {
            return oldGetQuickInfoAtPosition.call(
                languageService,
                fileName,
                position,
            );
        }
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) {
            return oldGetQuickInfoAtPosition.call(
                languageService,
                fileName,
                position,
            );
        }

        if (isInsideHtmlTemplate(sourceFile, position, typescript)) {
            const token = getTokenAtPosition(sourceFile, position);
            if (!token) {
                return oldGetQuickInfoAtPosition.call(
                    languageService,
                    fileName,
                    position,
                );
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
                return oldGetQuickInfoAtPosition.call(
                    languageService,
                    fileName,
                    position,
                );
            }

            const templateNode = templateExpression.template;
            const templateFullText = templateNode.getFullText();
            const templateStart = templateNode.getStart();

            const { componentName, insideTag } = findFullComponentAtCursor(
                templateFullText,
                position,
                templateStart,
            );

            if (insideTag && componentName) {
                const components = getAllComponents(program);
                const component = components.find(
                    (c) => c.name === componentName,
                );
                if (component) {
                    let helpText = `(alias) class ${component.name}\n\n`;
                    if (component.props) {
                        helpText += 'Props:\n';
                        for (const prop of component.props) {
                            helpText += `  • ${prop.key}${prop.optional ? '?' : ''}: ${prop.type}\n`;
                        }
                    }
                    if (component?.slots.length) {
                        helpText += 'Slots:\n';
                        for (const slot of component.slots) {
                            helpText += `  • ${slot}\n`;
                        }
                    }
                    helpText += `\nimport { ${component.name} } from '${getImportPath(fileName, component.file)}';`;

                    const displayParts: ts.SymbolDisplayPart[] = [
                        { text: helpText, kind: 'text' },
                    ];
                    return {
                        kind: typescript.ScriptElementKind.classElement,
                        kindModifiers: 'export',
                        textSpan: {
                            start: token.getStart(),
                            length: token.getWidth(),
                        },
                        displayParts,
                        documentation: displayParts,
                    };
                }
            }
        }

        return oldGetQuickInfoAtPosition.call(
            languageService,
            fileName,
            position,
        );
    };
};
