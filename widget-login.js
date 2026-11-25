const EMAIL = ''
const PASSWORD = ''

if (!EMAIL || !PASSWORD) throw new Error('Fill in EMAIL and PASSWORD first')
Keychain.set('todo-email', EMAIL)
Keychain.set('todo-password', PASSWORD)
QuickLook.present('Login saved. Now delete this script.')
