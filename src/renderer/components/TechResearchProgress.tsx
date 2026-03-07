import React, { useEffect, useRef, useMemo } from 'react';
import { Box, Typography, styled, keyframes } from '@mui/material';
<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
import type { TechResearchPhase } from '../hooks/useAITechResearch';
=======
import type { InsightForgePhase } from '../hooks/useAIInsightForge';
import type { SourceFetchProgress } from '../types/global';
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
import { useEditLoadingMessage } from '../hooks/useEditLoadingMessage';

type StepStatus = 'pending' | 'active' | 'complete';

<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
const PHASE_ORDER: TechResearchPhase[] = ['scoping', 'extraction', 'analysis', 'assembly'];
=======
const FULL_PHASE_ORDER: InsightForgePhase[] = ['scoping', 'discovery', 'fetching', 'extraction', 'analysis', 'assembly'];
const MINIMAL_PHASE_ORDER: InsightForgePhase[] = ['scoping', 'extraction', 'analysis', 'assembly'];
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx

const PHASE_LABELS: Record<string, string> = {
    scoping:    'Scoping Query & Blueprint',
    discovery:  'Discovering Sources',
    fetching:   'Fetching Documentation',
    extraction: 'Extracting Technical Details',
    analysis:   'Deep Analysis',
    assembly:   'Assembling Markdown + Filename',
};

const SCOPING_MESSAGES = [
    'Parsing your query...',
    'Mapping coverage areas...',
    'Prioritizing source types...',
    'Identifying key terms...',
] as const;

const DISCOVERY_MESSAGES = [
    'Generating search queries...',
    'Searching for documentation...',
    'Finding official references...',
    'Locating primary sources...',
] as const;

const FETCHING_MESSAGES = [
    'Downloading documentation pages...',
    'Extracting content from sources...',
    'Parsing reference materials...',
    'Building source context...',
] as const;

const EXTRACTION_MESSAGES = [
    'Extracting mechanics from knowledge base...',
    'Pulling implementation details...',
    'Sourcing edge case data...',
    'Gathering configuration specifics...',
<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
    // Note: In a future release this step will use live web search (see WEB_SEARCH_PLACEHOLDER in useAITechResearch.ts)
=======
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
] as const;

const ANALYSIS_MESSAGES = [
    'Analyzing core mechanics...',
    'Writing pitfall analysis...',
    'Documenting usage patterns...',
    'Building implementation guide...',
    'Analyzing failure modes...',
    'Mapping ecosystem context...',
] as const;

const ASSEMBLY_MESSAGES = [
    'Assembling template...',
    'Curating resources...',
    'Generating filename...',
    'Finalizing document...',
] as const;

interface PhaseTiming {
    start: number;
    end?: number;
}

// --- Styled components (same pattern as ResearchProgress.tsx) ---

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
        backgroundColor: theme.palette.info.main,
        animation: `${pulse} 1.5s ease-in-out infinite`,
        boxShadow: `0 0 8px ${theme.palette.info.main}`,
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

const SourceCard = styled(Box)(({ theme }) => ({
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 6,
    padding: '8px 10px',
    marginTop: 6,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
}));

const SourceRow = styled(Box)({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
});

const StatusDot = styled(Box)<{ dotStatus: string }>(({ theme, dotStatus }) => ({
    width: 7,
    height: 7,
    borderRadius: '50%',
    flexShrink: 0,
    ...(dotStatus === 'pending' && {
        backgroundColor: theme.palette.grey[500],
    }),
    ...(dotStatus === 'fetching' && {
        backgroundColor: theme.palette.info.main,
        animation: `${pulse} 1.5s ease-in-out infinite`,
    }),
    ...(dotStatus === 'done' && {
        backgroundColor: theme.palette.success.main,
    }),
    ...(dotStatus === 'failed' && {
        backgroundColor: theme.palette.error.main,
    }),
}));

const SourceTitle = styled(Typography)({
    fontSize: '0.72rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
});

const SizeBadge = styled(Typography)(({ theme }) => ({
    fontSize: '0.65rem',
    color: theme.palette.text.disabled,
    fontFamily: 'monospace',
    flexShrink: 0,
}));

// --- Component ---

