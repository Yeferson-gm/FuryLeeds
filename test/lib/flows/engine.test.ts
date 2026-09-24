import { describe, expect, it } from 'bun:test';

import {
  evaluateConditionPredicate,
  isAutoAdvancing,
  isSuspending,
  isTerminal,
  matchesKeywordTrigger,
  matchReplyId,
} from '@/lib/flows/engine';

describe('matchReplyId', () => {
  it('matches button destinations', () => {
    const node = {
      node_type: 'send_buttons',
      config: {
        buttons: [
          { reply_id: 'yes', title: 'Yes', next_node_key: 'confirmed' },
          { reply_id: 'no', title: 'No', next_node_key: 'declined' },
        ],
      },
    };
    expect(matchReplyId(node, 'yes')).toBe('confirmed');
    expect(matchReplyId(node, 'missing')).toBeNull();
  });

  it('matches rows across list sections', () => {
    const node = {
      node_type: 'send_list',
      config: {
        sections: [
          { rows: [{ reply_id: 'one', next_node_key: 'first' }] },
          { rows: [{ reply_id: 'two', next_node_key: 'second' }] },
        ],
      },
    };
    expect(matchReplyId(node, 'two')).toBe('second');
  });

  it('does not match node types without reply options', () => {
    expect(matchReplyId({ node_type: 'end', config: {} }, 'x')).toBeNull();
  });
});

describe('matchesKeywordTrigger', () => {
  it('supports case-insensitive contains matching by default', () => {
    expect(
      matchesKeywordTrigger('I need SUPPORT please', {
        keywords: ['support'],
      })
    ).toBe(true);
  });

  it('supports exact and case-sensitive matching', () => {
    expect(
      matchesKeywordTrigger('HELP', {
        keywords: ['help'],
        match_type: 'exact',
      })
    ).toBe(true);
    expect(
      matchesKeywordTrigger('support', {
        keywords: ['Support'],
        case_sensitive: true,
      })
    ).toBe(false);
  });

  it('rejects empty inputs and keyword sets', () => {
    expect(matchesKeywordTrigger('', { keywords: ['help'] })).toBe(false);
    expect(matchesKeywordTrigger('help', { keywords: [] })).toBe(false);
  });
});

describe('node classifications', () => {
  it('classifies every supported runtime node exactly once', () => {
    const types = [
      'start',
      'send_message',
      'send_buttons',
      'send_list',
      'send_media',
      'collect_input',
      'condition',
      'set_tag',
      'handoff',
      'end',
    ];
    for (const type of types) {
      const flags = [
        isAutoAdvancing(type),
        isSuspending(type),
        isTerminal(type),
      ];
      expect(flags.filter(Boolean)).toHaveLength(1);
    }
  });
});

describe('evaluateConditionPredicate', () => {
  it('evaluates presence and absence', () => {
    expect(
      evaluateConditionPredicate({
        operator: 'present',
        subjectValue: 'value',
        configValue: undefined,
      })
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: 'absent',
        subjectValue: undefined,
        configValue: undefined,
      })
    ).toBe(true);
  });

  it('evaluates equals and contains without coercion', () => {
    expect(
      evaluateConditionPredicate({
        operator: 'equals',
        subjectValue: 'VIP',
        configValue: 'VIP',
      })
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: 'contains',
        subjectValue: 'support@example.com',
        configValue: '@example.com',
      })
    ).toBe(true);
    expect(
      evaluateConditionPredicate({
        operator: 'equals',
        subjectValue: undefined,
        configValue: '',
      })
    ).toBe(false);
  });
});
