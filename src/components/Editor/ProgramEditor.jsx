import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const OPCODES = [
  'ADD','SUB','MUL','DIV','MOD','ABS','NEG','MAX','MIN',
  'DUP','POP','DROP','SWAP','OVER','ROT',
  'AND','OR','NOT','XOR',
  'IF','ELSE','ENDIF','LOOP','POOL','GOTO','CALL','RETURN',
  'STORE','RECALL',
];

const REGISTERS = [
  'ENERGY','ARMOR','HEAT','RANGE','RADAR','SPEEDX','SPEEDY',
  'POSX','POSY','COLLISION','STUNNED','TEAMMATES','RANDOM','TIME',
  'SHIELD','GUNX','GUNY','FIRE','THRUSTX','THRUSTY','BRAKE','BEEP','AIM',
];

const roboWarLang = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/;.*/))  return 'comment';
    if (stream.match(/#DEFINE\b/)) return 'meta';
    if (stream.match(/-?\d+/)) return 'number';

    // Labels (FOO:)
    if (stream.match(/[A-Z_][A-Z0-9_]*:/i)) return 'labelName';

    // Operators
    if (stream.match(/<=|>=|<>|[+\-*\/=<>]/)) return 'operator';

    // Identifiers — check against known lists
    const word = stream.match(/[A-Z_][A-Z0-9_]*/i);
    if (word) {
      const tok = word[0].toUpperCase();
      if (OPCODES.includes(tok))    return 'keyword';
      if (REGISTERS.includes(tok))  return 'variableName';
      return 'name';
    }

    stream.next();
    return null;
  },
});

const rwTheme = HighlightStyle.define([
  { tag: tags.comment,      color: '#6e7681' },
  { tag: tags.keyword,      color: '#ff7b72' },
  { tag: tags.variableName, color: '#79c0ff' },
  { tag: tags.number,       color: '#f2cc60' },
  { tag: tags.operator,     color: '#ffa657' },
  { tag: tags.meta,         color: '#d2a8ff' },
  { tag: tags.labelName,    color: '#a5d6ff' },
  { tag: tags.name,         color: '#e6edf3' },
]);

const editorTheme = EditorView.theme({
  '&': { backgroundColor: '#0d1117', height: '100%' },
  '.cm-gutters': { backgroundColor: '#161b22', borderRight: '1px solid #30363d', color: '#6e7681' },
  '.cm-activeLineGutter': { backgroundColor: '#1c2128' },
  '.cm-activeLine': { backgroundColor: '#1c2128' },
  '.cm-cursor': { borderLeftColor: '#58a6ff' },
  '.cm-selectionBackground': { backgroundColor: '#264f78 !important' },
});

export default function ProgramEditor({ value, onChange, errors }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, indentWithTab]),
          roboWarLang,
          syntaxHighlighting(rwTheme),
          editorTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.lineWrapping,
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []); // eslint-disable-line

  // Sync external value changes (e.g. loading a different robot)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div className="program-panel">
      <div ref={containerRef} className="cm-wrapper" style={{ flex: 1, minHeight: 0 }} />
      {errors && errors.length > 0 && (
        <div className="error-panel">
          {errors.map((e, i) => <div key={i} className="error-line">⚠ {e}</div>)}
        </div>
      )}
    </div>
  );
}
