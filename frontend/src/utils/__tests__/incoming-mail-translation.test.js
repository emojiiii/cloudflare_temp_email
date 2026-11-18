// @vitest-environment jsdom
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIncomingMailTranslation } from '../incoming-mail-translation'
import { useMailTranslation } from '../mail-translation'
import { blockRemoteContent } from '../remote-content-policy'

vi.mock('../mail-translation', () => ({ useMailTranslation: vi.fn() }))

let scope

function openReader(initialMail, lookup) {
    const capability = ref({ provider: 'deepseek', maxLength: 6000, cacheOnly: Boolean(lookup) })
    const language = ref('zh')
    const translate = vi.fn(async (source, target, signal, layout, options) => {
        if (options?.cacheOnly) return lookup(source, target, signal, layout, options)
        return Array.isArray(source) ? source.map(() => '译文') : '译文'
    })
    const session = ref('current session')
    const mail = ref(initialMail)
    useMailTranslation.mockReturnValue({ capability, language, session, translate })
    scope = effectScope()
    const reader = scope.run(() => useIncomingMailTranslation(mail, 'user'))
    return { reader, translate, language, mail, session }
}

afterEach(() => scope.stop())

describe('incoming mail translation', () => {
    it('shows the cached language on open and can switch to the original without a request', async () => {
        const { reader, translate, language, mail } = openReader({ id: 1, text: 'Hello' },
            source => source === 'Hello' ? { text: 'Bonjour', targetLanguage: 'fr' } : null)
        await vi.waitFor(() => expect(reader.showingTranslation.value).toBe(true))
        expect(translate).toHaveBeenCalledExactlyOnceWith('Hello', 'zh', expect.any(AbortSignal), undefined,
            { mailId: 1, part: 0, cacheOnly: true, fallbackToCachedLanguage: true })
        expect(reader.translation.value).toEqual({ html: '', text: 'Bonjour', targetLanguage: 'fr' })
        expect(language.value).toBe('zh')
        reader.showingTranslation.value = false
        expect(translate).toHaveBeenCalledOnce()

        mail.value = { id: 2, text: 'Other mail' }
        await nextTick()
        expect(reader.showingTranslation.value).toBe(false)
        mail.value = { id: 1, text: 'Hello' }
        await vi.waitFor(() => expect(reader.showingTranslation.value).toBe(true))
        expect(translate).toHaveBeenCalledTimes(3)
        expect(translate).toHaveBeenLastCalledWith('Hello', 'zh', expect.any(AbortSignal), undefined,
            { mailId: 1, part: 0, cacheOnly: true, fallbackToCachedLanguage: true })

        language.value = 'ja'
        await nextTick()
        expect(translate).toHaveBeenLastCalledWith('Hello', 'ja', expect.any(AbortSignal), undefined,
            { mailId: 1, part: 0, cacheOnly: true })
    })

    it('keeps an uncached mail in its original language until the user requests translation', async () => {
        const { reader, translate } = openReader({ id: 1, text: 'Hello' }, () => null)
        await nextTick()
        expect(translate).toHaveBeenCalledExactlyOnceWith('Hello', 'zh', expect.any(AbortSignal), undefined,
            { mailId: 1, part: 0, cacheOnly: true, fallbackToCachedLanguage: true })
        expect(reader.showingTranslation.value).toBe(false)
        expect(reader.failed.value).toBe(false)

        await reader.translateMail()
        expect(translate).toHaveBeenLastCalledWith('Hello', 'zh', expect.any(AbortSignal), undefined, { mailId: 1, part: 0 })
        expect(reader.translation.value.text).toBe('译文')
    })

    it('allows manual translation during a lookup and ignores the old lookup result', async () => {
        let finishLookup
        const { reader, translate } = openReader({ id: 1, text: 'Hello' },
            () => new Promise(resolve => { finishLookup = resolve }))
        await reader.translateMail()
        expect(translate.mock.calls[0][2].aborted).toBe(true)
        finishLookup({ text: 'Bonjour', targetLanguage: 'fr' })
        await nextTick()
        expect(reader.translation.value).toEqual({ html: '', text: '译文', targetLanguage: 'zh' })
    })

    it('skips automatic requests when the Worker does not advertise cache-only support', async () => {
        const { reader, translate } = openReader({ id: 1, text: 'Hello' })
        await nextTick()
        expect(translate).not.toHaveBeenCalled()
        await reader.translateMail()
        expect(translate).toHaveBeenCalledOnce()
    })

    it('cancels pending requests when the selected mail changes and ignores stale results', async () => {
        const { reader, translate, mail } = openReader({ id: 1, text: 'First' })
        let finishFirst
        translate.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
        const firstRequest = reader.translateMail()

        mail.value = { id: 2, text: 'Second' }
        await nextTick()
        expect(translate.mock.calls[0][2].aborted).toBe(true)
        await reader.translateMail()
        finishFirst('Stale translation')
        await firstRequest
        expect(translate).toHaveBeenCalledTimes(2)
        expect(reader.translation.value.text).toBe('译文')
    })

    it('clears the translation and cancels pending work when the logged-in account changes', async () => {
        const { reader, translate, session } = openReader({ id: 1, text: 'Hello' })
        await reader.translateMail()
        let finishPrevious
        translate.mockImplementationOnce(() => new Promise(resolve => { finishPrevious = resolve }))
        const previousRequest = reader.translateMail()

        session.value = 'new session'
        await nextTick()
        expect(reader.showingTranslation.value).toBe(false)
        expect(translate.mock.calls[1][2].aborted).toBe(true)
        finishPrevious('Previous account translation')
        await previousRequest
        expect(reader.translation.value).toBeNull()
    })

    it('translates visible text while retaining rich HTML and the reader image policy', async () => {
        const { reader, translate, mail } = openReader({
            id: 1,
            text: 'Alternative plain-text MIME body',
            message: '<style>p { color: red }</style><p><strong>Hello</strong></p><script>alert(1)</script>' +
                '<p><a href="https://example.test/details">There</a><img src="https://example.test/tracker"></p>',
        })
        await reader.translateMail()
        expect(translate).toHaveBeenCalledOnce()
        const [source, target, signal, , mailPart] = translate.mock.calls[0]
        expect(Array.isArray(source)).toBe(true)
        expect(source.join(' ')).toMatch(/^Hello\s+There$/)
        expect(target).toBe('zh')
        expect(signal).toBeInstanceOf(AbortSignal)
        expect(mailPart).toEqual({ mailId: 1, part: 0 })
        expect(reader.translation.value.text).toContain('译文')
        const safePreview = blockRemoteContent(reader.translation.value.html)
        expect(safePreview.html).toContain('<strong>译文</strong>')
        expect(safePreview.html).toContain('<a href="https://example.test/details">译文</a>')
        expect(safePreview.html).not.toContain('example.test/tracker')
        expect(safePreview.blocked).toBe(1)

        const raw = 'From: sender@example.com\n\nUndecoded body'
        mail.value = { id: 2, raw, message: raw }
        await nextTick()
        expect(reader.canTranslate.value).toBe(false)
        await reader.translateMail()
        expect(translate).toHaveBeenCalledTimes(1)
    })

    it('discards displayed formatting when a mail body changes without changing its text', async () => {
        const { reader, translate, mail } = openReader({ id: 1, text: 'Hello', message: '<strong>Hello</strong>' })
        await reader.translateMail()
        expect(reader.translation.value.html).toContain('<strong>译文</strong>')

        mail.value = { id: 1, text: 'Hello', message: '<em>Hello</em>' }
        await nextTick()
        expect(reader.showingTranslation.value).toBe(false)
        await reader.translateMail()
        expect(translate).toHaveBeenCalledTimes(2)
        expect(reader.translation.value.html).toContain('<em>译文</em>')
    })

    it('keeps paragraph boundaries and emphasis anchors while allowing natural phrasing within a paragraph', async () => {
        const { reader, translate } = openReader({
            id: 1,
            message: '<p>Let’s <strong>touch base</strong> next Tuesday before the review.</p><p>Thanks!</p>',
        })
        translate.mockResolvedValueOnce(['我们下周二评审前', '碰个头', '吧。', '谢谢！'])

        await reader.translateMail()

        expect(translate).toHaveBeenCalledExactlyOnceWith(
            ['Let’s', 'touch base', 'next Tuesday before the review.', 'Thanks!'],
            'zh', expect.any(AbortSignal), [
                { block: 0, anchored: false },
                { block: 0, anchored: true },
                { block: 0, anchored: false },
                { block: 1, anchored: false },
            ],
            { mailId: 1, part: 0 },
        )
        expect(reader.translation.value.html).toBe('<p>我们下周二评审前<strong>碰个头</strong>吧。</p><p>谢谢！</p>')
    })

    it('sends stable part numbers for a rich mail that needs multiple requests', async () => {
        const { reader, translate } = openReader({
            id: 22,
            message: Array.from({ length: 201 }, (_, index) => `<p>Paragraph ${index}</p>`).join(''),
        })
        await reader.translateMail()
        expect(translate.mock.calls.map(([body, , , , part]) => [body.length, part])).toEqual([
            [200, { mailId: 22, part: 0 }],
            [1, { mailId: 22, part: 1 }],
        ])
    })

    it('uses the cached language for every rich-text part and hides incomplete translations', async () => {
        const lookup = vi.fn((source, target, _signal, _layout, { part }) => part === 0
            ? { segments: source.map(() => 'Bonjour'), targetLanguage: 'fr' } : null)
        const { reader, translate, mail } = openReader({
            id: 22,
            message: Array.from({ length: 201 }, (_, index) => `<p>Paragraph ${index}</p>`).join(''),
        }, lookup)
        await vi.waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
        expect(translate.mock.calls.map(([body, target, , , part]) => [body.length, target, part])).toEqual([
            [200, 'zh', { mailId: 22, part: 0, cacheOnly: true, fallbackToCachedLanguage: true }],
            [1, 'fr', { mailId: 22, part: 1, cacheOnly: true }],
        ])
        expect(reader.translation.value).toBeNull()
        expect(reader.failed.value).toBe(false)

        lookup.mockImplementation(source => ({ segments: source.map(() => 'Bonjour'), targetLanguage: 'fr' }))
        mail.value = { ...mail.value, id: 23 }
        await vi.waitFor(() => expect(reader.showingTranslation.value).toBe(true))
        expect(reader.translation.value.targetLanguage).toBe('fr')
        expect(reader.translation.value.html.match(/Bonjour/g)).toHaveLength(201)
    })

    it('keeps English clause spacing outside the emphasized span', async () => {
        const { reader, language, translate } = openReader({
            id: 1,
            message: '<p>周五开会时，<strong>先别急着拍板</strong>，等财务确认。</p>'
                + '<p>请等候。<strong>首先，</strong>检查预算。</p>'
                + '<p><strong>稍等，</strong> 请核对预算。</p>',
        })
        language.value = 'en'
        await nextTick()
        translate.mockResolvedValueOnce([
            'At the Friday meeting,', 'hold off on a decision', ', and wait for Finance to confirm.',
            'Please wait. ', 'First,', 'check the budget.',
            'Hold on,', 'please check the budget.',
        ])

        await reader.translateMail()

        expect(reader.translation.value.html).toBe(
            '<p>At the Friday meeting, <strong>hold off on a decision</strong>, and wait for Finance to confirm.</p>'
            + '<p>Please wait. <strong>First,</strong> check the budget.</p>'
            + '<p><strong>Hold on,</strong> please check the budget.</p>',
        )
    })
})
