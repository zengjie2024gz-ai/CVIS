import {MemoryAllocationProposal, VirtualMemoryMachine} from '@CMachine/CMemory.ts';
import * as AST from '@CParser/CAst.ts';
import {
    CaseStatement,
    Declarator,
    DefaultStatement,
    TypeSpecifier,
    VariableDeclarator
} from '@CParser/CAst.ts';
import {CMachineError} from '@CMachine/CMachineError.ts';
import {
    EvalResult,
    Field,
    Function,
    getPrimitiveTypeSize,
    getTypeSize,
    implicitConversion,
    Parameter,
    PrimitiveType,
    ProgramSnapshot,
    StackFrame,
    StructDefinition,
    Type,
    typeSpecifierToType,
    Variable,
    Location
} from "@CMachine/CMachineTypes.ts";


const MAX_LOOP_STEPS = 10000;

// Browser builds cannot open arbitrary host files. These coursework fixtures
// provide deterministic CSV streams while preserving C's FILE/fgets workflow.
const DEFAULT_VIRTUAL_FILES: Record<string, string> = {
    'class01_students.csv': [
        'id,last_name,first_name',
        '3444670,Hurrington,Sherri',
        '3611390,Rich,William',
        '2939734,Simmons,Erin',
        '288301,Levi,Antonio',
        '1295620,Henderson,Mabel',
        '757790,Coffey,Paula',
        '3149175,Green,Tom',
        '3173019,Willis,Hazel',
        '2890792,Osterberg,Marty',
        '1274266,Winders,Nancy',
        ''
    ].join('\n'),
    'class01_activity01.csv': [
        'id,grade',
        '3444670,30',
        '2939734,16',
        '288301,75',
        '1295620,41',
        '757790,62',
        '3149175,56',
        '3173019,70',
        '1274266,90',
        ''
    ].join('\n'),
    'class01_activity02.csv': [
        'id,grade',
        '3444670,44',
        '2939734,75',
        '288301,97',
        '1295620,29',
        '757790,89',
        '3149175,62',
        '3173019,90',
        '2890792,13',
        '1274266,34',
        ''
    ].join('\n')
};

type VirtualFileHandle = {
    filename: string;
    mode: string;
    position: number;
};

// Marks boundary of function on the execution stack 
type FunctionReturnMarker = AST.Statement & {
    type: 'FunctionReturnMarker';
    stackDepth: number;
    functionName: string;
};

type LoopContinueMarker = AST.Statement & {
    type: 'LoopContinueMarker';
};

type DeferredExpression = AST.Statement & {
    type: 'DeferredExpression';
    expression: AST.Expression;
    cache: Map<AST.Expression, EvalResult>;
    pending?: AST.FunctionCall;
    complete: (result: EvalResult) => void;
};

class SuspendedCall {
    constructor(public call: AST.FunctionCall, public args: EvalResult[]) {}
}


export class ProgramStateMachine {
    private memoryMachine: VirtualMemoryMachine;
    private globalScope: Map<string, Variable>;
    private functionTable: Map<string, Function>;
    private structTable: Map<string, StructDefinition>;
    private callStack: StackFrame[];
    private currentScope: number;
    private programAST: AST.Program;
    private returnRegister: any;
    private virtualLog: (message: string) => void;
    private debug: boolean;
    private executionStack: AST.Statement[] = [];
    private mallocCounter: number = 0;
    private virtualFiles: Map<string, string> = new Map(Object.entries(DEFAULT_VIRTUAL_FILES));
    private openFiles: Map<number, VirtualFileHandle> = new Map();
    private nextFileHandle: number = 900000;
    private strtokNextAddress: number | null = null;
    private returnInProgress: boolean = false; // Tracks when a return has occurred to stop execution
    private continueInProgress: boolean = false;
    private expressionCache: Map<AST.Expression, EvalResult> | null = null;



    constructor(ast: AST.Program, virtualLog: (message: string) => void, debug: boolean = false) {
        this.memoryMachine = new VirtualMemoryMachine();
        this.globalScope = new Map<string, Variable>();
        this.functionTable = new Map<string, Function>();
        this.structTable = new Map<string, StructDefinition>();
        this.callStack = [];
        this.currentScope = 0;
        this.programAST = ast;
        this.virtualLog = virtualLog;
        this.debug = debug;
    }

    // Reset the machine
    resetMachine() {

        console.log("[MACHINE] Resetting machine");
        this.memoryMachine.resetMemory();
        this.globalScope = new Map<string, Variable>();
        this.structTable = new Map<string, StructDefinition>();
        this.functionTable = new Map<string, Function>();
        this.executionStack = [];
        this.callStack = [];
        this.currentScope = 0;
        this.virtualFiles = new Map(Object.entries(DEFAULT_VIRTUAL_FILES));
        this.openFiles.clear();
        this.nextFileHandle = 900000;
        this.strtokNextAddress = null;
        this.returnInProgress = false;
        this.continueInProgress = false;
        this.expressionCache = null;
        this.returnRegister = undefined;
        this.mallocCounter = 0;

    }

    // Setup the program for execution
    programSetup() {
        // Reset the machine
        this.resetMachine();

        // Initialize the global scope
        this.initializeGlobalScope();
        this.initializeGlobalFunctions();

        // Find Main as the entry point
        let mainEntry = this.functionTable.get('main');
        if (!mainEntry) {
            throw new CMachineError(
                'Execution Error',
                'Main function not found, entry invalid'
            );
        }

        // Main frame
        const mainFrame: StackFrame = {
            name: 'main',
            variables: new Map<string, Variable>(),
            returnType: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
            scope: this.currentScope,
        }


        // Execute the main function
        this.pushStackFrame(mainFrame);

        if (mainEntry.body){
            this.pushFunctionReturnMarker('main', mainEntry.body.location);
            this.pushExecutionStack(mainEntry.body);
        }
        console.log('Main entry added to execution stack');
    }

    // Run the program from the current entry point
    runProgram(): number {
        if (this.executionStack.length === 0) {
            // At end of execution stack - restart
            return this.returnRegister;
        }

        // Execute the full execution stack
        while (this.executionStack.length > 0) {
            this.stepProgram();
            if (this.debug)
                console.log('Current step line', this.getCurrentStepLine());
        }
        console.log('Program finished', this.returnRegister);
        return this.returnRegister;
    }

    // Step through the program to the next statement
    stepProgram(): any {
        if (this.executionStack.length === 0) {
            // At end of execution stack - restart
            return this.returnRegister;
        }

        // Get the next statement
        let statement = this.executionStack.pop();
        while (statement && statement.type === 'LoopBreakOutMarker')
            statement = this.executionStack.pop();

        // Execute the statement
        if (statement) {
            this.executeStatement(statement, true);

            if (this.executionStack.length === 0) {
                return this.returnRegister;
            } else {
                return null;
            }
        } else {
            return this.returnRegister; // Program has finished give the return register
        }

    }

    // Push a new statement to the execution stack
    private pushExecutionStack(statement: AST.Statement) {
        this.executionStack.push(statement);
    }

    // Adds marker to let step-by-step mode know where the function begins
    private pushFunctionReturnMarker(functionName: string, location: Location): void {
        this.executionStack.push({
            type: 'FunctionReturnMarker',
            functionName,
            stackDepth: this.callStack.length,
            location,
        } as FunctionReturnMarker);
    }

    private isFunctionReturnMarker(statement?: AST.Statement): statement is FunctionReturnMarker {
        return statement?.type === 'FunctionReturnMarker';
    }

    private executeFunctionReturnMarker(marker: FunctionReturnMarker): void {
        const frame = this.callStack[this.callStack.length- 1];

        if (this.callStack.length === marker.stackDepth && frame?.name === marker.functionName) {
            this.popStackFrame();
        }
    }

    // Removes the next statements (if applicable) from current function after return
    private clearExecutionStackToCurrentFunctionBoundary(): void {
        while (this.executionStack.length> 0) {
            const statement= this.executionStack.pop();

            // Stop running this block if nested return has already happened 
            if (this.isFunctionReturnMarker(statement)) {
                return;
            }
        }
    }

    // Get the line of the current statement
    private getCurrentStepLine(): number | null {
        if (this.executionStack.length === 0) {
            return null;
        }

        let statement = this.executionStack[this.executionStack.length - 1];
        return statement.location ? statement.location.line : null;
    }

    // Recursively execute a statement
    private executeStatement(
        statement: AST.Statement,
        step: boolean = false
    ): any {
        switch (statement.type) {
            case 'LoopBreakOutMarker':
                return;
            case 'FunctionReturnMarker':
                this.executeFunctionReturnMarker(statement as FunctionReturnMarker);
                return;
            case 'ExpressionStatement':
                if (step) {
                    this.evaluateInSteps((statement as AST.ExpressionStatement).expression, () => {});
                    return;
                }
                return this.evaluateExpression(
                    (statement as AST.ExpressionStatement).expression,
                    step
                );
            case 'ReturnAssignment':
                this.executeReturnAssignment(statement as AST.ReturnAssignment);
                break;
            case 'DeferredExpression':
                this.resumeExpression(statement as DeferredExpression);
                break;
            case 'StructDeclaration':
                this.evaluateStructDefinition(statement as AST.StructDeclaration);
                break;
            case 'FunctionCall':
                if (step) this.evaluateInSteps(statement as AST.FunctionCall, () => {});
                else this.executeFunctionCall(statement as AST.FunctionCall);
                break;
            case 'CompoundStatement':
                this.executeCompoundStatement(statement as AST.CompoundStatement, step);
                break;
            case 'IfStatement':
                this.executeIfStatement(statement as AST.IfStatement, step);
                break;
            case 'SwitchStatement':
                this.executeSwitchStatement(statement as AST.SwitchStatement, step);
                break;
            case 'CaseStatement':
            case 'DefaultStatement':
                this.executeCaseOrDefaultStatement(statement as AST.CaseStatement | AST.DefaultStatement, step);
                break;
            case 'ForStatementNoInit':
                this.executeForStatement(statement as AST.ForStatement, step, true); // Skip the assignment (for step through)
                break;
            case 'ForStatement':
                this.executeForStatement(statement as AST.ForStatement, step);
                break;
            case 'WhileStatement':
                this.executeWhileStatement(statement as AST.WhileStatement, step);
                break;
            case 'DoWhileStatement':
                this.executeDoWhileStatement(statement as AST.DoWhileStatement, step);
                break;
            case 'LoopContinueMarker':
                return;
            case 'BreakStatement':
                this.executeBreakStatement();
                break;
            case 'ContinueStatement':
                this.executeContinueStatement(step);
                break;
            case 'ReturnStatement':
                return this.executeReturnStatement(
                    statement as AST.ReturnStatement,
                    step
                );
            case 'VariableDeclaration':
                this.executeVariableDeclaration(
                    statement as AST.VariableDeclaration,
                    step
                );
                break;
            default:
                throw new CMachineError(
                    'Execution Error',
                    `Unrecognised statement ${statement.type}`
                );
        }
    }
    executeContinueStatement(step: boolean= false): void {
        if (step) {
            let statement = this.executionStack.pop();

            while (statement && statement.type !== 'LoopContinueMarker') {
                statement = this.executionStack.pop();
            }
            return;
        }

        this.continueInProgress = true;
    }

