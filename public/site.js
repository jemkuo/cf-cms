(function () {
  var root = document.documentElement
  var toggle = document.querySelector('[data-theme-toggle]')
  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch (e) {}
    if (toggle) toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false')
  }
  apply(current())
  if (toggle) {
    toggle.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark')
    })
  }
  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value)
    var area = document.createElement('textarea')
    area.value = value
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
    return Promise.resolve()
  }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var value = btn.getAttribute('data-copy') || location.href
      var previous = btn.textContent
      copyText(value).then(function () {
        btn.textContent = btn.getAttribute('data-copied') || previous
        setTimeout(function () { btn.textContent = previous }, 1600)
      })
    })
  })
  document.querySelectorAll('[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var message = form.getAttribute('data-confirm') || ''
      if (message && !confirm(message)) event.preventDefault()
    })
  })
  var upload = document.querySelector('[data-upload]')
  if (upload) {
    upload.addEventListener('submit', function (event) {
      event.preventDefault()
      fetch(upload.action, {
        method: 'POST',
        body: new FormData(upload),
        headers: { accept: 'application/json' }
      }).then(function (res) {
        if (!res.ok) throw new Error('upload')
        return res.json()
      }).then(function (data) {
        var box = upload.querySelector('[data-upload-result]')
        if (box) {
          box.hidden = false
          box.textContent = data.markdown || data.url || ''
        }
        var area = document.querySelector('[data-source-body]')
        if (area && data.markdown) area.value = area.value.replace(/\s*$/, '\n\n' + data.markdown + '\n')
        upload.reset()
      }).catch(function () {
        upload.submit()
      })
    })
  }
})()
