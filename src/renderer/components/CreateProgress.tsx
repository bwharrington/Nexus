import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Typography, styled, keyframes } from '@mui/material';
import type { CreatePhase } from '../hooks/useAICreate';
import { useEditLoadingMessage } from '../hooks/useEditLoadingMessage';

type StepStatus = 'pending' | 'active' | 'complete';

// ---------------------------------------------------------------------------
// Message pools for each phase
// ---------------------------------------------------------------------------

const ANALYZING_MESSAGES = [
    'Understanding your request...',
    'Planning the approach...',
    'Mapping out the document...',
    'Classifying document type...',
    'Analyzing intent...',
] as const;

const RESEARCHING_MESSAGES = [
    'Searching for relevant sources...',
    'Gathering research material...',
    'Cross-referencing findings...',
    'Reading key articles...',
    'Synthesizing research notes...',
    'Pulling fresh data...',
] as const;

const OUTLINING_MESSAGES = [
    'Structuring the document...',
    'Planning sections...',
    'Mapping research to outline...',
    'Organizing content flow...',
    'Building document blueprint...',
] as const;

const CREATING_MESSAGES = [
    'Generating your content...',
    'Crafting the document...',
    'Writing sections...',
    'Building structure...',
    'Adding detail...',
    'Composing paragraphs...',
] as const;

const REVIEWING_MESSAGES = [
    'Checking for completeness...',
    'Verifying coverage...',
    'Final quality check...',
    'Reviewing against outline...',
] as const;

const NAMING_MESSAGES = [
    'Generating filename...',
    'Picking a descriptive title...',
    'Naming your document...',
] as const;

// ---------------------------------------------------------------------------
// Step type (matches non-terminal CreatePhase values)
// ---------------------------------------------------------------------------

type ActiveStep = 'analyzing' | 'researching' | 'outlining' | 'creating' | 'reviewing' | 'naming';

