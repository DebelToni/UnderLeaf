import { autocompletion, closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { latex } from 'codemirror-lang-latex';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder
} from '@codemirror/view';
import { yCollab } from 'y-codemirror.next';
import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import type { ApiClient } from '../lib/api';
import { colorFor } from '../lib/format';
import { TicketedYProvider, type ConnectionStatus } from '../lib/y-provider';
import type { ProjectFile, User } from '../types';

export interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
}

export function EditorPane({
  api,
  projectHash,
  file,
  user,
  canWrite,
  dark,
  onPresence,
  onFlushReady
}: {
  api: ApiClient;
  projectHash: string;
  file: ProjectFile | null;
  user: User;
  canWrite: boolean;
  dark: boolean;
  onPresence: (users: PresenceUser[]) => void;
  onFlushReady: (flush: (() => Promise<void>) | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    if (!mount.current || !file || file.kind !== 'text') {
      onPresence([]);
      onFlushReady(null);
      return;
    }
    const themeCompartment = new Compartment();
    const readOnlyCompartment = new Compartment();
    themeCompartmentRef.current = themeCompartment;
    const doc = new Y.Doc();
    let provider: TicketedYProvider | null = null;
    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      highlightActiveLine(),
      closeBrackets(),
      autocompletion(),
      latex(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      placeholder('Start writing LaTeX…'),
      themeCompartment.of(editorTheme(dark)),
      readOnlyCompartment.of(EditorState.readOnly.of(true))
    ];

    let initialDoc = file.content ?? '';
    if (canWrite) {
      initialDoc = '';
      provider = new TicketedYProvider(api, projectHash, file.id, doc);
      provider.awareness.setLocalStateField('user', {
        id: user.id,
        name: user.displayName,
        color: colorFor(user.id),
        colorLight: `${colorFor(user.id)}33`
      });
      const undoManager = new Y.UndoManager(doc.getText('content'));
      extensions.push(yCollab(doc.getText('content'), provider.awareness, { undoManager }));
      const updatePresence = () => {
        const users: PresenceUser[] = [];
        for (const [clientId, state] of provider!.awareness.getStates()) {
          const person = state.user as { name?: string; color?: string } | undefined;
          if (person?.name) users.push({ clientId, name: person.name, color: person.color ?? colorFor(String(clientId)) });
        }
        onPresence(users);
      };
      provider.awareness.on('change', updatePresence);
      updatePresence();
    } else {
      extensions.push(history());
      onPresence([]);
    }

    const view = new EditorView({
      state: EditorState.create({ doc: initialDoc, extensions }),
      parent: mount.current
    });
    viewRef.current = view;
    const unsubscribe = provider?.subscribe((status) => {
      setConnection(status);
      view.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(!canWrite || status !== 'connected')) });
    });
    onFlushReady(provider ? () => provider!.flush() : null);

    return () => {
      unsubscribe?.();
      onFlushReady(null);
      provider?.destroy();
      view.destroy();
      viewRef.current = null;
      themeCompartmentRef.current = null;
      doc.destroy();
      onPresence([]);
    };
  }, [api, projectHash, file?.id, file?.content, canWrite, user.id, user.displayName, onPresence, onFlushReady]);

  useEffect(() => {
    const view = viewRef.current;
    const compartment = themeCompartmentRef.current;
    if (view && compartment) view.dispatch({ effects: compartment.reconfigure(editorTheme(dark)) });
  }, [dark]);

  if (!file) return <div className="editor-empty"><span>Select a file to begin.</span></div>;
  if (file.kind !== 'text') {
    return <div className="editor-empty"><span>{file.path} is a binary file. It is available to the compiler but cannot be edited here.</span></div>;
  }

  return (
    <div className="editor-pane">
      <div className="pane-label">
        <span>{file.path}</span>
        <span className={`connection connection--${connection}`}>{canWrite ? connection : 'read only'}</span>
      </div>
      <div ref={mount} className="editor-mount" />
    </div>
  );
}

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: dark ? '#ececef' : '#242529',
        backgroundColor: dark ? '#111214' : '#ffffff',
        fontSize: '13px'
      },
      '.cm-scroller': {
        fontFamily: 'var(--mono)',
        lineHeight: '1.65',
        overflow: 'auto'
      },
      '.cm-content': { padding: '20px 0 80px', caretColor: '#5e6ad2' },
      '.cm-line': { padding: '0 20px 0 8px' },
      '.cm-gutters': {
        backgroundColor: dark ? '#111214' : '#ffffff',
        color: dark ? '#555861' : '#b0b2b8',
        border: '0',
        paddingTop: '20px'
      },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: dark ? '#191a1d' : '#f7f7f8' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: '#5e6ad233 !important' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#5e6ad2' },
      '.cm-tooltip': {
        backgroundColor: dark ? '#191a1d' : '#ffffff',
        border: `1px solid ${dark ? '#303238' : '#e7e8eb'}`,
        borderRadius: '2px'
      }
    },
    { dark }
  );
}
