import {Token, TokenType} from "./CTokens.ts";
import {ScannerError} from "./CErrors.ts";

/**
 * CVIS Visualisation suite: Scanner - Ben McIlveen
 * Produces tokens from the source code
 */

export class Scanner {
    source: string;
    position: number;
    currentChar: string;
    line: number;
    column: number;

    constructor(source: string) {
        this.source = source;
        this.position = 0;
        this.currentChar = source[0];
        this.line = 1;
        this.column = 1;
    }

    // Move the scanner to the next character in the source code
    move = (): void => {
        this.position++;
        this.column++;
        if (this.currentChar === "\n") {
            this.line++;
            this.column = 1;
        }

        // Check if we've reached the end of the source code
        if (this.position >= this.source.length) {
            this.currentChar = ""; // or null
            return;
        }

        // Otherwise, get the next character in the source code
        this.currentChar = this.source[this.position];
    };

    // Get the next character in the source code without moving the scanner
    scanAhead = (offset: number = 1): string => {
        if (this.position + offset >= this.source.length) {
            return "";
        }
        return this.source[this.position + offset];
    };

    // Get the next character in the source code and move the scanner
    skipWhitespace = (): void => {
        // Skip whitespace
        while (
            this.currentChar === " " ||
            this.currentChar === "\t" ||
            this.currentChar === "\n" ||
            this.currentChar === "\r"
            ) {
            this.move();
        }

        // Skipp any comments
        if (this.isCommentSingle()) {
            this.collectSingleComment();
            this.skipWhitespace();
        }

        if (this.isCommentMulti()) {
            this.collectMultiComment();
            this.skipWhitespace();
        }
    };

    // Get the next token in the source code
    getNextToken = (): Token => {
        // Skip whitespace
        this.skipWhitespace();

        // Preprocessor directives such as #include are handled by the host
        // environment rather than by the teaching VM.  Ignore the directive
        // line while preserving line/column information for the C program.
        if (this.currentChar === "#") {
            this.skipPreprocessorDirective();
            return this.getNextToken();
        }

        // Check for eof
        if (this.position >= this.source.length) {
            return {
                type: TokenType.EOF,

                precedence: -1,
                line: this.line,
                column: this.column,
            };
        }

        // ---------- String Literals ----------
        if (this.isStringLiteral(this.currentChar)) {
            return {
                type: TokenType.LITERAL_STRING,
                value: this.collectString(),
                precedence: 15,
                line: this.line,
                column: this.column,
            };
        }

        // ---------- Char Literals ----------
        if (this.isCharLiteral(this.currentChar)) {
            return {
                type: TokenType.LITERAL_CHAR,
                value: this.collectChar(),
                precedence: 15,
                line: this.line,
                column: this.column,
            };
        }

        // ---------- Punctuation ----------
        if (this.isPunctuation(this.currentChar)) {
            return this.processPunctuation();
        }

        // ---------- Operators ----------
        if (this.isOperator(this.currentChar)) {
            return this.processOperators();
        }

        // ---------- Numbers ----------
        if (this.isDigit(this.currentChar)) {
            return this.processNumber();
        }

        // ---------- Keywords and Keywords ----------
        if (this.isLetter(this.currentChar)) {
            return this.processIdentifierAndKeywords();
        }

        // Did not match any token
        throw this.createError("Invalid character");
    };

    private skipPreprocessorDirective = (): void => {
        while (this.currentChar !== "" && this.currentChar !== "\n") {
            this.move();
        }
        if (this.currentChar === "\n") this.move();
    };

    getAllTokens = (): Token[] => {
        const tokens: Token[] = [];
        let token: Token;

        do {
            token = this.getNextToken();
            tokens.push(token);
        } while (token.type !== TokenType.EOF);

        return tokens;
    };

