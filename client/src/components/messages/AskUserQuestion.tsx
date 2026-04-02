import { useState, useEffect, useCallback } from 'react';
import type { PermissionReq } from '../../types/message';
import type { PermissionResponse } from './PermissionBanner';
import './AskUserQuestion.css';

interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface Props {
  req: PermissionReq;
  onRespond: (response: PermissionResponse) => void;
}

/** Get display text for a completed answer */
function answerLabel(q: Question, sel: Set<number>, otherText?: string): string {
  if (sel.has(q.options.length)) return otherText ? `Other: ${otherText}` : 'Other';
  return [...sel].map(i => q.options[i]?.label).filter(Boolean).join(', ');
}

export function AskUserQuestion({ req, onRespond }: Props) {
  const questions: Question[] = (req.input?.questions as Question[]) ?? [];

  // Current step (which question is active)
  const [step, setStep] = useState(0);
  // Per-question selection state: Map<questionIndex, Set<optionIndex>>
  const [selections, setSelections] = useState<Map<number, Set<number>>>(() => new Map());
  // Per-question "Other" text
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() => new Map());
  // Keyboard focus within current question's options
  const [focusIdx, setFocusIdx] = useState(0);

  // Reset when new request arrives
  useEffect(() => {
    setStep(0);
    setSelections(new Map());
    setOtherTexts(new Map());
    setFocusIdx(0);
  }, [req.requestId]);

  // Reset focus when step changes
  useEffect(() => { setFocusIdx(0); }, [step]);

  const currentQ = questions[step] as Question | undefined;

  const toggleOption = useCallback((oIdx: number) => {
    if (!currentQ) return;
    const qIdx = step;

    setSelections(prev => {
      const next = new Map(prev);
      const current = new Set(next.get(qIdx) ?? []);

      if (oIdx === currentQ.options.length) {
        if (!currentQ.multiSelect) current.clear();
        if (current.has(oIdx)) current.delete(oIdx);
        else current.add(oIdx);
      } else if (currentQ.multiSelect) {
        current.delete(currentQ.options.length);
        if (current.has(oIdx)) current.delete(oIdx);
        else current.add(oIdx);
      } else {
        current.clear();
        current.add(oIdx);
      }

      next.set(qIdx, current);
      return next;
    });
  }, [currentQ, step]);

  const submitAll = useCallback(() => {
    const answers: Record<string, string> = {};
    const annotations: Record<string, { notes?: string }> = {};

    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi];
      const sel = selections.get(qi);
      if (!sel || sel.size === 0) continue;

      const isOther = sel.has(q.options.length);
      if (isOther) {
        const text = otherTexts.get(qi) ?? '';
        answers[q.question] = 'Other';
        annotations[q.question] = { notes: text };
      } else {
        const labels = [...sel].map(i => q.options[i]?.label).filter(Boolean);
        answers[q.question] = labels.join(', ');
      }
    }

    onRespond({
      result: {
        behavior: 'allow',
        updatedInput: { ...req.input, answers, annotations },
      },
    });
  }, [questions, selections, otherTexts, req.input, onRespond]);

  /** Advance to next question, or submit if last */
  const next = useCallback(() => {
    const sel = selections.get(step);
    if (!sel || sel.size === 0) return; // must select something
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      submitAll();
    }
  }, [step, questions.length, selections, submitAll]);

  /** Go back to previous question */
  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  // Keyboard navigation (scoped to current question)
  useEffect(() => {
    if (!currentQ) return;
    const optionCount = currentQ.options.length + 1; // +1 for Other

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        if (e.key === 'Enter') { e.preventDefault(); next(); }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIdx(prev => (prev > 0 ? prev - 1 : optionCount - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIdx(prev => (prev < optionCount - 1 ? prev + 1 : 0));
      } else if (e.key === ' ') {
        e.preventDefault();
        toggleOption(focusIdx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'Backspace' || e.key === 'ArrowLeft') {
        prev();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentQ, focusIdx, toggleOption, next, prev]);

  if (questions.length === 0 || !currentQ) return null;

  const currentSel = selections.get(step) ?? new Set<number>();
  const hasSelection = currentSel.size > 0;
  const isLast = step === questions.length - 1;

  return (
    <div className="ask-user-question">
      {/* Completed answers summary */}
      {step > 0 && (
        <div className="auq-completed">
          {questions.slice(0, step).map((q, qi) => {
            const sel = selections.get(qi) ?? new Set<number>();
            return (
              <div key={qi} className="auq-completed-row" onClick={() => setStep(qi)}>
                <span className="auq-completed-header">{q.header}</span>
                <span className="auq-completed-answer">{answerLabel(q, sel, otherTexts.get(qi))}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress indicator */}
      {questions.length > 1 && (
        <div className="auq-progress">
          {questions.map((_, i) => (
            <span key={i} className={`auq-dot${i === step ? ' active' : i < step ? ' done' : ''}`} />
          ))}
          <span className="auq-step-label">{step + 1} / {questions.length}</span>
        </div>
      )}

      {/* Current question */}
      <div className="auq-group">
        <span className="auq-header">{currentQ.header}</span>
        <p className="auq-question">{currentQ.question}</p>
        <div className="auq-options">
          {currentQ.options.map((opt, oi) => {
            const isSelected = currentSel.has(oi);
            const isFocused = focusIdx === oi;
            return (
              <div
                key={oi}
                className={`auq-option${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}${currentQ.multiSelect ? '' : ' single-select'}`}
                onClick={() => { toggleOption(oi); setFocusIdx(oi); }}
              >
                <span className="auq-check">{isSelected ? '\u2713' : ''}</span>
                <div className="auq-option-content">
                  <span className="auq-label">{opt.label}</span>
                  {opt.description && <span className="auq-desc">{opt.description}</span>}
                </div>
              </div>
            );
          })}
          {/* "Other" option */}
          <div
            className={`auq-option${currentSel.has(currentQ.options.length) ? ' selected' : ''}${focusIdx === currentQ.options.length ? ' focused' : ''}${currentQ.multiSelect ? '' : ' single-select'}`}
            onClick={() => { toggleOption(currentQ.options.length); setFocusIdx(currentQ.options.length); }}
          >
            <span className="auq-check">{currentSel.has(currentQ.options.length) ? '\u2713' : ''}</span>
            <div className="auq-option-content">
              <span className="auq-label">Other</span>
              <span className="auq-desc">Provide custom text input</span>
            </div>
          </div>
          {currentSel.has(currentQ.options.length) && (
            <input
              className="auq-other-input"
              type="text"
              placeholder="Type your answer..."
              autoFocus
              value={otherTexts.get(step) ?? ''}
              onChange={e => {
                const val = e.target.value;
                const s = step;
                setOtherTexts(prev => { const n = new Map(prev); n.set(s, val); return n; });
              }}
            />
          )}
        </div>
      </div>

      <div className="auq-footer">
        <span className="auq-hint">
          <kbd>&uarr;</kbd><kbd>&darr;</kbd> select &nbsp;
          {step > 0 && <><kbd>&larr;</kbd> back &nbsp;</>}
          <kbd>Enter</kbd> {isLast ? 'submit' : 'next'}
        </span>
        <div className="auq-footer-buttons">
          {step > 0 && (
            <button className="auq-back" onClick={prev}>Back</button>
          )}
          <button className="auq-submit" disabled={!hasSelection} onClick={next}>
            {isLast ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
