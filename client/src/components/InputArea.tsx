import { useState, useRef, useCallback, useEffect, useMemo, type KeyboardEvent, type ClipboardEvent } from 'react';
import type { ProviderConfig } from '../types/message';
import { buildCommandList, type CommandDef, type CommandOption } from '../commands';
import { SlashCommandPopup } from './SlashCommandPopup';
import './InputArea.css';

interface Props {
  disabled: boolean;
  cwd?: string;
  providerConfig?: ProviderConfig | null;
  onSubmit: (text: string, images?: string[]) => void;
  onStop: () => void;
  onCommand: (command: string, args: string) => void;
}

export function InputArea({ disabled, cwd, providerConfig, onSubmit, onStop, onCommand }: Props) {
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [escPending, setEscPending] = useState(false);
  const escPendingRef = useRef(false);
  const escTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupMode, setPopupMode] = useState<'command' | 'argument'>('command');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<CommandDef | null>(null);

  const commands = useMemo(() => buildCommandList(providerConfig), [providerConfig]);

  // Compute filtered lists for keyboard navigation
  const getFilteredCommands = useCallback((text: string) => {
    const filter = text.startsWith('/') ? text.slice(1) : '';
    return filter
      ? commands.filter(c => c.name.toLowerCase().startsWith(filter.toLowerCase()))
      : commands;
  }, [commands]);

  const getFilteredOptions = useCallback((filter: string, options?: CommandOption[]) => {
    if (!options) return [];
    return filter
      ? options.filter(o => o.value.toLowerCase().includes(filter.toLowerCase()) || o.label.toLowerCase().includes(filter.toLowerCase()))
      : options;
  }, []);

  // Delay focus to avoid Electron Chromium injecting '\n' into textarea
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  // Reset escPending when agent stops
  useEffect(() => {
    if (!disabled) {
      escPendingRef.current = false;
      setEscPending(false);
      if (escTimerRef.current) {
        clearTimeout(escTimerRef.current);
        escTimerRef.current = null;
      }
    }
  }, [disabled]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const focusTextarea = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const closePopup = useCallback(() => {
    setShowPopup(false);
    setPopupMode('command');
    setSelectedIndex(0);
    setSelectedCommand(null);
  }, []);

  const handleChange = useCallback((value: string) => {
    setInput(value);

    if (popupMode === 'command') {
      if (value.startsWith('/') && !value.includes(' ')) {
        setShowPopup(true);
        setSelectedIndex(0);
      } else if (!value.startsWith('/')) {
        closePopup();
      }
    } else if (popupMode === 'argument' && selectedCommand) {
      const prefix = `/${selectedCommand.name} `;
      if (value.startsWith(prefix)) {
        setSelectedIndex(0);
      } else {
        closePopup();
      }
    }
  }, [popupMode, selectedCommand, closePopup]);

  const executeCommand = useCallback((command: string, args: string) => {
    onCommand(command, args);
    setInput('');
    closePopup();
    focusTextarea();
  }, [onCommand, closePopup, focusTextarea]);

  const selectCommand = useCallback((cmd: CommandDef, execute: boolean) => {
    if (cmd.options && cmd.options.length > 0) {
      // Enter argument mode (both Tab and Enter)
      setPopupMode('argument');
      setSelectedCommand(cmd);
      setSelectedIndex(0);
      setInput(`/${cmd.name} `);
    } else if (execute) {
      executeCommand(cmd.name, '');
    } else {
      // Tab: fill in command text, close popup
      setInput(`/${cmd.name} `);
      closePopup();
    }
  }, [executeCommand, closePopup]);

  const selectOption = useCallback((opt: CommandOption, execute: boolean) => {
    if (!selectedCommand) return;
    if (execute) {
      executeCommand(selectedCommand.name, opt.value);
    } else {
      // Tab: fill in full command, close popup
      setInput(`/${selectedCommand.name} ${opt.value}`);
      closePopup();
    }
  }, [selectedCommand, executeCommand, closePopup]);

  const handlePopupSelect = useCallback((index: number, execute: boolean) => {
    if (popupMode === 'command') {
      const filtered = getFilteredCommands(input);
      const cmd = filtered[index];
      if (cmd) selectCommand(cmd, execute);
    } else if (popupMode === 'argument' && selectedCommand) {
      const prefix = `/${selectedCommand.name} `;
      const argFilter = input.startsWith(prefix) ? input.slice(prefix.length) : '';
      const filtered = getFilteredOptions(argFilter, selectedCommand.options);
      const opt = filtered[index];
      if (opt) selectOption(opt, execute);
    }
  }, [popupMode, input, selectedCommand, getFilteredCommands, getFilteredOptions, selectCommand, selectOption]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (showPopup) {
        e.preventDefault();
        closePopup();
        return;
      }
      if (disabled) {
        e.preventDefault();
        if (escPendingRef.current) {
          if (escTimerRef.current) clearTimeout(escTimerRef.current);
          escPendingRef.current = false;
          setEscPending(false);
          onStop();
        } else {
          escPendingRef.current = true;
          setEscPending(true);
          escTimerRef.current = setTimeout(() => {
            escPendingRef.current = false;
            setEscPending(false);
          }, 1500);
        }
        return;
      }
    }

    if (showPopup) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const count = popupMode === 'command'
          ? getFilteredCommands(input).length
          : getFilteredOptions(
              input.slice(`/${selectedCommand?.name ?? ''} `.length),
              selectedCommand?.options,
            ).length;
        setSelectedIndex(i => (i + 1) % Math.max(count, 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const count = popupMode === 'command'
          ? getFilteredCommands(input).length
          : getFilteredOptions(
              input.slice(`/${selectedCommand?.name ?? ''} `.length),
              selectedCommand?.options,
            ).length;
        setSelectedIndex(i => (i - 1 + Math.max(count, 1)) % Math.max(count, 1));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        // Only intercept if there are filtered results to select
        const count = popupMode === 'command'
          ? getFilteredCommands(input).length
          : getFilteredOptions(
              input.slice(`/${selectedCommand?.name ?? ''} `.length),
              selectedCommand?.options,
            ).length;
        if (count > 0) {
          e.preventDefault();
          handlePopupSelect(selectedIndex, e.key === 'Enter');
          return;
        }
        // No matches — close popup and fall through to normal submit
        closePopup();
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const trimmed = input.trim();
      if ((trimmed || images.length > 0) && !disabled) {
        onSubmit(trimmed, images.length > 0 ? images : undefined);
        setInput('');
        setImages([]);
        closePopup();
        focusTextarea();
      }
    }
  }, [input, disabled, showPopup, popupMode, selectedIndex, selectedCommand, onSubmit, onStop, closePopup, getFilteredCommands, getFilteredOptions, handlePopupSelect]);

  const handlePaste = useCallback((e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImages(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const popupFilter = popupMode === 'command'
    ? (input.startsWith('/') ? input.slice(1) : '')
    : (selectedCommand ? input.slice(`/${selectedCommand.name} `.length) : '');

  return (
    <div className="input-area">
      {showPopup && (
        <SlashCommandPopup
          commands={commands}
          filter={popupFilter}
          selectedIndex={selectedIndex}
          mode={popupMode}
          options={selectedCommand?.options}
          onSelect={handlePopupSelect}
        />
      )}
      {escPending && (
        <div className="esc-hint">Press Esc again to stop agent</div>
      )}
      {images.length > 0 && (
        <div className="image-badge">
          {images.length} image{images.length > 1 ? 's' : ''} attached
          <button className="image-badge-clear" onClick={() => setImages([])}>×</button>
        </div>
      )}
      <span className="input-prompt">&gt;</span>
      <textarea
        ref={textareaRef}
        className="input-field"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Agent is running... (Esc to stop)' : 'Ask something...'}
        rows={1}
      />
    </div>
  );
}
