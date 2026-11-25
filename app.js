import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const $ = id => document.getElementById(id)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TABS = ['todos', 'notes', 'removed']
const icon = path => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
const CLOSE_ICON = icon('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>')
const DRAG_ICON = icon('<path d="M3.5 4h9M3.5 8h9M3.5 12h9"/>')

let items = JSON.parse(localStorage.getItem('items') || '[]')
let selected = new Set()
let noteId = null
let dragging = false
let animating = false

const today = () => new Date().toLocaleDateString('en-CA')
const isTask = row => row && !row.classList.contains('day')
const findItem = row => items.find(i => i.id === row?.dataset.id)

function dateLabel(day) {
  const [year, month, date] = day.split('-').map(Number)
  const ends = { 1: 'st', 2: 'nd', 3: 'rd' }
  const end = date >= 11 && date <= 13 ? 'th' : ends[date % 10] || 'th'
  return `${date}${end} ${MONTHS[month - 1]} ${year}`
}

function show(signedIn) {
  $('login').hidden = signedIn
  $('app').hidden = !signedIn
}

function groupByDay(tasks) {
  const days = [...new Set(tasks.map(t => t.day))]
  return days.sort().reverse().map(day => ({
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
  for (const { day, tasks: dayTasks } of groupByDay(tasks)) {
    const heading = document.createElement('li')
    heading.className = 'day'
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

async function load() {
  const { data, error } = await db.from('items').select().order('position').order('created_at')
  if (error) return
  items = data
  localStorage.setItem('items', JSON.stringify(items))
  render()
}

async function add(text, day) {
  await db.from('items').insert({ kind: 'todo', text, day })
  load()
}

async function update(id, changes) {
  await db.from('items').update(changes).eq('id', id)
  load()
}

function withEmptyHeadings(ul, leaving) {
  const all = [...ul.children]
  const out = [...leaving]
  all.forEach((row, i) => {
    if (isTask(row)) return
    const group = []
    for (let j = i + 1; j < all.length && isTask(all[j]); j++) group.push(all[j])
    if (group.length && group.every(r => leaving.includes(r))) out.push(row)
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
  task.removed = true
  render()
  await update(task.id, { removed: true })
}

async function restore(ids) {
  if (animating) return
  const rows = [...$('trash').children].filter(r => ids.includes(r.dataset.id))
  await animateOut($('trash'), rows, 'slide')
  items.filter(i => ids.includes(i.id)).forEach(i => (i.removed = false))
  render()
  await db.from('items').update({ removed: false }).in('id', ids)
  load()
}

async function deleteForever(ids) {
  if (animating) return
  const rows = [...$('trash').children].filter(r => ids.includes(r.dataset.id))
  await animateOut($('trash'), rows, 'pop')
  items = items.filter(i => !ids.includes(i.id))
  render()
  await db.from('items').delete().in('id', ids)
  load()
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
  let to = from
  dragging = true
  li.classList.add('dragging')
  handle.setPointerCapture(e.pointerId)

  handle.onpointermove = ev => {
    const dy = ev.clientY - startY
    li.style.transform = `translateY(${dy}px) scale(1.02)`
    const center = middles[from] + dy
    to = middles.filter((m, i) => i !== from && m < center).length
    rows.forEach((r, i) => {
      if (r === li) return
      const shift = i > from && i <= to ? -height : i < from && i >= to ? height : 0
      r.style.transform = shift ? `translateY(${shift}px)` : ''
    })
  }

  handle.onpointerup = handle.onpointercancel = () => {
    handle.onpointermove = handle.onpointerup = handle.onpointercancel = null
    const heights = list => list.reduce((sum, r) => sum + r.offsetHeight, 0)
    let slot = to > from ? heights(rows.slice(from + 1, to + 1)) : -heights(rows.slice(to, from))
    const above = rows[from - 1]
    const alone = above && !isTask(above) && !isTask(rows[from + 1])
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
    Object.assign(item, changes)
  }

  dragging = false
  render()
  if (changes) await update(item.id, changes)
}

async function saveNote(text) {
  if (noteId) await db.from('items').update({ text }).eq('id', noteId)
  else await db.from('items').insert({ kind: 'note', text })
  load()
}

function start() {
  show(true)
  $('date').value = today()
  render()
  load()
  db.channel('items').on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, load).subscribe()
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

let timer
$('note').oninput = e => {
  clearTimeout(timer)
  timer = setTimeout(() => saveNote(e.target.value), 600)
}

$('select-all').onchange = e => {
  const trash = items.filter(i => i.kind === 'todo' && i.removed)
  selected = new Set(e.target.checked ? trash.map(t => t.id) : [])
  render()
}

$('restore-selected').onclick = () => restore([...selected])
$('delete-selected').onclick = () => deleteForever([...selected])

function tab(name) {
  for (const t of TABS) {
    $(t).hidden = t !== name
    $('tab-' + t).classList.toggle('active', t === name)
  }
}
for (const t of TABS) $('tab-' + t).onclick = () => tab(t)

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
