import * as ts from 'typescript';
import { getAllComponents } from '../utils';

type ExpressionMapping = {
    start: number;
    end: number;
    expression: ts.Expression;
    component?: string;
    prop?: string;
};

export const validateProps = (languageService: ts.LanguageService, typescript: typeof ts) => {
    const oldGetSemanticDiagnostics = languageService.getSemanticDiagnostics;
    languageService.getSemanticDiagnostics = (fileName: string) => {
        const baseDiags = oldGetSemanticDiagnostics.call(languageService, fileName) || [];

        const program = languageService.getProgram();
        if (!program) return baseDiags;
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) return baseDiags;

        const pluginDiags: ts.Diagnostic[] = [];
        const allComponents = getAllComponents(program);

        // extract to utils
        function isNestedHTML(node: ts.Node): boolean {
            let current = node.parent;
            while (current) {
                if (
                    typescript.isTaggedTemplateExpression(current) &&
                    typescript.isIdentifier(current.tag) &&
                    current.tag.text === 'html'
                ) {
                    return true;
                }
                current = current.parent;
            }
            return false;
        }

        function visit(node: ts.Node) {
            if (
                typescript.isTaggedTemplateExpression(node) &&
                typescript.isIdentifier(node.tag) &&
                node.tag.text === 'html' &&
                !isNestedHTML(node)
            ) {
                const templateNode = node.template;
                const templateFullText = templateNode.getFullText();
                if (templateFullText) {
                    const tagRegex = /<([A-Z][A-Za-z0-9]*)\b([^>]*)>/g;
                    let tagMatch: RegExpExecArray | null;

                    // biome-ignore lint:
                    while ((tagMatch = tagRegex.exec(templateFullText)) !== null) {
                        const compName = tagMatch[1];
                        const attrString = tagMatch[2].trim();

                        const providedProps = new Set<string>();
                        const attrRegex = /:(\w+)=/g;
                        let m: RegExpExecArray | null;

                        // biome-ignore lint:
                        while ((m = attrRegex.exec(attrString)) !== null) {
                            providedProps.add(m[1].trim());
                        }

                        const component = allComponents.find((c) => c.name === compName);
                        if (component?.props) {
                            for (const prop of component.props) {
                                if (!prop.optional && !providedProps.has(prop.key)) {
                                    pluginDiags.push({
                                        file: sourceFile,
                                        start: templateNode.getStart() + tagMatch.index + 1,
                                        length: compName.length,
                                        messageText: `Component <${compName}> is missing required prop ':${prop.key}'.`,
                                        category: typescript.DiagnosticCategory.Error,
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

export const validatePropsTypes = (languageService: ts.LanguageService, typescript: typeof ts) => {
    const oldGetSemanticDiagnostics = languageService.getSemanticDiagnostics;
    languageService.getSemanticDiagnostics = (fileName: string) => {
        const baseDiags = oldGetSemanticDiagnostics.call(languageService, fileName) || [];
        const program = languageService.getProgram();
        if (!program) return baseDiags;
        const sourceFile = program.getSourceFile(fileName);
        if (!sourceFile) return baseDiags;

        const pluginDiags: ts.Diagnostic[] = [];
        const allComponents = getAllComponents(program);
        const checker = program.getTypeChecker();

        // extract to utils
        function isWhitespace(char: string): boolean {
            return char === ' ' || char === '\t' || char === '\n' || char === '\r';
        }

        function visit(node: ts.Node) {
            if (
                typescript.isTaggedTemplateExpression(node) &&
                typescript.isIdentifier(node.tag) &&
                node.tag.text === 'html'
            ) {
                const templateText = node.template.getText();

                const expressionMapping: ExpressionMapping[] = [];
                const templateNode = node.template;
                const templateStart = templateNode.getStart();
                if (typescript.isTemplateExpression(templateNode)) {
                    for (const span of templateNode.templateSpans) {
                        const spanStart = span.getStart() - templateStart;
                        const spanEnd = span.getEnd() - templateStart;
                        expressionMapping.push({
                            start: spanStart,
                            end: spanEnd,
                            expression: span.expression,
                        });
                    }
                }

                for (const expression of expressionMapping) {
                    const part = templateText.slice(0, expression.start);

                    let token = '';
                    let i = part.length - 1;
                    while (i >= 0 && !isWhitespace(part[i])) {
                        token = part[i] + token;
                        i--;
                    }
                    if (!token.startsWith(':') || token.indexOf('=') === -1) continue;
                    const prop = token.slice(1, token.indexOf('='));

                    const lastBracketIndex = part.lastIndexOf('<');
                    if (lastBracketIndex === -1) continue;
                    let component = '';
                    let j = lastBracketIndex + 1;
                    while (j < part.length && !isWhitespace(part[j])) {
                        component += part[j];
                        j++;
                    }

                    expression.prop = prop;
                    expression.component = component;
                }

                for (const mapping of expressionMapping) {
                    if (mapping.component && mapping.prop) {
                        const compInfo = allComponents.find((c) => c.name === mapping.component);
                        if (compInfo?.props) {
                            const propInfo = compInfo.props.find((p) => p.key === mapping.prop);
                            if (propInfo) {
                                const providedType = checker.getTypeAtLocation(mapping.expression);
                                const expectedType = propInfo.typeObject;
                                if (!checker.isTypeAssignableTo(providedType, expectedType)) {
                                    const diagStart = node.getStart() + mapping.start - mapping.prop.length + 1;
                                    pluginDiags.push({
                                        file: sourceFile,
                                        start: diagStart,
                                        length: mapping.prop.length,
                                        messageText: `Type mismatch for prop ':${mapping.prop}' on <${mapping.component}>. Expected ${propInfo.type}, but got ${checker.typeToString(providedType)}.`,
                                        category: typescript.DiagnosticCategory.Error,
                                        code: 9998,
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
