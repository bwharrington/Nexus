import React, { useState } from 'react';
import { Box, Typography, CircularProgress, styled } from '@mui/material';
import ReactMarkdown, { Components } from 'react-markdown';
import type { AIMessage } from '../hooks/useAIChat';
import type { ResearchPhase, DeepeningProgress, InferenceResult } from '../hooks/useAIResearch';
import type { GoDeepPhase, GoDeepProgress as GoDeepProgressData, GoDeepAnalysis, GoDeepDepthLevel } from '../hooks/useAIGoDeeper';
import { CodeBlock } from './CodeBlock';
import { ResearchProgress } from './ResearchProgress';
import { GoDeepProgress } from './GoDeepProgress';
import { GoDeepButton } from './GoDeepButton';
<<<<<<< origin/Tech_Dissect
import { TechResearchProgress } from './TechResearchProgress';
import type { TechResearchPhase } from '../hooks/useAITechResearch';
=======
import { InsightForgeProgress } from './InsightForgeProgress';
import type { InsightForgePhase } from '../hooks/useAIInsightForge';
import type { SourceFetchProgress } from '../types/global';
>>>>>>> local

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

const EditLoadingContainer = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    gap: 8,
});

const LoadingCursor = styled('span')(({ theme }) => ({
    display: 'inline-block',
    width: '2px',
    height: '1em',
    backgroundColor: theme.palette.text.secondary,
    marginLeft: '1px',
    verticalAlign: 'text-bottom',
    '@keyframes blink': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0 },
    },
    animation: 'blink 1s step-end infinite',
}));

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
    messages: AIMessage[];
    greeting: string;
    isLoading: boolean;
    isEditLoading: boolean;
    isResearchLoading: boolean;
    researchPhase: ResearchPhase;
    deepeningProgress: DeepeningProgress | null;
    inferenceResult: InferenceResult | null;
    researchComplete: boolean;
    isGoDeepLoading: boolean;
    goDeepPhase: GoDeepPhase;
    goDeepProgress: GoDeepProgressData | null;
    goDeepAnalysis: GoDeepAnalysis | null;
    goDeepComplete: boolean;
    goDeepError: string | null;
    goDeepFileName: string | null;
    documentTopics?: string[];
    onGoDeeper: () => void;
    onTopicsContinue?: (topics: string[]) => void;
    depthLevel?: GoDeepDepthLevel;
    onDepthLevelChange?: (level: GoDeepDepthLevel) => void;
<<<<<<< origin/Tech_Dissect
    isTechResearchLoading: boolean;
    techResearchPhase: TechResearchPhase;
    techResearchComplete: boolean;
    techResearchError: string | null;
    techResearchFileName: string | null;
    techResearchQuery: string | null;
=======
    isInsightForgeLoading: boolean;
    insightForgePhase: InsightForgePhase;
    insightForgeComplete: boolean;
    insightForgeError: string | null;
    insightForgeFileName: string | null;
    insightForgeQuery: string | null;
    sourceFetchProgress?: SourceFetchProgress[];
    isWebSearchEnabled?: boolean;
