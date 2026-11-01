import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PressGesture} from '../extension/pressGesture.js';

function fixture() {
    let nextId = 1;
    const timers = new Map();
    const calls = [];
    const gesture = new PressGesture({
        schedule(ms, fn) {
            assert.equal(ms, 700);
            const id = nextId++;
            timers.set(id, fn);
            return id;
        },
        cancel(id) { timers.delete(id); },
    }, action => calls.push(['short', action]), action => calls.push(['long', action]));
    const fire = () => {
        const callbacks = [...timers.values()];
        timers.clear();
        callbacks.forEach(fn => fn());
    };
    return {gesture, timers, calls, fire};
}

test('short action waits for release and cancels long action', () => {
    const {gesture, calls, timers, fire} = fixture();
    gesture.press(36, 'right', 700);
    assert.deepEqual(calls, []);
    gesture.release(36);
    fire();
    assert.deepEqual(calls, [['short', 'right']]);
    assert.equal(timers.size, 0);
});

test('hold fires once and neither autorepeat nor release runs tap action', () => {
    const {gesture, calls, timers, fire} = fixture();
    gesture.press(22, 'left', 700);
    gesture.press(22, 'left', 700);
    assert.equal(timers.size, 1);
    fire();
    gesture.press(22, 'left', 700);
    gesture.release(22);
    fire();
    assert.deepEqual(calls, [['long', 'left']]);
});

test('releasing another key does not finish the gesture', () => {
    const {gesture, calls, timers} = fixture();
    gesture.press(36, 'right', 700);
    gesture.release(99);
    assert.equal(timers.size, 1);
    assert.deepEqual(calls, []);
});

test('releasing a modifier first finishes a tap and prevents a delayed hold', () => {
    const {gesture, calls, fire} = fixture();
    gesture.press(119, 'close', 700);
    gesture.finish();
    gesture.release(119);
    fire();
    assert.deepEqual(calls, [['short', 'close']]);
});

test('disable or workspace-switch cancellation fires no action', () => {
    const {gesture, calls, timers, fire} = fixture();
    gesture.press(119, 'close', 700);
    gesture.cancel();
    fire();
    gesture.release(119);
    assert.deepEqual(calls, []);
    assert.equal(timers.size, 0);
});

test('a different shortcut supersedes the pending gesture without firing it', () => {
    const {gesture, calls, fire} = fixture();
    gesture.press(22, 'left', 700);
    gesture.press(36, 'right', 700);
    fire();
    assert.deepEqual(calls, [['long', 'right']]);
});
