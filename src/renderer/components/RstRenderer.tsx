import React, { useMemo } from 'react';
import { MermaidDiagram } from './MermaidDiagram';
import { RstPreviewContainer } from '../styles/preview.styles';

interface RstRendererProps {
    content: string;
    documentPath?: string | null;
}

// Types for parsed RST elements
interface ParsedElement {
    type: string;
    content?: string;
    children?: ParsedElement[];
    level?: number;
    language?: string;
    items?: ParsedElement[];
    url?: string;
    title?: string;
    admonitionType?: string;
}

// Parse RST content into an intermediate representation
function parseRst(content: string): ParsedElement[] {
    const elements: ParsedElement[] = [];
    const lines = content.split('\n');
    let i = 0;

    // Helper to check for section underline/overline characters
    const isSectionChar = (char: string) => /^[=\-`:'\"~^_*+#<>]$/.test(char);
    const isUnderline = (line: string) => {
        if (line.length < 1) return false;
        const char = line[0];
        return isSectionChar(char) && line.split('').every(c => c === char);
    };

    // Parse inline formatting
    // Escape HTML special characters to prevent XSS when content is injected via dangerouslySetInnerHTML
    const escapeHtml = (str: string): string =>
        str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Validate a URL, returning '#' for any non-http/https scheme to block javascript: etc.
    const safeLinkHref = (url: string): string => {
        try {
            const parsed = new URL(url.trim());
            return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '#';
        } catch {
            return '#';
        }
    };

    const parseInline = (text: string): string => {
        // Bold: **text** or :strong:`text`
        text = text.replace(/\*\*([^*]+)\*\*/g, (_, t: string) => `<strong>${escapeHtml(t)}</strong>`);
        text = text.replace(/:strong:`([^`]+)`/g, (_, t: string) => `<strong>${escapeHtml(t)}</strong>`);

        // Italic: *text* or :emphasis:`text`
        text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, (_, t: string) => `<em>${escapeHtml(t)}</em>`);
        text = text.replace(/:emphasis:`([^`]+)`/g, (_, t: string) => `<em>${escapeHtml(t)}</em>`);

        // Inline code: ``text``
        text = text.replace(/``([^`]+)``/g, (_, t: string) => `<code>${escapeHtml(t)}</code>`);

        // Inline literals: `text`
        text = text.replace(/(?<!`)`([^`]+)`(?!`)/g, (_, t: string) => `<code>${escapeHtml(t)}</code>`);

        // Links: `text <url>`_ — validate URL scheme, escape display text
        text = text.replace(/`([^<]+)\s+<([^>]+)>`_/g, (_match, linkText: string, url: string) =>
            `<a href="${safeLinkHref(url)}">${escapeHtml(linkText)}</a>`
        );

        // Reference links: :ref:`text`
        text = text.replace(/:ref:`([^`]+)`/g, (_, t: string) => `<em>${escapeHtml(t)}</em>`);

        // Subscript: :sub:`text`
        text = text.replace(/:sub:`([^`]+)`/g, (_, t: string) => `<sub>${escapeHtml(t)}</sub>`);

        // Superscript: :sup:`text`
        text = text.replace(/:sup:`([^`]+)`/g, (_, t: string) => `<sup>${escapeHtml(t)}</sup>`);

        return text;
    };

    while (i < lines.length) {
        const line = lines[i];
        const nextLine = lines[i + 1] || '';
        const prevLine = lines[i - 1] || '';

        // Skip empty lines
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Check for section titles (with underline or over/underline)
        // Title with underline only
        if (nextLine && isUnderline(nextLine) && nextLine.length >= line.trim().length && line.trim().length > 0 && !isUnderline(line)) {
            const char = nextLine[0];
            const level = '=-~^"+'.indexOf(char) + 1 || 4;
            elements.push({
                type: 'heading',
                level: Math.min(level, 6),
                content: parseInline(line.trim()),
            });
            i += 2;
            continue;
        }

        // Title with overline and underline
        if (isUnderline(line) && lines[i + 2] && isUnderline(lines[i + 2]) && line === lines[i + 2]) {
            const char = line[0];
            const level = '=-~^"+'.indexOf(char) + 1 || 4;
            elements.push({
                type: 'heading',
                level: Math.min(level, 6),
                content: parseInline(nextLine.trim()),
            });
            i += 3;
            continue;
        }

        // Code block directive: .. code-block:: language
        const codeBlockMatch = line.match(/^\.\.\s+code-block::\s*(\w*)/);
        if (codeBlockMatch) {
            const language = codeBlockMatch[1] || '';
            i++;

            // Skip blank lines after directive
            while (i < lines.length && lines[i].trim() === '') {
                i++;
            }

            // Collect indented content
            const codeLines: string[] = [];
            const baseIndent = lines[i]?.match(/^(\s*)/)?.[1].length || 0;

            while (i < lines.length) {
                const codeLine = lines[i];
                if (codeLine.trim() === '') {
                    codeLines.push('');
                    i++;
                } else if (codeLine.match(/^\s/) && codeLine.substring(0, baseIndent).trim() === '') {
                    codeLines.push(codeLine.substring(baseIndent));
                    i++;
                } else {
                    break;
                }
            }

            // Trim trailing empty lines
            while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
                codeLines.pop();
            }

            elements.push({
                type: 'code_block',
                language,
                content: codeLines.join('\n'),
            });
            continue;
        }

        // Literal block (:: at end of paragraph or standalone)
        if (line.trim().endsWith('::') || line.trim() === '::') {
            // If just ::, skip it; if text::, include the text as paragraph
            if (line.trim() !== '::') {
                const text = line.trim().slice(0, -1); // Remove one colon, keep one
                if (text.trim()) {
                    elements.push({
                        type: 'paragraph',
                        content: parseInline(text.trim()),
                    });
                }
            }
            i++;

            // Skip blank line
            while (i < lines.length && lines[i].trim() === '') {
                i++;
            }

            // Collect indented content
            const codeLines: string[] = [];
            const baseIndent = lines[i]?.match(/^(\s*)/)?.[1].length || 0;

            while (i < lines.length) {
                const codeLine = lines[i];
                if (codeLine.trim() === '') {
                    codeLines.push('');
                    i++;
                } else if (codeLine.match(/^\s/) && baseIndent > 0) {
                    codeLines.push(codeLine.substring(Math.min(baseIndent, codeLine.search(/\S|$/))));
                    i++;
                } else {
                    break;
                }
            }

            // Trim trailing empty lines
            while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '') {
                codeLines.pop();
            }

            if (codeLines.length > 0) {
                elements.push({
                    type: 'code_block',
                    language: '',
                    content: codeLines.join('\n'),
                });
            }
            continue;
        }

        // Admonition directives: .. note::, .. warning::, .. tip::, etc.
        const admonitionMatch = line.match(/^\.\.\s+(note|warning|tip|important|caution|danger|error|hint|attention)::\s*(.*)/i);
        if (admonitionMatch) {
            const admonitionType = admonitionMatch[1].toLowerCase();
            const titleText = admonitionMatch[2] || '';
            i++;

            // Skip blank lines
            while (i < lines.length && lines[i].trim() === '') {
                i++;
            }

            // Collect indented content
            const contentLines: string[] = [];
            if (titleText) {
                contentLines.push(titleText);
            }

            while (i < lines.length) {
                const contentLine = lines[i];
                if (contentLine.trim() === '') {
                    contentLines.push('');
                    i++;
                } else if (contentLine.match(/^\s/)) {
                    contentLines.push(contentLine.trim());
                    i++;
                } else {
                    break;
                }
            }

            elements.push({
                type: 'admonition',
                admonitionType,
                content: parseInline(contentLines.join(' ').trim()),
            });
            continue;
        }

        // Image directive: .. image:: path
        const imageMatch = line.match(/^\.\.\s+image::\s*(.+)/);
        if (imageMatch) {
            const imagePath = imageMatch[1].trim();
            elements.push({
                type: 'image',
                url: imagePath,
            });
            i++;
            // Skip any options (indented lines)
            while (i < lines.length && lines[i].match(/^\s+:/)) {
                i++;
            }
            continue;
        }

        // Block quote (indented text that's not a list or code)
        if (line.match(/^\s{2,}/) && !line.match(/^\s*[-*+]\s/) && !line.match(/^\s*\d+\.\s/) && !line.match(/^\s*::/)) {
            const quoteLines: string[] = [];
            while (i < lines.length && (lines[i].match(/^\s{2,}/) || lines[i].trim() === '')) {
                if (lines[i].trim()) {
                    quoteLines.push(lines[i].trim());
                }
                i++;
            }
            if (quoteLines.length > 0) {
                elements.push({
                    type: 'blockquote',
                    content: parseInline(quoteLines.join(' ')),
                });
            }
            continue;
        }

        // Bullet list: - item or * item or + item
        const bulletMatch = line.match(/^(\s*)([-*+])\s+(.+)/);
        if (bulletMatch) {
            const items: ParsedElement[] = [];
            const baseIndent = bulletMatch[1].length;

            while (i < lines.length) {
                const listLine = lines[i];
                const itemMatch = listLine.match(/^(\s*)([-*+])\s+(.+)/);

                if (itemMatch && itemMatch[1].length === baseIndent) {
                    items.push({
                        type: 'list_item',
                        content: parseInline(itemMatch[3]),
                    });
                    i++;
                    // Handle continuation lines
                    while (i < lines.length && lines[i].match(/^\s+/) && !lines[i].match(/^\s*[-*+]\s/)) {
                        if (lines[i].trim()) {
                            items[items.length - 1].content += ' ' + parseInline(lines[i].trim());
                        }
                        i++;
                    }
                } else if (listLine.trim() === '') {
                    i++;
                } else {
                    break;
                }
            }

            elements.push({
                type: 'bullet_list',
                items,
            });
            continue;
        }

        // Enumerated list: 1. item or #. item
        const enumMatch = line.match(/^(\s*)(\d+|#)\.\s+(.+)/);
        if (enumMatch) {
            const items: ParsedElement[] = [];
            const baseIndent = enumMatch[1].length;

            while (i < lines.length) {
                const listLine = lines[i];
                const itemMatch = listLine.match(/^(\s*)(\d+|#)\.\s+(.+)/);

                if (itemMatch && itemMatch[1].length === baseIndent) {
                    items.push({
                        type: 'list_item',
                        content: parseInline(itemMatch[3]),
                    });
                    i++;
                    // Handle continuation lines
                    while (i < lines.length && lines[i].match(/^\s+/) && !lines[i].match(/^\s*(\d+|#)\./)) {
                        if (lines[i].trim()) {
                            items[items.length - 1].content += ' ' + parseInline(lines[i].trim());
                        }
                        i++;
                    }
                } else if (listLine.trim() === '') {
                    i++;
                } else {
                    break;
                }
            }

            elements.push({
                type: 'enumerated_list',
                items,
            });
            continue;
        }

        // Definition list: term followed by indented definition
        if (line.trim() && nextLine && nextLine.match(/^\s+\S/) && !nextLine.match(/^\s*[-*+]\s/) && !line.match(/^\.\./) && !isUnderline(nextLine)) {
            const term = line.trim();
            i++;
            const defLines: string[] = [];

            while (i < lines.length && (lines[i].match(/^\s+/) || lines[i].trim() === '')) {
                if (lines[i].trim()) {
                    defLines.push(lines[i].trim());
                }
                i++;
            }

            elements.push({
                type: 'definition',
                title: parseInline(term),
                content: parseInline(defLines.join(' ')),
            });
            continue;
        }

        // Horizontal rule (transition): line of 4+ identical chars
        if (line.length >= 4 && isUnderline(line) && prevLine.trim() === '') {
            elements.push({ type: 'hr' });
            i++;
            continue;
        }

        // Skip comments: .. comment
        if (line.match(/^\.\.\s*$/) || (line.match(/^\.\.\s+/) && !line.match(/^\.\.\s+\w+::/))) {
            i++;
            // Skip indented continuation
            while (i < lines.length && lines[i].match(/^\s+/)) {
                i++;
            }
            continue;
        }

        // Regular paragraph
        const paragraphLines: string[] = [line];
        i++;

        while (i < lines.length) {
            const pLine = lines[i];
            // Stop at empty line, directive, list item, or section marker
            if (pLine.trim() === '' ||
                pLine.match(/^\.\.\s/) ||
                pLine.match(/^\s*[-*+]\s/) ||
                pLine.match(/^\s*\d+\.\s/) ||
                (lines[i + 1] && isUnderline(lines[i + 1]))) {
                break;
            }
            paragraphLines.push(pLine);
            i++;
        }

        elements.push({
            type: 'paragraph',
            content: parseInline(paragraphLines.join(' ').trim()),
        });
    }

    return elements;
}

// Render parsed elements to React components
function renderElement(element: ParsedElement, index: number, documentPath?: string | null): React.ReactNode {
    switch (element.type) {
        case 'heading': {
            const level = Math.min(Math.max(element.level || 1, 1), 6);
            const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            return React.createElement(HeadingTag, {
                key: index,
                dangerouslySetInnerHTML: { __html: element.content || '' }
            });
        }

        case 'paragraph':
            return (
                <p key={index} dangerouslySetInnerHTML={{ __html: element.content || '' }} />
            );

        case 'code_block':
            // Check if this is a mermaid diagram
            if (element.language === 'mermaid') {
                return <MermaidDiagram key={index} chart={element.content || ''} />;
            }
            return (
                <pre key={index}>
                    <code className={element.language ? `language-${element.language}` : ''}>
                        {element.content}
                    </code>
                </pre>
            );

        case 'bullet_list':
            return (
                <ul key={index}>
                    {element.items?.map((item, itemIndex) => (
                        <li key={item.content ?? itemIndex} dangerouslySetInnerHTML={{ __html: item.content || '' }} />
                    ))}
                </ul>
            );

        case 'enumerated_list':
            return (
                <ol key={index}>
                    {element.items?.map((item, itemIndex) => (
                        <li key={item.content ?? itemIndex} dangerouslySetInnerHTML={{ __html: item.content || '' }} />
                    ))}
                </ol>
            );

        case 'blockquote':
            return (
                <blockquote key={index} dangerouslySetInnerHTML={{ __html: element.content || '' }} />
            );

        case 'definition':
            return (
                <dl key={index}>
                    <dt dangerouslySetInnerHTML={{ __html: element.title || '' }} />
                    <dd dangerouslySetInnerHTML={{ __html: element.content || '' }} />
                </dl>
            );

        case 'image':
            // Convert relative image paths to absolute file:// URLs for local images
            let imageSrc = element.url;
            if (element.url && element.url.startsWith('./') && documentPath) {
                // Get the directory of the current file
                const lastSep = Math.max(documentPath.lastIndexOf('\\'), documentPath.lastIndexOf('/'));
                if (lastSep >= 0) {
                    const documentDir = documentPath.substring(0, lastSep);
                    // Build absolute path
                    const relativePath = element.url.substring(2); // Remove './'
                    const absolutePath = `${documentDir}/${relativePath}`.replace(/\\/g, '/');
                    // Convert to file:// URL
                    imageSrc = `file:///${absolutePath}`;
                }
            }
            return (
                <p key={index}>
                    <img src={imageSrc} alt={element.title || ''} />
                </p>
            );

        case 'admonition':
            const admonitionClass = ['note', 'warning', 'tip', 'hint'].includes(element.admonitionType || '')
                ? `rst-${element.admonitionType}`
                : 'rst-note';
            return (
                <div key={index} className={admonitionClass}>
                    <strong style={{ textTransform: 'capitalize' }}>{element.admonitionType}: </strong>
                    <span dangerouslySetInnerHTML={{ __html: element.content || '' }} />
                </div>
            );

        case 'hr':
            return <hr key={index} />;

        default:
            return null;
    }
}

export function RstRenderer({ content, documentPath }: RstRendererProps) {
    const elements = useMemo(() => parseRst(content), [content]);

    if (!content || content.trim() === '') {
        return (
            <RstPreviewContainer>
                <em>No content</em>
            </RstPreviewContainer>
        );
    }

    return (
        <RstPreviewContainer>
            {elements.map((element, index) => renderElement(element, index, documentPath))}
        </RstPreviewContainer>
    );
}

export default RstRenderer;
