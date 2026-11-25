import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://gbtmveejoekuecxkhqcn.supabase.co'
const SUPABASE_KEY = 'sb_publishable_6H5GaGFAmqScsrIF1fpO6A_4ldiP-T9'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const $ = id => document.getElementById(id)
let items = JSON.parse(localStorage.getItem('items') || '[]')
let noteId = null

function show(signedIn) {
  $('login').hidden = signedIn
  $('app').hidden = !signedIn
}

function render() {
  const todos = items.filter(i => i.kind === 'todo')
  if (!document.activeElement.isContentEditable) {
    $('list').innerHTML = ''
    todos.forEach((t, i) => {
      const li = document.createElement('li')
      li.className = t.done ? 'done' : ''
      li.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''}><span></span>
        <button class="up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="down" ${i === todos.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="remove">✕</button>`
      const span = li.querySelector('span')
      span.textContent = t.text
      span.onclick = () => edit(span, t)
      li.querySelector('input').onchange = e => update(t.id, { done: e.target.checked })
      li.querySelector('.up').onclick = () => swap(t, todos[i - 1])
      li.querySelector('.down').onclick = () => swap(t, todos[i + 1])
      li.querySelector('.remove').onclick = () => remove(t.id)
      $('list').append(li)
    })
  }
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

async function add(text) {
  await db.from('items').insert({ kind: 'todo', text })
  load()
}

async function update(id, changes) {
  await db.from('items').update(changes).eq('id', id)
  load()
}

function edit(span, todo) {
  span.contentEditable = true
  span.focus()
  span.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur() }
  }
  span.onblur = () => {
    span.contentEditable = false
    const text = span.textContent.trim()
    if (text && text !== todo.text) update(todo.id, { text })
    else render()
  }
}

async function swap(a, b) {
  await Promise.all([
    db.from('items').update({ position: b.position }).eq('id', a.id),
    db.from('items').update({ position: a.position }).eq('id', b.id),
  ])
  load()
}

async function remove(id) {
  await db.from('items').delete().eq('id', id)
  load()
}

async function saveNote(text) {
  if (noteId) await db.from('items').update({ text }).eq('id', noteId)
  else await db.from('items').insert({ kind: 'note', text })
  load()
}

function start() {
  show(true)
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
  add($('new').value.trim())
  $('new').value = ''
}

let timer
$('note').oninput = e => {
  clearTimeout(timer)
  timer = setTimeout(() => saveNote(e.target.value), 600)
}

$('tab-todos').onclick = () => tab('todos')
$('tab-notes').onclick = () => tab('notes')
function tab(name) {
  $('todos').hidden = name !== 'todos'
  $('notes').hidden = name !== 'notes'
  $('tab-todos').classList.toggle('active', name === 'todos')
  $('tab-notes').classList.toggle('active', name === 'notes')
}

$('logout').onclick = async () => {
  await db.auth.signOut()
  localStorage.removeItem('items')
  location.reload()
}

const { data } = await db.auth.getSession()
data.session ? start() : show(false)

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js')