    // Execute a return assignment
    // Sets the return register to the value of the expression if present
    private executeReturnAssignment(
        statement: AST.ReturnAssignment
    ): void {
        if (this.debug)
            console.log('Executing Return Assignment', statement);

        // Get the return assignment statement
        let returnRegister = statement as AST.ReturnAssignment;

        // Return value is the statement
        let returnValue = this.returnRegister;

        // Get the current stack frame
        let frame = this.getCurrentStackFrame();

        // get the variable to the return value (ie int a = foo() <- a is returned)
        let variable = frame.variables.get(returnRegister.variableName);

        // If there was a variable assigned, write the return value to memory
        if (variable) {
            this.memoryMachine.writeMemory(variable.address, variable.type, returnValue);
        }
    }

    // Execute a break statement
    private executeBreakStatement(): void {

        // Pop until the loop marker
        // Check loop marker is present otherwise nothing break out of
        if (this.executionStack.reduce((acc, statement) => acc || statement.type === 'LoopBreakOutMarker', false)) {
            let statement = this.executionStack.pop();
            while (statement && statement.type !== 'LoopBreakOutMarker') {
                statement = this.executionStack.pop();
            }
        }

    }

    // Recursively execute a return statement
    // After return, stop the current function from running any more statements 
    private executeReturnStatement(
        statement: AST.ReturnStatement,
        step: boolean = false
    ):any{
        if (this.debug)
            console.log('Executing return statment', statement);

        if (step && statement.argument) {
            this.evaluateInSteps(statement.argument, result => {
                this.returnRegister = result.value;
                this.clearExecutionStackToCurrentFunctionBoundary();
                this.popStackFrame();
            });
            return;
        }

        let returnValue: any;

        if (statement.argument) {
            returnValue = this.evaluateExpression(statement.argument, false).value;
            this.returnRegister = returnValue;
        }

        if (step) {
            this.clearExecutionStackToCurrentFunctionBoundary();
        } else {
            this.returnInProgress = true;
        }
        this.popStackFrame();
        return returnValue;
    }


    // Recursively execute a case or default statement
    private executeCaseOrDefaultStatement(
        statement: AST.CaseStatement | AST.DefaultStatement,
        step: boolean = false
    ) {
        if (step) {
            this.pushExecutionStack(statement.consequent);
        } else {
            this.executeStatement(statement.consequent);
        }
    }

    // Recursively execute a switch statement
    private executeSwitchStatement(
        statement: AST.SwitchStatement,
        step: boolean = false
    ): void {

        // Add loop marker for breakout
        this.executionStack.push({type: 'LoopBreakOutMarker', location: statement.location});

        // Evaluate the switch expression
        let switchValue = this.evaluateExpression(statement.expression);

        // Extract the cases from the switch statement
        let cases: (CaseStatement | DefaultStatement)[] = [];
        if (statement.body.type === "CompoundStatement") {
            let compoundStatement = statement.body as AST.CompoundStatement;
            cases = compoundStatement.body.filter((statement) => statement.type === "CaseStatement") as CaseStatement[];

            // If there is a default statement, add it to the cases
            if (compoundStatement.body.find((statement) => statement.type === "DefaultStatement"))
                cases.push(compoundStatement.body.find((statement) => statement.type === "DefaultStatement") as DefaultStatement);
            else {
                // If no default statement, add a default statement with empty body <- not perfect but stops bug
                cases.push({
                    type: "DefaultStatement",
                    location: statement.location,
                    consequent: {
                        type: "CompoundStatement",
                        location: statement.location,
                        body: [],
                    },
                } as DefaultStatement);
            }
        }


        // Find index of matching case or default (execute everything after, breaks will release this)
        let caseIndex = 0;
        for (let i = 0; i < cases.length; i++) {
            let caseStatement: CaseStatement | DefaultStatement = cases[i];

            // Check if it is a case statement
            if (caseStatement.type === "CaseStatement") {
                // Evaluate the case expression at set index if it matches
                let caseValue = this.evaluateExpression(caseStatement.test);
                if (caseValue.value === switchValue.value) {
                    caseIndex = i;
                    break;
                }
            } else {
                caseIndex = i;
                break;
            }
        }

        // Slice everything from i to end
        cases = cases.slice(caseIndex);

        // Execute the cases
        if (step) {
            // Reverse the cases to push to the stack in order
            for (let i = cases.length - 1; i >= 0; i--) {
                this.pushExecutionStack(cases[i]);
            }
        } else {
            for (let caseStatement of cases) {
                this.executeStatement(caseStatement.consequent);

                if (this.returnInProgress) {
                    return;
                }
            }
        }

    }

    // Recursively execute If Statement
    private executeIfStatement(
        statement: AST.IfStatement,
        step: boolean = false
    ): void {
        // Evaluate the condition
        let condition = this.evaluateExpression(statement.condition).value != 0;

        // statement is true
        if (condition) {
            if (step) this.pushExecutionStack(statement.consequent);
            else this.executeStatement(statement.consequent);
            return;
        }

        // Statement is false check for else
        if (statement.alternate) {
            if (step) this.pushExecutionStack(statement.alternate);
            else this.executeStatement(statement.alternate);
        }
    }

    // Recursively execute Do While Statement
    private executeDoWhileStatement(
        statement: AST.DoWhileStatement,
        step: boolean = false
    ): void {
        // Add loop marker for breakout
        this.executionStack.push({type: 'LoopBreakOutMarker', location: statement.location});

        // Evaluate the condition
        let condition = this.evaluateExpression(statement.condition).value != 0;

        if (step) {
            if (condition) {
                this.pushExecutionStack(statement);
            }
            this.pushExecutionStack(statement.body);
        } else {
            let loopCount = 0;
            do {
                this.executeStatement(statement.body);

                if (this.returnInProgress) {
                    return;
                }
                condition = this.evaluateExpression(statement.condition).value != 0;
                loopCount++;
            } while (condition && loopCount < MAX_LOOP_STEPS);

            if (loopCount >= MAX_LOOP_STEPS) {
                throw new CMachineError('Execution Error', 'Loop exceeded maximum steps (either infinite or too large)');
            }
        }
    }


    // Recursively execute While Statement
    private executeWhileStatement(
        statement: AST.WhileStatement,
        step: boolean = false
    ): void {

        // Add loop marker for breakout
        this.executionStack.push({type: 'LoopBreakOutMarker', location: statement.location});

        // Evaluate condition
        let condition = this.evaluateExpression(statement.condition).value != 0;

        if (step) {
            if (condition) {
                this.pushExecutionStack(statement);
                this.pushExecutionStack({type: 'LoopContinueMarker', location: statement.location} as LoopContinueMarker);
                this.pushExecutionStack(statement.body);
            }
        } else {
            let loopCount = 0;
            while (condition && loopCount < MAX_LOOP_STEPS) {
                this.executeStatement(statement.body);
                
                if (this.returnInProgress) {
                    return;
                }

                if (this.continueInProgress) {
                    this.continueInProgress = false;
                    condition = this.evaluateExpression(statement.condition).value != 0;
                    loopCount++;
                    continue;
                }

                condition = this.evaluateExpression(statement.condition).value != 0;
                loopCount++;
            }

            if (loopCount >= MAX_LOOP_STEPS) {
                this.virtualLog("[CMACHINE]Error: Loop exceeded maximum steps (either infinite or too large)");
                throw new CMachineError('Execution Error', 'Loop exceeded maximum steps (either infinite or too large)');
            }
        }
    }

    // Recursively execute For Statement
    private executeForStatement(
        statement: AST.ForStatement,
        step: boolean = false,
        skipAssignment: boolean = false
    ): void {
        // Add loop marker for breakout
        this.executionStack.push({type: 'LoopBreakOutMarker', location: statement.location});

        let varAssignment = statement.init as AST.Expression;
        let testCondition = statement.test;
        let update = statement.update;


        let body = statement.body as AST.Statement;


        // Step through (note: step through is pushed to the stack backwards)
        if (step) {
            // Execute the variable assignment (for simplicity no step through)
            if (!skipAssignment)
                this.evaluateExpression(varAssignment, false);

            // Check the testCondition
            let conditionResult: boolean = this.evaluateExpression(testCondition).value != 0;

            // Add the body to the execution stack
            if (conditionResult) {

                // Keep the for statement on the stack
                this.pushExecutionStack({...statement, type: 'ForStatementNoInit'});

                // Execute the update
                this.pushExecutionStack({type: 'ExpressionStatement', expression: update} as AST.ExpressionStatement);
                this.pushExecutionStack({type: 'LoopContinueMarker', location: statement.location} as LoopContinueMarker);
                this.pushExecutionStack(body);

                // TODO: CONDITION NEEDS TO BE A STATEMENT TO AN EXPRESSION
            }

        } else {

            // Execute the variable assignment
            this.evaluateExpression(varAssignment, false);

            // Check the testCondition
            let conditionResult: boolean = this.evaluateExpression(testCondition).value != 0;

            let loopCount = 0;
            // Execute the body
            while (conditionResult && loopCount < MAX_LOOP_STEPS) {
                this.executeStatement(body, false);

                if (this.returnInProgress) {
                    return;
                }

                if (this.continueInProgress) {
                    this.continueInProgress = false;
                    this.evaluateExpression(update, false);
                    conditionResult = this.evaluateExpression(testCondition).value != 0;
                    loopCount++;
                    continue;
                }

                this.evaluateExpression(update, false);
                conditionResult = this.evaluateExpression(testCondition).value != 0;
                loopCount++;
            }

            if (loopCount >= MAX_LOOP_STEPS) {
                throw new CMachineError('Execution Error', 'Loop exceeded maximum steps (either infinite or too large)');
            }
        }


    }

    // Calculate the size of a variable before it is declared
    private calculateExactVariableSize(variable: AST.VariableDeclarator): number {
        let typeSpecifier: TypeSpecifier = variable.typeSpecifier;
        let type: Type = typeSpecifierToType(typeSpecifier);
        let size = getTypeSize(type);
        let isStruct = type.primitiveType === PrimitiveType.STRUCT;
        let isStructPointer = isStruct && type.pointerLevel > 0;
        let isArray = variable.arrayDimensions && variable.arrayDimensions.length > 0;
        let isArrayOfPointers = isArray && type.pointerLevel && type.pointerLevel > 0;

        // Handle string literals
        if (variable.init && variable.init.type == 'StringLiteral') {
            return ((variable.init as AST.StringLiteral).value.length + 1) * getPrimitiveTypeSize(PrimitiveType.CHAR);
        }

        // Handle arrays
        if (isArray && !isArrayOfPointers) {
            let elements = variable.arrayDimensions?.reduce((acc, dim) => acc * dim, 1) || 1;
            return elements * getTypeSize(type);
        }

        // Handle array of pointers
        if (isArrayOfPointers) {
            let elements = variable.arrayDimensions?.reduce((acc, dim) => acc * dim, 1) || 1;
            return elements * getPrimitiveTypeSize(PrimitiveType.INT);
        }

        // Handle structs
        if (isStruct && !isStructPointer) {
            let structName = typeSpecifier.name.substring(7);
            let struct = this.structTable.get(structName);
            console.log('Struct table', this.structTable);
            if (!struct) {
                throw new CMachineError('Execution Error', `Struct ${structName} not found`);
            }

            if (variable.init)
                return struct.size;
            else
                return Array.from(struct.members.values()).reduce((acc, member) => acc + getTypeSize(member.type), 0);
        }

        // Return base type size for simple variables
        return size;
    }

