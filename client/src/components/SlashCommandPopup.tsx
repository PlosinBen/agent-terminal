import { useEffect, useRef } from 'react';
import type { CommandDef, CommandOption } from '../commands';
import './SlashCommandPopup.css';

interface Props {
  commands: CommandDef[];
  filter: string;
  selectedIndex: number;
  mode: 'command' | 'argument';
  options?: CommandOption[];
  onSelect: (index: number, execute: boolean) => void;
}

export function SlashCommandPopup({ commands, filter, selectedIndex, mode, options, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('.slash-item-selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (mode === 'argument' && options) {
    const filtered = filter
      ? options.filter(o => o.value.toLowerCase().includes(filter.toLowerCase()) || o.label.toLowerCase().includes(filter.toLowerCase()))
      : options;

    if (filtered.length === 0) return null;

    return (
      <div className="slash-popup" ref={listRef}>
        {filtered.map((opt, i) => (
          <div
            key={opt.value}
            className={`slash-item ${i === selectedIndex ? 'slash-item-selected' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); onSelect(i, true); }}
          >
            <span className="slash-item-name">{opt.value}</span>
            {opt.label !== opt.value && <span className="slash-item-desc">{opt.label}</span>}
          </div>
        ))}
      </div>
    );
  }

  const filtered = filter
    ? commands.filter(c => c.name.toLowerCase().startsWith(filter.toLowerCase()))
    : commands;

  if (filtered.length === 0) return null;

  return (
    <div className="slash-popup" ref={listRef}>
      {filtered.map((cmd, i) => (
        <div
          key={cmd.name}
          className={`slash-item ${i === selectedIndex ? 'slash-item-selected' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(i, true); }}
        >
          <span className="slash-item-name">/{cmd.name}</span>
          <span className="slash-item-desc">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}
