// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import DraftTranslation from '../DraftTranslation.vue'

let translation
let unmount

vi.mock('@/i18n/app', () => ({
    useScopedI18n: () => ({ t: key => key }),
}))

vi.mock('@/utils/mail-translation', () => ({
    useMailTranslation: () => translation,
}))

vi.mock('naive-ui', async () => {
    const { h } = await import('vue')
    return {
        NButton: {
            props: ['disabled'],
            setup: (props, { slots }) => () => h('button', { type: 'button', disabled: props.disabled }, slots.default?.()),
        },
        NModal: {
            props: ['show'],
            setup: (props, { slots }) => () => props.show
                ? h('div', { role: 'dialog' }, [slots.default?.(), slots.action?.()])
                : null,
        },
        NAlert: {
            setup: (_, { slots }) => () => h('div', slots.default?.()),
        },
        NFormItem: {
            setup: (_, { slots }) => () => h('div', slots.default?.()),
        },
        NSelect: { render: () => null },
        NIcon: { render: () => null },
    }
})

function mountDraft(value, { reply = false, translate = vi.fn() } = {}) {
    translation = {
        capability: ref({ provider: 'deepseek', maxLength: 6000, languages: ['en', 'fr'] }),
        providerName: ref('DeepSeek'),
        languageOptions: ref([{ label: 'French', value: 'fr' }]),
        language: ref('fr'),
        translate,
    }
    const draft = ref(value)
    const applied = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
        render: () => h(DraftTranslation, {
            scope: 'mailbox',
            reply,
            draft: draft.value,
            'onUpdate:draft': value => { draft.value = value },
            onApplied: applied,
        }),
    })
    app.mount(host)
    unmount = () => { app.unmount(); host.remove() }
    const button = label => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label)
    const click = async (label) => {
        button(label)?.click()
        await nextTick()
    }
    return { draft, host, click, button, applied }
}

afterEach(() => unmount?.())

describe('draft translation', () => {
    it.each(['rich', 'html'])('previews and replaces a %s draft without losing formatting', async (contentType) => {
        const source = {
            toMail: 'test@example.test',
            subject: 'Hello',
            content: '<p><strong>First</strong> paragraph.</p><ul><li><a href="https://example.test/notes">Notes</a></li></ul><img src="https://assets.example.test/stamp.png">',
            contentType,
        }
        const translate = vi.fn(async input => Array.isArray(input)
            ? input.map(text => text.replace('First', 'Premier').replace('paragraph.', 'paragraphe. <img src=x>'))
            : 'Bonjour')
        const { draft, host, click, button, applied } = mountDraft(source, { translate })
        await click('translate')
        expect(translate).not.toHaveBeenCalled()
        await click('previewTranslation')
        await vi.waitFor(() => expect(button('apply')).toBeDefined())
        expect(translate).toHaveBeenCalledWith('Hello', 'fr', expect.any(AbortSignal))
        const [segments, target] = translate.mock.calls.find(([input]) => Array.isArray(input))
        expect(segments.join(' ')).toContain('First')
        expect(segments.join(' ')).not.toContain('https://')
        expect(target).toEqual('fr')
        expect(draft.value).toEqual(source)
        const richPreview = host.querySelector('.draft-translation-preview .mail-document').shadowRoot
        expect(richPreview.querySelector('p strong').textContent).toBe('Premier')
        expect(richPreview.querySelector('ul li a').getAttribute('href')).toBe('https://example.test/notes')
        expect(richPreview.querySelector('p').textContent).toContain('paragraphe. <img src=x>')
        expect(richPreview.querySelectorAll('img')).toHaveLength(1)
        expect(richPreview.innerHTML).not.toContain('https://assets.example.test/stamp.png')
        await click('apply')
        expect(draft.value).toMatchObject({ contentType, subject: 'Bonjour', toMail: source.toMail })
        expect(draft.value.content).toContain('<strong>Premier</strong>')
        expect(draft.value.content).toContain('&lt;img src=x&gt;')
        expect(draft.value.content).toContain('https://assets.example.test/stamp.png')
        expect(applied).toHaveBeenCalledOnce()
    })

    it('translates only the new text of a reply and retains its quoted history', async () => {
        const source = {
            subject: 'Re: Schedule',
            content: 'Thanks for the update.\n\n> Original email\n> Signature\n',
            contentType: 'text',
            inReplyTo: '<example@test>',
        }
        const translate = vi.fn().mockResolvedValue('Merci pour ces nouvelles.')
        const { draft, click, button } = mountDraft(source, { reply: true, translate })
        await click('translate')
        await click('previewTranslation')
        await vi.waitFor(() => expect(button('apply')).toBeDefined())
        expect(translate.mock.calls.map(([text]) => text)).toEqual(['Thanks for the update.'])
        await click('apply')
        expect(draft.value).toEqual({
            ...source, content: 'Merci pour ces nouvelles.\n\n> Original email\n> Signature\n',
        })
    })

    it('preserves blockquote history and the subject in a rich reply', async () => {
        const source = {
            subject: 'Re: Schedule',
            content: '<p><em>Thank you.</em></p><blockquote><p>Original email.</p></blockquote>',
            contentType: 'rich',
            inReplyTo: '<example@test>',
        }
        const translate = vi.fn(async segments => segments.map(text => text.replace('Thank you.', 'Merci.')))
        const { draft, click, button } = mountDraft(source, { reply: true, translate })
        await click('translate')
        await click('previewTranslation')
        await vi.waitFor(() => expect(button('apply')).toBeDefined())
        expect(translate).toHaveBeenCalledOnce()
        expect(translate.mock.calls[0][0].join(' ')).not.toContain('Original email')
        await click('apply')
        expect(draft.value).toEqual({
            ...source,
            content: '<p><em>Merci.</em></p><blockquote><p>Original email.</p></blockquote>',
        })
    })

    it('keeps the original draft if the provider fails', async () => {
        const source = { subject: '', content: '<p>Original draft</p>', contentType: 'html' }
        const translate = vi.fn().mockRejectedValue(new Error('Provider unavailable'))
        const { draft, host, click, button } = mountDraft(source, { translate })
        await click('translate')
        await click('previewTranslation')
        await vi.waitFor(() => expect(host.textContent).toContain('failed'))
        expect(button('apply')).toBeUndefined()
        expect(draft.value).toEqual(source)
    })

    it('discards a pending result when the original draft changes', async () => {
        let resolve
        const translate = vi.fn().mockReturnValue(new Promise(done => { resolve = done }))
        const source = { subject: '', content: 'Draft', contentType: 'text' }
        const { draft, click, button } = mountDraft(source, { translate })
        await click('translate')
        await click('previewTranslation')
        const signal = translate.mock.calls[0][2]
        draft.value = { ...source, content: 'Edited draft' }
        await nextTick()
        expect(signal.aborted).toBe(true)
        resolve('Brouillon')
        await Promise.resolve()
        await nextTick()
        expect(button('apply')).toBeUndefined()
        expect(draft.value.content).toBe('Edited draft')
    })
})