    // Initialize a variable and write it to memory
    private initializeVariable(variable: AST.VariableDeclarator, address: number, step: boolean): void {
        const typeSpecifier = variable.typeSpecifier;
        const type = typeSpecifierToType(typeSpecifier);
        const isArray = variable.arrayDimensions && variable.arrayDimensions.length > 0;
        const isStruct = type.primitiveType === PrimitiveType.STRUCT;
        const isStructPointer = isStruct && type.pointerLevel > 0;

        if (isStruct && !isStructPointer)
            this.initializeStruct(typeSpecifier.name.substring(7), address, variable.init as AST.ArrayInitializer, variable.location);

        // Handle initialization
        // Executes malloc immediately rather than in two steps
        if (variable.init) {
            if (step && variable.init.type !== 'ArrayInitializer' && variable.init.type !== 'StringLiteral') {
                this.evaluateInSteps(variable.init as AST.Expression, result => {
                    this.memoryMachine.writeMemory(address, type, result.value);
                });
            } else if ((isArray && variable.init.type === 'ArrayInitializer') || variable.init.type === 'StringLiteral') {


                this.initializeArray(variable.id.name, address, variable.init as AST.ArrayInitializer, type, variable.arrayDimensions || []);
                const varAss = this.getCurrentStackFrame().variables.get(variable.id.name);

                if (!varAss)
                    throw new CMachineError('Memory Error', 'Variable not declared');
            } else {
                const initialization: EvalResult = this.evaluateExpression(variable.init as AST.Expression);
                this.memoryMachine.writeMemory(address, type, initialization.value);
            }
        } else {
            if (isArray) {
                // Fill with 0s
                this.zeroInitializeArray(variable.id.name, address, variable.arrayDimensions || [], type, variable.location);
            } else {
                // Zero initialize
                this.memoryMachine.writeMemory(address, type, 0);
            }
        }
    }

    // Recursively execute a Variable statement
    private executeVariableDeclaration(
        declaration: AST.VariableDeclaration,
        step: boolean = false
    ): void {

        if (this.debug)
            console.log("Executing Variable Declaration", declaration);
        // Get the declarators
        let declarators: AST.Declarator[] = declaration.declarators;
        // Finish each initializer in the caller before declaring the next item.
        if (step && declarators.length > 1) {
            for (const declarator of [...declarators].reverse()) {
                this.pushExecutionStack({...declaration, declarators: [declarator]} as AST.VariableDeclaration);
            }
            return;
        }
        // Per declarator
        for (let declarator of declarators) {
            // Get the variable
            let variable: AST.VariableDeclarator = declarator as AST.VariableDeclarator;
            const name = variable.id.name;
            const typeSpecifier = variable.typeSpecifier;
            const type = typeSpecifierToType(typeSpecifier);
            const size = this.calculateExactVariableSize(variable);

            if (variable.init && variable.init.type == 'StringLiteral') {
                variable = {...variable, arrayDimensions: [1]};
            }

            if (type.primitiveType === PrimitiveType.STRUCT) {
                const structName = typeSpecifier.name.substring(7);
                const struct = this.structTable.get(structName);
                if (!struct) {
                    throw new CMachineError('Execution Error', `Struct ${structName} does not exist`);
                }
                type.customTypeName = structName;
            }

            // Declare the declared variable on the stack
            let variableDeclared = this.declareVariable(name, type, false, undefined, size, variable.location)

            const address = variableDeclared.address;
            if (!address)
                throw new CMachineError('Memory Error', 'Variable not declared');

            // Add it to the virtual stack frame
            this.getCurrentStackFrame().variables.set(name, {
                name,
                address,
                size,
                arrayDimensions: variable.arrayDimensions,
                pointerLevel: typeSpecifier.pointerLevel,
                type
            });


            // Initialize the variablet
            this.initializeVariable(variable, address, step);

        }
    }

    // Initialize a struct in memory
    private initializeStruct(
        identifier: string,
        baseAddress: number,
        initializer: AST.ArrayInitializer | undefined = undefined,
        location: Location
    ): void {
        let structName = identifier;
        let struct = this.structTable.get(structName);
        if (!struct) {
            throw new CMachineError('Execution Error', `Struct ${structName} not found when initializing`);
        }


        // If there is an initializer, initialize the struct
        let flatValues: number[] = initializer ? this.flattenArrayInitializer(initializer) : new Array(struct.size).fill(0);

        let offset = 0;

        for (let member of struct.members.values()) {

            let memberAddress = baseAddress + member.offset;
            let memberType = member.type;

            if (memberType.primitiveType == PrimitiveType.STRUCT && (memberType.pointerLevel && memberType.pointerLevel < 1)) {
                this.initializeStruct(member.name, memberAddress, initializer, location);
            } else {
                let value = flatValues[offset];
                this.memoryMachine.allocateOnStack(getTypeSize(memberType), `${identifier}_${member.name}`, value, memberType, location, memberAddress);
            }

            offset++;
        }
    }

    // Initialize an array in memory
    private initializeArray(
        identifier: string,
        baseAddress: number,
        initializer: AST.ArrayInitializer | AST.StringLiteral,
        type: Type,
        dimensions: number[]
    ): EvalResult {

        if (initializer.type === 'StringLiteral') {

            let string: EvalResult = this.evaluateStringLiteral(initializer);
            const charArray: string[] = string.value;
            const result = this.memoryMachine.allocateOnStack(charArray.length, identifier, charArray, type, initializer.location, baseAddress, true);

            return {
                isLValue: true,
                address: result,
                value: result,
                type: {
                    primitiveType: PrimitiveType.CHAR,
                    pointerLevel: 0
                }
            }
        }

        if (type.pointerLevel && type.pointerLevel > 0) {
            const pointerSize = getPrimitiveTypeSize(PrimitiveType.INT);
            const arraySize = dimensions[0] * pointerSize;

            // Allocate the array of pointers
            const pointerArray = Array(dimensions[0]).fill(0);
            const result = this.memoryMachine.allocateOnStack(arraySize, identifier, pointerArray, type, initializer.location, baseAddress, true);

            const elements = initializer.values;
            for (let i = 0; i < Math.min(dimensions[0], elements.length); i++) {
                const element = elements[i];

                if (element.type === 'StringLiteral') {
                    const stringValue = (element as AST.StringLiteral).value;
                    const charCodes = Array.from(stringValue).map(c => c.charCodeAt(0));
                    charCodes.push(0); // null terminator

                    // Allocate each string on the heap
                    const stringAddress = this.memoryMachine.allocateOnHeap(charCodes.length, `${identifier}_${i}`, charCodes, {
                        primitiveType: PrimitiveType.CHAR,
                        pointerLevel: 0
                    }, element.location);

                    // Store the pointer to the string in the array
                    this.memoryMachine.writeMemory(baseAddress + i * pointerSize, type, stringAddress);
                } else {
                    const evalResult = this.evaluateExpression(element as AST.Expression);
                    this.memoryMachine.writeMemory(baseAddress + i * pointerSize, evalResult.type, evalResult.value);
                }
            }

            return {
                isLValue: true,
                value: result,
                address: baseAddress,
                type
            };
        }

        const flatValues = this.flattenArrayInitializer(initializer);
        const flatDimensions = dimensions.reduce((acc, dim) => acc * dim, 1);

        if (flatDimensions < flatValues.length) {
            throw new CMachineError('Memory Error', `Initializer size ${flatValues.length} exceeds array dimensions ${flatDimensions}`);
        }

        if (flatDimensions > flatValues.length) {
            const missingElements = flatDimensions - flatValues.length;
            for (let i = 0; i < missingElements; i++) {
                flatValues.push(0);
            }
        }

        if (this.debug)
            console.log('Allocating array', flatValues, flatDimensions * getTypeSize(type));

        this.memoryMachine.allocateOnStack(flatDimensions * getTypeSize(type), identifier, flatValues, type, initializer.location, baseAddress);

        return {
            isLValue: true,
            value: baseAddress,
            address: baseAddress,
            type: type
        }
    }

    // Flatten an array initialiser (large dimension to single dimension)
    private flattenArrayInitializer(initializer: AST.ArrayInitializer): number[] {
        let result: number[] = [];

        for (let element of initializer.values) {
            if (element.type === 'ArrayInitializer') {
                // Recursively flatten nested array initializers
                const nestedValues = this.flattenArrayInitializer(element as AST.ArrayInitializer);
                result.push(...nestedValues);
            } else {
                // Evaluate the expression and add it to the result
                const item: EvalResult = this.evaluateExpression(element as AST.Expression);
                result.push(item.value as number);
            }
        }

        return result;
    }

    // Initialize a zeroed array in memory (for uninitialized arrays)
    private zeroInitializeArray(identifier: string, baseAddress: number, dimensions: number[], type: Type, location: Location): void {
        let flatDimensions = dimensions.reduce((acc, dim) => acc * dim, 1);
        let values = new Array(flatDimensions).fill(0);
        this.memoryMachine.allocateOnStack(flatDimensions * getTypeSize(type), identifier, values, type, location, baseAddress);
    }

    // Recursively execute a Compound statement
    private executeCompoundStatement(
        statement: AST.CompoundStatement,
        step: boolean = false
    ): void {
        if (this.debug)
            console.log('Executing Compound Statement', statement);

        let localDeclarations = statement.localDeclarations;
        let body = statement.body;


        // Add body to the execution stack first as they will be last out
        // Reverse the body to maintain order
        if (step) {

            // Add all the body statements to the execution stack up until the return statement
            let compoundStack = [];
            for (let statement of body) {
                compoundStack.push(statement);
                if (statement.type === 'ReturnStatement') {
                    break;
                }
            }

            for (let statement of compoundStack.reverse()) {
                this.pushExecutionStack(statement);
            }
        } else {

            for (let declaration of localDeclarations) {
                if (declaration.type === 'VariableDeclaration') {
                    const varDeclaration: AST.VariableDeclaration = declaration as AST.VariableDeclaration;
                    const declarators: AST.Declarator[] = varDeclaration.declarators;

                    for (let declarator of declarators) {
                        const variable: AST.VariableDeclarator =
                            declarator as AST.VariableDeclarator;
                        const name = variable.id.name;
                        const typeSpecifier = variable.typeSpecifier;
                        const type = typeSpecifierToType(typeSpecifier);
                        const size = getTypeSize(type);

                        let init: EvalResult | null = null;
                        if (variable.init) {
                            init = this.evaluateExpression(variable.init as AST.Expression);
                        }
                        // declareVariable expects forceSize before location. Passing location as
                        // forceSize coerced the object to address 0 during stack allocation and
                        // produced a false "Stack Overflow" for synchronous function calls used
                        // inside larger expressions (for example: copy_value(5) + 4).
                        const declaredVariable = this.declareVariable(
                            name,
                            type,
                            false,
                            init?.value,
                            size,
                            variable.location
                        );
                        const address = declaredVariable.address;
                        if (!address)
                            throw new CMachineError('Memory Error', 'Variable not declared');
                        this.getCurrentStackFrame().variables.set(name, {
                            name,
                            address,
                            size,
                            type,
                        });
                    }
                }
            }

            for (let statement of body) {
                this.executeStatement(statement);

                if (this.returnInProgress || this.continueInProgress) {
                    return;
                }
            }
        }

        if (step) {
            // Push the declarations in reverse order to the execution stack
            if (localDeclarations)
                for (let i = localDeclarations.length - 1; i >= 0; i--) {
                    this.pushExecutionStack(localDeclarations[i]);
                }
            else
                return;
        }


    }

