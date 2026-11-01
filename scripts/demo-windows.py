"""Sample windows used only in the isolated promotional recording session."""
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Gtk, Adw, Gdk

app = Adw.Application(application_id='io.github.drkhn1234.WorkStepper.Demo')

def activate(application):
    css = Gtk.CssProvider()
    css.load_from_string('''
        .demo-body { padding: 32px 44px; }
        .demo-heading { font-size: 30px; font-weight: 700; }
        .demo-subtitle { color: #aeb6c8; font-size: 15px; }
        .demo-line { font-size: 19px; padding: 10px 0; }
        .notes { background: #172b28; }
        .editor { background: #20263a; }
        .browser { background: #2c2238; }
    ''')
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    scenes = [
        ('Notes', 'Plan the next release', 'A little room to think.', 'notes',
         ['✓  Review the roadmap', '○  Sketch the next feature', '○  Keep research close by']),
        ('Editor', 'Make something useful', 'One focused task. One workspace.', 'editor',
         ['const idea = "a calmer desktop";', '', 'createWorkspace();', 'keepYourFocus();']),
        ('Research', 'Explore the possibilities', 'Your references, ready when you need them.', 'browser',
         ['GNOME workspace guide', 'Design notes and inspiration', 'Ideas worth coming back to']),
    ]
    for name, heading, subtitle, style, lines in scenes:
        window = Adw.ApplicationWindow(application=application, title=f'{name} — WorkStepper demo')
        window.set_default_size(810, 460)
        toolbar = Adw.ToolbarView()
        toolbar.add_top_bar(Adw.HeaderBar())
        body = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
        body.add_css_class('demo-body')
        body.add_css_class(style)
        for text, cls in [(heading, 'demo-heading'), (subtitle, 'demo-subtitle')]:
            label = Gtk.Label(label=text, xalign=0)
            label.add_css_class(cls)
            body.append(label)
        body.append(Gtk.Separator(margin_top=14, margin_bottom=10))
        for text in lines:
            label = Gtk.Label(label=text, xalign=0)
            label.add_css_class('demo-line')
            body.append(label)
        toolbar.set_content(body)
        window.set_content(toolbar)
        window.present()

app.connect('activate', activate)
app.run(None)
