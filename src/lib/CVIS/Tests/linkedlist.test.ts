import { describe, expect, it } from "vitest";
import { Scanner } from "@CParser/CScanner.ts";
import { Parser } from "@CParser/CParser.ts";
import { ProgramStateMachine } from "@CMachine/CMachine.ts";
import { L } from "vitest/dist/chunks/reporters.d.CfRkRKN2.js";

function runProgram(code: string){
  let output = "";
  const scanner = new Scanner(code);
  const parser = new Parser(scanner);
  const ast = parser.parse()
  const machine = new ProgramStateMachine(ast, (message: string) => {
    output += message;
  });
  machine.programSetup();
  machine.runProgram();

  return {machine, output};
}

// Testing what C-VIS can and cannot currently do regarding Linked Lists
describe ("Linked List baseline checks", () =>{
  it("accesses field inside struct using dot notation", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          };
        struct Node n;
        n.data = 20;
        printf("%d\\n", n.data);
        return 0;
      }`;
      const {output} = runProgram(code);
      expect(output).toBe("20\n");
  }); 

  it ("accesses struct from pointer with arrow notation", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          };
          struct Node n;
          struct Node *p = &n;
          p->data = 20;
          printf("%d\\n", n.data);
          return 0;
        }`;
        const {output} = runProgram(code);
        expect(output).toBe("20\n");
  }) 

  it ("declares a pointer to a struct variable", () => {
    const code = `
      int main() {
        struct Node {
          int data;
        };
        struct Node n;
        struct Node *p = &n;
        return 0;
      }`;
      expect(() => runProgram(code)).not.toThrow();
  }) 

  it ("prints a pointer to a struct variable", () => {
    const code = `
      int main() {
        struct Node {
          int data;
        };
        struct Node n;
        struct Node *p = &n;
        printf("%p\\n", p);
        return 0;
      }`;
      const { output } = runProgram(code);
      expect(output).toMatch(/^0x[0-9A-F]+\n$/);
  }) 

  it ("defines a linked list style node", () => {
    const code = `
      int main() {
        struct Node {
        int data;
        struct Node *next;
      };
        struct Node a;
        a.data = 1;
        printf("%d\\n", a.data);
        return 0;
    }`;
    const { output } = runProgram(code);
    expect(output).toBe("1\n");
  }) 

  it ("pointer fields inside structs function correctly", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node b;
        a.next = &b;
        printf("ok\\n");
        return 0;
    }`;
    const { output } = runProgram(code);
    expect(output).toBe("ok\n");
  }) 

  it ("checks whether heap allocation works for nodes", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        printf("%d\n", sizeof(struct Node));
        return 0;
    }`;
    const { output } = runProgram(code);
    expect(output).toBe("8\n");
  }) 

  it ("checks whether malloc works outside of defined struct", () => {
    const code = `
      int main() {
        int *p = malloc(sizeof(int));
        printf("%p\\n", p);
        return 0;
      }`;
    const { output } = runProgram(code);
    expect(output).toMatch(/^0x[0-9A-F]+\n$/);
  }) 

  it ("checks runtime during a memory leak", () => {
    const code = `
      int main() {
        int *p = malloc(sizeof(int));
        p = NULL;
        printf("done\\n");
        return 0;
      }`;
    const { output } = runProgram(code);
    expect(output).toBe("done\n");
  }) 

  // Testing free()
  it ("frees a simple heap allocation", () => {
    const code = `
      int main() {
        int *p = malloc(sizeof(int));
        free(p);
        printf("done\\n");
        return 0;
      }`;
  const { output } = runProgram(code);
  expect(output).toBe("done\n");
  });

  it ("does not free an invalid address", () => {
  const code = `
    int main() {
      int a = 5;
      free(&a);
      return 0;
    }`;
    expect(() => runProgram(code)).toThrow();
  });

  it ("does not accept to parse a struct with incorrect syntax", () => {
    const code = `
      int main() {
        struct Node {
          int data
        };
        return 0;
      }`;
    expect(() => runProgram(code)).toThrow();
  });
  
  it ("recognises NULL as a null pointer", () => {
    const code = `
      int main() {
        int *p = NULL;
        return 0;
      }`;
  expect(() => runProgram(code)).not.toThrow();
  });

  // NEW SET OF TESTS 

  it ("accesses next pointer using arrow notation", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node b;
        struct Node *head = &a;
        a.next = &b;
        printf("%p\\n", head->next);
        return 0;
      }`;
    const {output} = runProgram(code);
    expect(output).toMatch(/^0x[0-9A-F]+\n$/);
  });

  it("accesses chained arrow dereferences on stack nodes", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node b;
        struct Node *head = &a;
        a.next = &b;
        b.data = 42;
        printf("%d\\n", head->next->data);
        return 0;
      }`;
    const {output} = runProgram(code);
    expect(output).toBe("42\n");
  });

  it("writes onto fields of struct Node with heap allocation", () => {
    const code = `
      int main() {
      struct Node {
        int data;
        struct Node *next;
      };
      struct Node *head = malloc(sizeof(struct Node));
      head->data = 7;
      printf("%d\\n", head->data);
      return 0;
    }`;
    const {output} = runProgram(code);
    expect(output).toBe("7\n");
  });

  it("links two nodes that both have heap allocations", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node *head = malloc(sizeof(struct Node));
        struct Node *second = malloc(sizeof(struct Node));
        head->next = second;
        second->data = 99;
        printf("%d\\n", head->next->data);
        return 0;
      }`;
    const {output} = runProgram(code);
    expect(output).toBe("99\n");
  })

  // FINAL SET OF LINKED LISTS TESTS FOR INTERPRETER EXTENSIONS 
  it ("accesses data from a third node through chained next pointers", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node b;
        struct Node c;
        struct Node *head = &a;
        a.next = &b;
        b.next = &c;
        c.data = 20;
        printf("%d\\n", head->next->next->data);
        return 0;
      }`;
    const {output} = runProgram(code);
    expect(output).toBe("20\n");
  });

  it ("traverses list by reassigning a temporary pointer", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node b;
        struct Node *head = &a;
        struct Node *current = head;
        a.next = &b;
        b.data = 300;
        current = current->next;
        printf("%d\\n", current->data);
        return 0;
      }`;
    const{output}= runProgram(code);
    expect(output).toBe("300\n");
  });

  it ("accesses data from heap-allocated nodes through chained next pointers", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node *head = malloc(sizeof(struct Node));
        struct Node *second = malloc(sizeof(struct Node));
        struct Node *third = malloc(sizeof(struct Node));
        head->next = second;
        second->next = third;
        third->data = 100;
        printf("%d\\n", head->next->next->data);
        return 0;
      }`;
    const{output} = runProgram(code);
    expect(output).toBe("100\n");
  });

  it ("frees multiple linked list heap nodes correctly", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node *head = malloc(sizeof(struct Node));
        struct Node *second = malloc(sizeof(struct Node));
        head->next = second;
        free(second);
        free(head);
        printf("done\\n");
        return 0;
      }`;
    const{output} = runProgram(code);
    expect(output).toBe("done\n");
  });

  it ("ensures alias pointers are pointing to the same node", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node a;
        struct Node *head = &a;
        struct Node *alias = head;
        alias->data = 120;
        printf("%d\\n", head->data);
        return 0;
      }`;
    const{output} = runProgram(code);
    expect(output).toBe("120\n");
  });

  it ("sets pointer to NULL after freeing heap allocated memory", () => {
    const code = `
      int main() {
        struct Node {
          int data;
          struct Node *next;
        };
        struct Node *head = malloc(sizeof(struct Node));
        free(head);
        head = NULL;
        printf("done\\n");
        return 0;
      }`;
    const{output}= runProgram(code);
    expect(output).toBe("done\n");
  });

});