    // Recursively execute a function call
    private executeFunctionCall(
        statement: AST.FunctionCall,
        step: boolean = false,
        preparedArgs?: EvalResult[]
    ): EvalResult {
        let funcName = statement.functionIdentity.name;
        let func = this.functionTable.get(funcName);

        if (this.isStandardLibFunction(funcName)) {
            return this.executeStandardLibFunction(funcName, statement.arguments, statement.location);
        }

        if (!func) {
            throw new CMachineError(
                'Execution Error',
                `Function ${funcName} not found`
            );
        }

        if (this.debug)
            console.log(`Executing function: ${func.name}`);

        // Evaluate the arguments
        const args = preparedArgs ?? statement.arguments.map(arg => this.evaluateExpression(arg));
        if (this.expressionCache) throw new SuspendedCall(statement, args);

        let variableMap: Map<string, Variable> = new Map<string, Variable>();

        for (let i = 0; i < func.parameters.length; i++) {
            let param = func.parameters[i];
            let arg = args[i];

            if (arg) {
                const address: number = this.memoryMachine.allocateOnStack(
                    getTypeSize(param.type),
                    `${func.name}_${param.name}`,
                    arg.value,
                    param.type,
                    statement.location
                );
                if (!address)
                    throw new CMachineError('Memory Error', 'Variable not declared');

                variableMap.set(param.name, {
                    name: param.name,
                    address: address,
                    size: getTypeSize(param.type),
                    type: param.type
                })
            } else {
                throw new CMachineError('Execution Error', `Argument ${param.name} not found`);
            }
        }

        const stackDepthBeforeCall = this.callStack.length;

        // Push a new stack frame
        this.pushStackFrame({
                name: func.name,
                variables: variableMap,
                returnType: func.returnType,
                scope: this.currentScope,
            }
        );

        // Execute the function body
        if (func.body) {
            if (step) {
                this.pushFunctionReturnMarker(func.name, func.body.location);
                this.pushExecutionStack(func.body);
                return {
                    value: this.returnRegister,
                    isLValue: false,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                };
            } else {
                const callerReturnInProgress = this.returnInProgress;
                this.returnInProgress = false;
                this.continueInProgress = false;

                this.executeStatement(func.body);

                this.returnInProgress = callerReturnInProgress;
            }
        }
  
        if (this.callStack.length > stackDepthBeforeCall) {
            this.popStackFrame();
        }

        const result: EvalResult = {
            isLValue: false,
            value: this.returnRegister,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        }

        return result;
    }

    // Suspend only at an actually evaluated user call. Completed subexpressions
    // are cached, so resuming does not repeat increments, allocation or output.
    private evaluateInSteps(expression: AST.Expression, complete: (result: EvalResult) => void): void {
        this.resumeExpression({type: 'DeferredExpression', expression,
            location: expression.location, cache: new Map(), complete} as DeferredExpression);
    }

    private resumeExpression(marker: DeferredExpression): void {
        if (marker.pending) {
            const func = this.functionTable.get(marker.pending.functionIdentity.name)!;
            marker.cache.set(marker.pending, {value: this.returnRegister,
                type: func.returnType, isLValue: false});
        }
        this.expressionCache = marker.cache;
        let result: EvalResult;
        try {
            result = this.evaluateExpression(marker.expression);
        } catch (error) {
            if (!(error instanceof SuspendedCall)) throw error;
            this.expressionCache = null;
            this.pushExecutionStack({...marker, pending: error.call});
            this.executeFunctionCall(error.call, true, error.args);
            return;
        } finally {
            this.expressionCache = null;
        }
        marker.complete(result);
    }

    private evaluateExpression(expression: AST.Expression, step: boolean = false): EvalResult {
        const cache = this.expressionCache;
        const cached = cache?.get(expression);
        if (cached) return {...cached};
        const result = this.evaluateExpressionValue(expression, step);
        cache?.set(expression, {...result});
        return result;
    }

    // Evaluate an expression
    private evaluateExpressionValue(
        expression: AST.Expression,
        step: boolean = false
    ): EvalResult {

        if (this.debug)
            console.log('Evaluating Expression', expression);

        switch (expression.type) {
            case 'FunctionCall':
                return this.executeFunctionCall(expression as AST.FunctionCall, step);
            case 'SizeofExpression':
                return this.executeSizeOfExpression(expression as AST.SizeofExpression);
            case 'BinaryExpression':
                return this.evaluateBinaryExpression(
                    expression as AST.BinaryExpression
                );
            case 'UnaryExpression':
                return this.evaluateUnaryExpression(expression as AST.UnaryExpression);
            case 'PostfixExpression':
                return this.evaluatePostfixExpression(expression as AST.PostfixExpression);
            case 'PrefixExpression':
                return this.evaluatePrefixExpression(expression as AST.PrefixExpression);
            case 'Identifier':
                return this.evaluateIdentifier(expression as AST.Identifier);
            case 'IntegerLiteral':
                return {
                    isLValue: false,
                    value: (expression as AST.IntegerLiteral).value,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                };
            case 'FloatLiteral':
                return {
                    isLValue: false,
                    value: (expression as AST.FloatLiteral).value,
                    type: {primitiveType: PrimitiveType.FLOAT, pointerLevel: 0}
                };
            case 'StringLiteral':
                return {
                    isLValue: false,
                    value: this.evaluateStringLiteral(expression as AST.StringLiteral).value,
                    type: {primitiveType: PrimitiveType.CHAR, pointerLevel: 0}
                };
            case 'CharLiteral':
                return {
                    isLValue: false,
                    value: (expression as AST.CharLiteral).value.charCodeAt(0),
                    type: {primitiveType: PrimitiveType.CHAR, pointerLevel: 0}
                };
            case 'BooleanLiteral':
                return {
                    isLValue: false,
                    value: (expression as AST.BooleanLiteral).value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                };
            case 'ArrayExpression':
                return this.evaluateArrayExpression(expression as AST.ArrayExpression)
            case 'ArrayLiteral':
                return this.evaluateArrayLiteral(expression as AST.ArrayLiteral);
            case 'ArrayInitializer':
                return this.evaluateArrayInitializer(expression as AST.ArrayInitializer);
            case 'MemberExpression':
                return this.evaluateMemberExpression(expression as AST.MemberExpression);
            // Fixed 
            case 'CastExpression': {
                const castExpr = expression as AST.CastExpression;
                const inner = this.evaluateExpression(castExpr.expression, step);
                const targetType = typeSpecifierToType(castExpr.typeSpecifier);
                let castValue = inner.value;
                // Taking value and converting it to the correct type
                if (targetType.primitiveType === PrimitiveType.INT) {
                    castValue = Math.trunc(Number(inner.value));
                } else if (targetType.primitiveType === PrimitiveType.FLOAT || 
                        targetType.primitiveType === PrimitiveType.DOUBLE) {
                    castValue = Number(inner.value);
                } else if (targetType.primitiveType === PrimitiveType.CHAR) {
                    castValue = Math.trunc(Number(inner.value)) & 0xFF;
                }
                return {isLValue: false, value: castValue, type: targetType};
            }
                default:
                throw new CMachineError(
                    'Evaluation Error',
                    `Expression type not supported ${expression.type}`
                );
        }
    }

