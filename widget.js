const EMAIL = ''
const PASSWORD = ''

const SUPABASE = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const APP = 'https://abdzees.github.io/todo-app/'

const BG = new Color('#111111')
const FG = new Color('#f2f2f2')
const MUTED = new Color('#888888')
const LIMITS = { small: 4, medium: 5, large: 11, extraLarge: 11 }

let step = 'start'

const pad = n => String(n).padStart(2, '0')
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function login() {
  if (!EMAIL || !PASSWORD) throw new Error('Type your email and password into the first two lines of this script')
  step = 'sign in request'
  const req = new Request(`${SUPABASE}/auth/v1/token?grant_type=password`)
  req.method = 'POST'
  req.headers = { apikey: KEY, 'Content-Type': 'application/json' }
  req.body = JSON.stringify({ email: EMAIL, password: PASSWORD })
  const res = await req.loadJSON()
  if (!res.access_token) throw new Error('Sign in failed, check your email and password')
  return res.access_token
}

async function loadTasks(token) {
  step = 'load tasks'
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

  if (error) {
    const message = widget.addText(error.message)
    message.textColor = MUTED
    message.font = Font.systemFont(11)
    message.lineLimit = 6
  }
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

async function run() {
  const token = await login()
  const rows = await loadTasks(token)
  step = 'draw widget'
  return build(rows)
}

let widget
try {
  widget = await run()
} catch (error) {
  const text = `${step}: ${error.message || error}`
  Pasteboard.copy(text)
  if (!config.runsInWidget) {
    const alert = new Alert()
    alert.title = 'Error'
    alert.message = text
    alert.addAction('OK')
    await alert.present()
  }
  widget = build(null, new Error(text))
}

if (config.runsInWidget) Script.setWidget(widget)
else await widget.presentMedium()
Script.complete()
