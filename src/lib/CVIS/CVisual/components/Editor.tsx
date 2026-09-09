import {Card, CardContent, CardHeader} from "@/components/ui/card.tsx";
import {ChevronRight, ChevronLeft, FileCheck, LoaderCircle, Play, X} from "lucide-react";
import {Button} from "@/components/ui/button.tsx";
import {EditorWindow} from "@CVisual/components/EditorWindow.tsx";
import {VirtualMachineMetadata} from "@/hooks/useCVirtualMachine.ts";
import React from "react";

interface CodeSnippetFile {
    fileName: string;
    code: string;
}

interface EditorProps {
    virtualMachineMetadata: VirtualMachineMetadata;
    runProgram: () => void;
    stepProgram: () => void;
    resetVirtualMachine: () => void;
    setInputCode: (code: string) => void;
    stepBackProgram: () => void;
    onCollapseEditor: () => void;
    snippetFiles?: CodeSnippetFile[];
    activeSnippetFileIndex: number;
    setActiveSnippetFileIndex: (index: number) => void;
}

// Editor panel for writing code, stepping through execution, viewing multi-file snippets
export const Editor = ({
                           virtualMachineMetadata,
                           runProgram,
                           stepProgram,
                           resetVirtualMachine,
                           setInputCode,
                           stepBackProgram,
                           onCollapseEditor,
                           snippetFiles,
                           activeSnippetFileIndex,
                           setActiveSnippetFileIndex,
                       }: EditorProps): JSX.Element => {
    
    // Sets up which code should be shown in the editor and whether it can be edited
    const hasSnippetFiles = snippetFiles && snippetFiles.length>0;
    let highlightedLine = virtualMachineMetadata.currentLine;
    let codeToShow = virtualMachineMetadata.inputCode;
    let isReadOnlyFile = false;

    // Gives each file view its own key so that the editor refreshes properly when tabs change
    let editorWindowKey = "execution-view";
    
    // Switches editor key when a different snippet file tab is opened
    if (activeSnippetFileIndex >= 0) {
        editorWindowKey= `snippet-file-${activeSnippetFileIndex}`;
    }

    // Updates only the execution code
    const handleEditorCodeChange = (code: string) => {
        if (activeSnippetFileIndex === -1) {
            setInputCode(code);
        }
    };

    // User cannot edit the coursework file but can edit all the other snippets 
    // To work with the current limitations of a teaching tool 

    if (hasSnippetFiles && activeSnippetFileIndex>= 0){
        codeToShow= snippetFiles[activeSnippetFileIndex].code;
        highlightedLine= null;
        isReadOnlyFile= true;
    }

    // Decides what parser status should be shown above the editor
    let hasParsedProgram= false;
    let parserStatusContent;

    if(virtualMachineMetadata.parsedProgram){
        hasParsedProgram= true;
    }


    // Treats machine snapshot as evidence that code has parsed successfully
    let hasMachineState= false;
    if (virtualMachineMetadata.programSnapshot) {
        hasMachineState = true;
    }

    // Keeps parser status clearer as the other coursework files are display-only
    if (isReadOnlyFile) {
        parserStatusContent= (
            <div className="flex flex-row gap-1 items-center text-sky-600">
                Display only
            </div>
        );
    }else if(hasParsedProgram || hasMachineState){
        parserStatusContent = (
            <div className="flex flex-row gap-1 items-center text-emerald-600">
                Parsed
                <FileCheck className="w-4 h-4"/>
            </div>
        );
    }else if(virtualMachineMetadata.hasParseFailed){
        parserStatusContent = (
            <div className="flex flex-row gap-1 items-center text-red-500">
                Parse error
            </div>
        );
    }else{
        parserStatusContent= (
            <div className="flex flex-row gap-1 items-center text-amber-600">
                Waiting to parse
                <LoaderCircle className="w-4 h-4 animate-spin"/>
            </div>
        );
    }

    // Highlights the file tab that has been selected
    let executionButtonVariant: "default" | "outline" = "outline";

    // Selects exectution view when no other file is selected
    if (activeSnippetFileIndex === -1){
        executionButtonVariant = "default";
    }


    // Chooses whether the editor allows or ignores edits
    let editorCodeSetter = handleEditorCodeChange;

    // Stops display-only files from being edited 
    if (isReadOnlyFile) {
        editorCodeSetter= () =>{};
    }

    // User cannot step forward when there is nothing left in execution stack
    let stepForwardDisabled= true;

    if (virtualMachineMetadata.executionStack){
        if (virtualMachineMetadata.executionStack.length > 0){
            stepForwardDisabled = false;
        }
    }
        

    return (
        <Card>
            <CardHeader className="space-y-3">
                <div className="flex items-center gap-5">
                    <h3 className="text-lg font-semibold">Editor</h3>
                    {parserStatusContent}
                </div>
                {/* Main editor controls for running, resetting, stepthrough, and collapsing*/}
                <div className="flex flex-wrap items-center gap-2"> 
                    <Button onClick={() => runProgram()}>
                        Run <Play/>
                    </Button>
                    <Button onClick={() => resetVirtualMachine()} variant='destructive'>
                        Reset <X/>
                    </Button>

                    <Button
                        onClick={() => onCollapseEditor()}
                        variant="outline">
                        <ChevronLeft/>
                        Hide Code Editor
                    </Button>
                                        
                    <Button
                        onClick={() => stepBackProgram()}
                        variant="outline"
                        disabled={virtualMachineMetadata.stepIndex === 0}>
                        <ChevronLeft/>Step Back
                    </Button>

                    <Button 
                        onClick={() => stepProgram()}
                        variant="outline"
                        disabled={stepForwardDisabled}>
                        Step Forward<ChevronRight/>
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                {/* File tabs are displayed and user can swap between code being shown */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Button
                        variant={executionButtonVariant}
                        onClick={() => setActiveSnippetFileIndex(-1)}
                        className="whitespace-nowrap">
                        Execution View
                    </Button>
                    
                    {/* Creates one button for each file in multi-file snippet */}
                    {snippetFiles?.map((file, index) =>{
                        let fileButtonVariant: "default" | "outline" = "outline";
                        if (activeSnippetFileIndex === index){
                            fileButtonVariant = "default";
                        }
                        
                        return (
                            <Button
                                key={file.fileName}
                                variant={fileButtonVariant}
                                onClick={() => setActiveSnippetFileIndex(index)}
                                className="whitespace-nowrap">
                                {file.fileName}
                            </Button>
                        );
                    })}
                </div>
                
                {/* Fixed height for the editor */}
                <div className='h-[420px] rounded-md'>
                    <EditorWindow 
                        key={editorWindowKey}
                        highlightLine={highlightedLine}
                        codeRaw={codeToShow}
                        setCodeRaw={editorCodeSetter}
                        readOnly={isReadOnlyFile}/>

                </div>
            </CardContent>
        </Card>);
}