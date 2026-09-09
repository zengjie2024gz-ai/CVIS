import {Separator} from "@/components/ui/separator.tsx";
import {type ProgramStateMachine,} from "@CMachine/CMachine.ts";
import {PrimitiveType, ProgramSnapshot, StackFrame, Variable} from "@CMachine/CMachineTypes.ts";
import React, {useState} from "react";
import {Card, CardContent} from "@/components/ui/card.tsx";
import {
    ChevronDown,
    ChevronUp,
    Code,
    Globe,
    Database,
    FileDigitIcon,
    Info,
    MemoryStick,
    Ruler,
    Layers
} from "lucide-react";
import {Badge} from "@/components/ui/badge.tsx";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import {MemoryAllocation} from "@CMachine/CMemory.ts";
import {PointerWindow} from "@CVisual/components/PointerWindow.tsx";

export const Callstack = ({snapshot}: { snapshot: ProgramSnapshot }) => {
    const {callStack, machine: cMachine, globalScope: globalVars} = snapshot;

    const [expandedFrames, setExpandedFrames] = useState<Record<number, boolean>>(
        Object.fromEntries(callStack.map((_, i) => [i, true])),
    );

    const toggleFrame = (index: number) => {
        setExpandedFrames((prev) => ({
            ...prev,
            [index]: !prev[index],
        }));
    };

    // Updated to provide helpful explanation when there is an empty stack frame
    if (callStack.length === 0) {
        return(
            <Card className="w-full shadow-md py-3">
                <CardContent className="p-4">
                    <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground">
                            No active stack frame
                        </div>
                        <div className="mt-1">
                            The program has finished running, so the main stack frame has been removed.
                            Any heap allocations still shown are memory that was not freed before the program ended.
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }


    const globalVariablesData = Array.from(globalVars.entries()).map(([name, variable]) => {
        const value = cMachine.getVariableValue(variable).value;
        const formattedValue = formatVariableValue(variable, value, cMachine);
        const linkedDetails = getLinkedAllocationDetails(variable, value, cMachine);
        const pointerAliases = getPointerAliases(name, variable, snapshot, cMachine);

        return {
            name,
            variable,
            formattedValue,
            linkedDetails,
            pointerAliases
        };
    });

    return (
        <div className="w-full grid grid-cols-[1fr_auto_1fr] gap-5">
            <div className="flex flex-col">
                <Card className="w-full shadow-md py-3">
                    <CardContent className="p-0">
                        {globalVars.size > 0 && (
                            <GlobalVariablesSection
                                globalVariables={globalVariablesData}
                            />
                        )}
                        <div className="divide-y">
                            <div className="flex items-center gap-2 p-3">
                                <Layers className="h-4 w-4 text-muted-foreground"/>
                                <span className="text-sm text-muted-foreground">Call Stack:</span>
                                <Badge variant="outline" className="ml-2">
                                    {callStack.length} frame{callStack.length !== 1 ? "s" : ""}
                                </Badge>
                            </div>
                            {callStack.map((frame: StackFrame, index: number) => {

                                const frameVariablesData = Array.from(frame.variables?.entries() as Iterable<[string, Variable]>)
                                    .map(([name, variable]) => {
                                        const value = cMachine.getVariableValue(variable).value;
                                        const formattedValue = formatVariableValue(variable, value, cMachine);
                                        const linkedDetails = getLinkedAllocationDetails(variable, value, cMachine);
                                        const pointerAliases = getPointerAliases(name, variable, snapshot, cMachine);

                                        return {
                                            name,
                                            variable,
                                            formattedValue,
                                            linkedDetails,
                                            pointerAliases
                                        };
                                    });

                                return (
                                    <StackFrameComponent
                                        key={index}
                                        frame={frame}
                                        index={index}
                                        isExpanded={expandedFrames[index] ?? false}
                                        isTopFrame={index === 0}
                                        toggleFrame={() => toggleFrame(index)}
                                        variablesData={frameVariablesData}
                                        cMachine={cMachine}
                                    />
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <Separator orientation="vertical"/>
            <div className="flex flex-col">
            </div>
        </div>
    );
};

const GlobalVariablesSection = ({
                                    globalVariables
                                }: {
    globalVariables: Array<{
        name: string;
        variable: Variable;
        formattedValue: string;
        linkedDetails: LinkedAllocationDetails | null;
        pointerAliases: string[];
    }>;
}) => {
    return (
        <div>
            <div className="flex items-center gap-2 px-3">
                <Globe className="h-4 w-4 text-muted-foreground"/>
                <span className="text-sm text-muted-foreground">Global Variables:</span>
                <Badge variant="outline" className="ml-2">
                    {globalVariables.length} vars{globalVariables.length !== 1 ? "s" : ""}
                </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 p-2">
                {globalVariables.map(({name, variable, formattedValue, linkedDetails}) => (
                    <Card className="p-3 relative" key={name}>
                        <VariableDetail
                            label={name}
                            value={variable.type.primitiveType}
                            icon={<Database className="h-3.5 w-3.5"/>}
                        />
                        <VariableValueDisplay
                            formattedValue={formattedValue}
                            isPointer={Boolean(variable.pointerLevel && variable.pointerLevel > 0)}
                            linkedDetails={linkedDetails}
                        />
                    </Card>
                ))}
            </div>
        </div>
    );
};

const StackFrameComponent = ({
                                 frame,
                                 index,
                                 isExpanded,
                                 isTopFrame,
                                 toggleFrame,
                                 variablesData,
                                 cMachine
                             }: {
    frame: StackFrame;
    index: number;
    isExpanded: boolean;
    isTopFrame: boolean;
    toggleFrame: () => void;
    variablesData: Array<{
        name: string;
        variable: Variable;
        formattedValue: string;
        linkedDetails: LinkedAllocationDetails | null;
        pointerAliases: string[];
    }>;
    cMachine: ProgramStateMachine;
}) => {
    return (
        <div className={`${index % 2 === 0 ? "bg-muted/50" : ""} transition-colors`}>
            <div
                className="flex cursor-pointer items-center justify-between p-3 hover:bg-muted"
                onClick={toggleFrame}
            >
                <div className="flex items-center gap-2">
                    <Badge
                        variant={isTopFrame ? "default" : "secondary"}
                        className={`${isTopFrame ? "bg-primary" : ""} h-6 min-w-6 justify-center px-1.5`}
                    >
                        {index}
                    </Badge>
                    <span className="font-mono font-medium">{frame.name}()</span>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline">
                        {variablesData.length} var{variablesData.length !== 1 ? "s" : ""}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                </div>
            </div>

            {isExpanded && (
                <div className="px-3 pb-3">
                    <div className="rounded-md border bg-card">
                        {variablesData.map(({name, variable, formattedValue, linkedDetails, pointerAliases}, varIndex) => (
                            <FrameVariableComponent
                                key={name}
                                name={name}
                                variable={variable}
                                formattedValue={formattedValue}
                                linkedDetails={linkedDetails}
                                pointerAliases={pointerAliases}
                                varIndex={varIndex}
                                totalVars={variablesData.length}
                                cMachine={cMachine}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const FrameVariableComponent = ({
                                    name,
                                    variable,
                                    formattedValue,
                                    linkedDetails,
                                    pointerAliases,
                                    varIndex,
                                    totalVars,
                                    cMachine
                                }: {
    name: string;
    variable: Variable;
    formattedValue: string;
    linkedDetails: LinkedAllocationDetails | null;
    pointerAliases: string[];
    varIndex: number;
    totalVars: number;
    cMachine: ProgramStateMachine;
}) => {
    // Important to work out if the variable is a pointer before it is rendered so it can be labelled correctly 
    let isPointer= false;

    if(variable.pointerLevel && variable.pointerLevel> 0){
        isPointer= true;
    }

    let pointerLevelBadge= null;

    if(isPointer){
        pointerLevelBadge= (
            <Badge variant="secondary" className="font-mono h-6">
                {"*".repeat(variable.type.pointerLevel)}
            </Badge>
        );
    }
    
    return (
        <div>
            <div className="p-3 relative">
                {isPointer ? <PointerWindow cMachine={cMachine} variable={variable}/> : null}
                <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-muted-foreground"/>
                        <span className="font-mono font-medium text-primary">{name}</span>
                    </div>
                    <div className="flex gap-1.5">
                        {pointerLevelBadge}

                        {pointerAliases.length >0 &&(
                            <Badge variant="outline" className="font-mono h-6 border-blue-400 text-blue-600">
                                aliases: {pointerAliases.join(", ")}
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-md bg-muted/30 p-2">
                    <VariableDetail
                        label="Type"
                        value={variable.type.primitiveType}
                        icon={<Database className="h-3.5 w-3.5"/>}
                    />
                    <VariableDetail
                        label="Size"
                        value={`${variable.size} bytes`}
                        icon={<Ruler className="h-3.5 w-3.5"/>}
                    />
                    <VariableDetail
                        label="Address"
                        value={variable.address.toString(16).toUpperCase().padStart(8, "0")}
                        tooltip="Memory address in hexadecimal"
                        icon={<MemoryStick className="h-3.5 w-3.5"/>}
                        isHex
                    />
                    <VariableValueDisplay
                        formattedValue={formattedValue}
                        isPointer={isPointer}
                        linkedDetails={linkedDetails}
                    />
                </div>
            </div>
            {varIndex < totalVars - 1 && <Separator/>}
        </div>
    );
};

const VariableDetail = ({
                            label,
                            value,
                            icon,
                            tooltip,
                            isHex
                        }: {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
    tooltip?: string;
    isHex?: boolean;
}) => {
    const content = (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {icon}
                <span>{label}:</span>
            </div>
            <div className={`font-mono text-sm ${isHex ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {isHex ? "0x" : ""}
                {value}
            </div>
        </div>
    );

    if (tooltip) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {icon}
                                <span>{label}:</span>
                                <Info className="h-3 w-3 text-muted-foreground/70"/>
                            </div>
                            <div className={`font-mono text-sm ${isHex ? "text-amber-600 dark:text-amber-400" : ""}`}>
                                {isHex ? "0x" : ""}
                                {value}
                            </div>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        <p>{tooltip}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return content;
};

const VariableValueDisplay = ({
                                  formattedValue,
                                  isPointer,
                                  linkedDetails
                              }: {
    formattedValue: string;
    isPointer: boolean;
    linkedDetails: LinkedAllocationDetails | null;
}) => {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileDigitIcon className="h-3.5 w-3.5"/>
                <span>Value:</span>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="outline" className="flex flex-col items-end">
                    {isPointer && linkedDetails ? (
                        <span className="flex flex-row py-1 font-mono text-blue-500 text-xs">
                            <p>Points to: <Badge variant="outline">0x{formattedValue}</Badge></p>
                         </span>
                    ) : ''}

                    {isPointer && linkedDetails ? (<Separator orientation="horizontal"/>) : ''}

                    <span
                        className={`flex flex-row font-mono py-1 text-xs ${isPointer ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {isPointer && linkedDetails?.data ? (
                            <p>Dereferences to: <Badge variant="outline">{linkedDetails.data}</Badge></p>
                        ) : <p>{formattedValue}</p>}
                    </span>
                </Badge>
            </div>
        </div>
    );
};


type LinkedAllocationDetails = {
    allocation: MemoryAllocation;
    data: any;
} | null;


// Finds other pointer variables that store the same address, e.g, when head and temp point to the same node
function getPointerAliases(
    variableName: string,
    variable: Variable,
    snapshot: ProgramSnapshot,
    cMachine: ProgramStateMachine
): string[]{
    const aliases: string[] = [];

    if (!variable.type.pointerLevel || variable.type.pointerLevel === 0){
        return aliases;
    }

    const pointerValue = cMachine.getVariableValue(variable).value;
    if (pointerValue === 0){
        return aliases;
    }

    snapshot.globalScope.forEach((otherVariable, otherName) =>{
        if (!otherVariable.type.pointerLevel || otherVariable.type.pointerLevel === 0){
            return;
        }
        const otherValue= cMachine.getVariableValue(otherVariable).value;
        if (otherValue === pointerValue && otherName !== variableName){
            aliases.push(otherName);
        }
    });

    for(let i= 0; i< snapshot.callStack.length; i++){
        const frame= snapshot.callStack[i];

        frame.variables.forEach((otherVariable, otherName)=> {
            if(!otherVariable.type.pointerLevel|| otherVariable.type.pointerLevel=== 0){
                return;
            }

            const otherValue= cMachine.getVariableValue(otherVariable).value;

            if(
                otherName !== variableName && otherValue === pointerValue && aliases.indexOf(otherName)=== -1
            ){
                aliases.push(otherName);
            }
        });
    }
    return aliases;

}

function formatVariableValue(variable: Variable, value: any, cMachine: ProgramStateMachine): string {
    const {type, address, arrayDimensions} = variable;

    if (type.primitiveType === PrimitiveType.CHAR && arrayDimensions && arrayDimensions > 0 && type.pointerLevel === 0) {
        return `"${cMachine.memoryMachine.readString(address)}"`;
    }

    if (type.pointerLevel && type.pointerLevel > 0) {
        return value.toString(16).toUpperCase().padStart(4, "0");
    }

    if (type.primitiveType === PrimitiveType.CHAR) {
        return `'${String.fromCharCode(value)}'`;
    }

    return String(value);
}

function getLinkedAllocationDetails(
    variable: Variable,
    pointerValue: number,
    cMachine: ProgramStateMachine
): LinkedAllocationDetails {

    const isPointer = variable.pointerLevel && variable.pointerLevel > 0;
    if (!isPointer) return null;

    const linkedAllocation = cMachine.memoryMachine.MemoryAllocated?.find(
        allocation => pointerValue >= allocation.start && pointerValue < allocation.start + allocation.size
    );

    if (!linkedAllocation) return null;

    const data = cMachine.memoryMachine.readMemory(linkedAllocation.start, linkedAllocation.type);

    return {
        allocation: linkedAllocation,
        data
    };
}