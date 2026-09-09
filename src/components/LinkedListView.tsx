import React from "react";
import {ProgramSnapshot, PrimitiveType} from "@CMachine/CMachineTypes.ts";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {Button} from "@/components/ui/button.tsx";


// Building a linked list view from the current machine snapshot
// Focus is placed more on structure of the linked list, rather than raw memory
interface LinkedListViewProps{
    snapshot: ProgramSnapshot;
    inputCode: string;
    currentLine: number | null;
}

type PointerInfo= {
    name: string;
    target: number;
    colourClass: string;
};

type NodeInfo= {
    address: number;
    data: number;
    next: number;
    prev: number;
    detached: boolean;
};

const pointerType = {
    primitiveType: PrimitiveType.STRUCT,
    pointerLevel: 1
};

const intType = {
    primitiveType: PrimitiveType.INT,
    pointerLevel: 0
};

// Main linked list view 
export const LinkedListView= ({snapshot, inputCode, currentLine}: LinkedListViewProps) =>{
    const [showExplanation, setShowExplanation] = React.useState(true);

    const machine = snapshot.machine;
    const heap = snapshot.memory.getHeapDump();
    let currentFrame = null
    
    if (snapshot.callStack.length >0){
        currentFrame= snapshot.callStack[snapshot.callStack.length -1];
    }

    // Stores main pointers that are tracked and later used in the colour key
    const mainPointers= ["head", "temp", "current", "tail"];

    // Gets current line of code to be used to match the explanation
    const getLineText= () => {
        if(currentLine === null){
            return "";
        }

        const lines = inputCode.split("\n");

        if(currentLine<1 || currentLine> lines.length){
            return "";
        }
        return lines[currentLine-1].trim();
    };

    // Ignores empty lines and brackets as they do not affect list state 
    const getUsefulLineText = () => {
        const rawLineText = getLineText();

        if(
            rawLineText.length === 0 ||
            rawLineText === "{" ||
            rawLineText === "}" ||
            rawLineText === "};" ||
            rawLineText === ";" 
        ){
            return "";
        }

        return rawLineText;
    }
    
// Provides an explanation based on current line of code
const getExplanation = () => {
    const currentText = getUsefulLineText();

    if (currentText.length === 0) {
        return "Step through the code to see how the linked list changes over time.";
    }

    // Struct setup lines
    if (currentText.indexOf("struct Node") !== -1 && currentText.indexOf("malloc") === -1) {
        return "The Node structure is being defined. Each node will store a value and one or more pointer fields.";
    }

    if (currentText.indexOf("int value") !== -1) {
        return "This field stores the data value inside each node.";
    }

    if (currentText.indexOf("struct Node *next") !== -1) {
        return "This field stores the address of the next node in the linked list.";
    }

    if (currentText.indexOf("struct Node *prev") !== -1) {
        return "This field stores the address of the previous node in a doubly linked list.";
    }

    // Loop and condition checks  before the null rule
    if (currentText.indexOf("while") !== -1 && currentText.indexOf("current != NULL") !== -1) {
        return "The loop checks whether current still points to a node. If current is NULL, the traversal has reached the end of the list.";
    }

    if (currentText.indexOf("while") !== -1 && currentText.indexOf("head != NULL") !== -1) {
        return "The loop checks whether head still points to a node. This lets the program keep freeing nodes until the list is empty.";
    }

    if (currentText.indexOf("if") !== -1 && currentText.indexOf("current->value") !== -1) {
        return "The program checks the value in the current node to see if it matches the value being searched for.";
    }

    // Pointer variable declarations
    if (currentText.indexOf("struct Node *head") !== -1 && currentText.indexOf("malloc") === -1) {
        return "A head pointer is being declared. It will store the address of the first node in the list.";
    }

    if (currentText.indexOf("struct Node *current") !== -1) {
        return "A current pointer is being declared. It will be used to move through the list one node at a time.";
    }

    if (currentText.indexOf("struct Node *temp") !== -1) {
        return "A temporary pointer is being declared. It is useful when deleting or freeing nodes.";
    }

    if (currentText.indexOf("struct Node *tail") !== -1) {
        return "A tail pointer is being declared. It can store the address of the last node in the list.";
    }

    if (currentText.indexOf("struct Node *newNode") !== -1 ||
        currentText.indexOf("struct Node *newHead") !== -1) {
        return "A new node pointer is being declared. It will point to a node that is added into the list.";
    }

    // Integer variables
    if (currentText.indexOf("int count = 0") !== -1) {
        return "The count variable starts at zero before the list traversal begins.";
    }

    if (currentText.indexOf("int found = 0") !== -1) {
        return "The found variable starts at zero. It will change if the search value is found.";
    }

    if (currentText.indexOf("count++") !== -1) {
        return "The count increases by one because the traversal has reached another node.";
    }

    if (currentText.indexOf("found = 1") !== -1) {
        return "The search value has been found, so found is changed to 1.";
    }

    // Malloc lines
    if (currentText.indexOf("struct Node *head = malloc") !== -1) {
        return "Memory is allocated for a new node on the heap, and head is set to point to it. This creates the first node in the list.";
    }

    if (currentText.indexOf("struct Node *newNode = malloc") !== -1) {
        return "Memory is allocated for a new node. This node will later be inserted into the list.";
    }

    if (currentText.indexOf("struct Node *newHead = malloc") !== -1) {
        return "Memory is allocated for a new node that will become the new head of the list.";
    }

    if (currentText.indexOf("head->next = malloc") !== -1) {
        return "A new node is created on the heap and linked through the next pointer of the first node.";
    }

    if (currentText.indexOf("head->next->next = malloc") !== -1) {
        return "A third node is created on the heap and linked after the second node.";
    }

    if (currentText.indexOf("malloc") !== -1) {
        return "A new block of heap memory is being allocated. A pointer will store the address of that memory.";
    }

    // Value updates
    if (currentText.indexOf("head->value =") !== -1 || currentText.indexOf("head->data =") !== -1) {
        return "The value field of the first node is updated. Head still points to the same node.";
    }

    if (currentText.indexOf("head->next->value =") !== -1 || currentText.indexOf("head->next->data =") !== -1) {
        return "The program follows head to the next node and writes a value into that node.";
    }

    if (currentText.indexOf("head->next->next->value =") !== -1) {
        return "The program follows two next links and writes a value into the third node.";
    }

    if (currentText.indexOf("newNode->value =") !== -1) {
        return "The new node is given its data value before it is inserted into the list.";
    }

    if (currentText.indexOf("newHead->value =") !== -1) {
        return "The new head node is given its data value before it becomes the first node.";
    }

    // NULL assignments
    if (currentText.indexOf("head->next = NULL") !== -1) {
        return "The next pointer of the first node is set to NULL. This means the first node is currently the end of the list.";
    }

    if (currentText.indexOf("head->next->next = NULL") !== -1) {
        return "The second node's next pointer is set to NULL. This marks the end of the list.";
    }

    if (currentText.indexOf("head->next->next->next = NULL") !== -1) {
        return "The third node's next pointer is set to NULL. This marks the end of the list.";
    }

    if (currentText.indexOf("head->prev = NULL") !== -1) {
        return "The previous pointer of the head node is set to NULL because there is no node before the head.";
    }

    if (currentText.indexOf("tail->next = NULL") !== -1) {
        return "The tail node's next pointer is set to NULL because it is now the last node in the list.";
    }

    // Linking and relinking
    if (currentText.indexOf("newNode->next = head->next") !== -1) {
        return "The new node is linked to the node that used to come after head. This keeps the rest of the list connected.";
    }

    if (currentText.indexOf("head->next = newNode") !== -1) {
        return "Head's next pointer is updated so the new node is inserted into the list.";
    }

    if (currentText.indexOf("newHead->next = head") !== -1) {
        return "The new head node is linked to the old head, so the old list comes after the new node.";
    }

    if (currentText.indexOf("head = newHead") !== -1) {
        return "The head pointer is updated so it points to the new first node in the list.";
    }

    if (currentText.indexOf("temp = head->next") !== -1) {
        return "Temp stores the address of the node that is about to be removed. This keeps access to it before the links change.";
    }

    if (currentText.indexOf("head->next = head->next->next") !== -1) {
        return "Head's next pointer is changed so it skips over the middle node. This removes that node from the main list.";
    }

    if (currentText.indexOf("temp = head") !== -1) {
        return "Temp is assigned the same address as head. Both pointers now refer to the same node.";
    }

    if (currentText.indexOf("head = head->next") !== -1) {
        return "The head pointer moves forward to the next node. The old first node is no longer the head.";
    }

    if (currentText.indexOf("current = head") !== -1) {
        return "Current is set to the start of the list so traversal can begin from the head node.";
    }

    if (currentText.indexOf("current = current->next") !== -1) {
        return "Current moves to the next node in the list. This is how the traversal progresses.";
    }

    if (currentText.indexOf("tail = head->next->next") !== -1) {
        return "Tail is set to point to the last node in the list.";
    }

    if (currentText.indexOf("tail = tail->prev") !== -1) {
        return "Tail moves back to the previous node. This happens when the old tail is being removed.";
    }

    // Prev links
    if (currentText.indexOf("head->next->prev = head") !== -1) {
        return "The second node's prev pointer is set back to head, creating the backward link.";
    }

    if (currentText.indexOf("head->next->next->prev = head->next") !== -1) {
        return "The third node's prev pointer is set back to the second node.";
    }

    if (currentText.indexOf("->prev =") !== -1) {
        return "A prev pointer is being updated. This keeps the backward link correct in a doubly linked list.";
    }

    // Free lines
    if (currentText.indexOf("free(head)") !== -1) {
        return "The node that head points to is freed, but head itself is not changed. This can leave head as a dangling pointer.";
    }

    if (currentText.indexOf("free(temp)") !== -1) {
        return "The node stored in temp is freed. This releases the removed node's heap memory.";
    }

    if (currentText.indexOf("free(") !== -1) {
        return "Heap memory is being freed. Any pointer still storing that old address may become dangling.";
    }

    // Output and return
    if (currentText.indexOf("printf") !== -1) {
        return "The program prints the current result to the terminal.";
    }

    if (currentText.indexOf("return 0") !== -1) {
        return "The program finishes successfully.";
    }

    // Generic fallbacks
    if (currentText.indexOf("->next =") !== -1) {
        return "A next pointer is being updated, so the shape of the list may change.";
    }

    if (currentText.indexOf("->value =") !== -1 || currentText.indexOf("->data =") !== -1) {
        return "A value is being written into a node.";
    }

    if (currentText.indexOf("NULL") !== -1 && currentText.indexOf("=") !== -1) {
        return "A pointer is being set to NULL.";
    }

    if (currentText.indexOf("NULL") !== -1) {
        return "The program is checking for NULL, which usually means it is checking whether a pointer has reached the end of the list.";
    }

    return "This step changes the current program state. Watch how the pointers and node values update as execution moves forward.";
};



    let currentLineText= "No line selected";
    const usefulLineText = getUsefulLineText();
    if (usefulLineText.length >0){
        currentLineText = usefulLineText;
    }

    // Checks if current step is creating the first node
    let isHeadMallocLine = false;
    if (currentLineText.indexOf("struct Node *head = malloc") !== -1) {
        isHeadMallocLine = true;
    }

    // Checks if current step is part of a delete or relink
    let isDeletionLine = false;
    if (currentLineText.indexOf("head->next = head->next->next") !== -1){
        isDeletionLine = true;
    }

    // Checks if head becomes a dangling pointer after free() is run
    let isDanglingLine = false;
    if (currentLineText.indexOf("free(head)") !== -1) {
        isDanglingLine = true;
    }

    let isFreedTempLine = false;
    if (currentLineText.indexOf("free(temp)") !== -1){
        isFreedTempLine = true;
    }

    // Collects pointer variables from the current stack frame
    const pointerInfo: PointerInfo[] = [];

    // Attempting to find the main pointer variables needed for the linked lists 
    if(currentFrame){
        for(let i=0; i < mainPointers.length; i++){
            const pointerName = mainPointers[i];
            const variable = currentFrame.variables.get(pointerName);

            if(variable){
                const pointerValue = machine.getVariableValue(variable).value;
                let colourClass = "border-slate-400 text-slate-700";

                if(pointerName === "head"){
                    colourClass = "border-blue-500 text-blue-600";
                }else if(pointerName === "temp"){
                    colourClass = "border-slate-500 text-slate-700";
                }else if(pointerName === "current"){
                    colourClass = "border-orange-500 text-orange-600";
                }else if(pointerName === "tail"){
                    colourClass = "border-emerald-500 text-emerald-600";
                }

                pointerInfo.push({
                    name: pointerName,
                    target: pointerValue,
                    colourClass: colourClass
                });

            }
        }
    }

    let headPointer: PointerInfo | null = null;
    for(let i= 0; i< pointerInfo.length; i++){
        if(pointerInfo[i].name === "head"){
            headPointer= pointerInfo[i];
        }
    }

    // Uses the global head pointer if local one is not identified 
    if (!headPointer){
        const globalHead = snapshot.globalScope.get("head");

        if (globalHead){
            const globalHeadValue = machine.getVariableValue(globalHead).value;

            headPointer = {
                name: "head",
                target: globalHeadValue,
                colourClass: "border-blue-500 text-blue-600"
            };

            pointerInfo.push(headPointer);

        }
    }   


    // Keeps old head address so that dangling states can be showen
    let danglingHeadAddress = 0;

    if (isDanglingLine && headPointer && headPointer.target !==0){
        danglingHeadAddress = headPointer.target;
    }


    // Tracks extra pointers that are used in linked list steps
    let tempPointer: PointerInfo | null = null;
    let currentPointer: PointerInfo | null = null;
    let tailPointer: PointerInfo | null = null;
    let freedTempAddress = 0;

    for (let i =0; i< pointerInfo.length; i++){
        if (pointerInfo[i].name === "temp"){
            tempPointer = pointerInfo[i];
        }else if (pointerInfo[i].name === "current"){
            currentPointer = pointerInfo[i];
        }else if (pointerInfo[i].name === "tail"){
            tailPointer = pointerInfo[i];
        }
    }

    // Stores old address of temp after free() so it can be displayed as invalid
    if (isFreedTempLine && tempPointer && tempPointer.target !==0){
        freedTempAddress = tempPointer.target;
    }


    // Builds the lsit view from the heap memory
    const nodes: NodeInfo[] = [];
    const visitedAddresses: number[] = [];

    // Start traversal from head to next to ensure list appears in order 
    if(headPointer && headPointer.target !== 0){
        let currentAddress = headPointer.target;

        // Stops revisiting nodes so the visual does not get stuck in a loop
        while(currentAddress !== 0 && visitedAddresses.indexOf(currentAddress) === -1){
            const alloc = snapshot.memory.getMemoryInfo(currentAddress);

            if(!alloc){
                break;
            }

            visitedAddresses.push(currentAddress);

            // Reads node fields directly from heap memory
            let dataValue = snapshot.memory.readMemory(currentAddress, intType);
            let nextValue = 0;
            let prevValue = 0;

            if(alloc.size >=8){
                nextValue= snapshot.memory.readMemory(currentAddress +4, pointerType);
            }

            if(alloc.size >=12){
                prevValue= snapshot.memory.readMemory(currentAddress +8, pointerType)
            }

            nodes.push({
                address: currentAddress,
                data: dataValue,
                next: nextValue,
                prev: prevValue,
                detached: false
            });

            currentAddress= nextValue;
        }
    }

    // Adds the heap nodes that exist but are not reached from the head
    for(let i =0; i< heap.length;i++){
        const alloc= heap[i];

        if(visitedAddresses.indexOf(alloc.start) !== -1){
            continue;
        }

        if(alloc.size <8){
            continue;
        }

        let dataValue= snapshot.memory.readMemory(alloc.start, intType);
        let nextValue= snapshot.memory.readMemory(alloc.start+4, pointerType);
        let prevValue= 0;

        if(alloc.size >= 12){
            prevValue= snapshot.memory.readMemory(alloc.start+8, pointerType);
        }

        nodes.push({
            address: alloc.start,
            data: dataValue,
            next: nextValue,
            prev: prevValue,
            detached: true
        });
    }

    // Separates bodes and pointers into groups 
    const reachableNodes: NodeInfo[] = [];
    const detachedNodes: NodeInfo[] = [];
    const secondaryPointers: PointerInfo[] = [];

    for (let i=0; i<nodes.length; i++){
        if (nodes[i].detached){
            detachedNodes.push(nodes[i]);
        }else{
            reachableNodes.push(nodes[i]);
        }
    }

    for (let i=0; i<pointerInfo.length; i++){
        if (pointerInfo[i].name !== "head"){
            secondaryPointers.push(pointerInfo[i]);
        }
    }

    const getAliasPointersForAddress = (address: number) => {
        const aliasPointers: PointerInfo[] = [];

        for (let i = 0; i < pointerInfo.length; i++) {
            const pointer = pointerInfo[i];

            if (pointer.target !== address || pointer.target === 0){
                continue;
            }
            if (pointer.name === "temp" && isFreedTempLine){
                continue;
            }
            if (pointer.name === "head" && isDanglingLine){
                continue;
            }

            aliasPointers.push(pointer);
        }

        return aliasPointers;
    };


    let detailedContent;
    let structuralContent;

    // Chooses what the structural view should look like based on the current step
    if(nodes.length ===0 && isDanglingLine && danglingHeadAddress !== 0){
        structuralContent= (
            <div className="rounded-sm border bg-slate-50/40 p-6">
                <div className="flex flex-col items-center">
                    <div className="rounded-sm border border-blue-500 bg-white px-4 py-2 text-sm font-semibold">
                        head
                    </div>

                    <div className="h-6 w-[2px] bg-red-500"></div>
                    <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-red-500"></div>

                    <div className="mt-3 rounded-sm border border-red-400 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
                        <div>freed / invalid</div>
                        <div className="mt-1 text-xs font-medium text-red-600">
                            old address: 0x{danglingHeadAddress.toString(16).toUpperCase()}
                        </div>
                    </div>
                </div>
            </div>
        );
    }else if (nodes.length ===0){
        structuralContent = (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No linked list nodes found yet.
            </div>
        );
    }else{
        structuralContent = (
            <div className="space-y-6">
                {secondaryPointers.length>0 && (
                    <div className="flex flex-wrap gap-2">
                        {secondaryPointers.map((pointer) => {
                            let pointerText = `0x${pointer.target.toString(16).toUpperCase()}`;

                            if(pointer.target ===0){
                                pointerText= "NULL";
                            }

                            if (pointer.name === "temp" && isFreedTempLine && pointer.target !== 0){
                                pointerText = "dangling";
                            }

                            return (
                                <Badge
                                    key= {pointer.name}
                                    variant= "outline"
                                    className={`mr-2 ${pointer.colourClass}`}
                                >
                                    {pointer.name} -&gt; 
                                    {pointerText}
                                </Badge>
                            );
                        })}
                    </div>
                )}


                <div className="rounded-sm border bg-slate-50/40 p-6">
                    {reachableNodes.length >0 && (
                        <div className="flex flex-col items-center">

                            {headPointer && headPointer.target === reachableNodes[0].address && !isDanglingLine &&(
                                <div className="mb-4 flex flex-col items-center">
                                    <div className="rounded-sm border border-blue-500 bg-white px-4 py-2 text-sm font-semibold">
                                        head
                                    </div>
                                    <div className="h-6 w-[2px] bg-blue-500"></div>
                                    <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-blue-500"></div>
                                </div>
                            )}

                            {headPointer && headPointer.target !== 0 && isDanglingLine && (
                                <div className="mb-4 flex flex-col items-center">
                                    <div className="rounded-sm border border-blue-500 bg-white px-4 py-2 text-sm font-semibold">
                                        head
                                    </div>

                                    <div className="h-6 w-[2px] bg-red-500"></div>
                                    <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-red-500"></div>
                                    <div className="mt-2 rounded-sm border border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
                                        dangling
                                    </div>
                                </div>
                            )}

                            {isFreedTempLine && freedTempAddress !==0 && (
                                <div className="mb-4 flex flex-col items-center">
                                    <div className="rounded-sm border border-slate-500 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                                        temp
                                    </div>

                                    <div className="h-6 w-[2px] bg-red-500"></div>
                                    <div className="h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-red-500"></div>

                                    <div className="mt-2 rounded-sm border border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 text-center">
                                        <div>freed / invalid</div>
                                        <div className="mt-1 text-xs font-medium text-red-600">
                                            old address: 0x{freedTempAddress.toString(16).toUpperCase()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {reachableNodes.map((node, index) => {
                                let nextText = `0x${node.next.toString(16).toUpperCase()}`;
                                if (node.next === 0) {
                                    nextText = "NULL";
                                }

                                let prevText = `0x${node.prev.toString(16).toUpperCase()}`;
                                if (node.prev === 0) {
                                    prevText = "NULL";
                                }

                                let nextNode: NodeInfo | null=null;
                                if (index < reachableNodes.length - 1) {
                                    nextNode = reachableNodes[index + 1];
                                }

                                let showNextConnector = false;
                                if (nextNode && node.next=== nextNode.address) {
                                    showNextConnector = true;
                                }

                                let showNullConnector = false;
                                if (!nextNode && node.next === 0) {
                                    showNullConnector = true;
                                }
                                
                                let connectorLineClass = "h-8 w-[2px] bg-black";
                                let connectorArrowClass = "h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-black";
                                let connectorLabelClass = "mb-1 text-xs font-medium text-slate-600";  
                                let isRelinkedConnector = false;

                                if (isDeletionLine && index ===0 && nextNode && node.next ===nextNode.address) {
                                    isRelinkedConnector = true;
                                }

                                
                                // Highlights the relinked arrow during deletion
                                if (isRelinkedConnector){
                                    connectorLineClass = "h-8 w-[2px] bg-orange-500";
                                    connectorArrowClass = "h-0 w-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-orange-500";
                                    connectorLabelClass = "mb-1 text-xs font-medium text-orange-600";
                                }

                                let showTempAtNode = false;

                                
                                // Shows temp above the node it is currently pointing to
                                if (tempPointer && tempPointer.target !==0 && !isFreedTempLine && tempPointer.target === node.address){
                                    showTempAtNode = true;
                                }

                                const aliasPointers = getAliasPointersForAddress(node.address);

                                return(
                                    <React.Fragment key={node.address}>

                                        {showTempAtNode && (
                                            <div className="mb-2 flex justify-center">
                                                <div className="rounded-sm border border-slate-500 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                                                    temp
                                                </div>
                                            </div>
                                        )}
                                        <div className="w-[220px] rounded-sm border border-slate-400 bg-white p-4">
                                            <div className="font-semibold">Node {index + 1}</div>

                                            {aliasPointers.length > 1 && (
                                                <div className="mt-2 rounded-sm border bg-slate-50 p-2 text-xs">
                                                    <div className="mb-1 font-medium text-slate-600">
                                                        Pointer aliases
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {aliasPointers.map((pointer) => (
                                                            <Badge
                                                                key={pointer.name}
                                                                variant="outline"
                                                                className={pointer.colourClass}
                                                            >
                                                                {pointer.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-3 space-y-1 text-sm">
                                                <div>addr: 0x{node.address.toString(16).toUpperCase()}</div>
                                                <div>value: {node.data}</div>
                                                <div>next: {nextText}</div>
                                                <div>prev: {prevText}</div>
                                            </div>
                                        </div>

                                        {showNextConnector &&(
                                            <div className="flex flex-col items-center py-3">
                                                <div className={connectorLabelClass}>
                                                    next
                                                </div>
                                                <div className={connectorLineClass}></div>
                                                <div className={connectorArrowClass}></div>
                                            </div>
                                        )}

                                        {showNullConnector &&(
                                            <div className="flex flex-col items-center py-3">
                                                <div className={connectorLabelClass}>
                                                    next
                                                </div>
                                                <div className={connectorLineClass}></div>
                                                <div className={connectorArrowClass}></div>

                                                <div className="mt-2 rounded-sm border border-slate-500 bg-white px-5 py-2 text-sm font-semibold">
                                                    NULL
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}


                    {reachableNodes.length ===0 && (
                        <div className="text-sm text-muted-foreground">
                            No nodes are currently reachable from head.
                        </div>
                    )}
                </div>
                {detachedNodes.length > 0 && (
                    <div className="rounded-sm border border-red-200 bg-red-50 p-4">
                        <div className="mb-3 text-sm font-semibold text-red-700">
                            Unreachable Nodes
                        </div>

                        <div className="flex flex-wrap gap-4">
                            {detachedNodes.map((node) => {
                                let nextText = `0x${node.next.toString(16).toUpperCase()}`;
                                if (node.next === 0) {
                                    nextText = "NULL";
                                }

                                let prevText = `0x${node.prev.toString(16).toUpperCase()}`;
                                if (node.prev === 0) {
                                    prevText = "NULL";
                                }


                                // Labels unreachable nodes depending on what happened
                                let detachedLabel = "Unreachable after program end";

                                if (isFreedTempLine && node.address === freedTempAddress){
                                    detachedLabel = "Freed node";
                                } else if (currentLineText.indexOf("head->next = head->next->next") !== -1 &&
                                    tempPointer &&
                                    tempPointer.target !== 0 &&
                                    node.address === tempPointer.target){
                                    detachedLabel = "Detached from main list";
                                }

                                const aliasPointers = getAliasPointersForAddress(node.address);

                                let showTempAtDetachedNode = false;

                                if (tempPointer &&
                                    tempPointer.target !== 0 &&
                                    !isFreedTempLine && tempPointer.target === node.address){
                                    showTempAtDetachedNode = true;
                                }

                                return (
                                    <div key= {node.address} className="flex flex-col items-center">
                                        {showTempAtDetachedNode && (
                                            <div className="mb-2 flex justify-center">
                                                <div className="rounded-sm border border-slate-500 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                                                    temp
                                                </div>
                                            </div>
                                        )}

                                        <div className="w-[220px] rounded-sm border border-red-300 bg-white p-4">
                                            <div className="font-semibold">
                                                Node @ 0x{node.address.toString(16).toUpperCase()}
                                            </div>

                                            {aliasPointers.length > 1 && (
                                                <div className="mt-2 rounded-sm border bg-red-50 p-2 text-xs">
                                                    <div className="mb-1 font-medium text-red-700">
                                                        Pointer aliases
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {aliasPointers.map((pointer) => (
                                                            <Badge
                                                                key={pointer.name}
                                                                variant="outline"
                                                                className={pointer.colourClass}
                                                            >
                                                                {pointer.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="mt-3 space-y-1 text-sm">
                                                <div>addr: 0x{node.address.toString(16).toUpperCase()}</div>
                                                <div>value: {node.data}</div>
                                                <div>next: {nextText}</div>
                                                <div>prev: {prevText}</div>
                                            </div>

                                            <div className="mt-3 text-xs font-medium text-red-600">
                                                {detachedLabel}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }


    // Builds the pointer-data tab in ViDS
    if(nodes.length ===0){
        detailedContent= (
            <div className="text-sm text-muted-foreground">
                No node data to display yet.
            </div>
        );
    }else{
        detailedContent= (
            <div className="space-y-3">
                {nodes.map((node, index) => {
                    let nextText= `0x${node.next.toString(16).toUpperCase()}`;
                    if (node.next === 0){
                        nextText= "NULL";
                    }

                    let prevText= `0x${node.prev.toString(16).toUpperCase()}`;
                    if (node.prev ===0){
                        prevText= "NULL";
                    }

                    let statusText= "Reachable";
                    if(node.detached){
                        statusText= "Detached";
                    }

                    if (currentLineText.indexOf("return 0;") !== -1 && node.detached){
                        statusText = "Unreachable";
                    }

                    if (isFreedTempLine && node.address === freedTempAddress){
                        statusText = "Freed";
                    }

                    const aliasPointers = getAliasPointersForAddress(node.address);
                    let aliasText = "None";

                    if (aliasPointers.length > 1) {
                        aliasText = aliasPointers.map((pointer) => pointer.name).join(", ");
                    }

                    return(
                        <div key={node.address} className="rounded-md border p-3">
                            <div className="font-semibold">Node {index + 1}</div>
                            <div className="mt-2 text-sm">
                                <div>Address: 0x{node.address.toString(16).toUpperCase()}</div>
                                <div>Data: {node.data}</div>
                                <div>Next: {nextText}</div>
                                <div>Prev: {prevText}</div>
                                <div>Status: {statusText}</div>
                                <div>Aliases: {aliasText}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }


    // Small summary of the tracked pointer values
    let pointerSummaryContent;
    if (pointerInfo.length === 0){
        pointerSummaryContent= (
            <div className="text-sm text-muted-foreground">
                No tracked pointer variables found.
            </div>
        );
    }else{
        pointerSummaryContent = (
            <div className="space-y-2">
                {pointerInfo.map((pointer) => {
                    let pointerText = `0x${pointer.target.toString(16).toUpperCase()}`;
                    if (pointer.target === 0) {
                        pointerText = "NULL";

                        if (pointer.name === "head" && isHeadMallocLine) {
                            pointerText = "pending";
                        }
                    }

                    if (pointer.name === "temp" && isFreedTempLine && pointer.target !==0){
                        pointerText = `dangling -> 0x${pointer.target.toString(16).toUpperCase()}`;
                    }

                    return (
                        <div key={pointer.name} className="rounded-md border p-2 text-sm">
                            <span className="font-semibold">{pointer.name}</span>:{" "}
                            {pointerText}
                        </div>
                    );
                })}
            </div>
        );
    }

    let explanationButtonText = "Show Explanation";

    if (showExplanation) {
        explanationButtonText = "Hide Explanation";
    }


    // Changes layour when the explanation panel is hidden
    let listViewGridClass = "grid gap-4 lg:grid-cols-[2fr,1fr]";
    if (!showExplanation) {
        listViewGridClass = "grid gap-4 grid-cols-1";
    }

    // Specifies the colour key used in hte linked list visualisation
    let legendText = null;
    if (showExplanation) {
        legendText = (
            <div className="mt-4 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="font-semibold mb-1">Colour Key</div>
                <div>Black = structural next pointer</div>
                <div>Blue = head pointer</div>
                <div>Grey = temp pointer</div>
                <div>Red = dangling, freed or unreachable</div>
                <div>Orange = deletion / relink</div>
                <div>Green = tail pointer</div>
            </div>
        );
    }

    return(
        <Card className="w-full shadow-md">
            <CardHeader>
                <CardTitle>ViDS Linked List View</CardTitle>
            </CardHeader>

            <CardContent>
                <Tabs defaultValue="list-view" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="list-view">List View</TabsTrigger>
                        <TabsTrigger value="pointer-data">Pointer Data</TabsTrigger>
                    </TabsList>

                    <TabsContent value="list-view" className="mt-4">
                        <div className="mb-4 flex justify-end">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowExplanation(!showExplanation);
                                }}
                            >
                                {explanationButtonText}

                            </Button>
                        </div>

                        <div className={listViewGridClass}>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Linked List View</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {structuralContent}
                                    {legendText}
                                </CardContent>
                            </Card>

                            {showExplanation && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Operation / Explanation</CardTitle>
                                    </CardHeader>

                                    <CardContent className="space-y-4">
                                        <div>
                                            <div className="text-sm font-semibold">Current line</div>
                                            <div className="mt-1 rounded-md border bg-muted/30 p-2 font-mono text-sm">
                                                {currentLineText}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-sm font-semibold">What just happened?</div>
                                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                                {getExplanation()}
                                            </p>
                                        </div>

                                    </CardContent>
                                </Card>
                            )}

                        </div>

                    </TabsContent>

                    <TabsContent value="pointer-data" className="mt-4">
                        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Node and Pointer Data</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {detailedContent}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Pointer Summary</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {pointerSummaryContent}
                                </CardContent>
                            </Card>
        
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );

}


