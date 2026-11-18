export const mailLanguages = {
    zh: 'Simplified Chinese',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    it: 'Italian',
    ru: 'Russian',
    ar: 'Arabic',
    vi: 'Vietnamese',
};

export class DeepSeekError extends Error {
    constructor(readonly code: string, readonly status: 429 | 502 = 502) {
        super(code);
    }
}

type Completion = {
    choices?: { finish_reason?: unknown; message?: { content?: unknown } }[];
};

export async function requestDeepSeek(
    apiKey: string,
    signal: AbortSignal,
    guidance: string[],
    source: string,
    { maxTokens, json }: { maxTokens: number; json?: boolean },
): Promise<string> {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'deepseek-flash',
            messages: [
                { role: 'system', content: guidance.join(' ') },
                { role: 'user', content: source },
            ],
            thinking: { type: 'disabled' },
            temperature: 0.2,
            max_tokens: maxTokens,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal,
        redirect: 'manual',
    });
    if (!response.ok) {
        throw new DeepSeekError(`upstream-${response.status}`,
            response.status === 402 || response.status === 429 ? 429 : 502);
    }

    const completion = await response.json<Completion>();
    const choice = completion?.choices?.[0];
    const content = choice?.message?.content;
    if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) {
        throw new DeepSeekError(choice?.finish_reason === 'length' ? 'truncated' : 'invalid-output');
    }
    return content;
}
