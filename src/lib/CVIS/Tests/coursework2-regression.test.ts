import {describe, expect, it} from 'vitest';
import {Scanner} from '@CParser/CScanner.ts';
import {Parser} from '@CParser/CParser.ts';
import {ProgramStateMachine} from '@CMachine/CMachine.ts';

function createMachine(code: string) {
    let output = '';
    const ast = new Parser(new Scanner(code)).parse();
    const machine = new ProgramStateMachine(ast, message => output += message);
    machine.programSetup();
    return {machine, output: () => output};
}

describe('Coursework 2 regressions', () => {
    it('uses C integer-division semantics while preserving floating-point division', () => {
        const {machine, output} = createMachine(`
            int main() {
                int integer_result = 5 / 2;
                float floating_result = 5.0 / 2;
                printf("%d\\n", integer_result);
                printf("%f\\n", floating_result);
                return integer_result;
            }
        `);

        expect(machine.runProgram()).toBe(2);
        expect(output()).toBe('2\n2.500000\n');
    });

    it('evaluates a function call inside a binary expression', () => {
        const {machine} = createMachine(`
            int copy_value(int x) { int y = x; return y; }
            int main() { int result = copy_value(5) + 4; return result; }
        `);

        expect(machine.runProgram()).toBe(9);
    });

    it('steps through a function call inside a binary expression', () => {
        const {machine} = createMachine(`
            int copy_value(int x) { int y = x; return y; }
            int main() { int result = copy_value(5) + 4; return 7; }
        `);

        let lastResult = null;
        let steps = 0;
        let maximumFrames = 0;
        let sawXEqualsFive = false;
        let sawYEqualsFive = false;
        while (machine.getProgramSnapshot().executionStack.length > 0 && steps < 100) {
            lastResult = machine.stepProgram();
            steps++;
            const snapshot = machine.getProgramSnapshot();
            maximumFrames = Math.max(maximumFrames, snapshot.callStack.length);
            for (const frame of snapshot.callStack) {
                const x = frame.variables.get('x');
                const y = frame.variables.get('y');
                if (x && snapshot.memory.readMemory(x.address, x.type) === 5) sawXEqualsFive = true;
                if (y && snapshot.memory.readMemory(y.address, y.type) === 5) sawYEqualsFive = true;
            }
        }

        expect(steps).toBeLessThan(100);
        expect(machine.getProgramSnapshot().executionStack).toHaveLength(0);
        expect(lastResult).toBe(7);
        expect(maximumFrames).toBe(2);
        expect(sawXEqualsFive).toBe(true);
        expect(sawYEqualsFive).toBe(true);
    });

    it('uses the explicit main return value after helper calls', () => {
        const {machine, output} = createMachine(`
            int my_floor(float value) {
                int int_part = (int)value;
                if (value < 0 && value != int_part) return int_part - 1;
                return int_part;
            }
            int is_leap_year(int year) {
                if (year % 400 == 0) return 1;
                if (year % 100 == 0) return 0;
                if (year % 4 == 0) return 1;
                return 0;
            }
            int main() {
                int day = 4; int month = 6; int year = 1945;
                float calculation = 30.6 * month - 91.4;
                int floor_result = my_floor(calculation);
                int ordinal_day = floor_result + day;
                if (is_leap_year(year)) ordinal_day += 60; else ordinal_day += 59;
                printf("Ordinal Date: %d-%d\\n", year, ordinal_day);
                return 7;
            }
        `);

        expect(machine.runProgram()).toBe(7);
        expect(output()).toBe('Ordinal Date: 1945-155\n');
    });

    it('runs the adapted combination triangle program', () => {
        const {machine, output} = createMachine(`
            int calc_factorial(int x) {
                int f = 1;
                int i;
                for (i = 1; i <= x; i++) { f *= i; }
                return f;
            }
            int calc_combination(int i, int j) {
                return calc_factorial(i) / (calc_factorial(j) * calc_factorial(i - j));
            }
            int main() {
                int rows = 5;
                int i;
                int j;
                for (i = rows - 1; i >= 0; i--) {
                    for (j = 0; j <= i; j++) printf("%d ", calc_combination(i, j));
                    printf("\n");
                }
                return 0;
            }
        `);

        expect(machine.runProgram()).toBe(0);
        expect(output()).toBe('1 4 6 4 1 \n1 3 3 1 \n1 2 1 \n1 1 \n1 \n');
    });
});
