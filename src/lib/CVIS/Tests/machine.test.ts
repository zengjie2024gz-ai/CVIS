import {describe, it, expect} from 'vitest';
import * as AST from "@CParser/CAst.ts";
import {ProgramStateMachine} from "@CMachine/CMachine.ts";
import {Scanner} from "@CParser/CScanner.ts";
import {Parser} from "@CParser/CParser.ts";
import {readFileSync} from 'node:fs';

const anyLocation = {location: {line: expect.any(Number), column: expect.any(Number)}};

describe('Virtual Machine Integration Tests', () => {
    describe('Constructor', () => {
        it('should initialize with default values', () => {
            let output = '';
            const ast = {
                type: 'Program',
                globalDeclarations: [],
                statements: [],
                ...anyLocation
            } as AST.Program;

            const machine = new ProgramStateMachine(ast, (message: string) => {
                output += message;
            });

            expect(machine).toBeInstanceOf(ProgramStateMachine);
        });
    });

    describe('Basic Functionality', () => {
        it('should execute a simple program', () => {
            let output = "";
            const inputString = "int a = 3; char *b; int main() { char d = 'a'; double c = 2.0; b = &d; printf(\"%d\\n\", a); printf(\"%c\\n\", *b); printf(\"%f\\n\", c); printf(\"%d\\n\", sizeof(a)); printf(\"%d\\n\", sizeof(b)); printf(\"%d\\n\", sizeof(c)); printf(\"%d\\n\", sizeof(d)); }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('3\na\n2.000000\n4\n4\n8\n1\n');
        });

        it('should handle if, while, do while and for statements', () => {
            let output = "";
            const inputString = "int main() { int a = 3; char b = 'a'; double c = 2.0; int i; if (a > 2) { printf(\"%d\\n\", a); } while (a < 5) { printf(\"%d\\n\", a); a++; } do { printf(\"%d\\n\", a); a--; } while (a > 1); for (i = 0; i < 5; i++) { printf(\"%d\\n\", i); } return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('3\n3\n4\n5\n4\n3\n2\n1\n0\n1\n2\n3\n4\n');

        });

        it('should handle basic arrays', () => {
            let output = "";
            const inputString = "int main() { int arr[5] = {1, 2, 3, 4, 5}; int i; for (i = 0; i < 5; i++) { printf(\"%d\\n\", arr[i]); } return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('1\n2\n3\n4\n5\n');
        });

        it('should handle multidimensional arrays', () => {
            let output = "";
            const inputString = "int main() { int arr[2][3] = {{1, 2, 3}, {4, 5, 6}}; int i, j; for (i = 0; i < 2; i++) { for (j = 0; j < 3; j++) { printf(\"%d\\n\", arr[i][j]); } } return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('1\n2\n3\n4\n5\n6\n');
        });

        it('should handle structs', () => {
            let output = "";
            const inputString = " int main() { struct Point { int x; int y; }; struct Point p; p.x = 5; p.y = 10; printf(\"%d\\n\", p.x); printf(\"%d\\n\", p.y); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('5\n10\n');
        });

        it('should handle switch/case statements', () => {
            let output = "";
            const inputString = "int foo(char x) { switch(x) { case 'A': return 65; case 'B': return 66; case 'C': return 67; default: return 0; } } int main() { int c = foo('A'); c++; --c; printf(\"Ascii %d\\n\",c); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();
            expect(output).toEqual('Ascii 65\n');
        });

        it('should handle an array of strings', () => {
            let output = "";
            const inputString = "int main() { char *arr[3] = {\"Hello\", \"World\", \"!\"}; int i; for (i = 0; i < 3; i++) { printf(\"%s\\n\", arr[i]); } return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('Hello\nWorld\n!\n');
        });

        it('should handle simple strings', () => {
            let output = "";
            const inputString = "int main() { char str[] = \"Hello World\"; printf(\"%s\\n\", str); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('Hello World\n');

        });

        it('should index char arrays using a one-byte stride', () => {
            let output = "";
            const inputString = "int main() { char name[] = \"Alice\"; printf(\"%c%c%c%c%c\\n\", name[0], name[1], name[2], name[3], name[4]); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('Alice\n');
        });

        it('should support sqrt', () => {
            let output = "";
            const inputString = "int main() { double result = sqrt(16.0); printf(\"%.2f\\n\", result); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('4.00\n');
        });

        it('should support strcmp for char arrays', () => {
            let output = "";
            const inputString = "int main() { char first[] = \"Alice\"; char second[] = \"Alice\"; char third[] = \"Alicia\"; printf(\"%d %d\\n\", strcmp(first, second), strcmp(first, third)); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('0 -4\n');
        });

        it('should read coursework CSV rows through FILE and fgets', () => {
            let output = "";
            const inputString = `
                int main() {
                    FILE *file;
                    char line[64];
                    file = fopen("class01_students.csv", "r");
                    fgets(line, 64, file);
                    printf("%s", line);
                    fgets(line, 64, file);
                    printf("%s", line);
                    fclose(file);
                    return 0;
                }`;
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('id,last_name,first_name\n3444670,Hurrington,Sherri\n');
        });

        it('should return NULL at EOF and allow rewinding a coursework file', () => {
            let output = "";
            const inputString = `
                int main() {
                    FILE *file;
                    char line[64];
                    int rows;
                    rows = 0;
                    file = fopen("class01_activity01.csv", "r");
                    while (fgets(line, 64, file) != NULL) {
                        rows = rows + 1;
                    }
                    rewind(file);
                    fgets(line, 64, file);
                    printf("rows = %d\\n", rows);
                    printf("header = %s", line);
                    fclose(file);
                    return 0;
                }`;
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('rows = 9\nheader = id,grade\n');
        });

        it('should parse a CSV grade using strcspn, strtok and atoi', () => {
            let output = "";
            const inputString = `
                int main() {
                    char line[] = "3444670,30\\n";
                    char *token;
                    int grade;
                    line[strcspn(line, "\\n")] = '\\0';
                    token = strtok(line, ",");
                    token = strtok(NULL, ",");
                    grade = atoi(token);
                    printf("grade = %d\\n", grade);
                    return 0;
                }`;
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('grade = 30\n');
        });

        it('should calculate Coursework 4 Task 1 statistics from a virtual CSV', () => {
            let output = "";
            const inputString = `
                int main() {
                    FILE *file;
                    char line[64];
                    char *token;
                    int grades[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                    int total;
                    int recorded;
                    int absent;
                    int sum;
                    int i;
                    double mean;
                    double difference;
                    double variance;
                    double standard_deviation;

                    total = 10;
                    recorded = 0;
                    sum = 0;
                    variance = 0.0;
                    file = fopen("class01_activity01.csv", "r");
                    fgets(line, 64, file);

                    while (fgets(line, 64, file) != NULL) {
                        line[strcspn(line, "\\n")] = '\\0';
                        token = strtok(line, ",");
                        token = strtok(NULL, ",");
                        grades[recorded] = atoi(token);
                        recorded = recorded + 1;
                    }
                    fclose(file);

                    absent = total - recorded;
                    for (i = 0; i < total; i++) {
                        sum = sum + grades[i];
                    }
                    mean = sum / 10.0;
                    for (i = 0; i < total; i++) {
                        difference = grades[i] - mean;
                        variance = variance + difference * difference;
                    }
                    standard_deviation = sqrt(variance / 9.0);

                    printf("total students = %d\\n", total);
                    printf("absent students = %d\\n", absent);
                    printf("grade mean = %.2f\\n", mean);
                    printf("grade sd = %.2f\\n", standard_deviation);
                    return 0;
                }`;
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual(
                'total students = 10\n' +
                'absent students = 2\n' +
                'grade mean = 44.00\n' +
                'grade sd = 31.77\n'
            );
        });

        it('should match Coursework 4 Task 2 students and activity grades', () => {
            let output = "";
            const inputString = readFileSync(
                new URL('../../../../CW4_TASK2_DEMO.c', import.meta.url),
                'utf8'
            );
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual(
                'Sherri Hurrington 30\n' +
                'William Rich 0\n' +
                'Erin Simmons 16\n' +
                'Antonio Levi 75\n' +
                'Mabel Henderson 41\n' +
                'Paula Coffey 62\n' +
                'Tom Green 56\n' +
                'Hazel Willis 70\n' +
                'Marty Osterberg 0\n' +
                'Nancy Winders 90\n'
            );
        });

        it('should write and reopen a virtual CSV with fprintf', () => {
            let output = "";
            const inputString = `
                int main() {
                    FILE *file;
                    char line[64];
                    file = fopen("results.csv", "w");
                    fprintf(file, "id,average\\n");
                    fprintf(file, "%d,%.2f\\n", 101, 37.0);
                    fclose(file);
                    file = fopen("results.csv", "r");
                    while (fgets(line, 64, file) != NULL) {
                        printf("%s", line);
                    }
                    fclose(file);
                    return 0;
                }`;
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('id,average\n101,37.00\n');
        });

        it('should generate and update Coursework 4 Task 3 results CSV files', () => {
            let output = "";
            const inputString = readFileSync(
                new URL('../../../../CW4_TASK3_DEMO.c', import.meta.url),
                'utf8'
            );
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual(
                'id,last_name,first_name,average,grade01,grade02\n' +
                '3444670,Hurrington,Sherri,37.00,30,44\n' +
                '3611390,Rich,William,0.00,0,0\n' +
                '2939734,Simmons,Erin,45.50,16,75\n' +
                '288301,Levi,Antonio,86.00,75,97\n' +
                '1295620,Henderson,Mabel,35.00,41,29\n' +
                '757790,Coffey,Paula,75.50,62,89\n' +
                '3149175,Green,Tom,59.00,56,62\n' +
                '3173019,Willis,Hazel,80.00,70,90\n' +
                '2890792,Osterberg,Marty,6.50,0,13\n' +
                '1274266,Winders,Nancy,62.00,90,34\n'
            );
        });

        it('should handle typecasting', () => {
            let output = "";
            const inputString = "int main() { int a = 5; double b = (double)a; printf(\"%f\\n\", b); return 0; }";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            machine.programSetup();
            machine.runProgram();

            expect(output).toEqual('5.000000\n');
        });



    });

    describe('Common Errors', () => {
        it('should throw an error for no main entry', () => {
            let output = "";
            const inputString = "int a = 3; char b = 'a';";
            const scanner = new Scanner(inputString);
            const parser = new Parser(scanner);
            const ast = parser.parse();
            const machine = new ProgramStateMachine(ast, (message: string) => output += message);

            expect(() => {
                machine.programSetup();
                machine.runProgram();
            }).toThrowError("Execution Error: Main function not found, entry invalid");
        });
    });
});
