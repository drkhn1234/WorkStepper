import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isWorkspaceEmpty, stepWorkspace, edgeWorkspace, removeWorkspace} from '../extension/workspaceActions.js';

function setup(occupancy, activeIndex) {
    const manager = {
        workspaces: [],
        active: null,
        appended: 0,
        get n_workspaces() { return this.workspaces.length; },
        get_active_workspace() { return this.active; },
        get_workspace_by_index(index) { return this.workspaces[index]; },
        append_new_workspace(activate, timestamp) {
            assert.equal(activate, false);
            assert.equal(timestamp, 42);
            this.appended++;
            const workspace = makeWorkspace();
            this.workspaces.push(workspace);
            return workspace;
        },
        reorder_workspace(workspace, index) {
            this.workspaces.splice(this.workspaces.indexOf(workspace), 1);
            this.workspaces.splice(index, 0, workspace);
        },
        remove_workspace(workspace, timestamp) {
            const index = workspace.index();
            const neighbor = this.workspaces[index > 0 ? index - 1 : index + 1];
            for (const window of [...workspace.windows])
                window.change_workspace(neighbor);
            if (this.active === workspace)
                neighbor.activate(timestamp);
            this.workspaces.splice(index, 1);
        },
    };
    function makeWorkspace() {
        return {
            windows: [],
            index() { return manager.workspaces.indexOf(this); },
            list_windows() { return this.windows; },
            activate(timestamp) {
                assert.equal(timestamp, 42);
                manager.active = this;
            },
            activate_with_focus(window, timestamp) {
                assert.equal(window.workspace, this);
                this.activate(timestamp);
                manager.focused = window;
            },
        };
    }
    manager.workspaces = occupancy.map(count => {
        const workspace = makeWorkspace();
        for (let i = 0; i < count; i++)
            workspace.windows.push(makeWindow(workspace));
        return workspace;
    });
    manager.active = manager.workspaces[activeIndex];
    return manager;
}

function makeWindow(workspace, sticky = false) {
    return {
        workspace,
        sticky,
        is_on_all_workspaces() { return this.sticky; },
        unstick() { this.sticky = false; },
        change_workspace(target) {
            assert.equal(this.sticky, false);
            const index = this.workspace.windows.indexOf(this);
            if (index !== -1)
                this.workspace.windows.splice(index, 1);
            this.workspace = target;
            target.windows.push(this);
        },
    };
}

for (const direction of [-1, 1]) {
    const side = direction < 0 ? 'left' : 'right';
    test(`reuse empty neighbor on the ${side}`, () => {
        const manager = setup([0, 1, 0], 1);
        const neighbor = manager.workspaces[1 + direction];
        const result = stepWorkspace(manager, direction, 42);
        assert.equal(result.created, false);
        assert.equal(result.workspace, neighbor);
        assert.equal(manager.active, neighbor);
        assert.equal(manager.appended, 0);
    });

    test(`insert before occupied neighbor on the ${side} without moving existing windows`, () => {
        const manager = setup([1, 2, 1], 1);
        const original = [...manager.workspaces];
        const memberships = original.map(workspace => [...workspace.windows]);
        const result = stepWorkspace(manager, direction, 42);
        assert.equal(result.created, true);
        assert.equal(result.workspace.index(), direction < 0 ? 1 : 2);
        assert.equal(manager.active, result.workspace);
        assert.equal(manager.appended, 1);
        assert.deepEqual(manager.workspaces.filter(w => w !== result.workspace), original);
        original.forEach((workspace, i) => {
            assert.deepEqual(workspace.windows, memberships[i]);
            workspace.windows.forEach(window => assert.equal(window.workspace, workspace));
        });
    });

    test(`create at the ${side} boundary`, () => {
        const manager = setup([1], 0);
        const current = manager.active;
        const result = stepWorkspace(manager, direction, 42);
        assert.equal(result.created, true);
        assert.deepEqual(manager.workspaces, direction < 0
            ? [result.workspace, current] : [current, result.workspace]);
    });

    test(`move focused window to new ${side} workspace and follow it`, () => {
        const manager = setup([1, 2, 1], 1);
        const source = manager.active;
        const [window, otherWindow] = source.windows;
        const result = stepWorkspace(manager, direction, 42, window);
        assert.equal(result.created, true);
        assert.equal(manager.active, result.workspace);
        assert.equal(manager.focused, window);
        assert.deepEqual(source.windows, [otherWindow]);
        assert.deepEqual(result.workspace.windows, [window]);
    });

    test(`move into empty ${side} neighbor without creating a workspace`, () => {
        const manager = setup([0, 1, 0], 1);
        const source = manager.active;
        const window = source.windows[0];
        const neighbor = manager.workspaces[1 + direction];
        const result = stepWorkspace(manager, direction, 42, window);
        assert.equal(result.created, false);
        assert.equal(manager.appended, 0);
        assert.equal(manager.active, neighbor);
        assert.equal(manager.focused, window);
        assert.equal(source.windows.length, 0);
    });

    test(`ignore distant empties when immediate ${side} neighbor is occupied`, () => {
        const manager = setup([0, 1, 1, 1, 0], 2);
        const result = stepWorkspace(manager, direction, 42);
        assert.equal(result.created, true);
        assert.equal(manager.appended, 1);
    });
}