>>>>>>> local
    hasDiffTab: boolean;
    loadingDisplayText: string;
    error: string | null;
    editModeError: string | null;
    researchError: string | null;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatMessages({
    messages,
    greeting,
    isLoading,
    isEditLoading,
    isResearchLoading,
    researchPhase,
    deepeningProgress,
    inferenceResult,
    researchComplete,
    isGoDeepLoading,
    goDeepPhase,
    goDeepProgress,
    goDeepAnalysis,
    goDeepComplete,
    goDeepError,
    goDeepFileName,
    documentTopics,
    onGoDeeper,
    onTopicsContinue,
    depthLevel,
    onDepthLevelChange,
<<<<<<< origin/Tech_Dissect
    isTechResearchLoading,
    techResearchPhase,
    techResearchComplete,
    techResearchError,
    techResearchFileName,
    techResearchQuery,
=======
    isInsightForgeLoading,
    insightForgePhase,
    insightForgeComplete,
    insightForgeError,
    insightForgeFileName,
    insightForgeQuery,
    sourceFetchProgress,
    isWebSearchEnabled,
>>>>>>> local
    hasDiffTab,
    loadingDisplayText,
    error,
    editModeError,
    researchError,
    messagesEndRef,
}: ChatMessagesProps) {
    const [diffReviewMessage] = useState(() =>
        DIFF_REVIEW_MESSAGES[Math.floor(Math.random() * DIFF_REVIEW_MESSAGES.length)]
    );

    const showGreeting = messages.length === 0 && !isLoading && !isEditLoading && !isResearchLoading && !isGoDeepLoading && !goDeepComplete && !researchComplete && !isTechResearchLoading && !techResearchComplete && !hasDiffTab;

    return (
        <MessagesContainer>
            {showGreeting ? (
                <GreetingContainer>
                    <Typography color="text.secondary" variant="body2" sx={{ fontStyle: 'italic' }}>
                        {greeting}
                    </Typography>
                </GreetingContainer>
            ) : (
                messages.map((msg, idx) => (
                    <MessageBubble key={idx} role={msg.role}>
                        {msg.role === 'assistant' ? (
                            <ReactMarkdown components={chatMarkdownComponents}>{msg.content}</ReactMarkdown>
                        ) : (
                            <Typography variant="body2">{msg.content}</Typography>
                        )}
                    </MessageBubble>
                ))
            )}
            {isLoading && (
                <ChatLoadingContainer>
                    <CircularProgress size={24} />
                </ChatLoadingContainer>
            )}
            {isEditLoading && (
                <EditLoadingContainer>
                    <CircularProgress size={24} color="success" />
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            fontFamily: 'monospace',
                            minHeight: '1.5em',
                            textAlign: 'center',
                        }}
                    >
                        {loadingDisplayText}
                        <LoadingCursor />
                    </Typography>
                </EditLoadingContainer>
            )}
            {(isGoDeepLoading || goDeepComplete) && (
                <GoDeepProgress
                    goDeepPhase={goDeepPhase}
                    goDeepProgress={goDeepProgress}
                    goDeepAnalysis={goDeepAnalysis}
                    fileName={goDeepFileName ?? undefined}
                    documentTopics={documentTopics}
                    onTopicsContinue={onTopicsContinue}
                />
            )}
            {!isGoDeepLoading && !goDeepComplete && (isResearchLoading || researchComplete) && (
                <ResearchProgress
                    researchPhase={researchPhase}
                    deepeningProgress={deepeningProgress}
                    inferenceResult={inferenceResult}
                />
            )}
            {(isTechResearchLoading || techResearchComplete) && techResearchPhase && (
                <>
                    {techResearchQuery && (
                        <MessageBubble role="user">
                            <Typography variant="body2">{techResearchQuery}</Typography>
                        </MessageBubble>
                    )}
<<<<<<< origin/Tech_Dissect
                    <TechResearchProgress techResearchPhase={techResearchPhase} />
=======
                    <InsightForgeProgress
                        insightForgePhase={insightForgePhase}
                        sourceFetchProgress={sourceFetchProgress}
                        isWebSearchEnabled={isWebSearchEnabled}
                    />
>>>>>>> local
                </>
            )}
            {techResearchComplete && techResearchFileName && (
                <DiffTabBanner>
                    <Typography variant="body2">
                        Tech Research complete — {techResearchFileName}
                    </Typography>
                </DiffTabBanner>
            )}
            {(researchComplete || goDeepComplete) && !isResearchLoading && !isGoDeepLoading && (
                <GoDeepButton
                    onClick={onGoDeeper}
                    fileName={goDeepFileName ?? undefined}
                    depthLevel={depthLevel}
                    onDepthLevelChange={onDepthLevelChange}
                />
            )}
            {error && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {error}
                </Typography>
            )}
            {editModeError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {editModeError}
                </Typography>
            )}
            {researchError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {researchError}
                </Typography>
            )}
            {goDeepError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {goDeepError}
                </Typography>
            )}
            {techResearchError && (
                <Typography color="error" variant="body2" sx={{ textAlign: 'center' }}>
                    {techResearchError}
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
