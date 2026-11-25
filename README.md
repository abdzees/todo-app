# Todo

A minimal todo and notes app that syncs between a laptop and an iPhone. It runs as a web app, installs to the home screen, and stores everything in Supabase.

<p>
  <img src="screenshots/login.png" width="240" alt="Sign in">
  <img src="screenshots/todos.png" width="240" alt="Todos">
  <img src="screenshots/notes.png" width="240" alt="Notes">
</p>

## Features

- Todos grouped by day, with Today always on top
- Drag the handle to reorder or move a task to another day
- Swipe a task left to delete it
- One synced note
- Swipe between the Todos and Notes tabs
- Live sync across devices
- Open tasks for today show on the app icon badge
- Sign in and sign up with email and password

## Setup

1. Create a Supabase project.
2. Run `setup.sql` in the SQL Editor.
3. Put your project URL and publishable key at the top of `app.js`.
4. Turn on GitHub Pages for this repo.
5. Open the site on your phone and use Add to Home Screen.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `style.css` | Styling |
| `app.js` | All app logic |
| `sw.js` | Service worker for offline use |
| `manifest.json` | Home screen app settings |
| `setup.sql` | Database table and security rules |

## Security

Every row belongs to one user and row level security means each account only sees its own data. The key in `app.js` is public by design.
