import React, { useMemo } from 'react';
import { Box, Typography, styled, keyframes } from '@mui/material';
import type { MultiAgentPhase } from '../hooks/useAIMultiAgent';
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

// --- Styled components (same pattern as AskProgress) ---

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

const StepDot = styled(Box)(({ theme }) => ({
    width: 12,
    height: 12,
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: theme.palette.primary.main,
    animation: `${pulse} 1.5s ease-in-out infinite`,
    boxShadow: `0 0 8px ${theme.palette.primary.main}`,
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

// --- Component ---

interface MultiAgentProgressProps {
    phase: MultiAgentPhase;
    agentCount: 4 | 16;
}

export const MultiAgentProgress = React.memo(function MultiAgentProgress({
    phase,
    agentCount,
}: MultiAgentProgressProps) {
    const isWorking = phase === 'agents-working';
    const messagePool = useMemo(() => WORKING_MESSAGES, []);
    const { displayText } = useEditLoadingMessage(isWorking, messagePool);

    if (!isWorking) return null;

    return (
        <ProgressContainer>
            <StepRow>
                <StepIndicatorColumn>
                    <StepDot />
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
