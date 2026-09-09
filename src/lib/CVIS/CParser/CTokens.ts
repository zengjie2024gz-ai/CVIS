/**
 * CVIS Visualisation suite: Token types - Ben McIlveen
 */

export enum TokenType {
    // Control Flow Keywords
    KEYWORD_IF,
    KEYWORD_WHILE,
    KEYWORD_DO,
    KEYWORD_ELSE,
    KEYWORD_SWITCH,
    KEYWORD_BREAK,
    KEYWORD_CONTINUE,
    KEYWORD_RETURN,
    KEYWORD_FOR,
    KEYWORD_CASE,
    KEYWORD_DEFAULT,
    KEYWORD_GOTO,

    // Data Type Keywords
    KEYWORD_INT,
    KEYWORD_CHAR,
    KEYWORD_FLOAT,
    KEYWORD_DOUBLE,
    KEYWORD_VOID,
    KEYWORD_FILE,
    KEYWORD_LONG,
    KEYWORD_SHORT,
    KEYWORD_SIGNED,
    KEYWORD_UNSIGNED,

    // Storage Class Keywords
    KEYWORD_AUTO,
    KEYWORD_REGISTER,
    KEYWORD_STATIC,
    KEYWORD_EXTERN,

    // Type Qualifiers
    KEYWORD_CONST,
    KEYWORD_VOLATILE,

    // Special Keywords
    KEYWORD_SIZEOF,
    KEYWORD_TYPEDEF,
    KEYWORD_STRUCT,
    KEYWORD_UNION,
    KEYWORD_ENUM,

    // Arithmetic Operators
    OP_PLUS, // +
    OP_MINUS, // -
    OP_MULTIPLY, // *
    OP_DIVIDE, // /
    OP_MODULO, // %
    OP_INCREMENT, // ++
    OP_DECREMENT, // --

    // Assignment Operators
    OP_ASSIGN, // =
    OP_PLUS_ASSIGN, // +=
    OP_MINUS_ASSIGN, // -=
    OP_MULT_ASSIGN, // *=
    OP_DIV_ASSIGN, // /=
    OP_MOD_ASSIGN, // %=
    OP_LSHIFT_ASSIGN, // <<=
    OP_RSHIFT_ASSIGN, // >>=
    OP_AND_ASSIGN, // &=
    OP_XOR_ASSIGN, // ^=
    OP_OR_ASSIGN, // |=

    // Comparison Operators
    OP_EQUAL, // ==
    OP_NOT_EQUAL, // !=
    OP_GREATER, // >
    OP_LESS, // <
    OP_GREATER_EQUAL, // >=
    OP_LESS_EQUAL, // <=

    // Logical Operators
    OP_LOGICAL_AND, // &&
    OP_LOGICAL_OR, // ||
    OP_LOGICAL_NOT, // !

    // Bitwise Operators
    OP_BITWISE_AND, // &
    OP_BITWISE_OR, // |
    OP_BITWISE_XOR, // ^
    OP_BITWISE_NOT, // ~
    OP_LSHIFT, // <<
    OP_RSHIFT, // >>

    // Punctuation
    PUNCT_LPAREN, // (
    PUNCT_RPAREN, // )
    PUNCT_LBRACE, // {
    PUNCT_RBRACE, // }
    PUNCT_LBRACKET, // [
    PUNCT_RBRACKET, // ]
    PUNCT_SEMICOLON, // ;
    PUNCT_COMMA, // ,
    PUNCT_COLON, // :
    PUNCT_DOT, // .
    PUNCT_ARROW, // ->
    PUNCT_ELLIPSIS, // ...
    PUNCT_QUESTION, // ?

    // Literals
    LITERAL_INTEGER,
    LITERAL_FLOAT,
    LITERAL_CHAR,
    LITERAL_STRING,
    LITERAL_BOOL,

    // Identifiers
    IDENTIFIER,


    // Special tokens
    EOF,
}

export interface Token {
    type: TokenType;
    value?: string;
    precedence: number;
    line: number;
    column: number;
}

export const isRightAssociative = (tokenType: TokenType): boolean => {
    switch (tokenType) {

        // Level 2 - Unary operators (right-to-left)
        case TokenType.OP_INCREMENT:  // prefix ++
        case TokenType.OP_DECREMENT:  // prefix --
        case TokenType.OP_LOGICAL_NOT:  // !
        case TokenType.OP_BITWISE_NOT:  // ~
        case TokenType.KEYWORD_SIZEOF:  // sizeof
            return true;

        // Level 13 - Ternary operator (right-to-left)
        case TokenType.PUNCT_QUESTION:  // ? (part of ?:)
            return true;

        // Level 14 - All assignment operators (right-to-left)
        case TokenType.OP_ASSIGN:         // =
        case TokenType.OP_PLUS_ASSIGN:    // +=
        case TokenType.OP_MINUS_ASSIGN:   // -=
        case TokenType.OP_MULT_ASSIGN:    // *=
        case TokenType.OP_DIV_ASSIGN:     // /=
        case TokenType.OP_MOD_ASSIGN:     // %=
        case TokenType.OP_LSHIFT_ASSIGN:  // <<=
        case TokenType.OP_RSHIFT_ASSIGN:  // >>=
        case TokenType.OP_AND_ASSIGN:     // &=
        case TokenType.OP_XOR_ASSIGN:     // ^=
        case TokenType.OP_OR_ASSIGN:      // |=
            return true;

        default:
            return false;
    }
};