    // Process identifiers and keywords
    processIdentifierAndKeywords = (): Token => {
        let identifier = this.collectIdentifier();
        let type;

        // Check if the identifier is a keyword
        switch (identifier) {
            case "if":
                type = TokenType.KEYWORD_IF;
                break;
            case "while":
                type = TokenType.KEYWORD_WHILE;
                break;
            case "do":
                type = TokenType.KEYWORD_DO;
                break;
            case "else":
                type = TokenType.KEYWORD_ELSE;
                break;
            case "switch":
                type = TokenType.KEYWORD_SWITCH;
                break;
            case "break":
                type = TokenType.KEYWORD_BREAK;
                break;
            case "continue":
                type = TokenType.KEYWORD_CONTINUE;
                break;
            case "return":
                type = TokenType.KEYWORD_RETURN;
                break;
            case "for":
                type = TokenType.KEYWORD_FOR;
                break;
            case "case":
                type = TokenType.KEYWORD_CASE;
                break;
            case "default":
                type = TokenType.KEYWORD_DEFAULT;
                break;
            case "goto":
                type = TokenType.KEYWORD_GOTO;
                break;
            case "int":
                type = TokenType.KEYWORD_INT;
                break;
            case "char":
                type = TokenType.KEYWORD_CHAR;
                break;
            case "float":
                type = TokenType.KEYWORD_FLOAT;
                break;
            case "double":
                type = TokenType.KEYWORD_DOUBLE;
                break;
            case "void":
                type = TokenType.KEYWORD_VOID;
                break;
            case "FILE":
                type = TokenType.KEYWORD_FILE;
                break;
            case "long":
                type = TokenType.KEYWORD_LONG;
                break;
            case "short":
                type = TokenType.KEYWORD_SHORT;
                break;
            case "signed":
                type = TokenType.KEYWORD_SIGNED;
                break;
            case "unsigned":
                type = TokenType.KEYWORD_UNSIGNED;
                break;
            case "auto":
                type = TokenType.KEYWORD_AUTO;
                break;
            case "register":
                type = TokenType.KEYWORD_REGISTER;
                break;
            case "static":
                type = TokenType.KEYWORD_STATIC;
                break;
            case "extern":
                type = TokenType.KEYWORD_EXTERN;
                break;
            case "const":
                type = TokenType.KEYWORD_CONST;
                break;
            case "volatile":
                type = TokenType.KEYWORD_VOLATILE;
                break;
            case "sizeof":
                type = TokenType.KEYWORD_SIZEOF;
                break;

            case "typedef":
                type = TokenType.KEYWORD_TYPEDEF;
                break;
            case "struct":
                type = TokenType.KEYWORD_STRUCT;
                break;
            case "union":
                type = TokenType.KEYWORD_UNION;
                break;
            case "enum":
                type = TokenType.KEYWORD_ENUM;
                break;
            case "true":
                type = TokenType.LITERAL_BOOL;
                break;
            case "false":
                type = TokenType.LITERAL_BOOL;
                break;
        }

        // Was it a keyword?
        if (type === undefined) {
            type = TokenType.IDENTIFIER;
            return {
                type: type,
                value: identifier,
                precedence: 15,
                line: this.line,
                column: this.column,
            };
        }

        // Was it a boolean?
        if (type === TokenType.LITERAL_BOOL) {
            return {
                type: type,
                value: identifier,
                precedence: 15,
                line: this.line,
                column: this.column,
            };
        }

        // It was a keyword
        return {
            type: type,
            precedence: 0,
            line: this.line,
            column: this.column,
        };
    };

    // Process numbers
    processNumber = (): Token => {
        let number = this.collectNumber();
        let precedence = 15;
        let type;

        // Check if the number is a float
        if (number.includes(".")) {
            type = TokenType.LITERAL_FLOAT;
        } else {
            type = TokenType.LITERAL_INTEGER;
        }

        return {
            type: type,
            value: number,
            precedence,
            line: this.line,
            column: this.column,
        };
    };

