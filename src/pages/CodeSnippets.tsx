import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Badge} from "@/components/ui/badge.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Link} from 'react-router-dom'

// New interface for longer code examples with multiple files
interface CodeSnippetFile {
    fileName: string;
    code: string;
}

interface CodeSnippet {
    id: number;
    title: string;
    description: string;
    code: string;
    executionCode?: string;
    files?: CodeSnippetFile[];
    tags?: string[];
}

const linkedListHeaderCode=
    `#ifndef _LINKED_LIST_H
    #define _LINKED_LIST_H

    typedef struct Node
    {
        void *data;
        struct Node *next;
        struct Node *prev;
    } Node;

    typedef struct LinkedList
    {
        Node *head;
        Node *tail;
    } LinkedList;

    Node *initialise_node(void);
    void free_node(Node *);
    LinkedList *initialise_linked_list(void);
    void free_linked_list(LinkedList *);
    void append_linked_list(LinkedList *, void *);
    void prepend_linked_list(LinkedList *, void *);
    void remove_head_linked_list(LinkedList *);
    void remove_tail_linked_list(LinkedList *);
    void print_linked_list(LinkedList *, void (*)(void *));
    void print_char(void *);
    void print_int(void *);
    void print_double(void *);
    void print_string(void *);

    #endif`;

const linkedListSourceCode =
    `#include "linked_list.h"

    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>

    Node *initialise_node(void)
    {
        Node *node;

        if(!(node = (Node *) malloc(sizeof(Node)))) {
            fprintf(stderr, "error: unable to initialise node.\\n");
            exit(EXIT_FAILURE);
        }
        node->next = node->prev = node->data = NULL;

        return node;
    }

    void free_node(Node *node)
    {
        if(!node)
            return;
        free(node);
    }

    LinkedList *initialise_linked_list(void)
    {
        LinkedList *list;

        if(!(list = (LinkedList *) malloc(sizeof(LinkedList)))) {
            fprintf(stderr, "error: unable to initialise linked list.\n");
            exit(EXIT_FAILURE);
        }
        list->head = list->tail = NULL;

        return list;
    }

    void free_linked_list(LinkedList *list)
    {
        Node *next;

        while(list->head) {
            next = list->head->next;
            free_node(list->head);
            list->head = next;
        }
        free(list);
    }

    void append_linked_list(LinkedList *list, void *data)
    {
        Node *node;

        node = initialise_node();

        node->data = data;
        node->prev = list->tail;
        if(list->tail) {
            list->tail->next = node;
        }
        list->tail = node;
        if(!list->head)
            list->head = node;
    }

    void prepend_linked_list(LinkedList *list, void *data)
    {
        Node *node;

        node = initialise_node();

        node->data = data;
        node->next = list->head;
        if(list->head) {
            list->head->prev = node;
        }
        list->head = node;
        if(!list->tail)
            list->tail = node;
    }

    void remove_head_linked_list(LinkedList *list)
    {
        Node *head;

        if(!list->head)
            return;
        head = list->head->next;
        free(list->head);
        list->head = head;
        if(list->head)
            list->head->prev = NULL;
        else
            list->tail = NULL;

    }

    void remove_tail_linked_list(LinkedList *list)
    {
        Node *tail;

        if(!list->tail)
            return;
        tail = list->tail->prev;
        free_node(list->tail);
        list->tail = tail;
        if(list->tail)
            list->tail->next = NULL;
        else
            list->head = NULL;
    }

    void print_linked_list(LinkedList *list, void (*print_func)(void *))
    {
        Node *next = list->head;

        while(next) {
            (*print_func)(next->data);
            next = next->next;
        }
    }

    void print_char(void *ptr)
    {
        printf("%c\n", *((char *) ptr));
    }

    void print_int(void *ptr)
    {
        printf("%d\n", *((int *) ptr));
    }

    void print_double(void *ptr)
    {
        printf("%f\n", *((double *) ptr));
    }

    void print_string(void *ptr)
    {
        printf("%s\n", (char *) ptr);
    }`;


