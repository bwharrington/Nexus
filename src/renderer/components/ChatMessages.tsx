import React, { useState, useCallback } from 'react';
import { Box, Typography, styled, IconButton, Tooltip } from '@mui/material';
import { CopyIcon, CheckIcon, GlobeIcon } from './AppIcons';
import ReactMarkdown, { Components } from 'react-markdown';
import type { AIMessage } from '../hooks/useAIChat';
import { CodeBlock } from './CodeBlock';
import { CreateProgress } from './CreateProgress';
import { AskProgress } from './AskProgress';
import { EditProgress } from './EditProgress';
import { MultiAgentProgress } from './MultiAgentProgress';
import type { CreatePhase } from '../hooks/useAICreate';
import type { AskPhase } from '../hooks/useAIAsk';
import type { MultiAgentPhase } from '../hooks/useAIMultiAgent';
import type { WebSearchPhase } from '../hooks/useWebSearch';
import type { AIChatMode } from '../types/global';

const MessagesContainer = styled(Box)(({ theme }) => ({
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    backgroundColor: theme.palette.mode === 'dark'
        ? theme.palette.grey[900]
        : theme.palette.grey[50],
}));

const MessageBubble = styled(Box)<{ role: 'user' | 'assistant' }>(({ theme, role }) => ({
    padding: '10px 14px',
    borderRadius: 12,
    maxWidth: '85%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    backgroundColor: role === 'user'
        ? theme.palette.primary.main
        : theme.palette.mode === 'dark'
            ? theme.palette.grey[800]
            : theme.palette.grey[200],
    color: role === 'user'
        ? theme.palette.primary.contrastText
        : theme.palette.text.primary,
    wordBreak: 'break-word',
    '& p': {
        margin: 0,
    },
    '& p + p': {
        marginTop: 8,
    },
    '& pre': {
        padding: 0,
        borderRadius: 4,
        overflowX: 'auto',
        margin: '8px 0',
        backgroundColor: 'transparent',
    },
    '& code': {
        fontFamily: 'monospace',
        fontSize: '0.9em',
    },
    '& ul, & ol': {
        marginLeft: 16,
        marginTop: 4,
        marginBottom: 4,
    },
}));

const GreetingContainer = styled(Box)({
    textAlign: 'center',
    paddingTop: 32,
    paddingBottom: 32,
});

const ChatLoadingContainer = styled(Box)({
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 16,
});

const ResponseCopyRow = styled(Box)(({ theme }) => ({
    display: 'flex',
    justifyContent: 'flex-end',
    borderTop: `1px solid ${theme.palette.divider}`,
    marginTop: 6,
    paddingTop: 4,
}));

const ResponseCopyButtonBase = styled(IconButton)(({ theme }) => ({
    padding: '2px 6px',
    borderRadius: 6,
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    gap: 4,
    '&:hover': {
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
    },
}));

const WebSearchBadgeRow = styled(Box)({
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 6,
});

const WebSearchBadgeChip = styled(Box)(({ theme }) => ({
    fontSize: '0.65rem',
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.action.selected,
    borderRadius: 4,
    padding: '1px 6px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
}));

const SourcesSection = styled(Box)(({ theme }) => ({
    borderTop: `1px solid ${theme.palette.divider}`,
    marginTop: 6,
    paddingTop: 4,
}));

const ResponseCopyButton = React.memo(function ResponseCopyButton({ content }: { content: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [content]);

    return (
        <ResponseCopyRow>
            <Tooltip title={copied ? 'Copied!' : 'Copy response'} placement="left">
                <ResponseCopyButtonBase size="small" onClick={handleCopy} aria-label="Copy response">
                    {copied
                        ? <CheckIcon size={13} />
                        : <CopyIcon size={13} />
                    }
                    <Typography component="span" sx={{ fontSize: '0.68rem', lineHeight: 1 }}>
                        {copied ? 'Copied' : 'Copy'}
                    </Typography>
                </ResponseCopyButtonBase>
            </Tooltip>
        </ResponseCopyRow>
    );
});

const DIFF_REVIEW_MESSAGES = [
    "Scan the upgrades.",
    "Inspect the implants.",
    "Review the reboots.",
    "Audit the augmentations.",
    "Verify the vectors.",
    "Process the protocols.",
    "Debug the droids.",
    "Assess the assimilations.",
    "Examine the exosuit edits.",
    "Approve the automaton alterations.",
];


const chatMarkdownComponents: Components = {
    code({ node, className, children, ...props }) {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';
        const isBlock = node?.position && String(children).includes('\n');

        if (language && isBlock) {
            const code = String(children).replace(/\n$/, '');
            return <CodeBlock language={language}>{code}</CodeBlock>;
        }

        return (
            <code className={className} {...props}>
                {children}
            </code>
        );
    },
};

const DiffTabBanner = styled(Box)(({ theme }) => ({
    textAlign: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 16,
    paddingRight: 16,
    backgroundColor: theme.palette.success.main,
    color: theme.palette.success.contrastText,
    borderRadius: 4,
}));

