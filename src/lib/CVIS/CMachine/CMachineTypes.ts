import * as AST from "@CParser/CAst.ts";
import {VirtualMemoryMachine} from "@CMachine/CMemory.ts";
import {ProgramStateMachine} from "@CMachine/CMachine.ts";
import {CMachineError} from "@CMachine/CMachineError.ts";

// Converts AST TypeSpecifier to CMachine Type
export function typeSpecifierToType(type: AST.TypeSpecifier): Type {
    let primitiveType: PrimitiveType;
    let pointerLevel: number = 0;

    if (type.pointerLevel && type.pointerLevel > 0) {
        pointerLevel = type.pointerLevel;
    }


    if (type.name === 'void') {
        primitiveType = PrimitiveType.VOID;
    } else if (type.name === 'FILE') {
        primitiveType = PrimitiveType.FILE;
    } else if (type.name.startsWith('struct')) {
        primitiveType = PrimitiveType.STRUCT;
    } else if (type.name === 'char') {
        if (type.isSigned) {
            primitiveType = PrimitiveType.SIGNED_CHAR;
        } else if (type.isUnsigned) {
            primitiveType = PrimitiveType.UNSIGNED_CHAR;
        } else {
            primitiveType = PrimitiveType.CHAR;
        }
    } else if (type.name === 'int') {
        if (type.isUnsigned) {
            primitiveType = PrimitiveType.UNSIGNED_INT;
        } else {
            primitiveType = PrimitiveType.INT;
        }
    } else if (type.name === 'short') {
        if (type.isUnsigned) {
            primitiveType = PrimitiveType.UNSIGNED_SHORT;
        } else {
            primitiveType = PrimitiveType.SHORT;
        }
    } else if (type.name === 'long') {
        if (type.isUnsigned) {
            primitiveType = PrimitiveType.UNSIGNED_LONG;
        } else {
            primitiveType = PrimitiveType.LONG;
        }
    } else if (type.name === 'float') {
        primitiveType = PrimitiveType.FLOAT;
    } else if (type.name === 'double') {
        if (type.isLong) {
            primitiveType = PrimitiveType.LONG_DOUBLE;
        } else {
            primitiveType = PrimitiveType.DOUBLE;
        }
    } else if (type.name === 'struct') {
        primitiveType = PrimitiveType.STRUCT;
    } else if (type.name === 'enum') {
        primitiveType = PrimitiveType.ENUM;
    } else {
        throw new CMachineError('Execution Error', `Type ${type.name} not found`);
    }

    return {
        primitiveType,
        pointerLevel
    }
}

// Get the size of a CMachine type
export function getTypeSize(type: Type): number {
    // Based on 32-bit system
    if (type.pointerLevel > 0)
        return 4;

    return getPrimitiveTypeSize(type.primitiveType);
}

// ****** Implicit Conversion ******
export function implicitConversion(operand1: Type, operand2: Type): Type {

    // Not allowed
    if (
        operand1.primitiveType === PrimitiveType.STRUCT ||
        operand2.primitiveType === PrimitiveType.STRUCT ||
        operand1.primitiveType === PrimitiveType.ENUM ||
        operand2.primitiveType === PrimitiveType.ENUM) {
        throw new Error("Invalid types for arithmetic conversion");
    }

    // Pointers
    if (operand1.pointerLevel > 0 && operand2.pointerLevel > 0) {
        throw new Error("Invalid types for arithmetic conversion");
    }

    if (operand1.pointerLevel > 0 && operand2.pointerLevel === 0) {
        return operand1;
    }

    if (operand1.pointerLevel === 0 && operand2.pointerLevel > 0) {
        return operand2;
    }

    // Floating Point
    if (operand1.primitiveType === PrimitiveType.LONG_DOUBLE) {
        return operand1;
    }
    if (operand2.primitiveType === PrimitiveType.LONG_DOUBLE) {
        return operand2;
    }
    if (operand1.primitiveType === PrimitiveType.DOUBLE) {
        return operand1;
    }
    if (operand2.primitiveType === PrimitiveType.DOUBLE) {
        return operand2;
    }
    if (operand1.primitiveType === PrimitiveType.FLOAT) {
        return operand1;
    }
    if (operand2.primitiveType === PrimitiveType.FLOAT) {
        return operand2;
    }

    if (operand1.primitiveType === PrimitiveType.UNSIGNED_INT) {
        return operand1;
    }

    let promotedOperand1 = promoteType(operand1);
    let promotedOperand2 = promoteType(operand2);

    // If they are the same
    if (promotedOperand1.primitiveType === promotedOperand2.primitiveType) {
        return promotedOperand1;
    }

    // If they have same signedness
    if (isSameSignedness(promotedOperand1, promotedOperand2)) {
        return getLargerType(promotedOperand1, promotedOperand2);
    }

    // If they are different signedness
    let signedOperand = isSigned(promotedOperand1) ? promotedOperand1 : promotedOperand2;
    let unsignedOperand = isSigned(promotedOperand1) ? promotedOperand2 : promotedOperand1;

    if (getTypeRank(unsignedOperand.primitiveType) >= getTypeRank(signedOperand.primitiveType)) {
        return unsignedOperand;
    } else if ((getTypeRank(signedOperand.primitiveType) > getTypeRank(unsignedOperand.primitiveType))) {
        return signedOperand;
    } else {
        return getUnsignedType(unsignedOperand);
    }

}