const courseworkMainCode =
    `#include "linked_list.h"

    int main(void)
    {
        LinkedList *list = initialise_linked_list();

        int first = 10;
        int second = 20;
        int third = 30;

        append_linked_list(list, &first);
        append_linked_list(list, &second);
        prepend_linked_list(list, &third);

        remove_head_linked_list(list);
        remove_tail_linked_list(list);

        free_linked_list(list);

        return 0;
    }`;

const courseworkExecutionCode =
    `int main() {
        struct Node {
            int value;
            struct Node *next;
            struct Node *prev;
        };

        struct Node *head = malloc(sizeof(struct Node));
        struct Node *tail;
        struct Node *node;
        struct Node *temp;

        head->value = 10;
        head->prev = NULL;

        head->next = malloc(sizeof(struct Node));
        head->next->value = 20;
        head->next->prev = head;

        head->next->next = malloc(sizeof(struct Node));
        head->next->next->value = 30;
        head->next->next->prev = head->next;
        head->next->next->next = NULL;

        tail = head->next->next;

        temp = head;
        head = head->next;
        head->prev = NULL;
        free(temp);

        temp = tail;
        tail = tail->prev;
        tail->next = NULL;
        free(temp);

        return 0;
    }`;


const codeSnippets = [
    {
        id: 1,
        title: "Hello World",
        description: "A simple hello world program.",
        code:
            `int main() {
    printf("Hello, World!\n");
    return 0;
}`,
        tags: ["beginner"],
    },
    {
        id: 2,
        title: "Factorial Function",
        description: "A recursive function to calculate factorial in C.",
        code:
            `int factorial(int n) {
        if (n == 0) {
            return 1;
        }

        return n * factorial(n - 1);
    }

    int main() {
        int result = factorial(3);
        printf("factorial is %d\n", result);
        return 0;
    }`,
        tags: ["intermediate", 'recursion'],
    },
    {
        id: 3,
        title: "Basic Pointers",
        description: "A simple pointers program in C.",
        code:
            `int main() {
    int a = 5;
    int *ptr = &a;
    printf("Pointer value: %d\n", *ptr);
    *ptr = 1;
    printf("Pointer dereferenced value: %d\n", *ptr);
    return 0;
}`,
        tags: ["beginner", "pointers"],
    },
    {
        id: 4,
        title: "Simple multidimensional array",
        description: "A simple multidimensional array in C.",
        code:
            `int main() {
    int arr[3][4] = {{1, 2, 3, 4}, {5, 6, 7, 8}, {9, 10, 11, 12}};
    int *ptr = &arr[0][0];
    int *offset = ptr + 7;
    printf("Pointer offset value: %d\n", *offset);
    return 0;
}`,
        tags: ["intermediate", "pointers", "arrays"],
    },

    // Added new code snippets for extended Linked List capabilities 
    {
        id: 5,
        title: "Linked List: Single Node",
        description: "Creates one node on the heap and sets its fields.",
        code:
            `int main() {
        struct Node {
            int value;
            struct Node *next;
        };

        struct Node *head = malloc(sizeof(struct Node));
        head->value = 10;
        head->next = NULL;

        return 0;
}`,
        tags: ["beginner", "linked-list", "heap"],
    },
    {
        id: 6,
        title: "Linked List: Two Nodes",
        description: "Creates two nodes and links them together",
        code:
            `int main() {
        struct Node {
            int value;
            struct Node *next;
        };

        struct Node *head = malloc(sizeof(struct Node));
        head->value = 10;

        head->next = malloc(sizeof(struct Node));
        head->next->value = 20;
        head->next->next = NULL;

        return 0;
    }`,
        tags: ["beginner", "linked-list", "heap"],
    },
    {
        id: 7,
        title: "Linked List: Traversal",
        description: "Traverses a short linked list using a temporary pointer",
        code:
            `int main() {
        struct Node {
            int value;
            struct Node *next;
        };

        struct Node *head = malloc(sizeof(struct Node));
        struct Node *current;

        head->value = 10;
        head->next = malloc(sizeof(struct Node));
        head->next->value = 20;
        head->next->next = NULL;

        current = head;
        current = current->next;

        return 0;
    }`,
        tags: ["beginner", "linked-list", "traversal"],
    },
    {
        id: 8,
        title: "Linked List: Dangling Pointer",
        description: "Shows a pointer that still stores an address after the node is freed.",
        code:
            `int main() {
        struct Node {
            int value;
            struct Node *next;
        };

        struct Node *head = malloc(sizeof(struct Node));
        head->value = 10;
        head->next = NULL;

        free(head);

        return 0;
    }`,
        tags: ["intermediate", "linked-list", "memory"],
    },
    {
        id: 9,
        title: "Linked List: Delete and Relink",
        description: "Uses a temporary pointer to remove a middle node and relink the list.",
        code:
        `int main() {
            struct Node {
                int value;
                struct Node *next;
            };

            struct Node *head = malloc(sizeof(struct Node));
            struct Node *temp;

            head->value = 10;

            head->next = malloc(sizeof(struct Node));
            head->next->value = 20;

            head->next->next = malloc(sizeof(struct Node));
            head->next->next->value = 30;
            head->next->next->next = NULL;

            temp = head->next;
            head->next = head->next->next;
            free(temp);

            return 0;
    }`,
        tags: ["intermediate", "linked-list", "deletion"],    
    },

    {
        id: 10,
        title: "Linked List: Alias Tracking",
        description: "Shows that two pointer variables can store the same node address.",
        code:
            `int main() {
            struct Node {
                int value;
                struct Node *next;
            };

            struct Node *head = malloc(sizeof(struct Node));
            struct Node *temp;

            head->value = 10;
            head->next = NULL;

            temp = head;

            return 0;
        }`,
            tags: ["intermediate", "linked-list", "aliasing", "pointers"],
    },
    {
        id: 11,
        title: "Linked List: Insert Middle Node",
        description: "Inserts a new node between two existing linked list nodes.",
        code:`int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *newNode = malloc(sizeof(struct Node));

    head->value = 10;

    head->next = malloc(sizeof(struct Node));
    head->next->value = 30;
    head->next->next = NULL;

    newNode->value = 20;

    newNode->next = head->next;
    head->next = newNode;

    return 0;
}`,
        tags: ["intermediate", "linked-list", "insertion"],
    },
    {
        id: 12,
        title: "Linked List: Count Length",
        description: "Traverses a linked list and counts how many nodes it contains.",
        code:`int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *current;
    int count = 0;

    head->value = 10;

    head->next = malloc(sizeof(struct Node));
    head->next->value = 20;

    head->next->next = malloc(sizeof(struct Node));
    head->next->next->value = 30;
    head->next->next->next = NULL;

    current = head;

    while (current != NULL) {
        count++;
        current = current->next;
    }

    printf("Length: %d\\n", count);

    return 0;
}`,
        tags: ["beginner", "linked-list", "traversal", "counting"],
    },
    {
        id: 13,
        title: "COMP1005 Coursework: Multi-File Linked List",
        description: "A realistic COMP1005-style linked list example shown as linked_list.h, linked_list.c, and main.c.",
        code: courseworkExecutionCode,
        executionCode: courseworkExecutionCode,
        files:[
            {
                fileName: "linked_list.h",
                code: linkedListHeaderCode
            },
            {
                fileName: "linked_list.c",
                code: linkedListSourceCode
            },
            {
                fileName: "main.c",
                code: courseworkMainCode
            }
        ],
            tags: ["advanced", "linked-list", "coursework", "multi-file"],
    },
    {
        id: 14,
        title: "Loop Control: Continue",
        description: "Uses continue to skip one loop iteration.",
        code:`int main() {
    int i;

    for (i = 0; i < 5; i++) {
        if (i == 2) {
            continue;
        }

        printf("%d\\n", i);
    }

    return 0;
}`,
            tags: ["beginner", "loops", "continue", "control-flow"],
    },
    {
        id: 15,
        title: "Linked List: Free Whole List",
        description: "Traverses a linked list and frees each node.",
        code: `int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *temp;

    head->value = 10;

    head->next = malloc(sizeof(struct Node));
    head->next->value = 20;

    head->next->next = malloc(sizeof(struct Node));
    head->next->next->value = 30;
    head->next->next->next = NULL;

    while (head != NULL) {
        temp = head;
        head = head->next;
        free(temp);
    }

    return 0;
}`,
        tags: ["intermediate", "linked-list", "memory", "free"],
    },
    {
        id: 16,
        title: "Linked List: Search",
        description: "Traverses a linked list and searches for a value.",
        code: `int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *current;
    int found = 0;

    head->value = 10;

    head->next = malloc(sizeof(struct Node));
    head->next->value = 20;

    head->next->next = malloc(sizeof(struct Node));
    head->next->next->value = 30;
    head->next->next->next = NULL;

    current = head;

    while (current != NULL) {
        if (current->value == 20) {
            found = 1;
        }

        current = current->next;
    }

    printf("Found: %d\\n", found);

    return 0;
}`,
        tags: ["beginner", "linked-list", "search", "traversal"],
    },
    {
        id: 17,
        title: "Linked List: Insert At Head",
        description: "Adds a new node before the current head of the list.",
        code: `int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *newHead = malloc(sizeof(struct Node));

    head->value = 20;
    head->next = NULL;

    newHead->value = 10;
    newHead->next = head;
    head = newHead;

    return 0;
}`,
        tags: ["beginner", "linked-list", "insertion", "head"],
    },
    {
        id: 18,
        title: "Linked List: Remove Head",
        description: "Removes the first node and moves head to the next node.",
        code: `int main() {
    struct Node {
        int value;
        struct Node *next;
    };

    struct Node *head = malloc(sizeof(struct Node));
    struct Node *temp;

    head->value = 10;

    head->next = malloc(sizeof(struct Node));
    head->next->value = 20;
    head->next->next = NULL;

    temp = head;
    head = head->next;
    free(temp);

    return 0;
}`,
        tags: ["intermediate", "linked-list", "deletion", "head"],
    }


]