    // Execute a sizeof expression; parser has been extended to accept multi-token syntax, e.g., from struct Node
    // As named structs do not use default primitve size table, their size is retrieved from struct definitions
    private executeSizeOfExpression(expression: AST.SizeofExpression): EvalResult {
        let size = 0;

        if (expression.expression.type === 'TypeSpecifier') {
            const typeSpecifier = expression.expression as AST.TypeSpecifier;
            const type = typeSpecifierToType(typeSpecifier);

            if (type.primitiveType === PrimitiveType.STRUCT) {
                const structName = typeSpecifier.name.substring(7);
                const struct = this.structTable.get(structName);
                if (!struct) {
                    throw new CMachineError('Execution Error', `Struct ${structName} not found`);
                }
                size = struct.size;
            }else{
                size = getTypeSize(type);
            }

        } else {
            let evalResult = this.evaluateExpression(expression.expression as AST.Expression);

            if (expression.expression.type == 'Identifier') {
                if (evalResult.address != undefined) {
                    let allocated = this.memoryMachine.getMemoryInfo(evalResult.address);
                    console.log(allocated);
                    size = allocated?.size || 0;
                }
            } else
                throw new CMachineError('Execution Error', 'Sizeof expression not supported');
            
        }

        return {
            isLValue: false,
            value: size,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    // Evaluate a member expression
    // Allows chained access 
    private evaluateMemberExpression(expression: AST.MemberExpression): EvalResult {
        // Evaluates left-hand side of expression for chained accesses like head->next->data
        const objectEval = this.evaluateExpression(expression.object);
        // Updated CMachineErrors based on data access 
        if (objectEval.type.primitiveType !== PrimitiveType.STRUCT){
            throw new CMachineError('Machine Error', 'Member access is only valid on structs');
        }

        const structName = objectEval.type.customTypeName;
        if (!structName){
            throw new CMachineError('Machine Error', 'Struct type name not found for member access');

        }

        const struct = this.structTable.get(structName);
        if (!struct) {
            throw new CMachineError('Machine Error', `Struct ${structName} not found while evaluating members`);
        }

        const member = struct.members.get(expression.property.name);
        if (!member){
            throw new CMachineError('Machine Error', `Member ${expression.property.name} not found in struct ${structName}`);
        }

        let baseAddress: number | undefined;
        if (expression.isPointer) {
            if (objectEval.type.pointerLevel < 1) {
                throw new CMachineError('Machine Error', 'Cannot use -> on a non-pointer');
            }
            baseAddress = objectEval.value as number;
        } else {
            baseAddress = objectEval.address;
        }

        if (baseAddress == undefined){
            throw new CMachineError('Machine Error', 'Member access requires a valid base address');
        }

        // Adds offset to the chosen base address to find the member in memory 
        const memberAddress = baseAddress + member.offset;

        return {
            isLValue: true,
            value: this.memoryMachine.readMemory(memberAddress, member.type),
            address: memberAddress,
            type: member.type
        };




    }

    // Evaluate a Struct Definition
    // Uses the correct struct layout for feilds like node next*
    private evaluateStructDefinition(expression: AST.StructDeclaration): void {
        let structName: string = expression.id.name;
        let members: Map<string, Field> = new Map<string, Field>();
        let offset: number = 0;

        for (let member of expression.fields) {
            let declarators: Declarator[] = member.declarators;
            for (let declarator of declarators) {
                if (this.debug)
                    console.log('Declarator', declarator);
                const field: VariableDeclarator = declarator as AST.VariableDeclarator;
                const typeSpecifier: TypeSpecifier = field.typeSpecifier;
                const type = typeSpecifierToType(typeSpecifier);
                // Identified as a struct type in struct field so data can later be accessed 
                // Same struct name kept so can tell which field it is pointing to in a chained access
                if (type.primitiveType == PrimitiveType.STRUCT){
                    type.customTypeName = typeSpecifier.name.substring(7);
                }
                const size: number = getTypeSize(type);
                const name: string = field.id.name;

                members.set(name, {name, type, offset});
                offset += size;
            }
        }

        let structSize = offset;

        if (this.debug)
            console.log('Declaring struct', structName, members, structSize);

        this.structTable.set(structName, {name: structName, members, size: structSize});
    }

    // Evaluate an array expression ie: a[i]
    private evaluateArrayExpression(expression: AST.ArrayExpression): EvalResult {
        const array = this.evaluateExpression(expression.array);
        const index = this.evaluateExpression(expression.index);

        // Array subscripting advances by the size of the pointed-to element,
        // not by the size of the pointer itself.  The old implementation used
        // a pointer-sized stride for every array.  This was hidden for int
        // arrays on the 32-bit model (both are four bytes), but made char
        // arrays skip four bytes at a time: "Alice"[1] incorrectly read 'e'.
        const elementPointerLevel = Math.max(array.type.pointerLevel - 1, 0);
        let stride = getTypeSize({
            primitiveType: array.type.primitiveType,
            pointerLevel: elementPointerLevel
        });
        if (array.remainingDims && array.remainingDims.length > 1) {
            const product = array.remainingDims.slice(1).reduce((acc, dim) => acc * dim, 1);
            stride = getTypeSize({
                primitiveType: array.type.primitiveType,
                pointerLevel: 0
            }) * product;
        }

        const offset = index.value * stride;
        const newAddress = array.value + offset;

        const newRemainingDims: number[] = array.remainingDims ? array.remainingDims.slice(1) : [];

        const newType = {
            primitiveType: array.type.primitiveType,
            pointerLevel: elementPointerLevel
        };

        // A remaining array dimension denotes a sub-array, whose value is its
        // address.  Once all dimensions have been indexed, read the element
        // itself even when that element is a pointer (for example char *s[3]).
        const memory = newRemainingDims.length > 0
            ? newAddress
            : this.memoryMachine.readMemory(newAddress, newType);

        console.log("value", memory, newAddress,);
        return {
            isLValue: true,
            value: memory,
            address: newAddress,
            type: newType,
            remainingDims: newRemainingDims
        };
    }

    // Assign a value to an array element
    private assignArrayElement(address: number, value: number): void {

        // Get Memory info
        let memoryInfo = this.memoryMachine.getMemoryInfo(address);
        if (!memoryInfo)
            throw new CMachineError('Memory Error', 'Memory not found');

        // Get type
        const type = memoryInfo.type;

        // Write to memory
        this.memoryMachine.writeMemory(address, type, value);

    }

    // C truncates division toward zero when both operands undergo the usual
    // arithmetic conversions to an integer type. JavaScript always produces a
    // floating-point quotient, so applying `/` directly gives incorrect C
    // results such as 2020 / 100 = 20.2 instead of 20.
    private divideValues(left: EvalResult, right: EvalResult): number {
        const resultType = implicitConversion(left.type, right.type);
        const quotient = left.value / right.value;
        const isFloatingPoint =
            resultType.primitiveType === PrimitiveType.FLOAT ||
            resultType.primitiveType === PrimitiveType.DOUBLE ||
            resultType.primitiveType === PrimitiveType.LONG_DOUBLE;

        return isFloatingPoint ? quotient : Math.trunc(quotient);
    }

    // Evaluate a binary expression
    private evaluateBinaryExpression(expression: AST.BinaryExpression): EvalResult {
        let left: EvalResult = this.evaluateExpression(expression.left);
        if ((expression.operator === '&&' && !left.value) ||
            (expression.operator === '||' && left.value)) {
            return {value: left.value ? 1 : 0, isLValue: false,
                type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}};
        }
        let right: EvalResult = this.evaluateExpression(expression.right);

        if (expression.operator === '+' || expression.operator === '-' && (left.type?.pointerLevel > 0 || right.type?.pointerLevel > 0)) {
            if (left.type.pointerLevel > 0 && right.type.pointerLevel > 0) {
                throw new CMachineError('Evaluation Error', 'Cannot add or subtract pointers');
            }
            if (left.type.pointerLevel > 0) {
                right.value = right.value * getTypeSize(left.type);
            }
            if (right.type.pointerLevel > 0) {

            }

        }

        if (this.debug)
            console.log('Evaluating Binary Expression', expression, left, right);


        switch (expression.operator) {
            case '+':
                console.log('Adding', left, right);
                return {
                    isLValue: false,
                    value: left.value + right.value,
                    type: implicitConversion(left.type, right.type)
                }
            case '-':
                return {
                    isLValue: false,
                    value: left.value - right.value,
                    type: implicitConversion(left.type, right.type)
                }
            case '*':
                return {
                    isLValue: false,
                    value: left.value * right.value,
                    type: implicitConversion(left.type, right.type)
                }
            case '/':
                return {
                    isLValue: false,
                    value: this.divideValues(left, right),
                    type: implicitConversion(left.type, right.type)
                }
            case '%':
                return {
                    isLValue: false,
                    value: left.value % right.value,
                    type: implicitConversion(left.type, right.type)

                }
            case '=':
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, right.value);
                    return {
                        isLValue: false,
                        value: right.value,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, right);
                return {
                    isLValue: false,
                    value: right.value,
                    type: right.type
                };
            case '+=':
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, left.value + right.value);
                    return {
                        isLValue: false,
                        value: left.value + right.value,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, {
                    isLValue: false,
                    value: left.value + right.value,
                    type: right.type
                });
                return {
                    isLValue: false,
                    value: left.value + right.value,
                    type: right.type
                };
            case '-=':
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, left.value - right.value);
                    return {
                        isLValue: false,
                        value: left.value - right.value,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, {
                    isLValue: false,
                    value: left.value - right.value,
                    type: right.type
                });
                return {
                    isLValue: false,
                    value: left.value - right.value,
                    type: right.type
                };
            case '*=':
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, left.value * right.value);
                    return {
                        isLValue: false,
                        value: left.value * right.value,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, {
                    isLValue: false,
                    value: left.value * right.value,
                    type: right.type
                });
                return {
                    isLValue: false,
                    value: left.value * right.value,
                    type: right.type
                };
            case '/=':
                const dividedValue = this.divideValues(left, right);
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, dividedValue);
                    return {
                        isLValue: false,
                        value: dividedValue,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, {
                    isLValue: false,
                    value: dividedValue,
                    type: right.type
                });
                return {
                    isLValue: false,
                    value: dividedValue,
                    type: right.type
                };
            case '%=':
                if (expression.left.type === "ArrayExpression") {
                    this.assignArrayElement(left.address || 0, left.value % right.value);
                    return {
                        isLValue: false,
                        value: left.value % right.value,
                        type: right.type
                    };
                }
                this.handleAssignment(expression.left, {
                    isLValue: false,
                    value: left.value % right.value,
                    type: right.type
                });
                return {
                    isLValue: false,
                    value: left.value % right.value,
                    type: right.type
                };
            case '<<':
                return {
                    isLValue: false,
                    value: left.value << right.value,
                    type: implicitConversion(left.type, right.type)
                }
            case '>>':
                return {
                    isLValue: false,
                    value: left.value >> right.value,
                    type: implicitConversion(left.type, right.type)
                }

            case '==':
                return {
                    isLValue: false,
                    value: left.value === right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '!=':
                return {
                    isLValue: false,
                    value: left.value !== right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '<':
                return {
                    isLValue: false,
                    value: left.value < right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '<=':
                return {
                    isLValue: false,
                    value: left.value <= right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '>':
                return {
                    isLValue: false,
                    value: left.value > right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '>=':
                return {
                    isLValue: false,
                    value: left.value >= right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '&':
                return {
                    isLValue: false,
                    value: left.value & right.value,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                };
            case '&&':
                return {
                    isLValue: false,
                    value: left.value && right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            case '||':
                return {
                    isLValue: false,
                    value: left.value || right.value ? 1 : 0,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
                }
            default:
                throw new CMachineError(
                    'Evaluation Error',
                    `Binary operator ${expression.operator} not supported`
                );
        }
    }

    // Handle variable assignment
    private handleAssignment(left: AST.Expression, right: EvalResult): void {
        if (left.type === 'Identifier') {
            // Get the variable
            let variable = this.lookupVariable((left as AST.Identifier).name);

            // Check if the variable exists
            if (!variable) {
                throw new CMachineError('Evaluation Error', `Variable not found ${(left as AST.Identifier).name}`);
            }

            // Write the value to memory
            this.memoryMachine.writeMemory(variable.address, variable.type, right.value);
            return
        }
        // Else handle member expression struct-> or struct. or array[index] or *ptr

        const leftEval: EvalResult = this.evaluateExpression(left);

        console.log('Left eval', leftEval, right);
        if (!leftEval.isLValue) {
            throw new CMachineError('Evaluation Error', 'Cannot assign to rvalue');
        }

        if (!leftEval.type){
            throw new CMachineError('Evaluation Error', 'Assignment target is missing type information');
        }

        // Allows NULL to be assigned to pointer variabls

        const sameType = (!!right.type) && (leftEval.type.primitiveType === right.type.primitiveType) && (leftEval.type.pointerLevel === right.type.pointerLevel);

        const nullPointerAssignment = (!!right.type) && (right.value === 0) && (right.type.primitiveType === PrimitiveType.INT) && (right.type.pointerLevel === 0) && (leftEval.type.pointerLevel > 0);

        // Allows malloc results to be stored into pointer fields
        const mallocPointerAssignment = (!right.type) && (typeof right.value === "number") && (leftEval.type.pointerLevel > 0);

        if (!sameType && !nullPointerAssignment && !mallocPointerAssignment){
            const rightTypeName = right.type ? right.type.primitiveType : "unknown";
            throw new CMachineError('Evaluation Error', `Type mismatch in assignment, trying to assign ${rightTypeName} to ${leftEval.type.primitiveType}`);
        }

        if (leftEval.address === undefined) {
            throw new CMachineError('Evaluation Error', 'Cannot assign to rvalue');
        }

        console.log('Writing to memory', leftEval.address, leftEval.type, right.value);
        this.memoryMachine.writeMemory(leftEval.address, leftEval.type, right.value);

    }

    // Evaluate a prefix expression
    private evaluatePrefixExpression(expression: AST.PrefixExpression): EvalResult {
        let argument: EvalResult = this.evaluateExpression(expression.argument);

        switch (expression.operator) {
            case '++':
                if (expression.argument.type === 'Identifier') {
                    let variable = this.lookupVariable((expression.argument as AST.Identifier).name);
                    if (variable) {
                        let variableObject = this.getVariableValue(variable);
                        let variableCurrentValue = variableObject.value
                        variableCurrentValue += 1;
                        this.setVariableValue(variable, variableCurrentValue, variable.type);
                        return {
                            isLValue: false,
                            value: variableCurrentValue,
                            type: variableObject.type
                        }
                    }
                }
                return {
                    isLValue: false,
                    value: ++argument.value,
                    type: argument.type
                }
            case '--':
                if (expression.argument.type === 'Identifier') {
                    let variable = this.lookupVariable((expression.argument as AST.Identifier).name);
                    if (variable) {
                        let variableObject = this.getVariableValue(variable);
                        let variableCurrentValue = variableObject.value
                        variableCurrentValue -= 1;
                        this.setVariableValue(variable, variableCurrentValue, variable.type);
                        return {
                            isLValue: false,
                            value: variableCurrentValue,
                            type: variableObject.type
                        }
                    }
                }
                return {
                    isLValue: false,
                    value: --argument.value,
                    type: argument.type

                }
            default:
                throw new CMachineError('Evaluation Error', `Prefix operator ${expression.operator} not supported`);
        }
    }

    // Evaluate a postfix expression
    private evaluatePostfixExpression(expression: AST.PostfixExpression): EvalResult {
        let argument: EvalResult = this.evaluateExpression(expression.argument);

        switch (expression.operator) {
            case '++':
                if (expression.argument.type === 'Identifier') {
                    let variable = this.lookupVariable((expression.argument as AST.Identifier).name);
                    if (variable) {
                        let variableObject = this.getVariableValue(variable);
                        let old = variableObject.value;
                        let variableCurrentValue = old + 1;
                        this.setVariableValue(variable, variableCurrentValue, variable.type);
                        return {
                            isLValue: false,
                            value: old,
                            type: variableObject.type
                        }
                    }
                }
                return {
                    isLValue: false,
                    value: argument.value++,
                    type: argument.type
                };
            case '--':
                if (expression.argument.type === 'Identifier') {
                    let variable = this.lookupVariable((expression.argument as AST.Identifier).name);
                    if (variable) {
                        let variableObject = this.getVariableValue(variable);
                        let old = variableObject.value;
                        let variableCurrentValue = old - 1;
                        this.setVariableValue(variable, variableCurrentValue, variable.type);
                        return {
                            isLValue: false,
                            value: old,
                            type: variableObject.type
                        }
                    }
                }
                return {
                    isLValue: false,
                    value: argument.value--,
                    type: argument.type
                };
            default:
                throw new CMachineError('Evaluation Error', `Postfix operator ${expression.operator} not supported`);
        }
    }

    // Evaluate a unary expression
    private evaluateUnaryExpression(expression: AST.UnaryExpression): EvalResult {
        const argument: EvalResult = this.evaluateExpression(expression.argument);

        switch (expression.operator) {
            case '&':
                if (!argument.address) {
                    throw new CMachineError('Evaluation Error', 'Cannot take address of rvalue');
                }
                return {
                    isLValue: true,
                    value: argument.address,
                    address: argument.address,
                    type: {
                        primitiveType: argument.type.primitiveType,
                        pointerLevel: argument.type.pointerLevel + 1
                    }
                }
            case '*':
                return this.handleDereference(expression);
            case '+':
                return argument;
            case '-':
                return {
                    isLValue: false,
                    value: -argument.value,
                    type: argument.type,
                }
            case '!':
                return {
                    isLValue: false,
                    value: argument.value ? 0 : 1,
                    type: {primitiveType: PrimitiveType.INT, pointerLevel: 0},
                }
            default:
                throw new CMachineError(
                    'Evaluation Error',
                    `Unary ${expression.operator} operator not supported`
                );
        }
    }

    // Handle dereference operator
    private handleDereference(expression: AST.UnaryExpression): EvalResult {
        const argument: EvalResult = this.evaluateExpression(expression.argument);


        const variable = this.lookupVariable((expression.argument as AST.Identifier).name);
        if (variable) {
            if (variable.arrayDimensions && variable.arrayDimensions.length > 0) {
                // Calculate the new pointer level.
                const newPointerLevel = argument.type.pointerLevel - 1;

                // If after decrementing we still have a pointer
                if (newPointerLevel >= 1) {
                    // console.log('Dereference diff', argument.value);
                    return {
                        isLValue: true,
                        value: argument.value,
                        address: argument.value,
                        type: {
                            primitiveType: variable.type.primitiveType,
                            pointerLevel: newPointerLevel,
                        }
                    };
                } else {
                    const baseType = {
                        primitiveType: variable.type.primitiveType,
                        pointerLevel: 0
                    };
                    const memoryVal = this.memoryMachine.readMemory(argument.value, baseType);

                    return {
                        isLValue: false,
                        value: memoryVal,
                        address: argument.value,
                        type: baseType
                    };
                }
            }
        }

        // Standard dereference
        const type = this.memoryMachine.getMemoryInfo(argument.value)?.type || {
            primitiveType: PrimitiveType.INT,
            pointerLevel: 0
        };
        return {
            isLValue: true,
            value: this.memoryMachine.readMemory(argument.value || 0, type),
            address: argument.value,
            type
        };


    }

    // Evaluate an identifier
    private evaluateIdentifier(expression: AST.Identifier): EvalResult {
        // Now treats NULL like an inbuilt null pointer
        if (expression.name == 'NULL'){
            return{
                isLValue: false,
                value: 0,
                type: {
                    primitiveType: PrimitiveType.INT,
                    pointerLevel: 0
                }
            };
        }
        // Get the address of the variable
        let variable = this.lookupVariable(expression.name);
        // Check if the variable exists
        if (!variable) {
            this.virtualLog("Variable not found");
            throw new CMachineError('Evaluation Error', `Variable not found ${expression.name}`);
        }

        // If this is an array - decay into a pointer
        if (variable.arrayDimensions && variable.arrayDimensions.length > 0) {
            // Return the pointer to the first element/sub-array.
            return {
                isLValue: false,
                value: variable.address,
                address: variable.address,
                type: {
                    primitiveType: variable.type.primitiveType,
                    // An array expression adds its dimensions to any pointer
                    // level already present in the declared element type.
                    // For example, char *items[3] decays to char **.
                    pointerLevel: variable.type.pointerLevel + variable.arrayDimensions.length
                },
                remainingDims: variable.arrayDimensions
            }
        } else {
            let memoryValue = this.memoryMachine.readMemory(variable.address, variable.type);

            return {
                isLValue: true,
                value: memoryValue,
                address: variable.address,
                type: variable.type
            }
        }
    }

    // Evaluate an array literal
    private evaluateArrayLiteral(expression: AST.ArrayLiteral): EvalResult {

        const elementCount = expression.value.length;

        // Evaluate first element to determine type
        const firstElement = this.evaluateExpression(expression.value[0]);
        const elementType = firstElement.type;
        const totalSize = elementCount * getPrimitiveTypeSize(elementType.primitiveType);

        // Allocate memory for the array
        const address = this.allocateMemory(totalSize, 'array', elementType, expression);

        // Complete the first element
        const result = this.evaluateExpression(expression.value[0]);
        this.memoryMachine.writeMemory(address, elementType, result);


        // Write each element to memory
        for (let i = 1; i < elementCount; i++) {
            const element = this.evaluateExpression(expression.value[i]);
            if (element.type !== elementType) {
                throw new CMachineError('Evaluation Error', `Array element type mismatch, array is ${elementType} and element is ${element.type}`);
            }
            const result = element.value
            this.memoryMachine.writeMemory(address + i * getTypeSize(elementType), elementType, result);
        }

        return {
            isLValue: true,
            value: address,
            address: address,
            type: {
                primitiveType: PrimitiveType.INT,
                pointerLevel: 1
            }
        };
    }

    // Evaluate a string literal (char array)
    private evaluateStringLiteral(expression: AST.StringLiteral): EvalResult {
        return {
            isLValue: false,
            value: [...expression.value.split('').map((char) => char.charCodeAt(0)), 0],
            type: {
                primitiveType: PrimitiveType.CHAR,
                pointerLevel: 0
            }
        }
    }

    // Evaluate an array initializer
    private evaluateArrayInitializer(expression: AST.ArrayInitializer): EvalResult {
        let value: { value: number, type: Type }[] = [];

        for (let element of expression.values) {
            if (element.type === 'ArrayInitializer') {
                const nestedValue: EvalResult = this.evaluateArrayInitializer(element as AST.ArrayInitializer);
                value.push(
                    {
                        value: nestedValue.value,
                        type: nestedValue.type
                    }
                );
            } else {
                const item: EvalResult = this.evaluateExpression(element as AST.Expression);
                value.push({
                    value: item.value,
                    type: item.type
                });
            }
        }

        return {
            isLValue: false,
            value: value[0],
            type: value[0].type

        }
    }

    // Mock C standard library functions
    private executeStandardLibFunction(name: string, args: any[], location: Location): any {
        if (this.debug)
            console.log('Executing Standard Lib Function', name, args);

        switch (name) {
            case 'printf':
                return this.handlePrintf(args);
            case 'fprintf':
                return this.handleFprintf(args);
            case 'sqrt':
                return this.handleSqrt(args);
            case 'strcmp':
                return this.handleStringCompare(args);
            case 'fopen':
                return this.handleFopen(args);
            case 'fgets':
                return this.handleFgets(args);
            case 'fclose':
                return this.handleFclose(args);
            case 'rewind':
                return this.handleRewind(args);
            case 'access':
                return this.handleAccess(args);
            case 'atoi':
                return this.handleAtoi(args);
            case 'strcspn':
                return this.handleStrcspn(args);
            case 'strtok':
                return this.handleStrtok(args);
            case 'strcpy':
                return this.handleStringCopy(args);
            case 'strlen':
                return this.handleStringLen(args);
            case 'malloc':
                return this.handleMalloc(args, location);
            case 'free':
                return this.handleFree(args);
            case 'realloc':
                return this.handleRealloc(args, location);
            case 'calloc':
                return this.handleCalloc(args, location);
            default:
                throw new CMachineError(
                    'Execution Error',
                    `Standard library function ${name} not found`
                );
        }
    }

    // MATH: Handle square root using the host numeric implementation.
    private handleSqrt(args: any[]): EvalResult {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'sqrt requires 1 argument');
        }

        const argument = this.evaluateExpression(args[0]);
        const value = Math.sqrt(Number(argument.value));
        this.returnRegister = value;

        return {
            isLValue: false,
            value,
            type: {primitiveType: PrimitiveType.DOUBLE, pointerLevel: 0}
        };
    }

    // Read a null-terminated C string from either a literal or virtual memory.
    private readCStringArgument(argument: AST.Expression): number[] {
        if (argument.type === 'StringLiteral') {
            const decoded = (argument as AST.StringLiteral).value.replace(
                /\\(n|r|t|\\|"|0)/g,
                (_match, escape) => ({
                    n: '\n',
                    r: '\r',
                    t: '\t',
                    '\\': '\\',
                    '"': '"',
                    '0': '\0'
                }[escape] ?? escape)
            );
            return Array.from(decoded)
                .map((character) => character.charCodeAt(0));
        }

        const evaluated = this.evaluateExpression(argument);
        const characters: number[] = [];
        let address = evaluated.value;
        let character = this.memoryMachine.readMemory(address, {
            primitiveType: PrimitiveType.CHAR,
            pointerLevel: 0
        });

        while (character !== 0) {
            characters.push(character);
            address++;
            character = this.memoryMachine.readMemory(address, {
                primitiveType: PrimitiveType.CHAR,
                pointerLevel: 0
            });
        }

        return characters;
    }

    // STRING: Compare two C strings and return a negative, zero, or positive int.
    private handleStringCompare(args: AST.Expression[]): EvalResult {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'strcmp requires 2 arguments');
        }

        const left = this.readCStringArgument(args[0]);
        const right = this.readCStringArgument(args[1]);
        const sharedLength = Math.min(left.length, right.length);
        let comparison = 0;

        for (let i = 0; i < sharedLength; i++) {
            if (left[i] !== right[i]) {
                comparison = left[i] - right[i];
                break;
            }
        }

        if (comparison === 0) {
            comparison = left.length - right.length;
        }

        this.returnRegister = comparison;
        return {
            isLValue: false,
            value: comparison,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private cStringToText(argument: AST.Expression): string {
        return this.readCStringArgument(argument)
            .map((character) => String.fromCharCode(character))
            .join('');
    }

    // FILE I/O is backed by deterministic in-browser coursework fixtures.
    private handleFopen(args: AST.Expression[]): EvalResult {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'fopen requires 2 arguments');
        }

        const filename = this.cStringToText(args[0]);
        const mode = this.cStringToText(args[1]);

        if (mode.startsWith('r') && !this.virtualFiles.has(filename)) {
            this.returnRegister = 0;
            return {
                isLValue: false,
                value: 0,
                type: {primitiveType: PrimitiveType.FILE, pointerLevel: 1}
            };
        }

        if (mode.startsWith('w')) this.virtualFiles.set(filename, '');
        if (!this.virtualFiles.has(filename)) this.virtualFiles.set(filename, '');

        const handle = this.nextFileHandle++;
        this.openFiles.set(handle, {
            filename,
            mode,
            position: mode.startsWith('a') ? (this.virtualFiles.get(filename)?.length ?? 0) : 0
        });
        this.returnRegister = handle;
        return {
            isLValue: false,
            value: handle,
            type: {primitiveType: PrimitiveType.FILE, pointerLevel: 1}
        };
    }

    private handleFgets(args: AST.Expression[]): EvalResult {
        if (args.length < 3) {
            throw new CMachineError('Execution Error', 'fgets requires 3 arguments');
        }

        const buffer = Number(this.evaluateExpression(args[0]).value);
        const size = Number(this.evaluateExpression(args[1]).value);
        const handle = Number(this.evaluateExpression(args[2]).value);
        const stream = this.openFiles.get(handle);
        const charPointerType = {primitiveType: PrimitiveType.CHAR, pointerLevel: 1};

        if (!stream || size <= 0) {
            this.returnRegister = 0;
            return {isLValue: false, value: 0, type: charPointerType};
        }

        const content = this.virtualFiles.get(stream.filename) ?? '';
        if (stream.position >= content.length) {
            this.returnRegister = 0;
            return {isLValue: false, value: 0, type: charPointerType};
        }

        const maximumEnd = Math.min(stream.position + Math.max(size - 1, 0), content.length);
        const newline = content.indexOf('\n', stream.position);
        const end = newline >= stream.position && newline < maximumEnd
            ? newline + 1
            : maximumEnd;
        const text = content.slice(stream.position, end);
        const charType = {primitiveType: PrimitiveType.CHAR, pointerLevel: 0};

        for (let i = 0; i < text.length; i++) {
            this.memoryMachine.writeMemory(buffer + i, charType, text.charCodeAt(i));
        }
        this.memoryMachine.writeMemory(buffer + text.length, charType, 0);

        stream.position = end;
        this.returnRegister = buffer;
        return {isLValue: false, value: buffer, address: buffer, type: charPointerType};
    }

    private handleFclose(args: AST.Expression[]): EvalResult {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'fclose requires 1 argument');
        }
        const handle = Number(this.evaluateExpression(args[0]).value);
        const result = this.openFiles.delete(handle) ? 0 : -1;
        this.returnRegister = result;
        return {
            isLValue: false,
            value: result,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleFprintf(args: AST.Expression[]): EvalResult {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'fprintf requires at least 2 arguments');
        }

        const handle = Number(this.evaluateExpression(args[0]).value);
        const stream = this.openFiles.get(handle);
        if (!stream || (!stream.mode.startsWith('w') && !stream.mode.startsWith('a'))) {
            this.returnRegister = -1;
            return {
                isLValue: false,
                value: -1,
                type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
            };
        }

        const output = this.formatOutput(args, 1);
        const content = this.virtualFiles.get(stream.filename) ?? '';
        const writePosition = stream.mode.startsWith('a') ? content.length : stream.position;
        const updated = content.slice(0, writePosition) + output + content.slice(writePosition + output.length);
        this.virtualFiles.set(stream.filename, updated);
        stream.position = writePosition + output.length;
        this.returnRegister = output.length;

        return {
            isLValue: false,
            value: output.length,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleRewind(args: AST.Expression[]): EvalResult {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'rewind requires 1 argument');
        }
        const handle = Number(this.evaluateExpression(args[0]).value);
        const stream = this.openFiles.get(handle);
        if (stream) stream.position = 0;
        this.returnRegister = 0;
        return {
            isLValue: false,
            value: 0,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleAccess(args: AST.Expression[]): EvalResult {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'access requires a filename');
        }
        const filename = this.cStringToText(args[0]);
        const result = this.virtualFiles.has(filename) ? 0 : -1;
        this.returnRegister = result;
        return {
            isLValue: false,
            value: result,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleAtoi(args: AST.Expression[]): EvalResult {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'atoi requires 1 argument');
        }
        const parsed = Number.parseInt(this.cStringToText(args[0]).trim(), 10);
        const result = Number.isNaN(parsed) ? 0 : parsed;
        this.returnRegister = result;
        return {
            isLValue: false,
            value: result,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleStrcspn(args: AST.Expression[]): EvalResult {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'strcspn requires 2 arguments');
        }
        const text = this.readCStringArgument(args[0]);
        const rejected = new Set(this.readCStringArgument(args[1]));
        const found = text.findIndex((character) => rejected.has(character));
        const result = found === -1 ? text.length : found;
        this.returnRegister = result;
        return {
            isLValue: false,
            value: result,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}
        };
    }

    private handleStrtok(args: AST.Expression[]): EvalResult {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'strtok requires 2 arguments');
        }

        const supplied = Number(this.evaluateExpression(args[0]).value);
        let address = supplied === 0 ? this.strtokNextAddress : supplied;
        const pointerType = {primitiveType: PrimitiveType.CHAR, pointerLevel: 1};
        if (address === null) {
            this.returnRegister = 0;
            return {isLValue: false, value: 0, type: pointerType};
        }

        const delimiters = new Set(this.readCStringArgument(args[1]));
        const charType = {primitiveType: PrimitiveType.CHAR, pointerLevel: 0};
        let character = this.memoryMachine.readMemory(address, charType);
        while (character !== 0 && delimiters.has(character)) {
            address++;
            character = this.memoryMachine.readMemory(address, charType);
        }

        if (character === 0) {
            this.strtokNextAddress = null;
            this.returnRegister = 0;
            return {isLValue: false, value: 0, type: pointerType};
        }

        const tokenStart = address;
        while (character !== 0 && !delimiters.has(character)) {
            address++;
            character = this.memoryMachine.readMemory(address, charType);
        }

        if (character === 0) {
            this.strtokNextAddress = null;
        } else {
            this.memoryMachine.writeMemory(address, charType, 0);
            this.strtokNextAddress = address + 1;
        }

        this.returnRegister = tokenStart;
        return {isLValue: false, value: tokenStart, address: tokenStart, type: pointerType};
    }

    // Handle free function
    private handleFree(args: any[]): any {
        if (args.length === 0) return;
        const argument = this.evaluateExpression(args[0]);
        const address = argument.value;
        this.memoryMachine.freeMemory(address);
        return;
    }

    // STDLIB: Handle string length function
    private handleStringLen(args: any[]): any {
        if (args.length < 1) {
            throw new CMachineError('Execution Error', 'strlen requires 1 argument');
        }

        const str = this.evaluateExpression(args[0]);
        if (!str.address) {
            throw new CMachineError('Execution Error', 'strlen requires a string argument');
        }
        let address = str.address;
        let length = 0;
        let char = this.memoryMachine.readMemory(address, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0});
        while (char !== 0) {
            length++;
            char = this.memoryMachine.readMemory(++address, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0});
        }

        this.returnRegister = length;
        return {
            isLValue: false,
            value: length,
            type: {primitiveType: PrimitiveType.INT, pointerLevel: 0}

        };
    }

    // STRING: Handle string copy function
    private handleStringCopy(args: any[]): any {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'strcpy requires 2 arguments');
        }

        const dest = this.evaluateExpression(args[0]);
        const src = this.evaluateExpression(args[1]);

        let address = dest.value;
        let srcAddress = src.value;

        let char = this.memoryMachine.readMemory(srcAddress, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0});
        while (char !== 0) {
            this.memoryMachine.writeMemory(address, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0}, char);
            char = this.memoryMachine.readMemory(++srcAddress, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0});
            address++;
        }

        this.memoryMachine.writeMemory(address, {primitiveType: PrimitiveType.CHAR, pointerLevel: 0}, 0);

        this.returnRegister = dest.value;
        return dest.value;
    }

    // Check if a function is a standard library function
    private isStandardLibFunction(name: string): boolean {
        switch (name) {
            case 'printf':
            case 'fprintf':
            case 'sqrt':
            case 'strcmp':
            case 'fopen':
            case 'fgets':
            case 'fclose':
            case 'rewind':
            case 'access':
            case 'atoi':
            case 'strcspn':
            case 'strtok':
            case 'malloc':
            case 'realloc':
            case 'strlen':
            case 'strcpy':
            case 'free':
            case 'calloc':
                return true;
            default:
                return false;
        }
    }

    // Support malloc function (mocked in js)
    private handleMalloc(args: any[], location: Location): any {
        if (args.length === 0) return 0;
        const argument = this.evaluateExpression(args[0]);
        const size = argument.value;
        let address = this.allocateMemory(size, `malloc_${this.mallocCounter++}`, {
            primitiveType: PrimitiveType.INT,
            pointerLevel: 0
        }, location);
        // Preserve an explicit sizeof(struct ...) hint for the optional node view.
        const operand = args[0]?.type === 'SizeofExpression' ? args[0].expression : null;
        if (operand?.type === 'TypeSpecifier' && operand.name.startsWith('struct ')) {
            const allocation = this.memoryMachine.getMemoryInfo(address);
            if (allocation) allocation.type = {...allocation.type, customTypeName: operand.name.substring(7)};
        }
        this.returnRegister = address;
        return {
            isLValue: false,
            value: address,
            address: address,
        }
    }

    getHeapStructDefinition(allocation: import('@CMachine/CMemory.ts').MemoryAllocation): StructDefinition | undefined {
        if (allocation.type.customTypeName) return this.structTable.get(allocation.type.customTypeName);
        const scopes = [this.globalScope, ...this.callStack.map(frame => frame.variables)];
        for (const scope of scopes) {
            for (const variable of scope.values()) {
                if (variable.type.primitiveType === PrimitiveType.STRUCT && variable.type.pointerLevel === 1 &&
                    variable.type.customTypeName && this.getVariableValue(variable).value === allocation.start) {
                    return this.structTable.get(variable.type.customTypeName);
                }
            }
        }
        return undefined;
    }

    // Supports realloc function to resize heap allocation and return a new address
    private handleRealloc(args: any[], location: Location): any {
        if (args.length < 2) {
            throw new CMachineError('Execution Error', 'realloc needs 2 arguments');
        }
        const pointer = this.evaluateExpression(args[0]);
        const newSize = this.evaluateExpression(args[1]).value;
        const oldAddress = pointer.value;

        if (oldAddress=== 0) {
            return this.handleMalloc([args[1]], location);
        }

        if (newSize === 0) {
            this.memoryMachine.freeMemory(oldAddress);
            this.returnRegister = 0;

            return {
                isLValue: false,
                value: 0,
                address: 0,
            };
        }

        const newAddress = this.memoryMachine.reallocateMemory(
            oldAddress,
            newSize,
            {
                primitiveType: PrimitiveType.INT,
                pointerLevel: 0
            },
            location
        );

        this.returnRegister = newAddress;

        return {
            isLValue: false,
            value: newAddress,
            address: newAddress,
        };
    }

    // Supports calloc function to allocate heap memory and fills it with 0s
