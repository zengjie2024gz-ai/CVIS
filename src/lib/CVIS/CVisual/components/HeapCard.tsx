import type React from "react"
import {useState} from "react"
import type {MemoryAllocation} from "@CMachine/CMemory.ts"
import type {ProgramStateMachine} from "@CMachine/CMachine.ts"
import {Badge} from "@/components/ui/badge.tsx"
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx"
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx"
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip.tsx"
import {ChevronDown, ChevronUp, Database, HardDrive, Info, MemoryStick} from "lucide-react"
import {MemoryDisplay} from "@CVisual/components/MemoryDisplay.tsx"
import {Button} from "@/components/ui/button.tsx";
import {PrimitiveType, ProgramSnapshot, Variable} from "@CMachine/CMachineTypes.ts"


interface HeapCardProps {
    heap: MemoryAllocation[]
    cMachine: ProgramStateMachine
    snapshot: ProgramSnapshot
    inputCode: string
    currentLine: number | null
}

const formatAddress = (address: number) => {
    if (address === 0) {
        return "NULL";
    }
    return `0x${address.toString(16).toUpperCase().padStart(8, "0")}`;
};

const isPointerVariable = (variable: Variable) => {
    return variable.type.pointerLevel > 0;
};


// Helpers for linked-list visualisation of CVIS to mirror the ViDS visualisation determined by user studies
// CVIS shows the bytes, and when heap allocations are for a node eith value, next, prev fields
const getPointerAliasesForAddress = (
    snapshot: ProgramSnapshot,
    cMachine: ProgramStateMachine,
    address: number
) => {
    const aliases: string[] = [];
    snapshot.globalScope.forEach((variable, name) => {
        if (!isPointerVariable(variable)) {
            return;
        }
        const value = cMachine.getVariableValue(variable).value;

        if (value === address) {
            aliases.push(name);
        }
    });

    for (let i = 0; i < snapshot.callStack.length; i++) {
        const frame = snapshot.callStack[i];
        frame.variables.forEach((variable, name) => {
            if (!isPointerVariable(variable)) {
                return;
            }
            const value = cMachine.getVariableValue(variable).value;

            if (value === address && aliases.indexOf(name) === -1) {
                aliases.push(name);
            }
        });
    }

    return aliases;
};

const getPointerValueByName = (
    snapshot: ProgramSnapshot,
    cMachine: ProgramStateMachine,
    pointerName: string
) =>{
    if (snapshot.callStack.length > 0) {
        const currentFrame = snapshot.callStack[snapshot.callStack.length - 1];
        const localPointer = currentFrame.variables.get(pointerName);

        if (localPointer) {
            return cMachine.getVariableValue(localPointer).value;
        }
    }

    const globalPointer = snapshot.globalScope.get(pointerName);

    if (globalPointer) {
        return cMachine.getVariableValue(globalPointer).value;
    }

    return 0;
};

// Reads heap allocs as possible linked list node
const getLinkedListNodePreview = (
    allocation: MemoryAllocation,
    snapshot: ProgramSnapshot
) =>{
    const definition = snapshot.machine.getHeapStructDefinition(allocation);
    if (!definition || definition.size !== allocation.size) return null;
    const valueField = definition.members.get('value') ?? definition.members.get('data');
    const nextField = definition.members.get('next');
    const prevField = definition.members.get('prev');
    if (!valueField || valueField.type.primitiveType !== PrimitiveType.INT || valueField.type.pointerLevel !== 0 ||
        !nextField || nextField.type.pointerLevel !== 1 || nextField.type.customTypeName !== definition.name) return null;
    if (prevField && (prevField.type.pointerLevel !== 1 || prevField.type.customTypeName !== definition.name)) return null;
    return {
        value: snapshot.memory.readMemory(allocation.start + valueField.offset, valueField.type),
        next: snapshot.memory.readMemory(allocation.start + nextField.offset, nextField.type),
        prev: prevField ? snapshot.memory.readMemory(allocation.start + prevField.offset, prevField.type) : null
    };
};

// Follows next pointers from head to tell which heap nodes can still be reached from the head
const getReachableAddressesFromHead = (
    snapshot: ProgramSnapshot,
    cMachine: ProgramStateMachine
) =>{
    const reachableAddresses: number[] = [];
    let currentAddress = getPointerValueByName(snapshot, cMachine, "head");

    while (currentAddress !== 0 && reachableAddresses.indexOf(currentAddress) === -1) {
        const allocation = snapshot.memory.getMemoryInfo(currentAddress);

        if (!allocation) {
            break;
        }

        reachableAddresses.push(currentAddress);

        const node = getLinkedListNodePreview(allocation, snapshot);
        if (!node) break;
        currentAddress = node.next;
    }
    return reachableAddresses;
};

// Finds the current line of code being executed so the operation occuring can be explained in the heap view
const getCurrentLineText= (inputCode: string, currentLine: number | null) =>{
    if (currentLine === null) {
        return "";
    }
    const lines = inputCode.split("\n");

    if (currentLine < 1 || currentLine > lines.length) {
        return "";
    }
    return lines[currentLine - 1].trim();
}

