import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm'

const SUPABASE_URL = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const $ = id => document.getElementById(id)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TABS = ['todos', 'removed', 'notes']
const icon = path => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
const CLOSE_ICON = icon('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>')
const DRAG_ICON = icon('<path d="M3.5 4h9M3.5 8h9M3.5 12h9"/>')

let items = JSON.parse(localStorage.getItem('items') || '[]')
let selected = new Set()
let noteId = null
let dragging = false
let animating = false

const dayFrom = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
const today = () => dayFrom(0)
const isTask = row => row && !row.classList.contains('day')
const findItem = row => items.find(i => i.id === row?.dataset.id)

function dateLabel(day) {
  if (day === today()) return 'Today'
  const [year, month, date] = day.split('-').map(Number)
  const ends = { 1: 'st', 2: 'nd', 3: 'rd' }
  const end = date >= 11 && date <= 13 ? 'th' : ends[date % 10] || 'th'
  return `${date}${end} ${MONTHS[month - 1]} ${year}`
}

function show(signedIn) {
  $('login').hidden = signedIn
  $('app').hidden = !signedIn
}

function groupByDay(tasks, keepToday) {
  const now = today()
  const days = new Set(tasks.map(t => t.day))
  if (keepToday) days.add(now)
  const rank = day => (day === now ? 0 : day > now ? 1 : 2)
  const order = (a, b) => rank(a) - rank(b) || (a > now ? a.localeCompare(b) : b.localeCompare(a))
  return [...days].sort(order).map(day => ({
    day,
    tasks: tasks.filter(t => t.day === day).sort((a, b) => a.position - b.position),
  }))
}

function row(task, inTrash) {
  const li = document.createElement('li')
  li.dataset.id = task.id
  li.innerHTML = inTrash
    ? `<input type="checkbox"><span></span><button class="remove" title="Delete forever">${CLOSE_ICON}</button>`
    : `<input type="checkbox"><span></span><button class="handle" title="Drag">${DRAG_ICON}</button><button class="remove">${CLOSE_ICON}</button>`
  const checkbox = li.querySelector('input')
  const span = li.querySelector('span')
  span.textContent = task.text

  if (inTrash) {
    checkbox.checked = selected.has(task.id)
    checkbox.onchange = () => {
      checkbox.checked ? selected.add(task.id) : selected.delete(task.id)
      render()
    }
    li.querySelector('.remove').onclick = () => deleteForever([task.id])
  } else {
    li.className = task.done ? 'done' : ''
    checkbox.checked = task.done
    checkbox.onchange = () => update(task.id, { done: checkbox.checked })
    span.onclick = () => edit(span, task)
    li.querySelector('.handle').onpointerdown = e => drag(e, li)
    li.querySelector('.remove').onclick = () => removeTask(li, task)
  }
  return li
}

function renderList(ul, tasks, inTrash) {
  ul.innerHTML = ''
  for (const { day, tasks: dayTasks } of groupByDay(tasks, !inTrash)) {
    const heading = document.createElement('li')
    heading.className = dayTasks.length ? 'day' : 'day bare'
    heading.dataset.day = day
    heading.textContent = dateLabel(day)
    ul.append(heading)
    for (const task of dayTasks) ul.append(row(task, inTrash))
  }
}

function render() {
  const todos = items.filter(i => i.kind === 'todo')
  const trash = todos.filter(t => t.removed)
  selected = new Set([...selected].filter(id => trash.some(t => t.id === id)))

  if (!dragging && !animating && !document.activeElement.isContentEditable) {
    renderList($('list'), todos.filter(t => !t.removed), false)
    renderList($('trash'), trash, true)
  }

  $('select-all').checked = trash.length > 0 && selected.size === trash.length
  $('delete-selected').disabled = $('restore-selected').disabled = selected.size === 0
  $('delete-selected').textContent = selected.size ? `Delete forever (${selected.size})` : 'Delete forever'

  const note = items.find(i => i.kind === 'note')
  if (note && document.activeElement !== $('note')) $('note').value = note.text
  noteId = note?.id
}