interface ChatMessagesProps {
    askMessages: AIMessage[];
    greeting: string;
    isAskLoading: boolean;
    askPhase: AskPhase;
    askWebSearchPhase: WebSearchPhase;
    webSearchEnabled: boolean;
    isEditLoading: boolean;
    editWebSearchPhase: WebSearchPhase;
    isCreateLoading: boolean;
    createPhase: CreatePhase;
    createComplete: boolean;
    createError: string | null;
    createFileName: string | null;
    createQuery: string | null;
    mode: AIChatMode;
    hasDiffTab: boolean;
    askError: string | null;
    editModeError: string | null;
    isMultiAgentLoading?: boolean;
    multiAgentPhase?: MultiAgentPhase;
    multiAgentError?: string | null;
    multiAgentAgentCount?: 4 | 16;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({
    askMessages,
    greeting,
    isAskLoading,
    askPhase,
    askWebSearchPhase,
    webSearchEnabled,
    isEditLoading,
    editWebSearchPhase,
    isCreateLoading,
    createPhase,
    createComplete,
    createError,
    createFileName,
    createQuery,
    mode,
    hasDiffTab,
    askError,
    editModeError,
    isMultiAgentLoading,
    multiAgentPhase,
    multiAgentError,
    multiAgentAgentCount = 4,
    messagesEndRef,
}: ChatMessagesProps) {
    const [diffReviewMessage] = useState(() =>
        DIFF_REVIEW_MESSAGES[Math.floor(Math.random() * DIFF_REVIEW_MESSAGES.length)]
    );

    const showGreeting = askMessages.length === 0 && !isAskLoading && !isEditLoading && !isCreateLoading && !isMultiAgentLoading && !createComplete && !hasDiffTab;

    return (
        <MessagesContainer>
            {showGreeting ? (
                <GreetingContainer>
                    {mode === 'ask' ? (
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Ask Mode
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                                Ask any question — each query is independent and self-contained.
                                Attach files for additional context.
                            </Typography>
                        </Box>
                    ) : mode === 'create' ? (
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Create Mode
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                                Describe what you want to create — a blog post, README, spec, story, letter, or anything else. Attach context files for richer output. The AI will generate a complete document and open it in a new tab.
                            </Typography>
                        </Box>
                    ) : mode === 'edit' ? (
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                Edit Mode
                            </Typography>
                            <Typography color="text.secondary" variant="body2">
                                Describe the changes you want — rewrite a section, add a table of contents, fix grammar, or restructure the document. The AI will modify the active file and open a diff tab so you can review and accept changes hunk by hunk.
                            </Typography>
                        </Box>
                    ) : (
                        <Typography color="text.secondary" variant="body2" sx={{ fontStyle: 'italic' }}>
                            {greeting}
                        </Typography>
                    )}
                </GreetingContainer>
            ) : (
                askMessages.map((msg) => (
                    <MessageBubble key={`${msg.role}-${msg.timestamp.getTime()}`} role={msg.role}>
                        {msg.role === 'assistant' ? (
                            <>
                                {msg.webSearchUsed && (
                                    <WebSearchBadgeRow>
                                        <WebSearchBadgeChip>
                                            <GlobeIcon size={10} />
                                            Web search included
                                        </WebSearchBadgeChip>
                                    </WebSearchBadgeRow>
                                )}
                                <ReactMarkdown components={chatMarkdownComponents}>{msg.content}</ReactMarkdown>
                                {msg.webSearchUsed && msg.sources && msg.sources.length > 0 && (
                                    <SourcesSection>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                                            Sources
                                        </Typography>
                                        {msg.sources.map((src, i) => {
                                            // Only allow http/https links from search results
                                            let isSafeLink = false;
                                            try {
                                                const parsed = new URL(src.link);
                                                isSafeLink = parsed.protocol === 'http:' || parsed.protocol === 'https:';
                                            } catch { /* ignore malformed URLs */ }
                                            return (
                                                <Typography key={src.link} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                    {i + 1}.{' '}
                                                    {isSafeLink ? (
                                                        <Box
                                                            component="a"
                                                            href="#"
                                                            onClick={(e: React.MouseEvent) => { e.preventDefault(); void window.electronAPI.openExternal(src.link); }}
                                                            sx={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
                                                        >
                                                            {src.title}
                                                        </Box>
                                                    ) : (
                                                        src.title
                                                    )}
                                                </Typography>
                                            );
                                        })}
                                    </SourcesSection>
                                )}
                                <ResponseCopyButton content={msg.content} />
                            </>
                        ) : (
                            <Typography variant="body2">{msg.content}</Typography>
                        )}
                    </MessageBubble>
                ))
            )}
            {isAskLoading && (askPhase || askWebSearchPhase) && (
                <AskProgress
                    askPhase={askPhase}
                    webSearchPhase={askWebSearchPhase}
                    webSearchEnabled={webSearchEnabled}
                />
            )}
            {isMultiAgentLoading && multiAgentPhase && (
                <MultiAgentProgress
                    phase={multiAgentPhase}
                    agentCount={multiAgentAgentCount}
                />
            )}
            {isEditLoading && (
                <EditProgress
                    webSearchPhase={editWebSearchPhase}
                    webSearchEnabled={webSearchEnabled}
                    isEditing={editWebSearchPhase === null}
                />
            )}
            {(isCreateLoading || createComplete) && createPhase && (
                <>
                    {createQuery && (
                        <MessageBubble role="user">
                            <Typography variant="body2">{createQuery}</Typography>
                        </MessageBubble>
                    )}
                    <CreateProgress
                        createPhase={createPhase}
                        webSearchEnabled={webSearchEnabled}
                    />
                </>
            )}
            {createComplete && createFileName && (
                <DiffTabBanner>
                    <Typography variant="body2">
                        Created — {createFileName}
                    </Typography>
                </DiffTabBanner>
            )}
            {createError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {createError}
                </Typography>
            )}
            {multiAgentError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {multiAgentError}
                </Typography>
            )}
            {askError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {askError}
                </Typography>
            )}
            {editModeError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {editModeError}
                </Typography>
            )}
            {hasDiffTab && (
                <DiffTabBanner>
                    <Typography variant="body2">
                        {diffReviewMessage}
                    </Typography>
                </DiffTabBanner>
            )}
            <div ref={messagesEndRef} />
        </MessagesContainer>
    );
}
