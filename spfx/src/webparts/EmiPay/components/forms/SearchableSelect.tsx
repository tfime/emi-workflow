import * as React from 'react';
import { ComboBox, IComboBox, IComboBoxOption } from '@fluentui/react';

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
  const comboOptions: IComboBoxOption[] = props.options.map((o) => ({
    key: o.value,
    text: o.hint ? `${o.label} (${o.hint})` : o.label,
    data: o
  }));

  const onChange = (
    _ev: React.FormEvent<IComboBox>,
    option?: IComboBoxOption,
    _index?: number,
    value?: string
  ): void => {
    if (option) {
      props.onChange(String(option.key));
      return;
    }
    // free input: try match by label/value
    const q = (value || '').trim().toLowerCase();
    if (!q) return;
    const hit = props.options.filter((o) => {
      const hay = `${o.label} ${o.value} ${o.hint || ''}`.toLowerCase();
      return hay.indexOf(q) >= 0 || o.value.toLowerCase() === q;
    })[0];
    if (hit) props.onChange(hit.value);
  };

  return (
    <ComboBox
      id={props.id}
      selectedKey={props.value || undefined}
      options={comboOptions}
      disabled={props.disabled}
      allowFreeform={true}
      autoComplete="on"
      useComboBoxAsMenuWidth={true}
      placeholder={props.placeholder || 'Gõ để tìm…'}
      onChange={onChange}
      styles={{
        root: { maxWidth: '100%' },
        input: { borderRadius: 4 }
      }}
    />
  );
};

export default SearchableSelect;
