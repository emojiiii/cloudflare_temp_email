import { addressParser } from 'postal-mime';
import { blockRemoteContent } from './remote-content-policy';

const messageIdPattern = /<[\x21-\x3b=?\x41-\x7e]+@[\x21-\x3b=?\x41-\x7e]+>/g;

export function getMailboxIdentity(source) {
  const value = source?.trim() || '';
  const boundary = value.lastIndexOf(' <');
  return boundary > 0 && value.endsWith('>')
    ? { name: value.slice(0, boundary), address: value.slice(boundary + 2, -1) }
    : { name: '', address: value };
}

function parseHeaderFields(raw) {
  const fields = new Map();
  if (typeof raw !== 'string') return fields;
  const end = raw.search(/\r?\n\r?\n/);
  if (end < 0) return fields;
  const headers = raw.slice(0, end).replace(/\r?\n[ \t]+/g, ' ');
  for (const line of headers.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const name = line.slice(0, separator).toLowerCase();
    if (!fields.has(name)) fields.set(name, line.slice(separator + 1).trim());
  }
  return fields;
}

function firstAddress(field) {
  if (!field) return undefined;
  return addressParser(field, { flatten: true }).find(({ address }) =>
    typeof address === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(address));
}

export function htmlToPlainText(html) {
  const template = document.createElement('template');
  template.innerHTML = blockRemoteContent(html).html;
  for (const element of template.content.querySelectorAll('style, title, template, script, noscript')) {
    element.remove();
  }
  for (const element of template.content.querySelectorAll('br, p, li, div, tr, blockquote')) {
    element.after(document.createTextNode('\n'));
  }
  return template.content.textContent.trim();
}

export function getAIReplySource(mail) {
  // A MIME parse failure can leave raw MIME, including attachments, in the reader's fallback body.
  const parsedBody = mail.message !== mail.raw ? mail.message : '';
  const text = mail.text?.trim() || (parsedBody ? htmlToPlainText(parsedBody) : '');
  return { subject: mail.subject?.trim() || '', text };
}

export function insertAIReplyText(draft, text) {
  const reply = text.replace(/\r\n?/g, '\n').trim();
  if (draft.contentType === 'text') {
    const separator = draft.content && !/^\r?\n\r?\n/.test(draft.content) ? '\n\n' : '';
    draft.content = reply + separator + draft.content;
    return;
  }

  const fragment = document.createElement('div');
  for (const block of reply.split(/\n\s*\n/)) {
    const paragraph = document.createElement('p');
    for (const [index, line] of block.split('\n').entries()) {
      if (index) paragraph.append(document.createElement('br'));
      paragraph.append(line);
    }
    fragment.append(paragraph);
  }
  draft.content = fragment.innerHTML + draft.content;
}

export function buildReplyModel(mail) {
  const headers = parseHeaderFields(mail.raw);
  const recipient = firstAddress(headers.get('reply-to'))
    || firstAddress(headers.get('from'))
    || firstAddress(mail.source)
    || firstAddress(mail.originalSource);
  const storedId = mail.message_id?.trim();
  const inReplyTo = [headers.get('message-id'), storedId, storedId && `<${storedId}>`]
    .map(id => id?.match(messageIdPattern)?.find(match => match.length <= 255))
    .find(Boolean);
  const thread = headers.get('references') || headers.get('in-reply-to') || '';
  const references = inReplyTo
    ? [...new Set((thread.match(messageIdPattern) || []).filter(id => id !== inReplyTo && id.length <= 255))].slice(-10)
    : [];
  const subject = mail.subject?.trim() || '';
  return {
    toName: recipient?.name?.replace(/\s+/g, ' ').trim() || '',
    toMail: recipient?.address || '',
    subject: /^(?:re|回复|答复)\s*:/i.test(subject) ? subject : `Re: ${subject}`,
    contentType: 'text',
    content: '',
    replyMailId: mail.id,
    inReplyTo,
    references,
  };
}

export function buildForwardModel(mail, forwardLabel) {
  return {
    toName: '',
    toMail: '',
    subject: `${forwardLabel}: ${mail.subject || ''}`,
    contentType: mail.message ? 'html' : 'text',
    content: mail.message ? blockRemoteContent(mail.message).html : mail.text || '',
    replyMailId: undefined,
    inReplyTo: undefined,
    references: [],
  };
}
