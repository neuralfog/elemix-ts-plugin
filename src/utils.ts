import * as ts from 'typescript';
import * as path from 'node:path';

type ComponentInfo = {
    name: string;
    file: string;
    props?: PropInfo[];
    slots?: string[];
};

type PropInfo = {
    key: string;
    type: string;
    typeObject: ts.Type;
    optional: boolean;
};

export const getComponentGenericType = (node: ts.ClassDeclaration, checker: ts.TypeChecker): PropInfo[] | undefined => {
    if (!node.heritageClauses) return undefined;

    for (const heritage of node.heritageClauses) {
        if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
            const typeNode = heritage.types[0];
            if (
                ts.isExpressionWithTypeArguments(typeNode) &&
                typeNode.typeArguments &&
                typeNode.typeArguments.length === 1
            ) {
                return getTypeProperties(typeNode.typeArguments[0], checker);
            }
        }
    }
    return undefined;
};

export const getAllComponents = (program: ts.Program): ComponentInfo[] => {
    const checker = program.getTypeChecker();
    const components: ComponentInfo[] = [];

    for (const sourceFile of program.getSourceFiles()) {
        ts.forEachChild(sourceFile, function visit(node) {
            if (isComponentClass(node) && node.name) {
                components.push({
                    name: node.name.text,
                    file: sourceFile.fileName,
                    props: getComponentGenericType(node, checker),
                    slots: getComponentSlots(node, ts),
                });
            }
            ts.forEachChild(node, visit);
        });
    }
    return components;
};

const getComponentSlots = (node: ts.ClassDeclaration, ts: typeof import('typescript')): string[] => {
    const slotsSet = new Set<string>();

    function visit(child: ts.Node) {
        if (ts.isTaggedTemplateExpression(child)) {
            const templateText = extractTemplateText(child, ts);
            if (templateText) {
                const slotRegex = /<slot\b([^>]*)>/g;
                let match: RegExpExecArray | null;
                // biome-ignore lint:
                while ((match = slotRegex.exec(templateText)) !== null) {
                    const attributes = match[1];
                    const nameMatch = /name\s*=\s*"([^"]+)"/.exec(attributes);
                    if (nameMatch) {
                        slotsSet.add(nameMatch[1]);
                    } else {
                        slotsSet.add('default');
                    }
                }
            }
        }
        ts.forEachChild(child, visit);
    }
    visit(node);
    return Array.from(slotsSet);
};

function getTypeProperties(typeNode: ts.TypeNode, checker: ts.TypeChecker): PropInfo[] {
    const props: PropInfo[] = [];
    const type = checker.getTypeFromTypeNode(typeNode);

    for (const prop of type.getProperties()) {
        // Skip properties without a declaration.
        if (!prop.valueDeclaration) continue;
        const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);

        const isOptional =
            (prop.getFlags() & ts.SymbolFlags.Optional) !== 0 ||
            (propType.isUnion() && propType.types.some((t) => (t.flags & ts.TypeFlags.Undefined) !== 0));

        props.push({
            key: prop.getName(),
            type: checker.typeToString(propType),
            typeObject: propType,
            optional: isOptional,
        });
    }
    return props;
}

const isComponentClass = (node: ts.Node): node is ts.ClassDeclaration => {
    if (!node || !ts.isClassDeclaration(node)) return false;
    const decorators = ts.getDecorators(node);
    return (
        !!decorators &&
        decorators.some((dec) => {
            if (ts.isCallExpression(dec.expression)) {
                return ts.isIdentifier(dec.expression.expression) && dec.expression.expression.text === 'component';
            }
            return false;
        })
    );
};

export const getTokenAtPosition = (sourceFile: ts.SourceFile, position: number): ts.Node | undefined => {
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

export const isInsideHtmlTemplate = (
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

export const extractTemplateText = (
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

export const findComponentAtCursor = (
    fullTemplateText: string,
    position: number,
    templateStart: number,
): { componentName: string | null } => {
    const relativePos = position - templateStart;
    if (relativePos < 0 || relativePos > fullTemplateText.length) {
        return { componentName: null };
    }
    const textBefore = fullTemplateText.substring(0, relativePos);
    const lastLt = textBefore.lastIndexOf('<');
    if (lastLt === -1) {
        return { componentName: null };
    }
    const gtIndex = fullTemplateText.indexOf('>', lastLt);
    const tagFragment = gtIndex !== -1 ? fullTemplateText.substring(lastLt, gtIndex + 1) : textBefore.substring(lastLt);

    const match = /^<\s*([A-Z][A-Za-z0-9]*)/.exec(tagFragment);
    return { componentName: match ? match[1] : null };
};

export const isComponentImported = (sourceFile: ts.SourceFile, componentName: string): boolean => {
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
            if (node.importClause.name && node.importClause.name.text === componentName) {
                imported = true;
            }
        }
    });
    return imported;
};

export const isComponentDefinedInFile = (sourceFile: ts.SourceFile, componentName: string): boolean => {
    let defined = false;
    sourceFile.forEachChild((node) => {
        if (ts.isClassDeclaration(node) && node.name && node.name.text === componentName) {
            defined = true;
        }
    });
    return defined;
};

export const getImportPath = (currentFile: string, targetFile: string): string => {
    let relativePath = path.relative(path.dirname(currentFile), targetFile);
    relativePath = relativePath.replace(/\.[tj]sx?$/, '');
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
};

export const getUsedComponents = (sourceFile: ts.SourceFile, ts: typeof import('typescript')): Set<string> => {
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

export const getImportInsertionPosition = (sourceFile: ts.SourceFile): number => {
    let lastImportEnd = 0;
    sourceFile.forEachChild((node) => {
        if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
            lastImportEnd = node.getEnd();
        }
    });
    return lastImportEnd;
};

export const findFullComponentAtCursor = (
    templateText: string,
    position: number,
    templateStart: number,
): { componentName: string | null; insideTag: boolean } => {
    const relativePosition = position - templateStart;
    if (relativePosition < 0 || relativePosition > templateText.length) {
        return { componentName: null, insideTag: false };
    }

    const textBeforeCursor = templateText.substring(0, relativePosition);
    const lastOpenAngle = textBeforeCursor.lastIndexOf('<');
    if (lastOpenAngle === -1) {
        return { componentName: null, insideTag: false };
    }

    const closingAngle = templateText.indexOf('>', lastOpenAngle);
    let tagFragment: string;
    if (closingAngle !== -1) {
        tagFragment = templateText.substring(lastOpenAngle, closingAngle + 1);
    } else {
        tagFragment = templateText.substring(lastOpenAngle);
    }

    const insideTag = closingAngle === -1 ? true : relativePosition <= closingAngle + 1;

    const match = /^<\s*([A-Z][A-Za-z0-9]*)/.exec(tagFragment);
    if (match) {
        return { componentName: match[1], insideTag };
    }
    return { componentName: null, insideTag: false };
};