const save = () => localStorage.setItem('items', JSON.stringify(items))

async function load() {
  const { data, error } = await db.from('items').select()
  if (error) return report(error)
  items = data
  save()
  render()
}

function report(error) {
  console.error(error)
  $('status').textContent = 'Could not sync: ' + error.message
  $('status').hidden = false
  clearTimeout(report.timer)
  report.timer = setTimeout(() => ($('status').hidden = true), 5000)
  return true
}

function check(error) {
  if (!error) return false
  report(error)
  load()
  return true
}

function apply({ eventType, new: row, old }) {
  if (eventType === 'DELETE') items = items.filter(i => i.id !== old.id)
  else {
    const item = items.find(i => i.id === row.id)
    item ? Object.assign(item, row) : items.push(row)
  }
  save()
  render()
}

async function add(text, day) {
  const { data, error } = await db.from('items').insert({ kind: 'todo', text, day }).select().single()
  if (!check(error)) apply({ eventType: 'INSERT', new: data })
}

async function update(id, changes) {
  Object.assign(items.find(i => i.id === id), changes)
  save()
  render()
  check((await db.from('items').update(changes).eq('id', id)).error)
}

function withEmptyHeadings(ul, leaving) {
  const all = [...ul.children]
  const out = [...leaving]
  all.forEach((row, i) => {
    if (isTask(row)) return
    const group = []
    for (let j = i + 1; j < all.length && isTask(all[j]); j++) group.push(all[j])
    const keep = ul.id === 'list' && row.dataset.day === today()
    if (group.length && !keep && group.every(r => leaving.includes(r))) out.push(row)
  })
  return out
}

async function animateOut(ul, rows, name) {
  animating = true
  const leaving = withEmptyHeadings(ul, rows)
  leaving.forEach(r => {
    r.style.setProperty('--h', r.offsetHeight + 'px')
    r.classList.add(name)
  })
  await new Promise(done => setTimeout(done, name === 'pop' ? 380 : 300))
  animating = false
}

async function removeTask(li, task) {
  if (animating) return
  await animateOut($('list'), [li], 'pop')
  await update(task.id, { removed: true })
}

async function restore(ids) {
  if (animating) return
  const rows = [...$('trash').children].filter(r => ids.includes(r.dataset.id))
  await animateOut($('trash'), rows, 'slide')
  items.filter(i => ids.includes(i.id)).forEach(i => (i.removed = false))
  save()
  render()
  check((await db.from('items').update({ removed: false }).in('id', ids)).error)
}

async function deleteForever(ids) {
  if (animating) return
  const rows = [...$('trash').children].filter(r => ids.includes(r.dataset.id))
  await animateOut($('trash'), rows, 'pop')
  items = items.filter(i => !ids.includes(i.id))
  save()
  render()
  check((await db.from('items').delete().in('id', ids)).error)
}

function edit(span, task) {
  span.contentEditable = true
  span.focus()
  span.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur() }
  }
  span.onblur = () => {
    span.contentEditable = false
    const text = span.textContent.trim()
    if (text && text !== task.text) update(task.id, { text })
    else render()
  }
}

