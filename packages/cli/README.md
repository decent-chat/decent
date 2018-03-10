# @decent/cli
CLI for running a [Decent](https://github.com/decent-chat/decent) server alongside the standard web client, [@decent/client](https://github.com/decent-chat/decent/tree/master/packages/client). This is **not** a CLI client for Decent.

If you want to access the server instance itself, check out [@decent/server](https://github.com/decent-chat/decent/tree/master/packages/server).

### install
```sh
> npm install --global @decent/cli
```

### usage
```sh
> decent [port] [database-directory]

# ex:
> cd /opt/decent-server
> decent 80 .
```
Default port is 3000. Omit the database directory to use a volatile in-memory store - note that this will disable image uploads.

Note: don't share databases between two running Decent servers at once; something will probably go wrong.

### license
The Decent project is licensed under the [Mozilla Public License (2.0)](../../LICENSE.txt).

