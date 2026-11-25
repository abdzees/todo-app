import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm'

const SUPABASE_URL = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const $ = id => document.getElementById(id)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TABS = ['todos', 'notes']
const icon = (path, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
const BIN_ICON = icon('<path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5h6.6l.7-8.5M6.7 7v4M9.3 7v4"/>', 24)
const DRAG_ICON = icon('<path d="M3.5 4h9M3.5 8h9M3.5 12h9"/>')

let items = JSON.parse(localStorage.getItem('items') || '[]')
let noteId = null
let dragging = false
let animating = false

const dayFrom = n => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
const today = () => dayFrom(0)

let audio
document.addEventListener('pointerdown', () => {
  audio ||= new (window.AudioContext || window.webkitAudioContext)()
  audio.resume()
})

function swoosh() {
  if (!audio) return
  const length = 0.16
  const start = audio.currentTime
  const buffer = audio.createBuffer(1, Math.round(audio.sampleRate * length), audio.sampleRate)
  let last = 0
  buffer.getChannelData(0).forEach((_, i, data) => (data[i] = last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04))
  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.6
  filter.frequency.setValueAtTime(1200, start)
  filter.frequency.exponentialRampToValueAtTime(300, start + length)
  const gain = audio.createGain()
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
  source.connect(filter).connect(gain).connect(audio.destination)
  source.start(start)
}
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

function row(task) {
  const li = document.createElement('li')
  li.dataset.id = task.id
  li.className = task.done ? 'done' : ''
  li.innerHTML = `<div class="bin">${BIN_ICON}</div><div class="front"><input type="checkbox"><span></span><button class="handle" title="Drag">${DRAG_ICON}</button></div>`
  const checkbox = li.querySelector('input')
  const span = li.querySelector('span')
  span.textContent = task.text
  checkbox.checked = task.done
  checkbox.onchange = () => update(task.id, { done: checkbox.checked })
  span.onclick = () => !li.dataset.swiped && edit(span, task)
  li.querySelector('.handle').onpointerdown = e => drag(e, li)
  li.onpointerdown = e => swipeRow(e, li, task)
  return li
}

function renderList(ul, tasks) {
  ul.innerHTML = ''
  for (const { day, tasks: dayTasks } of groupByDay(tasks, true)) {
    const heading = document.createElement('li')
    heading.className = dayTasks.length ? 'day' : 'day bare'
    heading.dataset.day = day
    heading.textContent = dateLabel(day)
    ul.append(heading)
    for (const task of dayTasks) ul.append(row(task))
  }
}

function badge() {
  if (!('setAppBadge' in navigator)) return
  const day = today()
  const left = items.filter(i => i.kind === 'todo' && !i.removed && !i.done && i.day === day).length
  const set = left ? navigator.setAppBadge(left) : navigator.clearAppBadge()
  set.catch(() => {})
}

function render() {
  if (!dragging && !animating && !document.activeElement.isContentEditable) {
    renderList($('list'), items.filter(i => i.kind === 'todo' && !i.removed))
  }

  const note = items.find(i => i.kind === 'note')
  if (note && document.activeElement !== $('note')) $('note').value = note.text
  noteId = note?.id
  badge()
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

async function animateOut(rows) {
  animating = true
  withEmptyHeadings($('list'), rows).forEach(r => {
    r.style.setProperty('--h', r.offsetHeight + 'px')
    r.classList.add('collapse')
  })
  await new Promise(done => setTimeout(done, 180))
  animating = false
}

async function deleteTask(li, task) {
  await animateOut([li])
  items = items.filter(i => i.id !== task.id)
  save()
  render()
  check((await db.from('items').delete().eq('id', task.id)).error)
}

function swipeRow(e, li, task) {
  if (dragging || animating || e.target.closest('.handle, input') || e.target.isContentEditable) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const front = li.querySelector('.front')
  const width = li.offsetWidth
  const startX = e.clientX
  const startY = e.clientY
  let mode = null
  let dx = 0
  let moves = []

  const stop = () => {
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', end)
    removeEventListener('pointercancel', end)
  }

  const move = ev => {
    const mx = ev.clientX - startX
    const my = ev.clientY - startY
    if (!mode) {
      if (Math.max(Math.abs(mx), Math.abs(my)) < 10) return
      if (Math.abs(my) >= Math.abs(mx) || mx > 0) return stop()
      mode = 'h'
      dragging = true
      li.classList.add('swiping')
      getSelection().removeAllRanges()
    }
    dx = Math.max(-width, Math.min(0, mx))
    moves = [...moves.filter(m => ev.timeStamp - m.time < 100), { time: ev.timeStamp, dx }]
    front.style.transform = `translateX(${dx}px)`
    li.style.setProperty('--s', Math.min(1, -dx / 56))
    li.classList.toggle('armed', -dx > width * 0.5)
  }

  const end = async ev => {
    stop()
    if (mode !== 'h') return
    li.dataset.swiped = '1'
    setTimeout(() => delete li.dataset.swiped, 100)
    const reach = (-dx - velocity(moves, performance.now()) * 0.3) / width
    const wait = ms => new Promise(done => setTimeout(done, ms))
    if (ev.type === 'pointerup' && reach > 0.5) {
      swoosh()
      front.style.transition = 'transform 0.18s ease-out'
      front.style.transform = `translateX(${-width}px)`
      await wait(180)
      dragging = false
      await deleteTask(li, task)
    } else {
      front.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.3, 0.64, 1)'
      front.style.transform = ''
      li.classList.remove('armed')
      li.style.setProperty('--s', 0)
      await wait(300)
      li.classList.remove('swiping')
      front.removeAttribute('style')
      dragging = false
      render()
    }
  }

  addEventListener('pointermove', move)
  addEventListener('pointerup', end)
  addEventListener('pointercancel', end)
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
  if (e.pointerType === 'mouse') return beginDrag(e, li, handle)
  const { clientX: x, clientY: y } = e
  let latest = e
  const cancel = () => {
    clearTimeout(timer)
    handle.removeEventListener('pointermove', check)
    handle.removeEventListener('pointerup', cancel)
    handle.removeEventListener('pointercancel', cancel)
  }
  const check = ev => {
    latest = ev
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > 8) cancel()
  }
  const timer = setTimeout(() => {
    cancel()
    beginDrag(latest, li, handle)
  }, 200)
  handle.addEventListener('pointermove', check)
  handle.addEventListener('pointerup', cancel)
  handle.addEventListener('pointercancel', cancel)
}

