// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, ref } from 'vue'
import ReplyDraftAI from '../ReplyDraftAI.vue'
import { api } from '@/api'

vi.mock('@/api', () => ({ api: { fetch: vi.fn() } }))
vi.mock('@/i18n/app', () => ({
    useScopedI18n: () => ({ t: key => key, locale: ref('en') }),
}))
vi.mock('@/store', () => ({
    useGlobalState: () => ({
        openSettings: ref({
            aiReply: { languages: ['en'], maxSubjectLength: 100, maxBodyLength: 1000, maxIntentLength: 100 },
        }),
    }),
}))

let unmount
afterEach(() => unmount?.())

it('generates a draft from the incoming mail alone and waits for explicit insertion', async () => {
    const source = { subject: 'Delivery update', text: 'Can you share an update?' }
    const draft = { text: 'Thank you for checking in.', chineseText: '感谢您的询问。' }
    api.fetch.mockResolvedValueOnce(draft)
    const applied = vi.fn()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
        render: () => h(ReplyDraftAI, { source, scope: 'admin', onApply: applied }),
    })
    app.mount(host)
    unmount = () => { app.unmount(); host.remove() }

    const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label)
    button('title').click()
    await vi.waitFor(() => expect(button('generate').disabled).toBe(false))
    expect(api.fetch).not.toHaveBeenCalled()
    button('generate').click()

    await vi.waitFor(() => expect(button('apply')).toBeDefined())
    expect(api.fetch).toHaveBeenCalledOnce()
    expect(api.fetch).toHaveBeenCalledWith('/admin/ai_reply', expect.objectContaining({
        body: { subject: source.subject, body: source.text, targetLanguage: 'auto' },
    }))
    expect(document.querySelector('[lang="zh-Hans"]').textContent).toBe(draft.chineseText)
    expect(applied).not.toHaveBeenCalled()
    button('apply').click()
    expect(applied).toHaveBeenCalledExactlyOnceWith(draft.text)
})