interface PhaseTiming {
    start: number;
    end?: number;
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

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

const StepDot = styled(Box)<{ status: StepStatus }>(({ theme, status }) => ({
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
        backgroundColor: theme.palette.secondary.main,
        animation: `${pulse} 1.5s ease-in-out infinite`,
        boxShadow: `0 0 8px ${theme.palette.secondary.main}`,
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

const StepConnector = styled(Box)<{ status: StepStatus }>(({ theme, status }) => ({
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

const StepLabelRow = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
});

const TimeBadge = styled(Typography)(({ theme }) => ({
    fontSize: '0.7rem',
    color: theme.palette.text.disabled,
    fontFamily: 'monospace',
}));

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessagePool(step: ActiveStep): readonly string[] {
    switch (step) {
        case 'analyzing':  return ANALYZING_MESSAGES;
        case 'researching': return RESEARCHING_MESSAGES;
        case 'outlining':  return OUTLINING_MESSAGES;
        case 'creating':   return CREATING_MESSAGES;
        case 'reviewing':  return REVIEWING_MESSAGES;
        case 'naming':     return NAMING_MESSAGES;
        default:           return CREATING_MESSAGES;
    }
}

function getActiveStep(createPhase: CreatePhase): ActiveStep | null {
    if (createPhase === 'complete' || createPhase === null) return null;
    return createPhase as ActiveStep;
}

function getStepStatus(
    step: ActiveStep,
    createPhase: CreatePhase,
    stepOrder: ActiveStep[],
): StepStatus {
    if (createPhase === 'complete') return 'complete';
    if (createPhase === null) return 'pending';

    const stepIndex = stepOrder.indexOf(step);
    const currentIndex = stepOrder.indexOf(createPhase as ActiveStep);

    if (stepIndex < 0 || currentIndex < 0) return 'pending';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
}

function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CreateProgressProps {
    createPhase: CreatePhase;
    webSearchEnabled?: boolean;
}

export const CreateProgress = React.memo(function CreateProgress({
    createPhase,
    webSearchEnabled = false,
}: CreateProgressProps) {
    const activeStep = getActiveStep(createPhase);
    const isWorking = activeStep !== null;
    const messagePool = useMemo(
        () => getMessagePool(activeStep ?? 'creating'),
        [activeStep],
    );
    const { displayText } = useEditLoadingMessage(isWorking, messagePool);

    const timingsRef = useRef<Record<string, PhaseTiming>>({});
    const prevStepRef = useRef<ActiveStep | null>(null);

    // Build step configuration based on mode (quick vs deep)
    const steps: Array<{ key: ActiveStep; label: string }> = useMemo(() =>
        webSearchEnabled
            ? [
                { key: 'analyzing',  label: 'Analyzing Request' },
                { key: 'researching', label: 'Researching' },
                { key: 'outlining',  label: 'Building Outline' },
                { key: 'creating',   label: 'Writing Document' },
                { key: 'reviewing',  label: 'Reviewing' },
                { key: 'naming',     label: 'Naming Document' },
            ]
            : [
                { key: 'analyzing', label: 'Analyzing Request' },
                { key: 'creating',  label: 'Generating Content' },
                { key: 'naming',    label: 'Naming Document' },
            ],
    [webSearchEnabled]);

    const stepOrder = useMemo(() => steps.map(s => s.key), [steps]);

    useEffect(() => {
        const prev = prevStepRef.current;
        const curr = activeStep;

        if (prev !== curr) {
            if (prev && timingsRef.current[prev] && !timingsRef.current[prev].end) {
                timingsRef.current[prev].end = Date.now();
            }
            if (curr) {
                // Reset timings at the start of a fresh request
                if (curr === 'analyzing') {
                    timingsRef.current = {};
                }
                if (!timingsRef.current[curr]) {
                    timingsRef.current[curr] = { start: Date.now() };
                }
            }
            prevStepRef.current = curr;
        }
    }, [activeStep]);

    const getPhaseElapsed = (phase: string): string | null => {
        const timing = timingsRef.current[phase];
        if (!timing) return null;
        if (timing.end) return formatElapsed(timing.end - timing.start);
        return null;
    };

    const getTotalElapsed = (): string | null => {
        const entries = Object.values(timingsRef.current);
        if (entries.length === 0) return null;
        const firstStart = Math.min(...entries.map(t => t.start));
        const lastEnd = Math.max(...entries.filter(t => t.end).map(t => t.end!));
        if (!lastEnd) return null;
        return formatElapsed(lastEnd - firstStart);
    };

    const isComplete = createPhase === 'complete';
    const completeStatus: StepStatus = isComplete ? 'complete' : 'pending';

    return (
        <ProgressContainer>
            {steps.map((step) => {
                const status = getStepStatus(step.key, createPhase, stepOrder);
                const label = step.label;
                const elapsed = status === 'complete' ? getPhaseElapsed(step.key) : null;
                const isActive = status === 'active';

                return (
                    <React.Fragment key={step.key}>
                        <StepRow>
                            <StepIndicatorColumn>
                                <StepDot status={status} />
                                <StepConnector status={status} />
                            </StepIndicatorColumn>
                            <StepContent>
                                <StepLabelRow>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            fontWeight: isActive ? 600 : 400,
                                            opacity: status === 'pending' ? 0.5 : 1,
                                        }}
                                    >
                                        {label}
                                    </Typography>
                                    {elapsed && <TimeBadge>{elapsed}</TimeBadge>}
                                </StepLabelRow>
                                {isActive && (
                                    <TypewriterText>
                                        {displayText}
                                        <LoadingCursor />
                                    </TypewriterText>
                                )}
                            </StepContent>
                        </StepRow>
                    </React.Fragment>
                );
            })}

            {/* Final "Complete" step */}
            <StepRow>
                <StepIndicatorColumn>
                    <StepDot status={completeStatus} />
                </StepIndicatorColumn>
                <StepContent>
                    <StepLabelRow>
                        <Typography
                            variant="body2"
                            sx={{
                                fontWeight: isComplete ? 600 : 400,
                                opacity: isComplete ? 1 : 0.5,
                                color: isComplete ? 'success.main' : undefined,
                            }}
                        >
                            Document Created
                        </Typography>
                        {isComplete && getTotalElapsed() && (
                            <TimeBadge>{getTotalElapsed()}</TimeBadge>
                        )}
                    </StepLabelRow>
                </StepContent>
            </StepRow>
        </ProgressContainer>
    );
});
