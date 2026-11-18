// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildForwardModel, buildReplyModel, getAIReplySource, insertAIReplyText } from '../mail-actions';

describe('reply drafts', () => {
  it('uses Reply-To ahead of the visible sender and collects folded thread references', () => {
    const mail = {
      id: 42,
      source: 'Sender <sender@example.com>',
      originalSource: 'bounce@example.net',
      subject: 'Re: A conversation',
      raw: 'From: Sender <sender@example.com>\r\n'
        + 'Reply-To: "Return, Address"\r\n <return@example.org>\r\n'
        + 'Message-ID: <current@example.com>\r\n'
        + 'References: <first@example.com>\r\n <second@example.com> <current@example.com>\r\n\r\nOriginal text',
      text: 'Original text\nSecond line',
    };

    expect(buildReplyModel(mail)).toEqual({
      toName: 'Return, Address',
      toMail: 'return@example.org',
      subject: 'Re: A conversation',
      contentType: 'text',
      content: '',
      replyMailId: 42,
      inReplyTo: '<current@example.com>',
      references: ['<first@example.com>', '<second@example.com>'],
    });
  });

  it('falls back to the sender when Reply-To is invalid and does not mistake the body for headers', () => {
    const draft = buildReplyModel({
      source: 'sender@example.com',
      originalSource: 'bounce@example.net',
      subject: 'A conversation',
      raw: 'Reply-To: invalid\nFrom: sender@example.com\n\nReply-To: unrelated@example.net',
      message_id: 'current@example.com',
      message: '<p>First &amp; second</p><p>Third</p>',
    });

    expect(draft.toMail).toBe('sender@example.com');
    expect(draft.subject).toBe('Re: A conversation');
    expect(draft.inReplyTo).toBe('<current@example.com>');
    expect(draft.content).toBe('');
  });
});

describe('forward drafts', () => {
  it('clears recipient and threading and keeps safe original markup', () => {
    const draft = buildForwardModel({ subject: 'Original', message: '<p>Text</p><script>alert(1)</script>' }, 'Forward');
    expect(draft).toEqual({
      toName: '',
      toMail: '',
      subject: 'Forward: Original',
      contentType: 'html',
      content: '<p>Text</p>',
      replyMailId: undefined,
      inReplyTo: undefined,
      references: [],
    });
  });
});

describe('AI reply drafts', () => {
  it('extracts only the parsed subject and body', () => {
    expect(getAIReplySource({
      subject: ' Delivery update ',
      raw: 'Original MIME',
      message: '<p>First line</p><p>Second line</p>',
      attachments: [{ filename: 'details.txt' }],
    })).toEqual({ subject: 'Delivery update', text: 'First line\nSecond line' });
    expect(getAIReplySource({ raw: 'Original MIME', message: 'Original MIME' })).toEqual({ subject: '', text: '' });
  });

  it('inserts generated text into the blank reply and keeps the same thread', () => {
    const draft = buildReplyModel({
      source: 'sender@example.com', subject: 'Delivery update', text: 'Original', message_id: '<original@example.com>',
    });
    insertAIReplyText(draft, 'Thank you.\r\nI will check.');
    expect(draft.content).toBe('Thank you.\nI will check.');
    expect(draft.toMail).toBe('sender@example.com');
    expect(draft.inReplyTo).toBe('<original@example.com>');
  });

  it('keeps edited rich text and treats generated markup as text', () => {
    const draft = { contentType: 'rich', content: '<blockquote>Original <strong>body</strong></blockquote>' };
    insertAIReplyText(draft, 'Thank you.\nPlease send <details>.\n\nKind regards');
    expect(draft).toEqual({
      contentType: 'rich',
      content: '<p>Thank you.<br>Please send &lt;details&gt;.</p><p>Kind regards</p><blockquote>Original <strong>body</strong></blockquote>',
    });
  });
});
