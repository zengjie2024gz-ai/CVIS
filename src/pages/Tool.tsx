import {Card, CardContent, CardHeader} from "@/components/ui/card.tsx";
import {Trash} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {VisualisationWindow} from "@CVIS/CVisual/components/VisualisationWindow.tsx";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs.tsx";
import {ScrollArea} from "@/components/ui/scroll-area.tsx";
import {useCVirtualMachine} from "@/hooks/useCVirtualMachine.ts";
import {useSearchParams} from "react-router-dom";
import {Editor} from "@CVIS/CVisual/components/Editor.tsx";
import {ViDSConceptView} from "@CVIS/CVisual/components/ViDSConceptView.tsx";
import {useEffect, useState} from "react";
import type {CSSProperties} from "react";

interface CodeSnippetFile {
    fileName: string;
    code: string;
}

interface StoredCodeSnippet {
    id: number;
    title: string;
    description: string;
    code: string;
    executionCode?: string;
    files?: CodeSnippetFile[];
}

// Main page for running code and comparing low-level CVIS with higher-level ViDS view
export const Tool = () => {
    const [
        runProgram,
        stepProgram,
        stepBackProgram,
        resetVirtualMachine,
        setInputCode,
        setConsoleOutput,
        setErrorOutput,
        virtualMachineMetadata
    ] = useCVirtualMachine(false);

    // Get snippet data from the URL when a user opens code from the snippets page
    const [searchParams, setSearchParams] = useSearchParams();
    const code = searchParams.get("code");
    const snippet = searchParams.get("snippet");

    // For a collapsable code editor to provide more space
    const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

    // For resizeable components
    const [editorWidthPercent, setEditorWidthPercent] = useState(32);
    const [isResizingSections, setIsResizingSections] = useState(false);

    //For multi-file code snippets
    const [snippetFiles, setSnippetFiles] = useState<CodeSnippetFile[]>([]);
    const [activeSnippetFileIndex, setActiveSnippetFileIndex] = useState(-1);

    // CHnages page layout depending on whether the editor is shown or collapsed
    let playgroundGridClass = "grid grid-cols-1 gap-6 md:grid-cols-[var(--editor-width)_12px_1fr]";

    let playgroundGridStyle = {
        "--editor-width": `${editorWidthPercent}%`
    } as CSSProperties;

    
    if (isEditorCollapsed) {
        playgroundGridClass = "grid grid-cols-1 gap-6";
        playgroundGridStyle = {} as CSSProperties;
    }


    // Loads single-file code into the tool when passed through URl
    useEffect(() => {
        if (code) {
            setInputCode(code);
            setSnippetFiles([]);
            setActiveSnippetFileIndex(-1);
            setSearchParams({});
        }
    }, [code, setInputCode, setSearchParams]);

    // Loads multi-file snippet from local storage and uses execution version for parsing and running
    useEffect(() =>{
        if (!snippet){
            return;
        }

        const storedSnippet = localStorage.getItem(`vids-selected-snippet-${snippet}`);

        if (!storedSnippet){
            setSearchParams({});
            return;
        }

        try{
            const parsedSnippet = JSON.parse(storedSnippet) as StoredCodeSnippet;
            const codeToRun = parsedSnippet.executionCode || parsedSnippet.code;

            setInputCode(codeToRun);
            setSnippetFiles(parsedSnippet.files || []);
            setActiveSnippetFileIndex(-1);
        }catch(e){
            console.error(e);
        }

        setSearchParams({});
    }, [snippet, setInputCode, setSearchParams]);


    // For dragging so that editor and visualisation sections can be resized
    useEffect(() => {
        if (!isResizingSections){
            return;
        }

        const handleMouseMovement= (event: MouseEvent) =>{
            const resizeArea = document.getElementById("tool-resize-area");

            if (!resizeArea) {
                return;
            }

            const bounds = resizeArea.getBoundingClientRect();
            const mousePosition = event.clientX - bounds.left;
            let nextEditorWidth = (mousePosition/ bounds.width) *100;

            if(nextEditorWidth <20){
                nextEditorWidth= 20;
            }

            if(nextEditorWidth >55){
                nextEditorWidth= 55;
            }

            setEditorWidthPercent(nextEditorWidth);
        };

        const handleMouseUp = () =>{
            setIsResizingSections(false);
        };


        document.addEventListener("mousemove", handleMouseMovement);
        document.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect= "none";

        return()=> {
            document.removeEventListener("mousemove", handleMouseMovement);
            document.removeEventListener("mouseup", handleMouseUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    
    }, [isResizingSections]
);

    // Converts machine state into JSON and reads map objects for CVIS
    const jsonStringify = (obj: any) => {
        return JSON.stringify(obj, (_, value) => {
            if (value instanceof Map) {
                return Object.fromEntries(value);
            }
            return value;
        }, 2);
    };

    return (
        <div className='p-6 space-y-6'>
            <div 
                id="tool-resize-area" // Main window with editor, resize bar, and visualisation suite
                className={playgroundGridClass}
                style={playgroundGridStyle}>

            
                {!isEditorCollapsed && ( // Shows the editor panel unless it has been collapsed by the user
                    <Editor
                        virtualMachineMetadata={virtualMachineMetadata}
                        runProgram={runProgram}
                        stepProgram={stepProgram}
                        resetVirtualMachine={resetVirtualMachine}
                        setInputCode={setInputCode}
                        stepBackProgram={stepBackProgram}
                        onCollapseEditor={() => setIsEditorCollapsed(true)}
                        snippetFiles={snippetFiles}
                        activeSnippetFileIndex={activeSnippetFileIndex}
                        setActiveSnippetFileIndex={setActiveSnippetFileIndex}/>
                )}

                {!isEditorCollapsed &&( // Drags the handle used for resizing
                    <div
                        className="hidden cursor-col-resize rounded-md bg-muted transition-colors hover:bg-slate-400 md:block"
                        onMouseDown={() => setIsResizingSections(true)}
                        title="Drag to resize editor and visualisation" />
                )} 

                
                <Card className="w-full"> 
                    <CardHeader> 
                        <div className="flex items-center justify-between"> 
                            <h3 className="text-lg font-semibold">Visualisation Suite</h3>

                            {isEditorCollapsed &&( // Lets user bring the code editor back after hiding it 
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditorCollapsed(false)}>
                                    Show Code Editor
                                </Button>
                            )}
                        </div>
                    </CardHeader>
 
                    <CardContent> 
                        
                        {/* Allows switching between the low-level CVIS view and higher-level ViDS view*/}
                        <Tabs defaultValue="cvis" className="w-full"> 
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="cvis">CVIS</TabsTrigger>
                                <TabsTrigger value="vids">ViDS</TabsTrigger>
                            </TabsList>

                            {/* CVIS shows raw machine state like stack, heap, memory dump*/}
                            <TabsContent value="cvis" className="mt-4">
                                <VisualisationWindow
                                    state={jsonStringify(virtualMachineMetadata.programSnapshot)}
                                    ast={virtualMachineMetadata.parsedProgram}
                                    snapshot={virtualMachineMetadata.programSnapshot}
                                    executionStack={virtualMachineMetadata.executionStack}
                                    inputCode={virtualMachineMetadata.inputCode}
                                    currentLine={virtualMachineMetadata.currentLine}/>
                            </TabsContent>

                            {/*ViDS shows a conceptual view that is built from teh same program state*/}
                            <TabsContent value="vids" className="mt-4">
                                {virtualMachineMetadata.programSnapshot && (
                                    <ViDSConceptView
                                        snapshot={virtualMachineMetadata.programSnapshot}
                                        inputCode={virtualMachineMetadata.inputCode}
                                        currentLine={virtualMachineMetadata.currentLine}/>
                                )}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    {/* Terminal area for showing program output and execution errors*/}
                    <h3 className="text-lg font-semibold">Terminal</h3>
                    <div className="flex space-x-2">
                        {/* Clears output and error tabs*/}
                        <Button
                            variant="outline"
                            onClick={() => {
                                setConsoleOutput("");
                                setErrorOutput("");
                            }}>
                                <Trash/>
                            </Button>
                    </div>
                </CardHeader>

                <CardContent>
                    {/* Separates normal progrram output from any error messages*/}
                    <Tabs defaultValue="output" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="output">Output</TabsTrigger>
                            <TabsTrigger value="errors">Errors</TabsTrigger>
                        </TabsList>

                        <TabsContent value="output" className="mt-4">
                            <ScrollArea className="h-[600px] rounded-md border overflow-y-scroll">
                                <div className="p-4">
                                    <pre className="whitespace-pre-wrap break-words w-full">
                                        <code>{virtualMachineMetadata.consoleOutput}</code>
                                    </pre>
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="errors" className="mt-4">
                            <ScrollArea className="h-[600px] rounded-md border overflow-y-scroll">
                                <div className="p-4">
                                    <pre className="whitespace-pre-wrap break-words w-full">
                                        <code>{virtualMachineMetadata.errorOutput}</code>
                                    </pre>
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
};
