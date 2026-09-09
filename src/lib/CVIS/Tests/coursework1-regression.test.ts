import {describe, expect, it} from 'vitest';
import {Scanner} from '@CParser/CScanner.ts';
import {Parser} from '@CParser/CParser.ts';
import {ProgramStateMachine} from '@CMachine/CMachine.ts';

function execute(code: string) {
    let output = '';
    const ast = new Parser(new Scanner(code)).parse();
    const machine = new ProgramStateMachine(ast, message => output += message);
    machine.programSetup();
    const result = machine.runProgram();
    return {result, output};
}

describe('Coursework 1 regressions', () => {
    it('ignores include directives and supports printf float precision', () => {
        const {result, output} = execute(`
            #include <stdio.h>
            int main() {
                double value = 0.345;
                printf("value=%.2f\\n", value);
                return 0;
            }
        `);

        expect(result).toBe(0);
        expect(output).toBe('value=0.34\n');
    });

    it('runs the original Drake-equation coursework program', () => {
        const {result, output} = execute(`
            #include <stdio.h>
            int drake_equation(double r_star, double f_p, int n_e,
                               double f_l, double f_i, double f_c, int L) {
                double n_val = r_star * f_p * (double)n_e * f_l * f_i * f_c * (double)L;
                return (int)n_val;
            }
            int main() {
                int n1 = drake_equation(1.0, 0.2, 1, 1.0, 1.0, 0.345, 1000);
                printf("N=%d R*=%.2f fp=%.2f ne=%d fl=%.2f fi=%.2f fc=%.2f L=%d\\n",
                       n1, 1.0, 0.2, 1, 1.0, 1.0, 0.345, 1000);
                int n2 = drake_equation(1.0, 0.422, 5, 1.0, 1.0, 0.2, 1000000000);
                printf("N=%d R*=%.2f fp=%.2f ne=%d fl=%.2f fi=%.2f fc=%.2f L=%d\\n",
                       n2, 1.0, 0.422, 5, 1.0, 1.0, 0.2, 1000000000);
                return 0;
            }
        `);

        expect(result).toBe(0);
        expect(output).toBe(
            // GCC -std=c11 -O0 gives 68: the left-associated floating product
            // is just below 69 before the explicit truncating int conversion.
            'N=68 R*=1.00 fp=0.20 ne=1 fl=1.00 fi=1.00 fc=0.34 L=1000\n' +
            'N=422000000 R*=1.00 fp=0.42 ne=5 fl=1.00 fi=1.00 fc=0.20 L=1000000000\n'
        );
    });
});
