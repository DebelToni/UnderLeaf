import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import { editorHistoryKeymap } from '../components/EditorPane';

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

describe('collaborative editor history', () => {
  it('handles undo and redo keyboard shortcuts through the Yjs undo manager', () => {
    const { view } = createEditor();
    view.dispatch({ changes: { from: 0, insert: 'local edit' } });

    expect(press(view, 'z')).toBe(true);
    expect(view.state.doc.toString()).toBe('');
    expect(press(view, 'y')).toBe(true);
    expect(view.state.doc.toString()).toBe('local edit');
  });

  it('undoes only local edits when a collaborator also changed the document', () => {
    const { view, doc, text } = createEditor();
    view.dispatch({ changes: { from: 0, insert: 'local' } });
    doc.transact(() => text.insert(text.length, ' remote'), Symbol('remote'));

    press(view, 'z');
    expect(view.state.doc.toString()).toBe(' remote');
  });
});

function createEditor() {
  const doc = new Y.Doc();
  const text = doc.getText('content');
  const undoManager = new Y.UndoManager(text);
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({
      extensions: [
        keymap.of(editorHistoryKeymap(true)),
        yCollab(text, null, { undoManager })
      ]
    }),
    parent
  });
  cleanup.push(() => { view.destroy(); doc.destroy(); parent.remove(); });
  return { view, doc, text };
}

function press(view: EditorView, key: string, shiftKey = false): boolean {
  const event = new KeyboardEvent('keydown', {
    key: shiftKey ? key.toUpperCase() : key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true
  });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}
