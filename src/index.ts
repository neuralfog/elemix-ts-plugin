import * as ts from 'typescript';
import type * as tsServer from 'typescript/lib/tsserverlibrary.js';
import { logger } from './Logger';
import * as path from 'node:path';

type ComponentInfo = {
    name: string;
    file: string;
};

const getFiles = (program: ts.Program): ts.SourceFile[] => {
    return program
        .getSourceFiles()
        .filter(
            (sf) =>
                !sf.fileName.includes('node_modules') &&
                !sf.fileName.endsWith('.d.ts'),
        );
};

const isComponentClass = (node: ts.Node): node is ts.ClassDeclaration => {
    if (!node || !ts.isClassDeclaration(node)) return false;
    const decorators = ts.getDecorators(node);
    return (
        !!decorators &&
        decorators.some((dec) => {
            if (ts.isCallExpression(dec.expression)) {
                return (
                    ts.isIdentifier(dec.expression.expression) &&
                    dec.expression.expression.text === 'component'
                );
            }
            return false;
        })
    );
};

const getAllComponents = (program: ts.Program): ComponentInfo[] => {
    const components: ComponentInfo[] = [];
    for (const sourceFile of program.getSourceFiles()) {
        ts.forEachChild(sourceFile, function visit(node) {
            if (isComponentClass(node) && node.name) {
                components.push({
                    name: node.name.text,
                    file: sourceFile.fileName,
                });
            }
            ts.forEachChild(node, visit);
        });
    }
    return components;
};

const getTokenAtPosition = (
    sourceFile: ts.SourceFile,
    position: number,
): ts.Node | undefined => {
    function find(node: ts.Node): ts.Node | undefined {
        if (position >= node.getFullStart() && position < node.getEnd()) {
            let found: ts.Node | undefined;
            node.forEachChild((child) => {
                const result = find(child);
                if (result) {
                    found = result;
                }
            });
            return found || node;
        }
        return undefined;
    }
    return find(sourceFile);
};

const isInsideHtmlTemplate = (
    sourceFile: ts.SourceFile,
    position: number,
    ts: typeof import('typescript'),
): boolean => {
    const token = getTokenAtPosition(sourceFile, position);
    if (!token) return false;
    let node: ts.Node | undefined = token;
    while (node) {
        if (ts.isTaggedTemplateExpression(node)) {
            if (ts.isIdentifier(node.tag) && node.tag.text === 'html') {
                return true;
            }
        }
        node = node.parent;
    }
    return false;
};

const isComponentImported = (
    sourceFile: ts.SourceFile,
    componentName: string,
): boolean => {
    let imported = false;
    sourceFile.forEachChild((node) => {
        if (ts.isImportDeclaration(node) && node.importClause) {
            const { namedBindings } = node.importClause;
            if (namedBindings && ts.isNamedImports(namedBindings)) {
                for (const element of namedBindings.elements) {
                    if (element.name.text === componentName) {
                        imported = true;
                    }
                }
            }
            // Also consider default imports if applicable:
            if (
                node.importClause.name &&
                node.importClause.name.text === componentName
            ) {
                imported = true;
            }
        }
    });
    return imported;
};

const isComponentDefinedInFile = (
    sourceFile: ts.SourceFile,
    componentName: string,
): boolean => {
    let defined = false;
    sourceFile.forEachChild((node) => {
        if (
            ts.isClassDeclaration(node) &&
            node.name &&
            node.name.text === componentName
        ) {
            defined = true;
        }
    });
    return defined;
};

const getImportPath = (currentFile: string, targetFile: string): string => {
    let relativePath = path.relative(path.dirname(currentFile), targetFile);
    relativePath = relativePath.replace(/\.[tj]sx?$/, '');
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
};

const extractTemplateText = (
    node: ts.TaggedTemplateExpression,
    ts: typeof import('typescript'),
): string | undefined => {
    if (ts.isNoSubstitutionTemplateLiteral(node.template)) {
        return node.template.text;
    }

    if (ts.isTemplateExpression(node.template)) {
        let text = node.template.head.text;
        for (const span of node.template.templateSpans) {
            text += span.literal.text;
        }
        return text;
    }
    return undefined;
};

const getUsedComponents = (
    sourceFile: ts.SourceFile,
    ts: typeof import('typescript'),
): Set<string> => {
    const used = new Set<string>();
    function visit(node: ts.Node) {
        if (ts.isTaggedTemplateExpression(node)) {
            if (ts.isIdentifier(node.tag) && node.tag.text === 'html') {
                const text = extractTemplateText(node, ts);
                if (text) {
                    const regex = /<([A-Z][A-Za-z0-9]*)\b/g;
                    let match;
                    // biome-ignore lint:
                    while ((match = regex.exec(text)) !== null) {
                        used.add(match[1]);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return used;
};

function init({
    typescript,
}: { typescript: typeof ts }): tsServer.server.PluginModule {
    return {
        create(info: tsServer.server.PluginCreateInfo) {
            logger.info('Plugin Initialized...');
            const languageService = info.languageService;

            // Override completions provider.
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
                    const components = getAllComponents(program);
                    logger.info(
                        `Found components: ${JSON.stringify(components)}`,
                    );
                    const customEntries = components.map((comp) => ({
                        name: comp.name,
                        kind: typescript.ScriptElementKind.classElement,
                        sortText: '0',
                        // When accepted, insert a tag pair (e.g. <Test1></Test1>)
                        // Would be nice to have self closing completion for components
                        insertText: `<${comp.name}></${comp.name}>`,
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

            // Override semantic diagnostics.
            const oldGetSemanticDiagnostics =
                languageService.getSemanticDiagnostics;
            languageService.getSemanticDiagnostics = (fileName: string) => {
                // Get base diagnostics.
                let baseDiags =
                    oldGetSemanticDiagnostics.call(languageService, fileName) ||
                    [];
                const program = languageService.getProgram();
                if (!program) return baseDiags;
                const sourceFile = program.getSourceFile(fileName);
                if (!sourceFile) return baseDiags;

                // Filter out unused-import diagnostics for components used in HTML templates.
                // (Unused import errors are typically code 6133 or 6192.)
                const usedComponents = getUsedComponents(
                    sourceFile,
                    typescript,
                );
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
                                    const templateStart =
                                        node.template.getStart() + 2; // Skip backtick.
                                    const diagStart =
                                        templateStart + match.index;
                                    if (
                                        allComponents.some(
                                            (c) => c.name === compName,
                                        )
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
                                                    typescript
                                                        .DiagnosticCategory
                                                        .Error,
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
                                                typescript.DiagnosticCategory
                                                    .Error,
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

            return languageService;
        },
    };
}

export = init;
