import {FC, useEffect, useState} from "react";
import {Editor, useMonaco} from "@monaco-editor/react";

interface OwnProps {
    setCodeRaw: Function;
    codeRaw: string;
    highlightLine: number | null;
    readOnly?: boolean;
}

type Props = OwnProps;

// Allows editor to be reused within the tool
export const EditorWindow: FC<Props> = (props) => {
    // Stores editor instance and current line highlight
    const [editorInstance, setEditorInstance] = useState<any>(null);
    const [decoration, setDecoration] = useState<string[]>(null);

    const monaco = useMonaco();

    const handleEditorDidMount = (editor: any, monaco: any) => {
        setEditorInstance(editor);
    }

    useEffect(() => {
        if (!editorInstance || !monaco || props.highlightLine === null){
            return;
        }

        try {
            const alterDecoration = editorInstance.deltaDecorations(decoration || [], [
                {
                    range: new monaco.Range(props.highlightLine, 1, props.highlightLine, 1),
                    options: {
                        isWholeLine: true,
                        className: 'highlight-line',
                    },
                },
            ]);

            setDecoration(alterDecoration);
        } catch (e) {
            console.error(e);
        }


    }, [props.highlightLine, editorInstance, monaco]);

    const handleChange = (value: string | undefined) => {
        if (props.readOnly) {
            return;
        }
        props.setCodeRaw(value || "");
    };

    return (
        <div className="h-full w-full">
            <Editor
                defaultLanguage="c"
                height="100%"
                theme="vs-light"
                value={props.codeRaw}
                onChange={handleChange}
                onMount={handleEditorDidMount}
                options ={{
                    readOnly: props.readOnly || false
                }}
            />
        </div>
    );
};
