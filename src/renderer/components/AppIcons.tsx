import React from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';
import type { LucideIcon } from 'lucide-react';
import {
    Bold,
    Italic,
    Strikethrough,
    Code2,
    Heading1,
    TextQuote,
    List,
    ListOrdered,
    SquareCheckBig,
    Link2,
    Image,
    Table2,
    Minus,
    Undo2,
    Redo2,
    Search,
    Info,
    TriangleAlert,
    FilePlus2,
    FolderOpen,
    Save,
    SaveAll,
    X,
    Files,
    Settings,
    Moon,
    Sun,
    Square,
    Bug,
    FileText,
    Bot,
    ChevronUp,
    ChevronDown,
    Check,
    CheckCheck,
    Grip,
    SendHorizontal,
    Trash2,
    Paperclip,
    Pencil,
    Eye,
    EyeOff,
    CircleCheckBig,
    Plus,
    LocateFixed,
    Move,
    History,
    FileDown,
    PanelRightOpen,
    PanelRightClose,
    FileDiff,
    RefreshCw,
    Telescope,
    Copy,
    ClipboardCopy,
    ClipboardList,
    FolderPlus,
    FolderClosed,
    ChevronRight,
    ArrowDownAZ,
    ArrowUpZA,
    ChevronsDownUp,
    ChevronsUpDown,
    FilePlus,
    PanelLeftOpen,
    PanelLeftClose,
    FolderInput,
} from 'lucide-react';

type MuiFontSize = 'inherit' | 'small' | 'medium' | 'large';

const FONT_SIZE_MAP: Record<Exclude<MuiFontSize, 'inherit'>, number> = {
    small: 20,
    medium: 24,
    large: 35,
};

const DEFAULT_STROKE_WIDTH = 2;

export interface AppIconProps {
    fontSize?: MuiFontSize;
    size?: number;
    sx?: SxProps<Theme>;
    strokeWidth?: number;
    className?: string;
    color?: string;
    title?: string;
    role?: React.AriaRole;
    'aria-label'?: string;
    'aria-hidden'?: boolean;
    onClick?: React.MouseEventHandler<SVGSVGElement>;
}

function resolveSize(fontSize?: MuiFontSize, explicitSize?: number): number | string {
    if (typeof explicitSize === 'number') {
        return explicitSize;
    }
    if (!fontSize || fontSize === 'medium') {
        return FONT_SIZE_MAP.medium;
    }
    if (fontSize === 'inherit') {
        return '1em';
    }
    return FONT_SIZE_MAP[fontSize];
}

function createIcon(icon: LucideIcon) {
    return React.forwardRef<SVGSVGElement, AppIconProps>(function AppIcon(
        { fontSize = 'medium', size, sx, strokeWidth = DEFAULT_STROKE_WIDTH, ...restProps },
        ref
    ) {
        const mergedSx = [
            {
                display: 'inline-block',
                flexShrink: 0,
            },
            sx,
        ] as SxProps<Theme>;

        return (
            <Box
                ref={ref as any}
                component={icon}
                size={resolveSize(fontSize, size)}
                strokeWidth={strokeWidth}
                fill="none"
                sx={mergedSx}
                {...restProps}
            />
        );
    });
}

// MUI-compat aliases used by current component code.
export const FormatBoldIcon = createIcon(Bold);
export const FormatItalicIcon = createIcon(Italic);
export const FormatStrikethroughIcon = createIcon(Strikethrough);
export const CodeIcon = createIcon(Code2);
export const TitleIcon = createIcon(Heading1);
export const FormatQuoteIcon = createIcon(TextQuote);
export const FormatListBulletedIcon = createIcon(List);
export const FormatListNumberedIcon = createIcon(ListOrdered);
export const CheckBoxIcon = createIcon(SquareCheckBig);
export const LinkIcon = createIcon(Link2);
export const ImageIcon = createIcon(Image);
export const TableChartIcon = createIcon(Table2);
export const HorizontalRuleIcon = createIcon(Minus);
export const UndoIcon = createIcon(Undo2);
export const RedoIcon = createIcon(Redo2);
export const SearchIcon = createIcon(Search);
export const InfoIcon = createIcon(Info);
export const WarningIcon = createIcon(TriangleAlert);
export const NoteAddIcon = createIcon(FilePlus2);
export const FolderOpenIcon = createIcon(FolderOpen);
export const SaveIcon = createIcon(Save);
export const SaveAsIcon = createIcon(SaveAll);
export const CloseIcon = createIcon(X);
export const TabUnselectedIcon = createIcon(Files);
export const SettingsIcon = createIcon(Settings);
export const Brightness4Icon = createIcon(Moon);
export const Brightness7Icon = createIcon(Sun);
export const MinimizeIcon = createIcon(Minus);
export const CropSquareIcon = createIcon(Square);
export const BugReportIcon = createIcon(Bug);
export const DescriptionIcon = createIcon(FileText);
export const SmartToyIcon = createIcon(Bot);
export const KeyboardArrowUpIcon = createIcon(ChevronUp);
export const KeyboardArrowDownIcon = createIcon(ChevronDown);
export const CheckIcon = createIcon(Check);
export const DoneAllIcon = createIcon(CheckCheck);
export const DragIndicatorIcon = createIcon(Grip);
export const ExpandLessIcon = createIcon(ChevronUp);
export const ExpandMoreIcon = createIcon(ChevronDown);
export const SendIcon = createIcon(SendHorizontal);
export const DeleteOutlineIcon = createIcon(Trash2);
export const DeleteIcon = createIcon(Trash2);
export const AttachFileIcon = createIcon(Paperclip);
export const EditIcon = createIcon(Pencil);
export const WarningAmberIcon = createIcon(TriangleAlert);
export const VisibilityIcon = createIcon(Eye);
export const VisibilityOffIcon = createIcon(EyeOff);
export const CheckCircleIcon = createIcon(CircleCheckBig);
export const ZoomInIcon = createIcon(Plus);
export const ZoomOutIcon = createIcon(Minus);
export const ResetIcon = createIcon(LocateFixed);
export const PanIcon = createIcon(Move);
export const HistoryIcon = createIcon(History);
export const PictureAsPdfIcon = createIcon(FileDown);
export const DockRightIcon = createIcon(PanelRightOpen);
export const UndockIcon = createIcon(PanelRightClose);
export const FileDiffIcon = createIcon(FileDiff);
export const RefreshIcon = createIcon(RefreshCw);
export const ResearchIcon = createIcon(Telescope);
export const PlusIcon = createIcon(Plus);
export const MinusIcon = createIcon(Minus);
export const CopyIcon = createIcon(Copy);
export const ClipboardCopyIcon = createIcon(ClipboardCopy);
export const PlanIcon = createIcon(ClipboardList);
export const FolderPlusIcon = createIcon(FolderPlus);
export const FolderClosedIcon = createIcon(FolderClosed);
export const ChevronRightIcon = createIcon(ChevronRight);
export const ArrowDownAZIcon = createIcon(ArrowDownAZ);
export const ArrowUpZAIcon = createIcon(ArrowUpZA);
export const ChevronsDownUpIcon = createIcon(ChevronsDownUp);
export const ChevronsUpDownIcon = createIcon(ChevronsUpDown);
export const FilePlusIcon = createIcon(FilePlus);
export const PanelLeftOpenIcon = createIcon(PanelLeftOpen);
export const PanelLeftCloseIcon = createIcon(PanelLeftClose);
export const FolderInputIcon = createIcon(FolderInput);
