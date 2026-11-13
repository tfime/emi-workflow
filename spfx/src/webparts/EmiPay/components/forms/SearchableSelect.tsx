import * as React from 'react';
import styles from '../EmiPay.module.scss';

export interface ISearchableSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ISearchableSelectProps {
  options: ISearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
  id?: string;
}

const SearchableSelect: React.FC<ISearchableSelectProps> = (props) => {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);

  const selected = props.options.filter((o) => o.value === props.value)[0];
  const displayClosed = selected ? selected.label : '';

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? props.options
    : props.options.filter((o) => {
        const hay = `${o.label} ${o.value} ${o.hint || ''}`.toLowerCase();
        return hay.indexOf(q) >= 0;
      });

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlight(0);
    }
  }, [open]);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  React.useEffect(() => {
    setHighlight(0);
  }, [query]);

  const pick = (value: string): void => {
    props.onChange(value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (props.disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) pick(filtered[highlight].value);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div
      className={`${styles.searchSelect} ${props.disabled ? styles.searchSelectDisabled : ''}`.trim()}
      ref={rootRef}
    >
      <input
        id={props.id}
        type="text"
        autoComplete="off"
        disabled={props.disabled}
        className={styles.searchSelectInput}
        placeholder={props.placeholder || 'Gõ để tìm…'}
        value={open ? query : displayClosed}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (!props.disabled) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && !props.disabled && (
        <ul className={styles.searchSelectMenu} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.searchSelectEmpty}>
              {props.emptyText || 'Không có kết quả'}
            </li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === props.value}
                  className={`${styles.searchSelectOption} ${
                    i === highlight ? styles.searchSelectOptionActive : ''
                  } ${o.value === props.value ? styles.searchSelectOptionSelected : ''}`.trim()}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(o.value)}
                >
                  <span>{o.label}</span>
                  {o.hint ? <span className={styles.searchSelectHint}>{o.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
