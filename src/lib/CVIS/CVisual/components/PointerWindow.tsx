import type {ProgramStateMachine} from "@CMachine/CMachine.ts";
import type {Variable} from "@CMachine/CMachineTypes.ts";
import {HardDrive, Link} from "lucide-react";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import {MemoryDisplay} from "@CVisual/components/MemoryDisplay.tsx";
import React from "react";
import {Badge} from "@/components/ui/badge.tsx";


interface PointerWindowProps {
    cMachine: ProgramStateMachine,
    variable: Variable
}

const formatAddress= (address: number) => {
    return `0x${address.toString(16).toUpperCase().padStart(8, "0")}`;
};

const PointerStatusCard = ({
    title, 
    description,
    badgeText,
    colourClass}:{
        title: string;
        description: string;
        badgeText: string;
        colourClass: string;
    }) =>{
        return(
            <div className="absolute top-[-0.20rem] h-full w-full right-[calc(-100%-0.75rem)]">
                <div className={`absolute top-[50%] h-1 w-[50px] ${colourClass}`}></div>

                <div className="absolute left-[50px]">
                    <div className="rounded-md border bg-card p-3">
                        <div className="mb-2 flex items-center gap-2">
                            <Badge variant="outline">
                                {badgeText}
                            </Badge>
                        </div>

                        <div className="font-mono text-sm font-medium">
                            {title}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                            {description}
                        </div>
                    </div>
                </div>
            </div>

        );
};

export const PointerWindow = ({cMachine, variable}: PointerWindowProps) => {
    // Address inside pointer variable fetched to determine the message to be displayed
    const variableValue = cMachine.getVariableValue(variable).value;

    // Value is 0 meaning NULL
    if (variableValue===0){
        return(
            <PointerStatusCard
                title="NULL pointer"
                description="This pointer does not currently point to a heap allocation."
                badgeText="NULL"
                colourClass="bg-slate-400"/>
        );
    }

    // Change to using public snapshot instead of previous private 

    const memoryMachine = cMachine.getProgramSnapshot().memory;
    const allocation = memoryMachine.getMemoryInfo(variableValue);

    if (!allocation){
        return(
            <PointerStatusCard
                title="Dangling or invalid pointer"
                description={`This pointer still stores ${formatAddress(variableValue)}, but that address is not currently allocated on the heap.`}
                badgeText="Invalid"
                colourClass="bg-red-500"/>
        );
    }

    const memory = cMachine.getHeapSection(allocation.start, allocation.size);

    return (
        <div className="absolute top-[-0.20rem] h-full w-full right-[calc(-100%-0.75rem)]">
            <div className="absolute top-[50%] h-1 w-[50px] bg-blue-500 text-center flex flex-col items-center">
                <Link className="absolute top-[-0.5rem] h-4 w-4 px-1 py-1 box-content bg-white text-blue-500"/>
            </div>

            {/*    */}
            <div className="absolute left-[50px]">
                <div className="rounded-md border bg-card p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-muted-foreground"/>
                            <span className="text-sm text-muted-foreground">Memory:</span>
                            <span
                                className="font-mono text-sm text-amber-600 dark:text-amber-400">
                            0x{allocation.start.toString(16).toUpperCase().padStart(8, "0")}
                          </span>
                            <span className="font-mono text-sm">({allocation.size} bytes)</span>
                        </div>
                    </div>

                    <div className="mt-4">

                        <Tabs defaultValue="hex" className="w-full">
                            <TabsList className="mb-2 grid w-full grid-cols-3">
                                <TabsTrigger value="hex">Hexadecimal</TabsTrigger>
                                <TabsTrigger value="decimal">Decimal</TabsTrigger>
                                <TabsTrigger value="text">ASCII Text</TabsTrigger>
                            </TabsList>

                            <TabsContent value="hex" className="mt-0">
                                <MemoryDisplay memory={memory} format="hex" bytesPerRow={8}
                                               highlightAddress={variableValue - allocation.start}/>
                            </TabsContent>

                            <TabsContent value="decimal" className="mt-0">
                                <MemoryDisplay memory={memory} format="decimal"
                                               bytesPerRow={8} highlightAddress={variableValue - allocation.start}/>
                            </TabsContent>

                            <TabsContent value="text" className="mt-0">
                                <MemoryDisplay memory={memory} format="text" bytesPerRow={8}
                                               highlightAddress={variableValue - allocation.start}/>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>
        </div>

    )
}