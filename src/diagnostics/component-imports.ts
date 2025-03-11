import * as ts from 'typescript';
import {
    extractTemplateText,
    getAllComponents,
    getUsedComponents,
    isComponentDefinedInFile,
    isComponentImported,
} from '../utils';

export const preserveComponentImports = (
    languageService: ts.LanguageService,
    typescript: typeof ts,
) => {
    const oldGetSemanticDiagnostics = languageService.getSemanticDiagnostics;
    languageService.getSemanticDiagnostics = (fileName: string) => {
        // Get base diagnostics.
        let baseDiags =
            oldGetSemanticDiagnostics.call(languageService, fileName) || [];
        const program = languageService.getProgram();
        if (!program) return baseDiags;
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) return baseDiags;

        // Filter out unused-import diagnostics for components used in HTML templates.
        // (Unused import errors are typically code 6133 or 6192.)
        const usedComponents = getUsedComponents(sourceFile, typescript);
        baseDiags = baseDiags.filter((diag) => {
            if (diag.code === 6133 || diag.code === 6192) {
                if (typeof diag.messageText === 'string') {
                    for (const comp of usedComponents) {
                        if (diag.messageText.includes(comp)) {
                            return false; // Remove this diagnostic.
                        }
                    }
                }
            }
            return true;
        });

        // Now add our plugin diagnostics for component usage in HTML templates.
        const pluginDiags: ts.Diagnostic[] = [];
        // Get the global list of known components.
        const allComponents = getAllComponents(program);
        // Walk the source file to find HTML tagged template literals.
        function visit(node: ts.Node) {
            if (typescript.isTaggedTemplateExpression(node)) {
                if (
                    typescript.isIdentifier(node.tag) &&
                    node.tag.text === 'html'
                ) {
                    const text = extractTemplateText(node, typescript);
                    if (text) {
                        // Regex to match HTML tags starting with an uppercase letter.
                        const regex = /<([A-Z][A-Za-z0-9]*)\b/g;
                        let match;
                        // biome-ignore lint:
                        while ((match = regex.exec(text)) !== null) {
                            const compName = match[1];
                            // Compute diagnostic start position relative to the file.
                            const templateStart = node.template.getStart() + 2; // Skip backtick.
                            const diagStart = templateStart + match.index;
                            if (
                                allComponents.some((c) => c.name === compName)
                            ) {
                                // Known component but not imported/defined.
                                if (
                                    !isComponentImported(
                                        sourceFile,
                                        compName,
                                    ) &&
                                    !isComponentDefinedInFile(
                                        sourceFile,
                                        compName,
                                    )
                                ) {
                                    const diag: ts.Diagnostic = {
                                        file: sourceFile,
                                        start: diagStart,
                                        length: compName.length,
                                        messageText: `Component <${compName}> is used in template but not imported.`,
                                        category:
                                            typescript.DiagnosticCategory.Error,
                                        code: 9999,
                                    };
                                    pluginDiags.push(diag);
                                }
                            } else {
                                // Unknown component.
                                const diag: ts.Diagnostic = {
                                    file: sourceFile,
                                    start: diagStart,
                                    length: compName.length,
                                    messageText: `Component <${compName}> does not exist.`,
                                    category:
                                        typescript.DiagnosticCategory.Error,
                                    code: 9998,
                                };
                                pluginDiags.push(diag);
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
