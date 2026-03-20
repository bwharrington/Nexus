import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, styled, Tooltip, useTheme as useMuiTheme } from '@mui/material';
import { ZoomInIcon, ZoomOutIcon, ResetIcon, PanIcon } from './AppIcons';
import mermaid from 'mermaid';

const DiagramWrapper = styled(Box)(({ theme }) => ({
    position: 'relative',
    margin: '16px 0',
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    overflow: 'hidden',
}));

const ControlsBar = styled(Box)(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    padding: '4px 8px',
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
}));

const ZoomLabel = styled('span')(({ theme }) => ({
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginRight: 8,
    minWidth: 45,
    textAlign: 'center',
}));

const MermaidContainer = styled(Box)<{ isDragging?: boolean }>(({ isDragging }) => ({
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    minHeight: 200,
    overflow: 'hidden',
    cursor: isDragging ? 'grabbing' : 'grab',
    '& svg': {
        maxWidth: 'none',
        height: 'auto',
        transformOrigin: 'center center',
        transition: 'transform 0.1s ease-out',
    },
}));

const ErrorContainer = styled(Box)(({ theme }) => ({
    padding: 16,
    margin: '16px 0',
    backgroundColor: theme.palette.mode === 'dark' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.05)',
    borderRadius: 8,
    border: `1px solid ${theme.palette.error.main}`,
    color: theme.palette.error.main,
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
}));

interface MermaidDiagramProps {
    chart: string;
}

// Counter for generating unique IDs
let mermaidIdCounter = 0;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [svg, setSvg] = useState<string>('');
    const idRef = useRef<string>(`mermaid-diagram-${mermaidIdCounter++}`);
    const muiTheme = useMuiTheme();
    
    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const panStartRef = useRef({ x: 0, y: 0 });

    const handleZoomIn = useCallback(() => {
        setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom(prev => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
    }, []);

    const handleResetView = useCallback(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left mouse button
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { ...pan };
        e.preventDefault();
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPan({
            x: panStartRef.current.x + dx,
            y: panStartRef.current.y + dy,
        });
    }, [isDragging]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            setZoom(prev => Math.max(MIN_ZOOM, Math.min(prev + delta, MAX_ZOOM)));
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const renderDiagram = async () => {
            if (!chart.trim()) {
                if (!cancelled) setError('Empty diagram definition');
                return;
            }

            try {
                // Configure mermaid theme based on current MUI theme mode
                const mermaidTheme = muiTheme.palette.mode === 'dark' ? 'dark' : 'default';
                mermaid.initialize({
                    startOnLoad: false,
                    theme: mermaidTheme,
                    securityLevel: 'strict',
                    fontFamily: 'inherit',
                });

                // Validate the diagram syntax first
                const isValid = await mermaid.parse(chart);

                // Guard: if chart changed or component unmounted while we were parsing, bail out
                if (cancelled) return;

                if (isValid) {
                    // Generate a unique ID for each render
                    const uniqueId = `${idRef.current}-${Date.now()}`;
                    const { svg: renderedSvg } = await mermaid.render(uniqueId, chart);

                    // Guard: don't update state if this render is now stale
                    if (cancelled) return;

                    setSvg(renderedSvg);
                    setError(null);
                    // Reset zoom and pan when diagram changes
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                }
            } catch (err) {
                if (cancelled) return;
                const errorMessage = err instanceof Error ? err.message : 'Failed to render Mermaid diagram';
                setError(errorMessage);
                setSvg('');
            }
        };

        renderDiagram();

        return () => {
            cancelled = true;
        };
    }, [chart, muiTheme.palette.mode]);

    if (error) {
        return (
            <ErrorContainer>
                <strong>Mermaid Diagram Error:</strong>
                <br />
                {error}
                <br />
                <br />
                <em>Original code:</em>
                <Box component="pre" sx={{ mt: 1 }}>{chart}</Box>
            </ErrorContainer>
        );
    }

    const zoomPercent = Math.round(zoom * 100);

    return (
        <DiagramWrapper>
            <ControlsBar>
                <Tooltip title="Drag to pan, Ctrl+Scroll to zoom" placement="left">
                    <PanIcon size={16} sx={{ color: 'text.secondary', mr: 1 }} />
                </Tooltip>
                <ZoomLabel>{zoomPercent}%</ZoomLabel>
                <Tooltip title="Zoom Out">
                    <span>
                        <IconButton 
                            size="small" 
                            onClick={handleZoomOut}
                            disabled={zoom <= MIN_ZOOM}
                        >
                            <ZoomOutIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Zoom In">
                    <span>
                        <IconButton 
                            size="small" 
                            onClick={handleZoomIn}
                            disabled={zoom >= MAX_ZOOM}
                        >
                            <ZoomInIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Reset View">
                    <IconButton size="small" onClick={handleResetView}>
                        <ResetIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </ControlsBar>
            <MermaidContainer
                ref={containerRef}
                isDragging={isDragging}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                onWheel={handleWheel}
            >
                <Box
                    sx={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                    }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                />
            </MermaidContainer>
        </DiagramWrapper>
    );
};

export default MermaidDiagram;
