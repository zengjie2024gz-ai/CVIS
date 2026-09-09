import React from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {LinkedListView} from "@/components/LinkedListView.tsx";
import {getTypeSize, PrimitiveType, ProgramSnapshot, Variable} from "@CMachine/CMachineTypes.ts";
import type {MemoryAllocation} from "@CMachine/CMemory.ts";

interface ViDSConceptViewProps {
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
}

type PointerConceptInfo = {
    name: string;
    value: number;
};

type TableCell = {
    index: number;
    address: number;
    value: number | string;
};

type ArrayCell = {
    name: string;
    cells: TableCell[];
};

type HeapCell = {
    name: string;
    address: number;
    size: number;
    cells: TableCell[];
};

// To choose which conceptual view ViDS shows to fit the current code example
export const ViDSConceptView = ({snapshot, inputCode, currentLine}: ViDSConceptViewProps) => {
    const pointerVariables = getPointerVariables(snapshot);
    const hasLinkedList = detectLinkedList(snapshot, inputCode);
    const hasArrayCode = detectArrayCode(inputCode);
    const hasHeapStuff = detectHeapStuff(inputCode);
    const hasRecursion = detectRecursion(snapshot, inputCode);


    if (hasLinkedList) {
        return (
            <LinkedListView
                snapshot={snapshot}
                inputCode={inputCode}
                currentLine={currentLine}/>
        );
    }

    if (hasRecursion) {
        return (
            <RecursionConceptView
                snapshot={snapshot}
                inputCode={inputCode}
                currentLine={currentLine}/>
        );
    }

    if (hasHeapStuff) {
        return (
            <HeapMemoryView
                snapshot={snapshot}
                inputCode={inputCode}
                currentLine={currentLine}
                pointerVariables={pointerVariables}/>
        );
    }

    if (hasArrayCode) {
        return (
            <ArrayConceptView
                snapshot={snapshot}
                inputCode={inputCode}
                currentLine={currentLine}
                pointerVariables={pointerVariables}/>
        );
}

    if (pointerVariables.length > 0) {
        return (
            <PointerConceptView
                snapshot={snapshot}
                inputCode={inputCode}
                currentLine={currentLine}
                pointerVariables={pointerVariables}/>
        );
    }

    return (
        <GeneralConceptView
            inputCode={inputCode}
            currentLine={currentLine}/>
    );
};

// Used for all the different views
const getLineTextToShow = (currentLineText: string) => {
    let lineTextToShow = "No line selected";

    if (currentLineText.length > 0) {
        lineTextToShow = currentLineText;
    }

    return lineTextToShow;
};

const getCurrentLineText = (inputCode: string, currentLine: number | null) => {
    if (currentLine === null) {
        return "";
    }

    const lines = inputCode.split("\n");

    if (currentLine < 1 || currentLine > lines.length) {
        return "";
    }

    return lines[currentLine - 1].trim();
};

const formatAddress = (value: number) => {
    if (value === 0) {
        return "NULL";
    }

    return `0x${value.toString(16).toUpperCase()}`;
};

// Finds pointer variables so they can be shown as arrows in ViDS
const getPointerVariables = (snapshot: ProgramSnapshot) => {
    const pointerVariables: PointerConceptInfo[] = [];
    const machine = snapshot.machine;

    if (snapshot.callStack.length > 0){
        const currentFrame = snapshot.callStack[snapshot.callStack.length - 1];

        currentFrame.variables.forEach((variable, name) => {
            if (variable.type.pointerLevel > 0) {
                const variableValue = machine.getVariableValue(variable).value;

                pointerVariables.push({name: name, value: variableValue});
            }
        });
    }
    snapshot.globalScope.forEach((variable, name) => {
        if (variable.type.pointerLevel > 0) {
            const variableValue = machine.getVariableValue(variable).value;

            pointerVariables.push({name: name, value: variableValue});
        }
    });

    return pointerVariables;
};

// Gets readable variables from globals and current stack frame
const getVarsForVids = (snapshot: ProgramSnapshot) => {
    const output: {
        name: string;
        address: number;
        value: number;
        variable: Variable;
    }[] = [];

    const addVar = (variable: Variable, name: string) => {
        try {
            output.push({
                name,
                address: variable.address,
                value: snapshot.machine.getVariableValue(variable).value,
                variable,
            });
        } catch {
            // Some variables might be gone after stack changes.
        }
    };

    if (snapshot.callStack.length> 0) {
        const frame = snapshot.callStack[snapshot.callStack.length - 1];

        frame.variables.forEach((variable, name) => {
            addVar(variable, name);
        });
    }

    snapshot.globalScope.forEach((variable, name) => {
        addVar(variable, name);
    });
    return output;
};

