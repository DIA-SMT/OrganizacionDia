// Bloqueo del scroll de la pagina mientras hay un dialogo abierto. Con contador: si se abren
// dos (la ficha de un Migue y su formulario) y se cierran en cualquier orden, la pagina vuelve
// a como estaba solo cuando se cierra el ultimo.
let locks = 0
let saved: { body: string; html: string } | null = null

export function lockPageScroll(): () => void {
  if (locks === 0) {
    saved = { body: document.body.style.overflow, html: document.documentElement.style.overflow }
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  locks += 1
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0 && saved) {
      document.body.style.overflow = saved.body
      document.documentElement.style.overflow = saved.html
      saved = null
    }
  }
}