function beginDrag(e, li, handle) {
  const rows = [...$('list').children]
  const from = rows.indexOf(li)
  const height = li.offsetHeight
  const middles = rows.map(r => r.getBoundingClientRect().top + r.offsetHeight / 2)
  const tops = rows.map((r, i) => middles[i] - r.offsetHeight / 2)
  const startY = e.clientY
  const startScroll = window.scrollY
  let y = startY
  let to = from
  let active = true
  dragging = true
  li.classList.add('dragging')
  handle.setPointerCapture(e.pointerId)
  const block = ev => ev.preventDefault()
  addEventListener('touchmove', block, { passive: false })

  const move = () => {
    const reach = dy => Math.min(Math.max(dy, middles[1] - middles[from]), middles.at(-1) - middles[from] + 1)
    const dy = reach(y - startY + window.scrollY - startScroll)
    li.style.transform = `translateY(${dy}px) scale(1.02)`
    const top = tops[from] + dy
    const bottom = top + height
    const down = rows.filter((r, i) => i > from && bottom > tops[i] + r.offsetHeight * 0.65).length
    const up = rows.filter((r, i) => i < from && top < tops[i] + r.offsetHeight * 0.35).length
    to = from + down - up
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
    removeEventListener('touchmove', block)
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

let signingUp = false

function mode(up) {
  signingUp = up
  $('confirm-password').hidden = !up
  $('confirm-password').required = up
  $('signin').textContent = up ? 'Sign in instead' : 'Sign in'
  $('signin').classList.toggle('primary', !up)
  $('signup').classList.toggle('primary', up)
  $('error').textContent = ''
}

$('signin').onclick = () => (signingUp ? mode(false) : $('login').requestSubmit())
$('signup').onclick = () => (signingUp ? $('login').requestSubmit() : mode(true))

$('login').onsubmit = async e => {
  e.preventDefault()
  const credentials = { email: $('email').value, password: $('password').value }
  if (!signingUp) {
    const { error } = await db.auth.signInWithPassword(credentials)
    if (error) $('error').textContent = error.message
    else start()
    return
  }
  if ($('password').value !== $('confirm-password').value) {
    $('error').textContent = 'Passwords do not match'
    return
  }
  const { data, error } = await db.auth.signUp(credentials)
  if (error) $('error').textContent = error.message
  else if (data.session) start()
  else {
    mode(false)
    $('error').textContent = 'Check your email to confirm, then sign in'
  }
}

$('add').onsubmit = e => {
  e.preventDefault()
  add($('new').value.trim(), $('date').value)
  $('new').value = ''
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

document.addEventListener('click', () => {
  if (navigator.standalone && Notification.permission === 'default') Notification.requestPermission()
}, { once: true })

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
const swipeX = new Map()
const slideTo = (el, x) => {
  swipeX.set(el, x)
  el.style.transform = `translateX(${x}px)`
}

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
  const blocked = dragging || settling || e.touches.length > 1 || e.target.closest('.handle, #list li:not(.day)')
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
  const bounce = 14
  const settle = (el, to, extra) => {
    const at = x => ({ transform: `translateX(${x}px)` })
    const frames = [{ ...at(swipeX.get(el)), easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }]
    if (extra) frames.push({ ...at(to + extra), offset: 0.6, easing: 'ease-in-out' })
    frames.push(at(to))
    return el.animate(frames, { duration: 380, fill: 'forwards' }).finished
  }
  const jobs = [settle(from, go ? -side * width : 0, go ? 0 : side * bounce)]
  if (neighbor) jobs.push(settle(neighbor, go ? 0 : side * width, go ? -side * bounce : 0))
  await Promise.all(jobs)
  from.getAnimations().forEach(a => a.cancel())
  neighbor?.getAnimations().forEach(a => a.cancel())
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

$('logout').onclick = () => $('confirm').showModal()
$('cancel').onclick = () => $('confirm').close()

$('confirm-out').onclick = async () => {
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
