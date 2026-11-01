import gi

gi.require_version('Gtk', '4.0')
from gi.repository import Gtk

app = Gtk.Application(application_id='org.example.WorkStepperTest')


def activate(application):
    for name in ('A', 'B'):
        window = Gtk.ApplicationWindow(application=application, title=f'WorkStepper Test {name}')
        window.set_default_size(320, 240)
        if name == 'B':
            # Model an app refusing its first close request for unsaved work.
            state = {'requests': 0}

            def guard_close(widget, close_state=state):
                close_state['requests'] += 1
                if close_state['requests'] == 1:
                    widget.set_title('WorkStepper Test B - Unsaved')
                    return True
                return False

            window.connect('close-request', guard_close)
        window.present()


app.connect('activate', activate)
app.run(None)