function getUnsignedType(operand: Type): Type {
    switch (operand.primitiveType) {
        case PrimitiveType.INT:
            return {
                primitiveType: PrimitiveType.UNSIGNED_INT,
                pointerLevel: operand.pointerLevel
            }
        case PrimitiveType.SHORT:
            return {
                primitiveType: PrimitiveType.UNSIGNED_SHORT,
                pointerLevel: operand.pointerLevel
            }
        case PrimitiveType.LONG:
            return {
                primitiveType: PrimitiveType.UNSIGNED_LONG,
                pointerLevel: operand.pointerLevel
            }
        default:
            return operand;
    }
}

function isSigned(operand: Type): boolean {
    return operand.primitiveType === PrimitiveType.INT ||
        operand.primitiveType === PrimitiveType.SIGNED_CHAR ||
        operand.primitiveType === PrimitiveType.SHORT ||
        operand.primitiveType === PrimitiveType.LONG;
}

function getLargerType(operand1: Type, operand2: Type): Type {
    return getTypeRank(operand1.primitiveType) >= getTypeRank(operand2.primitiveType) ? operand1 : operand2;
}

function getTypeRank(primitive: PrimitiveType): number {
    switch (primitive) {
        case PrimitiveType.INT:
            return 1;
        case PrimitiveType.UNSIGNED_INT:
            return 1;
        case PrimitiveType.LONG:
            return 2;
        case PrimitiveType.UNSIGNED_LONG:
            return 2;
        default:
            return 0;
    }
}

function isSameSignedness(operand1: Type, operand2: Type): boolean {
    if (isSigned(operand1) && isSigned(operand2)) {
        return true;
    }

    if (!isSigned(operand1) && !isSigned(operand2)) {
        return true;
    }

    return false;
}

function promoteType(operand: Type): Type {
    switch (operand.primitiveType) {
        case PrimitiveType.CHAR, PrimitiveType.SIGNED_CHAR, PrimitiveType.UNSIGNED_CHAR, PrimitiveType.SHORT, PrimitiveType.UNSIGNED_SHORT:
            return {
                primitiveType: PrimitiveType.INT,
                pointerLevel: operand.pointerLevel
            }
        default:
            return operand;

    }
}

// ******************


export function getPrimitiveTypeSize(primitive: PrimitiveType): number {
    switch (primitive) {
        case PrimitiveType.ENUM:
        case PrimitiveType.STRUCT:
        case PrimitiveType.VOID:
            return 0;
        case PrimitiveType.CHAR:
            return 1;
        case PrimitiveType.SIGNED_CHAR:
            return 1;
        case PrimitiveType.UNSIGNED_CHAR:
            return 1;
        case PrimitiveType.SHORT:
            return 2;
        case PrimitiveType.UNSIGNED_SHORT:
            return 2;
        case PrimitiveType.INT:
            return 4;
        case PrimitiveType.UNSIGNED_INT:
            return 4;
        case PrimitiveType.LONG:
            return 8;
        case PrimitiveType.UNSIGNED_LONG:
            return 8;
        case PrimitiveType.FLOAT:
            return 4;
        case PrimitiveType.DOUBLE:
            return 8;
        case PrimitiveType.LONG_DOUBLE:
            return 16;
        case PrimitiveType.FILE:
            return 4;
        default:
            throw new CMachineError('Execution Error', `Type ${primitive} not found`);
    }
}

export enum PrimitiveType {
    VOID = 'void',

    // Chars
    CHAR = 'char',
    SIGNED_CHAR = 'signed char',
    UNSIGNED_CHAR = 'unsigned char',

    // Integers
    SHORT = 'short',
    UNSIGNED_SHORT = 'unsigned short',
    INT = 'int',
    UNSIGNED_INT = 'unsigned int',
    LONG = 'long',
    UNSIGNED_LONG = 'unsigned long',

    // Floating Point
    FLOAT = 'float',
    DOUBLE = 'double',
    LONG_DOUBLE = 'long double',

    //non-standard
    FILE = 'FILE',
    STRUCT = 'struct',
    ENUM = 'enum',
}

export type Type = {
    primitiveType: PrimitiveType,
    pointerLevel: number,
    customTypeName?: string,
}

export type EvalResult = {
    isLValue: boolean,
    type: Type,
    value: any,
    address?: number,
    remainingDims?: number[],
};

export type Variable = {
    name: string;
    address: number;
    size: number;
    type: Type;
    arrayDimensions?: number[];
    pointerLevel?: number;
};

export type Function = {
    name: string;
    parameters: Parameter[];
    returnType: Type;
    body?: AST.Statement;
};

export type StackFrame = {
    name: string;
    variables: Map<string, Variable>;
    returnType: Type;
    scope: number;
};

export type ProgramSnapshot = {
    memory: VirtualMemoryMachine;
    callStack: StackFrame[];
    globalScope: Map<string, Variable>;
    functionTable: Map<string, Function>;
    currentLine: number | null;
    executionStack: AST.Statement[];
    machine: ProgramStateMachine;
};

export type StructDefinition = {
    name: string;
    members: Map<string, Field>;
    size: number;
}

export type Field = {
    name: string;
    type: Type;
    offset: number;
}

export type Parameter = {
    name: string,
    type: Type
}

export type Location = {
    line: number;
    column: number;
}