// Works out what a pointer is pointing to for the arrow label 
const getPointerTargetText = (snapshot: ProgramSnapshot, pointerValue: number) => {
    if (pointerValue === 0) {
        return "NULL";
    }

    const variables = getVarsForVids(snapshot);

    for (let i = 0; i < variables.length; i++) {
        if (variables[i].address === pointerValue) {
            return `${variables[i].name} =${variables[i].value}`;
        }
    }

    const heapInfo = snapshot.memory.getMemoryInfo(pointerValue);
    if (heapInfo && heapInfo.regionType === "heap") {
        return `heap block ${formatAddress(heapInfo.start)}`;
    }

    return `invalid address ${formatAddress(pointerValue)}`;
};

// Builds a simple table data for array variables
const getArrayTableData = (snapshot: ProgramSnapshot) => {
    const arrays: ArrayCell[] = [];
    const variables = getVarsForVids(snapshot);

    for (let item of variables){
        const variable = item.variable;

        if (!variable.arrayDimensions || variable.arrayDimensions.length === 0) {
            continue;
        }

        const total = variable.arrayDimensions.reduce((acc, dim) => (acc * dim), 1);
        const size = getTypeSize(variable.type);
        const cells: TableCell[] = [];

        for (let i = 0; i < total; i++){
            const address = variable.address + i * size;
            try {
                cells.push({
                    index: i,
                    address,
                    value: snapshot.memory.readMemory(address, variable.type),
                });
            } catch {
                cells.push({
                    index: i,
                    address,
                    value: "?",
                });
            }
        }

        arrays.push({
            name: item.name,
            cells,
        });
    }
    return arrays;
};

// Builds table data for heap blocks that were made from malloc , calloc, realloc
const getHeapTableData= (snapshot: ProgramSnapshot) => {
    const heap = snapshot.memory.getHeapDump() as MemoryAllocation[];
    const output: HeapCell[] = [];

    for (let allocation of heap) {
        if (!allocation.allocated) {
            continue;
        }

        const intType = {
            primitiveType: PrimitiveType.INT,
            pointerLevel: 0,
        };

        const cellSize = getTypeSize(intType);
        const cellCount = Math.max(1, Math.floor(allocation.size / cellSize));
        const cells: TableCell[] = [];

        for (let i = 0; i < cellCount; i++){
            const address = allocation.start + i * cellSize;
            try {
                cells.push({
                    index: i,
                    address,
                    value: snapshot.memory.readMemory(address, intType),
                });
            } catch {
                cells.push({
                    index: i,
                    address,
                    value: "?",
                });
            }
        }

        output.push({
            name: allocation.identifier,
            address: allocation.start,
            size: allocation.size,
            cells,
        });
    }

    return output;
};
    

const detectLinkedList = (snapshot: ProgramSnapshot, inputCode: string) => {
    if (inputCode.indexOf("struct Node") !== -1) {
        return true;
    }

    if (inputCode.indexOf("->next") !== -1){
        return true;
    }

    return false;
};


// Basic recursion check for ViDS 
const detectRecursion = (snapshot: ProgramSnapshot, inputCode: string) => {
    if (snapshot.callStack.length > 1) {
        return true;
    }

    if (!inputCode) {
        return false;
    }

    if (inputCode.indexOf("factorial(") !== -1) {
        return true;
    }

    return false;
};

const detectArrayCode = (inputCode: string) => {
    if (inputCode.indexOf("[") !== -1 && inputCode.indexOf("]") !== -1) {
        return true;
    }
    return false;
};

// Checks if selected snippet is about heap memory
const detectHeapStuff = (inputCode: string) => {
    if (inputCode.indexOf("malloc") !== -1){
        return true;
    } 
    if (inputCode.indexOf("calloc") !== -1){
        return true;
    } 
    if (inputCode.indexOf("realloc") !== -1){
        return true;
    } 
    if (inputCode.indexOf("free(") !== -1){
        return true;
    } 
    return false;
};

