# @decent/client
Standard web client for [Decent](https://github.com/decent-chat/decent).

**You probably don't want to install this package directly!** If you're looking to host a [Decent](https://github.com/decent-chat/decent) chat server, you'll want [@decent/cli](https://github.com/decent-chat/decent/tree/master/packages/cli), which acts as an interface to both this package and [@decent/server](https://github.com/decent-chat/decent/tree/master/packages/server) itself.

This package exports its `__dirname`. You can then use that to host `index.html`, `dist/`, `img/`, etc.

If, however, you just want to self-host a client to access Decent servers with, see below.

### install
```sh
> npm install @decent/client
```

### run
Serve `index.html`, `dist` and `img` over HTTP:
```sh
> cd node_modules/@decent/client
> python3 -m http.server
```

### license
GPL-3.0
