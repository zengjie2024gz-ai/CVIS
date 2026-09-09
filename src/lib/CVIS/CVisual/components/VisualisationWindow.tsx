import * as AST from '@CParser/CAst.ts';
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import {ProgramSnapshot} from "@CMachine/CMachine.ts";
import HeapCard from "@CVisual/components/HeapCard.tsx";
import {MemoryDump} from "@CVisual/components/MemoryDump.tsx";
import {useEffect, useState} from "react";
import {ByteMemory} from "@CMachine/CMemory.ts";
import {Statement} from "@CParser/CAst.ts";
import {Callstack} from "@CVisual/components/Callstack.tsx";

export const VisualisationWindow = ({state, ast, snapshot, executionStack, inputCode, currentLine}: {
    state: string,
    ast: AST.Program | null,
    snapshot: ProgramSnapshot,
    executionStack: Statement[],
    inputCode: string,
    currentLine: number | null
}) => {
    const [memory, setMemory] = useState<Uint8Array>();
    const [updateCounter, setUpdateCounter] = useState(0);

    // Updates raw memory view when the snapshot changes
    useEffect(() => {
        if (snapshot) {
            const memoryObj: ByteMemory = snapshot.memory.getMemory();
            const rawMemory: Uint8Array = memoryObj.getMemory();
            setMemory(rawMemory);
            setUpdateCounter((prev) => prev + 1);
        }
    }, [snapshot, executionStack]);

    return (
        <div className="w-full">
            {/* Lets user switch between stack, heap, memory views*/}
            <Tabs defaultValue="stack" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="stack">Stack</TabsTrigger>
                    <TabsTrigger value="heap">Heap</TabsTrigger>
                    <TabsTrigger value="raw">Dump</TabsTrigger>
                </TabsList>

                {/* Stack view shows call frames and pointer variables*/}
                <TabsContent value="stack" className="mt-4">
                    {snapshot && (
                        <Callstack snapshot={snapshot}/>
                    )}
                </TabsContent>
                
                {/* Shows allocations*/}
                <TabsContent value="heap" className="mt-4">
                    {snapshot && (
                        <HeapCard
                            heap={snapshot.memory.getHeapDump()}
                            cMachine={snapshot.machine}
                            snapshot={snapshot}
                            inputCode={inputCode}
                            currentLine={currentLine}/>
                    )}
                </TabsContent>
                
                {/* Shows raw bytes*/}
                <TabsContent value="raw" className="mt-4">
                    {memory && snapshot && (
                        <MemoryDump
                            key={updateCounter}
                            memoryData={memory}
                            stackPointer={snapshot.memory.StackPointer}
                            heapPointer={snapshot.memory.HeapPointer}
                            allocations={snapshot.memory.getAllocations()}
                        />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};