function drag(e, li) {
  if (dragging) return
  e.preventDefault()
  const handle = e.currentTarget
  const rows = [...$('list').children]
  const from = rows.indexOf(li)
  const height = li.offsetHeight
  const middles = rows.map(r => r.getBoundingClientRect().top + r.offsetHeight / 2)
  const startY = e.clientY
  const startScroll = window.scrollY
  let y = startY
  let to = from
  let active = true
  dragging = true
  li.classList.add('dragging')
  handle.setPointerCapture(e.pointerId)

  const move = () => {
    const reach = dy => Math.min(Math.max(dy, middles[1] - middles[from]), middles.at(-1) - middles[from] + 1)
    const dy = reach(y - startY + window.scrollY - startScroll)
    li.style.transform = `translateY(${dy}px) scale(1.02)`
    const center = middles[from] + dy
    to = middles.filter((m, i) => i !== from && m < center).length
    rows.forEach((r, i) => {
      if (r === li) return
      const shift = i > from && i <= to ? -height : i < from && i >= to ? height : 0
      r.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }

  const scroll = () => {
    if (!active) return
    const edge = 70
    const low = y - edge
    const high = y - (window.innerHeight - edge)
    const speed = low < 0 ? low / 4 : high > 0 ? high / 4 : 0
    if (speed) {
      window.scrollBy(0, speed)
      move()
    }
    requestAnimationFrame(scroll)
  }
  scroll()

  handle.onpointermove = ev => {
    y = ev.clientY
    move()
  }

  handle.onpointerup = handle.onpointercancel = () => {
    active = false
    handle.onpointermove = handle.onpointerup = handle.onpointercancel = null
    const heights = list => list.reduce((sum, r) => sum + r.offsetHeight, 0)
    let slot = to > from ? heights(rows.slice(from + 1, to + 1)) : -heights(rows.slice(to, from))
    const above = rows[from - 1]
    const alone = above && !isTask(above) && !isTask(rows[from + 1]) && above.dataset.day !== today()
    if (to !== from && alone) {
      above.style.setProperty('--h', above.offsetHeight + 'px')
      above.classList.add('collapse')
      if (to < from) slot += above.offsetHeight
    }
    li.classList.remove('dragging')
    li.style.transform = `translateY(${slot}px)`
    setTimeout(() => drop(rows, li, to, from), 160)
  }
}

async function drop(rows, li, to, from) {
  const item = findItem(li)
  let changes = null

  if (to !== from) {
    const order = rows.filter(r => r !== li)
    order.splice(to, 0, li)
    const heading = order.slice(0, to).reverse().find(r => !isTask(r)) || order.find(r => !isTask(r))
    const prev = isTask(order[to - 1]) ? findItem(order[to - 1]) : null
    const next = isTask(order[to + 1]) ? findItem(order[to + 1]) : null
    const position = prev && next ? (prev.position + next.position) / 2
      : prev ? prev.position + 1
      : next ? next.position - 1
      : item.position
    changes = { day: heading.dataset.day, position }
  }

  dragging = false
  if (changes) await update(item.id, changes)
  else render()
}

let noteSave = Promise.resolve()
let pendingNote = null

function flushNote() {
  clearTimeout(flushNote.timer)
  if (pendingNote === null) return
  const text = pendingNote
  pendingNote = null
  noteSave = noteSave.then(() => saveNote(text))
}

async function saveNote(text) {
  if (noteId) return check((await db.from('items').update({ text }).eq('id', noteId)).error)
  const { data, error } = await db.from('items').insert({ kind: 'note', text }).select().single()
  if (!check(error)) apply({ eventType: 'INSERT', new: data })
}

function start() {
  show(true)
  $('date').value = today()
  render()
  load()
  db.channel('items').on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, apply).subscribe()
}

$('login').onsubmit = async e => {
  e.preventDefault()
  const { error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value })
  if (error) $('error').textContent = error.message
  else start()
}

$('add').onsubmit = e => {
  e.preventDefault()
  add($('new').value.trim(), $('date').value)
  $('new').value = ''
  $('date').value = today()
}

$('note').oninput = e => {
  pendingNote = e.target.value
  clearTimeout(flushNote.timer)
  flushNote.timer = setTimeout(flushNote, 200)
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushNote()
  else if (!$('app').hidden) load()
})
addEventListener('pagehide', flushNote)

$('select-all').onchange = e => {
  const trash = items.filter(i => i.kind === 'todo' && i.removed)
  selected = new Set(e.target.checked ? trash.map(t => t.id) : [])
  render()
}

$('restore-selected').onclick = () => restore([...selected])
$('delete-selected').onclick = () => deleteForever([...selected])

let current = 'todos'

function play(el, name) {
  el.classList.remove(name)
  void el.offsetWidth
  el.classList.add(name)
  setTimeout(() => el.classList.remove(name), 450)
}

