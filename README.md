# Decent

<h4>
  <a href='#join-a-server'> Join a server </a>
  <span> | </span>
  <a href='#installation'> Host a server </a>
  <span> | </span>
  <a href='https://decent-chat.github.io/decent/api.html'> Documentation </a>
</h4>

Decent is the decentralized chat that's absolutely okay.

* **Decentralized**: anyone can host a Decent server, and clients can connect to many at once, regardless of origin
* **Feature-rich**: ∞ animated emoticons, for example
* **Won't harvest your data**: unlike [some](https://discordapp.com/)
* **Hipster**: more on that [here](https://decent-chat.github.io/decent/why.html)
* **Open source**: 🎈

---

## Join a server

List of known Decent servers:
* [meta.decent.chat](https://meta.decent.chat) - official server for discussing the development of Decent itself
* **[Host your own!](#installation)**

Most Decent servers will serve a copy of the [web client](https://github.com/decent-chat/decent/tree/master/packages/client), so you can use that to access servers (any client can connect to any Decent server, regardless of origin). Alternatively, custom clients exist:

* [Weechat](https://github.com/TheInitializer/weecent/)

If you're someone who wants to **run your own Decent server**, read the following:

## Installation

You will need:

* A recent version of Node.js - [n](https://npm.im/n) helps here
* A recent version of [your favourite web browser](https://www.mozilla.org/en-US/firefox/new/)

> **Important**: Decent is not currently published to npm. You need to [install from source](#from-source).

```sh
> npm install -g @decent/cli

> mkdir my-decent-database
> decent 8000 /path/to/database/directory

# visit http://localhost:8000
```

You'll probably need to make a channel, but to do that, you'll need to make an admin user. Start by registering a user through your web browser (just click on the register button); once you've done that, type `make-admin (the username you picked)` into the CLI:

```sh
decent> make-admin avjoe
Made avjoe an admin.
```

Then you can create a channel by logging in on the browser (you know, click the "login" button) and clicking on the "New" button next to the (empty) channel list.

### Important config options
If you're planning to serve over HTTPS, execute:
```sh
decent> set https on
```

If you're want to make your server private/invite-only, execute:
```sh
decent> set requireAuthorization on
```

### From source
```sh
> git clone https://github.com/decent-chat/decent
> cd decent

> npx lerna bootstrap
> npx lerna run build

> cd packages/cli
> npm install --global

> decent 8000 /path/to/database/directory
```

## Contributing
> **Important**: You'll need to [install from git](#from-source) rather than npm to contribute!

See [CONTRIBUTING](CONTRIBUTING.md) for codestyle guidelines so we don't have to ask you to fix your PRs. Thanks!

This repository is a [lerna monorepo](https://github.com/lerna/lerna), consisting of:
* [@decent/server](https://github.com/decent-chat/decent/tree/master/packages/server) - implementation of the Decent server API
* [decent.js](https://github.com/decent-chat/decent/tree/master/packages/decent.js) - library for interacting with Decent servers
* [@decent/client](https://github.com/decent-chat/decent/tree/master/packages/client) - web-based client for Decent servers
* [@decent/cli](https://github.com/decent-chat/decent/tree/master/packages/cli) - CLI interface for the above

Come visit us at [meta.decent.chat](https://meta.decent.chat)!

## License
GPL-3.0