    // Process punctuation
    processPunctuation = (): Token => {
        let punctuation = this.collectPunctuation();
        let type,
            precedence = 0;

        switch (punctuation) {
            case "(":
                type = TokenType.PUNCT_LPAREN;
                precedence = 15;
                break;
            case ")":
                type = TokenType.PUNCT_RPAREN;
                precedence = 15;
                break;
            case "{":
                type = TokenType.PUNCT_LBRACE;
                break;
            case "}":
                type = TokenType.PUNCT_RBRACE;
                break;
            case "[":
                type = TokenType.PUNCT_LBRACKET;
                precedence = 14;
                break;
            case "]":
                type = TokenType.PUNCT_RBRACKET;
                precedence = 14;
                break;
            case ";":
                type = TokenType.PUNCT_SEMICOLON;
                break;
            case ",":
                precedence = 1;
                type = TokenType.PUNCT_COMMA;
                break;
            case ":":
                type = TokenType.PUNCT_COLON;
                precedence = 3;
                break;
            case ".":
                type = TokenType.PUNCT_DOT;
                precedence = 14;
                break;
            case "->":
                type = TokenType.PUNCT_ARROW;
                precedence = 14;
                break;
            case "?":
                type = TokenType.PUNCT_QUESTION;
                precedence = 3;
                break;
        }

        // Check if the punctuation is valid
        if (type === undefined) {
            throw this.createError("Invalid punctuation: " + punctuation);
        }

        return {
            type: type,
            precedence,
            line: this.line,
            column: this.column,
        };
    };

    // Proccess Operators
    processOperators = (): Token => {
        let operator = this.collectOperator();
        let type,
            precedence = 0;


        switch (operator) {
            // Arithmetic Operators
            case "+":
                type = TokenType.OP_PLUS;
                precedence = 12;
                break;
            case "-":
                type = TokenType.OP_MINUS;
                precedence = 12;
                break;
            case "*":
                type = TokenType.OP_MULTIPLY;
                precedence = 13;
                break;
            case "/":
                type = TokenType.OP_DIVIDE;
                precedence = 13;
                break;
            case "%":
                type = TokenType.OP_MODULO;
                precedence = 13;
                break;
            case "++":
                type = TokenType.OP_INCREMENT;
                precedence = 14;
                break;
            case "--":
                type = TokenType.OP_DECREMENT;
                precedence = 14;
                break;
            // Assignment Operators
            case "=":
                type = TokenType.OP_ASSIGN;
                precedence = 2;
                break;
            case "+=":
                type = TokenType.OP_PLUS_ASSIGN;
                precedence = 2;
                break;
            case "-=":
                type = TokenType.OP_MINUS_ASSIGN;
                precedence = 2;
                break;
            case "*=":
                type = TokenType.OP_MULT_ASSIGN;
                precedence = 2;
                break;
            case "/=":
                type = TokenType.OP_DIV_ASSIGN;
                precedence = 2;
                break;
            case "%=":
                type = TokenType.OP_MOD_ASSIGN;
                precedence = 2;
                break;
            case "<<=":
                type = TokenType.OP_LSHIFT_ASSIGN;
                precedence = 2;
                break;
            case ">>=":
                type = TokenType.OP_RSHIFT_ASSIGN;
                precedence = 2;
                break;
            case "&=":
                type = TokenType.OP_AND_ASSIGN;
                precedence = 2;
                break;
            case "^=":
                type = TokenType.OP_XOR_ASSIGN;
                precedence = 2;
                break;
            case "|=":
                type = TokenType.OP_OR_ASSIGN;
                precedence = 2;
                break;
            // Comparison Operators
            case "==":
                type = TokenType.OP_EQUAL;
                precedence = 9;
                break;
            case "!=":
                type = TokenType.OP_NOT_EQUAL;
                precedence = 9;
                break;
            case ">":
                type = TokenType.OP_GREATER;
                precedence = 10;
                break;
            case "<":
                type = TokenType.OP_LESS;
                precedence = 10;
                break;
            case ">=":
                type = TokenType.OP_GREATER_EQUAL;
                precedence = 10;
                break;
            case "<=":
                type = TokenType.OP_LESS_EQUAL;
                precedence = 10;
                break;
            // Logical Operators
            case "&&":
                type = TokenType.OP_LOGICAL_AND;
                precedence = 5;
                break;
            case "||":
                type = TokenType.OP_LOGICAL_OR;
                precedence = 4;
                break;
            case "!":
                type = TokenType.OP_LOGICAL_NOT;
                precedence = 10;
                break;
            // Bitwise Operators
            case "&":
                type = TokenType.OP_BITWISE_AND;
                precedence = 8;
                break;
            case "|":
                type = TokenType.OP_BITWISE_OR;
                precedence = 6;
                break;
            case "^":
                type = TokenType.OP_BITWISE_XOR;
                precedence = 7;
                break;
            case "~":
                type = TokenType.OP_BITWISE_NOT;
                precedence = 14;
                break;
            case "<<":
                type = TokenType.OP_LSHIFT;
                precedence = 11;
                break;
            case ">>":
                type = TokenType.OP_RSHIFT;
                precedence = 11;
                break;
        }

        if (type === undefined) {
            throw this.createError("Invalid operator");
        }

        return {
            type: type,
            precedence,
            value: operator,
            line: this.line,
            column: this.column,
        };
    };