// Uses the same colour code as ViDS to make head, temp, current, tail easier to identify
const getAliasBadgeClass= (alias: string)=> {
    let className = "border-slate-400 text-slate-700";

    if(alias === "head"){
        className = "border-blue-500 text-blue-600";
    }else if(alias === "temp"){
        className = "border-slate-500 text-slate-700";
    }else if(alias === "current"){
        className = "border-orange-500 text-orange-600";
    }else if(alias ==="tail"){
        className = "border-emerald-500 text-emerald-600";
    }

    return className;
}

const HeapCard: React.FC<HeapCardProps> = ({heap, cMachine, snapshot, inputCode, currentLine}) => {
    const [expandedAllocations, setExpandedAllocations] = useState<Record<number, boolean>>(
        Object.fromEntries(heap.map((_, i) => [i, i === 0])),
    )

    const toggleAllocation = (index: number) => {
        setExpandedAllocations((prev) => ({
            ...prev,
            [index]: !prev[index],
        }))
    }

    // Explains why heap memory was released after a free()
    const currentLineText = getCurrentLineText(inputCode, currentLine);
    let emptyHeapMessage = "No live heap allocations to display.";

    if (currentLineText.indexOf("free(") !== -1) {
        emptyHeapMessage = "No live heap allocations. The allocation has been freed, but any pointer still storing its old address may now be dangling.";
    }

    if (heap.length ===0){
    return (
        <Card className="w-full shadow-md">
            <CardHeader className="bg-muted/30 pb-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                    <MemoryStick className="h-5 w-5"/>
                    Heap Memory

                    <Badge variant="outline" className="ml-2">
                        0 allocations
                    </Badge>
                </CardTitle>
            </CardHeader>

            <CardContent className="p-4">
                <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                    {emptyHeapMessage}
                </div>
            </CardContent>
        </Card>
    );
}


    // Adds a note to teach what operations are happening on the linked list in the heap
    // Rather than just showing raw memory, CVIS now also provides explanations
    const reachableAddresses= getReachableAddressesFromHead(snapshot, cMachine);
    let detachedCount= 0;

    for (let i=0;i< heap.length; i++){
        const allocation = heap[i];

        if (getLinkedListNodePreview(allocation, snapshot) && reachableAddresses.indexOf(allocation.start)=== -1){
            detachedCount++;
        }
    }

    let heapNote= "";

    if(snapshot.callStack.length=== 0 && detachedCount > 0){
        heapNote = `${detachedCount} heap node(s) are still allocated after the program ended. Since main has finished, there are no stack pointers left that can reach them.`;
    }else if (currentLineText.indexOf("head->next = head->next->next") !== -1){
        heapNote = "Relink step: head->next now skips over one node. That skipped node may still exist in heap memory, but it is no longer part of the main list.";
    }else if(currentLineText.indexOf("free(") !== -1){
        heapNote = "Free step: a heap allocation is being released. Any pointer still storing that old address may now be dangling.";
    }else if (detachedCount> 0) {
        heapNote = `${detachedCount} heap node(s) are not reachable from head. They may be detached from the list or left allocated without a stack pointer path.`;
    }


    return (
        <Card className="w-full shadow-md">
            <CardHeader className="bg-muted/30 pb-2">
                <CardTitle className="flex items-center gap-2 text-xl">
                    <MemoryStick className="h-5 w-5"/>
                    Heap Memory
                    <Badge variant="outline" className="ml-2">
                        {heap.length} allocation{heap.length !== 1 ? "s" : ""}
                    </Badge>
                    {heap.reduce((acc, allocation) => acc + allocation.size, 0) > 0 && (
                        <Badge variant="destructive" className="ml-2">
                            {heap.reduce((acc, allocation) => acc + allocation.size, 0)} bytes allocated
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">

                {heapNote.length> 0 &&(
                    <div className="border-b bg-orange-50 p-3 text-sm text-orange-700">
                        {heapNote}
                    </div>
                )}

                {heap.length ===0 &&(
                    <div className="m-4 rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                        {emptyHeapMessage}
                    </div>
                )}

                <div className="divide-y">
                    {heap.map((allocation: MemoryAllocation, index: number) => {
                        const isExpanded = expandedAllocations[index] ?? false
                        const memory = cMachine.getHeapSection(allocation.start, allocation.size)
                        const aliases = getPointerAliasesForAddress(snapshot, cMachine, allocation.start)
                        const reachableAddresses = getReachableAddressesFromHead(snapshot, cMachine)
                        const isReachableFromHead = reachableAddresses.indexOf(allocation.start) !== -1
                        const nodePreview = getLinkedListNodePreview(allocation, snapshot)

                        // To provide more insightful names for malloc/allocs
                        let allocationLabel= allocation.identifier;

                        if (nodePreview) {
                            allocationLabel = `Node allocation (${allocation.identifier})`;
                        }

                        
                        let prevText = "not present";
                        if (nodePreview && nodePreview.prev !== null){
                            prevText = formatAddress(nodePreview.prev);
                        }

                        // Shows a linked list summary alongside the raw memory
                        return (
                            <div key={index} className="transition-colors">
                                <div
                                    className="flex cursor-pointer items-center justify-between p-3 hover:bg-muted/30"
                                    onClick={() => toggleAllocation(index)}
                                >
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="h-6 min-w-6 justify-center px-1.5">
                                            {index + 1}
                                        </Badge>
                                        <span className="font-mono font-medium">{allocationLabel}</span>

                                    </div>
                                    <div className="flex items-center gap-2">
                                        {isExpanded ? <ChevronUp className="h-4 w-4"/> :
                                            <ChevronDown className="h-4 w-4"/>}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-3 pb-3">
                                        <div className="rounded-md border bg-card p-3">
                                            <div className="mb-3 flex flex-wrap items-center gap-4">
                                                <div className="flex items-center gap-2">
                                                    <HardDrive className="h-4 w-4 text-muted-foreground"/>
                                                    <span className="text-sm text-muted-foreground">Address:</span>
                                                    <span
                                                        className="font-mono text-sm text-amber-600 dark:text-amber-400">
                            0x{allocation.start.toString(16).toUpperCase().padStart(8, "0")}
                          </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Database className="h-4 w-4 text-muted-foreground"/>
                                                    <span className="text-sm text-muted-foreground">Size:</span>
                                                    <span className="font-mono text-sm">{allocation.size} bytes</span>
                                                </div>

                                                <div className={"flex items-center gap-2"}>
                                                    <span
                                                        className="text-sm text-muted-foreground">Location:</span>
                                                    <Badge variant={"outline"}>
                                                        Line {allocation.location.line}
                                                    </Badge>
                                                    <Badge variant={"outline"}>
                                                        Column {allocation.location.column}
                                                    </Badge>
                                                </div>
                                            </div>

                                            {nodePreview&& (
                                                <div className="mb-4 rounded-md border bg-muted/20 p-3">
                                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                                        <Badge variant="outline">
                                                            Possible linked list node
                                                        </Badge>

                                                        {isReachableFromHead ? (
                                                            <Badge className="bg-blue-500">
                                                                Reachable from head
                                                            </Badge>
                                                        ): (
                                                            <Badge variant="destructive">
                                                                Not reachable from head
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="grid gap-1 text-sm">
                                                        <div>
                                                            value:{" "}
                                                            <span className="font-mono">
                                                                {nodePreview.value}
                                                            </span>
                                                        </div>

                                                        <div>
                                                            next:{" "}
                                                            <span className="font-mono">
                                                                {formatAddress(nodePreview.next)}
                                                            </span>
                                                        </div>

                                                        <div>
                                                            prev:{" "}
                                                            <span className="font-mono">
                                                                {prevText}
                                                            </span>
                                                        </div>

                                                        <div>
                                                            aliases:{" "}
                                                            {aliases.length===0 &&(
                                                                <span className="font-mono">none</span>
                                                            )}

                                                            {aliases.length >0 &&(
                                                                <span className="inline-flex flex-wrap gap-1">
                                                                    {aliases.map((alias) =>(
                                                                        <Badge
                                                                            key={alias}
                                                                            variant="outline"
                                                                            className={getAliasBadgeClass(alias)}>
                                                                            {alias}
                                                                        </Badge>
                                                                    ))}
                                                                </span>
                                                            )}

                                                        </div>
                                                    </div>
                                                </div>
                                )}

                                            <div className="mt-4">
                                                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                                                    <Info className="h-4 w-4"/>
                                                    Memory Content
                                                </h4>

                                                <Tabs defaultValue="hex" className="w-full">
                                                    <TabsList className="mb-2 grid w-full grid-cols-3">
                                                        <TabsTrigger value="hex">Hexadecimal</TabsTrigger>
                                                        <TabsTrigger value="decimal">Decimal</TabsTrigger>
                                                        <TabsTrigger value="text">ASCII Text</TabsTrigger>
                                                    </TabsList>

                                                    <TabsContent value="hex" className="mt-0">
                                                        <MemoryDisplay
                                                            memory={memory}
                                                            format="hex"
                                                            bytesPerRow={8}
                                                            highlightAddress={undefined}/>
                                                    </TabsContent>

                                                    <TabsContent value="decimal" className="mt-0">
                                                        <MemoryDisplay
                                                            memory={memory}
                                                            format="decimal"
                                                            bytesPerRow={8}
                                                            highlightAddress={undefined}/>
                                                    </TabsContent>

                                                    <TabsContent value="text" className="mt-0">
                                                        <MemoryDisplay
                                                            memory={memory}
                                                            format="text"
                                                            bytesPerRow={8}
                                                            highlightAddress={undefined}/>
                                                    </TabsContent>
                                                </Tabs>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}


export default HeapCard

