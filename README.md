# CVIS and ViDS: A Visual Learning Environment for Understanding C Memory Concepts

## Overview

The project extends the original CVIS tool with ViDS to allow for a higher-level visualisation layer for data structures such as linked lists.

CVIS provides the low-level view of the execution, including the stack, heap, memory dump.

ViDS uses the same virtual machine state by presents execution in a more conceptual way using nodes boxes, pointer labels, arrows, and explanations.
The aim is to help beginner C students understand how linked list operations relate to the memory state.

The project is split into two sections, the CVIS interpreter and the react frontend.

The main frontend is in src/pages and src/app.tsx

The interpreter is located in src/CVIS/\*

UI components in `src/components/ui` are imported from `shadcn/ui`.

## Current Features

* Step-by-step C execution
* Run, step forward, and step back navigation
* Low-level CVIS views for stack, heap, and memory dump
* Higher-level ViDS linked list view
* Pointer alias tracking
* Dangling pointer and unreachable node visualisation
* Multi-file snippet display with execution view
* Collapsible and resizable editor layout

## Usage

1. Open the snippets page and choose a snippet.
2. Click `Use` to load it into the visualisation tool.
3. Use `Run`, `Step Forward`, or `Step Back` to explore execution.
4. Switch between:

   * `CVIS` for low-level memory views
   * `ViDS` for the higher-level linked list view

## Current Limitations

* The parser does not fully support the complete C preprocessor or all library features.
* Multi-file snippets are displayed realistically, but the execution view is the version actually run by the tool.
* ViDS is currently designed mainly for linked list visualisation, so non-linked-list code is shown with less detail in the conceptual view.



# Installation

1. First install packages

```
npm install
```

2. To run prototype locally

```
npm run dev
```

This will start the frontend on the first available port.





\## Acknowledgements



The original CVIS project was developed by Ben McIlveen:

https://github.com/b-mcilveen/CVIS



A subsequent version of the project was developed by Tabitha Blindu. This fork

contains further extensions and evaluation completed by Jie Zeng as part of an

MSc dissertation project.



The project is distributed under the MIT License. See `LICENSE` for details.

