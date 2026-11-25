const SUPABASE = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const APP = 'https://abdzees.github.io/todo-app/'

const BG = new Color('#111111')
const FG = new Color('#f2f2f2')
const MUTED = new Color('#888888')
const LIMITS = { small: 4, medium: 5, large: 11, extraLarge: 11 }

const pad = n => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function login() {
  if (!Keychain.contains('todo-email')) {
    if (config.runsInWidget) throw new Error('Open Scriptable and run this script once')
    const alert = new Alert()
    alert.title = 'Sign in'
    alert.addTextField('Email', '')
    alert.addSecureTextField('Password', '')
    alert.addAction('Save')
    await alert.present()
    Keychain.set('todo-email', alert.textFieldValue(0))
    Keychain.set('todo-password', alert.textFieldValue(1))
  }
  const req = new Request(`${SUPABASE}/auth/v1/token?grant_type=password`)
  req.method = 'POST'
  req.headers = { apikey: KEY, 'Content-Type': 'application/json' }
  req.body = JSON.stringify({ email: Keychain.get('todo-email'), password: Keychain.get('todo-password') })
  const res = await req.loadJSON()
  if (!res.access_token) {
    Keychain.remove('todo-email')
    Keychain.remove('todo-password')
    throw new Error('Sign in failed, run the script again')
  }
  return res.access_token
}

async function loadTasks() {
  const token = await login()
  const query = `select=text,done&kind=eq.todo&removed=eq.false&day=eq.${today()}&order=position`
  const req = new Request(`${SUPABASE}/rest/v1/items?${query}`)
  req.headers = { apikey: KEY, Authorization: `Bearer ${token}` }
  const rows = await req.loadJSON()
  if (!Array.isArray(rows)) throw new Error(rows.message || 'Could not load tasks')
  return rows
}

function line(widget, text, color, size) {
  const label = widget.addText(text)
  label.textColor = color
  label.font = Font.systemFont(size)
  label.lineLimit = 1
  return label
}

function build(rows, error) {
  const widget = new ListWidget()
  widget.backgroundColor = BG
  widget.url = APP
  widget.setPadding(14, 16, 14, 16)
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)

  const open = (rows || []).filter(r => !r.done)
  const head = widget.addStack()
  const title = head.addText('Today')
  title.font = Font.boldSystemFont(15)
  title.textColor = FG
  head.addSpacer()
  if (rows) {
    const count = head.addText(`${open.length} left`)
    count.font = Font.systemFont(13)
    count.textColor = MUTED
  }
  widget.addSpacer(8)

  if (error) line(widget, error.message, MUTED, 13)
  else if (!open.length) line(widget, rows.length ? 'All done' : 'Nothing today', MUTED, 14)
  else {
    const limit = LIMITS[config.widgetFamily] || 5
    for (const task of open.slice(0, limit)) {
      const row = widget.addStack()
      row.centerAlignContent()
      const dot = row.addImage(SFSymbol.named('circle').image)
      dot.imageSize = new Size(12, 12)
      dot.tintColor = MUTED
      row.addSpacer(8)
      line(row, task.text, FG, 14)
      widget.addSpacer(5)
    }
    if (open.length > limit) line(widget, `+${open.length - limit} more`, MUTED, 12)
  }
  widget.addSpacer()
  return widget
}

let widget
try {
  widget = build(await loadTasks())
} catch (error) {
  widget = build(null, error)
}

if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
