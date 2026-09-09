import {CTokenStream} from "./CTokenStream.ts";
import {Scanner} from "./CScanner.ts";
import {isRightAssociative, Token, TokenType} from "./CTokens.ts";
import {ParserError} from "./CErrors.ts";
import * as AST from "./CAst.ts";

/**
 * CVIS Visualisation suite: Parser - Ben McIlveen
 * Converts token stream into AST using Pratt Parsing
 */


const EMPTY_EXPRESSION: AST.Expression = {
    type: "EmptyExpression",
    location: {line: 0, column: 0},
};


export class Parser {

    private tokens: CTokenStream;

    // Maps for parse functions
    private prefixParseFunctions: Map<TokenType, PrefixParseFunction> = new Map();
    private infixParseFunctions: Map<TokenType, InfixParseFunction> = new Map();
    private postfixParseFunctions: Map<TokenType, PostfixParseFunction> =
        new Map();

    private debug = false;

    constructor(scanner: Scanner, debug: boolean = false) {

        // Create token stream
        this.tokens = new CTokenStream(scanner);

        // Set debug mode
        this.debug = debug;

        if (this.debug) {
            console.log("============ Tokens ============");
            console.log(this.tokens);
            console.log("================================");
        }

        // Register all parse functions
        this.registerAllPrefixFunctions();
        this.registerAllInfixFunctions();
        this.registerAllPostfixFunctions();
    }

    // Parse the full program
    parse = (): AST.Program => {
        return this.parseProgram();
    };

    // Recursively parse the program node
    parseProgram = (): AST.Program => {
        const globalDeclarations: AST.Declaration[] = [];
        const statements: AST.Statement[] = [];

        // Parse untill end of file token
        while (this.tokens.peek().type !== TokenType.EOF) {
            const token = this.tokens.peek();

            // Check if token is a declaration or statement
            // Recursively parse both
            if (this.isTypeSpecifier(token)) {
                const declaration = this.parseDeclaration();
                globalDeclarations.push(declaration);
            } else {
                const statement = this.parseStatement();
                statements.push(statement);
            }
        }

        // Return program
        const program: AST.Program = {
            type: "Program",
            globalDeclarations: globalDeclarations,
            statements: statements,
            location: {
                line: 0,
                column: 0,
            },
        };

        if (this.debug)
            console.log("Parsed program:", program);

        return program;
    };

    // Parse a single declaration
    parseDeclaration = (): AST.Declaration => {
        const typeSpecifier = this.parseTypeSpecifier();

        // Declare either special type or variable and function
        let declaration: AST.Declaration;
        switch (typeSpecifier.name) {
            case "struct":
                declaration = this.parseStruct(typeSpecifier);
                break;
            case "enum":
                declaration = this.parseEnumDeclaration(typeSpecifier);
                break;
            case "typedef":
                declaration = this.parseTypedefDeclaration(typeSpecifier);
                break;
            case "union":
                declaration = this.parseUnionDeclaration(typeSpecifier);
                break;
            case "parameter":
                declaration = this.parseParameterDeclaration(typeSpecifier);
                break;
            default:
                declaration = this.chooseParseFuncVar(typeSpecifier);
                break;
        }

        if (this.debug) {
            console.log("Parsed declaration:", declaration);
        }

        return declaration;
    };

    // Parse statement depending on initial token type
    parseStatement = (): AST.Statement => {
        const token = this.tokens.peek();
        if (!token) {
            throw new ParserError("Unexpected end of input", token, TokenType.EOF);
        }

        // C99 and later permit declarations after executable statements in a
        // block. Keep such declarations in the body so the machine executes
        // their initialisers at the correct point in program order.
        if (this.isDeclaration(token)) {
            return this.parseDeclaration() as AST.Statement;
        }

        let statement: AST.Statement;

        // Check which statement type to parse
        switch (token.type) {
            case TokenType.KEYWORD_IF:
                statement = this.parseIfStatement();
                break;
            case TokenType.KEYWORD_SWITCH:
                statement = this.parseSwitchStatement();
                break;
            case TokenType.KEYWORD_CASE:
                statement = this.parseCaseStatement();
                break;
            case TokenType.KEYWORD_DEFAULT:
                statement = this.parseDefaultStatement();
                break;
            case TokenType.PUNCT_LBRACE:
                statement = this.parseCompoundStatement();
                break;
            case TokenType.KEYWORD_RETURN:
                statement = this.parseReturnStatement();
                break;
            case TokenType.KEYWORD_FOR:
                statement = this.parseForStatement();
                break;
            case TokenType.KEYWORD_WHILE:
                statement = this.parseWhileStatement();
                break;
            case TokenType.KEYWORD_DO:
                statement = this.parseDoWhileStatement();
                break;
            case TokenType.KEYWORD_BREAK:
                statement = this.parseBreakStatement();
                break;
            case TokenType.KEYWORD_CONTINUE:
                statement = this.parseContinueStatement();
                break;

            default:
                statement = this.parseExpressionStatement();
                break;
        }

        if (this.debug) {
            console.log("Parsed statement:", statement);
        }

        return statement;
    };

    // Parse expression statement based on precedence
    parseExpression = (precedence: number) => {
        let token = this.tokens.peek();

        if (!token) {
            throw new ParserError("Unexpected end of input", token, TokenType.EOF);
        }

        // Check if token has a prefix parser (left side)
        const parsePrefixFunction = this.getParseFunction(
            this.prefixParseFunctions,
            token.type,
        );

        if (!parsePrefixFunction) {
            throw new ParserError(
                `Token ${token.type} has no parser`,
                token,
                token.type,
            );
        }

        // prefix function defaults to left side
        let left = parsePrefixFunction(token, this, EMPTY_EXPRESSION);

        if (this.debug) {
            console.log("Parsed prefix expression:", left);
        }

        // Explore if expression has Infix and Postfix aspects to parse
        while (true) {
            const nextToken = this.tokens.peek();

            // Check if next token has a greater precedence or is right associative
            if (!nextToken || (isRightAssociative(nextToken.type)
                ? precedence > (nextToken.precedence || 0)
                : precedence >= (nextToken.precedence || 0))) {
                break;
            }

            // Check if next token has an infix parser
            const parseInfixFunction = this.getParseFunction(
                this.infixParseFunctions,
                nextToken.type,
            );

            // Parse infix if exists
            if (parseInfixFunction) {
                left = parseInfixFunction(nextToken, this, left);
            } else {
                // If not infix, check if it is a postfix
                const parsePostfixFunction = this.getParseFunction(
                    this.postfixParseFunctions,
                    nextToken.type,
                );
                if (parsePostfixFunction) {
                    // parse postfix
                    left = parsePostfixFunction(nextToken, this, left);
                } else {
                    break;
                }
            }

            if (this.debug) {
                console.log("Parsed expression:", left);
            }
        }

        return left;
    };

