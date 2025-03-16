import * as ts from 'typescript';
import { getAllComponents, getUsedComponents, isComponentDefinedInFile, isComponentImported } from '../utils';

export const preserveComponentImports = (languageService: ts.LanguageService, typescript: typeof ts) => {
    const oldGetSemanticDiagnostics = languageService.getSemanticDiagnostics;
    languageService.getSemanticDiagnostics = (fileName: string) => {
        let baseDiags = oldGetSemanticDiagnostics.call(languageService, fileName) || [];
        const program = languageService.getProgram();
        if (!program) return baseDiags;
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) return baseDiags;

        // Filter out unused-import diagnostics for components used in HTML templates.
        const usedComponents = getUsedComponents(sourceFile, typescript);
        baseDiags = baseDiags.filter((diag) => {
            if (diag.code === 6133 || diag.code === 6192) {
                if (typeof diag.messageText === 'string') {
                    for (const comp of usedComponents) {
                        if (diag.messageText.includes(comp)) {
                            return false;
                        }
                    }
                }
            }
            return true;
        });

        const pluginDiags: ts.Diagnostic[] = [];
        const allComponents = getAllComponents(program);

        function visit(node: ts.Node) {
            if (
                typescript.isTaggedTemplateExpression(node) &&
                typescript.isIdentifier(node.tag) &&
                node.tag.text === 'html'
            ) {
                const templateNode = node.template;
                const templateText = templateNode.getText();
                const templateInnerStart = templateNode.getStart() + 1;
                if (templateText) {
                    const tagRegex = /<([A-Z][A-Za-z0-9]*)\b/g;
                    let tagMatch: RegExpExecArray | null;

                    // biome-ignore lint:
                    while ((tagMatch = tagRegex.exec(templateText)) !== null) {
                        const compName = tagMatch[1];
                        const diagStart = templateInnerStart + tagMatch.index;
                        if (allComponents.some((c) => c.name === compName)) {
                            if (
                                !isComponentImported(sourceFile, compName) &&
                                !isComponentDefinedInFile(sourceFile, compName)
                            ) {
                                const diag: ts.Diagnostic = {
                                    file: sourceFile,
                                    start: diagStart,
                                    length: compName.length,
                                    messageText: `Component <${compName}> is used in template but not imported.`,
                                    category: typescript.DiagnosticCategory.Error,
                                    code: 9999,
                                };
                                pluginDiags.push(diag);
                            }
                        } else {
                            const diag: ts.Diagnostic = {
                                file: sourceFile,
                                start: diagStart,
                                length: compName.length,
                                messageText: `Component <${compName}> does not exist.`,
                                category: typescript.DiagnosticCategory.Error,
                                code: 9998,
                            };
                            pluginDiags.push(diag);
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