test('pinned windows do not make an otherwise empty workspace occupied', () => {
    const manager = setup([1, 0], 0);
    const neighbor = manager.workspaces[1];
    neighbor.windows.push(makeWindow(neighbor, true));
    assert.equal(isWorkspaceEmpty(neighbor), true);
    assert.equal(stepWorkspace(manager, 1, 42).created, false);
});

for (const direction of [-1, 1]) {
    const side = direction < 0 ? 'left' : 'right';
    test(`hold inserts beyond occupied ${side} end without moving existing windows`, () => {
        const manager = setup([1, 2, 1, 1], 1);
        const original = [...manager.workspaces];
        const result = edgeWorkspace(manager, direction, 42);
        assert.equal(result.created, true);
        assert.equal(result.workspace.index(), direction < 0 ? 0 : manager.n_workspaces - 1);
        assert.equal(manager.active, result.workspace);
        assert.equal(manager.appended, 1);
        assert.deepEqual(manager.workspaces.filter(w => w !== result.workspace), original);
        original.forEach(w => w.windows.forEach(window => assert.equal(window.workspace, w)));
    });
    test(`hold reuses empty ${side} end and ignores occupied adjacent workspace`, () => {
        const manager = setup(direction < 0 ? [0, 1, 1, 1] : [1, 1, 1, 0], 2);
        const target = manager.workspaces[direction < 0 ? 0 : 3];
        const result = edgeWorkspace(manager, direction, 42);
        assert.equal(result.created, false);
        assert.equal(result.workspace, target);
        assert.equal(manager.active, target);
        assert.equal(manager.appended, 0);
    });
    for (const emptyEnd of [false, true]) {
        test(`Shift hold ${emptyEnd ? 'reuses empty' : 'inserts beyond occupied'} ${side} end and carries one window`, () => {
            const occupancy = [1, 2, 1, 1];
            if (emptyEnd) occupancy[direction < 0 ? 0 : 3] = 0;
            const manager = setup(occupancy, 1);
            const source = manager.active;
            const [window, other] = source.windows;
            const result = edgeWorkspace(manager, direction, 42, window);
            assert.equal(result.created, !emptyEnd);
            assert.equal(result.workspace.index(), direction < 0 ? 0 : manager.n_workspaces - 1);
            assert.equal(window.workspace, result.workspace);
            assert.equal(manager.active, result.workspace);
            assert.equal(manager.focused, window);
            assert.deepEqual(source.windows, [other]);
        });
    }
}

test('hold at an occupied single workspace creates beyond it', () => {
    for (const direction of [-1, 1]) {
        const manager = setup([1], 0);
        const result = edgeWorkspace(manager, direction, 42);
        assert.equal(result.created, true);
        assert.equal(manager.n_workspaces, 2);
        assert.equal(result.workspace.index(), direction < 0 ? 0 : 1);
    }
});

test('hold at an already-active empty end reuses it without creating one', () => {
    const manager = setup([0], 0);
    const current = manager.active;
    for (const direction of [-1, 1]) {
        const result = edgeWorkspace(manager, direction, 42);
        assert.equal(result.created, false);
        assert.equal(result.workspace, current);
        assert.equal(manager.n_workspaces, 1);
    }
});

for (const index of [0, 1, 2]) {
    test(`tap close at index ${index} preserves windows and uses native neighbor policy`, () => {
        const manager = setup([1, 2, 1], index);
        const workspace = manager.active;
        const windows = [...workspace.windows];
        const neighbor = manager.workspaces[index > 0 ? index - 1 : index + 1];
        assert.equal(removeWorkspace(manager, workspace, 42), true);
        assert.equal(manager.n_workspaces, 2);
        assert.equal(manager.active, neighbor);
        windows.forEach(window => assert.equal(window.workspace, neighbor));
    });
}

test('tap close preserves the final workspace and its windows', () => {
    const manager = setup([2], 0);
    assert.equal(removeWorkspace(manager, manager.active, 42), false);
    assert.equal(manager.n_workspaces, 1);
    assert.equal(manager.active.windows.length, 2);
});

test('minimized windows still occupy a workspace', () => {
    const manager = setup([1, 1], 0);
    manager.workspaces[1].windows[0].minimized = true;
    assert.equal(isWorkspaceEmpty(manager.workspaces[1]), false);
    assert.equal(stepWorkspace(manager, 1, 42).created, true);
});

test('moving a pinned window unpins it before moving', () => {
    const manager = setup([1, 0], 0);
    const window = manager.active.windows[0];
    window.sticky = true;
    const result = stepWorkspace(manager, 1, 42, window);
    assert.equal(window.sticky, false);
    assert.equal(window.workspace, result.workspace);
    assert.equal(manager.focused, window);
});

test('reject invalid directions before changing workspaces', () => {
    const manager = setup([1], 0);
    assert.throws(() => stepWorkspace(manager, 0, 42), /direction/);
    assert.equal(manager.appended, 0);
});

test('failed workspace allocation does not move the active window', () => {
    const manager = setup([1], 0);
    const source = manager.active;
    const window = source.windows[0];
    manager.append_new_workspace = () => null;
    assert.equal(stepWorkspace(manager, -1, 42, window), null);
    assert.equal(manager.active, source);
    assert.equal(window.workspace, source);
});