    // Collect punctuation
    collectPunctuation = (): string => {
        let punctuation = "";

        // Check if the first character is a valid punctuation
        if (
            !(
                this.isPunctuation(this.currentChar) ||
                (this.currentChar === "-" && this.scanAhead() === ">")
            )
        ) {
            throw this.createError(`Invalid punctuation '${this.currentChar}'`);
        }

        punctuation += this.currentChar;
        this.move();

        // Don't collect multiple of anything other than startign with - or .
        if (!(punctuation === "-")) {
            return punctuation;
        }

        // Collect the punctuation
        if (this.currentChar === ">") {
            punctuation += this.currentChar;
            this.move();
        }

        return punctuation;
    };

    // Collect comments
    collectMultiComment = (): string => {
        let comment = "";

        if (!this.isCommentMulti()) {
            throw this.createError("Invalid multi comment");
        }

        // skip the first two characters
        this.move();
        this.move();

        // Collect the comment
        while (this.currentChar !== "*" && this.scanAhead() !== "/") {
            comment += this.currentChar;
            this.move();
        }

        // skip the last two characters
        this.move();
        this.move();

        return comment;
    };

    // Collect comments
    collectSingleComment = (): string => {
        let comment = "";

        if (!this.isCommentSingle()) {
            throw this.createError("Invalid single comment");
        }

        // skip the first two characters
        this.move();
        this.move();

        // Collect the comment
        while (this.currentChar !== "\n") {
            comment += this.currentChar;
            this.move();
        }

        return comment;
    };

    // collect char literals
    collectChar = (): string => {
        let char = "";

        // Check if the first character is a single quote
        if (!this.isCharLiteral(this.currentChar)) {
            throw this.createError("Invalid char literal");
        }

        // skip the first character
        this.move();

        // Collect the char
        while (this.currentChar !== "'") {
            char += this.currentChar;
            this.move();
        }

        // skip the last character
        this.move();

        return char;
    };

    // collect string literals
    collectString = (): string => {
        let string = "";

        // Check if the first character is a double quote
        if (!this.isStringLiteral(this.currentChar)) {
            throw this.createError("Invalid string literal");
        }

        // skip the first character
        this.move();

        // Collect the string
        while (this.currentChar !== '"') {
            string += this.currentChar;
            this.move();
        }

        // skip the last character
        this.move();

        return string;
    };