export const CodeSnippets = () => {

    const isDifficulty = (tag: string) => {
        return ['beginner', 'intermediate', 'advanced'].includes(tag);
    }

    // Helpers for multi-file code
    // Local storage changed to be id-specific, important if the snippet is one or multiple files
    const handleUseSnippet = (snippet: CodeSnippet) =>{
        if (snippet.files && snippet.files.length > 0){
            localStorage.setItem(`vids-selected-snippet-${snippet.id}`, JSON.stringify(snippet));
        }
    };

    const getSnippetLink = (snippet: CodeSnippet) =>{
        if (snippet.files && snippet.files.length > 0){
            return `/tool?snippet=${snippet.id}`;
        }
        return `/tool?code=${encodeURIComponent(snippet.code)}`;
    };

    // New local storage for longer files wirh multiple files
    return (
        <div className="p-6 space-y-6">
            <h2 className="text-2xl font-bold">Code Snippets</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {codeSnippets.map((snippet: CodeSnippet) => (
                    <Card key={snippet.id}>
                        <CardHeader className={"flex flex-row justify-between"}>
                            <div>
                                <CardTitle>
                                    {snippet.title}
                                </CardTitle>
                                <CardDescription>
                                    <p className="text-sm text-gray-500">{snippet.description}</p>
                                </CardDescription>
                            </div>

                            <Link to={getSnippetLink(snippet)}>
                                <Button
                                    variant="outline"
                                    className="ml-2"
                                    onClick={() => handleUseSnippet(snippet)}>
                                    Use
                                </Button>
                            </Link>

                        </CardHeader>
                        <CardContent>
                            <small>Preview</small>
                            <div className="mt-2 bg-gray-100 rounded-md p-4 min-h-[175px]">
                                <div
                                    className="overflow-hidden line-clamp-5 whitespace-pre-wrap">
                                    <code lang='c' className="p-0">
                                        {snippet.code}
                                    </code>
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter>
                            {snippet.tags && (
                                <div className="flex space-x-2">
                                    {snippet.tags?.map((tag, index) => (
                                        <Badge variant={isDifficulty(tag) ? "default" : "outline"} key={index}>
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </CardFooter>

                    </Card>
                ))}
            </div>
        </div>
    )
}