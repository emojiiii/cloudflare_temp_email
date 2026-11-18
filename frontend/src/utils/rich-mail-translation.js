import { blockRemoteContent } from './remote-content-policy'

const segmentsPerRequest = 200
const nonBodyText = [
    'style', 'title', 'template', 'script', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext',
    'svg', 'math', '[hidden]', '[translate="no"]',
].join(', ')
const blockSelector = 'address, article, aside, blockquote, dd, div, dt, figcaption, footer, h1, h2, h3, h4, h5, h6, header, li, p, pre, section, td, th'
const anchorSelector = 'a, b, code, del, em, font, i, mark, s, small, span[style], strong, sub, sup, u'
const cjkEnding = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。、！？；：，…「」『』《》（）][\t ]*$/u
const cjkStart = /^[\t ]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}。、！？；：，…「」『』《》（）]/u

function mailTextNodes(html, skipQuotes) {
    const template = document.createElement('template')
    // Keep the original safe image URLs for sending and for the reader's image setting.
    // The template is inert. Each preview applies its own remote-content policy.
    template.innerHTML = blockRemoteContent(html, { allowRemoteImages: true }).html
    const excluded = skipQuotes ? nonBodyText + ', blockquote' : nonBodyText
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
    const segments = []

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest(excluded)) continue
        const text = node.data.trim()
        if (!text) continue
        const start = node.data.indexOf(text)
        segments.push({
            node,
            text,
            leading: node.data.slice(0, start),
            trailing: node.data.slice(start + text.length),
            block: node.parentElement?.closest(blockSelector) ?? template.content,
            anchored: Boolean(node.parentElement?.closest(anchorSelector)),
        })
    }

    return { template, segments }
}

export function mailHtmlTextLength(html, { skipQuotes = false } = {}) {
    return mailTextNodes(html, skipQuotes).segments.reduce((length, { text }) => length + text.length, 0)
}

export async function translateMailHtml(html, translateSegments, maxLength, { skipQuotes = false, targetLanguage } = {}) {
    const { template, segments } = mailTextNodes(html, skipQuotes)
    if (segments.reduce((length, { text }) => length + text.length, 0) > maxLength) {
        throw new RangeError('Rich email exceeds the translation length limit')
    }

    for (let offset = 0; offset < segments.length; offset += segmentsPerRequest) {
        const batch = segments.slice(offset, offset + segmentsPerRequest)
        const blocks = new Map()
        const layout = batch.map(({ block, anchored }) => {
            if (!blocks.has(block)) blocks.set(block, blocks.size)
            return { block: blocks.get(block), anchored }
        })
        const result = await translateSegments(batch.map(({ text }) => text), layout)
        if (result === null) return null
        const translated = Array.isArray(result) ? result : result.segments
        targetLanguage = result.targetLanguage ?? targetLanguage
        if (!Array.isArray(translated) || translated.length !== batch.length
            || translated.some(text => typeof text !== 'string' || !text.trim())) {
            throw new Error('Translation did not return one result per text segment')
        }
        batch.forEach(({ node, leading, trailing }, index) => {
            const value = translated[index]
            const start = leading ? value.trimStart() : value
            node.data = leading + (trailing ? start.trimEnd() : start) + trailing
        })
    }

    const compactCjk = targetLanguage === 'zh' || targetLanguage === 'ja'
    for (let index = 1; index < segments.length; index++) {
        const left = segments[index - 1]
        const right = segments[index]
        if (left.block !== right.block || left.block.nodeName === 'PRE') continue
        if (compactCjk && cjkEnding.test(left.node.data) && cjkStart.test(right.node.data)) {
            left.node.data = left.node.data.replace(/[\t ]+$/, '')
            right.node.data = right.node.data.replace(/^[\t ]+/, '')
        }
        if (targetLanguage === 'en' && (left.anchored || right.anchored)
            && /[,;]$/.test(left.node.data) && /^\p{L}/u.test(right.node.data)
            && (left.node.data.trim() !== left.text || right.node.data.trim() !== right.text)) {
            const gap = document.createRange()
            gap.setStartAfter(left.node)
            gap.setEndBefore(right.node)
            if (gap.toString()) continue
            if (left.anchored) right.node.data = ' ' + right.node.data
            else left.node.data += ' '
        }
    }

    return template.innerHTML
}
