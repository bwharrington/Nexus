import React, { useMemo } from 'react';
import { Box, Typography, styled, keyframes } from '@mui/material';
import type { MultiAgentPhase, MultiAgentStreamState } from '../hooks/useAIMultiAgent';
import { useEditLoadingMessage } from '../hooks/useEditLoadingMessage';

const WORKING_MESSAGES = [
    'Agents collaborating...',
    'Research in progress...',
    'Agents cross-referencing...',
    'Synthesizing findings...',
    'Gathering perspectives...',
    'Agents deliberating...',
    'Deep analysis underway...',
    'Agents comparing notes...',
] as const;

// --- Styled components ---

type StepStatus = 'pending' | 'active' | 'complete';

const pulse = keyframes`
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.15); }
`;

const ProgressContainer = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    padding: '16px 12px',
    gap: 0,
});

const StepRow = styled(Box)({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
});

const StepIndicatorColumn = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 20,
    flexShrink: 0,
});

const StepDot = styled(Box)<{ status?: StepStatus }>(({ theme, status = 'active' }) => ({
    width: 12,
    height: 12,
    borderRadius: '50%',
    flexShrink: 0,
    ...(status === 'pending' && {
        backgroundColor: theme.palette.mode === 'dark'
            ? theme.palette.grey[700]
            : theme.palette.grey[400],
    }),
    ...(status === 'active' && {
        backgroundColor: theme.palette.primary.main,
        animation: `${pulse} 1.5s ease-in-out infinite`,
        boxShadow: `0 0 8px ${theme.palette.primary.main}`,
    }),
    ...(status === 'complete' && {
        backgroundColor: theme.palette.success.main,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        color: theme.palette.success.contrastText,
        '&::after': {
            content: '"\\2713"',
        },
    }),
}));

const StepConnector = styled(Box)<{ status?: StepStatus }>(({ theme, status = 'active' }) => ({
    width: 2,
    flex: 1,
    minHeight: 8,
    backgroundColor: status === 'complete'
        ? theme.palette.success.main
        : theme.palette.mode === 'dark'
            ? theme.palette.grey[700]
            : theme.palette.grey[300],
}));

const StepContent = styled(Box)({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingBottom: 8,
    minWidth: 0,
    flex: 1,
});

const TypewriterText = styled(Typography)(({ theme }) => ({
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    color: theme.palette.text.secondary,
    minHeight: '1.2em',
}));

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

const AgentBadge = styled(Typography)(({ theme }) => ({
    fontSize: '0.7rem',
    color: theme.palette.text.disabled,
    fontFamily: 'monospace',
}));

const ToolChip = styled(Box)(({ theme }) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 8px',
    borderRadius: 4,
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    backgroundColor: theme.palette.mode === 'dark'
        ? theme.palette.grey[800]
        : theme.palette.grey[200],
    color: theme.palette.text.secondary,
}));

const StreamInfoRow = styled(Box)({
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
});

// --- Component ---

interface MultiAgentProgressProps {
    phase: MultiAgentPhase;
    agentCount: 4 | 16;
    streamState?: MultiAgentStreamState | null;
}

export const MultiAgentProgress = React.memo(function MultiAgentProgress({
    phase,
    agentCount,
    streamState,
}: MultiAgentProgressProps) {
    const isWorking = phase === 'agents-working';
    const messagePool = useMemo(() => WORKING_MESSAGES, []);
    const { displayText } = useEditLoadingMessage(isWorking, messagePool);

    if (!isWorking) return null;

    const hasStreamData = streamState != null && streamState.eventCount > 0;

    // --- Streaming mode: show real agent activity ---
    if (hasStreamData) {
        const { activeToolCalls, agentActivities, reasoningTokens, eventCount, contentPreview } = streamState;
        const hasContent = contentPreview.length > 0;

        return (
            <ProgressContainer>
                {/* Header step */}
                <StepRow>
                    <StepIndicatorColumn>
                        <StepDot status={hasContent ? 'complete' : 'active'} />
                        {(activeToolCalls.length > 0 || agentActivities.length > 0) && (
                            <StepConnector status={hasContent ? 'complete' : 'active'} />
                        )}
                    </StepIndicatorColumn>
                    <StepContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Multi-Agent Research
                            </Typography>
                            <AgentBadge>{agentCount} agents</AgentBadge>
                            {reasoningTokens > 0 && (
                                <AgentBadge>{reasoningTokens.toLocaleString()} reasoning tokens</AgentBadge>
                            )}
                            <AgentBadge>{eventCount} events</AgentBadge>
                        </Box>

                        {/* Tool calls */}
                        {activeToolCalls.length > 0 && (
                            <StreamInfoRow>
                                {activeToolCalls.map(tool => (
                                    <ToolChip key={tool}>{tool}</ToolChip>
                                ))}
                            </StreamInfoRow>
                        )}
                    </StepContent>
                </StepRow>

                {/* Agent activity steps */}
                {agentActivities.map((activity, idx) => {
                    const isLast = idx === agentActivities.length - 1 && !hasContent;
                    return (
                        <StepRow key={activity}>
                            <StepIndicatorColumn>
                                <StepDot status={isLast ? 'active' : 'complete'} />
                                {!isLast && <StepConnector status="complete" />}
                                {isLast && hasContent && <StepConnector status="active" />}
                            </StepIndicatorColumn>
                            <StepContent>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        fontSize: '0.8rem',
                                        fontFamily: 'monospace',
                                        color: 'text.secondary',
                                    }}
                                >
                                    {activity}
                                </Typography>
                            </StepContent>
                        </StepRow>
                    );
                })}

                {/* Content preview when response starts streaming */}
                {hasContent && (
                    <StepRow>
                        <StepIndicatorColumn>
                            <StepDot status="active" />
                        </StepIndicatorColumn>
                        <StepContent>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Composing Response
                            </Typography>
                            <TypewriterText>
                                {contentPreview.length >= 200
                                    ? contentPreview + '...'
                                    : contentPreview}
                                <LoadingCursor />
                            </TypewriterText>
                        </StepContent>
                    </StepRow>
                )}
            </ProgressContainer>
        );
    }

    // --- Fallback mode: generic rotating messages ---
    return (
        <ProgressContainer>
            <StepRow>
                <StepIndicatorColumn>
                    <StepDot status="active" />
                </StepIndicatorColumn>
                <StepContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Multi-Agent Research
                        </Typography>
                        <AgentBadge>{agentCount} agents</AgentBadge>
                    </Box>
                    <TypewriterText>
                        {displayText}
                        <LoadingCursor />
                    </TypewriterText>
                </StepContent>
            </StepRow>
        </ProgressContainer>
    );
});