    // collect operators
    collectOperator = (): string => {
        let operator = "";

        // Check if the first character is a valid operator
        if (!this.isOperator(this.currentChar)) {
            throw this.createError("Invalid operator");
        }

        // Collect the operator unless **
        while (this.isOperator(this.currentChar)) {
            operator += this.currentChar;
            this.move();

            // BODGE FIX: Allows for bigger **...
            // LIMITATION: CHECK FOR VALID COMBINATIONS
            if (operator === "*" && this.currentChar === "*")
                break;

        }

        return operator;
    };

    // Collect the number until we reach a character that is not a digit (inc int and float)
    collectNumber = (): string => {
        try {
            if (this.isHexStart()) {
                return this.collectHexDecimal();
            }
            if (this.isBinaryStart()) {
                return this.collectBinary();
            }
            if (this.isOctalStart()) {
                return this.collectOctal();
            }

            return this.collectDecimalOrScientific();
        } catch (e) {
            if (e instanceof ScannerError) {
                throw e;
            }
            throw this.createError("Invalid number format");
        }
    };

    // Collect the identifier until we reach a character that is not a letter or digit
    collectIdentifier = (): string => {
        let identifier = "";

        // First char must be a letter or underscore
        if (
            this.isLetter(this.currentChar) ||
            this.isUnderscore(this.currentChar)
        ) {
            identifier += this.currentChar;
            this.move();
        } else {
            throw this.createError("Invalid identifier format");
        }

        while (
            this.isLetter(this.currentChar) ||
            this.isDigit(this.currentChar) ||
            this.isUnderscore(this.currentChar)
            ) {
            identifier += this.currentChar;
            this.move();
        }

        return identifier;
    };

    // Collect hex numbers
    collectHexDecimal = (): string => {
        let hex = "";

        // First char must be 0
        if (!this.isHexStart())
            throw this.createError("Invalid hexadecimal number format");

        // First two chars must be 0x
        hex += this.currentChar;
        this.move();
        hex += this.currentChar;
        this.move();

        // Must be a valid hex character after 0x
        if (!this.isHexDigit(this.currentChar)) {
            throw this.createError(
                "Invalid hexadecimal - must be a valid hex character after 0x",
            );
        }

        // Collect hex valid characters
        while (this.isHexDigit(this.currentChar)) {
            hex += this.currentChar;
            this.move();
        }

        return hex;
    };

    // Collect binary numbers
    collectBinary = (): string => {
        let binary = "";

        // First char must be 0
        if (!this.isBinaryStart())
            throw this.createError("Invalid binary number format");

        // First two chars must be 0b
        binary += this.currentChar;
        this.move();
        binary += this.currentChar;
        this.move();

        // Must be a valid binary character after 0b
        if (!this.isBinaryDigit(this.currentChar)) {
            throw this.createError(
                "Invalid binary - must be a valid binary character after 0b",
            );
        }

        // Collect binary valid characters
        while (this.isBinaryDigit(this.currentChar)) {
            binary += this.currentChar;
            this.move();
        }

        return binary;
    }

    // Collect octal numbers
    collectOctal = (): string => {
        let octal = "";

        // First char must be 0
        if (!this.isOctalStart())
            throw this.createError("Invalid octal number format");

        // Take the first 0
        octal += this.currentChar;
        this.move();

        // Collect octal valid characters (0-7)
        // @ts-ignore
        while (this.isOctalDigit(this.currentChar)) {
            octal += this.currentChar;
            this.move();
        }

        return octal;
    };

