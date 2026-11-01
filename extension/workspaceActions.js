// SPDX-License-Identifier: GPL-3.0-or-later
// Only workspace-local windows count. Pinned windows appear on every
// workspace and must not prevent reuse; minimized windows still count.
export function isWorkspaceEmpty(workspace) {
    return !workspace.list_windows().some(window =>
        !window.is_on_all_workspaces());
}

export function activateWorkspace(target, timestamp, window = null) {
    if (window) {
        if (window.is_on_all_workspaces())
            window.unstick();
        window.change_workspace(target);
        target.activate_with_focus(window, timestamp);
    } else {
        target.activate(timestamp);
    }
}

export function edgeWorkspace(manager, direction, timestamp, window = null) {
    return stepWorkspace(manager, direction, timestamp, window, true);
}

export function removeWorkspace(manager, workspace, timestamp) {
    if (manager.n_workspaces <= 1 || workspace.index() < 0)
        return false;
    // Mutter keeps windows alive and moves them to the previous workspace,
    // or the next one when removing the first workspace.
    manager.remove_workspace(workspace, timestamp);
    return true;
}

export function stepWorkspace(manager, direction, timestamp, window = null, atEdge = false) {
    if (direction !== -1 && direction !== 1)
        throw new Error('Workspace direction must be -1 or 1');

    const current = manager.get_active_workspace();
    const index = current.index();
    const neighborIndex = atEdge
        ? (direction < 0 ? 0 : manager.n_workspaces - 1)
        : index + direction;
    const neighbor = neighborIndex >= 0 && neighborIndex < manager.n_workspaces
        ? manager.get_workspace_by_index(neighborIndex)
        : null;

    let target = neighbor;
    let created = false;
    if (!target || !isWorkspaceEmpty(target)) {
        // Move the workspace object, preserving existing windows and their
        // workspace membership rather than shuffling windows between spaces.
        target = manager.append_new_workspace(false, timestamp);
        if (!target)
            return null;
        const insertionIndex = atEdge
            ? (direction < 0 ? 0 : manager.n_workspaces - 1)
            : (direction < 0 ? index : index + 1);
        manager.reorder_workspace(target, insertionIndex);
        created = true;
    }

    activateWorkspace(target, timestamp, window);

    return {workspace: target, created};
}
