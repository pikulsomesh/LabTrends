import { describe, expect, it } from 'vitest';
import { readTextResult, swatchFor } from './textResults';

describe('readTextResult', () => {
  it.each([
    ['Colour                        Pale Yellow              Pale Yellow', { name: 'Colour', value: 'Pale Yellow', unit: '', ref: 'Pale Yellow' }],
    ['Protein Trace Nil', { name: 'Protein', value: 'Trace', unit: '', ref: 'Nil' }],
    ['Colour : Straw', { name: 'Colour', value: 'Straw', unit: '', ref: '' }],
    ['Blood   Positive (+)   Negative', { name: 'Blood', value: 'Positive (+)', unit: '', ref: 'Negative' }],
    ['Glucose 2+ (Ref: Negative)', { name: 'Glucose', value: '2+', unit: '', ref: 'Negative' }],
    ['Pus Cells   2-4   /hpf   0 - 5', { name: 'Pus Cells', value: '2-4', unit: '/hpf', ref: '0 - 5' }],
    ['Red Blood Cells Nil /hpf 0-2', { name: 'Red Blood Cells', value: 'Nil', unit: '/hpf', ref: '0-2' }],
    ['Casts Not seen', { name: 'Casts', value: 'Not seen', unit: '', ref: '' }],
    ['HBsAg   Non Reactive', { name: 'HBsAg', value: 'Non Reactive', unit: '', ref: '' }],
  ])('%j', (line, row) => expect(readTextResult(line)).toEqual(row));

  it.each([
    'Patient: Test Patient One',
    'Remarks: Normal',
    'TSH 2.5 uIU/mL Normal',
    'Hemoglobin 13.4 g/dL',
    'Sample collected at home, clear instructions given to the patient',
    'Protein',
  ])('leaves %j alone', (line) => expect(readTextResult(line)).toBeNull());
});

describe('swatchFor', () => {
  it('shows a colour only for colour words', () => {
    expect(swatchFor('Pale yellow')).not.toBeNull();
    expect(swatchFor('Amber')).not.toBeNull();
    expect(swatchFor('Trace')).toBeNull();
    expect(swatchFor('Clear')).toBeNull();
  });
});