function highlight(name) {
  for (const t of TABS) $('tab-' + t).classList.toggle('active', t === name)
  play($('tab-' + name), 'bounce')
}

function tab(name, slide = true) {
  if (name === current) return
  const side = TABS.indexOf(name) > TABS.indexOf(current) ? 'from-right' : 'from-left'
  current = name
  for (const t of TABS) $(t).hidden = t !== name
  if (!$('tab-' + name).classList.contains('active')) highlight(name)
  if (slide) play($(name), side)
}
for (const t of TABS) $('tab-' + t).onclick = () => tab(t)

let swipe = null
let settling = false
const slideTo = (el, x) => (el.style.transform = `translateX(${x}px)`)

function showNeighbor(side) {
  const name = TABS[TABS.indexOf(current) + side]
  if (swipe.name === name) return
  if (swipe.neighbor) hideNeighbor()
  swipe.name = name
  if (!name) return
  const from = $(current)
  const el = $(name)
  el.classList.remove('from-left', 'from-right')
  Object.assign(el.style, { position: 'absolute', top: from.offsetTop + 'px', left: from.offsetLeft + 'px', width: from.offsetWidth + 'px' })
  el.hidden = false
  swipe.neighbor = el
}

function hideNeighbor() {
  const el = swipe.neighbor
  el.hidden = true
  el.removeAttribute('style')
  swipe.neighbor = null
}

document.addEventListener('touchstart', e => {
  const t = e.touches[0]
  const blocked = dragging || settling || e.touches.length > 1 || e.target.closest('.handle')
  swipe = blocked ? null : { x: t.clientX, y: t.clientY, mode: null, name: null, neighbor: null, dx: 0, moves: [] }
}, { passive: true })

document.addEventListener('touchmove', e => {
  if (!swipe || dragging) return
  const t = e.touches[0]
  const dx = t.clientX - swipe.x
  const dy = t.clientY - swipe.y
  if (!swipe.mode) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return
    if (Math.abs(dx) <= Math.abs(dy)) return (swipe = null)
    swipe.mode = 'h'
    $(current).classList.remove('from-left', 'from-right')
  }
  e.preventDefault()
  swipe.dx = dx
  swipe.moves = [...swipe.moves.filter(m => e.timeStamp - m.time < 100), { time: e.timeStamp, dx }]
  const side = dx < 0 ? 1 : -1
  showNeighbor(side)
  const width = window.innerWidth
  slideTo($(current), swipe.neighbor ? dx : dx * 0.3)
  if (swipe.neighbor) slideTo(swipe.neighbor, side * width + dx)
}, { passive: false })

function velocity(moves, now) {
  const first = moves[0]
  const last = moves.at(-1)
  if (!last || last.time === first.time || now - last.time > 80) return 0
  return ((last.dx - first.dx) / (last.time - first.time)) * 1000
}

async function release() {
  if (!swipe || swipe.mode !== 'h') return (swipe = null)
  const { neighbor, name, dx } = swipe
  const width = window.innerWidth
  const side = dx < 0 ? 1 : -1
  const go = !!neighbor && (Math.sign(dx) * (dx + velocity(swipe.moves, performance.now()) * 2)) / width > 0.6
  const from = $(current)
  settling = true
  if (go) highlight(name)
  for (const el of [from, neighbor]) if (el) el.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.1, 0.64, 1)'
  slideTo(from, go ? -side * width : 0)
  if (neighbor) slideTo(neighbor, go ? 0 : side * width)
  await new Promise(done => setTimeout(done, 320))
  from.removeAttribute('style')
  if (neighbor) {
    neighbor.removeAttribute('style')
    neighbor.hidden = !go
  }
  swipe = null
  settling = false
  if (go) {
    tab(name, false)
  }
}
document.addEventListener('touchend', release)
document.addEventListener('touchcancel', release)

$('logout').onclick = async () => {
  await db.auth.signOut()
  localStorage.removeItem('items')
  location.reload()
}

const { data } = await db.auth.getSession()
data.session ? start() : show(false)

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.register('sw.js')
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && location.reload())
}
