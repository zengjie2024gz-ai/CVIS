import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Scanner} from '@CParser/CScanner.ts';
import {Parser} from '@CParser/CParser.ts';
import {ProgramStateMachine} from '@CMachine/CMachine.ts';
import HeapCard from '../CVisual/components/HeapCard.tsx';
import {MemoryDump} from '../CVisual/components/MemoryDump.tsx';

function create(code: string) {
    let output = '';
    const machine = new ProgramStateMachine(new Parser(new Scanner(code)).parse(), s => output += s);
    machine.programSetup();
    return {machine, output: () => output};
}
function finish(machine: ProgramStateMachine, visit = (_: number) => {}) {
    let result, steps = 0;
    while (machine.getProgramSnapshot().executionStack.length) {
        if (++steps > 10000) throw new Error('Step limit');
        result = machine.stepProgram(); visit(steps);
    }
    return result;
}
function heapHTML(machine: ProgramStateMachine, code: string) {
    const snapshot = machine.getProgramSnapshot();
    return renderToStaticMarkup(<HeapCard heap={snapshot.memory.getHeapDump()} cMachine={machine}
        snapshot={snapshot} inputCode={code} currentLine={snapshot.currentLine}/>);
}
beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('Memory and expression stepping regressions', () => {
    it('casts before division and includes a postfix subscript in the cast operand', () => {
        const {machine, output} = create(`int main() {
            int a[2]; a[0] = 2; a[1] = 3;
            printf("%.6f %.6f %d\\n", (double)2 / 3, (double)a[0] / 3, (int)-1.8 * 2);
            return 0;
        }`);
        expect(finish(machine)).toBe(0);
        expect(output()).toBe('0.666667 0.666667 -2\n');
    });
    it('exposes nested calls in printf arguments and return expressions', () => {
        const {machine, output} = create(`int twice(int x) { return x * 2; }
            int outer(int x) { return twice(x) + twice(x + 1); }
            int main() { printf("%d\\n", outer(3)); return 0; }`);
        let deepest = 0;
        finish(machine, () => {deepest = Math.max(deepest, machine.getProgramSnapshot().callStack.length);});
        expect(deepest).toBe(3); expect(output()).toBe('14\n');
    });
    it('resumes an indexed assignment without repeating side effects', () => {
        const {machine, output} = create(`int twice(int x) { return x * 2; }
            int main() { int a[2]; int i = 0; int j = 3;
                a[i++] = twice(j++); printf("%d %d %d\\n", i, j, a[0]); return 0; }`);
        finish(machine); expect(output()).toBe('1 4 6\n');
    });
    it('handles nested initializer arguments and preserves floating return types', () => {
        const {machine, output} = create(`double half(int x) { return (double)x / 2; }
            int two() { return 2; }
            int main() { double value = half(two()) / 2; printf("%.2f\\n", value); return 0; }`);
        finish(machine); expect(output()).toBe('0.50\n');
    });
    it('does not run a call on a short-circuited branch', () => {
        const {machine, output} = create(`int noisy() { printf("WRONG"); return 1; }
            int main() { int a = 0 && noisy(); int b = 1 || noisy();
                printf("%d %d\\n", a, b); return 0; }`);
        finish(machine); expect(output()).toBe('0 1\n');
    });
    it('completes an initializer before the next declarator in the same statement', () => {
        const {machine, output} = create(`int two() { return 2; }
            int main() { int a = two(), b = a + two(); printf("%d %d\\n", a, b); return 0; }`);
        finish(machine); expect(output()).toBe('2 4\n');
    });
    it('shows integer arrays as allocations rather than linked-list nodes', () => {
        const code = `int main() { int *current = malloc(16); int *next = malloc(16); return 0; }`;
        const {machine} = create(code);
        finish(machine);
        const html = heapHTML(machine, code);
        expect(html).toContain('32 bytes allocated');
        expect(html).not.toContain('Node allocation'); expect(html).not.toContain('not reachable from head');
    });
    it('uses declared struct offsets for the optional node preview', () => {
        const code = `int main() { struct Node { struct Node *next; int data; };
            struct Node *head = malloc(sizeof(struct Node));
            head->next = NULL; head->data = 77; printf("ready"); return 0; }`;
        const {machine, output} = create(code); let html = '';
        finish(machine, () => {if (output() && machine.getProgramSnapshot().callStack.length) html = heapHTML(machine, code);});
        expect(html).toContain('Node allocation'); expect(html).toContain('77');
        expect(html).toContain('Reachable from head');
    });
    it('checks raw ABC bytes, both rendered views, free, and deterministic replay', () => {
        const code = `int main() { char *p = malloc(4);
            p[0] = 'A'; p[1] = 'B'; p[2] = 'C'; p[3] = '\\0';
            printf("%s\\n", p); free(p); p = NULL; return 0; }`;
        const {machine, output} = create(code); let savedStep = 0, address = 0, savedBytes = '';
        finish(machine, step => {
            const snapshot = machine.getProgramSnapshot(); const heap = snapshot.memory.getHeapDump();
            if (output() === 'ABC\n' && heap.length === 1 && !savedStep) {
                savedStep = step; address = heap[0].start;
                const bytes = snapshot.memory.getMemory().getMemory();
                expect(Array.from(bytes.slice(address, address + 4))).toEqual([65,66,67,0]);
                savedBytes = Buffer.from(bytes).toString('hex');
                expect(heapHTML(machine, code)).toContain('4 bytes allocated');
                const html = renderToStaticMarkup(<MemoryDump memoryData={bytes}
                    stackPointer={snapshot.memory.StackPointer} heapPointer={snapshot.memory.HeapPointer}
                    allocations={snapshot.memory.getAllocations()}/>);
                expect(html).toContain('41 42 43 00'); expect(html).toContain('ABC');
            }
        });
        expect(savedStep).toBeGreaterThan(0);
        expect(machine.getProgramSnapshot().memory.getHeapDump()).toHaveLength(0);
        // Released storage need not be zeroed; ownership and bytes are separate.
        expect(Array.from(machine.getProgramSnapshot().memory.getMemory().getMemory().slice(address,address+4)))
            .toEqual([65,66,67,0]);
        machine.programSetup();
        for (let i = 0; i < savedStep; i++) machine.stepProgram();
        expect(Buffer.from(machine.getProgramSnapshot().memory.getMemory().getMemory()).toString('hex')).toBe(savedBytes);
        expect(machine.getProgramSnapshot().memory.getHeapDump()[0].identifier).toBe('malloc_0');
    });
});
