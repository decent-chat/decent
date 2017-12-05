// This file is intended to be used as a ServiceWorker. They're
// essentially programmable proxies that we can use to cache
// stuff for use when the client goes offline for whatever reason.

const cacheName = 'v1'

this.addEventListener('install', async evt => {
  console.log('ServiceWorker installed!')

  // Cache all the things!
  evt.waitUntil(caches.open(cacheName).then(cache => cache.addAll([
    '/',
    '/index.html',
    '/styles.css',
    '/script-nomodule.js',
    '/img/caret-down.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.9.0-alpha2/katex.min.js',
    '/js/lib/mousetrap.min.js',
    '/js/Actor.js',
    '/js/ChannelsActor.js',
    '/js/MessagesActor.js',
    '/js/ModalsActor.js',
    '/js/SessionActor.js',
    '/js/Socket.js',
    '/js/api.js',
    '/js/index.js',
  ])))
})

this.addEventListener('fetch', evt => {
  function fallback() {
    return fetch(evt.request).then(res => {
      // fetch() fallback! Let's cache the
      // request, provided it isn't an api call
      // or a request to this file.

      const noCacheRe = /^https?:\/\/[^/]+\/(api\/|sw\.js)/
      if (!noCacheRe.test(evt.request.url)) {
        // Cache the result.
        caches.open(cacheName).then(cache => {
          cache.put(evt.request, res.clone())
        })
      }

      return res
    })
  }

  if (navigator.onLine) {
    // If we're online, don't use the cache.
    // XXX: discuss this
    evt.respondWith(fallback())

    return
  }

  evt.respondWith(
    caches.match(evt.request)
      .then(res => res || fallback())
  )
})

this.addEventListener('activate', evt => {
  console.log('ServiceWorker is using cache:', cacheName)

  // Prune old caches.
  evt.waitUntil(caches.keys().then(async cacheNames => {
    for (const key of cacheNames) {
      // If it's not the cache we're currently using...
      if (key !== cacheName) {
        // Delete!!
        await caches.delete(key)
      }
    }
  }))
})

// This event will be triggered by *the server*!
// ServiceWorkers are literally magic.
this.addEventListener('push', evt => {
  if (this.Notification.permission !== 'granted') {
    return
  }

  const data = evt.data.json()
  return this.registration.showNotification(data.title, data)
})
