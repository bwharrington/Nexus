import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
    FilePlusIcon,
    FolderPlusIcon,
    EditIcon,
    DeleteIcon,
    FolderOpenIcon,
    CopyIcon,
    ClipboardCopyIcon,
    PlusIcon,
    MinusIcon,
} from './AppIcons';

interface ContextMenuPosition {
    mouseX: number;
    mouseY: number;
}

interface FileTreeContextMenuProps {
    position: ContextMenuPosition | null;
    isDirectory: boolean;
    itemPath: string;
    itemName: string;
    isAttachedToNexus: boolean;
    onClose: () => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onRename: () => void;
    onDelete: () => void;
    onRevealInExplorer: () => void;
    onCopyPath: () => void;
    onCopyName: () => void;
    onToggleNexusAttachment: () => void;
}

export const FileTreeContextMenu = React.memo(function FileTreeContextMenu({
    position,
    isDirectory,
    itemName,
    isAttachedToNexus,
    onClose,
    onNewFile,
    onNewFolder,
    onRename,
    onDelete,
    onRevealInExplorer,
    onCopyPath,
    onCopyName,
    onToggleNexusAttachment,
}: FileTreeContextMenuProps) {
    const open = position !== null;

    return (
        <Menu
            open={open}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={position ? { top: position.mouseY, left: position.mouseX } : undefined}
        >
            {isDirectory && [
                <MenuItem key="new-file" onClick={() => { onNewFile(); onClose(); }}>
                    <ListItemIcon><FilePlusIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>New File Here</ListItemText>
                </MenuItem>,
                <MenuItem key="new-folder" onClick={() => { onNewFolder(); onClose(); }}>
                    <ListItemIcon><FolderPlusIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>New Folder Here</ListItemText>
                </MenuItem>,
                <Divider key="div-1" />,
            ]}
            <MenuItem onClick={() => { onRename(); onClose(); }}>
                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Rename</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { onDelete(); onClose(); }}>
                <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Delete</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { onRevealInExplorer(); onClose(); }}>
                <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Open File Location</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { onCopyPath(); onClose(); }}>
                <ListItemIcon><ClipboardCopyIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Copy Path</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { onCopyName(); onClose(); }}>
                <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Copy Name</ListItemText>
            </MenuItem>
            {!isDirectory && [
                <Divider key="nexus-divider" />,
                <MenuItem key="nexus-toggle" onClick={() => { onToggleNexusAttachment(); onClose(); }}>
                    <ListItemIcon>
                        {isAttachedToNexus
                            ? <MinusIcon fontSize="small" sx={{ color: 'error.main' }} />
                            : <PlusIcon fontSize="small" sx={{ color: 'success.main' }} />}
                    </ListItemIcon>
                    <ListItemText>
                        {isAttachedToNexus
                            ? `Remove '${itemName}' from Nexus AI`
                            : `Attach '${itemName}' to Nexus AI`}
                    </ListItemText>
                </MenuItem>,
            ]}
        </Menu>
    );
});
