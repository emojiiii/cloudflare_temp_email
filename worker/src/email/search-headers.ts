import { decodeWords } from 'postal-mime';

export const normalizeMailSearch = (value: string) => value.trim().normalize('NFC').toLowerCase();

const readHeader = (headers: string, pattern: RegExp) => {
    const value = headers.match(pattern)?.[1] ?? '';
    return decodeWords(value.replace(/(?:\r\n|\r|\n)[\t ]+/g, ' '));
};

export const getMailSearchHeaders = (source: string, raw: string) => {
    const headerEnd = raw.search(/\r\n\r\n|\n\n|\r\r/);
    const headers = headerEnd === -1 ? raw : raw.slice(0, headerEnd);
    const from = readHeader(headers, /^from:[\t ]*([^\r\n]*(?:(?:\r\n|\r|\n)[\t ]+[^\r\n]*)*)/im);
    const subject = readHeader(headers, /^subject:[\t ]*([^\r\n]*(?:(?:\r\n|\r|\n)[\t ]+[^\r\n]*)*)/im);
    return {
        sender: normalizeMailSearch(`${from}\n${source}`),
        subject: normalizeMailSearch(subject),
    };
};
