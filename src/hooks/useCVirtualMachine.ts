import {useEffect, useRef, useState} from "react";
import * as AST from "@CVIS/CParser/CAst.ts";
import {ProgramSnapshot} from "@CVIS/CMachine/CMachineTypes.ts";
import {ProgramStateMachine} from "@CVIS/CMachine/CMachine.ts";
import {Scanner} from "@CVIS/CParser/CScanner.ts";
import {Parser} from "@CVIS/CParser/CParser.ts";


export interface VirtualMachineMetadata {
    virtualMachine: ProgramStateMachine | null;
    inputCode: string;
    parsedProgram: AST.Program | null;
    programSnapshot: ProgramSnapshot | null;
    executionStack: AST.Statement[];
    hasParseFailed: boolean;
    currentLine: number | null;
    consoleOutput: string;
    errorOutput: string;
    stepIndex: number;
}


export interface VirtualMachineHook {
    (debug: boolean): [
        () => void,
        () => void,
        () => void,
        () => void,
        (code: string) => void,
        React.Dispatch<React.SetStateAction<string>>,
        React.Dispatch<React.SetStateAction<string>>,
        VirtualMachineMetadata
    ]

}

// Main hook to parser code, run the virtual machine, and keep UI state synced
export const useCVirtualMachine: VirtualMachineHook = (debug: boolean = false) => {

    // Stores current code, parsed program, latest machine snapshot
    const [inputCode, setInputCode] = useState("int main()\n" +
        "{\n" +
        "    \n" +
        "}");
    const [parsedProgram, setParsedProgram] = useState<AST.Program | null>(null);
    const [programSnapshot, setProgramSnapshot] = useState<ProgramSnapshot | null>(null);
    
    // Keeps track of the virtual machine state, parser status, current line, terminal output
    const [machine, setMachine] = useState<ProgramStateMachine | null>(null);

    const [hasParseFailed, setHasParseFailed] = useState(false);

    const [currentLine, setCurrentLine] = useState<number | null>(null);
    const [consoleOutput, setConsoleOutput] = useState("");
    const [errorOutput, setErrorOutput] = useState("");
    
    // Saves previous state so that user can also move backward through execution
    const [stepIndex, setStepIndex] = useState(0);
    const [stepHistory, setStepHistory] = useState<Array<{ consoleOutput: string; errorOutput: string; currentLine: number | null }>>([
        {consoleOutput: "", errorOutput: "", currentLine: null}
    ]);


    const consoleOutputRef = useRef("");
    const errorOutputRef = useRef("");
    const isReplayingRef = useRef(false);

    useEffect(() => {
        consoleOutputRef.current = consoleOutput;
    }, [consoleOutput]);

    useEffect(() => {
        errorOutputRef.current = errorOutput;
    }, [errorOutput]);

    // Reparses code whne the editor input changes 
    useEffect(() => {
        try {
            const scanner = new Scanner(inputCode);
            const parser = new Parser(scanner, debug);
            const parsed = parser.parse();
            setParsedProgram(parsed);
            setHasParseFailed(false);
        } catch (e) {
            setHasParseFailed(true);
            virtualError((e as Error).message);
            setParsedProgram(null);
            setProgramSnapshot(null);
        }
    }, [inputCode]);

    // Builds a clean virtual machine once the code has parsed successfully
    useEffect(() => {
        try {
            if (!parsedProgram) return;

            const newMachine = new ProgramStateMachine(parsedProgram, virtualLog, false);
            newMachine.programSetup();
            setMachine(newMachine);

            // Snapshot the machine just created rather than the machine value from
            // the previous render. The old value can otherwise leave the editor and
            // execution engine out of sync after code changes.
            updateSnapshot(null, newMachine);
            setHasParseFailed(false);
        } catch (e) {

            setHasParseFailed(true);
            virtualError((e as Error).message)
            setParsedProgram(null);
            setProgramSnapshot(null);
        }
    }, [parsedProgram]);

    // Sends normal program output to the terminal unless an old step is being replayed
    const virtualLog = (message: string) =>{
        if (isReplayingRef.current) return;

        const nextOutput = consoleOutputRef.current + message;
        consoleOutputRef.current = nextOutput;
        setConsoleOutput(nextOutput);
    }

    // Sends errors to terminal with timestamp to make debugging easier
    const virtualError = (message: string) =>{
        if (isReplayingRef.current) return;

        const nextOutput = errorOutputRef.current + getTime() + " - " + message + "\n";
        errorOutputRef.current = nextOutput;
        setErrorOutput(nextOutput);
    }

    // Updated to reflect current state as user steps through line by line
    const updateSnapshot = (lineOverride: number | null = null, targetMachine: ProgramStateMachine | null = machine) =>{
        if (!targetMachine) 
            return;

        let machineSnap: ProgramSnapshot = targetMachine.getProgramSnapshot();

        setProgramSnapshot(machineSnap);

        if (lineOverride !== null && lineOverride !== undefined){
            setCurrentLine(lineOverride);
        } else if (machineSnap.currentLine !== null && machineSnap.currentLine !== undefined) {
            setCurrentLine(machineSnap.currentLine);
        } else {
            setCurrentLine(null);
        }
    }

    // Creates simple timestamp for error messages in the terminal
    const getTime = () => {
        let now = new Date();
        let hours = now.getHours();
        let minutes = now.getMinutes();
        let seconds = now.getSeconds();
        return `[${hours}:${minutes}:${seconds}]`;
    }


    // Resets the machine back to start of program 
    const resetStepHistory = () => {
        setStepIndex(0);
        setStepHistory([{consoleOutput: "", errorOutput: "", currentLine: null}]);
        consoleOutputRef.current = "";
        errorOutputRef.current = "";
        setConsoleOutput("");
        setErrorOutput("");
    }


    const resetVirtualMachine = () => {
        if (!machine) return;
        machine.programSetup();
        resetStepHistory();
        updateSnapshot(null, machine);
    }


    // Runs whole program in one go
    const runProgram = () => {
        resetStepHistory();

        try{
            // Parse the text that is currently visible in the editor at the exact
            // moment Run is pressed. React's parsedProgram state is updated by an
            // effect and can lag one render behind fast edits, which previously
            // allowed a stale or partially parsed program to run and report an
            // undefined/old exit code.
            const scanner = new Scanner(inputCode);
            const parser = new Parser(scanner, debug);
            const programToRun = parser.parse();

            setHasParseFailed(false);

            const runMachine = new ProgramStateMachine(programToRun, virtualLog, false);
            runMachine.programSetup();
            setMachine(runMachine);
            const exitCode = runMachine.runProgram();

            updateSnapshot(null, runMachine);
            setCurrentLine(null);

            if(exitCode !== null){
                virtualLog(`Program exited with code ${exitCode}\n\n`);
            }

            setStepHistory([
                {
                    consoleOutput: consoleOutputRef.current,
                    errorOutput: errorOutputRef.current,
                    currentLine: null
                }
            ]);
        }catch(e){
            console.error(e);
            setHasParseFailed(true);
            virtualLog(`Run error: ${(e as Error).message}\n`);
        }
    }

    // Executes one step at at a time so visualisation can update line by line
    const stepProgram = () => {
        if (!machine) return;
        let returnResult = null;
        // Making sure the line about to run is retrieved so it can be correctly highlighted
        const lineThatRan = machine.getProgramSnapshot().currentLine;

        try {
            returnResult = machine.stepProgram();

            if (returnResult !== null) {
                virtualLog(`Program exited with code ${returnResult}\n\n`);
            }

            let lineToShow = null;
            
            if (lineThatRan !== null && lineThatRan !== undefined){
                lineToShow = lineThatRan;
            }

            updateSnapshot(lineToShow, machine);
            const nextStepIndex = stepIndex + 1;
            
            // Saves new output and current line for user to step back when needed
            setStepHistory((prev) =>{
                const historyToCurrentStep = prev.slice(0, stepIndex+1);

                return[...historyToCurrentStep, {
                    consoleOutput: consoleOutputRef.current,
                    errorOutput: errorOutputRef.current,
                    currentLine: lineToShow
                }
                ];
            });

            setStepIndex(nextStepIndex);
        } catch (e) {
            console.error(e);
            virtualLog(`Step error: ${(e as Error).message}\n`);
        }
    }

    // Added stepback feature
    // Rebuilds machined from previous step to match old program state
    const stepBackProgram= () => {
        if (!machine || stepIndex ===0){
            return;
        }

        const targetStepIndex = stepIndex-1;
        const targetHistory = stepHistory[targetStepIndex];
        isReplayingRef.current = true;

        try{
            machine.programSetup();

            let lineToShow: number | null = null;


            // Replays steps from start until teh target step is reached again
            for(let i=0; i<targetStepIndex; i++){
                const lineThatRan= machine.getProgramSnapshot().currentLine;
                machine.stepProgram();

                if (lineThatRan !== null && lineThatRan !== undefined){
                    lineToShow = lineThatRan;
                }
            }

            if (targetStepIndex === 0){
                updateSnapshot(targetHistory.currentLine, machine);
            }else{
                updateSnapshot(lineToShow, machine);
            }
        }catch(e){
            console.error(e);
        }finally{
            isReplayingRef.current = false;
        }

        if (targetHistory){
            consoleOutputRef.current = targetHistory.consoleOutput;
            errorOutputRef.current = targetHistory.errorOutput;
            setConsoleOutput(targetHistory.consoleOutput);
            setErrorOutput(targetHistory.errorOutput);
        }

        setStepIndex(targetStepIndex);
    }

    // Groups current machine state into one object for the UI components
    const virtualMachineMetadata: VirtualMachineMetadata = {
        virtualMachine: machine,
        inputCode,
        parsedProgram,
        programSnapshot,
        executionStack: programSnapshot?.executionStack || [],
        hasParseFailed,
        currentLine,
        consoleOutput,
        errorOutput,
        stepIndex
    }


    return [
        runProgram,
        stepProgram,
        stepBackProgram,
        resetVirtualMachine,
        setInputCode,
        setConsoleOutput,
        setErrorOutput,
        virtualMachineMetadata
    ]
}