    // Collect decimal and scientific notation numbers
    collectDecimalOrScientific = (): string => {
        let decimal = "";
        let hasDecimal = false;
        // Expect a digit
        if (!this.isDigit(this.currentChar))
            throw this.createError("Invalid decimal number format - expected digit");

        // Take the first digit
        decimal += this.currentChar;
        this.move();

        // Decimal
        while (this.isDigit(this.currentChar) || this.isDecimal(this.currentChar)) {
            if (this.isDecimal(this.currentChar)) {
                if (hasDecimal) {
                    throw this.createError(
                        "Invalid decimal number format - multiple decimal points",
                    );
                }
                hasDecimal = true;
            }
            decimal += this.currentChar;
            this.move();
        }
        // Scientific notation
        if (this.currentChar.toLowerCase() === "e") {
            // Check if the scientific notation is valid
            if (!this.isValidScientific())
                throw this.createError("Invalid scientific notation format");
            // Take the notation
            while (this.isScientificDigit(this.currentChar)) {
                decimal += this.currentChar;
                this.move();
            }
        }

        return decimal;
    };

    // Check if the number is a hex number
    private isHexStart = (): boolean => {
        // Check if the first two characters are 0x
        let stance = this.currentChar === "0" && this.scanAhead() === "x";

        // Throw an error if the 3rd character is not a valid hex character
        if (stance) {
            if (
                this.scanAhead(2)
                    .toLowerCase()
                    .match(/[0-9a-f]/) === null
            ) {
                return false;
            }
            return true;
        } else return false;
    };

    // Check if the number is a binary number
    private isBinaryStart = (): boolean => {
        // Check if the first two characters are 0b
        let stance = this.currentChar === "0" && this.scanAhead().toLowerCase() === "b";

        // Throw an error if the 3rd character is not a valid binary character
        if (stance) {
            if (
                this.scanAhead(2)
                    .toLowerCase()
                    .match(/[01]/) === null
            ) {
                return false;
            }
            return true;
        } else return false;
    }

    // Check if the number is an octal number
    private isOctalStart = (): boolean => {
        return this.currentChar === "0" && this.isDigit(this.scanAhead());
    };

    // Check if the current character is the start of a comment
    // private isCommentStart = (): boolean => {
    //   return this.isCommentSingle() || this.isCommentMulti();
    // };

    // Single line comment
    private isCommentSingle = (): boolean => {
        return this.currentChar === "/" && this.scanAhead() === "/";
    };

    // Multi line comment
    private isCommentMulti = (): boolean => {
        return this.currentChar === "/" && this.scanAhead() === "*";
    };

    private isOperator = (char: string): boolean => {
        return char.match(/[\+\-\*\/\%\&\|\^\~\!\=\<\>]/) !== null;
    };

    private isPunctuation = (char: string): boolean => {
        if (char === "-" && this.scanAhead() === ">") return true;
        return char.match(/[(){}\[\];,:.?]|->|\.{3}/) !== null;
    };

    private isStringLiteral = (char: string): boolean => {
        return char === '"';
    };

    private isCharLiteral = (char: string): boolean => {
        return char === "'";
    };

    private isLetter = (char: string): boolean => {
        return char.match(/[a-zA-Z]/) !== null;
    };

    private isUnderscore = (char: string): boolean => {
        return char === "_";
    };

    private isDecimal = (char: string): boolean => {
        return char === ".";
    };

    private isDigit = (char: string): boolean => {
        return char.match(/[0-9]/) !== null;
    };

    private isBinaryDigit = (char: string): boolean => {
        return char.match(/[01]/) !== null;
    }

    private isHexDigit = (char: string): boolean => {
        return char.toLowerCase().match(/[0-9a-f]/) !== null;
    };

    private isOctalDigit = (char: string): boolean => {
        return char.match(/[0-7]/) !== null;
    };

    private isScientificDigit = (char: string): boolean => {
        // accept +,-,e,0-9
        return char.match(/[0-9e+-]/) !== null;
    };

    private isValidScientific = (): boolean => {
        let offset = 1;

        if (this.currentChar !== "e") return false;

        if (this.scanAhead(offset) === "+" || this.scanAhead(offset) === "-")
            offset++;

        return this.isDigit(this.scanAhead(offset));
    };

    private createError = (message: string): ScannerError => {
        const snippet = this.source.substring(this.position - 5, this.position + 5);
        return new ScannerError(message, this.line, this.column, snippet);
    };
}
