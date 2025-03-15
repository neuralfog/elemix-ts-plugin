import * as ts from 'typescript';
import { extractTemplateText, getAllComponents } from '../utils';

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
                const templateText = extractTemplateText(node, typescript);
                if (templateText) {
                    // Regex to match component tags (e.g. <Test1 ...>)
                    // Group 1: component name; Group 2: attribute string.
                    const tagRegex = /<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g;
                    let tagMatch: RegExpExecArray | null;
                    // biome-ignore lint:
                    while ((tagMatch = tagRegex.exec(templateText)) !== null) {
                        const compName = tagMatch[1];
                        const attrString = tagMatch[2].trim();

                        // Use a simpler regex to capture provided prop keys by matching :word=
                        const providedProps = new Set<string>();
                        const attrRegex = /:(\w+)=/g;
                        let attrMatch: RegExpExecArray | null;
                        while (
                            // biome-ignore lint:
                            (attrMatch = attrRegex.exec(attrString)) !== null
                        ) {
                            providedProps.add(attrMatch[1].trim());
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
                                    const start =
                                        node.getStart() +
                                        tagMatch.index +
                                        compName.length +
                                        1;

                                    pluginDiags.push({
                                        file: sourceFile,
                                        start,
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