// Shows pointer examples with arrows instead of just text
const PointerConceptView = ({snapshot, inputCode, currentLine, pointerVariables}: {
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
    pointerVariables: PointerConceptInfo[];
}) => {
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    let lineTextToShow = "No line selected";

    if (currentLineText.length > 0) {
        lineTextToShow = currentLineText;
    }

    let explanation = "Pointers store addresses. The arrow shows where each pointer is pointing.";

    if (currentLineText.indexOf("&") !== -1) {
        explanation = "The 'address of' operator is being used to give a pointer the address of another variable.";
    } else if (currentLineText.indexOf("*") !== -1) {
        explanation = "The pointer is being dereferenced, so the program is using the value at that address.";
    } else if (currentLineText.indexOf("=") !== -1) {
        explanation = "An assignment is happening, therefore the pointer arrow may change after this step.";
    }

    return (
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS Pointer View</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3 text-sm font-semibold">Current line</div>
                    <div className="rounded-md border bg-white p-2 font-mono text-sm">
                        {lineTextToShow}
                    </div>
                </div>

                <div className="rounded-md border p-4">
                    <div className="mb-3 text-sm font-semibold">Pointer arrows</div>

                    <div className="space-y-3">
                        {pointerVariables.map((pointer) => (
                            <div
                                key={pointer.name}
                                className="grid grid-cols-[150px_70px_1fr] items-center gap-3">
                                <div className="rounded-md border bg-slate-50 p-3 text-sm">
                                    <div className="font-semibold">{pointer.name}</div>
                                    <div className="font-mono text-xs text-muted-foreground">
                                        {formatAddress(pointer.value)}
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    <div className="h-0.5 w-10 bg-blue-500"></div>
                                    <div className="h-0 w-0 border-y-4 border-l-8 border-y-transparent border-l-blue-500"></div>
                                </div>

                                <div className="rounded-md border bg-blue-50 p-3 text-sm">
                                    {getPointerTargetText(snapshot, pointer.value)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-md border bg-blue-50 p-4 text-sm text-blue-800">
                    {explanation}
                </div>
            </CardContent>
        </Card>
    );
};


// Shows array examples as indexed table cells
const ArrayConceptView = ({snapshot, inputCode, currentLine, pointerVariables}: {
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
    pointerVariables: PointerConceptInfo[];
}) => {
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    const lineTextToShow = getLineTextToShow(currentLineText);

    const arrays = getArrayTableData(snapshot);

    return (
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS Array View</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3 text-sm font-semibold">Current line</div>
                    <div className="rounded-md border bg-white p-2 font-mono text-sm">
                        {lineTextToShow}
                    </div>
                </div>

                {arrays.length === 0 && (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                        Step forward until the array has been created.
                    </div>
                )}

                {arrays.map((array) => (
                    <div key={array.name} className="rounded-md border p-4">
                        <div className="mb-3">
                            <Badge variant="outline">{array.name}</Badge>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="border-collapse text-sm">
                                <thead>
                                <tr>
                                    {array.cells.map((cell) => (
                                        <th
                                            key={cell.index}
                                            className="border bg-muted/40 px-4 py-2 text-center">
                                            [{cell.index}]
                                        </th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody>
                                <tr>
                                    {array.cells.map((cell) => (
                                        <td
                                            key={cell.index}
                                            className="border px-4 py-3 text-center font-mono">
                                            {cell.value}
                                        </td>
                                    ))}
                                </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}

                {pointerVariables.length > 0 && (
                    <div className="rounded-md border p-4">
                        <div className="mb-3 text-sm font-semibold">Pointer variables</div>

                        <div className="flex flex-wrap gap-3">
                            {pointerVariables.map((pointer) => (
                                <div
                                    key={pointer.name}
                                    className="rounded-md border bg-slate-50 p-3 text-sm">
                                    <div className="font-semibold">{pointer.name}</div>
                                    <div className="font-mono text-xs">
                                        {formatAddress(pointer.value)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-md border bg-blue-50 p-4 text-sm text-blue-800">
                    Arrays are pictured as indexed cells. Each box is one array position.
                </div>
            </CardContent>
        </Card>
    );
};



// CHANGE TERTIARY
const RecursionConceptView = ({snapshot, inputCode, currentLine}: {
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
}) => {
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    const lineTextToShow = getLineTextToShow(currentLineText);


    return (
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS Recursion View</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3 text-sm font-semibold">
                        Current line
                    </div>
                    <div className="rounded-md border bg-white p-2 font-mono text-sm">
                        {lineTextToShow}
                    </div>
                </div>

                <div className="rounded-md border p-4">
                    <Badge variant="outline">
                        {snapshot.callStack.length} stack frame(s)
                    </Badge>

                    <p className="mt-3 text-sm text-muted-foreground">
                        This program is using function calls. Each call creates a new stack frame.
                        In recursion, the same function can appear more than once on the call stack.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};


// Shows malloc, calloc, realloc as heap allocations
const HeapMemoryView = ({snapshot, inputCode, currentLine, pointerVariables}: {
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
    pointerVariables: PointerConceptInfo[];
}) => {
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    const lineTextToShow = getLineTextToShow(currentLineText);

    const heapData = getHeapTableData(snapshot);

    let explanation = "This program uses heap memory. The boxes show active heap allocations.";

    if (currentLineText.indexOf("calloc") !== -1) {
        explanation = "calloc makes heap memory and starts the values at zero.";
    } else if (currentLineText.indexOf("realloc") !== -1) {
        explanation = "realloc changes the size of an existing heap allocation.";
    } else if (currentLineText.indexOf("malloc") !== -1) {
        explanation = "malloc creates a new block of heap memory.";
    } else if (currentLineText.indexOf("free") !== -1) {
        explanation = "free releases heap memory. Old pointers can become dangling.";
    }

    return (
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS Heap View</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3 text-sm font-semibold">Current line</div>
                    <div className="rounded-md border bg-white p-2 font-mono text-sm">
                        {lineTextToShow}
                    </div>
                </div>

                {pointerVariables.length > 0 && (
                    <div className="rounded-md border p-4">
                        <div className="mb-3 text-sm font-semibold">Pointers</div>

                        <div className="space-y-3">
                            {pointerVariables.map((pointer) => (
                                <div
                                    key={pointer.name}
                                    className="grid grid-cols-[150px_70px_1fr] items-center gap-3">
                                    <div className="rounded-md border bg-slate-50 p-3 text-sm">
                                        <div className="font-semibold">{pointer.name}</div>
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {formatAddress(pointer.value)}
                                        </div>
                                    </div>

                                    <div className="flex items-center">
                                        <div className="h-0.5 w-10 bg-blue-500"></div>
                                        <div className="h-0 w-0 border-y-4 border-l-8 border-y-transparent border-l-blue-500"></div>
                                    </div>

                                    <div className="rounded-md border bg-blue-50 p-3 text-sm">
                                        {getPointerTargetText(snapshot, pointer.value)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-md border p-4">
                    <div className="mb-3 text-sm font-semibold">Heap blocks</div>

                    {heapData.length === 0 && (
                        <div className="text-sm text-muted-foreground">
                            No heap blocks are active right now.
                        </div>
                    )}

                    <div className="space-y-4">
                        {heapData.map((heap) => (
                            <div
                                key={`${heap.name}-${heap.address}`}
                                className="rounded-md border bg-slate-50 p-4">
                                <div className="mb-3 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline">{heap.name}</Badge>
                                    <span className="font-mono text-sm">
                                        {formatAddress(heap.address)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {heap.size} bytes
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="border-collapse text-sm">
                                        <thead>
                                        <tr>
                                            {heap.cells.map((cell) => (
                                                <th
                                                    key={cell.index}
                                                    className="border bg-muted/40 px-4 py-2 text-center">
                                                    [{cell.index}]
                                                </th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody>
                                        <tr>
                                            {heap.cells.map((cell) => (
                                                <td
                                                    key={cell.index}
                                                    className="border px-4 py-3 text-center font-mono">
                                                    {cell.value}
                                                </td>
                                            ))}
                                        </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="rounded-md border bg-blue-50 p-4 text-sm text-blue-800">
                    {explanation}
                </div>
            </CardContent>
        </Card>
    );
};


// Fallback view for any code that doesn't match a specific view
const GeneralConceptView = ({inputCode, currentLine}: {
    inputCode: string;
    currentLine: number | null;
}) => {
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    const lineTextToShow = getLineTextToShow(currentLineText);

    return (
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS General View</CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-md border bg-muted/20 p-4">
                    <div className="mb-3 text-sm font-semibold">
                        Current line
                    </div>
                    <div className="rounded-md border bg-white p-2 font-mono text-sm">
                        {lineTextToShow}
                    </div>
                </div>

                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                    This snippet does not create a linked list, array, pointer structure, or recursive
                    call for ViDS to display visually. CVIS still shows the low-level
                    stack, heap and memory details.
                </div>
            </CardContent>
        </Card>
    );
};