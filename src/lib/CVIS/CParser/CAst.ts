/**
 * CVIS Visualisation suite: AST Nodes - Ben McIlveen
 */


export interface Node {
    type: string;
    location: {
        line: number,
        column: number
    }
}


export interface Program extends Node {
    type: "Program";
    globalDeclarations: Declaration[];
    statements: Statement[];
}

export interface Statement extends Node {
}

export interface Expression extends Node {
}

export interface Declaration extends Node {
    typeSpecifier: TypeSpecifier;
}

export interface Declarator extends Declaration {
}

export interface FunctionPointerDeclarator extends Declarator {
    type: "FunctionPointerDeclarator";
    id: Identifier;
    pointerLevel?: number;
    parameters: TypeSpecifier[];
    isVariadic?: boolean;
}

export interface VariableDeclarator extends Declarator {
    type: "VariableDeclarator";
    id: Identifier;
    init?: Expression | ArrayInitializer;
    arrayDimensions?: number[]; // ie [5][5] would be [5, 5]
    pointerLevel?: number; // ie how many *'s
}

export interface Identifier extends Node {
    type: "Identifier";
    name: string;
}

export interface TypeSpecifier extends Node {
    type: "TypeSpecifier";
    name: string;
    pointerLevel?: number;
    isLong?: boolean;
    isShort?: boolean;
    isSigned?: boolean;
    isUnsigned?: boolean;
    isConst?: boolean;
    isVolatile?: boolean;
    isRegister?: boolean;
    isAuto?: boolean;
    isStatic?: boolean;
    isExtern?: boolean;
    isInLine?: boolean;
    isRestrict?: boolean;
}

/**
 * Expression Nodes
 */

export interface IntegerLiteral extends Expression {
    type: "IntegerLiteral";
    value: number;
}

export interface FloatLiteral extends Expression {
    type: "FloatLiteral";
    value: number;
}

export interface StringLiteral extends Expression {
    type: "StringLiteral";
    value: string;
}

export interface CharLiteral extends Expression {
    type: "CharLiteral";
    value: string;
}

export interface BooleanLiteral extends Expression {
    type: "BooleanLiteral";
    value: boolean;
}

//TODO: Implement these (potentially)
export interface ArrayLiteral extends Expression {
    type: "ArrayLiteral";
    value: Expression[];
}

export interface Identifier extends Expression {
    type: "Identifier";
    name: string;
}

export interface UnaryExpression extends Expression {
    type: "UnaryExpression";
    operator: string;
    argument: Expression;
}

export interface BinaryExpression extends Expression {
    type: "BinaryExpression";
    operator: string;
    left: Expression;
    right: Expression;
}

//TODO: Implement these
export interface TernaryExpression extends Expression {
    type: "TernaryExpression";
    condition: Expression;
    trueExpression: Expression;
    falseExpression: Expression;
}

export interface PostfixExpression extends Expression {
    type: "PostfixExpression";
    operator: string;
    argument: Expression;
}

export interface PrefixExpression extends Expression {
    type: "PrefixExpression";
    operator: string;
    argument: Expression;
}

export interface FunctionCall extends Expression {
    type: "FunctionCall";
    functionIdentity: Identifier;
    arguments: Expression[];
}


// Astraction (not proper C)
export interface MemberExpression extends Expression {
    type: "MemberExpression";
    // Object changed to allow identifier to be another expression ie head->next
    object: Expression;
    property: Identifier;
    isPointer: boolean;
}

export interface ArrayExpression extends Expression {
    type: "ArrayExpression";
    array: Expression;
    index: Expression;
}

export interface CastExpression extends Expression {
    type: "CastExpression";
    typeSpecifier: TypeSpecifier;
    expression: Expression;
}

export interface SizeofExpression extends Expression {
    type: "SizeofExpression";
    expression: Expression | TypeSpecifier;
}

export interface ArrayInitializer extends Expression {
    type: "ArrayInitializer";
    values: (Expression | ArrayInitializer)[];
}


/**
 * Declaration Nodes
 */

export interface VariableDeclaration extends Node {
    type: "VariableDeclaration";
    declarators: Declarator[];
}

export interface FunctionDeclaration extends Declaration {
    type: "FunctionDeclaration";
    id: Identifier;
    pointerLevel?: number;
    parameters: ParameterDeclaration[];
    body?: Statement; // Optional body for function definition
    isVariadic?: boolean;
}

export interface StructDeclaration extends Declaration {
    type: "StructDeclaration";
    id: Identifier;
    fields: VariableDeclaration[];
    variables?: Identifier[];
}

export interface EnumDeclaration extends Declaration {
    type: "EnumDeclaration";
    id: Identifier;
    body: Identifier[];
}

export interface TypedefDeclaration extends Declaration {
    type: "TypedefDeclaration";
    id: Identifier;
    typeSpecifier: TypeSpecifier;
}

export interface ParameterDeclaration extends Declaration {
    type: "ParameterDeclaration";
    id: Identifier;
    typeSpecifier: TypeSpecifier;
}

export interface UnionDeclaration extends Declaration {
    type: "UnionDeclaration";
    id: Identifier;
    body: VariableDeclaration[];
}


/**
 * Statement Nodes
 */

//TODO: Implement these
export interface VariableDeclarationStatement extends Statement {
    type: "VariableDeclarationStatement";
    declaration: VariableDeclaration;

}

export interface CompoundStatement extends Statement {
    type: "CompoundStatement";
    localDeclarations: (Declaration)[];
    body: (Statement)[];
}

export interface ExpressionStatement extends Statement {
    type: "ExpressionStatement";
    expression: Expression;
}

//TODO: Implement these
export interface EmptyStatement extends Statement {
    type: "EmptyStatement";
}

//TODO: Implement these
export interface LabelStatement extends Statement {
    type: "LabelStatement";
    label: Identifier;
    body: Statement[];
}

export interface IfStatement extends Statement {
    type: "IfStatement";
    condition: Expression;
    consequent: Statement;
    alternate?: Statement;
}

export interface WhileStatement extends Statement {
    type: "WhileStatement";
    condition: Expression;
    body: Statement;
}

export interface DoWhileStatement extends Statement {
    type: "DoWhileStatement";
    condition: Expression;
    body: Statement;
}

export interface ForStatement extends Statement {
    type: "ForStatement";
    init: Expression;
    test: Expression;
    update: Expression;
    body: Statement;
}

export interface ReturnStatement extends Statement {
    type: "ReturnStatement";
    argument?: Expression;
}

export interface BreakStatement extends Statement {
    type: "BreakStatement";
}

export interface ContinueStatement extends Statement {
    type: "ContinueStatement";
}


export interface GotoStatement extends Statement {
    type: "GotoStatement";
    label: Identifier;
}


export interface SwitchStatement extends Statement {
    type: "SwitchStatement";
    expression: Expression;
    body: Statement;
}


export interface DefaultStatement extends Statement {
    type: "DefaultStatement";
    consequent: Statement;
}


export interface CaseStatement extends Statement {
    type: "CaseStatement";
    test: Expression;
    consequent: Statement;
}

export interface ReturnAssignment extends Statement {
    type: 'ReturnAssignment',
    variableName: string,
    address: number,
    initializer: Expression
};
