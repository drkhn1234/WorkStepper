// SPDX-License-Identifier: GPL-3.0-or-later
// The scheduler is injected so press/release timing can be tested without Shell.
export class PressGesture {
    constructor(scheduler, shortAction, longAction) {
        this._scheduler = scheduler;
        this._shortAction = shortAction;
        this._longAction = longAction;
        this._press = null;
    }

    press(keyCode, action, duration) {
        if (this._press?.keyCode === keyCode)
            return; // Ignore autorepeat, including after the hold fires.
        this.cancel();
        const press = {keyCode, action, fired: false, timer: 0};
        this._press = press;
        press.timer = this._scheduler.schedule(duration, () => {
            press.timer = 0;
            press.fired = true;
            this._longAction(press.action);
        });
    }

    release(keyCode) {
        if (this._press?.keyCode !== keyCode)
            return;
        const {action, fired} = this._press;
        this.cancel();
        if (!fired)
            this._shortAction(action);
    }

    finish() {
        if (this._press)
            this.release(this._press.keyCode);
    }

    cancel() {
        if (this._press?.timer)
            this._scheduler.cancel(this._press.timer);
        this._press = null;
    }
}