<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
interface TechResearchProgressProps {
    techResearchPhase: TechResearchPhase;
=======
interface InsightForgeProgressProps {
    insightForgePhase: InsightForgePhase;
    sourceFetchProgress?: SourceFetchProgress[];
    isWebSearchEnabled?: boolean;
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
}

function getMessagePool(phase: TechResearchPhase): readonly string[] {
    switch (phase) {
        case 'scoping':    return SCOPING_MESSAGES;
        case 'discovery':  return DISCOVERY_MESSAGES;
        case 'fetching':   return FETCHING_MESSAGES;
        case 'extraction': return EXTRACTION_MESSAGES;
        case 'analysis':   return ANALYSIS_MESSAGES;
        case 'assembly':   return ASSEMBLY_MESSAGES;
        default:           return ANALYSIS_MESSAGES;
    }
}

<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
function getStepStatus(phase: TechResearchPhase, stepPhase: TechResearchPhase): StepStatus {
=======
function getStepStatus(phase: InsightForgePhase, stepPhase: InsightForgePhase, phaseOrder: InsightForgePhase[]): StepStatus {
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
    if (phase === 'complete') return 'complete';
    const currentIndex = phaseOrder.indexOf(phase);
    const stepIndex = phaseOrder.indexOf(stepPhase);
    if (currentIndex < 0 || stepIndex < 0) return 'pending';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
export const TechResearchProgress = React.memo(function TechResearchProgress({
    techResearchPhase,
}: TechResearchProgressProps) {
    const isWorking = techResearchPhase !== null && techResearchPhase !== 'complete';
    const messagePool = useMemo(() => getMessagePool(techResearchPhase), [techResearchPhase]);
=======
export const InsightForgeProgress = React.memo(function InsightForgeProgress({
    insightForgePhase,
    sourceFetchProgress,
    isWebSearchEnabled,
}: InsightForgeProgressProps) {
    const isWorking = insightForgePhase !== null && insightForgePhase !== 'complete';
    const messagePool = useMemo(() => getMessagePool(insightForgePhase), [insightForgePhase]);
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
    const { displayText } = useEditLoadingMessage(isWorking, messagePool);

    const phaseOrder = isWebSearchEnabled ? FULL_PHASE_ORDER : MINIMAL_PHASE_ORDER;

    // Track phase timings
    const timingsRef = useRef<Record<string, PhaseTiming>>({});
    const prevPhaseRef = useRef<TechResearchPhase>(null);

    useEffect(() => {
        const prev = prevPhaseRef.current;
        const curr = techResearchPhase;

        if (prev !== curr) {
            if (prev && prev !== 'complete' && timingsRef.current[prev] && !timingsRef.current[prev].end) {
                timingsRef.current[prev].end = Date.now();
            }
            if (curr && curr !== 'complete') {
                timingsRef.current[curr] = { start: Date.now() };
            }
            if (curr === 'scoping' && prev !== 'scoping') {
                timingsRef.current = {};
                timingsRef.current[curr] = { start: Date.now() };
            }
            prevPhaseRef.current = curr;
        }
    }, [techResearchPhase]);

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

    const isComplete = techResearchPhase === 'complete';
    const completeStatus: StepStatus = isComplete ? 'complete' : 'pending';

    // Show source card during/after fetching phase when we have progress data
    const showSourceCard = sourceFetchProgress && sourceFetchProgress.length > 0
        && (insightForgePhase === 'fetching' || getStepStatus(insightForgePhase, 'fetching', phaseOrder) === 'complete');

    return (
        <ProgressContainer>
<<<<<<< origin/Tech_Dissect:src/renderer/components/TechResearchProgress.tsx
            {PHASE_ORDER.map((stepPhase) => {
                const status = getStepStatus(techResearchPhase, stepPhase);
=======
            {phaseOrder.map((stepPhase) => {
                const status = getStepStatus(insightForgePhase, stepPhase, phaseOrder);
>>>>>>> local:src/renderer/components/InsightForgeProgress.tsx
                const label = PHASE_LABELS[stepPhase!] || stepPhase;
                const elapsed = status === 'complete' ? getPhaseElapsed(stepPhase!) : null;
                const isActive = status === 'active';
                const isFetchingStep = stepPhase === 'fetching';

                return (
                    <React.Fragment key={stepPhase}>
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
                                {isFetchingStep && showSourceCard && (
                                    <SourceCard>
                                        {sourceFetchProgress!.map((src) => (
                                            <SourceRow key={src.url}>
                                                <StatusDot dotStatus={src.status} />
                                                <SourceTitle
                                                    sx={{
                                                        color: src.status === 'failed' ? 'error.main' : 'text.secondary',
                                                    }}
                                                >
                                                    {src.title || src.url}
                                                </SourceTitle>
                                                {src.status === 'done' && src.byteSize != null && (
                                                    <SizeBadge>{formatBytes(src.byteSize)}</SizeBadge>
                                                )}
                                                {src.status === 'failed' && (
                                                    <SizeBadge sx={{ color: 'error.main' }}>failed</SizeBadge>
                                                )}
                                            </SourceRow>
                                        ))}
                                    </SourceCard>
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
                            Tech Research Complete
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
