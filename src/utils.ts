import * as ts from 'typescript';
import * as path from 'node:path';
import { logger } from './Logger';

type ComponentInfo = {
    name: string;
    file: string;
    props?: PropInfo[];
    slots?: string[];
};

type PropInfo = {
    key: string;
    type: string;
    optional: boolean;
};

export const getComponentGenericType = (
    node: ts.ClassDeclaration,
    checker: ts.TypeChecker,
): PropInfo[] | undefined => {
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
    logger.log(components, 'COMPONENTS');
    return components;
};

const getComponentSlots = (
    node: ts.ClassDeclaration,
    ts: typeof import('typescript'),
): string[] => {
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

const componentHasSlot = (
    node: ts.ClassDeclaration,
    typescript: typeof ts,
): boolean => {
    let found = false;
    function visit(child: ts.Node) {
        if (typescript.isTaggedTemplateExpression(child)) {
            const templateText = extractTemplateText(child, typescript);
            if (templateText?.includes('<slot')) {
                found = true;
            }
        }
        ts.forEachChild(child, visit);
    }
    visit(node);
    return found;
};

const getTypeProperties = (
    typeNode: ts.TypeNode,
    checker: ts.TypeChecker,
): PropInfo[] => {
    const props: PropInfo[] = [];
    const type = checker.getTypeFromTypeNode(typeNode);

    for (const prop of type.getProperties()) {
        if (!prop.valueDeclaration) continue;

        const propType = checker.getTypeOfSymbolAtLocation(
            prop,
            prop.valueDeclaration,
        );
        const typeString = checker.typeToString(propType);
        let optional = false;

        if (propType.isUnion()) {
            const unionTypes = (propType as ts.UnionType).types;
            optional = unionTypes.some(
                (t) => (t.flags & ts.TypeFlags.Undefined) !== 0,
            );
        } else {
            optional = (propType.flags & ts.TypeFlags.Undefined) !== 0;
        }

        props.push({ key: prop.getName(), type: typeString, optional });
    }

    return props;
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

export const getTokenAtPosition = (
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
    templateText: string,
    position: number,
    templateStart: number,
): { componentName: string | null; insideTag: boolean } => {
    const relativePosition = position - templateStart;
    if (relativePosition < 0 || relativePosition > templateText.length) {
        return { componentName: null, insideTag: false };
    }

    const textBeforeCursor = templateText.substring(0, relativePosition);

    let lastOpenAngle = textBeforeCursor.lastIndexOf('<');
    while (
        lastOpenAngle !== -1 &&
        textBeforeCursor[lastOpenAngle + 1] === '/'
    ) {
        lastOpenAngle = textBeforeCursor.lastIndexOf('<', lastOpenAngle - 1);
    }
    if (lastOpenAngle === -1) {
        return { componentName: null, insideTag: false };
    }

    const afterAngle = textBeforeCursor.substring(lastOpenAngle + 1);

    const match = /^([A-Z][A-Za-z0-9]*)/.exec(afterAngle);
    if (match) {
        return {
            componentName: match[1],
            insideTag: true,
        };
    }

    return { componentName: null, insideTag: false };
};

export const isComponentImported = (
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

export const isComponentDefinedInFile = (
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

export const getImportPath = (
    currentFile: string,
    targetFile: string,
): string => {
    let relativePath = path.relative(path.dirname(currentFile), targetFile);
    relativePath = relativePath.replace(/\.[tj]sx?$/, '');
    if (!relativePath.startsWith('.')) {
        relativePath = `./${relativePath}`;
    }
    return relativePath;
};

export const getUsedComponents = (
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

export const getImportInsertionPosition = (
    sourceFile: ts.SourceFile,
): number => {
    let lastImportEnd = 0;
    sourceFile.forEachChild((node) => {
        if (
            ts.isImportDeclaration(node) ||
            ts.isImportEqualsDeclaration(node)
        ) {
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
    // Calculate the cursor's position relative to the start of the template
    const relativePosition = position - templateStart;
    if (relativePosition < 0 || relativePosition > templateText.length) {
        return { componentName: null, insideTag: false };
    }

    // Find the last occurrence of '<' before the relative cursor position
    const lastOpenAngle = templateText.lastIndexOf('<', relativePosition);
    if (lastOpenAngle === -1) {
        return { componentName: null, insideTag: false };
    }

    // Get the substring starting from the last '<'
    const tagText = templateText.substring(lastOpenAngle);

    const match = /^<\s*([A-Z][A-Za-z0-9]*)/.exec(tagText);
    if (match) {
        logger.log(match[1], '✅ Full Component Found:');
        return {
            componentName: match[1],
            insideTag: true,
        };
    }

    logger.log('❌ No Component Match Found', 'findFullComponentAtCursor');
    return { componentName: null, insideTag: false };
};
