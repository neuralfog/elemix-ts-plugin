import * as ts from 'typescript';
import { getAllComponents } from '../utils';

export const validateProps = (
    languageService: ts.LanguageService,
    typescript: typeof ts,
) => {
    const oldGetSemanticDiagnostics = languageService.getSemanticDiagnostics;
    languageService.getSemanticDiagnostics = (fileName: string) => {
        const baseDiags =
            oldGetSemanticDiagnostics.call(languageService, fileName) || [];

        const program = languageService.getProgram();
        if (!program) return baseDiags;
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) return baseDiags;

        const pluginDiags: ts.Diagnostic[] = [];
        const allComponents = getAllComponents(program);

        function visit(node: ts.Node) {
            if (
                typescript.isTaggedTemplateExpression(node) &&
                typescript.isIdentifier(node.tag) &&
                node.tag.text === 'html'
            ) {
                const templateNode = node.template;
                const templateFullText = templateNode.getFullText();
                if (templateFullText) {
                    const tagRegex = /<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g;
                    let tagMatch: RegExpExecArray | null;
                    while (
                        // biome-ignore lint:
                        (tagMatch = tagRegex.exec(templateFullText)) !== null
                    ) {
                        const compName = tagMatch[1];
                        const attrString = tagMatch[2].trim();

                        const providedProps = new Set<string>();
                        const attrRegex = /:(\w+)=/g;
                        let m: RegExpExecArray | null;

                        // biome-ignore lint:
                        while ((m = attrRegex.exec(attrString)) !== null) {
                            providedProps.add(m[1].trim());
                        }

                        const component = allComponents.find(
                            (c) => c.name === compName,
                        );
                        if (component?.props) {
                            for (const prop of component.props) {
                                if (
                                    !prop.optional &&
                                    !providedProps.has(prop.key)
                                ) {
                                    pluginDiags.push({
                                        file: sourceFile,
                                        start:
                                            templateNode.getStart() +
                                            tagMatch.index +
                                            1,
                                        length: compName.length,
                                        messageText: `Component <${compName}> is missing required prop ':${prop.key}'.`,
                                        category:
                                            typescript.DiagnosticCategory.Error,
                                        code: 9997,
                                    });
                                }
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(sourceFile);
        return [...baseDiags, ...pluginDiags];
    };
};