    // Pattern matching for declaration start
    private isDeclaration = (token: Token): boolean => {
        return this.isTypeSpecifier(token) || this.isModifier(token);
    }

    // Parse struct
    private parseStruct = (typeSpecifier: AST.TypeSpecifier): AST.StructDeclaration | AST.VariableDeclaration => {

        // Check if its a struct variable declaration or struct definition
        if (this.tokens.peek(1).type !== TokenType.PUNCT_LBRACE) {
            // Extract struct name
            let structId: AST.Identifier = this.parseIdentifier(this.tokens.peek(), this) as AST.Identifier;
            typeSpecifier.name = `struct_${structId.name}`;
            return this.parseVariableDeclaration(typeSpecifier);
        } else
            return this.parseStructDefinition(typeSpecifier);
    }

    // Parse struct definition
    private parseStructDefinition = (typeSpecifier: AST.TypeSpecifier): AST.StructDeclaration => {

        // Get identifier
        let id: AST.Identifier = this.parseIdentifier(this.tokens.peek(), this) as AST.Identifier;

        // {
        this.tokens.expect(TokenType.PUNCT_LBRACE, "Expected opening brace");

        // Members
        let members: AST.VariableDeclaration[] = [];
        while (this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            let memberTypeSpecifier = this.parseTypeSpecifier();
            let member = this.parseVariableDeclaration(memberTypeSpecifier, false);
            members.push(member);
        }

        // }
        this.tokens.expect(TokenType.PUNCT_RBRACE, "Expected closing brace");

        // Optional variables
        let variables: AST.Identifier[] = [];
        while (this.tokens.peek().type !== TokenType.PUNCT_SEMICOLON) {
            let variable = this.parseIdentifier(this.tokens.peek(), this);
            variables.push(variable as AST.Identifier);

            // ,
            this.tokens.match(TokenType.PUNCT_COMMA);
        }

        // ;
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const structDeclaration: AST.StructDeclaration = {
            type: "StructDeclaration",
            id: id as AST.Identifier,
            typeSpecifier: typeSpecifier,
            fields: members,
            variables: variables.length == 0 ? undefined : variables,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return structDeclaration;
    }

    // Parse enum declaration
    private parseEnumDeclaration = (typeSpecifier: AST.TypeSpecifier): AST.EnumDeclaration => {
        let id: AST.Expression = this.parseIdentifier(this.tokens.peek(), this);
        // {
        this.tokens.expect(TokenType.PUNCT_LBRACE, "Expected opening brace");

        // Members
        let members: AST.Identifier[] = [];
        while (this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {

            // Expect indentifer
            let member = this.parseIdentifier(this.tokens.peek(), this);
            members.push(member as AST.Identifier);

            // ,
            this.tokens.match(TokenType.PUNCT_COMMA);
        }

        // }
        this.tokens.expect(TokenType.PUNCT_RBRACE, "Expected closing brace");

        const enumDeclaration: AST.EnumDeclaration = {
            type: "EnumDeclaration",
            id: id as AST.Identifier,
            typeSpecifier: {...typeSpecifier},
            body: members,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return enumDeclaration;
    }

    // Parse typedef declaration
    private parseTypedefDeclaration = (typeSpecifier: AST.TypeSpecifier): AST.TypedefDeclaration => {

        // e.g. typedef int myInt;
        // typdef is believed to be the type specifier (ignore and get actual type specifier)
        const realTypeSpecifier: TypeSpecifier = this.parseTypeSpecifier();

        // Collected identifier
        let identifier: AST.Expression = this.parseIdentifier(this.tokens.peek(), this);

        // ;
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const typedefDeclaration: AST.TypedefDeclaration = {
            type: "TypedefDeclaration",
            id: identifier as AST.Identifier,
            typeSpecifier: realTypeSpecifier,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return typedefDeclaration;
    }

    // Parse variable or function declaration
    private chooseParseFuncVar = (typeSpecifier: AST.TypeSpecifier): AST.VariableDeclaration | AST.FunctionDeclaration => {

        // In case of function pointer where extra tokens need to be rewinded
        let baseRewind = 1;
        let isFunctionPointer = false;

        // Checks for functions or variables (Very similar syntax)
        // This is needed as varaibles cant be in format int a,b,c but funcs cant be int main(), anotherfunc()...

        // In case of function pointer: (
        if (this.tokens.match(TokenType.PUNCT_LPAREN)) {
            baseRewind++;
            isFunctionPointer = true;
        }


        let pointerLevel = 0;
        // Skip all pointer levels
        while (this.tokens.match(TokenType.OP_MULTIPLY)) {
            pointerLevel++;
        }

        // Get past the identifier
        this.parseIdentifier(this.tokens.peek(), this);

        // In case of function pointer: )
        if (this.tokens.match(TokenType.PUNCT_RPAREN))
            baseRewind++;

        // Look ahead to determine if this is a function declaration
        const nextToken = this.tokens.peek();

        // If we see a left parenthesis immediately after the identifier, it's a function
        if (nextToken.type === TokenType.PUNCT_LPAREN && !isFunctionPointer) {
            // Rewind the tokens back to before the identifier
            this.tokens.rewind(baseRewind + pointerLevel);
            return this.parseFunctionDeclaration(typeSpecifier);
        }

        // Otherwise, it's a variable declaration
        // Rewind the tokens back to before the identifier
        this.tokens.rewind(baseRewind + pointerLevel);
        return this.parseVariableDeclaration(typeSpecifier);
    }

    // Parse array initializer
    private parseArrayInitializer = (): AST.ArrayInitializer => {
        // {
        this.tokens.expect(TokenType.PUNCT_LBRACE, "Expected opening brace");

        let values: (AST.Expression | AST.ArrayInitializer)[] = [];

        // Parse array initializer
        while (this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            let value: AST.Expression | AST.ArrayInitializer;

            // Check for nested array initializer
            if (this.tokens.peek().type === TokenType.PUNCT_LBRACE) {
                value = this.parseArrayInitializer();
            } else {
                value = this.parseExpression(0);
            }

            values.push(value);

            // ,
            this.tokens.match(TokenType.PUNCT_COMMA);
        }

        // }
        this.tokens.expect(TokenType.PUNCT_RBRACE, "Expected closing brace");


        // BOTCH FIX: location is not set for array initializer as recursive messes it up
        const arrayInitializer: AST.ArrayInitializer = {
            type: "ArrayInitializer",
            values,
            location: {
                line: -1,
                column: -1,
            },
        };

        return arrayInitializer;
    }

    // Parse variable declaration
    private parseVariableDeclaration = (typeSpecifier: AST.TypeSpecifier, allowInit: boolean = true): AST.VariableDeclaration => {

        let declarators: AST.Declaration[] = [];

        // Complete for each initialisation element ie int a,b,c...
        do {
            let initialValue: AST.Expression | AST.ArrayInitializer | undefined = undefined;
            let dimensions: number[] = [];
            let pointerLevel = 0;

            // Handle function pointer syntax: int (*func)() or char (**func)()
            if (this.tokens.peek().type === TokenType.PUNCT_LPAREN) {

                let functionPointerDeclarator: AST.FunctionPointerDeclarator = this.parseFunctionPointerDeclarator(typeSpecifier);

                declarators.push(functionPointerDeclarator);

                continue;
            }


            let identifier: AST.Identifier
            // In case of struct (struct myStruct a;) then typeis struct_myStruct and idenfier is a;
            if (typeSpecifier.name === "struct") {
                // Struct name is added to type name - expect identifier after too
                if (this.tokens.peek().type !== TokenType.IDENTIFIER)
                    throw new ParserError("Expected identifier for struct type", this.tokens.peek(), this.tokens.peek().type);
                let structId: AST.Identifier = this.parseIdentifier(this.tokens.peek(), this) as AST.Identifier;
                typeSpecifier.name = `struct_${structId.name}`;

                // Handle pointers before identifier
                while (this.tokens.match(TokenType.OP_MULTIPLY)) {
                    pointerLevel++;
                }

                // Identifier
                if (this.tokens.peek().type !== TokenType.IDENTIFIER)
                    throw new ParserError("Expected identifier for struct variable", this.tokens.peek(), this.tokens.peek().type);
                identifier = this.parseIdentifier(this.tokens.peek(), this) as AST.Identifier;

            } else {

                // Handle pointers before identifier
                while (this.tokens.match(TokenType.OP_MULTIPLY)) {
                    pointerLevel++;
                }

                // Identifier
                identifier = this.parseIdentifier(this.tokens.peek(), this) as AST.Identifier;
            }


            // Parse array initializer arr[][]..
            while (this.tokens.peek().type === TokenType.PUNCT_LBRACKET) {
                // [
                this.tokens.expect(TokenType.PUNCT_LBRACKET, "Expected opening bracket");

                // TODO: Allow expressions
                // LIMITATION: Only allow integer literals for now
                // Parse array size
                let dimension: AST.IntegerLiteral | undefined = undefined;

                if (this.tokens.peek().type !== TokenType.PUNCT_RBRACKET) {
                    dimension = this.parseIntLiteral(this.tokens.peek(), this) as AST.IntegerLiteral;
                }

                // ]
                this.tokens.expect(TokenType.PUNCT_RBRACKET, "Expected closing bracket");

                if (dimension)
                    dimensions.push(dimension.value);
            }

            // Parse assignement
            if (this.tokens.match(TokenType.OP_ASSIGN)) {
                if (!allowInit)
                    throw new ParserError("Struct members cannot be initialized", this.tokens.peek(), this.tokens.peek().type);

                // Parse array initializer
                if (this.tokens.peek().type === TokenType.PUNCT_LBRACE) {
                    initialValue = this.parseArrayInitializer() as AST.ArrayInitializer;

                    // In case of empty array dimension, calculate dimensions from initializer
                    if (dimensions.length == 0) {
                        // Calculate array dimensions from initializer
                        let tempDim = []
                        let currentArray: AST.ArrayInitializer | undefined = initialValue as AST.ArrayInitializer;
                        while (currentArray) {

                            if (currentArray.values)
                                tempDim.push(currentArray.values.length);
                            else {
                                currentArray = undefined;
                                break;
                            }

                            if (currentArray.values.length > 0)
                                currentArray = currentArray.values[0] as AST.ArrayInitializer;
                            else
                                currentArray = undefined;
                        }
                        dimensions = tempDim;
                    }

                } else
                    initialValue = this.parseExpression(0);
            }

            const variableDeclarator: AST.VariableDeclarator = {
                type: "VariableDeclarator",
                id: identifier as AST.Identifier,
                typeSpecifier: {...typeSpecifier, pointerLevel},
                arrayDimensions: dimensions.length == 0 ? undefined : dimensions,
                init: initialValue,
                location: {
                    line: identifier.location.line,
                    column: identifier.location.column,
                }
            };

            declarators.push(variableDeclarator);
        }
        while (this.tokens.match(TokenType.PUNCT_COMMA));

        // Throw error for empty declaration
        if (declarators.length == 0)
            throw new ParserError("Expected variable declaration", this.tokens.peek(), this.tokens.peek().type);


        // ;
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");


        const variableDeclaration: AST.VariableDeclaration = {
            type: "VariableDeclaration",
            declarators,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            }
        };

        return variableDeclaration;
    }

    // Parse function pointer declarator
    private parseFunctionPointerDeclarator = (typeSpecifier: AST.TypeSpecifier): AST.FunctionPointerDeclarator => {

        let functionPointerLevel = 0;
        let functionPointerParameterTypes: AST.TypeSpecifier[] = [];

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // Parse function pointer level
        while (this.tokens.match(TokenType.OP_MULTIPLY)) {
            functionPointerLevel++;
        }

        // Identifier
        const identifier: AST.Expression = this.parseIdentifier(this.tokens.peek(), this);

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");


        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // Optional function parameter types
        while (this.tokens.peek().type !== TokenType.PUNCT_RPAREN) {
            let paramTypeSpecifier = this.parseTypeSpecifier();
            functionPointerParameterTypes.push(paramTypeSpecifier);

            this.tokens.match(TokenType.PUNCT_COMMA);
        }

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        const functionPointerDeclaration: AST.FunctionPointerDeclarator = {
            type: "FunctionPointerDeclarator",
            id: identifier as AST.Identifier,
            typeSpecifier: {...typeSpecifier, pointerLevel: functionPointerLevel},
            parameters: functionPointerParameterTypes,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        }

        return functionPointerDeclaration;
    }

    // Parse function declaration
    private parseFunctionDeclaration = (typeSpecifier: AST.TypeSpecifier): AST.FunctionDeclaration => {
        let functionPointerLevel = 0;
        let returnTypePointerLevel = 0;
        let identifier: AST.Expression;


        // Distinquish between pointer to function and return type pointer
        if (this.tokens.match(TokenType.PUNCT_LPAREN)) {
            // Handle function pointer syntax: (*func) or (**func)
            while (this.tokens.match(TokenType.OP_MULTIPLY)) {
                functionPointerLevel++;
            }

            // Parse function name inside the parentheses
            identifier = this.parseIdentifier(this.tokens.peek(), this);

            // Close the function pointer parentheses
            this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis for function pointer");

        } else {

            // just return type pointer
            while (this.tokens.match(TokenType.OP_MULTIPLY))
                returnTypePointerLevel++;
            identifier = this.parseIdentifier(this.tokens.peek(), this);
        }

        // Parse parameter list
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        let params: AST.ParameterDeclaration[] = [];

        // Parse parameters
        while (this.tokens.peek().type !== TokenType.PUNCT_RPAREN) {
            let paramTypeSpecifier = this.parseTypeSpecifier();
            let param = this.parseParameterDeclaration(paramTypeSpecifier);
            params.push(param);

            // ,
            this.tokens.match(TokenType.PUNCT_COMMA);
        }

        // Close parameter list
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        let body: AST.Statement | undefined = undefined;

        // Parse function body (optional)
        if (this.tokens.peek().type === TokenType.PUNCT_LBRACE)
            body = this.parseStatement();

        const functionDeclaration: AST.FunctionDeclaration = {
            type: "FunctionDeclaration",
            id: identifier as AST.Identifier,
            typeSpecifier: {...typeSpecifier, pointerLevel: returnTypePointerLevel},
            parameters: params,
            body,
            pointerLevel: functionPointerLevel > 0 ? functionPointerLevel : undefined,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return functionDeclaration;
    }

    // Parse union declaration (not used in machine yet)
    private parseUnionDeclaration = (typeSpecifier: AST.TypeSpecifier): AST.UnionDeclaration => {
        let id: AST.Expression = this.parseIdentifier(this.tokens.peek(), this);
        // {
        this.tokens.expect(TokenType.PUNCT_LBRACE, "Expected opening brace");

        // Members
        let members: AST.VariableDeclaration[] = [];
        while (this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            let memberTypeSpecifier = this.parseTypeSpecifier();
            let member = this.parseVariableDeclaration(memberTypeSpecifier);
            members.push(member);
        }

        // }
        this.tokens.expect(TokenType.PUNCT_RBRACE, "Expected closing brace");

        const unionDeclaration: AST.UnionDeclaration = {
            type: "UnionDeclaration",
            id: id as AST.Identifier,
            typeSpecifier: {...typeSpecifier, isUnion: true},
            body: members,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return unionDeclaration;
    }

    // Parse parameter declaration (functions)
    private parseParameterDeclaration = (typeSpecifier: AST.TypeSpecifier): AST.ParameterDeclaration => {
        const identifier: AST.Expression = this.parseIdentifier(this.tokens.peek(), this);

        const parameterDeclaration: AST.ParameterDeclaration = {
            type: "ParameterDeclaration",
            id: identifier as AST.Identifier,
            typeSpecifier,
            location: {
                line: typeSpecifier.location.line,
                column: typeSpecifier.location.column,
            },
        };

        return parameterDeclaration;
    }

    // Parse typeSpecifier
    private parseTypeSpecifier = (): AST.TypeSpecifier => {

        // Parse modifiers
        let modifiers: Set<TokenType> = new Set();

        while (this.isModifier(this.tokens.peek())) {
            // console.log("Modifier:", this.tokens.peek());
            modifiers.add(this.tokens.consume().type);
        }

        // Parse type specifier
        const token = this.tokens.consume();

        if (!this.isTypeSpecifier(token)) {
            throw new ParserError(
                "Expected type specifier",
                token,
                token.type,
            );
        }

        const typeSpecifier: AST.TypeSpecifier = {
            type: "TypeSpecifier",
            name: this.typeToString(token.type),
            location: {
                line: token.line,
                column: token.column,
            },
            isConst: modifiers.has(TokenType.KEYWORD_CONST) || undefined,
            isVolatile: modifiers.has(TokenType.KEYWORD_VOLATILE) || undefined,
            isRegister: modifiers.has(TokenType.KEYWORD_REGISTER) || undefined,
            isAuto: modifiers.has(TokenType.KEYWORD_AUTO) || undefined,
            isStatic: modifiers.has(TokenType.KEYWORD_STATIC) || undefined,
            isExtern: modifiers.has(TokenType.KEYWORD_EXTERN) || undefined,
            isLong: modifiers.has(TokenType.KEYWORD_LONG) || undefined,
            isShort: modifiers.has(TokenType.KEYWORD_SHORT) || undefined,
            isSigned: modifiers.has(TokenType.KEYWORD_SIGNED) || undefined,
            isUnsigned: modifiers.has(TokenType.KEYWORD_UNSIGNED) || undefined,
        };

        return typeSpecifier;
    }

    // Parse switch statement
    private parseSwitchStatement = (): AST.SwitchStatement => {
        // switch
        const switchToken = this.tokens.expect(
            TokenType.KEYWORD_SWITCH,
            "Expected switch keyword",
        );

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // condition
        const condition = this.parseExpression(0);

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        // Case Statement
        const body = this.parseStatement();

        const switchStatement: AST.SwitchStatement = {
            type: "SwitchStatement",
            expression: condition,
            body: body,
            location: {
                line: switchToken.line,
                column: switchToken.column,
            },
        }

        return switchStatement;
    }

    // Parse case statement
    private parseCaseStatement = (): AST.CaseStatement => {
        // case
        const caseToken: Token = this.tokens.expect(
            TokenType.KEYWORD_CASE,
            "Expected case keyword",
        );

        // case value
        const test: Expression = this.parseExpression(0);

        // :
        this.tokens.expect(TokenType.PUNCT_COLON, "Expected colon");

        // Body of case statement
        // Bit different from other statements due to lack of curly brackets (for some reason...) collect all statements untill next label
        let body: AST.Statement[] = [];

        while (this.tokens.peek().type !== TokenType.KEYWORD_CASE
        && this.tokens.peek().type !== TokenType.KEYWORD_DEFAULT
        && this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            body.push(this.parseStatement());
        }

        // Bundle into compound statement (as it should be)
        const compoundStatement: AST.CompoundStatement = {
            type: "CompoundStatement",
            body: body,
            localDeclarations: [],
            location: {
                line: caseToken.line,
                column: caseToken.column,
            },
        }

        const caseStatement: AST.CaseStatement = {
            type: "CaseStatement",
            test,
            consequent: compoundStatement,
            location: {
                line: caseToken.line,
                column: caseToken.column,
            },
        }

        return caseStatement;
    }

    // Parse default statement (switch)
    private parseDefaultStatement = (): AST.DefaultStatement => {
        // default
        const defaultToken: Token = this.tokens.expect(
            TokenType.KEYWORD_DEFAULT,
            "Expected default keyword",
        );

        // :
        this.tokens.expect(TokenType.PUNCT_COLON, "Expected colon");

        // Body of default statement
        let body: AST.Statement[] = [];

        while (this.tokens.peek().type !== TokenType.KEYWORD_CASE
        && this.tokens.peek().type !== TokenType.KEYWORD_DEFAULT
        && this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            body.push(this.parseStatement());
        }

        // Bundle into compound statement (as it should be)
        const compoundStatement: AST.CompoundStatement = {
            type: "CompoundStatement",
            body: body,
            localDeclarations: [],
            location: {
                line: defaultToken.line,
                column: defaultToken.column,
            },
        }

        const defaultStatement: AST.DefaultStatement = {
            type: "DefaultStatement",
            consequent: compoundStatement,
            location: {
                line: defaultToken.line,
                column: defaultToken.column,
            },
        }

        return defaultStatement;
    }

    // Parse if statement
    private parseIfStatement = (): AST.IfStatement => {

        // IF
        const ifToken = this.tokens.expect(
            TokenType.KEYWORD_IF,
            "Expected if keyword",
        );

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // condition
        const condition = this.parseExpression(0);

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        const consequent = this.parseStatement();

        let alternate: AST.Statement | undefined;

        if (this.tokens.match(TokenType.KEYWORD_ELSE))
            alternate = this.parseStatement();

        const ifStatement: AST.IfStatement = {
            type: "IfStatement",
            condition: condition,
            consequent: consequent,
            alternate: alternate,
            location: {
                line: ifToken.line,
                column: ifToken.column,
            },
        };

        return ifStatement;
    };

    // Parse for statement
    private parseForStatement = (): AST.ForStatement => {
        // for
        const forToken = this.tokens.expect(
            TokenType.KEYWORD_FOR,
            "Expected for keyword",
        );

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // init
        let init: AST.Expression | undefined = undefined;
        if (this.tokens.peek().type !== TokenType.PUNCT_SEMICOLON) {
            init = this.parseExpression(0);
        }

        // ;
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        // condition
        let test: AST.Expression | undefined = undefined;
        if (this.tokens.peek().type !== TokenType.PUNCT_SEMICOLON) {
            test = this.parseExpression(0);
        }

        // ;
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        // update
        let update: AST.Expression | undefined = undefined;
        if (this.tokens.peek().type !== TokenType.PUNCT_RPAREN) {
            update = this.parseExpression(0);
        }

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        const body = this.parseStatement();

        const forStatement: AST.ForStatement = {
            type: "ForStatement",
            init,
            test: test,
            update,
            body,
            location: {
                line: forToken.line,
                column: forToken.column,
            },
        };

        return forStatement;
    }

    // Parse do while statement
    private parseDoWhileStatement = (): AST.DoWhileStatement => {
        // do
        const doToken = this.tokens.expect(
            TokenType.KEYWORD_DO,
            "Expected do keyword",
        );

        const body = this.parseStatement();

        // while
        const whileToken = this.tokens.expect(
            TokenType.KEYWORD_WHILE,
            "Expected while keyword",
        );

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // condition
        const condition = this.parseExpression(0);

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const doWhileStatement: AST.DoWhileStatement = {
            type: "DoWhileStatement",
            condition: condition,
            body: body,
            location: {
                line: doToken.line,
                column: doToken.column,
            },
        };

        return doWhileStatement;
    }

    // Parse while statement
    private parseWhileStatement = (): AST.WhileStatement => {
        // while
        const whileToken = this.tokens.expect(
            TokenType.KEYWORD_WHILE,
            "Expected while keyword",
        );

        // (
        this.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // condition
        const condition = this.parseExpression(0);

        // )
        this.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        // Body of while (required) (otherwise when condition is type it buggs out)
        const body = this.parseStatement();
        if (!body)
            throw new ParserError("Expected body of while statement", this.tokens.peek(), TokenType.EOF);


        const whileStatement: AST.WhileStatement = {
            type: "WhileStatement",
            condition: condition,
            body: body,
            location: {
                line: whileToken.line,
                column: whileToken.column,
            },
        };

        return whileStatement;
    }

    // Parse compound statement
    private parseCompoundStatement = (): AST.CompoundStatement => {

        // {
        const openingBrace = this.tokens.expect(
            TokenType.PUNCT_LBRACE,
            "Expected opening brace",
        );

        // Collecr any declarations (optional)
        let localDeclarations: AST.Declaration[] = [];
        while (this.isDeclaration(this.tokens.peek())) {
            const declaration = this.parseDeclaration();
            localDeclarations.push(declaration);
        }

        let body: AST.Statement[] = [];

        // statement; ...;
        while (this.tokens.peek().type !== TokenType.PUNCT_RBRACE) {
            body.push(this.parseStatement());
        }

        // }
        this.tokens.expect(
            TokenType.PUNCT_RBRACE,
            "Expected closing brace",
        );

        const compoundStatement: AST.CompoundStatement = {
            type: "CompoundStatement",
            body: body,
            localDeclarations,
            location: {
                line: openingBrace.line,
                column: openingBrace.column,
            },
        };

        return compoundStatement;
    }

    // Parse return statement
    private parseReturnStatement = (): AST.ReturnStatement => {
        const returnToken = this.tokens.expect(
            TokenType.KEYWORD_RETURN,
            "Expected return keyword",
        );

        let argument: AST.Expression | undefined = undefined;

        if (this.tokens.peek().type !== TokenType.PUNCT_SEMICOLON) {
            argument = this.parseExpression(0);
        }

        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const returnStatement: AST.ReturnStatement = {
            type: "ReturnStatement",
            argument: argument,
            location: {
                line: returnToken.line,
                column: returnToken.column,
            },
        };

        return returnStatement;
    }

    // Parse break statement
    private parseBreakStatement = (): AST.BreakStatement => {
        const breakToken = this.tokens.expect(
            TokenType.KEYWORD_BREAK,
            "Expected break keyword",
        );

        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const breakStatement: AST.BreakStatement = {
            type: "BreakStatement",
            location: {
                line: breakToken.line,
                column: breakToken.column,
            },
        };

        return breakStatement;
    }

    // Parse continue statement
    private parseContinueStatement = (): AST.ContinueStatement => {
        const continueToken = this.tokens.expect(
            TokenType.KEYWORD_CONTINUE,
            "Expected continue keyword",
        );

        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");

        const continueStatement: AST.ContinueStatement = {
            type: "ContinueStatement",
            location: {
                line: continueToken.line,
                column: continueToken.column,
            },
        };

        return continueStatement;
    }

    // Parse expression statement
    private parseExpressionStatement = (): AST.ExpressionStatement => {
        const expression = this.parseExpression(0);
        this.tokens.expect(TokenType.PUNCT_SEMICOLON, "Expected semicolon");
        return {
            type: "ExpressionStatement",
            expression: expression,
            location: {
                line: expression.location.line,
                column: expression.location.column,
            },
        };
    };

    // Parse size of expression
    // Supports single-token types (such as int) and names structs such as Node
    private parseSizeOf = (token: Token, parser: Parser): AST.Expression => {
        // When sizeOf is applied to a struct type, the struct identifier is captured to match 'struct_name' form
        const sizeOf = parser.tokens.expect(
            TokenType.KEYWORD_SIZEOF,
            "Expected sizeof keyword",
        ); // Consume the sizeof keyword
        parser.tokens.expect(
            TokenType.PUNCT_LPAREN,
            "Expected opening parenthesis",
        ); // Consume the opening parenthesis

        // Addition: allowing the parser to handle multiple types of tokens 
        const nextToken = parser.tokens.peek();

        if (this.isTypeSpecifier(nextToken)) {
            const typeSpecifier = parser.parseTypeSpecifier();
            if (typeSpecifier.name == "struct"){
                const structId = this.parseIdentifier(parser.tokens.peek(), parser) as AST.Identifier;
                typeSpecifier.name = `struct_${structId.name}`;
            }

            parser.tokens.expect(
                TokenType.PUNCT_RPAREN, "Expected closing parenthesis"
            );

            const sizeOfExpression: AST.SizeofExpression = {
                type: "SizeofExpression",
                expression: typeSpecifier,
                location: {
                    line: sizeOf.line,
                    column: sizeOf.column,
                },
            };
            return sizeOfExpression;
        }

        const expression = parser.parseExpression(0);
        parser.tokens.expect(
            TokenType.PUNCT_RPAREN,
            "Expected closing parenthesis",
        ); // Consume the closing parenthesis
        
        const sizeOfExpression: AST.SizeofExpression = {
            type: "SizeofExpression",
            expression: expression,
            location: {
                line: sizeOf.line,
                column: sizeOf.column,
            },
        };
        return sizeOfExpression;
    };

    // Parse type cast expression
    private parseTypeCast = (parser: Parser): AST.Expression => {
        const type = parser.tokens.consume();
        parser.tokens.expect(
            TokenType.PUNCT_RPAREN,
            "Expected closing parenthesis",
        ); // Consume the closing parenthesis

        // A cast binds to its unary operand, not the remaining binary expression.
        const expression = parser.parseExpression(13);

        const typeCast: AST.CastExpression = {
            type: "CastExpression",
            typeSpecifier: {
                type: "TypeSpecifier",
                name: this.typeToString(type.type),
                location: {
                    line: type.line,
                    column: type.column,
                },
            },
            expression: expression,
            location: {
                line: type.line,
                column: type.column,
            },
        };

        return typeCast;
    };

    // Parse prefix operator expression
    private parsePrefixOperatorExpression = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        // Example ++i
        // example operator expression

        let operator = parser.tokens.consume(); // Consume the operator

        // For now only allow -- and ++
        if (
            operator.type !== TokenType.OP_INCREMENT &&
            operator.type !== TokenType.OP_DECREMENT
        )
            throw new ParserError(
                "Expected increment or decrement operator",
                operator,
                operator.type,
            );

        let argument = parser.parseExpression(token.precedence);

        let prefixExpression: AST.PrefixExpression = {
            type: "PrefixExpression",
            operator: operator.value,
            argument: argument,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return prefixExpression;
    };

    // Parse function call expression
    private parseFunctionCall = (
        token: Token,
        parser: Parser,
        left: Expression,
    ): AST.Expression => {
        // Example function()
        // example expression operator

        let callee = left;

        // Expect (
        parser.tokens.expect(TokenType.PUNCT_LPAREN, "Expected opening parenthesis");

        // Parse arguments
        let args: AST.Expression[] = [];
        while (parser.tokens.peek().type !== TokenType.PUNCT_RPAREN) {
            let arg = parser.parseExpression(0);
            args.push(arg);

            // If next token is a comma, consume it
            if (parser.tokens.peek().type === TokenType.PUNCT_COMMA) {
                parser.tokens.consume();
            }
        }

        // Expect )
        parser.tokens.expect(TokenType.PUNCT_RPAREN, "Expected closing parenthesis");

        let functionCall: AST.FunctionCall = {
            type: "FunctionCall",
            functionIdentity: callee as AST.Identifier,
            arguments: args,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return functionCall;
    }

    // Parse postfix operator expression
    private parsePostfixOperatorExpression = (
        token: Token,
        parser: Parser,
        left: Expression,
    ): AST.Expression => {
        // Example i++
        // example expression operator

        let operator = parser.tokens.consume(); // Consume the operator

        // For now only allow -- and ++
        if (
            operator.type !== TokenType.OP_INCREMENT &&
            operator.type !== TokenType.OP_DECREMENT
        )
            throw new ParserError(
                "Expected increment or decrement operator",
                operator,
                operator.type,
            );

        let argument = left;

        let postfixExpression: AST.PostfixExpression = {
            type: "PostfixExpression",
            operator: operator.value,
            argument: argument,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return postfixExpression;
    };

    // Parse member access expression (object->member or object.member)
    private parseMemberAccess = (
        token: Token,
        parser: Parser,
        left: Expression,
    ): AST.Expression => {
        // Check for left handside
        if (!left)
            throw new ParserError(
                "Expect object to access member",
                token,
                token.type,
            );

        // Make sure left is identifier
        // if (left.type !== "exp")
        //     throw new ParserError(
        //         "Expected identifier for object member access",
        //         token,
        //         token.type,
        //     );

        let identifier = left as AST.Identifier;

        // Do we have . or ->
        let isPointer = false;

        let accessType = parser.tokens.consume(); // Consume -> or .
        isPointer = accessType.type === TokenType.PUNCT_ARROW ? true : false;

        // Expect an indentifier
        let memberIdentifier: Token = parser.tokens.expect(
            TokenType.IDENTIFIER,
            "Expected member identifier",
        );

        if (memberIdentifier.type !== TokenType.IDENTIFIER)
            throw new ParserError(
                "Expected idenifier for object member identifier",
                token,
                TokenType.IDENTIFIER,
            );

        let memberAccess: AST.MemberExpression = {
            type: "MemberExpression",
            object: left,
            location: {
                line: token.line,
                column: token.column,
            },
            property: {
                type: "Identifier",
                name: memberIdentifier.value,
                location: {
                    line: memberIdentifier.line,
                    column: memberIdentifier.column,
                },
            },
            isPointer,
        };

        return memberAccess;
    };

    // Parse prefix parentheses expression
    private parsePrefixParentheses = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.expect(
            TokenType.PUNCT_LPAREN,
            "Expected opening parenthesis",
        ); // Consume the opening parenthesis

        // Check for type cast
        const type = parser.tokens.peek();
        if (this.isTypeSpecifier(type)) return this.parseTypeCast(parser);

        const expression = parser.parseExpression(0); // Contains exression + clossing parenthesis

        if (parser.tokens.peek().type !== TokenType.PUNCT_RPAREN) {
            throw new ParserError(
                "Expected closing parenthesis",
                parser.tokens.peek(),
                TokenType.PUNCT_RPAREN,
            );
        }

        parser.tokens.consume(); // Consume the closing parenthesis

        return expression;
    };

    // Parse unary expression
    private parseUnaryExpression = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.consume(); // Consume the operator

        const right = parser.parseExpression(13);

        const unaryExpression: AST.UnaryExpression = {
            type: "UnaryExpression",
            operator: token.value || "",
            argument: right,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return unaryExpression;
    };

    // Parse binary expression
    private parseBinaryExpression = (
        token: Token,
        parser: Parser,
        left: AST.Expression | undefined,
    ): AST.Expression => {
        if (!left) {
            throw new ParserError(
                "Expected left hand side of binary expression",
                token,
                token.type,
            );
        }

        let precedence = token.precedence || 0;

        parser.tokens.consume(); // Consume the operator

        const right = parser.parseExpression(precedence);

        const binaryExpression: AST.BinaryExpression = {
            type: "BinaryExpression",
            operator: token.value,
            left: left,
            right: right,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return binaryExpression;
    };

    // Parse array access expression
    private parseArrayAccess = (
        token: Token,
        parser: Parser,
        left: Expression,
    ): AST.Expression => {
        // Example object[5]
        //         expression[expression]

        // Expect [
        parser.tokens.expect(TokenType.PUNCT_LBRACKET, "Expected array access '['");

        // Get Expression
        let access = this.parseExpression(0);

        // Expect ]
        parser.tokens.expect(TokenType.PUNCT_RBRACKET, "Expected array access ']'");

        let arrayAccess: AST.ArrayExpression = {
            type: "ArrayExpression",
            array: left as AST.Identifier,
            index: access,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return arrayAccess;
    };

    // Parse integer literal expression
    private parseIntLiteral = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {

        parser.tokens.expect(TokenType.LITERAL_INTEGER, "Expected integer literal");

        // Allows javascript to parse the integer of any base
        let radix = 10;
        let value = token.value;

        if (token.value?.startsWith("0x")) {
            radix = 16;
            value = token.value.slice(2);
        } else if (token.value?.startsWith("0b")) {
            radix = 2;
            value = token.value.slice(2);

        } else if (token.value?.startsWith("0") && token?.value.length > 1) {
            radix = 8;
            value = token.value.slice(1);
        }

        const intLiteral: AST.IntegerLiteral = {
            type: "IntegerLiteral",
            value: parseInt(value, radix),
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return intLiteral;
    };

    // Parse float literal
    private parseFloatLiteral = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.expect(TokenType.LITERAL_FLOAT, "Expected float literal");
        const floatLiteral: AST.FloatLiteral = {
            type: "FloatLiteral",
            value: parseFloat(token.value),
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return floatLiteral;
    };

    // Parse string literal
    private parseStringLiteral = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.expect(TokenType.LITERAL_STRING, "Expected string literal");
        const stringLiteral: AST.StringLiteral = {
            type: "StringLiteral",
            value: token.value,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return stringLiteral;
    };

    // Parse char literal
    private parseCharLiteral = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {


        parser.tokens.expect(TokenType.LITERAL_CHAR, "Expected char literal");

        let value = token.value;

        // Regular expression to match common escape sequences
        let escapePattern = /\\(0x[0-9a-fA-F]+|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[abfnrtv0])/g;

        // Replace the extra backslash
        let processedChar = value.replace(escapePattern, (match, group) => {
            // Remove the leading backslash and interpret the rest
            return eval(`'${match}'`);
        });


        const charLiteral: AST.CharLiteral = {
            type: "CharLiteral",
            value: processedChar,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return charLiteral;
    }

    // Parse boolean literal
    private parseBooleanLiteral = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.expect(TokenType.LITERAL_BOOL, "Expected boolean literal");
        const booleanLiteral: AST.BooleanLiteral = {
            type: "BooleanLiteral",
            value: token.value === "true",
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return booleanLiteral;
    };

    // Parse identifier
    private parseIdentifier = (
        token: Token,
        parser: Parser,
    ): AST.Expression => {
        parser.tokens.expect(TokenType.IDENTIFIER, "Expected identifier");
        const identifier: AST.Identifier = {
            type: "Identifier",
            name: `${token.value}`,
            location: {
                line: token.line,
                column: token.column,
            },
        };

        return identifier;
    };


    // Pattern matching for type specifier
    private isTypeSpecifier = (token: Token): boolean => {
        return (
            token.type === TokenType.KEYWORD_INT ||
            token.type === TokenType.KEYWORD_CHAR ||
            token.type === TokenType.KEYWORD_VOID ||
            token.type === TokenType.KEYWORD_FILE ||
            token.type === TokenType.KEYWORD_FLOAT ||
            token.type === TokenType.KEYWORD_DOUBLE ||
            token.type === TokenType.KEYWORD_STRUCT ||
            token.type === TokenType.KEYWORD_UNION ||
            token.type === TokenType.KEYWORD_ENUM ||
            token.type === TokenType.KEYWORD_TYPEDEF
        );
    };

    // Pattern matching for modifier
    // Long Long is not supported yet
    private isModifier = (token: Token): boolean => {
        return (
            token.type === TokenType.KEYWORD_REGISTER ||
            token.type === TokenType.KEYWORD_EXTERN ||
            token.type === TokenType.KEYWORD_AUTO ||
            token.type === TokenType.KEYWORD_STATIC ||
            token.type === TokenType.KEYWORD_CONST ||
            token.type === TokenType.KEYWORD_VOLATILE ||
            token.type === TokenType.KEYWORD_UNSIGNED ||
            token.type === TokenType.KEYWORD_SIGNED ||
            token.type === TokenType.KEYWORD_LONG ||
            token.type === TokenType.KEYWORD_STATIC ||
            token.type === TokenType.KEYWORD_SHORT
        );
    }

    // Convert value type to string
    private typeToString = (type: TokenType): string => {
        switch (type) {
            case TokenType.KEYWORD_INT:
                return "int";
            case TokenType.KEYWORD_CHAR:
                return "char";
            case TokenType.KEYWORD_VOID:
                return "void";
            case TokenType.KEYWORD_FILE:
                return "FILE";
            case TokenType.KEYWORD_FLOAT:
                return "float";
            case TokenType.KEYWORD_DOUBLE:
                return "double";
            case TokenType.KEYWORD_STRUCT:
                return "struct";
            case TokenType.KEYWORD_STATIC:
                return "static";
            case TokenType.KEYWORD_UNION:
                return "union";
            case TokenType.KEYWORD_ENUM:
                return "enum";
            case TokenType.KEYWORD_TYPEDEF:
                return "typedef";


            default:
                return "unknown: " + type;
        }
    };


    // Add parse function to map
    private registerParseFunction = (
        functionMap: Map<TokenType, ParseFunction>,
        type: TokenType,
        func: ParseFunction,
    ) => {
        functionMap.set(type, func);
    };

    // Get parse function from map
    private getParseFunction = (
        functionMap: Map<TokenType, ParseFunction>,
        type: TokenType,
    ): ParseFunction => {
        return functionMap.get(type);
    };


    // Register each prefix parse function to it's token type
    private registerAllPrefixFunctions = () => {
        // ========== Prefix parse functions ===========

        // Literals
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.LITERAL_INTEGER,
            this.parseIntLiteral.bind(this),
        ); // Integer literal
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.LITERAL_CHAR,
            this.parseCharLiteral.bind(this),
        )// Char literal
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.LITERAL_FLOAT,
            this.parseFloatLiteral.bind(this),
        ); // Float literal
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.LITERAL_STRING,
            this.parseStringLiteral.bind(this),
        ); // String literal
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.LITERAL_BOOL,
            this.parseBooleanLiteral.bind(this),
        ); // Boolean literal
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.IDENTIFIER,
            this.parseIdentifier.bind(this),
        ); // Identifier
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.KEYWORD_SIZEOF,
            this.parseSizeOf.bind(this),
        ); // Sizeof
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.PUNCT_LPAREN,
            this.parsePrefixParentheses.bind(this),
        ); // Parentheses, Type cast, Function call
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_MINUS,
            this.parseUnaryExpression.bind(this),
        ); // Unary minus
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_PLUS,
            this.parseUnaryExpression.bind(this),
        ); // Unary plus
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_LOGICAL_NOT,
            this.parseUnaryExpression.bind(this),
        ); // Logical not
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_BITWISE_NOT,
            this.parseUnaryExpression.bind(this),
        ); // Bitwise not
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_MULTIPLY,
            this.parseUnaryExpression.bind(this),
        ) // Dereference
        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_BITWISE_AND,
            this.parseUnaryExpression.bind(this),
        ) // Address of

        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_INCREMENT,
            this.parsePrefixOperatorExpression.bind(this),
        ); // Prefix increment

        this.registerParseFunction(
            this.prefixParseFunctions,
            TokenType.OP_DECREMENT,
            this.parsePrefixOperatorExpression.bind(this),
        ); // Prefix decrement
    }

    // Register each infix parse function to it's token type
    private registerAllInfixFunctions = () => {
        // ========== Infix parse functions ===========

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.PUNCT_DOT,
            this.parseMemberAccess.bind(this),
        ); // Member Access

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.PUNCT_ARROW,
            this.parseMemberAccess.bind(this),
        ); // Member Access pointer

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_PLUS,
            this.parseBinaryExpression.bind(this),
        ); // Addition

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MULTIPLY,
            this.parseBinaryExpression.bind(this),
        ); // Multiplication

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_DIVIDE,
            this.parseBinaryExpression.bind(this),
        ); // Division

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MINUS,
            this.parseBinaryExpression.bind(this),
        ); // Subtraction

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MODULO,
            this.parseBinaryExpression.bind(this),
        ); // Modulus

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_BITWISE_AND,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise AND

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_BITWISE_OR,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise OR

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_BITWISE_XOR,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise XOR

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LSHIFT,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise Shift Left

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_RSHIFT,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise Shift Right

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_PLUS_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Plus Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MINUS_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Minus Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MULT_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Multiply Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_DIV_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Divide Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_MOD_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Modulus Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LSHIFT_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Left Shift Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_RSHIFT_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Right Shift Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_AND_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise AND Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_XOR_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise XOR Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_OR_ASSIGN,
            this.parseBinaryExpression.bind(this),
        ); // Bitwise OR Assignment

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_EQUAL,
            this.parseBinaryExpression.bind(this),
        ); // Equal

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_NOT_EQUAL,
            this.parseBinaryExpression.bind(this),
        ); // Not Equal

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_GREATER,
            this.parseBinaryExpression.bind(this),
        ); // Greater

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LESS,
            this.parseBinaryExpression.bind(this),
        ); // Less

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_GREATER_EQUAL,
            this.parseBinaryExpression.bind(this),
        ); // Greater Equal

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LESS_EQUAL,
            this.parseBinaryExpression.bind(this),
        ); // Less Equal

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LOGICAL_AND,
            this.parseBinaryExpression.bind(this),
        ); // Logical AND

        this.registerParseFunction(
            this.infixParseFunctions,
            TokenType.OP_LOGICAL_OR,
            this.parseBinaryExpression.bind(this),
        ); // Logical OR

        // this.registerParseFunction(
        //     this.infixParseFunctions,
        //     TokenType.PUNCT_COMMA,
        //     this.parseBinaryExpression.bind(this),
        // ); // Comma Operator


    }

    // Register each postfix parse function to it's token type
    private registerAllPostfixFunctions = () => {
        // ========== Postfix parse functions ===========

        this.registerParseFunction(
            this.postfixParseFunctions,
            TokenType.PUNCT_LBRACKET,
            this.parseArrayAccess.bind(this),
        ); // Array Access

        this.registerParseFunction(
            this.postfixParseFunctions,
            TokenType.OP_INCREMENT,
            this.parsePostfixOperatorExpression.bind(this),
        ); // Postfix increment

        this.registerParseFunction(
            this.postfixParseFunctions,
            TokenType.OP_DECREMENT,
            this.parsePostfixOperatorExpression.bind(this),
        ); // Postfix decrement

        this.registerParseFunction(
            this.postfixParseFunctions,
            TokenType.PUNCT_LPAREN,
            this.parseFunctionCall.bind(this),
        ); // Function Call
    }

}


// Prefix (e.g. -1, !true)
type PrefixParseFunction = (
    token: Token,
    parser: Parser,
) => AST.Expression;

// Infix (e.g. 1 + 2, true && false)
type InfixParseFunction = (
    token: Token,
    parser: Parser,
    left: AST.Expression,
) => AST.Expression;

// Postfix (e.g. i++, i--)
type PostfixParseFunction = (
    token: Token,
    parser: Parser,
    left: AST.Expression,
) => AST.Expression;

type ParseFunction =
    | PrefixParseFunction
    | InfixParseFunction
    | PostfixParseFunction;