private handleCalloc(args: any[], location: Location):any {
    if (args.length < 2) {
        throw new CMachineError('Execution Error', 'calloc needs 2 arguments');
    }
    const count = this.evaluateExpression(args[0]).value;
    const elementSize = this.evaluateExpression(args[1]).value;
    const totalSize = count * elementSize;

    const zeroValues = new Array(Math.ceil(totalSize/ getPrimitiveTypeSize(PrimitiveType.INT))).fill(0);

    const address = this.memoryMachine.allocateOnHeap(
        totalSize,
        `calloc_${this.mallocCounter++}`,
        zeroValues,
        {
            primitiveType: PrimitiveType.INT,
            pointerLevel: 0
        },
        location
    );

    this.returnRegister = address;

    return {
        isLValue: false,
        value: address,
        address: address,
    };
}

    private formatOutput(args: AST.Expression[], formatIndex: number): string {
        const formatString = args[formatIndex] as AST.StringLiteral;
        if (formatString.type !== 'StringLiteral') {
            throw new CMachineError('Execution Error', 'Format string not provided');
        }

        const decodedFormat = formatString.value.replace(/\\(n|t|\\|")/g, (match, p1) => p1 === 'n' ? '\n' : p1 === 't' ? '\t' : p1);

        let output = '';
        let argIndex = formatIndex + 1;

        for (let i = 0; i < decodedFormat.length; i++) {
            if (decodedFormat[i] === '%' && i + 1 < decodedFormat.length) {
                const conversionStart = i;
                let cursor = i + 1;

                if (decodedFormat[cursor] === '%') {
                    output += '%';
                    i = cursor;
                    continue;
                }

                // Accept the commonly used printf form %[flags][width][.precision]type.
                while ('-+ #0'.includes(decodedFormat[cursor] ?? '')) cursor++;
                while (/\d/.test(decodedFormat[cursor] ?? '')) cursor++;

                let precision: number | undefined;
                if (decodedFormat[cursor] === '.') {
                    cursor++;
                    const precisionStart = cursor;
                    while (/\d/.test(decodedFormat[cursor] ?? '')) cursor++;
                    precision = cursor > precisionStart
                        ? Number(decodedFormat.slice(precisionStart, cursor))
                        : 0;
                }

                const conversion = decodedFormat[cursor];
                i = cursor;
                switch (conversion) {
                    case 'd':
                    case 'i':
                        output += this.evaluateExpression(args[argIndex++]).value;
                        break;
                    case 'f':
                        output += this.evaluateExpression(args[argIndex++]).value.toFixed(precision ?? 6);
                        break;
                    case 's':
                        let string = '';
                        let address = this.evaluateExpression(args[argIndex++]).value;
                        let char = this.memoryMachine.readMemory(address, {
                            primitiveType: PrimitiveType.CHAR,
                            pointerLevel: 0
                        });
                        while (char !== 0) {
                            string += String.fromCharCode(char);
                            char = this.memoryMachine.readMemory(++address, {
                                primitiveType: PrimitiveType.CHAR,
                                pointerLevel: 0
                            });

                        }
                        output += string;
                        break;
                    case 'p':
                        output += '0x' + this.evaluateExpression(args[argIndex++]).value.toString(16).toUpperCase();
                        break;
                    case 'c':
                        output += String.fromCharCode(
                            this.evaluateExpression(args[argIndex++]).value
                        );
                        break;
                    default:
                        output += decodedFormat.slice(conversionStart, cursor + 1);
                        break;
                }
            } else {
                output += decodedFormat[i];
            }
        }

        return output;
    }

    // Support printf function (mocked in js)
    private handlePrintf(args: AST.Expression[]): void {
        if (args.length === 0) return;
        this.virtualLog(this.formatOutput(args, 0));
    }

    // Map top level functions to the function table
    initializeGlobalFunctions(): void {
        if (this.debug)
            console.log('Initializing global functions');

        const program = this.programAST;

        // Extract global declarations
        const globalDeclarations: AST.Declaration[] = program.globalDeclarations;

        // Filter out function declarations
        const functionDeclarations: AST.Declaration[] = globalDeclarations.filter(
            (declaration) => declaration.type === 'FunctionDeclaration'
        );

        // Process global functions
        for (let declaration of functionDeclarations) {
            const funcDeclaration: AST.FunctionDeclaration =
                declaration as AST.FunctionDeclaration;
            const name = funcDeclaration.id.name;
            const returnTypeSpecifier = funcDeclaration.typeSpecifier;
            const returnType = typeSpecifierToType(returnTypeSpecifier);
            const parameters: Parameter[] = [];

            for (let parameter of funcDeclaration.parameters) {
                let paramTypeSpecifier = parameter.typeSpecifier;
                let paramType = typeSpecifierToType(paramTypeSpecifier);
                let name = parameter.id.name;
                parameters.push({name, type: paramType});
            }

            let body = funcDeclaration.body;

            this.functionTable.set(name, {name, returnType, parameters, body});
        }

    }

    // Map top level variables to the global scope
    initializeGlobalScope(): void {
        if (this.debug)
            console.log('Initializing global scope');

        const program = this.programAST;

        // Extract global declarations
        const globalDeclarations: AST.Declaration[] = program.globalDeclarations;

        // Filter out variable declarations
        const variableDeclarations: AST.Declaration[] = globalDeclarations.filter(
            (declaration) => declaration.type === 'VariableDeclaration'
        );


        let proposals: MemoryAllocationProposal[] = [];

        // Process global variables
        for (let declaration of variableDeclarations) {
            let varDeclaration: AST.VariableDeclaration =
                declaration as AST.VariableDeclaration;
            const declarators: AST.Declarator[] = varDeclaration.declarators;

            for (let declarator of declarators) {
                const variable: AST.VariableDeclarator =
                    declarator as AST.VariableDeclarator;
                const name = variable.id.name;
                const typeSpecifier = variable.typeSpecifier;
                const type = typeSpecifierToType(typeSpecifier);
                const size = getTypeSize(type);

                let initValue;
                if (variable.init)
                    initValue = this.evaluateExpression(variable.init as AST.Expression);

                proposals.push({
                    size,
                    identifier: name,
                    type: typeSpecifierToType(typeSpecifier),
                    location: variable.location,
                    value: initValue?.value
                });
            }
        }

        // Sort proposals by initialisation or uninitialized
        proposals = proposals.sort((a, b) => {
            if (a.value) {
                return -1;
            }
            return 1;
        });

        let addresses: number[] = this.memoryMachine.processGlobalDeclaration(proposals);

        for (let i = 0; i < proposals.length; i++) {
            let proposal = proposals[i];
            this.globalScope.set(
                proposal.identifier,
                {
                    name: proposal.identifier,
                    address: addresses[i],
                    size: proposal.size,
                    type: proposal.type
                }
            );
        }

    }

    // Push a new stack frame to the call stack
    pushStackFrame(frame: StackFrame): void {
        if (this.debug)
            console.log('Pushing stack frame', frame);
        this.callStack.push(frame);
        this.currentScope++;
    }

    // Pop the top stack frame from the call stack
    popStackFrame(): void {
        // Check if stack is empty
        if (this.callStack.length == 0) {
            throw new CMachineError('Stack Error', 'Stack is empty');
        }

        // Pop stack frame
        let frame = this.callStack.pop();
        if (this.debug)
            console.log('Popping stack frame', frame);
        if (frame) {
            // Free the parameter memory
            for (let variable of frame.variables.values()) {
                if (this.debug)
                    console.log('Freeing memory', variable);
                this.memoryMachine.freeMemory(variable.address);
            }
        }

        // Decrease the current scope
        this.currentScope--;
    }


    // Declare a variable in the current stack frame
    declareVariable(
        name: string,
        type: Type,
        isGlobal: boolean,
        value: any = null,
        forceSize: number | undefined = undefined,
        location: Location
    ): EvalResult {
        let size = getTypeSize(type);

        if (forceSize) {
            size = forceSize;
        }


        let address = 0;

        if (isGlobal) {
            address = this.memoryMachine.allocateOnHeap(size, `global_${name}`, value, type, location);
            this.globalScope.set(name, {
                name,
                address,
                size,
                type,
            });
        } else {
            let currentFrame = this.getCurrentStackFrame();
            address = this.memoryMachine.allocateOnStack(
                size,
                `${currentFrame.name}_${name}`,
                value,
                type,
                location
            );
            currentFrame.variables.set(name, {name, type, address, size});
        }

        return {
            isLValue: true,
            value: address,
            address: address,
            type
        }
    }

    // Lookup a variable in the current stack frame or global scope
    lookupVariable(name: string): Variable | undefined {
        let variable = null;


        // Check if variable is in the current stack frame
        if (this.callStack.length > 0) {
            let currentFrame = this.getCurrentStackFrame();
            variable = currentFrame.variables.get(name);
        }

        // Check if variable is in the global scope
        if (!variable) {
            variable = this.globalScope.get(name);
        }
        return variable;
    }

    // Get the value of a tracked variable
    getVariableValue(variable: Variable): EvalResult {
        let allocation = this.memoryMachine.getMemoryInfo(variable.address);
        if (!allocation) {
            throw new CMachineError('Memory Error', 'Variable not found');
        }

        const value = this.memoryMachine.readMemory(variable.address, allocation.type);
        return {
            isLValue: true,
            value: value,
            address: variable.address,
            type: allocation.type
        }
    }

    // Get the value of at a given memory address of a given size
    getHeapSection(address: number, size: number): number[] {
        let allocation = this.memoryMachine.getMemoryInfo(address);
        if (!allocation) {
            throw new CMachineError('Memory Error', 'Variable not found');
        }
        return this.memoryMachine.readMemorySegment(address, size);
    }

    // Set the value of a tracked variable
    setVariableValue(variable: Variable, value: number, type: Type): void {
        let allocation = this.memoryMachine.getMemoryInfo(variable.address);
        if (!allocation) {
            throw new CMachineError('Memory Error', 'Variable not found');
        }
        this.memoryMachine.writeMemory(variable.address, type, value);
    }

    // Get the address of a variable in the current stack frame or global scope
    allocateMemory(size: number, identifier: string, type: Type, location: Location): number {
        return this.memoryMachine.allocateOnHeap(size, identifier, 0, type, location);
    }

    // Get the current stack frame
    getCurrentStackFrame(): StackFrame {
        // Check if stack is empty
        if (this.callStack.length == 0) {
            throw new CMachineError('Stack Error', 'Stack is empty');
        }

        return this.callStack[this.callStack.length - 1];
    }

    // Current program snapshot
    getProgramSnapshot()
        :
        ProgramSnapshot {
        return {
            memory: this.memoryMachine,
            callStack: this.callStack,
            globalScope: this.globalScope,
            functionTable: this.functionTable,
            currentLine: this.getCurrentStepLine(),
            executionStack: this.executionStack,
            machine: this
        };
    }

}
